-- Allow assigned providers to publish narrowly-scoped HomeOS area and item
-- records for the client property attached to their assigned work context.

begin;

do $$
begin
    if to_regclass('public.home_items') is null then
        raise exception 'public.home_items is required before provider HomeOS publishing can be installed.';
    end if;

    if to_regclass('public.property_memberships') is null then
        raise exception 'public.property_memberships is required before provider HomeOS publishing can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_provider_assigned_items(uuid, uuid, uuid, uuid, uuid)') is null then
        raise exception 'public.homeos_can_read_provider_assigned_items(uuid, uuid, uuid, uuid, uuid) is required before provider HomeOS publishing can be installed.';
    end if;
end;
$$;

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
    id uuid,
    item_slug text,
    name text,
    system text,
    category text,
    parent_area text,
    status text,
    location text,
    about text,
    brand text,
    model text,
    serial text,
    install_date text,
    created_at timestamptz,
    install_state text,
    photo_url text,
    archived boolean,
    property_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_name text := btrim(coalesce(p_name, ''));
    v_system text := btrim(coalesce(p_system, ''));
    v_category text := btrim(coalesce(p_category, ''));
    v_location text := btrim(coalesce(p_location, ''));
    v_parent_area text := btrim(coalesce(p_parent_area, ''));
    v_status text := nullif(btrim(coalesce(p_status, '')), '');
    v_install_state text := nullif(btrim(coalesce(p_install_state, '')), '');
    v_about text := nullif(btrim(coalesce(p_about, '')), '');
    v_brand text := nullif(btrim(coalesce(p_brand, '')), '');
    v_model text := nullif(btrim(coalesce(p_model, '')), '');
    v_serial text := nullif(btrim(coalesce(p_serial, '')), '');
    v_record_owner_user_id uuid := null;
    v_existing_id uuid := null;
    v_created_id uuid := null;
    v_slug_base text := '';
    v_slug text := '';
    v_slug_suffix integer := 2;
begin
    if auth.uid() is null then
        raise exception 'Sign in to publish provider HomeOS items.' using errcode = '42501';
    end if;

    if not public.homeos_can_read_provider_assigned_items(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Not authorized to publish provider HomeOS items for this assigned job.' using errcode = '42501';
    end if;

    if v_name = '' or v_system = '' or v_category = '' or v_location = '' then
        raise exception 'Name, system, category, and location are required.';
    end if;

    select membership.user_id
    into v_record_owner_user_id
    from public.property_memberships as membership
    where membership.property_id = p_property_id
      and lower(btrim(coalesce(membership.status, ''))) = 'active'
    order by
        case lower(btrim(coalesce(membership.role, '')))
            when 'owner' then 0
            when 'homeowner' then 1
            when 'primary' then 2
            else 3
        end,
        membership.created_at asc nulls last,
        membership.id asc
    limit 1;

    if v_record_owner_user_id is null then
        raise exception 'Could not find an active homeowner membership for this property.';
    end if;

    if lower(v_category) = 'area' then
        select item.id
        into v_existing_id
        from public.home_items as item
        where item.property_id = p_property_id
          and lower(btrim(coalesce(item.category, ''))) = 'area'
          and lower(btrim(regexp_replace(coalesce(item.system, ''), '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(v_system, '\s+', ' ', 'g')))
          and lower(btrim(regexp_replace(coalesce(item.name, ''), '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(v_name, '\s+', ' ', 'g')))
          and lower(btrim(regexp_replace(coalesce(item.parent_area, ''), '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(v_parent_area, '\s+', ' ', 'g')))
          and coalesce(item.archived, false) = false
        order by item.created_at asc nulls last, item.id asc
        limit 1;
    else
        select item.id
        into v_existing_id
        from public.home_items as item
        where item.property_id = p_property_id
          and lower(btrim(coalesce(item.category, ''))) <> 'area'
          and lower(btrim(regexp_replace(coalesce(item.system, ''), '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(v_system, '\s+', ' ', 'g')))
          and lower(btrim(regexp_replace(coalesce(item.category, ''), '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(v_category, '\s+', ' ', 'g')))
          and lower(btrim(regexp_replace(coalesce(item.location, ''), '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(v_location, '\s+', ' ', 'g')))
          and lower(btrim(regexp_replace(coalesce(item.parent_area, ''), '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(v_parent_area, '\s+', ' ', 'g')))
          and lower(btrim(regexp_replace(coalesce(item.name, ''), '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(v_name, '\s+', ' ', 'g')))
          and coalesce(item.archived, false) = false
        order by item.created_at asc nulls last, item.id asc
        limit 1;
    end if;

    if v_existing_id is not null then
        return query
        select
            item.id,
            item.item_slug,
            item.name,
            item.system,
            item.category,
            item.parent_area,
            item.status,
            item.location,
            item.about,
            item.brand,
            item.model,
            item.serial,
            null::text as install_date,
            item.created_at,
            item.install_state,
            null::text as photo_url,
            item.archived,
            item.property_id
        from public.home_items as item
        where item.id = v_existing_id;

        return;
    end if;

    v_slug_base := case
        when btrim(coalesce(p_item_slug, '')) <> '' then btrim(coalesce(p_item_slug, ''))
        else array_to_string(array_remove(array[v_parent_area, v_location, v_system, v_name], ''), '-')
    end;
    v_slug_base := regexp_replace(lower(v_slug_base), '[^a-z0-9]+', '-', 'g');
    v_slug_base := btrim(v_slug_base, '-');

    if v_slug_base = '' then
        v_slug_base := 'provider-homeos-item';
    end if;

    v_slug := v_slug_base;

    while exists (
        select 1
        from public.home_items as item
        where item.property_id = p_property_id
          and item.item_slug = v_slug
    ) loop
        v_slug := v_slug_base || '-' || v_slug_suffix::text;
        v_slug_suffix := v_slug_suffix + 1;
    end loop;

    insert into public.home_items (
        user_id,
        property_id,
        item_slug,
        name,
        system,
        category,
        location,
        parent_area,
        status,
        install_state,
        about,
        brand,
        model,
        serial,
        archived
    )
    values (
        v_record_owner_user_id,
        p_property_id,
        v_slug,
        v_name,
        v_system,
        v_category,
        v_location,
        nullif(v_parent_area, ''),
        coalesce(v_status, 'Missing Information'),
        coalesce(v_install_state, 'Unknown'),
        v_about,
        coalesce(v_brand, 'Unknown'),
        coalesce(v_model, 'Unknown'),
        coalesce(v_serial, 'Unknown'),
        false
    )
    returning home_items.id into v_created_id;

    return query
    select
        item.id,
        item.item_slug,
        item.name,
        item.system,
        item.category,
        item.parent_area,
        item.status,
        item.location,
        item.about,
        item.brand,
        item.model,
        item.serial,
        null::text as install_date,
        item.created_at,
        item.install_state,
        null::text as photo_url,
        item.archived,
        item.property_id
    from public.home_items as item
    where item.id = v_created_id;
end;
$$;

revoke all on function public.create_provider_homeos_item(
    uuid,
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text
) from public;
revoke all on function public.create_provider_homeos_item(
    uuid,
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text
) from anon;
grant execute on function public.create_provider_homeos_item(
    uuid,
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text
) to authenticated;

commit;
