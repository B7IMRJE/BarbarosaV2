-- Harden Dispatch RPCs so company actions require both company_id and service_request_id.
-- This prevents authenticated company users from reading or mutating another
-- company's Dispatch request by guessing a service_request_id.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before Dispatch RPC hardening can be installed.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before Dispatch event RPC hardening can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before Dispatch schedule RPC hardening can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before Dispatch schedule RPC hardening can be installed.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before Dispatch RPC hardening can be installed.';
    end if;

    if to_regprocedure('public.can_manage_company_users(uuid)') is null then
        raise exception 'public.can_manage_company_users(uuid) is required before Dispatch schedule RPC hardening can be installed.';
    end if;
end;
$$;

create or replace function public.get_service_request_events(
    p_company_id uuid,
    p_service_request_id uuid
)
returns table (
    id uuid,
    service_request_id uuid,
    company_id uuid,
    property_id uuid,
    event_type text,
    message text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    if not public.can_dispatch_company(p_company_id) then
        raise exception 'Not authorized to view dispatch request events for this company.';
    end if;

    select request.*
    into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id;

    if not found then
        raise exception 'Service request not found for this company.';
    end if;

    return query
    select
        event.id,
        event.service_request_id,
        event.company_id,
        event.property_id,
        event.event_type,
        event.message,
        event.created_at
    from public.service_request_events as event
    where event.service_request_id = p_service_request_id
      and event.company_id = p_company_id
    order by event.created_at desc nulls last, event.id desc;
end;
$$;

create or replace function public.acknowledge_service_request(
    p_company_id uuid,
    p_service_request_id uuid
)
returns public.service_requests
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    if not public.can_dispatch_company(p_company_id) then
        raise exception 'Not authorized to acknowledge dispatch requests for this company.';
    end if;

    select request.*
    into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    for update;

    if not found then
        raise exception 'Service request not found for this company.';
    end if;

    if lower(btrim(coalesce(v_request.status, ''))) = 'converted_to_job' then
        raise exception 'Converted service requests cannot be acknowledged.';
    end if;

    update public.service_requests as request
    set status = 'acknowledged',
        acknowledged_by_user_id = auth.uid(),
        acknowledged_at = coalesce(request.acknowledged_at, now()),
        updated_at = now()
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    returning request.*
    into v_request;

    return v_request;
end;
$$;

create or replace function public.cancel_service_request(
    p_company_id uuid,
    p_service_request_id uuid,
    p_reason text default null
)
returns public.service_requests
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    if not public.can_dispatch_company(p_company_id) then
        raise exception 'Not authorized to cancel dispatch requests for this company.';
    end if;

    select request.*
    into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    for update;

    if not found then
        raise exception 'Service request not found for this company.';
    end if;

    if lower(btrim(coalesce(v_request.status, ''))) in ('converted_to_job', 'archived') then
        raise exception 'Converted or archived service requests cannot be cancelled.';
    end if;

    update public.service_requests as request
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by_user_id = auth.uid(),
        cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        updated_at = now()
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    returning request.*
    into v_request;

    return v_request;
end;
$$;

create or replace function public.archive_service_request(
    p_company_id uuid,
    p_service_request_id uuid,
    p_reason text default null
)
returns public.service_requests
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    if not public.can_dispatch_company(p_company_id) then
        raise exception 'Not authorized to archive dispatch requests for this company.';
    end if;

    select request.*
    into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    for update;

    if not found then
        raise exception 'Service request not found for this company.';
    end if;

    update public.service_requests as request
    set status = 'archived',
        archived_at = now(),
        archived_by_user_id = auth.uid(),
        archive_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        updated_at = now()
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    returning request.*
    into v_request;

    return v_request;
end;
$$;

create or replace function public.schedule_service_request_slot(
    p_company_id uuid,
    p_service_request_id uuid,
    p_technician_company_user_id uuid,
    p_start_at timestamptz,
    p_end_at timestamptz,
    p_arrival_window_start timestamptz default null,
    p_arrival_window_end timestamptz default null,
    p_estimated_duration_minutes integer default 60,
    p_priority text default 'normal',
    p_notes text default null
)
returns public.job_schedule_slots
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_technician public.company_users%rowtype;
    v_slot public.job_schedule_slots%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null or p_technician_company_user_id is null then
        raise exception 'Company, service request, and technician are required.';
    end if;

    if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
        raise exception 'A valid start and end time are required.';
    end if;

    if coalesce(p_estimated_duration_minutes, 60) <= 0 then
        raise exception 'Estimated duration must be greater than zero.';
    end if;

    if not public.can_dispatch_company(p_company_id) and not public.can_manage_company_users(p_company_id) then
        raise exception 'Not authorized to schedule work for this company.';
    end if;

    select request.*
    into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    for update;

    if not found then
        raise exception 'Service request not found for this company.';
    end if;

    select company_user.*
    into v_technician
    from public.company_users as company_user
    where company_user.id = p_technician_company_user_id
      and company_user.company_id = p_company_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
      and lower(btrim(coalesce(company_user.role, ''))) in ('technician', 'tech', 'manager', 'admin', 'owner');

    if not found then
        raise exception 'Active technician not found for this company.';
    end if;

    if exists (
        select 1
        from public.job_schedule_slots as slot
        where slot.company_id = p_company_id
          and slot.technician_company_user_id = p_technician_company_user_id
          and lower(btrim(coalesce(slot.status, ''))) not in ('cancelled', 'completed', 'archived')
          and tstzrange(slot.start_at, slot.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
    ) then
        raise exception 'Technician already has scheduled work during this time.';
    end if;

    insert into public.job_schedule_slots (
        company_id,
        service_request_id,
        technician_company_user_id,
        start_at,
        end_at,
        arrival_window_start,
        arrival_window_end,
        status,
        estimated_duration_minutes,
        priority,
        notes,
        created_by_user_id,
        updated_by_user_id
    )
    values (
        p_company_id,
        p_service_request_id,
        p_technician_company_user_id,
        p_start_at,
        p_end_at,
        p_arrival_window_start,
        p_arrival_window_end,
        'scheduled',
        coalesce(p_estimated_duration_minutes, 60),
        lower(btrim(coalesce(p_priority, 'normal'))),
        nullif(btrim(coalesce(p_notes, '')), ''),
        auth.uid(),
        auth.uid()
    )
    returning *
    into v_slot;

    update public.service_requests as request
    set status = 'scheduled',
        updated_at = now()
    where request.id = v_request.id
      and request.company_id = p_company_id
      and lower(btrim(coalesce(request.status, ''))) in ('new', 'acknowledged');

    return v_slot;
end;
$$;

do $$
begin
    if to_regprocedure('public.get_service_request_events(uuid)') is not null then
        execute 'revoke all on function public.get_service_request_events(uuid) from public, anon, authenticated';
    end if;

    if to_regprocedure('public.acknowledge_service_request(uuid)') is not null then
        execute 'revoke all on function public.acknowledge_service_request(uuid) from public, anon, authenticated';
    end if;

    if to_regprocedure('public.cancel_service_request(uuid,text)') is not null then
        execute 'revoke all on function public.cancel_service_request(uuid,text) from public, anon, authenticated';
    end if;

    if to_regprocedure('public.archive_service_request(uuid,text)') is not null then
        execute 'revoke all on function public.archive_service_request(uuid,text) from public, anon, authenticated';
    end if;
end;
$$;

revoke all on function public.get_service_request_events(uuid, uuid) from public;
revoke all on function public.get_service_request_events(uuid, uuid) from anon;
grant execute on function public.get_service_request_events(uuid, uuid) to authenticated;

revoke all on function public.acknowledge_service_request(uuid, uuid) from public;
revoke all on function public.acknowledge_service_request(uuid, uuid) from anon;
grant execute on function public.acknowledge_service_request(uuid, uuid) to authenticated;

revoke all on function public.cancel_service_request(uuid, uuid, text) from public;
revoke all on function public.cancel_service_request(uuid, uuid, text) from anon;
grant execute on function public.cancel_service_request(uuid, uuid, text) to authenticated;

revoke all on function public.archive_service_request(uuid, uuid, text) from public;
revoke all on function public.archive_service_request(uuid, uuid, text) from anon;
grant execute on function public.archive_service_request(uuid, uuid, text) to authenticated;

revoke all on function public.schedule_service_request_slot(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text, text) from public;
revoke all on function public.schedule_service_request_slot(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text, text) from anon;
grant execute on function public.schedule_service_request_slot(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text, text) to authenticated;

commit;
