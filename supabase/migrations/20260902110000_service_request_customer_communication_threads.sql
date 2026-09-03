-- One customer-visible communication thread per service request.
-- Homeowners, authorized office/dispatch users, and assigned field users all
-- read and write through scoped RPCs. Messages stay in the existing auditable
-- service_request_events timeline rather than creating another chat store.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null
       or to_regclass('public.service_request_events') is null
       or to_regclass('public.job_schedule_slots') is null
       or to_regclass('public.company_users') is null then
        raise exception 'Service requests, events, schedules, and company users are required.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null
       or to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'HomeOS property access and company dispatch authorization are required.';
    end if;
end
$$;

create or replace function public.get_service_request_communication_thread(
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
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    select request.* into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id;

    if not found then raise exception 'Service request not found for this company.'; end if;

    if not public.homeos_can_read_property_record(v_request.property_id)
       and not public.can_dispatch_company(p_company_id)
       and not exists (
            select 1
            from public.job_schedule_slots as slot
            join public.company_users as company_user
              on company_user.id = slot.technician_company_user_id
             and company_user.company_id = slot.company_id
            where slot.company_id = p_company_id
              and slot.service_request_id = p_service_request_id
              and company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
       ) then
        raise exception 'Not authorized to view this service request communication thread.';
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
      and (
          lower(btrim(event.event_type)) = 'communication_message'
          or lower(btrim(event.event_type)) = 'homeowner_note'
          or lower(btrim(coalesce(event.metadata ->> 'thread_kind', ''))) = 'customer_communication'
      )
    order by event.created_at asc nulls last, event.id asc;
end;
$$;

create or replace function public.send_service_request_communication_message(
    p_company_id uuid,
    p_service_request_id uuid,
    p_message text,
    p_schedule_slot_id uuid default null
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
declare
    v_request public.service_requests%rowtype;
    v_event public.service_request_events%rowtype;
    v_sender_company_user_id uuid;
    v_sender_role text;
    v_sender_name text;
    v_slot_id uuid;
    v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;
    if v_message is null then raise exception 'Message is required.'; end if;
    if char_length(v_message) > 2000 then raise exception 'Message must be 2000 characters or fewer.'; end if;

    select request.* into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id;

    if not found then raise exception 'Service request not found for this company.'; end if;

    if p_schedule_slot_id is not null
       and not exists (
            select 1
            from public.job_schedule_slots as requested_slot
            where requested_slot.id = p_schedule_slot_id
              and requested_slot.company_id = p_company_id
              and requested_slot.service_request_id = p_service_request_id
       ) then
        raise exception 'Schedule slot does not belong to this service request.';
    end if;

    if public.homeos_can_read_property_record(v_request.property_id) then
        v_sender_role := 'homeowner';
        v_sender_name := 'Homeowner';
    elsif public.can_dispatch_company(p_company_id) then
        v_sender_role := 'dispatch';

        select
            company_user.id,
            coalesce(nullif(btrim(company_user.full_name), ''), 'Office / Dispatch')
        into v_sender_company_user_id, v_sender_name
        from public.company_users as company_user
        where company_user.company_id = p_company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
        order by company_user.created_at desc nulls last, company_user.id desc
        limit 1;

    else
        select
            company_user.id,
            coalesce(nullif(btrim(company_user.full_name), ''), 'Technician'),
            slot.id
        into v_sender_company_user_id, v_sender_name, v_slot_id
        from public.job_schedule_slots as slot
        join public.company_users as company_user
          on company_user.id = slot.technician_company_user_id
         and company_user.company_id = slot.company_id
        where slot.company_id = p_company_id
          and slot.service_request_id = p_service_request_id
          and (p_schedule_slot_id is null or slot.id = p_schedule_slot_id)
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
        order by slot.updated_at desc nulls last, slot.created_at desc nulls last, slot.id desc
        limit 1;

        if v_sender_company_user_id is null then
            raise exception 'Not authorized to message this service request.';
        end if;

        v_sender_role := 'technician';
    end if;

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
        metadata,
        notification_channels,
        notification_status
    ) values (
        v_request.id,
        v_request.company_id,
        v_request.property_id,
        auth.uid(),
        'communication_message',
        v_message,
        'homeowner_visible',
        case when v_sender_role = 'homeowner' then 'dispatch' else 'homeowner' end,
        coalesce(p_schedule_slot_id, v_slot_id),
        auth.uid(),
        v_sender_company_user_id,
        jsonb_build_object(
            'source', 'service_request_communication_thread',
            'thread_kind', 'customer_communication',
            'sender_role', v_sender_role,
            'sender_name', v_sender_name
        ),
        array['in_app']::text[],
        'pending'
    )
    returning * into v_event;

    update public.service_requests
    set updated_at = now()
    where id = v_request.id;

    return query
    select
        v_event.id,
        v_event.service_request_id,
        v_event.company_id,
        v_event.property_id,
        v_event.event_type,
        v_event.message,
        v_event.event_visibility,
        v_event.audience,
        v_event.schedule_slot_id,
        v_event.dedupe_key,
        v_event.metadata,
        v_event.notification_channels,
        v_event.notification_status,
        v_event.created_at;
end;
$$;

revoke all on function public.get_service_request_communication_thread(uuid, uuid) from public, anon;
revoke all on function public.send_service_request_communication_message(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.get_service_request_communication_thread(uuid, uuid) to authenticated;
grant execute on function public.send_service_request_communication_message(uuid, uuid, text, uuid) to authenticated;

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
            select 1
            from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'service_request_events'
       ) then
        alter publication supabase_realtime add table public.service_request_events;
    end if;
end
$$;

commit;
