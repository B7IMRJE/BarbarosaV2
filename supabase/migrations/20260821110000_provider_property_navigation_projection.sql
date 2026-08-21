begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regprocedure('public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.company_sales_context_matches_client_home(uuid,uuid,uuid,uuid,uuid)') is null then
        raise exception 'Provider property navigation requires the existing provider HomeOS access foundation.';
    end if;
end;
$$;

create or replace function public.get_provider_homeos_property_items(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_item_slug text default null
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
    property_id uuid,
    starter_template_key text,
    parent_home_item_id uuid,
    placement_label text,
    area_scope text,
    area_placement_state text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.homeos_can_read_provider_assigned_items(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Not authorized to read provider HomeOS items for this assigned job.';
    end if;

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
        null::text as about,
        null::text as brand,
        null::text as model,
        null::text as serial,
        null::text as install_date,
        item.created_at,
        item.install_state,
        null::text as photo_url,
        item.archived,
        item.property_id,
        item.starter_template_key,
        item.parent_home_item_id,
        item.placement_label,
        item.area_scope,
        item.area_placement_state
    from public.home_items item
    where item.property_id = p_property_id
      and (p_item_slug is null or item.item_slug = p_item_slug)
      and coalesce(item.archived, false) = false
    order by item.system asc nulls last, item.name asc nulls last, item.id asc;
end;
$$;

create or replace function public.get_sales_company_homeos_property_items(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_item_slug text default null
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
    property_id uuid,
    starter_template_key text,
    parent_home_item_id uuid,
    placement_label text,
    area_scope text,
    area_placement_state text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.company_sales_context_matches_client_home(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Sales HomeOS access requires an active company client home.';
    end if;

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
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        item.created_at,
        item.install_state,
        null::text,
        item.archived,
        item.property_id,
        item.starter_template_key,
        item.parent_home_item_id,
        item.placement_label,
        item.area_scope,
        item.area_placement_state
    from public.home_items item
    where item.property_id = p_property_id
      and (p_item_slug is null or item.item_slug = p_item_slug)
      and coalesce(item.archived, false) = false
    order by item.system asc nulls last, item.name asc nulls last, item.id asc;
end;
$$;

revoke all on function public.get_provider_homeos_property_items(uuid,uuid,uuid,uuid,uuid,text) from public, anon;
revoke all on function public.get_sales_company_homeos_property_items(uuid,uuid,uuid,uuid,uuid,text) from public, anon;
grant execute on function public.get_provider_homeos_property_items(uuid,uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.get_sales_company_homeos_property_items(uuid,uuid,uuid,uuid,uuid,text) to authenticated;

comment on function public.get_provider_homeos_property_items(uuid,uuid,uuid,uuid,uuid,text) is
    'Provider-safe assigned-work HomeOS projection with non-sensitive property-area placement fields.';
comment on function public.get_sales_company_homeos_property_items(uuid,uuid,uuid,uuid,uuid,text) is
    'Sales-safe assigned-client HomeOS projection with non-sensitive property-area placement fields.';

commit;
