-- Preserve provable legacy assignments without inventing technician acceptance.
-- No created_at/date cutoff: request age does not prove assignment age.
begin;

-- Keep the one-time evidence snapshot and both reset guards atomic with respect
-- to assignment changes. Apply in a quiet window; a lock/deadlock failure must
-- roll back and be retried, never bypassed by disabling existing guards.
lock table public.job_schedule_slots in access exclusive mode;
lock table public.job_schedule_slot_assignments in share row exclusive mode;

alter table public.job_schedule_slots
    add column emergency_acceptance_compatibility text
    check (emergency_acceptance_compatibility = 'existing_lead_activity');

comment on column public.job_schedule_slots.emergency_acceptance_compatibility is
    'One-time legacy compatibility evidence, not a technician acknowledgement. Cleared on assignment/context changes; never sets acknowledgement actor/time or sends acceptance notifications.';

-- The original migration has no applied_at timestamp. Its tuple xid is not
-- commit order and cannot prove that an assignment existed at installation.
-- Therefore this automatic pass does NOT grandfather assigned/scheduled rows
-- merely because their request, slot, assigned_at, or xmin looks old.
--
-- A future separately reviewed migration can extend eligibility only
-- with authoritative deployment/assignment evidence. For now, keep those
-- uncertain assignments explicit-acceptance-required with a reachable button.
-- Preserve only existing recorded activity by this lead during this assignment.
update public.job_schedule_slots as slot
set emergency_acceptance_compatibility = 'existing_lead_activity'
from public.job_schedule_slot_assignments as assignment, public.service_requests as request
where request.id = slot.service_request_id
  and request.company_id = slot.company_id
  and assignment.schedule_slot_id = slot.id
  and assignment.company_id = slot.company_id
  and assignment.company_user_id = slot.technician_company_user_id
  and lower(btrim(assignment.role_on_schedule)) = 'lead'
  and lower(btrim(assignment.status)) <> 'removed'
  and slot.technician_acknowledged_at is null
  and (
      lower(btrim(coalesce(request.request_type, ''))) = 'emergency'
      or lower(btrim(coalesce(request.priority, ''))) = 'emergency'
      or lower(btrim(coalesce(slot.priority, ''))) = 'emergency'
      or lower(coalesce(request.issue_summary, '')) like '%emergency%'
  )
  and exists (
      select 1 from public.service_request_events as event
      where event.company_id = slot.company_id
        and event.service_request_id = slot.service_request_id
        and event.schedule_slot_id = slot.id
        and event.actor_company_user_id = slot.technician_company_user_id
        and event.event_type = 'visit_status_change'
        and event.created_at >= assignment.assigned_at
        -- Corroborate the assignment timestamp with tuple order. Strict ordering
        -- excludes ambiguous same-transaction reassignments and changed history;
        -- it is NOT being used to infer a deployment/commit timestamp.
        and event.xmin::text::bigint >= 3 and assignment.xmin::text::bigint >= 3
        and age(event.xmin) >= 0 and age(assignment.xmin) >= 0
        and age(event.xmin) < age(assignment.xmin)
        and lower(btrim(event.metadata->>'new_schedule_slot_status')) in (
            'on_my_way', 'arriving_soon', 'arrived', 'in_progress',
            'estimate_needed', 'running_late', 'working', 'completed'
        )
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
    v_reset_guard text := current_setting('homeos.emergency_assignment_reset_slot_id', true);
    v_next_status text := lower(btrim(coalesce(new.status, '')));
    v_assignment_changed boolean := false;
begin
    if tg_op = 'INSERT' then
        new.technician_acknowledged_at := null;
        new.technician_acknowledged_by_user_id := null;
        new.emergency_acceptance_compatibility := null;
    else
        v_assignment_changed := new.technician_company_user_id is distinct from old.technician_company_user_id
            or new.service_request_id is distinct from old.service_request_id
            or new.company_id is distinct from old.company_id;
        if v_assignment_changed then
            new.technician_acknowledged_at := null;
            new.technician_acknowledged_by_user_id := null;
            new.emergency_acceptance_compatibility := null;
        else
            if new.emergency_acceptance_compatibility is distinct from old.emergency_acceptance_compatibility
               and new.emergency_acceptance_compatibility is not null then
                raise exception 'Legacy compatibility cannot be granted by an assignment update.';
            end if;
            if new.technician_acknowledged_at is distinct from old.technician_acknowledged_at
               or new.technician_acknowledged_by_user_id is distinct from old.technician_acknowledged_by_user_id then
                if coalesce(v_acceptance_guard, '') <> old.id::text
                   and not (coalesce(v_reset_guard, '') = old.id::text
                       and new.technician_acknowledged_at is null
                       and new.technician_acknowledged_by_user_id is null) then
                    raise exception 'Emergency acceptance must use the assigned technician acceptance action.';
                end if;
            end if;
        end if;
    end if;

    select exists (
        select 1 from public.service_requests as request
        where request.id = new.service_request_id and request.company_id = new.company_id
          and (lower(btrim(coalesce(request.request_type, ''))) = 'emergency'
            or lower(btrim(coalesce(request.priority, ''))) = 'emergency'
            or lower(btrim(coalesce(new.priority, ''))) = 'emergency'
            or lower(coalesce(request.issue_summary, '')) like '%emergency%')
    ) into v_is_emergency;

    -- Dispatch may change a lead without also changing the old travel/work
    -- status. Complete that reassignment in the pending state rather than
    -- rejecting the assignment or inheriting the previous lead's work state.
    if tg_op = 'UPDATE' and v_is_emergency
       and new.technician_company_user_id is not null
       and new.technician_acknowledged_at is null
       and new.emergency_acceptance_compatibility is null
       and (v_assignment_changed or coalesce(v_reset_guard, '') = old.id::text)
       and new.status is not distinct from old.status
       and v_next_status not in (
           '', 'tentative', 'scheduled', 'assigned', 'dispatched',
           'completed', 'complete', 'done', 'cancelled', 'canceled', 'archived', 'closed', 'void'
       ) then
        new.status := 'assigned';
        v_next_status := 'assigned';
    end if;

    if v_is_emergency and new.technician_company_user_id is not null
       and new.technician_acknowledged_at is null
       and new.emergency_acceptance_compatibility is null
       and (tg_op = 'INSERT' or v_assignment_changed or new.status is distinct from old.status)
       and v_next_status not in (
           '', 'tentative', 'scheduled', 'assigned', 'dispatched',
           'cancelled', 'canceled', 'archived', 'closed', 'void'
       ) then
        raise exception 'The assigned technician must accept this emergency before updating travel or work status.';
    end if;
    return new;
end;
$$;

revoke all on function public.guard_emergency_assignment_acceptance() from public, anon, authenticated;
drop trigger if exists job_schedule_slots_guard_emergency_acceptance on public.job_schedule_slots;
create trigger job_schedule_slots_guard_emergency_acceptance
before insert or update on public.job_schedule_slots
for each row execute function public.guard_emergency_assignment_acceptance();

-- Re-adding/re-assigning even the SAME lead must not inherit legacy eligibility
-- or a previous acknowledgement. Changing primary lead also clears them in the
-- slot guard above. Ordinary notes/status changes do not reset the assignment.
create or replace function public.reset_emergency_acceptance_on_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_slot_id uuid;
    v_company_id uuid;
    v_lead_id uuid;
    v_previous_guard text := current_setting('homeos.emergency_assignment_reset_slot_id', true);
begin
    if tg_op = 'UPDATE' and new.assigned_at is not distinct from old.assigned_at
       and new.status is not distinct from old.status
       and new.company_user_id is not distinct from old.company_user_id
       and new.role_on_schedule is not distinct from old.role_on_schedule
       and new.schedule_slot_id is not distinct from old.schedule_slot_id
       and new.company_id is not distinct from old.company_id then
        return new;
    end if;

    -- Clear the prior binding on removal/movement and the new binding on insert.
    for v_slot_id, v_company_id, v_lead_id in
        select old.schedule_slot_id, old.company_id, old.company_user_id where tg_op <> 'INSERT'
        union
        select new.schedule_slot_id, new.company_id, new.company_user_id where tg_op <> 'DELETE'
    loop
        perform set_config('homeos.emergency_assignment_reset_slot_id', v_slot_id::text, true);
        update public.job_schedule_slots as slot
        set emergency_acceptance_compatibility = null,
            technician_acknowledged_at = null,
            technician_acknowledged_by_user_id = null
        where slot.id = v_slot_id and slot.company_id = v_company_id
          and slot.technician_company_user_id = v_lead_id
          and (slot.emergency_acceptance_compatibility is not null or slot.technician_acknowledged_at is not null);
    end loop;
    perform set_config('homeos.emergency_assignment_reset_slot_id', coalesce(v_previous_guard, ''), true);
    return coalesce(new, old);
end;
$$;

revoke all on function public.reset_emergency_acceptance_on_lead_assignment() from public, anon, authenticated;
create trigger job_schedule_slot_assignments_reset_emergency_acceptance
after insert or update or delete on public.job_schedule_slot_assignments
for each row execute function public.reset_emergency_acceptance_on_lead_assignment();

notify pgrst, 'reload schema';
commit;
