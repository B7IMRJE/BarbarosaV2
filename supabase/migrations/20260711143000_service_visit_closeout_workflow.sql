-- Service visit close-out workflow.
-- A job_schedule_slots row represents one technician visit. A service_requests
-- row represents the overall homeowner issue. This RPC closes one visit and
-- moves the overall request to the right queue atomically.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before service visit close-out can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before service visit close-out can be installed.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before service visit close-out can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before service visit close-out can be installed.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before service visit close-out can be installed.';
    end if;
end;
$$;

alter table public.service_requests
    drop constraint if exists service_requests_status_check;

alter table public.service_requests
    add constraint service_requests_status_check
    check (
        lower(btrim(status)) in (
            'new',
            'open',
            'reported',
            'unassigned',
            'acknowledged',
            'assigned',
            'scheduled',
            'dispatched',
            'in_progress',
            'converted_to_job',
            'completed',
            'resolved',
            'closed',
            'cancelled',
            'canceled',
            'archived',
            'needs_follow_up',
            'return_visit_required',
            'waiting_for_parts',
            'on_hold',
            'paused',
            'customer_no_show',
            'missed_no_show',
            'unable_to_complete',
            'void',
            'duplicate_or_void'
        )
    ) not valid;

alter table public.service_requests
    add column if not exists closeout_outcome text null,
    add column if not exists closeout_notes text null,
    add column if not exists homeowner_closeout_note text null,
    add column if not exists next_action_at timestamptz null,
    add column if not exists closed_at timestamptz null,
    add column if not exists closed_by_user_id uuid null references auth.users(id) on delete set null,
    add column if not exists cancelled_at timestamptz null,
    add column if not exists cancelled_by_user_id uuid null references auth.users(id) on delete set null,
    add column if not exists cancel_reason text null,
    add column if not exists archived_at timestamptz null,
    add column if not exists archived_by_user_id uuid null references auth.users(id) on delete set null,
    add column if not exists archive_reason text null,
    add column if not exists restored_at timestamptz null,
    add column if not exists restored_by_user_id uuid null references auth.users(id) on delete set null,
    add column if not exists closeout_metadata jsonb not null default '{}'::jsonb;

alter table public.job_schedule_slots
    drop constraint if exists job_schedule_slots_status_check;

alter table public.job_schedule_slots
    add constraint job_schedule_slots_status_check
    check (
        lower(btrim(status)) in (
            'tentative',
            'scheduled',
            'dispatched',
            'on_my_way',
            'arrived',
            'in_progress',
            'estimate_needed',
            'completed',
            'closed',
            'running_late',
            'available',
            'custom',
            'cancelled',
            'canceled',
            'archived'
        )
    ) not valid;

alter table public.job_schedule_slots
    add column if not exists visit_outcome text null,
    add column if not exists visit_closed_at timestamptz null,
    add column if not exists visit_closed_by_user_id uuid null references auth.users(id) on delete set null,
    add column if not exists closeout_notes text null,
    add column if not exists homeowner_closeout_note text null,
    add column if not exists closeout_metadata jsonb not null default '{}'::jsonb;

alter table public.job_schedule_slots
    drop constraint if exists job_schedule_slots_visit_outcome_check;

alter table public.job_schedule_slots
    add constraint job_schedule_slots_visit_outcome_check
    check (
        visit_outcome is null
        or lower(btrim(visit_outcome)) in (
            'completed_successfully',
            'follow_up_required',
            'return_visit_required',
            'waiting_for_parts',
            'paused_on_hold',
            'customer_no_show',
            'cancelled',
            'unable_to_complete',
            'duplicate_or_void'
        )
    ) not valid;

alter table public.service_requests
    drop constraint if exists service_requests_closeout_outcome_check;

alter table public.service_requests
    add constraint service_requests_closeout_outcome_check
    check (
        closeout_outcome is null
        or lower(btrim(closeout_outcome)) in (
            'completed_successfully',
            'follow_up_required',
            'return_visit_required',
            'waiting_for_parts',
            'paused_on_hold',
            'customer_no_show',
            'cancelled',
            'unable_to_complete',
            'duplicate_or_void'
        )
    ) not valid;

alter table public.service_request_events
    drop constraint if exists service_request_events_event_type_check;

alter table public.service_request_events
    add constraint service_request_events_event_type_check
    check (nullif(btrim(event_type), '') is not null)
    not valid;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'service_request_events'
          and column_name = 'created_by_user_id'
    ) then
        alter table public.service_request_events
            alter column created_by_user_id set default auth.uid();
    end if;
end;
$$;

create index if not exists service_requests_company_next_action_idx
    on public.service_requests (company_id, status, next_action_at)
    where next_action_at is not null;

create index if not exists job_schedule_slots_visit_outcome_idx
    on public.job_schedule_slots (company_id, service_request_id, visit_outcome, visit_closed_at desc)
    where visit_outcome is not null;

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
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
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

    update public.job_schedule_slots as slot
    set status = 'cancelled',
        visit_outcome = coalesce(slot.visit_outcome, 'cancelled'),
        visit_closed_at = coalesce(slot.visit_closed_at, now()),
        visit_closed_by_user_id = coalesce(slot.visit_closed_by_user_id, auth.uid()),
        closeout_notes = coalesce(slot.closeout_notes, v_reason),
        closeout_metadata = coalesce(slot.closeout_metadata, '{}'::jsonb) || jsonb_build_object(
            'cancelled_by_request_action', true,
            'cancel_reason', v_reason
        ),
        tech_status_note = null,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where slot.company_id = p_company_id
      and slot.service_request_id = p_service_request_id
      and lower(btrim(coalesce(slot.status, ''))) not in (
          'completed',
          'complete',
          'closed',
          'done',
          'cancelled',
          'canceled',
          'archived',
          'void'
      );

    update public.service_requests as request
    set status = 'cancelled',
        closeout_outcome = coalesce(request.closeout_outcome, 'cancelled'),
        closeout_notes = coalesce(request.closeout_notes, v_reason),
        closeout_metadata = coalesce(request.closeout_metadata, '{}'::jsonb) || jsonb_build_object(
            'pre_cancel_status', v_request.status,
            'cancelled_by_request_action', true
        ),
        closed_at = coalesce(request.closed_at, now()),
        closed_by_user_id = coalesce(request.closed_by_user_id, auth.uid()),
        cancelled_at = coalesce(request.cancelled_at, now()),
        cancelled_by_user_id = coalesce(request.cancelled_by_user_id, auth.uid()),
        cancel_reason = coalesce(v_reason, request.cancel_reason),
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
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
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

    if lower(btrim(coalesce(v_request.status, ''))) = 'archived' then
        return v_request;
    end if;

    update public.job_schedule_slots as slot
    set status = 'archived',
        visit_closed_at = coalesce(slot.visit_closed_at, now()),
        visit_closed_by_user_id = coalesce(slot.visit_closed_by_user_id, auth.uid()),
        closeout_metadata = coalesce(slot.closeout_metadata, '{}'::jsonb) || jsonb_build_object(
            'archived_by_request_action', true,
            'archive_reason', v_reason
        ),
        tech_status_note = null,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where slot.company_id = p_company_id
      and slot.service_request_id = p_service_request_id
      and lower(btrim(coalesce(slot.status, ''))) not in (
          'completed',
          'complete',
          'closed',
          'done',
          'cancelled',
          'canceled',
          'archived',
          'void'
      );

    update public.service_requests as request
    set status = 'archived',
        closeout_metadata = coalesce(request.closeout_metadata, '{}'::jsonb) || jsonb_build_object(
            'pre_archive_status', v_request.status,
            'archived_by_request_action', true
        ),
        archived_at = coalesce(request.archived_at, now()),
        archived_by_user_id = coalesce(request.archived_by_user_id, auth.uid()),
        archive_reason = coalesce(v_reason, request.archive_reason),
        updated_at = now()
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    returning request.*
    into v_request;

    return v_request;
end;
$$;

drop function if exists public.close_service_visit(uuid, uuid, uuid, text, text, text, timestamptz, boolean, jsonb);

create or replace function public.close_service_visit(
    p_company_id uuid,
    p_service_request_id uuid,
    p_schedule_slot_id uuid,
    p_outcome text,
    p_notes text default null,
    p_homeowner_note text default null,
    p_next_action_at timestamptz default null,
    p_notify_homeowner boolean default false,
    p_metadata jsonb default '{}'::jsonb
)
returns table (
    service_request_id uuid,
    service_request_status text,
    schedule_slot_id uuid,
    schedule_slot_status text,
    visit_outcome text,
    homeowner_event_recorded boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_slot public.job_schedule_slots%rowtype;
    v_actor_company_user public.company_users%rowtype;
    v_outcome text := lower(btrim(coalesce(p_outcome, '')));
    v_request_status text;
    v_slot_status text;
    v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
    v_homeowner_note text := nullif(btrim(coalesce(p_homeowner_note, '')), '');
    v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
    v_is_dispatch_actor boolean := false;
    v_is_assigned_technician boolean := false;
    v_homeowner_message text := null;
    v_homeowner_should_record boolean := false;
    v_internal_dedupe_key text;
    v_homeowner_dedupe_key text;
    v_previous_request_status text;
    v_previous_slot_status text;
    v_terminal_outcome boolean := false;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null or p_schedule_slot_id is null then
        raise exception 'Company, service request, and schedule slot are required.';
    end if;

    if v_outcome not in (
        'completed_successfully',
        'follow_up_required',
        'return_visit_required',
        'waiting_for_parts',
        'paused_on_hold',
        'customer_no_show',
        'cancelled',
        'unable_to_complete',
        'duplicate_or_void'
    ) then
        raise exception 'Invalid visit outcome.';
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

    select slot.*
    into v_slot
    from public.job_schedule_slots as slot
    where slot.id = p_schedule_slot_id
      and slot.company_id = p_company_id
      and slot.service_request_id = p_service_request_id
    for update;

    if not found then
        raise exception 'Schedule slot not found for this service request.';
    end if;

    select company_user.*
    into v_actor_company_user
    from public.company_users as company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at desc nulls last, company_user.id desc
    limit 1;

    v_is_dispatch_actor := public.can_dispatch_company(p_company_id);
    v_is_assigned_technician := found and v_actor_company_user.id = v_slot.technician_company_user_id;

    if not v_is_dispatch_actor and not (
        v_is_assigned_technician
        and v_outcome in (
            'completed_successfully',
            'follow_up_required',
            'return_visit_required',
            'waiting_for_parts',
            'paused_on_hold',
            'customer_no_show',
            'unable_to_complete'
        )
    ) then
        raise exception 'Not authorized to close this service visit.';
    end if;

    if nullif(btrim(coalesce(v_slot.visit_outcome, '')), '') is not null then
        if lower(btrim(v_slot.visit_outcome)) = v_outcome then
            v_homeowner_dedupe_key := 'homeowner-closeout:' || p_schedule_slot_id::text || ':' || v_outcome;

            select exists (
                select 1
                from public.service_request_events as existing
                where existing.company_id = p_company_id
                  and existing.service_request_id = p_service_request_id
                  and existing.dedupe_key = v_homeowner_dedupe_key
            )
            into v_homeowner_should_record;

            return query
            select
                v_request.id,
                v_request.status,
                v_slot.id,
                v_slot.status,
                v_slot.visit_outcome,
                v_homeowner_should_record;
            return;
        end if;

        raise exception 'Service visit was already closed as %.', v_slot.visit_outcome;
    end if;

    if lower(btrim(coalesce(v_slot.status, ''))) in ('completed', 'complete', 'closed', 'done', 'cancelled', 'canceled', 'archived', 'void') then
        raise exception 'Schedule slot is already closed and cannot be closed again.';
    end if;

    v_request_status := case v_outcome
        when 'completed_successfully' then 'completed'
        when 'follow_up_required' then 'needs_follow_up'
        when 'return_visit_required' then 'return_visit_required'
        when 'waiting_for_parts' then 'waiting_for_parts'
        when 'paused_on_hold' then 'on_hold'
        when 'customer_no_show' then 'customer_no_show'
        when 'cancelled' then 'cancelled'
        when 'unable_to_complete' then 'unable_to_complete'
        when 'duplicate_or_void' then 'archived'
        else 'needs_follow_up'
    end;

    v_terminal_outcome := v_outcome in ('completed_successfully', 'cancelled', 'duplicate_or_void');

    v_slot_status := case v_outcome
        when 'cancelled' then 'cancelled'
        when 'duplicate_or_void' then 'archived'
        else 'completed'
    end;

    v_previous_request_status := v_request.status;
    v_previous_slot_status := v_slot.status;

    update public.job_schedule_slots as slot
    set status = v_slot_status,
        visit_outcome = v_outcome,
        visit_closed_at = coalesce(slot.visit_closed_at, now()),
        visit_closed_by_user_id = coalesce(slot.visit_closed_by_user_id, auth.uid()),
        closeout_notes = v_notes,
        homeowner_closeout_note = v_homeowner_note,
        closeout_metadata = coalesce(slot.closeout_metadata, '{}'::jsonb) || v_metadata || jsonb_build_object(
            'outcome', v_outcome,
            'closed_by_company_user_id', v_actor_company_user.id,
            'closed_by_role', v_actor_company_user.role,
            'next_action_at', p_next_action_at
        ),
        tech_status_note = null,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where slot.id = p_schedule_slot_id
      and slot.company_id = p_company_id
    returning slot.*
    into v_slot;

    if v_terminal_outcome then
        update public.job_schedule_slots as sibling
        set status = case
                when v_outcome = 'duplicate_or_void' then 'archived'
                else 'cancelled'
            end,
            visit_outcome = case
                when v_outcome in ('cancelled', 'duplicate_or_void') then coalesce(sibling.visit_outcome, v_outcome)
                else sibling.visit_outcome
            end,
            visit_closed_at = coalesce(sibling.visit_closed_at, now()),
            visit_closed_by_user_id = coalesce(sibling.visit_closed_by_user_id, auth.uid()),
            closeout_metadata = coalesce(sibling.closeout_metadata, '{}'::jsonb) || jsonb_build_object(
                'superseded_by_schedule_slot_id', p_schedule_slot_id,
                'superseded_by_outcome', v_outcome,
                'superseded_reason', case
                    when v_outcome = 'completed_successfully' then 'request_completed'
                    when v_outcome = 'cancelled' then 'request_cancelled'
                    else 'request_archived'
                end
            ),
            tech_status_note = null,
            updated_by_user_id = auth.uid(),
            updated_at = now()
        where sibling.company_id = p_company_id
          and sibling.service_request_id = p_service_request_id
          and sibling.id <> p_schedule_slot_id
          and lower(btrim(coalesce(sibling.status, ''))) not in (
              'completed',
              'complete',
              'closed',
              'done',
              'cancelled',
              'canceled',
              'archived',
              'void'
          );
    end if;

    update public.service_requests as request
    set status = v_request_status,
        closeout_outcome = v_outcome,
        closeout_notes = v_notes,
        homeowner_closeout_note = v_homeowner_note,
        next_action_at = p_next_action_at,
        closeout_metadata = coalesce(request.closeout_metadata, '{}'::jsonb) || v_metadata || jsonb_build_object(
            'last_schedule_slot_id', p_schedule_slot_id,
            'last_visit_outcome', v_outcome,
            'pre_closeout_status', v_previous_request_status,
            'closed_by_company_user_id', v_actor_company_user.id,
            'closed_by_role', v_actor_company_user.role
        ),
        closed_at = case
            when v_request_status in ('completed', 'cancelled', 'archived') then coalesce(request.closed_at, now())
            else request.closed_at
        end,
        closed_by_user_id = case
            when v_request_status in ('completed', 'cancelled', 'archived') then coalesce(request.closed_by_user_id, auth.uid())
            else request.closed_by_user_id
        end,
        cancelled_at = case
            when v_request_status = 'cancelled' then coalesce(request.cancelled_at, now())
            else request.cancelled_at
        end,
        cancelled_by_user_id = case
            when v_request_status = 'cancelled' then coalesce(request.cancelled_by_user_id, auth.uid())
            else request.cancelled_by_user_id
        end,
        cancel_reason = case
            when v_request_status = 'cancelled' then coalesce(v_notes, request.cancel_reason)
            else request.cancel_reason
        end,
        archived_at = case
            when v_request_status = 'archived' then coalesce(request.archived_at, now())
            else request.archived_at
        end,
        archived_by_user_id = case
            when v_request_status = 'archived' then coalesce(request.archived_by_user_id, auth.uid())
            else request.archived_by_user_id
        end,
        archive_reason = case
            when v_request_status = 'archived' then coalesce(v_notes, request.archive_reason)
            else request.archive_reason
        end,
        updated_at = now()
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    returning request.*
    into v_request;

    v_internal_dedupe_key := 'visit-closeout:' || p_schedule_slot_id::text || ':' || v_outcome;

    insert into public.service_request_events (
        service_request_id,
        company_id,
        property_id,
        created_by_user_id,
        event_type,
        message,
        event_visibility,
        audience,
        schedule_slot_id,
        actor_user_id,
        actor_company_user_id,
        dedupe_key,
        metadata,
        notification_channels,
        notification_status
    )
    select
        p_service_request_id,
        p_company_id,
        v_request.property_id,
        auth.uid(),
        'visit_closeout',
        'Visit closed: ' || replace(v_outcome, '_', ' '),
        'internal',
        'dispatch',
        p_schedule_slot_id,
        auth.uid(),
        v_actor_company_user.id,
        v_internal_dedupe_key,
        jsonb_build_object(
            'outcome', v_outcome,
            'previous_request_status', v_previous_request_status,
            'previous_schedule_slot_status', v_previous_slot_status,
            'new_request_status', v_request_status,
            'new_schedule_slot_status', v_slot_status,
            'notes', v_notes,
            'next_action_at', p_next_action_at
        ) || v_metadata,
        array['in_app']::text[],
        'not_sent'
    where not exists (
        select 1
        from public.service_request_events as existing
        where existing.company_id = p_company_id
          and existing.service_request_id = p_service_request_id
          and existing.dedupe_key = v_internal_dedupe_key
    );

    v_homeowner_message := case v_outcome
        when 'completed_successfully' then 'Your service has been completed. You can review your technician and company from this request.'
        when 'return_visit_required' then 'An additional visit is needed to complete your service. We will provide scheduling details.'
        when 'waiting_for_parts' then 'A part is needed to continue your service. We will update you when it is available.'
        when 'cancelled' then 'Your appointment has been cancelled.'
        else null
    end;

    v_homeowner_should_record := (
        v_homeowner_message is not null
        and (
            v_outcome in ('completed_successfully', 'return_visit_required')
            or p_notify_homeowner
        )
    ) or (
        v_outcome in ('follow_up_required', 'paused_on_hold', 'customer_no_show', 'unable_to_complete')
        and p_notify_homeowner
        and v_homeowner_note is not null
    );

    if v_outcome in ('follow_up_required', 'paused_on_hold', 'customer_no_show', 'unable_to_complete') and v_homeowner_note is not null then
        v_homeowner_message := v_homeowner_note;
    end if;

    if v_homeowner_should_record and v_homeowner_message is not null then
        v_homeowner_dedupe_key := 'homeowner-closeout:' || p_schedule_slot_id::text || ':' || v_outcome;

        insert into public.service_request_events (
            service_request_id,
            company_id,
            property_id,
            created_by_user_id,
            event_type,
            message,
            event_visibility,
            audience,
            schedule_slot_id,
            actor_user_id,
            actor_company_user_id,
            dedupe_key,
            metadata,
            notification_channels,
            notification_status
        )
        select
            p_service_request_id,
            p_company_id,
            v_request.property_id,
            auth.uid(),
            case
                when v_outcome = 'completed_successfully' then 'work_completed'
                when v_outcome = 'return_visit_required' then 'return_visit_needed'
                when v_outcome = 'waiting_for_parts' then 'waiting_for_parts'
                when v_outcome = 'cancelled' then 'appointment_cancelled'
                else 'service_update'
            end,
            v_homeowner_message || case when v_homeowner_note is not null and v_homeowner_message <> v_homeowner_note then ' ' || v_homeowner_note else '' end,
            'system_homeowner_update',
            'homeowner',
            p_schedule_slot_id,
            auth.uid(),
            v_actor_company_user.id,
            v_homeowner_dedupe_key,
            jsonb_build_object(
                'outcome', v_outcome,
                'request_status', v_request_status,
                'next_action_at', p_next_action_at,
                'homeowner_note_present', v_homeowner_note is not null
            ),
            array['in_app']::text[],
            'not_sent'
        where not exists (
            select 1
            from public.service_request_events as existing
            where existing.company_id = p_company_id
              and existing.service_request_id = p_service_request_id
              and existing.dedupe_key = v_homeowner_dedupe_key
        );
    end if;

    return query
    select
        v_request.id,
        v_request.status,
        v_slot.id,
        v_slot.status,
        v_slot.visit_outcome,
        v_homeowner_should_record;
end;
$$;

revoke all on function public.close_service_visit(uuid, uuid, uuid, text, text, text, timestamptz, boolean, jsonb) from public;
revoke all on function public.close_service_visit(uuid, uuid, uuid, text, text, text, timestamptz, boolean, jsonb) from anon;
grant execute on function public.close_service_visit(uuid, uuid, uuid, text, text, text, timestamptz, boolean, jsonb) to authenticated;

revoke all on function public.cancel_service_request(uuid, uuid, text) from public;
revoke all on function public.cancel_service_request(uuid, uuid, text) from anon;
grant execute on function public.cancel_service_request(uuid, uuid, text) to authenticated;

revoke all on function public.archive_service_request(uuid, uuid, text) from public;
revoke all on function public.archive_service_request(uuid, uuid, text) from anon;
grant execute on function public.archive_service_request(uuid, uuid, text) to authenticated;

drop function if exists public.restore_service_request(uuid, uuid, text);

create or replace function public.restore_service_request(
    p_company_id uuid,
    p_service_request_id uuid,
    p_status text default 'acknowledged'
)
returns public.service_requests
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_status text := lower(btrim(coalesce(p_status, 'acknowledged')));
    v_restored_status text;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    if not public.can_dispatch_company(p_company_id) then
        raise exception 'Not authorized to restore dispatch requests for this company.';
    end if;

    if v_status not in ('new', 'acknowledged', 'scheduled', 'needs_follow_up', 'return_visit_required') then
        v_status := 'acknowledged';
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

    if lower(btrim(coalesce(v_request.status, ''))) <> 'archived' then
        raise exception 'Only archived service requests can be restored.';
    end if;

    v_restored_status := case lower(btrim(coalesce(v_request.closeout_outcome, '')))
        when 'completed_successfully' then 'completed'
        when 'cancelled' then 'cancelled'
        when 'follow_up_required' then 'needs_follow_up'
        when 'return_visit_required' then 'return_visit_required'
        when 'waiting_for_parts' then 'waiting_for_parts'
        when 'paused_on_hold' then 'on_hold'
        when 'customer_no_show' then 'customer_no_show'
        when 'unable_to_complete' then 'unable_to_complete'
        when 'duplicate_or_void' then 'void'
        else coalesce(nullif(btrim(v_request.closeout_metadata ->> 'pre_archive_status'), ''), v_status)
    end;

    if v_restored_status not in (
        'new',
        'acknowledged',
        'scheduled',
        'needs_follow_up',
        'return_visit_required',
        'waiting_for_parts',
        'on_hold',
        'customer_no_show',
        'unable_to_complete',
        'completed',
        'cancelled',
        'void'
    ) then
        v_restored_status := 'acknowledged';
    end if;

    update public.service_requests as request
    set status = v_restored_status,
        restored_at = now(),
        restored_by_user_id = auth.uid(),
        updated_at = now()
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    returning request.*
    into v_request;

    insert into public.service_request_events (
        service_request_id,
        company_id,
        property_id,
        created_by_user_id,
        event_type,
        message,
        event_visibility,
        audience,
        actor_user_id,
        dedupe_key,
        metadata,
        notification_channels,
        notification_status
    )
    select
        p_service_request_id,
        p_company_id,
        v_request.property_id,
        auth.uid(),
        'service_request_restored',
        'Archived request restored.',
        'internal',
        'dispatch',
        auth.uid(),
        'restore:' || p_service_request_id::text || ':' || extract(epoch from now())::bigint::text,
        jsonb_build_object('restored_status', v_restored_status),
        array['in_app']::text[],
        'not_sent';

    return v_request;
end;
$$;

revoke all on function public.restore_service_request(uuid, uuid, text) from public;
revoke all on function public.restore_service_request(uuid, uuid, text) from anon;
grant execute on function public.restore_service_request(uuid, uuid, text) to authenticated;

commit;
