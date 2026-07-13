-- Allow assigned providers to read basic HomeOS item identity for the client
-- property attached to their assigned TechOS request, visit, or job.

begin;

do $$
begin
    if to_regclass('public.home_items') is null then
        raise exception 'public.home_items is required before provider HomeOS item reads can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before provider HomeOS item reads can be installed.';
    end if;

    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required before provider HomeOS item reads can be installed.';
    end if;

    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before provider HomeOS item reads can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before provider HomeOS item reads can be installed.';
    end if;

    if to_regclass('public.jobs') is null then
        raise exception 'public.jobs is required before provider HomeOS item reads can be installed.';
    end if;

    if to_regclass('public.job_assignments') is null then
        raise exception 'public.job_assignments is required before provider HomeOS item reads can be installed.';
    end if;

    if to_regprocedure('public.homeos_is_platform_admin()') is null then
        raise exception 'public.homeos_is_platform_admin() is required before provider HomeOS item reads can be installed.';
    end if;
end;
$$;

create or replace function public.homeos_can_read_provider_assigned_items(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_auth_user_id uuid := auth.uid();
    v_company_user_id uuid := null;
    v_is_platform_admin boolean := false;
begin
    if v_auth_user_id is null or p_company_id is null or p_property_id is null then
        return false;
    end if;

    if p_service_request_id is null and p_schedule_slot_id is null and p_job_id is null then
        return false;
    end if;

    select public.homeos_is_platform_admin()
    into v_is_platform_admin;

    select company_user.id
    into v_company_user_id
    from public.company_users as company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = v_auth_user_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc nulls last, company_user.id asc
    limit 1;

    if not coalesce(v_is_platform_admin, false) and v_company_user_id is null then
        return false;
    end if;

    if not exists (
        select 1
        from public.company_property_clients as company_client
        where company_client.company_id = p_company_id
          and company_client.property_id = p_property_id
          and lower(btrim(coalesce(company_client.status, ''))) not in (
              'archived',
              'cancelled',
              'canceled',
              'declined',
              'inactive',
              'revoked'
          )
    ) then
        return false;
    end if;

    if p_schedule_slot_id is not null and exists (
        select 1
        from public.job_schedule_slots as slot
        left join public.service_requests as request
          on request.id = slot.service_request_id
         and request.company_id = slot.company_id
        left join public.jobs as job
          on job.id = slot.job_id
         and job.company_id = slot.company_id
        where slot.id = p_schedule_slot_id
          and slot.company_id = p_company_id
          and (
              coalesce(v_is_platform_admin, false)
              or slot.technician_company_user_id = v_company_user_id
          )
          and (
              p_service_request_id is null
              or slot.service_request_id = p_service_request_id
          )
          and (
              p_job_id is null
              or slot.job_id = p_job_id
          )
          and (
              (request.id is not null and request.property_id = p_property_id)
              or (job.id is not null and job.property_id = p_property_id)
          )
    ) then
        return true;
    end if;

    if p_service_request_id is not null and exists (
        select 1
        from public.service_requests as request
        where request.id = p_service_request_id
          and request.company_id = p_company_id
          and request.property_id = p_property_id
          and (
              coalesce(v_is_platform_admin, false)
              or exists (
                  select 1
                  from public.job_schedule_slots as slot
                  where slot.service_request_id = request.id
                    and slot.company_id = request.company_id
                    and slot.technician_company_user_id = v_company_user_id
              )
          )
    ) then
        return true;
    end if;

    if p_job_id is not null and exists (
        select 1
        from public.jobs as job
        where job.id = p_job_id
          and job.company_id = p_company_id
          and job.property_id = p_property_id
          and (
              coalesce(v_is_platform_admin, false)
              or exists (
                  select 1
                  from public.job_assignments as assignment
                  where assignment.job_id = job.id
                    and assignment.company_id = job.company_id
                    and assignment.technician_auth_user_id = v_auth_user_id
                    and assignment.technician_company_user_id = v_company_user_id
                    and lower(btrim(coalesce(assignment.status, ''))) not in (
                        'removed',
                        'revoked',
                        'cancelled',
                        'canceled'
                    )
              )
              or exists (
                  select 1
                  from public.job_schedule_slots as slot
                  where slot.job_id = job.id
                    and slot.company_id = job.company_id
                    and slot.technician_company_user_id = v_company_user_id
              )
          )
    ) then
        return true;
    end if;

    return false;
end;
$$;

create or replace function public.get_provider_homeos_items(
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
    property_id uuid
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
        item.property_id
    from public.home_items as item
    where item.property_id = p_property_id
      and (p_item_slug is null or item.item_slug = p_item_slug)
      and coalesce(item.archived, false) = false
    order by item.system asc nulls last, item.name asc nulls last, item.id asc;
end;
$$;

revoke all on function public.homeos_can_read_provider_assigned_items(uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function public.homeos_can_read_provider_assigned_items(uuid, uuid, uuid, uuid, uuid) from anon;
revoke all on function public.homeos_can_read_provider_assigned_items(uuid, uuid, uuid, uuid, uuid) from authenticated;
revoke all on function public.get_provider_homeos_items(uuid, uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.get_provider_homeos_items(uuid, uuid, uuid, uuid, uuid, text) from anon;

grant execute on function public.get_provider_homeos_items(uuid, uuid, uuid, uuid, uuid, text) to authenticated;

commit;
