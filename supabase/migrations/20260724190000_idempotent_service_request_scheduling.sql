-- Let Dispatch retry the same active service-request appointment after choosing
-- a technician. Other requests assigned to that technician still conflict.

begin;

do $$
begin
    if to_regprocedure(
        'public.schedule_service_request_slot(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,timestamptz,integer,text,text)'
    ) is null then
        raise exception 'schedule_service_request_slot is required before idempotent scheduling can be installed.';
    end if;
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

    select slot.*
    into v_slot
    from public.job_schedule_slots as slot
    where slot.company_id = p_company_id
      and slot.service_request_id = p_service_request_id
      and slot.visit_closed_at is null
      and lower(btrim(coalesce(slot.status, ''))) not in ('cancelled', 'completed', 'archived')
    order by slot.updated_at desc nulls last, slot.start_at desc, slot.id desc
    limit 1
    for update;

    if exists (
        select 1
        from public.job_schedule_slots as slot
        where slot.company_id = p_company_id
          and slot.service_request_id is distinct from p_service_request_id
          and slot.technician_company_user_id = p_technician_company_user_id
          and lower(btrim(coalesce(slot.status, ''))) not in ('cancelled', 'completed', 'archived')
          and tstzrange(slot.start_at, slot.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
    ) then
        raise exception 'Technician already has scheduled work during this time.';
    end if;

    if v_slot.id is not null then
        update public.job_schedule_slots as slot
        set technician_company_user_id = p_technician_company_user_id,
            start_at = p_start_at,
            end_at = p_end_at,
            arrival_window_start = p_arrival_window_start,
            arrival_window_end = p_arrival_window_end,
            status = 'scheduled',
            estimated_duration_minutes = coalesce(p_estimated_duration_minutes, 60),
            priority = lower(btrim(coalesce(p_priority, 'normal'))),
            notes = nullif(btrim(coalesce(p_notes, '')), ''),
            updated_by_user_id = auth.uid(),
            updated_at = now()
        where slot.id = v_slot.id
        returning slot.*
        into v_slot;
    else
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
    end if;

    update public.service_requests as request
    set status = 'scheduled',
        updated_at = now()
    where request.id = v_request.id
      and request.company_id = p_company_id
      and lower(btrim(coalesce(request.status, ''))) in ('new', 'acknowledged', 'scheduled');

    return v_slot;
end;
$$;

revoke all on function public.schedule_service_request_slot(
    uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text, text
) from public, anon;
grant execute on function public.schedule_service_request_slot(
    uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text, text
) to authenticated;

commit;
