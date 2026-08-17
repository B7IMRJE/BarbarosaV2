-- Keep an assigned emergency in the Emergency queue until the assigned
-- technician explicitly accepts it. Acceptance is distinct from On My Way.

begin;

do $$
begin
    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before emergency acceptance can be installed.';
    end if;

    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before emergency acceptance can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before emergency acceptance can be installed.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before emergency acceptance can be installed.';
    end if;
end;
$$;

alter table public.job_schedule_slots
    add column if not exists technician_acknowledged_at timestamptz,
    add column if not exists technician_acknowledged_by_user_id uuid;

do $$
begin
    if not exists (
        select 1
        from pg_catalog.pg_constraint as constraint_record
        where constraint_record.conrelid = 'public.job_schedule_slots'::regclass
          and constraint_record.conname = 'job_schedule_slots_technician_acknowledged_by_fkey'
    ) then
        alter table public.job_schedule_slots
            add constraint job_schedule_slots_technician_acknowledged_by_fkey
            foreign key (technician_acknowledged_by_user_id)
            references auth.users(id)
            on delete set null;
    end if;
end;
$$;

create index if not exists job_schedule_slots_emergency_acceptance_idx
    on public.job_schedule_slots (company_id, service_request_id, technician_acknowledged_at)
    where technician_company_user_id is not null;

comment on column public.job_schedule_slots.technician_acknowledged_at is
    'When the assigned technician explicitly accepted an emergency assignment. Null means acceptance is pending.';

comment on column public.job_schedule_slots.technician_acknowledged_by_user_id is
    'Authenticated user who explicitly accepted the emergency assignment.';

-- Existing operational field states are evidence that the assigned technician
-- already acted on the visit. Preserve those jobs instead of moving them back
-- into pending acceptance when this migration is installed.
update public.job_schedule_slots as slot
set technician_acknowledged_at = coalesce(slot.updated_at, slot.start_at, slot.created_at, now()),
    technician_acknowledged_by_user_id = (
        select company_user.auth_user_id
        from public.company_users as company_user
        where company_user.id = slot.technician_company_user_id
          and company_user.company_id = slot.company_id
        limit 1
    )
from public.service_requests as request
where request.id = slot.service_request_id
  and request.company_id = slot.company_id
  and slot.technician_company_user_id is not null
  and slot.technician_acknowledged_at is null
  and (
      lower(btrim(coalesce(request.request_type, ''))) = 'emergency'
      or lower(btrim(coalesce(request.priority, ''))) = 'emergency'
      or lower(btrim(coalesce(slot.priority, ''))) = 'emergency'
      or lower(coalesce(request.issue_summary, '')) like '%emergency%'
  )
  and lower(btrim(coalesce(slot.status, ''))) in (
      'on_my_way',
      'arriving_soon',
      'arrived',
      'in_progress',
      'estimate_needed',
      'running_late',
      'working',
      'custom',
      'completed'
  );

create or replace function public.guard_emergency_assignment_acceptance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_is_emergency boolean := false;
    v_acceptance_guard text := current_setting('homeos.emergency_acceptance_slot_id', true);
    v_next_status text := lower(btrim(coalesce(new.status, '')));
begin
    if tg_op = 'INSERT' then
        new.technician_acknowledged_at := null;
        new.technician_acknowledged_by_user_id := null;
        return new;
    end if;

    if new.technician_company_user_id is distinct from old.technician_company_user_id then
        new.technician_acknowledged_at := null;
        new.technician_acknowledged_by_user_id := null;
    elsif new.technician_acknowledged_at is distinct from old.technician_acknowledged_at
       or new.technician_acknowledged_by_user_id is distinct from old.technician_acknowledged_by_user_id then
        if coalesce(v_acceptance_guard, '') <> old.id::text then
            raise exception 'Emergency acceptance must use the assigned technician acceptance action.';
        end if;
    end if;

    select exists (
        select 1
        from public.service_requests as request
        where request.id = new.service_request_id
          and request.company_id = new.company_id
          and (
              lower(btrim(coalesce(request.request_type, ''))) = 'emergency'
              or lower(btrim(coalesce(request.priority, ''))) = 'emergency'
              or lower(btrim(coalesce(new.priority, ''))) = 'emergency'
              or lower(coalesce(request.issue_summary, '')) like '%emergency%'
          )
    )
    into v_is_emergency;

    if v_is_emergency
       and new.technician_company_user_id is not null
       and new.technician_acknowledged_at is null
       and new.status is distinct from old.status
       and v_next_status not in (
           'tentative',
           'scheduled',
           'assigned',
           'dispatched',
           'cancelled',
           'canceled',
           'archived',
           'closed',
           'void'
       ) then
        raise exception 'The assigned technician must accept this emergency before updating travel or work status.';
    end if;

    return new;
end;
$$;

revoke all on function public.guard_emergency_assignment_acceptance() from public, anon, authenticated;

drop trigger if exists job_schedule_slots_guard_emergency_acceptance on public.job_schedule_slots;
create trigger job_schedule_slots_guard_emergency_acceptance
before insert or update of technician_company_user_id, technician_acknowledged_at, technician_acknowledged_by_user_id, status
on public.job_schedule_slots
for each row
execute function public.guard_emergency_assignment_acceptance();

drop function if exists public.accept_emergency_assignment(uuid, uuid, uuid);

create function public.accept_emergency_assignment(
    p_company_id uuid,
    p_service_request_id uuid,
    p_schedule_slot_id uuid
)
returns table (
    schedule_slot_id uuid,
    service_request_id uuid,
    technician_acknowledged_at timestamptz,
    technician_acknowledged_by_user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_slot public.job_schedule_slots%rowtype;
    v_actor public.company_users%rowtype;
    v_is_emergency boolean := false;
    v_technician_name text;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null or p_schedule_slot_id is null then
        raise exception 'Company, service request, and schedule slot are required.';
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
        raise exception 'Schedule slot not found for this emergency.';
    end if;

    select company_user.*
    into v_actor
    from public.company_users as company_user
    where company_user.id = v_slot.technician_company_user_id
      and company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    limit 1;

    if not found then
        raise exception 'Only the active technician assigned to this emergency can accept it.';
    end if;

    v_is_emergency := (
        lower(btrim(coalesce(v_request.request_type, ''))) = 'emergency'
        or lower(btrim(coalesce(v_request.priority, ''))) = 'emergency'
        or lower(btrim(coalesce(v_slot.priority, ''))) = 'emergency'
        or lower(coalesce(v_request.issue_summary, '')) like '%emergency%'
    );

    if not v_is_emergency then
        raise exception 'This assignment is not categorized as an emergency.';
    end if;

    if v_slot.visit_closed_at is not null
       or nullif(btrim(coalesce(v_slot.visit_outcome, '')), '') is not null
       or lower(btrim(coalesce(v_slot.status, ''))) in (
           'completed', 'closed', 'cancelled', 'canceled', 'archived', 'void'
       ) then
        raise exception 'This emergency assignment is already closed.';
    end if;

    if v_slot.technician_acknowledged_at is null then
        perform set_config('homeos.emergency_acceptance_slot_id', v_slot.id::text, true);

        update public.job_schedule_slots as slot
        set technician_acknowledged_at = now(),
            technician_acknowledged_by_user_id = auth.uid(),
            updated_by_user_id = auth.uid(),
            updated_at = now()
        where slot.id = v_slot.id
          and slot.company_id = p_company_id
        returning slot.*
        into v_slot;
    end if;

    v_technician_name := coalesce(nullif(btrim(v_actor.full_name), ''), 'Your technician');

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
        v_request.id,
        v_request.company_id,
        v_request.property_id,
        auth.uid(),
        'technician_emergency_assignment_accepted',
        v_technician_name || ' accepted the emergency assignment.',
        'internal',
        'dispatch',
        v_slot.id,
        auth.uid(),
        v_actor.id,
        'emergency-accepted:dispatch:' || v_slot.id::text,
        jsonb_build_object(
            'source', 'techos',
            'emergency_assignment_status', 'accepted',
            'technician_company_user_id', v_actor.id,
            'technician_name', v_technician_name,
            'technician_acknowledged_at', v_slot.technician_acknowledged_at
        ),
        array['in_app']::text[],
        'not_sent'
    where not exists (
        select 1
        from public.service_request_events as existing
        where existing.company_id = v_request.company_id
          and existing.service_request_id = v_request.id
          and existing.dedupe_key = 'emergency-accepted:dispatch:' || v_slot.id::text
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
        v_request.id,
        v_request.company_id,
        v_request.property_id,
        auth.uid(),
        'technician_assigned',
        v_technician_name || ' accepted your emergency assignment. We will update you again when travel begins.',
        'system_homeowner_update',
        'homeowner',
        v_slot.id,
        auth.uid(),
        v_actor.id,
        'emergency-accepted:homeowner:' || v_slot.id::text,
        jsonb_build_object(
            'homeowner_status', 'technician_assigned',
            'homeowner_status_title', 'Emergency Technician Accepted',
            'source', 'techos',
            'emergency_assignment_status', 'accepted',
            'technician_company_user_id', v_actor.id,
            'technician_name', v_technician_name,
            'technician_acknowledged_at', v_slot.technician_acknowledged_at
        ),
        array['in_app', 'push', 'sms', 'email']::text[],
        'pending'
    where not exists (
        select 1
        from public.service_request_events as existing
        where existing.company_id = v_request.company_id
          and existing.service_request_id = v_request.id
          and existing.dedupe_key = 'emergency-accepted:homeowner:' || v_slot.id::text
    );

    return query
    select
        v_slot.id,
        v_request.id,
        v_slot.technician_acknowledged_at,
        v_slot.technician_acknowledged_by_user_id;
end;
$$;

revoke all on function public.accept_emergency_assignment(uuid, uuid, uuid) from public, anon;
grant execute on function public.accept_emergency_assignment(uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
