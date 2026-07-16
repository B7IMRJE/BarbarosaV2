-- Install the homeowner Active Request Tracker read source for databases where
-- the acknowledge/request-code migration was already applied before this RPC
-- existed.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before homeowner active request tracking can be installed.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before homeowner active request tracking can be installed.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before homeowner active request tracking can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before homeowner active request tracking can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before homeowner active request tracking can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null then
        raise exception 'public.homeos_can_read_property_record(uuid) is required before homeowner active request tracking can be installed.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'service_requests'
          and column_name = 'display_code'
    ) then
        raise exception 'public.service_requests.display_code is required before homeowner active request tracking can be installed.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'service_requests'
          and column_name = 'display_sequence'
    ) then
        raise exception 'public.service_requests.display_sequence is required before homeowner active request tracking can be installed.';
    end if;
end;
$$;

do $$
declare
    v_event_type_constraint text;
begin
    select pg_get_constraintdef(constraint_row.oid)
    into v_event_type_constraint
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.service_request_events'::regclass
      and constraint_row.conname = 'service_request_events_event_type_check';

    if v_event_type_constraint is null
       or v_event_type_constraint ilike '%status_change%'
       or v_event_type_constraint ilike '%homeowner_note%'
       or v_event_type_constraint ilike '%company_note%' then
        execute 'alter table public.service_request_events drop constraint if exists service_request_events_event_type_check';
        execute $constraint$
            alter table public.service_request_events
                add constraint service_request_events_event_type_check
                check (nullif(btrim(event_type), '') is not null)
                not valid
        $constraint$;
    end if;
end;
$$;

create or replace function public.get_homeowner_active_service_requests(
    p_property_id uuid
)
returns table (
    id uuid,
    display_sequence bigint,
    display_code text,
    company_id uuid,
    property_id uuid,
    request_type text,
    status text,
    priority text,
    issue_summary text,
    provider_name text,
    schedule_slot_id uuid,
    schedule_status text,
    technician_name text,
    arrival_window_start timestamptz,
    arrival_window_end timestamptz,
    eta_range text,
    created_at timestamptz,
    updated_at timestamptz,
    converted_job_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_property_id is null then
        raise exception 'Property is required.';
    end if;

    if not public.homeos_can_read_property_record(p_property_id) then
        raise exception 'Not authorized to view active requests for this property.';
    end if;

    return query
    select
        request.id,
        request.display_sequence,
        request.display_code,
        request.company_id,
        request.property_id,
        request.request_type,
        request.status,
        request.priority,
        request.issue_summary,
        coalesce(company.public_name, company.dba_name, company.name, request.customer_display_name)::text as provider_name,
        active_slot.id as schedule_slot_id,
        active_slot.status as schedule_status,
        coalesce(nullif(btrim(technician.full_name), ''), nullif(btrim(technician.email), ''))::text as technician_name,
        active_slot.arrival_window_start,
        active_slot.arrival_window_end,
        null::text as eta_range,
        request.created_at,
        request.updated_at,
        request.converted_job_id
    from public.service_requests as request
    left join public.companies as company
      on company.id = request.company_id
    left join lateral (
        select slot.*
        from public.job_schedule_slots as slot
        where slot.company_id = request.company_id
          and slot.service_request_id = request.id
          and lower(btrim(coalesce(slot.status, ''))) not in (
              'cancelled',
              'canceled',
              'completed',
              'complete',
              'closed',
              'archived',
              'void'
          )
        order by
            slot.start_at asc nulls last,
            slot.updated_at desc nulls last,
            slot.id desc
        limit 1
    ) as active_slot on true
    left join public.company_users as technician
      on technician.id = active_slot.technician_company_user_id
    where request.property_id = p_property_id
      and lower(btrim(coalesce(request.status, ''))) not in (
          'archived',
          'cancelled',
          'canceled',
          'closed',
          'complete',
          'completed',
          'done',
          'resolved',
          'void'
      )
    order by
        case
            when lower(btrim(coalesce(request.request_type, ''))) = 'emergency'
              or lower(btrim(coalesce(request.priority, ''))) = 'emergency'
                then 0
            else 1
        end,
        coalesce(request.updated_at, request.created_at) desc nulls last,
        request.id desc;
end;
$$;

revoke all on function public.get_homeowner_active_service_requests(uuid) from public;
revoke all on function public.get_homeowner_active_service_requests(uuid) from anon;
grant execute on function public.get_homeowner_active_service_requests(uuid) to authenticated;

commit;
