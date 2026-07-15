-- Homeowner job-status notifications and delivery records.
-- This keeps technician workflow transitions server-side and extends the
-- existing service_request_events timeline instead of creating a duplicate
-- job-status source of truth.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before homeowner job-status notifications can be installed.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before homeowner job-status notifications can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before homeowner job-status notifications can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before homeowner job-status notifications can be installed.';
    end if;

    if to_regclass('public.jobs') is null then
        raise exception 'public.jobs is required before homeowner job-status notifications can be installed.';
    end if;

    if to_regclass('public.property_memberships') is null then
        raise exception 'public.property_memberships is required before homeowner job-status notifications can be installed.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before homeowner job-status notifications can be installed.';
    end if;
end;
$$;

alter table public.job_schedule_slots
    drop constraint if exists job_schedule_slots_status_check;

alter table public.job_schedule_slots
    add constraint job_schedule_slots_status_check
    check (
        lower(btrim(status)) in (
            'tentative',
            'scheduled',
            'assigned',
            'dispatched',
            'on_my_way',
            'arriving_soon',
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

create table if not exists public.homeowner_notification_preferences (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    app_enabled boolean not null default true,
    sms_enabled boolean not null default false,
    email_enabled boolean not null default false,
    sms_phone text null,
    email_address text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint homeowner_notification_preferences_unique_user_property
        unique (property_id, user_id),
    constraint homeowner_notification_preferences_contact_check
        check (
            (sms_phone is null or btrim(sms_phone) <> '')
            and (email_address is null or btrim(email_address) <> '')
        )
);

create index if not exists homeowner_notification_preferences_user_idx
    on public.homeowner_notification_preferences (user_id, property_id);

create table if not exists public.homeowner_push_devices (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    property_id uuid null references public.properties(id) on delete cascade,
    expo_push_token text not null,
    platform text null,
    device_name text null,
    status text not null default 'active',
    last_seen_at timestamptz not null default now(),
    last_error text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint homeowner_push_devices_token_not_blank
        check (btrim(expo_push_token) <> ''),
    constraint homeowner_push_devices_status_check
        check (lower(btrim(status)) in ('active', 'revoked', 'failed'))
);

create unique index if not exists homeowner_push_devices_user_token_uidx
    on public.homeowner_push_devices (user_id, expo_push_token);

create index if not exists homeowner_push_devices_active_idx
    on public.homeowner_push_devices (user_id, property_id, status, last_seen_at desc)
    where lower(btrim(status)) = 'active';

create table if not exists public.service_notification_deliveries (
    id uuid primary key default gen_random_uuid(),
    service_request_event_id uuid not null references public.service_request_events(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    service_request_id uuid not null references public.service_requests(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    recipient_user_id uuid not null references auth.users(id) on delete cascade,
    channel text not null,
    delivery_status text not null,
    provider_message_id text null,
    provider_error text null,
    dedupe_key text not null,
    metadata jsonb not null default '{}'::jsonb,
    queued_at timestamptz null,
    sent_at timestamptz null,
    delivered_at timestamptz null,
    failed_at timestamptz null,
    read_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint service_notification_deliveries_channel_check
        check (lower(btrim(channel)) in ('in_app', 'push', 'sms', 'email')),
    constraint service_notification_deliveries_status_check
        check (lower(btrim(delivery_status)) in (
            'queued',
            'sent',
            'delivered',
            'failed',
            'skipped_preference',
            'skipped_missing_contact',
            'skipped_missing_token'
        )),
    constraint service_notification_deliveries_dedupe_not_blank
        check (btrim(dedupe_key) <> '')
);

create unique index if not exists service_notification_deliveries_dedupe_uidx
    on public.service_notification_deliveries (dedupe_key);

create index if not exists service_notification_deliveries_recipient_idx
    on public.service_notification_deliveries (recipient_user_id, delivery_status, created_at desc);

create index if not exists service_notification_deliveries_company_status_idx
    on public.service_notification_deliveries (company_id, delivery_status, created_at desc);

alter table public.homeowner_notification_preferences enable row level security;
alter table public.homeowner_push_devices enable row level security;
alter table public.service_notification_deliveries enable row level security;

grant select, insert, update on table public.homeowner_notification_preferences to authenticated;
grant select, insert, update, delete on table public.homeowner_push_devices to authenticated;
grant select on table public.service_notification_deliveries to authenticated;

drop policy if exists homeowner_notification_preferences_own_select on public.homeowner_notification_preferences;
create policy homeowner_notification_preferences_own_select
on public.homeowner_notification_preferences
for select
to authenticated
using (
    user_id = auth.uid()
    and exists (
        select 1
        from public.property_memberships as membership
        where membership.property_id = homeowner_notification_preferences.property_id
          and membership.user_id = auth.uid()
          and lower(btrim(coalesce(membership.status, ''))) = 'active'
    )
);

drop policy if exists homeowner_notification_preferences_own_write on public.homeowner_notification_preferences;
create policy homeowner_notification_preferences_own_write
on public.homeowner_notification_preferences
for all
to authenticated
using (
    user_id = auth.uid()
    and exists (
        select 1
        from public.property_memberships as membership
        where membership.property_id = homeowner_notification_preferences.property_id
          and membership.user_id = auth.uid()
          and lower(btrim(coalesce(membership.status, ''))) = 'active'
    )
)
with check (
    user_id = auth.uid()
    and exists (
        select 1
        from public.property_memberships as membership
        where membership.property_id = homeowner_notification_preferences.property_id
          and membership.user_id = auth.uid()
          and lower(btrim(coalesce(membership.status, ''))) = 'active'
    )
);

drop policy if exists homeowner_push_devices_own_select on public.homeowner_push_devices;
create policy homeowner_push_devices_own_select
on public.homeowner_push_devices
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists homeowner_push_devices_own_write on public.homeowner_push_devices;
create policy homeowner_push_devices_own_write
on public.homeowner_push_devices
for all
to authenticated
using (user_id = auth.uid())
with check (
    user_id = auth.uid()
    and (
        property_id is null
        or exists (
            select 1
            from public.property_memberships as membership
            where membership.property_id = homeowner_push_devices.property_id
              and membership.user_id = auth.uid()
              and lower(btrim(coalesce(membership.status, ''))) = 'active'
        )
    )
);

drop policy if exists service_notification_deliveries_select_parties on public.service_notification_deliveries;
create policy service_notification_deliveries_select_parties
on public.service_notification_deliveries
for select
to authenticated
using (
    recipient_user_id = auth.uid()
    or public.can_dispatch_company(company_id)
);

create or replace function public.queue_homeowner_notification_deliveries()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_recipient record;
    v_preference public.homeowner_notification_preferences%rowtype;
    v_email text;
    v_phone text;
    v_app_enabled boolean;
    v_sms_enabled boolean;
    v_email_enabled boolean;
    v_push_token_count integer;
begin
    if lower(btrim(coalesce(new.audience, ''))) <> 'homeowner'
       or lower(btrim(coalesce(new.event_visibility, ''))) not in ('homeowner_visible', 'system_homeowner_update') then
        return new;
    end if;

    for v_recipient in
        select
            membership.user_id,
            membership.property_id,
            auth_user.email as auth_email
        from public.property_memberships as membership
        left join auth.users as auth_user
          on auth_user.id = membership.user_id
        where membership.property_id = new.property_id
          and lower(btrim(coalesce(membership.status, ''))) = 'active'
    loop
        select preference.*
        into v_preference
        from public.homeowner_notification_preferences as preference
        where preference.property_id = v_recipient.property_id
          and preference.user_id = v_recipient.user_id
        limit 1;

        v_app_enabled := coalesce(v_preference.app_enabled, true);
        v_sms_enabled := coalesce(v_preference.sms_enabled, false);
        v_email_enabled := coalesce(v_preference.email_enabled, false);
        v_phone := nullif(btrim(coalesce(v_preference.sms_phone, '')), '');
        v_email := coalesce(
            nullif(btrim(coalesce(v_preference.email_address, '')), ''),
            nullif(btrim(coalesce(v_recipient.auth_email, '')), '')
        );

        insert into public.service_notification_deliveries (
            service_request_event_id,
            company_id,
            service_request_id,
            property_id,
            recipient_user_id,
            channel,
            delivery_status,
            dedupe_key,
            metadata,
            sent_at
        )
        values (
            new.id,
            new.company_id,
            new.service_request_id,
            new.property_id,
            v_recipient.user_id,
            'in_app',
            case when v_app_enabled then 'sent' else 'skipped_preference' end,
            'event:' || new.id::text || ':recipient:' || v_recipient.user_id::text || ':channel:in_app',
            jsonb_build_object('source', 'service_request_events'),
            case when v_app_enabled then now() else null end
        )
        on conflict (dedupe_key) do nothing;

        select count(*)
        into v_push_token_count
        from public.homeowner_push_devices as device
        where device.user_id = v_recipient.user_id
          and (device.property_id is null or device.property_id = v_recipient.property_id)
          and lower(btrim(coalesce(device.status, ''))) = 'active'
          and nullif(btrim(coalesce(device.expo_push_token, '')), '') is not null;

        insert into public.service_notification_deliveries (
            service_request_event_id,
            company_id,
            service_request_id,
            property_id,
            recipient_user_id,
            channel,
            delivery_status,
            dedupe_key,
            metadata,
            queued_at
        )
        values (
            new.id,
            new.company_id,
            new.service_request_id,
            new.property_id,
            v_recipient.user_id,
            'push',
            case
                when not v_app_enabled then 'skipped_preference'
                when coalesce(v_push_token_count, 0) = 0 then 'skipped_missing_token'
                else 'queued'
            end,
            'event:' || new.id::text || ':recipient:' || v_recipient.user_id::text || ':channel:push',
            jsonb_build_object('active_token_count', coalesce(v_push_token_count, 0)),
            case when v_app_enabled and coalesce(v_push_token_count, 0) > 0 then now() else null end
        )
        on conflict (dedupe_key) do nothing;

        insert into public.service_notification_deliveries (
            service_request_event_id,
            company_id,
            service_request_id,
            property_id,
            recipient_user_id,
            channel,
            delivery_status,
            dedupe_key,
            metadata,
            queued_at
        )
        values (
            new.id,
            new.company_id,
            new.service_request_id,
            new.property_id,
            v_recipient.user_id,
            'sms',
            case
                when not v_sms_enabled then 'skipped_preference'
                when v_phone is null then 'skipped_missing_contact'
                else 'queued'
            end,
            'event:' || new.id::text || ':recipient:' || v_recipient.user_id::text || ':channel:sms',
            jsonb_build_object('phone_present', v_phone is not null),
            case when v_sms_enabled and v_phone is not null then now() else null end
        )
        on conflict (dedupe_key) do nothing;

        insert into public.service_notification_deliveries (
            service_request_event_id,
            company_id,
            service_request_id,
            property_id,
            recipient_user_id,
            channel,
            delivery_status,
            dedupe_key,
            metadata,
            queued_at
        )
        values (
            new.id,
            new.company_id,
            new.service_request_id,
            new.property_id,
            v_recipient.user_id,
            'email',
            case
                when not v_email_enabled then 'skipped_preference'
                when v_email is null then 'skipped_missing_contact'
                else 'queued'
            end,
            'event:' || new.id::text || ':recipient:' || v_recipient.user_id::text || ':channel:email',
            jsonb_build_object('email_present', v_email is not null),
            case when v_email_enabled and v_email is not null then now() else null end
        )
        on conflict (dedupe_key) do nothing;
    end loop;

    update public.service_request_events as event
    set notification_status = 'pending'
    where event.id = new.id
      and lower(btrim(coalesce(event.notification_status, ''))) in ('not_sent', 'pending');

    return new;
end;
$$;

drop trigger if exists service_request_events_queue_homeowner_deliveries on public.service_request_events;
create trigger service_request_events_queue_homeowner_deliveries
after insert on public.service_request_events
for each row
execute function public.queue_homeowner_notification_deliveries();

drop function if exists public.mark_homeowner_service_notification_read(uuid);

create or replace function public.mark_homeowner_service_notification_read(
    p_event_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_updated_count integer;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_event_id is null then
        raise exception 'Notification event is required.';
    end if;

    update public.service_notification_deliveries as delivery
    set read_at = coalesce(delivery.read_at, now()),
        delivery_status = case
            when lower(btrim(delivery.channel)) = 'in_app'
             and lower(btrim(delivery.delivery_status)) = 'sent'
                then 'delivered'
            else delivery.delivery_status
        end,
        delivered_at = case
            when lower(btrim(delivery.channel)) = 'in_app'
             and lower(btrim(delivery.delivery_status)) = 'sent'
                then coalesce(delivery.delivered_at, now())
            else delivery.delivered_at
        end,
        updated_at = now()
    where delivery.service_request_event_id = p_event_id
      and delivery.recipient_user_id = auth.uid()
      and lower(btrim(delivery.channel)) = 'in_app';

    get diagnostics v_updated_count = row_count;

    return v_updated_count > 0;
end;
$$;

drop function if exists public.get_homeowner_service_request_events(uuid);

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
    created_at timestamptz,
    read_at timestamptz,
    notification_delivery_status text
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
        event.created_at,
        delivery.read_at,
        delivery.delivery_status
    from public.service_request_events as event
    join public.service_requests as request
      on request.id = event.service_request_id
     and request.property_id = event.property_id
    left join public.service_notification_deliveries as delivery
      on delivery.service_request_event_id = event.id
     and delivery.recipient_user_id = auth.uid()
     and lower(btrim(delivery.channel)) = 'in_app'
    where event.service_request_id = p_service_request_id
      and lower(btrim(event.event_visibility)) in ('homeowner_visible', 'system_homeowner_update')
      and lower(btrim(event.audience)) = 'homeowner'
    order by event.created_at asc nulls last, event.id asc;
end;
$$;

drop function if exists public.record_service_request_visit_status(uuid, uuid, uuid, text, text, text, text, jsonb);

create or replace function public.record_service_request_visit_status(
    p_company_id uuid,
    p_service_request_id uuid,
    p_schedule_slot_id uuid,
    p_status text,
    p_status_note text default null,
    p_eta_range text default null,
    p_idempotency_key text default null,
    p_metadata jsonb default '{}'::jsonb
)
returns table (
    service_request_id uuid,
    service_request_status text,
    schedule_slot_id uuid,
    schedule_slot_status text,
    homeowner_event_id uuid,
    homeowner_status text,
    homeowner_message text,
    notification_delivery_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_slot public.job_schedule_slots%rowtype;
    v_actor_company_user public.company_users%rowtype;
    v_status text := lower(btrim(coalesce(p_status, '')));
    v_slot_status text;
    v_request_status text;
    v_previous_slot_status text;
    v_previous_request_status text;
    v_status_note text := nullif(btrim(coalesce(p_status_note, '')), '');
    v_eta_range text := nullif(btrim(coalesce(p_eta_range, '')), '');
    v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
    v_is_dispatch_actor boolean := false;
    v_is_assigned_technician boolean := false;
    v_homeowner_event_type text := null;
    v_homeowner_status text := null;
    v_homeowner_title text := null;
    v_homeowner_message text := null;
    v_internal_dedupe_key text;
    v_homeowner_dedupe_key text;
    v_homeowner_event_id uuid := null;
    v_delivery_count integer := 0;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null or p_schedule_slot_id is null then
        raise exception 'Company, service request, and schedule slot are required.';
    end if;

    if v_status in ('en_route') then
        v_status := 'on_my_way';
    elsif v_status = 'delayed' then
        v_status := 'running_late';
    elsif v_status = 'approval_needed' then
        v_status := 'estimate_needed';
    end if;

    if v_status not in (
        'scheduled',
        'assigned',
        'dispatched',
        'on_my_way',
        'running_late',
        'arriving_soon',
        'arrived',
        'in_progress',
        'estimate_needed',
        'completed'
    ) then
        raise exception 'Invalid service request visit status.';
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
        and v_status in (
            'on_my_way',
            'arrived',
            'in_progress',
            'estimate_needed',
            'completed',
            'running_late',
            'arriving_soon'
        )
    ) then
        raise exception 'Not authorized to update this service visit status.';
    end if;

    if nullif(btrim(coalesce(v_slot.visit_outcome, '')), '') is not null
       or lower(btrim(coalesce(v_slot.status, ''))) in ('completed', 'complete', 'closed', 'done', 'cancelled', 'canceled', 'archived', 'void') then
        raise exception 'Schedule slot is already closed and cannot be updated.';
    end if;

    v_slot_status := v_status;
    v_previous_slot_status := v_slot.status;
    v_previous_request_status := v_request.status;
    v_request_status := case
        when v_status in ('arrived', 'in_progress', 'estimate_needed') then 'in_progress'
        when v_status = 'completed' then 'completed'
        when lower(btrim(coalesce(v_request.status, ''))) in ('new', 'acknowledged', 'assigned', 'dispatched') then 'scheduled'
        else v_request.status
    end;

    update public.job_schedule_slots as slot
    set status = v_slot_status,
        tech_status_note = case when v_status = 'custom' then v_status_note else null end,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where slot.id = p_schedule_slot_id
      and slot.company_id = p_company_id
    returning slot.*
    into v_slot;

    update public.service_requests as request
    set status = v_request_status,
        updated_at = now()
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    returning request.*
    into v_request;

    if coalesce(v_slot.job_id, v_request.converted_job_id) is not null then
        update public.jobs as job
        set status = case
                when v_status = 'completed' then 'completed'
                when v_status in ('arrived', 'in_progress', 'estimate_needed') then 'in_progress'
                else coalesce(nullif(btrim(job.status), ''), 'open')
            end,
            dispatch_status = v_slot_status,
            dispatched_at = case
                when v_status = 'on_my_way' then coalesce(job.dispatched_at, now())
                else job.dispatched_at
            end,
            arrived_at = case
                when v_status = 'arrived' then coalesce(job.arrived_at, now())
                else job.arrived_at
            end,
            completed_at = case
                when v_status = 'completed' then coalesce(job.completed_at, now())
                else job.completed_at
            end,
            updated_at = now()
        where job.id = coalesce(v_slot.job_id, v_request.converted_job_id)
          and job.property_id = v_request.property_id;
    end if;

    v_internal_dedupe_key := 'visit-status:' || p_schedule_slot_id::text || ':' || v_status;

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
        'visit_status_change',
        'Visit status changed to ' || replace(v_status, '_', ' ') || '.',
        'internal',
        'dispatch',
        p_schedule_slot_id,
        auth.uid(),
        v_actor_company_user.id,
        v_internal_dedupe_key,
        jsonb_build_object(
            'status', v_status,
            'previous_request_status', v_previous_request_status,
            'previous_schedule_slot_status', v_previous_slot_status,
            'new_request_status', v_request.status,
            'new_schedule_slot_status', v_slot.status,
            'status_note_present', v_status_note is not null
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

    if v_status = 'scheduled' then
        v_homeowner_event_type := 'appointment_scheduled';
        v_homeowner_status := 'appointment_scheduled';
        v_homeowner_title := 'Appointment Scheduled';
        v_homeowner_message := 'Your appointment has been scheduled.';
    elsif v_status in ('assigned', 'dispatched') then
        v_homeowner_event_type := 'technician_assigned';
        v_homeowner_status := 'technician_assigned';
        v_homeowner_title := 'Technician Assigned';
        v_homeowner_message := 'Your technician, ' || coalesce(nullif(btrim(v_actor_company_user.full_name), ''), 'your technician') || ', has been assigned.';
    elsif v_status = 'on_my_way' then
        v_homeowner_event_type := 'technician_on_the_way';
        v_homeowner_status := 'technician_on_the_way';
        v_homeowner_title := 'Technician On the Way';
        v_homeowner_message := case
            when v_eta_range is not null
                then 'Your technician, ' || coalesce(nullif(btrim(v_actor_company_user.full_name), ''), 'your technician') || ', is on the way and is expected to arrive in approximately ' || v_eta_range || '.'
            else 'Your technician, ' || coalesce(nullif(btrim(v_actor_company_user.full_name), ''), 'your technician') || ', is on the way.'
        end;
    elsif v_status = 'running_late' then
        v_homeowner_event_type := 'technician_delayed';
        v_homeowner_status := 'technician_delayed';
        v_homeowner_title := 'Technician Delayed';
        v_homeowner_message := case
            when v_eta_range is not null
                then 'Your technician has been temporarily delayed. We will update you when travel resumes. Estimated arrival: ' || v_eta_range || '.'
            else 'Your technician has been temporarily delayed. We will update you when travel resumes.'
        end;
    elsif v_status = 'arriving_soon' then
        v_homeowner_event_type := 'technician_arriving_soon';
        v_homeowner_status := 'technician_arriving_soon';
        v_homeowner_title := 'Technician Arriving Soon';
        v_homeowner_message := 'Your technician, ' || coalesce(nullif(btrim(v_actor_company_user.full_name), ''), 'your technician') || ', is arriving soon.';
    elsif v_status = 'arrived' then
        v_homeowner_event_type := 'technician_arrived';
        v_homeowner_status := 'technician_arrived';
        v_homeowner_title := 'Technician Arrived';
        v_homeowner_message := 'Your technician, ' || coalesce(nullif(btrim(v_actor_company_user.full_name), ''), 'your technician') || ', has arrived for your appointment.';
    elsif v_status = 'in_progress' then
        v_homeowner_event_type := 'work_in_progress';
        v_homeowner_status := 'work_in_progress';
        v_homeowner_title := 'Work In Progress';
        v_homeowner_message := 'Work has started on your service request.';
    elsif v_status = 'estimate_needed' then
        v_homeowner_event_type := 'waiting_for_customer_approval';
        v_homeowner_status := 'waiting_for_customer_approval';
        v_homeowner_title := 'Waiting for Customer Approval';
        v_homeowner_message := 'Your technician has sent a recommendation that requires your approval.';
    elsif v_status = 'completed' then
        v_homeowner_event_type := 'work_completed';
        v_homeowner_status := 'work_completed';
        v_homeowner_title := 'Work Completed';
        v_homeowner_message := 'Your service has been completed.';
    end if;

    if v_homeowner_event_type is not null and v_homeowner_message is not null then
        v_homeowner_dedupe_key := coalesce(
            nullif(btrim(coalesce(p_idempotency_key, '')), ''),
            'homeowner-status:' || p_schedule_slot_id::text || ':' || v_status
        );

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
            v_homeowner_event_type,
            v_homeowner_message,
            'system_homeowner_update',
            'homeowner',
            p_schedule_slot_id,
            auth.uid(),
            v_actor_company_user.id,
            v_homeowner_dedupe_key,
            jsonb_build_object(
                'homeowner_status', v_homeowner_status,
                'homeowner_status_title', v_homeowner_title,
                'techos_status', v_status,
                'technician_name', coalesce(nullif(btrim(v_actor_company_user.full_name), ''), null),
                'technician_company_user_id', v_actor_company_user.id,
                'eta_range', v_eta_range,
                'arrival_window_start', v_slot.arrival_window_start,
                'arrival_window_end', v_slot.arrival_window_end,
                'request_status', v_request.status,
                'previous_request_status', v_previous_request_status,
                'previous_schedule_slot_status', v_previous_slot_status,
                'idempotency_key', v_homeowner_dedupe_key
            ) || v_metadata,
            array['in_app', 'push', 'sms', 'email']::text[],
            'pending'
        where not exists (
            select 1
            from public.service_request_events as existing
            where existing.company_id = p_company_id
              and existing.service_request_id = p_service_request_id
              and existing.dedupe_key = v_homeowner_dedupe_key
        )
        returning id
        into v_homeowner_event_id;

        if v_homeowner_event_id is null then
            select existing.id
            into v_homeowner_event_id
            from public.service_request_events as existing
            where existing.company_id = p_company_id
              and existing.service_request_id = p_service_request_id
              and existing.dedupe_key = v_homeowner_dedupe_key
            order by existing.created_at desc nulls last
            limit 1;
        end if;

        select count(*)
        into v_delivery_count
        from public.service_notification_deliveries as delivery
        where delivery.service_request_event_id = v_homeowner_event_id;
    end if;

    return query
    select
        v_request.id,
        v_request.status,
        v_slot.id,
        v_slot.status,
        v_homeowner_event_id,
        v_homeowner_status,
        v_homeowner_message,
        coalesce(v_delivery_count, 0);
end;
$$;

revoke all on function public.queue_homeowner_notification_deliveries() from public;
revoke all on function public.queue_homeowner_notification_deliveries() from anon;

revoke all on function public.mark_homeowner_service_notification_read(uuid) from public;
revoke all on function public.mark_homeowner_service_notification_read(uuid) from anon;
grant execute on function public.mark_homeowner_service_notification_read(uuid) to authenticated;

revoke all on function public.get_homeowner_service_request_events(uuid) from public;
revoke all on function public.get_homeowner_service_request_events(uuid) from anon;
grant execute on function public.get_homeowner_service_request_events(uuid) to authenticated;

revoke all on function public.record_service_request_visit_status(uuid, uuid, uuid, text, text, text, text, jsonb) from public;
revoke all on function public.record_service_request_visit_status(uuid, uuid, uuid, text, text, text, text, jsonb) from anon;
grant execute on function public.record_service_request_visit_status(uuid, uuid, uuid, text, text, text, text, jsonb) to authenticated;

commit;
