-- Allow an assigned technician to read the message thread for that job.
-- Writes continue to use the existing record_service_request_event RPC so all
-- messages remain in the single, auditable service-request timeline.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before technician job messaging can be installed.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before technician job messaging can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before technician job messaging can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before technician job messaging can be installed.';
    end if;
end;
$$;

create or replace function public.get_technician_service_request_events(
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
    event_visibility text,
    audience text,
    schedule_slot_id uuid,
    dedupe_key text,
    metadata jsonb,
    notification_channels text[],
    notification_status text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    if not exists (
        select 1
        from public.service_requests as request
        join public.job_schedule_slots as slot
          on slot.service_request_id = request.id
         and slot.company_id = request.company_id
        join public.company_users as company_user
          on company_user.id = slot.technician_company_user_id
         and company_user.company_id = slot.company_id
        where request.id = p_service_request_id
          and request.company_id = p_company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
          and lower(btrim(coalesce(company_user.role, ''))) in (
              'technician', 'tech', 'field_tech', 'field-tech', 'field technician'
          )
    ) then
        raise exception 'Not authorized to view job messages for this request.';
    end if;

    return query
    select
        event.id,
        event.service_request_id,
        event.company_id,
        event.property_id,
        event.event_type,
        event.message,
        event.event_visibility,
        event.audience,
        event.schedule_slot_id,
        event.dedupe_key,
        event.metadata,
        event.notification_channels,
        event.notification_status,
        event.created_at
    from public.service_request_events as event
    where event.company_id = p_company_id
      and event.service_request_id = p_service_request_id
    order by event.created_at asc nulls last, event.id asc;
end;
$$;

revoke all on function public.get_technician_service_request_events(uuid, uuid) from public;
revoke all on function public.get_technician_service_request_events(uuid, uuid) from anon;
grant execute on function public.get_technician_service_request_events(uuid, uuid) to authenticated;

commit;
