-- Add homeowner-visible service request activity and notification event support.
-- This extends the existing service_request_events table instead of creating a
-- disconnected messaging system.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before service request activity can be installed.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before service request activity can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before service request activity can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before service request activity can be installed.';
    end if;

    if to_regclass('public.property_memberships') is null then
        raise exception 'public.property_memberships is required before homeowner activity can be installed.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before service request activity can be installed.';
    end if;
end;
$$;

alter table public.service_request_events
    add column if not exists event_visibility text not null default 'internal',
    add column if not exists audience text not null default 'internal',
    add column if not exists schedule_slot_id uuid null,
    add column if not exists actor_user_id uuid null,
    add column if not exists actor_company_user_id uuid null,
    add column if not exists dedupe_key text null,
    add column if not exists metadata jsonb not null default '{}'::jsonb,
    add column if not exists notification_channels text[] not null default array[]::text[],
    add column if not exists notification_status text not null default 'not_sent',
    add column if not exists notification_error text null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.service_request_events'::regclass
          and conname = 'service_request_events_schedule_slot_id_fkey'
    ) then
        alter table public.service_request_events
            add constraint service_request_events_schedule_slot_id_fkey
            foreign key (schedule_slot_id)
            references public.job_schedule_slots (id)
            on delete set null
            not valid;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.service_request_events'::regclass
          and conname = 'service_request_events_actor_company_user_id_fkey'
    ) then
        alter table public.service_request_events
            add constraint service_request_events_actor_company_user_id_fkey
            foreign key (actor_company_user_id)
            references public.company_users (id)
            on delete set null
            not valid;
    end if;
end;
$$;

alter table public.service_request_events
    drop constraint if exists service_request_events_visibility_check;

alter table public.service_request_events
    add constraint service_request_events_visibility_check
    check (lower(btrim(event_visibility)) in ('internal', 'homeowner_visible', 'system_homeowner_update'))
    not valid;

alter table public.service_request_events
    drop constraint if exists service_request_events_audience_check;

alter table public.service_request_events
    add constraint service_request_events_audience_check
    check (lower(btrim(audience)) in ('internal', 'homeowner', 'technician', 'dispatch'))
    not valid;

create index if not exists service_request_events_homeowner_visible_idx
    on public.service_request_events (service_request_id, property_id, created_at desc)
    where lower(btrim(event_visibility)) in ('homeowner_visible', 'system_homeowner_update')
      and lower(btrim(audience)) = 'homeowner';

create index if not exists service_request_events_schedule_slot_idx
    on public.service_request_events (schedule_slot_id)
    where schedule_slot_id is not null;

create unique index if not exists service_request_events_dedupe_key_idx
    on public.service_request_events (company_id, service_request_id, dedupe_key)
    where dedupe_key is not null;

create or replace function public.service_request_actor_can_write(
    p_company_id uuid,
    p_service_request_id uuid,
    p_schedule_slot_id uuid default null
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and exists (
            select 1
            from public.service_requests as request
            where request.id = p_service_request_id
              and request.company_id = p_company_id
       )
       and (
            public.can_dispatch_company(p_company_id)
            or (
                p_schedule_slot_id is not null
                and exists (
                select 1
                from public.job_schedule_slots as slot
                join public.company_users as company_user
                  on company_user.id = slot.technician_company_user_id
                 and company_user.company_id = slot.company_id
                where slot.service_request_id = p_service_request_id
                  and slot.company_id = p_company_id
                  and slot.id = p_schedule_slot_id
                  and company_user.auth_user_id = auth.uid()
                  and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                  and lower(btrim(coalesce(company_user.role, ''))) in (
                      'technician',
                      'tech',
                      'field_tech',
                      'field-tech',
                      'field technician'
                  )
                )
            )
       );
$$;

create or replace function public.service_request_actor_can_read_homeowner_events(
    p_service_request_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and exists (
            select 1
            from public.service_requests as request
            join public.property_memberships as membership
              on membership.property_id = request.property_id
             and membership.user_id = auth.uid()
            where request.id = p_service_request_id
              and lower(btrim(coalesce(membership.status, ''))) = 'active'
       );
$$;

create or replace function public.record_service_request_event(
    p_company_id uuid,
    p_service_request_id uuid,
    p_event_type text,
    p_message text,
    p_event_visibility text default 'internal',
    p_audience text default 'internal',
    p_schedule_slot_id uuid default null,
    p_dedupe_key text default null,
    p_metadata jsonb default '{}'::jsonb,
    p_notification_channels text[] default array[]::text[]
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
    v_existing public.service_request_events%rowtype;
    v_event public.service_request_events%rowtype;
    v_actor_company_user_id uuid;
    v_visibility text := lower(btrim(coalesce(p_event_visibility, 'internal')));
    v_audience text := lower(btrim(coalesce(p_audience, 'internal')));
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    if nullif(btrim(coalesce(p_event_type, '')), '') is null then
        raise exception 'Event type is required.';
    end if;

    if nullif(btrim(coalesce(p_message, '')), '') is null then
        raise exception 'Event message is required.';
    end if;

    if v_visibility not in ('internal', 'homeowner_visible', 'system_homeowner_update') then
        raise exception 'Invalid service request event visibility.';
    end if;

    if v_audience not in ('internal', 'homeowner', 'technician', 'dispatch') then
        raise exception 'Invalid service request event audience.';
    end if;

    select request.*
    into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id;

    if not found then
        raise exception 'Service request not found for this company.';
    end if;

    if not public.service_request_actor_can_write(p_company_id, p_service_request_id, p_schedule_slot_id) then
        raise exception 'Not authorized to record service request events for this request.';
    end if;

    if p_schedule_slot_id is not null and not exists (
        select 1
        from public.job_schedule_slots as slot
        where slot.id = p_schedule_slot_id
          and slot.company_id = p_company_id
          and slot.service_request_id = p_service_request_id
    ) then
        raise exception 'Schedule slot does not belong to this service request.';
    end if;

    if p_dedupe_key is not null then
        select event.*
        into v_existing
        from public.service_request_events as event
        where event.company_id = p_company_id
          and event.service_request_id = p_service_request_id
          and event.dedupe_key = p_dedupe_key
        order by event.created_at desc nulls last
        limit 1;

        if found then
            return query
            select
                v_existing.id,
                v_existing.service_request_id,
                v_existing.company_id,
                v_existing.property_id,
                v_existing.event_type,
                v_existing.message,
                v_existing.event_visibility,
                v_existing.audience,
                v_existing.schedule_slot_id,
                v_existing.dedupe_key,
                v_existing.metadata,
                v_existing.notification_channels,
                v_existing.notification_status,
                v_existing.created_at;
            return;
        end if;
    end if;

    select company_user.id
    into v_actor_company_user_id
    from public.company_users as company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at desc nulls last
    limit 1;

    insert into public.service_request_events (
        service_request_id,
        company_id,
        property_id,
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
    values (
        p_service_request_id,
        p_company_id,
        v_request.property_id,
        lower(btrim(p_event_type)),
        btrim(p_message),
        v_visibility,
        v_audience,
        p_schedule_slot_id,
        auth.uid(),
        v_actor_company_user_id,
        nullif(btrim(coalesce(p_dedupe_key, '')), ''),
        coalesce(p_metadata, '{}'::jsonb),
        coalesce(p_notification_channels, array[]::text[]),
        case
            when cardinality(coalesce(p_notification_channels, array[]::text[])) > 0 then 'pending'
            else 'not_sent'
        end
    )
    returning *
    into v_event;

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

create or replace function public.get_homeowner_service_request_events(
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

    if p_service_request_id is null then
        raise exception 'Service request is required.';
    end if;

    if not public.service_request_actor_can_read_homeowner_events(p_service_request_id) then
        raise exception 'Not authorized to view this service request activity.';
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
    join public.service_requests as request
      on request.id = event.service_request_id
     and request.property_id = event.property_id
    where event.service_request_id = p_service_request_id
      and lower(btrim(event.event_visibility)) in ('homeowner_visible', 'system_homeowner_update')
      and lower(btrim(event.audience)) = 'homeowner'
    order by event.created_at asc nulls last, event.id asc;
end;
$$;

drop function if exists public.get_service_request_events(uuid, uuid);

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
        event.event_visibility,
        event.audience,
        event.schedule_slot_id,
        event.dedupe_key,
        event.metadata,
        event.notification_channels,
        event.notification_status,
        event.created_at
    from public.service_request_events as event
    where event.service_request_id = p_service_request_id
      and event.company_id = p_company_id
    order by event.created_at desc nulls last, event.id desc;
end;
$$;

revoke all on function public.record_service_request_event(uuid, uuid, text, text, text, text, uuid, text, jsonb, text[]) from public;
revoke all on function public.record_service_request_event(uuid, uuid, text, text, text, text, uuid, text, jsonb, text[]) from anon;
grant execute on function public.record_service_request_event(uuid, uuid, text, text, text, text, uuid, text, jsonb, text[]) to authenticated;

revoke all on function public.get_homeowner_service_request_events(uuid) from public;
revoke all on function public.get_homeowner_service_request_events(uuid) from anon;
grant execute on function public.get_homeowner_service_request_events(uuid) to authenticated;

revoke all on function public.get_service_request_events(uuid, uuid) from public;
revoke all on function public.get_service_request_events(uuid, uuid) from anon;
grant execute on function public.get_service_request_events(uuid, uuid) to authenticated;

commit;
