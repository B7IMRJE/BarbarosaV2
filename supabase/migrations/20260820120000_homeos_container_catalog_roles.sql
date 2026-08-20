-- Add durable area-deck presentation metadata and optional Kitchen/Bathroom
-- container archetypes. This migration updates only master template metadata:
-- it never inserts, updates, archives, relocates, or reparents home_items.

begin;

do $$
begin
    if to_regclass('public.homeos_starter_card_templates') is null
       or to_regclass('public.home_items') is null
       or to_regprocedure('public.provision_complete_room_starter_cards(uuid)') is null
       or to_regprocedure('public.get_homeos_starter_card_picker(uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.get_homeos_starter_card_deck()') is null
       or not exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'home_items'
             and column_name = 'parent_home_item_id'
       ) then
        raise exception 'Container catalog roles require the trade-scoped Deck and HomeOS instance parentage.';
    end if;
end;
$$;

create temporary table homeos_container_catalog_home_items_guard
on commit drop
as
select
    count(*)::bigint as row_count,
    md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by item.id), '')) as row_fingerprint
from public.home_items item;

alter table public.homeos_starter_card_templates
    add column if not exists presentation_role text;

alter table public.homeos_starter_card_templates
    add column if not exists auto_provision boolean;

-- Existing behavior remains unchanged by default. Only a narrow, explicit set
-- of established area-level assemblies is promoted to the container Deck.
update public.homeos_starter_card_templates template
set presentation_role = case
        when template.template_key in (
            'bathroom:bathroom_vanity',
            'bathroom:shower_tub',
            'bathroom:toilet',
            'master_bathroom:roman_deck_mount_tub',
            'master_bathroom:freestanding_soaking_tub',
            'master_bathroom:standalone_walk_in_shower',
            'master_bathroom:double_vanity',
            'master_bathroom:bidet',
            'kitchen:kitchen_sink',
            'kitchen:dishwasher',
            'garage:water_heater',
            'garage:washer_box_laundry_connections',
            'garage:whole_home_filter',
            'whole_home:main_water_shutoff',
            'whole_home:smart_water_shutoff'
        ) then 'container'
        else 'component'
    end,
    auto_provision = coalesce(template.auto_provision, true);

alter table public.homeos_starter_card_templates
    alter column presentation_role set default 'component',
    alter column presentation_role set not null,
    alter column auto_provision set default true,
    alter column auto_provision set not null;

alter table public.homeos_starter_card_templates
    drop constraint if exists homeos_starter_card_templates_presentation_role_check;

alter table public.homeos_starter_card_templates
    add constraint homeos_starter_card_templates_presentation_role_check
    check (presentation_role in ('container', 'component'));

create index if not exists homeos_starter_card_templates_presentation_active_idx
    on public.homeos_starter_card_templates(presentation_role, room_kind, display_order)
    where active;

comment on column public.homeos_starter_card_templates.presentation_role is
    'Area-deck presentation role. Container cards are shown at area level; component cards remain available inside an assembly and in Services/Catalog views.';

comment on column public.homeos_starter_card_templates.auto_provision is
    'Whether the complete-room provisioner may create this template automatically. False keeps optional container archetypes in Add Container until selected.';

with optional_container(
    template_key,
    room_kind,
    name,
    system,
    category,
    aliases,
    placement_tags,
    display_order
) as (
    values
        (
            'kitchen:refrigerator',
            'kitchen',
            'Refrigerator',
            'Appliances',
            'Equipment',
            '["Fridge","Kitchen Refrigerator"]'::jsonb,
            '["kitchen"]'::jsonb,
            20
        ),
        (
            'kitchen:stove_range',
            'kitchen',
            'Stove / Range',
            'Appliances',
            'Equipment',
            '["Stove","Range","Kitchen Stove","Kitchen Range"]'::jsonb,
            '["kitchen"]'::jsonb,
            30
        ),
        (
            'kitchen:kitchen_counter',
            'kitchen',
            'Kitchen Counter',
            'Plumbing',
            'Fixture',
            '["Counter","Countertop","Kitchen Countertop","Kitchen Island"]'::jsonb,
            '["kitchen"]'::jsonb,
            50
        ),
        (
            'bathroom:tub',
            'bathroom',
            'Tub',
            'Plumbing',
            'Fixture',
            '["Bathtub","Soaking Tub"]'::jsonb,
            '["bathroom","master_bathroom","tub"]'::jsonb,
            41
        ),
        (
            'bathroom:shower',
            'bathroom',
            'Shower',
            'Plumbing',
            'Fixture',
            '["Standalone Shower","Walk-In Shower","Standing Shower"]'::jsonb,
            '["bathroom","master_bathroom","shower"]'::jsonb,
            42
        )
)
insert into public.homeos_starter_card_templates(
    template_key,
    room_kind,
    name,
    system,
    category,
    parent_template_key,
    aliases,
    placement_tags,
    display_order,
    readiness_status,
    active,
    trade_key,
    presentation_role,
    auto_provision
)
select
    optional_container.template_key,
    optional_container.room_kind,
    optional_container.name,
    optional_container.system,
    optional_container.category,
    null,
    optional_container.aliases,
    optional_container.placement_tags,
    optional_container.display_order,
    'unbuilt',
    true,
    'plumbing',
    'container',
    false
from optional_container
on conflict (template_key) do update
set room_kind = excluded.room_kind,
    name = excluded.name,
    system = excluded.system,
    category = excluded.category,
    parent_template_key = null,
    aliases = excluded.aliases,
    placement_tags = excluded.placement_tags,
    display_order = excluded.display_order,
    active = true,
    trade_key = excluded.trade_key,
    presentation_role = 'container',
    auto_provision = false,
    updated_at = now();

-- Reuse the established Roman / Deck-Mount Tub archetype rather than creating
-- a duplicate Roman Tub card. It remains auto-provisioned only in the existing
-- Master Bathroom path; the Bathroom placement tag merely exposes it in Add Container.
update public.homeos_starter_card_templates template
set placement_tags = coalesce(template.placement_tags, '[]'::jsonb) || '["bathroom"]'::jsonb,
    presentation_role = 'container',
    updated_at = now()
where template.template_key = 'master_bathroom:roman_deck_mount_tub'
  and not (coalesce(template.placement_tags, '[]'::jsonb) ? 'bathroom');

-- Store the intended Deck relationships for future explicit additions. These
-- are template-only changes. Existing installed rows retain their exact saved
-- parent_home_item_id, area, photos, findings, history, documents, and warranties.
update public.homeos_starter_card_templates
set parent_template_key = 'bathroom:bathroom_vanity',
    presentation_role = 'component',
    updated_at = now()
where template_key in (
    'bathroom:bathroom_sink',
    'bathroom:bathroom_sink_faucet'
);

update public.homeos_starter_card_templates
set parent_template_key = 'kitchen:kitchen_sink',
    presentation_role = 'component',
    updated_at = now()
where template_key in (
    'kitchen:kitchen_faucet',
    'kitchen:garbage_disposal'
);

update public.homeos_starter_card_templates
set parent_template_key = 'kitchen:refrigerator',
    presentation_role = 'component',
    updated_at = now()
where template_key in (
    'kitchen:refrigerator_water_line',
    'kitchen:refrigerator_water_filter',
    'kitchen:refrigerator_shutoff_valve'
);

update public.homeos_starter_card_templates
set parent_template_key = 'kitchen:kitchen_counter',
    presentation_role = 'component',
    updated_at = now()
where template_key in (
    'kitchen:instant_hot_water_dispenser',
    'kitchen:reverse_osmosis_system'
);

-- Preserve the current one-level installed-item graph. The provisioner already
-- flattens deeper template relationships to their unique saved root assembly;
-- it now skips optional templates until a person explicitly selects them.
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
                -- Missing or repeated root assemblies are intentionally left
                -- for explicit user selection; never guess an instance.
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

            -- The saved starter chain may already place this immediate parent
            -- beneath an approved overlay root. Keep the durable graph at one
            -- assembly -> component level by linking the new descendant to
            -- that root rather than creating a UUID grandchild.
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

create or replace function public.get_homeos_starter_card_picker(
    p_company_id uuid default null,
    p_property_id uuid default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if auth.uid() is null then
        raise exception 'Sign in to browse HomeOS Deck cards.' using errcode = '42501';
    end if;

    if p_company_id is not null then
        if not public.homeos_company_home_context_can_use(
            p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
        ) then
            raise exception 'This company HomeOS Deck requires an assigned or authorized customer context.' using errcode = '42501';
        end if;
    elsif p_property_id is not null then
        if not public.homeos_can_read_property_record(p_property_id) then
            raise exception 'This HomeOS Deck is not available for that home.' using errcode = '42501';
        end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'template_key', template.template_key,
        'short_code', coalesce(code.short_code, ''),
        'trade_key', template.trade_key,
        'room_kind', template.room_kind,
        'placement_tags', template.placement_tags,
        'name', template.name,
        'system', template.system,
        'category', template.category,
        'parent_template_key', template.parent_template_key,
        'presentation_role', template.presentation_role,
        'auto_provision', template.auto_provision,
        'aliases', template.aliases,
        'display_order', template.display_order
    ) order by template.room_kind, template.display_order, template.name), '[]'::jsonb)
    into v_result
    from public.homeos_starter_card_templates template
    left join public.catalog_card_short_codes code
      on code.entity_kind = 'starter_template'
     and code.entity_key = template.template_key
    where template.active
      and case
          when p_company_id is not null then public.homeos_company_trade_enabled(p_company_id, template.trade_key)
          when p_property_id is not null then public.homeos_property_trade_enabled(p_property_id, template.trade_key)
          else template.trade_key = 'plumbing'
      end;

    return v_result;
end;
$$;

create or replace function public.get_homeos_starter_card_deck()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Catalog Factory is restricted to platform administrators.';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'template_key', template.template_key,
        'short_code', coalesce(code.short_code, ''),
        'trade_key', template.trade_key,
        'room_kind', template.room_kind,
        'name', template.name,
        'system', template.system,
        'category', template.category,
        'parent_template_key', template.parent_template_key,
        'presentation_role', template.presentation_role,
        'auto_provision', template.auto_provision,
        'aliases', template.aliases,
        'placement_tags', template.placement_tags,
        'display_order', template.display_order,
        'readiness_status', template.readiness_status,
        'admin_notes', coalesce(template.admin_notes, ''),
        'mapped_variant_ids', coalesce(mapping.mapped_variant_ids, '[]'::jsonb),
        'mapped_count', coalesce(mapping.mapped_count, 0),
        'approved_option_count', coalesce(mapping.approved_option_count, 0),
        'readiness_issues', to_jsonb(array_remove(array[
            case when coalesce(mapping.mapped_count, 0) = 0 then 'No real catalog product options mapped.' end,
            case when coalesce(mapping.mapped_count, 0) > 0 and coalesce(mapping.approved_option_count, 0) = 0 then 'Mapped options are not approved yet.' end,
            case when template.readiness_status <> 'ready' then 'Starter card is not marked ready.' end
        ], null))
    ) order by template.room_kind, template.display_order, template.name), '[]'::jsonb)
    into v_result
    from public.homeos_starter_card_templates template
    left join public.catalog_card_short_codes code
      on code.entity_kind = 'starter_template'
     and code.entity_key = template.template_key
    left join lateral (
        select
            jsonb_agg(link.product_variant_id::text order by link.created_at, link.product_variant_id) as mapped_variant_ids,
            count(*)::integer as mapped_count,
            count(*) filter (where variant.status = 'approved')::integer as approved_option_count
        from public.homeos_starter_card_catalog_variants link
        join public.catalog_product_variants variant on variant.id = link.product_variant_id
        where link.template_key = template.template_key
    ) mapping on true
    where template.active;

    return v_result;
end;
$$;

revoke all on function public.get_homeos_starter_card_picker(uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.get_homeos_starter_card_deck() from public, anon;

grant execute on function public.get_homeos_starter_card_picker(uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.get_homeos_starter_card_deck() to authenticated;

comment on function public.provision_complete_room_starter_cards(uuid) is
    'Idempotently provisions only auto_provision HomeOS templates and preserves the one-level assembly-to-component installed graph.';

do $$
declare
    v_before_count bigint;
    v_before_fingerprint text;
    v_after_count bigint;
    v_after_fingerprint text;
begin
    select guard.row_count, guard.row_fingerprint
    into v_before_count, v_before_fingerprint
    from homeos_container_catalog_home_items_guard guard;

    select
        count(*)::bigint,
        md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by item.id), ''))
    into v_after_count, v_after_fingerprint
    from public.home_items item;

    if v_after_count is distinct from v_before_count
       or v_after_fingerprint is distinct from v_before_fingerprint then
        raise exception 'Container catalog migration must not change installed HomeOS records.';
    end if;
end;
$$;

commit;
