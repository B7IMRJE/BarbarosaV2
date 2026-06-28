-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Add safe service request cancellation/archive actions and the first
--   Schedule Board foundation for technician time slots.
--
-- Product rules:
--   - Dispatch Board is the operator intake queue.
--   - Schedule Board chooses date/time/technician and prevents overlapping
--     active work for the same technician.
--   - TechOS remains the technician workspace after assignment/scheduling.
--   - No hard delete of active dispatch records.
--   - HomeOS photos, documents, and private timeline history are not exposed.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before cancel/archive/schedule foundation can be installed.';
    end if;

    if to_regclass('public.jobs') is null then
        raise exception 'public.jobs is required before schedule foundation can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before schedule foundation can be installed.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before cancel/archive foundation can be installed.';
    end if;

    if to_regprocedure('public.can_manage_company_users(uuid)') is null then
        raise exception 'public.can_manage_company_users(uuid) is required before schedule foundation can be installed.';
    end if;
end
$$;

alter table public.service_requests
    drop constraint if exists service_requests_status_check;

alter table public.service_requests
    add constraint service_requests_status_check
    check (lower(btrim(status)) in ('new', 'acknowledged', 'scheduled', 'converted_to_job', 'cancelled', 'archived'));

alter table public.service_requests
    add column if not exists cancelled_at timestamptz null,
    add column if not exists cancelled_by_user_id uuid null references auth.users(id) on delete set null,
    add column if not exists cancel_reason text null,
    add column if not exists archived_at timestamptz null,
    add column if not exists archived_by_user_id uuid null references auth.users(id) on delete set null,
    add column if not exists archive_reason text null;

create table if not exists public.job_schedule_slots (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    job_id uuid null references public.jobs(id) on delete cascade,
    service_request_id uuid null references public.service_requests(id) on delete cascade,
    technician_company_user_id uuid not null references public.company_users(id) on delete restrict,
    start_at timestamptz not null,
    end_at timestamptz not null,
    arrival_window_start timestamptz null,
    arrival_window_end timestamptz null,
    status text not null default 'tentative',
    estimated_duration_minutes integer not null default 60,
    priority text not null default 'normal',
    notes text null,
    created_by_user_id uuid null references auth.users(id) on delete set null,
    updated_by_user_id uuid null references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint job_schedule_slots_target_check
        check (job_id is not null or service_request_id is not null),
    constraint job_schedule_slots_time_check
        check (end_at > start_at),
    constraint job_schedule_slots_duration_check
        check (estimated_duration_minutes > 0),
    constraint job_schedule_slots_status_check
        check (lower(btrim(status)) in ('tentative', 'scheduled', 'dispatched', 'arrived', 'completed', 'cancelled')),
    constraint job_schedule_slots_priority_check
        check (lower(btrim(priority)) in ('low', 'normal', 'high', 'emergency'))
);

create index if not exists job_schedule_slots_company_start_idx
on public.job_schedule_slots (company_id, start_at);

create index if not exists job_schedule_slots_technician_time_idx
on public.job_schedule_slots (technician_company_user_id, start_at, end_at);

create index if not exists job_schedule_slots_service_request_id_idx
on public.job_schedule_slots (service_request_id);

create index if not exists job_schedule_slots_job_id_idx
on public.job_schedule_slots (job_id);

alter table public.job_schedule_slots enable row level security;

drop policy if exists job_schedule_slots_dispatch_select on public.job_schedule_slots;
create policy job_schedule_slots_dispatch_select
on public.job_schedule_slots
for select
to authenticated
using (
    public.can_dispatch_company(company_id)
);

create or replace function public.cancel_service_request(
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

    select *
    into v_request
    from public.service_requests
    where id = p_service_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if not public.can_dispatch_company(v_request.company_id) then
        raise exception 'Not authorized to cancel this service request.';
    end if;

    if lower(btrim(coalesce(v_request.status, ''))) in ('converted_to_job', 'archived') then
        raise exception 'Converted or archived service requests cannot be cancelled.';
    end if;

    update public.service_requests
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by_user_id = auth.uid(),
        cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        updated_at = now()
    where id = v_request.id
    returning *
    into v_request;

    return v_request;
end;
$$;

create or replace function public.archive_service_request(
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

    select *
    into v_request
    from public.service_requests
    where id = p_service_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if not public.can_dispatch_company(v_request.company_id) then
        raise exception 'Not authorized to archive this service request.';
    end if;

    update public.service_requests
    set status = 'archived',
        archived_at = now(),
        archived_by_user_id = auth.uid(),
        archive_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        updated_at = now()
    where id = v_request.id
    returning *
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

    if not public.can_dispatch_company(p_company_id) and not public.can_manage_company_users(p_company_id) then
        raise exception 'Not authorized to schedule work for this company.';
    end if;

    select *
    into v_request
    from public.service_requests
    where id = p_service_request_id
      and company_id = p_company_id;

    if not found then
        raise exception 'Service request not found for this company.';
    end if;

    select *
    into v_technician
    from public.company_users
    where id = p_technician_company_user_id
      and company_id = p_company_id
      and lower(btrim(coalesce(status, ''))) = 'active'
      and lower(btrim(coalesce(role, ''))) in ('technician', 'manager', 'admin', 'owner');

    if not found then
        raise exception 'Active technician not found for this company.';
    end if;

    if exists (
        select 1
        from public.job_schedule_slots slot
        where slot.company_id = p_company_id
          and slot.technician_company_user_id = p_technician_company_user_id
          and lower(btrim(coalesce(slot.status, ''))) not in ('cancelled', 'completed')
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

    update public.service_requests
    set status = 'scheduled',
        updated_at = now()
    where id = v_request.id
      and lower(btrim(coalesce(status, ''))) in ('new', 'acknowledged');

    return v_slot;
end;
$$;

revoke all on table public.job_schedule_slots from public;
revoke all on table public.job_schedule_slots from anon;
revoke insert, update, delete on table public.job_schedule_slots from authenticated;
grant select on table public.job_schedule_slots to authenticated;

revoke all on function public.cancel_service_request(uuid, text) from public;
revoke all on function public.cancel_service_request(uuid, text) from anon;
grant execute on function public.cancel_service_request(uuid, text) to authenticated;

revoke all on function public.archive_service_request(uuid, text) from public;
revoke all on function public.archive_service_request(uuid, text) from anon;
grant execute on function public.archive_service_request(uuid, text) to authenticated;

revoke all on function public.schedule_service_request_slot(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text, text) from public;
revoke all on function public.schedule_service_request_slot(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text, text) from anon;
grant execute on function public.schedule_service_request_slot(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text, text) to authenticated;

commit;

-- Verification after review/install:
-- select
--   to_regclass('public.job_schedule_slots') is not null as job_schedule_slots_exists,
--   to_regprocedure('public.cancel_service_request(uuid,text)') is not null as cancel_rpc_exists,
--   to_regprocedure('public.archive_service_request(uuid,text)') is not null as archive_rpc_exists,
--   to_regprocedure('public.schedule_service_request_slot(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,timestamptz,integer,text,text)') is not null as schedule_rpc_exists;
