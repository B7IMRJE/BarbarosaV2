-- Make the current published Starter Pack the additive provisioning source for
-- HomeOS room cards. Existing installed-item facts, media, documents, status,
-- and service history remain property-specific and are never replaced here.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.homeos_starter_card_templates') is null
       or to_regclass('public.homeos_card_sets') is null
       or to_regclass('public.homeos_card_set_revisions') is null
       or to_regclass('public.homeos_card_set_revision_members') is null
       or to_regprocedure('public.provision_complete_room_starter_cards(uuid)') is null
       or to_regprocedure('public.homeos_validate_card_set_revision_for_publication(uuid)') is null then
        raise exception 'Published Starter Pack reconciliation requires the current HomeOS item, template, and versioned Card Set foundations.';
    end if;
end;
$$;

-- Snapshot all pre-existing rows. Reconciliation may attach a durable Deck key
-- and parent UUID, but every other saved customer value must remain identical.
create temporary table homeos_published_pack_existing_items_guard
on commit drop
as
select item.id, to_jsonb(item) as row_json
from public.home_items item;

create or replace function public.homeos_current_starter_pack_template_enabled(
    p_room_kind text,
    p_trade_key text,
    p_template_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_set_key text := lower(btrim(coalesce(p_room_kind, ''))) || '_' || lower(btrim(coalesce(p_trade_key, '')));
    v_revision_id uuid;
begin
    if nullif(btrim(coalesce(p_template_key, '')), '') is null then
        return false;
    end if;

    select card_set.current_published_revision_id
    into v_revision_id
    from public.homeos_card_sets card_set
    join public.homeos_card_set_revisions revision
      on revision.id = card_set.current_published_revision_id
     and revision.card_set_id = card_set.id
     and revision.publication_status = 'published'
    where card_set.status = 'active'
      and lower(btrim(card_set.set_key)) = v_set_key
    limit 1;

    -- Trades/rooms without a published pack retain their established catalog
    -- behavior. Once a pack exists, membership becomes the source of truth.
    if v_revision_id is null then
        return true;
    end if;

    return exists (
        select 1
        from public.homeos_card_set_revision_members member
        where member.revision_id = v_revision_id
          and member.member_behavior = 'instantiate'
          and member.starter_template_key = p_template_key
    );
end;
$$;

create or replace function public.provision_complete_room_starter_cards(p_area_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_area public.home_items%rowtype;
    v_template public.homeos_starter_card_templates%rowtype;
    v_parent_id uuid;
    v_direct_parent_id uuid;
    v_parent_name text;
    v_parent_candidate_count integer := 0;
    v_overlay_root_identity text;
    v_slug text;
    v_base_slug text;
    v_suffix integer;
    v_created integer := 0;
    v_inserted integer := 0;
    v_existing_id uuid;
    v_is_master_bathroom boolean := false;
begin
    select area.* into v_area
    from public.home_items area
    where area.id = p_area_id
      and lower(btrim(area.category)) = 'area'
      and coalesce(area.archived, false) = false
      and nullif(btrim(coalesce(area.parent_area, '')), '') is null
    for update;

    if not found or public.homeos_complete_room_kind(v_area.name) is null then return 0; end if;
    v_is_master_bathroom := public.homeos_is_master_bathroom(v_area.name);

    perform set_config('barbarosa.homeos_parentage_system_write', 'allowed', true);

    for v_template in
        select template.*
        from public.homeos_starter_card_templates template
        where template.active
          and template.auto_provision
          and public.homeos_property_trade_enabled(v_area.property_id, template.trade_key)
          and public.homeos_current_starter_pack_template_enabled(
              template.room_kind,
              template.trade_key,
              template.template_key
          )
          and (
              template.room_kind = public.homeos_complete_room_kind(v_area.name)
              or (
                  v_is_master_bathroom
                  and (
                      template.room_kind = 'master_bathroom'
                      or template.template_key in (
                          'electrical_bathroom:bathroom_exhaust_fan',
                          'electrical_living_room:interior_light_fixture'
                      )
                  )
              )
          )
        order by
            case
                when template.room_kind = 'bathroom' then 0
                when template.room_kind = 'master_bathroom' then 1
                else 2
            end,
            template.display_order,
            template.name
    loop
        v_parent_id := null;
        v_direct_parent_id := null;
        v_parent_name := null;
        v_parent_candidate_count := 0;
        v_overlay_root_identity := public.homeos_overlay_root_identity(
            v_template.template_key,
            v_template.name,
            v_template.room_kind
        );

        if v_overlay_root_identity is not null then
            v_parent_id := public.homeos_resolve_overlay_root_for_placement(
                v_area.property_id,
                v_overlay_root_identity,
                v_area.name,
                nullif(btrim(coalesce(v_area.parent_area, '')), '')
            );

            if v_parent_id is null then
                continue;
            end if;

            select parent.name into v_parent_name
            from public.home_items parent
            where parent.id = v_parent_id;
        elsif v_template.parent_template_key is not null then
            select min(parent.id::text)::uuid, count(*)::integer
            into v_direct_parent_id, v_parent_candidate_count
            from public.home_items parent
            where parent.property_id = v_area.property_id
              and parent.starter_template_key = v_template.parent_template_key
              and lower(btrim(coalesce(parent.category, ''))) <> 'area'
              and coalesce(parent.archived, false) = false
              and (
                  (
                      parent.parent_home_item_id is null
                      and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_area.name)
                      and public.homeos_starter_identity(parent.parent_area) = public.homeos_starter_identity(v_area.parent_area)
                  )
                  or exists (
                      select 1
                      from public.home_items root
                      where root.id = parent.parent_home_item_id
                        and root.property_id = v_area.property_id
                        and root.parent_home_item_id is null
                        and lower(btrim(coalesce(root.category, ''))) <> 'area'
                        and coalesce(root.archived, false) = false
                        and public.homeos_starter_identity(root.location) = public.homeos_starter_identity(v_area.name)
                        and public.homeos_starter_identity(root.parent_area) = public.homeos_starter_identity(v_area.parent_area)
                  )
              );

            if v_parent_candidate_count = 0 then
                select min(parent.id::text)::uuid, count(*)::integer
                into v_direct_parent_id, v_parent_candidate_count
                from public.home_items parent
                join public.homeos_starter_card_templates parent_template
                  on parent_template.template_key = v_template.parent_template_key
                where parent.property_id = v_area.property_id
                  and parent.starter_template_key is null
                  and lower(btrim(coalesce(parent.category, ''))) <> 'area'
                  and coalesce(parent.archived, false) = false
                  and (
                      (
                          parent.parent_home_item_id is null
                          and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_area.name)
                          and public.homeos_starter_identity(parent.parent_area) = public.homeos_starter_identity(v_area.parent_area)
                      )
                      or exists (
                          select 1
                          from public.home_items root
                          where root.id = parent.parent_home_item_id
                            and root.property_id = v_area.property_id
                            and root.parent_home_item_id is null
                            and lower(btrim(coalesce(root.category, ''))) <> 'area'
                            and coalesce(root.archived, false) = false
                            and public.homeos_starter_identity(root.location) = public.homeos_starter_identity(v_area.name)
                            and public.homeos_starter_identity(root.parent_area) = public.homeos_starter_identity(v_area.parent_area)
                      )
                  )
                  and public.homeos_starter_identity(parent.name) in (
                      select public.homeos_starter_identity(value)
                      from jsonb_array_elements_text(parent_template.aliases || jsonb_build_array(parent_template.name)) value
                  );
            end if;

            if v_parent_candidate_count <> 1 or v_direct_parent_id is null then
                continue;
            end if;

            select
                case
                    when parent.parent_home_item_id is null then parent.id
                    else root.id
                end,
                coalesce(root.name, parent.name)
            into v_parent_id, v_parent_name
            from public.home_items parent
            left join public.home_items root
              on root.id = parent.parent_home_item_id
             and root.property_id = parent.property_id
             and root.parent_home_item_id is null
             and lower(btrim(coalesce(root.category, ''))) <> 'area'
             and coalesce(root.archived, false) = false
            where parent.id = v_direct_parent_id;

            if v_parent_id is null then
                continue;
            end if;
        end if;

        perform pg_advisory_xact_lock(hashtextextended(
            v_area.property_id::text || '|' || public.homeos_item_placement_identity(
                v_template.system,
                v_template.category,
                v_template.name,
                case when v_parent_id is null then v_area.name else v_parent_name end,
                case when v_parent_id is null then '' else v_area.name end
            ),
            0
        ));

        v_existing_id := null;
        select item.id into v_existing_id
        from public.home_items item
        where item.property_id = v_area.property_id
          and lower(btrim(item.category)) <> 'area'
          and coalesce(item.archived, false) = false
          and public.homeos_starter_identity(item.name) in (
              select public.homeos_starter_identity(value)
              from jsonb_array_elements_text(v_template.aliases || jsonb_build_array(v_template.name)) value
          )
          and (
              (
                  v_parent_id is null
                  and item.parent_home_item_id is null
                  and public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_area.name)
                  and nullif(btrim(coalesce(item.parent_area, '')), '') is null
              )
              or (
                  v_parent_id is not null
                  and (
                      item.parent_home_item_id = v_parent_id
                      or (
                          item.parent_home_item_id is null
                          and (
                              (
                                  public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_area.name)
                                  and nullif(btrim(coalesce(item.parent_area, '')), '') is null
                              )
                              or public.homeos_starter_identity(item.parent_area) = public.homeos_starter_identity(v_area.name)
                          )
                      )
                  )
              )
          )
        order by
            case when item.parent_home_item_id = v_parent_id and v_parent_id is not null then 0 else 1 end,
            item.created_at,
            item.id
        limit 1;

        if v_existing_id is not null then
            update public.home_items item
            set starter_template_key = coalesce(item.starter_template_key, v_template.template_key),
                parent_home_item_id = case
                    when v_parent_id is null then item.parent_home_item_id
                    else coalesce(item.parent_home_item_id, v_parent_id)
                end
            where item.id = v_existing_id;
            continue;
        end if;

        v_base_slug := regexp_replace(lower(v_area.name || '-' || v_template.name), '[^a-z0-9]+', '-', 'g');
        v_base_slug := trim(both '-' from v_base_slug);
        v_slug := v_base_slug;
        v_suffix := 2;
        while exists (
            select 1 from public.home_items item
            where item.property_id = v_area.property_id and lower(item.item_slug) = lower(v_slug)
        ) loop
            v_slug := v_base_slug || '-' || v_suffix::text;
            v_suffix := v_suffix + 1;
        end loop;

        insert into public.home_items(
            user_id, property_id, item_slug, name, system, category,
            location, parent_area, status, install_state, archived,
            starter_template_key, parent_home_item_id
        ) values (
            v_area.user_id,
            v_area.property_id,
            v_slug,
            v_template.name,
            v_template.system,
            v_template.category,
            case when v_parent_id is null then v_area.name else v_parent_name end,
            case when v_parent_id is null then '' else v_area.name end,
            'Missing Information',
            case
                when v_is_master_bathroom
                  or v_template.template_key in ('bathroom:shower_trim', 'bathroom:tub_shower_trim')
                    then 'Unknown'
                else 'Installed'
            end,
            false,
            v_template.template_key,
            v_parent_id
        )
        on conflict do nothing;

        get diagnostics v_inserted = row_count;
        v_created := v_created + v_inserted;
    end loop;

    return v_created;
end;
$$;

-- Publishing a new pack revision safely reconciles only missing cards into
-- matching existing rooms. Removing a member never deletes a saved item.
create or replace function public.homeos_reconcile_published_card_set()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_area_id uuid;
begin
    if new.status <> 'active'
       or new.current_published_revision_id is null
       or new.current_published_revision_id is not distinct from old.current_published_revision_id then
        return new;
    end if;

    for v_area_id in
        select area.id
        from public.home_items area
        where lower(btrim(coalesce(area.category, ''))) = 'area'
          and coalesce(area.archived, false) = false
          and nullif(btrim(coalesce(area.parent_area, '')), '') is null
          and exists (
              select 1
              from public.homeos_card_set_revision_members member
              join public.homeos_starter_card_templates template
                on template.template_key = member.starter_template_key
              where member.revision_id = new.current_published_revision_id
                and member.member_behavior = 'instantiate'
                and template.room_kind = public.homeos_complete_room_kind(area.name)
          )
        order by area.property_id, area.id
    loop
        perform public.provision_complete_room_starter_cards(v_area_id);
    end loop;

    return new;
end;
$$;

drop trigger if exists homeos_card_sets_reconcile_published_revision on public.homeos_card_sets;
create trigger homeos_card_sets_reconcile_published_revision
after update of current_published_revision_id on public.homeos_card_sets
for each row execute function public.homeos_reconcile_published_card_set();

-- Publish an immutable successor revision containing every active,
-- auto-provisioned Bathroom plumbing card. Existing custom/recommendation
-- members are cloned unchanged; missing canonical children are added.
do $$
declare
    v_set public.homeos_card_sets%rowtype;
    v_old_revision_id uuid;
    v_new_revision_id uuid := gen_random_uuid();
    v_next_revision_number integer;
    v_previous_publish_write text := current_setting('barbarosa.homeos_card_set_publish', true);
begin
    select card_set.*
    into v_set
    from public.homeos_card_sets card_set
    where card_set.set_key = 'bathroom_plumbing'
      and card_set.status = 'active'
    for update;

    if not found or v_set.current_published_revision_id is null then
        raise exception 'Active Bathroom Plumbing Starter Pack was not found.';
    end if;

    if exists (
        select 1
        from public.homeos_card_set_revisions revision
        where revision.card_set_id = v_set.id
          and revision.publication_status = 'draft'
    ) then
        raise exception 'Bathroom Plumbing has an unpublished administrator draft; reconcile it explicitly before this successor can be published.';
    end if;

    v_old_revision_id := v_set.current_published_revision_id;
    select coalesce(max(revision.revision_number), 0) + 1
    into v_next_revision_number
    from public.homeos_card_set_revisions revision
    where revision.card_set_id = v_set.id;

    insert into public.homeos_card_set_revisions(
        id, card_set_id, revision_number, publication_status, created_at, updated_at
    ) values (
        v_new_revision_id, v_set.id, v_next_revision_number, 'draft', now(), now()
    );

    insert into public.homeos_card_set_revision_members(
        revision_id, slot_key, parent_slot_key, display_order, member_behavior,
        area_card_key, starter_template_key, catalog_product_variant_id, created_at
    )
    select
        v_new_revision_id, member.slot_key, member.parent_slot_key,
        member.display_order, member.member_behavior, member.area_card_key,
        member.starter_template_key, member.catalog_product_variant_id, now()
    from public.homeos_card_set_revision_members member
    where member.revision_id = v_old_revision_id;

    insert into public.homeos_card_set_revision_members(
        revision_id, slot_key, parent_slot_key, display_order, member_behavior,
        starter_template_key, created_at
    )
    select
        v_new_revision_id,
        'canonical_' || regexp_replace(split_part(template.template_key, ':', 2), '[^a-z0-9_-]+', '_', 'g'),
        parent.slot_key,
        1000 + (row_number() over (order by template.display_order, template.template_key) * 10)::integer,
        'instantiate',
        template.template_key,
        now()
    from public.homeos_starter_card_templates template
    join public.homeos_card_set_revision_members parent
      on parent.revision_id = v_new_revision_id
     and parent.starter_template_key = template.parent_template_key
    where template.active
      and template.auto_provision
      and template.room_kind = 'bathroom'
      and template.trade_key = 'plumbing'
      and template.presentation_role = 'component'
      and not exists (
          select 1
          from public.homeos_card_set_revision_members existing
          where existing.revision_id = v_new_revision_id
            and existing.starter_template_key = template.template_key
      );

    if exists (
        select 1
        from public.homeos_starter_card_templates template
        where template.active
          and template.auto_provision
          and template.room_kind = 'bathroom'
          and template.trade_key = 'plumbing'
          and not exists (
              select 1
              from public.homeos_card_set_revision_members member
              where member.revision_id = v_new_revision_id
                and member.starter_template_key = template.template_key
          )
    ) then
        raise exception 'Bathroom Starter Pack successor is missing an active auto-provision plumbing template.';
    end if;

    perform public.homeos_validate_card_set_revision_for_publication(v_new_revision_id);
    perform set_config('barbarosa.homeos_card_set_publish', 'allowed', true);

    update public.homeos_card_set_revisions
    set publication_status = 'retired',
        retired_at = now(),
        updated_at = now()
    where id = v_old_revision_id
      and publication_status = 'published';

    update public.homeos_card_set_revisions
    set publication_status = 'published',
        published_at = now(),
        updated_at = now()
    where id = v_new_revision_id
      and publication_status = 'draft';

    update public.homeos_card_sets
    set current_published_revision_id = v_new_revision_id,
        description = 'Published Bathroom plumbing Starter Pack used for additive HomeOS provisioning.',
        updated_at = now()
    where id = v_set.id;

    perform set_config(
        'barbarosa.homeos_card_set_publish',
        coalesce(v_previous_publish_write, ''),
        true
    );
exception when others then
    perform set_config(
        'barbarosa.homeos_card_set_publish',
        coalesce(v_previous_publish_write, ''),
        true
    );
    raise;
end;
$$;

-- The only permitted changes to pre-existing installed rows are their durable
-- canonical Deck key and the exact parent attachment snapshot (UUID,
-- location, and parent area) maintained by the established parentage trigger.
do $$
declare
    v_changed_keys text;
begin
    if exists (
        select 1
        from homeos_published_pack_existing_items_guard guard
        left join public.home_items item on item.id = guard.id
        where item.id is null
           or (
               to_jsonb(item) - 'starter_template_key' - 'parent_home_item_id' - 'location' - 'parent_area' - 'updated_at'
           ) is distinct from (
               guard.row_json - 'starter_template_key' - 'parent_home_item_id' - 'location' - 'parent_area' - 'updated_at'
           )
    ) then
        select string_agg(distinct changed.key, ', ' order by changed.key)
        into v_changed_keys
        from homeos_published_pack_existing_items_guard guard
        join public.home_items item on item.id = guard.id
        cross join lateral jsonb_object_keys(guard.row_json || to_jsonb(item)) changed(key)
        where guard.row_json->changed.key is distinct from to_jsonb(item)->changed.key;

        raise exception 'Published Starter Pack reconciliation changed guarded keys: %', coalesce(v_changed_keys, 'deleted row');
    end if;
end;
$$;

revoke all on function public.homeos_current_starter_pack_template_enabled(text,text,text) from public, anon, authenticated;
revoke all on function public.homeos_reconcile_published_card_set() from public, anon, authenticated;

comment on function public.homeos_current_starter_pack_template_enabled(text,text,text) is
    'Returns published-pack membership when a room/trade pack exists; otherwise preserves the established template behavior.';
comment on function public.provision_complete_room_starter_cards(uuid) is
    'Idempotently and additively provisions active room templates from the current published Starter Pack when one exists.';
comment on function public.homeos_reconcile_published_card_set() is
    'Additively reconciles missing installed cards after a Starter Pack publication; never deletes removed members.';

commit;
