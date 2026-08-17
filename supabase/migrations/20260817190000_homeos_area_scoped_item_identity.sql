-- Let reusable HomeOS archetypes exist in separate rooms while keeping each
-- active placement idempotent. Also serialize starter provisioning so an area
-- trigger and the initiating client cannot create the same card twice.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.homeos_starter_card_templates') is null
       or to_regprocedure('public.homeos_starter_identity(text)') is null
       or to_regprocedure('public.create_provider_homeos_item_unscoped_internal(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)') is null then
        raise exception 'Area-scoped HomeOS identity requires the HomeOS item, starter deck, and provider publisher foundations.';
    end if;
end;
$$;

create or replace function public.homeos_item_placement_identity(
    p_system text,
    p_category text,
    p_name text,
    p_location text,
    p_parent_area text
)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select case
        when public.homeos_starter_identity(p_category) = 'area' then concat_ws('|',
            public.homeos_starter_identity(p_system),
            'area',
            public.homeos_starter_identity(p_name),
            '',
            public.homeos_starter_identity(p_parent_area)
        )
        else concat_ws('|',
            public.homeos_starter_identity(p_system),
            public.homeos_starter_identity(p_category),
            public.homeos_starter_identity(p_name),
            public.homeos_starter_identity(p_location),
            public.homeos_starter_identity(p_parent_area)
        )
    end;
$$;

do $$
begin
    if exists (
        select 1
        from public.home_items item
        where coalesce(item.archived, false) = false
        group by
            item.property_id,
            public.homeos_item_placement_identity(
                item.system,
                item.category,
                item.name,
                item.location,
                item.parent_area
            )
        having count(*) > 1
    ) then
        raise exception 'Cannot install placement-scoped HomeOS identity because active same-placement duplicates already exist. No records were changed.';
    end if;
end;
$$;

drop index if exists public.home_items_property_id_item_slug_key;

create unique index home_items_property_placement_identity_key
    on public.home_items (
        property_id,
        public.homeos_item_placement_identity(system, category, name, location, parent_area)
    )
    where coalesce(archived, false) = false;

create unique index home_items_property_placement_slug_key
    on public.home_items (
        property_id,
        lower(item_slug),
        public.homeos_starter_identity(location),
        public.homeos_starter_identity(parent_area)
    )
    where item_slug is not null
      and coalesce(archived, false) = false;

-- Item routes continue to use placement-qualified slugs. This non-unique
-- lookup index preserves those reads while the database identity is scoped to
-- the selected room/container.
create index if not exists home_items_property_item_slug_lookup_idx
    on public.home_items(property_id, item_slug)
    where item_slug is not null;

create or replace function public.provision_complete_room_starter_cards(p_area_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_area public.home_items%rowtype;
    v_template public.homeos_starter_card_templates%rowtype;
    v_parent_name text;
    v_slug text;
    v_base_slug text;
    v_suffix integer;
    v_created integer := 0;
    v_inserted integer := 0;
    v_existing_id uuid;
begin
    select area.* into v_area
    from public.home_items area
    where area.id = p_area_id
      and lower(btrim(area.category)) = 'area'
      and coalesce(area.archived, false) = false
      and nullif(btrim(coalesce(area.parent_area, '')), '') is null
    for update;

    if not found or public.homeos_complete_room_kind(v_area.name) is null then return 0; end if;

    for v_template in
        select template.*
        from public.homeos_starter_card_templates template
        where template.active
          and template.room_kind = public.homeos_complete_room_kind(v_area.name)
        order by template.display_order, template.name
    loop
        v_parent_name := null;
        if v_template.parent_template_key is not null then
            select parent.name into v_parent_name
            from public.home_items parent
            join public.homeos_starter_card_templates parent_template
              on parent_template.template_key = v_template.parent_template_key
            where parent.property_id = v_area.property_id
              and coalesce(parent.archived, false) = false
              and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_area.name)
              and nullif(btrim(coalesce(parent.parent_area, '')), '') is null
              and public.homeos_starter_identity(parent.name) in (
                  select public.homeos_starter_identity(value)
                  from jsonb_array_elements_text(parent_template.aliases || jsonb_build_array(parent_template.name)) value
              )
            order by parent.created_at, parent.id
            limit 1;
        end if;

        perform pg_advisory_xact_lock(hashtextextended(
            v_area.property_id::text || '|' || public.homeos_item_placement_identity(
                v_template.system,
                v_template.category,
                v_template.name,
                case when v_template.parent_template_key is null then v_area.name else v_parent_name end,
                case when v_template.parent_template_key is null then '' else v_area.name end
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
                      v_template.parent_template_key is null
                      and public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_area.name)
                      and nullif(btrim(coalesce(item.parent_area, '')), '') is null
                  )
                  or (
                      v_template.parent_template_key is not null
                      and (
                          (
                              public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_area.name)
                              and nullif(btrim(coalesce(item.parent_area, '')), '') is null
                          )
                          or public.homeos_starter_identity(item.parent_area) = public.homeos_starter_identity(v_area.name)
                      )
                  )
              )
            order by item.created_at, item.id
            limit 1;

        if v_existing_id is not null then
            update public.home_items item
            set starter_template_key = v_template.template_key
            where item.id = v_existing_id
              and item.starter_template_key is null;
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
            starter_template_key
        ) values (
            v_area.user_id,
            v_area.property_id,
            v_slug,
            v_template.name,
            v_template.system,
            v_template.category,
            case when v_template.parent_template_key is null then v_area.name else v_parent_name end,
            case when v_template.parent_template_key is null then '' else v_area.name end,
            'Missing Information',
            'Installed',
            false,
            v_template.template_key
        )
        on conflict do nothing;

        get diagnostics v_inserted = row_count;
        v_created := v_created + v_inserted;
    end loop;

    return v_created;
end;
$$;

-- Provider writes share the same placement lock. A second request waits, then
-- the existing internal natural-identity lookup returns the first row.
create or replace function public.create_provider_homeos_item(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_item_slug text default null,
    p_name text default null,
    p_system text default null,
    p_category text default null,
    p_location text default null,
    p_parent_area text default null,
    p_status text default 'Missing Information',
    p_install_state text default 'Unknown',
    p_about text default null,
    p_brand text default null,
    p_model text default null,
    p_serial text default null
)
returns table (
    id uuid, item_slug text, name text, system text, category text, parent_area text,
    status text, location text, about text, brand text, model text, serial text,
    install_date text, created_at timestamptz, install_state text, photo_url text,
    archived boolean, property_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_trade_key text := public.homeos_trade_key_for_system(p_system);
begin
    if v_trade_key is not null and not public.homeos_company_trade_enabled(p_company_id, v_trade_key) then
        raise exception 'This company does not have % enabled for new HomeOS cards.', initcap(v_trade_key) using errcode = '42501';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
        p_property_id::text || '|' || public.homeos_item_placement_identity(
            p_system,
            p_category,
            p_name,
            p_location,
            p_parent_area
        ),
        0
    ));

    return query
    select created.*
    from public.create_provider_homeos_item_unscoped_internal(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id,
        p_item_slug, p_name, p_system, p_category, p_location, p_parent_area,
        p_status, p_install_state, p_about, p_brand, p_model, p_serial
    ) created;
end;
$$;

revoke all on function public.homeos_item_placement_identity(text,text,text,text,text) from public, anon;
revoke all on function public.provision_complete_room_starter_cards(uuid) from public, anon, authenticated;
revoke all on function public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

comment on function public.homeos_item_placement_identity(text,text,text,text,text) is
    'Normalized active HomeOS identity scoped to an explicit area/container placement.';

commit;
