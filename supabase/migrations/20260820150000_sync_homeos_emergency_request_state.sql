-- Keep linked HomeOS emergency records and homeowner service requests in one
-- lifecycle. This is additive and never deletes, moves, or merges records.
begin;

alter table public.home_emergencies
    add column if not exists service_request_id uuid references public.service_requests(id) on delete set null,
    add column if not exists service_request_company_id uuid references public.companies(id) on delete set null,
    add column if not exists service_request_sent_at timestamptz;

create index if not exists home_emergencies_service_request_id_idx
    on public.home_emergencies(service_request_id)
    where service_request_id is not null;

create or replace function public.ensure_home_emergency_for_service_request(
    p_service_request_id uuid
)
returns table (id uuid, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_emergency public.home_emergencies%rowtype;
begin
    if auth.uid() is null or p_service_request_id is null then
        raise exception 'An authenticated emergency service request is required.';
    end if;

    select request.* into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
    for update;

    if not found or not public.homeos_can_mutate_property_record(v_request.property_id, auth.uid()) then
        raise exception 'Not authorized to link this HomeOS emergency.';
    end if;

    if lower(btrim(coalesce(v_request.request_type, ''))) <> 'emergency'
       and lower(btrim(coalesce(v_request.priority, ''))) <> 'emergency' then
        raise exception 'Only emergency service requests can be added to Emergency Center.';
    end if;

    -- Serializes retries and concurrent taps without imposing a destructive
    -- uniqueness rule on preserved legacy emergency records.
    perform pg_advisory_xact_lock(hashtextextended(p_service_request_id::text, 0));

    select emergency.* into v_emergency
    from public.home_emergencies as emergency
    where emergency.service_request_id = p_service_request_id
    order by emergency.created_at asc nulls last, emergency.id asc
    limit 1;

    if found then
        return query select v_emergency.id, false;
        return;
    end if;

    insert into public.home_emergencies (
        user_id,
        property_id,
        emergency_type,
        area,
        description,
        status,
        photo_urls,
        video_urls,
        history,
        created_at,
        updated_at,
        service_request_id,
        service_request_company_id,
        service_request_sent_at
    ) values (
        auth.uid(),
        v_request.property_id,
        'Emergency service request',
        'Location not confirmed',
        coalesce(nullif(btrim(v_request.issue_summary), ''), 'Emergency service requested.'),
        'Reported',
        array[]::text[],
        array[]::text[],
        '[]'::jsonb,
        now(),
        now(),
        v_request.id,
        v_request.company_id,
        coalesce(v_request.created_at, now())
    ) returning * into v_emergency;

    return query select v_emergency.id, true;
end;
$$;

revoke all on function public.ensure_home_emergency_for_service_request(uuid) from public, anon;
grant execute on function public.ensure_home_emergency_for_service_request(uuid) to authenticated;

create or replace function public.resolve_home_emergency_and_linked_request(
    p_emergency_id uuid,
    p_property_id uuid,
    p_history jsonb default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_emergency public.home_emergencies%rowtype;
begin
    if auth.uid() is null or p_emergency_id is null or p_property_id is null then
        raise exception 'An authenticated property emergency is required.';
    end if;

    select emergency.* into v_emergency
    from public.home_emergencies as emergency
    where emergency.id = p_emergency_id
      and emergency.property_id = p_property_id
    for update;

    if not found or not public.homeos_can_mutate_property_record(p_property_id, auth.uid()) then
        raise exception 'Not authorized to resolve this HomeOS emergency.';
    end if;

    update public.home_emergencies
    set status = 'Resolved',
        resolved_at = coalesce(resolved_at, now()),
        updated_at = now(),
        history = coalesce(p_history, history)
    where id = v_emergency.id;

    if v_emergency.service_request_id is not null then
        update public.service_requests as request
        set status = 'cancelled',
            cancelled_at = coalesce(request.cancelled_at, now()),
            closed_at = coalesce(request.closed_at, now()),
            updated_at = now()
        where request.id = v_emergency.service_request_id
          and request.property_id = p_property_id
          and lower(btrim(coalesce(request.status, ''))) not in ('cancelled', 'canceled', 'closed', 'complete', 'completed', 'done', 'resolved', 'void');
    end if;
end;
$$;

revoke all on function public.resolve_home_emergency_and_linked_request(uuid, uuid, jsonb) from public, anon;
grant execute on function public.resolve_home_emergency_and_linked_request(uuid, uuid, jsonb) to authenticated;

create or replace function public.sync_homeos_emergency_from_service_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_status text := lower(btrim(coalesce(new.status, '')));
begin
    if v_status not in ('cancelled', 'canceled', 'closed', 'complete', 'completed', 'done', 'resolved', 'void') then
        return new;
    end if;

    update public.home_emergencies as emergency
    set status = 'Resolved',
        resolved_at = coalesce(emergency.resolved_at, now()),
        updated_at = now()
    where emergency.service_request_id = new.id
      and emergency.property_id = new.property_id
      and lower(btrim(coalesce(emergency.status, ''))) not in ('resolved', 'cancelled', 'canceled', 'closed', 'complete', 'completed', 'done', 'void');

    return new;
end;
$$;

drop trigger if exists sync_homeos_emergency_from_service_request on public.service_requests;
create trigger sync_homeos_emergency_from_service_request
after insert or update of status on public.service_requests
for each row execute function public.sync_homeos_emergency_from_service_request();

create or replace function public.sync_service_request_from_terminal_homeowner_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_event_type text := lower(btrim(coalesce(new.event_type, '')));
    v_status text;
begin
    v_status := case
        when v_event_type in ('work_completed', 'work_completed_rating_requested') then 'completed'
        when v_event_type in ('request_cancelled', 'appointment_cancelled') then 'cancelled'
        else null
    end;

    if v_status is null then
        return new;
    end if;

    update public.service_requests as request
    set status = v_status,
        closed_at = case when v_status in ('completed', 'cancelled') then coalesce(request.closed_at, now()) else request.closed_at end,
        updated_at = now()
    where request.id = new.service_request_id
      and request.property_id = new.property_id
      and lower(btrim(coalesce(request.status, ''))) not in ('cancelled', 'canceled', 'closed', 'complete', 'completed', 'done', 'resolved', 'void');

    return new;
end;
$$;

drop trigger if exists sync_service_request_from_terminal_homeowner_event on public.service_request_events;
create trigger sync_service_request_from_terminal_homeowner_event
after insert on public.service_request_events
for each row execute function public.sync_service_request_from_terminal_homeowner_event();

-- Conservatively reconcile only already-linked records. Unlinked or uncertain
-- emergencies are intentionally left untouched.
update public.home_emergencies as emergency
set status = 'Resolved',
    resolved_at = coalesce(emergency.resolved_at, now()),
    updated_at = now()
from public.service_requests as request
where emergency.service_request_id = request.id
  and emergency.property_id = request.property_id
  and lower(btrim(coalesce(request.status, ''))) in ('cancelled', 'canceled', 'closed', 'complete', 'completed', 'done', 'resolved', 'void')
  and lower(btrim(coalesce(emergency.status, ''))) not in ('resolved', 'cancelled', 'canceled', 'closed', 'complete', 'completed', 'done', 'void');

commit;
