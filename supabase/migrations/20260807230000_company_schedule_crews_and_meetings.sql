-- Add multi-person crews to scheduled service visits and first-class internal
-- meetings to the company schedule. The legacy technician column remains the
-- lead technician so existing Dispatch, homeowner, and closeout workflows keep
-- one authoritative owner.

begin;

do $$
begin
    if to_regclass('public.job_schedule_slots') is null
        or to_regclass('public.company_users') is null
        or to_regclass('public.companies') is null then
        raise exception 'Company users and job schedule slots are required before schedule crews and meetings can be installed.';
    end if;
end;
$$;

create table if not exists public.job_schedule_slot_assignments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    schedule_slot_id uuid not null references public.job_schedule_slots(id) on delete cascade,
    company_user_id uuid not null references public.company_users(id) on delete cascade,
    role_on_schedule text not null default 'technician',
    status text not null default 'assigned',
    assigned_by_user_id uuid null references auth.users(id) on delete set null,
    assigned_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint job_schedule_slot_assignments_role_check
        check (lower(btrim(role_on_schedule)) in ('lead', 'technician', 'helper', 'observer')),
    constraint job_schedule_slot_assignments_status_check
        check (lower(btrim(status)) in ('assigned', 'accepted', 'removed'))
);

create unique index if not exists job_schedule_slot_assignments_active_member_idx
on public.job_schedule_slot_assignments (schedule_slot_id, company_user_id)
where lower(btrim(status)) <> 'removed';

create unique index if not exists job_schedule_slot_assignments_one_lead_idx
on public.job_schedule_slot_assignments (schedule_slot_id)
where lower(btrim(status)) <> 'removed'
  and lower(btrim(role_on_schedule)) = 'lead';

create index if not exists job_schedule_slot_assignments_company_user_idx
on public.job_schedule_slot_assignments (company_id, company_user_id, schedule_slot_id)
where lower(btrim(status)) <> 'removed';

insert into public.job_schedule_slot_assignments (
    company_id,
    schedule_slot_id,
    company_user_id,
    role_on_schedule,
    status,
    assigned_by_user_id
)
select
    slot.company_id,
    slot.id,
    slot.technician_company_user_id,
    'lead',
    'assigned',
    slot.updated_by_user_id
from public.job_schedule_slots as slot
where slot.technician_company_user_id is not null
on conflict (schedule_slot_id, company_user_id)
where lower(btrim(status)) <> 'removed'
do update set
    role_on_schedule = 'lead',
    status = 'assigned',
    updated_at = now();

create table if not exists public.company_schedule_meetings (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    title text not null,
    notes text null,
    start_at timestamptz not null,
    end_at timestamptz not null,
    status text not null default 'scheduled',
    created_by_user_id uuid null references auth.users(id) on delete set null,
    completed_by_user_id uuid null references auth.users(id) on delete set null,
    completed_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_schedule_meetings_title_check
        check (char_length(btrim(title)) between 1 and 200),
    constraint company_schedule_meetings_time_check
        check (end_at > start_at),
    constraint company_schedule_meetings_status_check
        check (lower(btrim(status)) in ('scheduled', 'completed', 'cancelled'))
);

create index if not exists company_schedule_meetings_company_start_idx
on public.company_schedule_meetings (company_id, start_at);

create table if not exists public.company_schedule_meeting_attendees (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    meeting_id uuid not null references public.company_schedule_meetings(id) on delete cascade,
    company_user_id uuid not null references public.company_users(id) on delete cascade,
    attendee_role text not null default 'attendee',
    attendance_status text not null default 'scheduled',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_schedule_meeting_attendees_role_check
        check (lower(btrim(attendee_role)) in ('organizer', 'attendee', 'optional')),
    constraint company_schedule_meeting_attendees_status_check
        check (lower(btrim(attendance_status)) in ('scheduled', 'attended', 'declined')),
    constraint company_schedule_meeting_attendees_unique
        unique (meeting_id, company_user_id)
);

create index if not exists company_schedule_meeting_attendees_company_user_idx
on public.company_schedule_meeting_attendees (company_id, company_user_id, meeting_id);

create or replace function public.can_manage_company_schedule(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and (
            public.is_platform_admin()
            or public.can_manage_company_users(p_company_id)
            or public.can_dispatch_company(p_company_id)
            or exists (
                select 1
                from public.company_users as company_user
                where company_user.company_id = p_company_id
                  and company_user.auth_user_id = auth.uid()
                  and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                  and lower(btrim(coalesce(company_user.role, ''))) in (
                      'owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor'
                  )
            )
       );
$$;

alter table public.job_schedule_slot_assignments enable row level security;
alter table public.company_schedule_meetings enable row level security;
alter table public.company_schedule_meeting_attendees enable row level security;

grant select on table public.job_schedule_slot_assignments to authenticated;
grant select on table public.company_schedule_meetings to authenticated;
grant select on table public.company_schedule_meeting_attendees to authenticated;

drop policy if exists job_schedule_slot_assignments_company_schedule_select on public.job_schedule_slot_assignments;
create policy job_schedule_slot_assignments_company_schedule_select
on public.job_schedule_slot_assignments
for select
to authenticated
using (
    public.can_manage_company_schedule(company_id)
    or exists (
        select 1
        from public.company_users as company_user
        where company_user.id = job_schedule_slot_assignments.company_user_id
          and company_user.company_id = job_schedule_slot_assignments.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
);

drop policy if exists company_schedule_meetings_company_schedule_select on public.company_schedule_meetings;
create policy company_schedule_meetings_company_schedule_select
on public.company_schedule_meetings
for select
to authenticated
using (
    public.can_manage_company_schedule(company_id)
    or exists (
        select 1
        from public.company_schedule_meeting_attendees as attendee
        join public.company_users as company_user
          on company_user.id = attendee.company_user_id
         and company_user.company_id = attendee.company_id
        where attendee.meeting_id = company_schedule_meetings.id
          and attendee.company_id = company_schedule_meetings.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
);

drop policy if exists company_schedule_meeting_attendees_company_schedule_select on public.company_schedule_meeting_attendees;
create policy company_schedule_meeting_attendees_company_schedule_select
on public.company_schedule_meeting_attendees
for select
to authenticated
using (
    public.can_manage_company_schedule(company_id)
    or exists (
        select 1
        from public.company_users as company_user
        where company_user.id = company_schedule_meeting_attendees.company_user_id
          and company_user.company_id = company_schedule_meeting_attendees.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
);

drop policy if exists job_schedule_slots_crew_member_select on public.job_schedule_slots;
create policy job_schedule_slots_crew_member_select
on public.job_schedule_slots
for select
to authenticated
using (
    exists (
        select 1
        from public.job_schedule_slot_assignments as assignment
        join public.company_users as company_user
          on company_user.id = assignment.company_user_id
         and company_user.company_id = assignment.company_id
        where assignment.schedule_slot_id = job_schedule_slots.id
          and assignment.company_id = job_schedule_slots.company_id
          and lower(btrim(assignment.status)) <> 'removed'
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
);

drop policy if exists service_requests_schedule_crew_member_select on public.service_requests;
create policy service_requests_schedule_crew_member_select
on public.service_requests
for select
to authenticated
using (
    exists (
        select 1
        from public.job_schedule_slots as slot
        join public.job_schedule_slot_assignments as assignment
          on assignment.schedule_slot_id = slot.id
         and assignment.company_id = slot.company_id
         and lower(btrim(assignment.status)) <> 'removed'
        join public.company_users as company_user
          on company_user.id = assignment.company_user_id
         and company_user.company_id = assignment.company_id
        where slot.service_request_id = service_requests.id
          and slot.company_id = service_requests.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
);

create or replace function public.sync_job_schedule_slot_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_new_member_already_assigned boolean := false;
begin
    if new.technician_company_user_id is null then
        return new;
    end if;

    if tg_op = 'UPDATE' and old.technician_company_user_id is not distinct from new.technician_company_user_id then
        return new;
    end if;

    select exists (
        select 1
        from public.job_schedule_slot_assignments as assignment
        where assignment.schedule_slot_id = new.id
          and assignment.company_id = new.company_id
          and assignment.company_user_id = new.technician_company_user_id
          and lower(btrim(assignment.status)) <> 'removed'
    ) into v_new_member_already_assigned;

    if tg_op = 'UPDATE' and not v_new_member_already_assigned then
        update public.job_schedule_slot_assignments
        set status = 'removed',
            updated_at = now()
        where schedule_slot_id = new.id
          and company_id = new.company_id
          and lower(btrim(status)) <> 'removed';
    else
        update public.job_schedule_slot_assignments
        set role_on_schedule = 'technician',
            updated_at = now()
        where schedule_slot_id = new.id
          and company_id = new.company_id
          and company_user_id <> new.technician_company_user_id
          and lower(btrim(status)) <> 'removed'
          and lower(btrim(role_on_schedule)) = 'lead';
    end if;

    insert into public.job_schedule_slot_assignments (
        company_id,
        schedule_slot_id,
        company_user_id,
        role_on_schedule,
        status,
        assigned_by_user_id
    )
    values (
        new.company_id,
        new.id,
        new.technician_company_user_id,
        'lead',
        'assigned',
        coalesce(new.updated_by_user_id, new.created_by_user_id, auth.uid())
    )
    on conflict (schedule_slot_id, company_user_id)
    where lower(btrim(status)) <> 'removed'
    do update set
        role_on_schedule = 'lead',
        status = 'assigned',
        assigned_by_user_id = excluded.assigned_by_user_id,
        assigned_at = now(),
        updated_at = now();

    return new;
end;
$$;

drop trigger if exists job_schedule_slots_sync_lead_assignment on public.job_schedule_slots;
create trigger job_schedule_slots_sync_lead_assignment
after insert or update of technician_company_user_id on public.job_schedule_slots
for each row
execute function public.sync_job_schedule_slot_lead_assignment();

create or replace function public.set_job_schedule_slot_assignment(
    p_company_id uuid,
    p_schedule_slot_id uuid,
    p_company_user_id uuid,
    p_role_on_schedule text default 'technician'
)
returns public.job_schedule_slot_assignments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_slot public.job_schedule_slots%rowtype;
    v_assignment public.job_schedule_slot_assignments%rowtype;
    v_role text := lower(btrim(coalesce(p_role_on_schedule, 'technician')));
begin
    if not public.can_manage_company_schedule(p_company_id) then
        raise exception 'Not authorized to manage this company schedule.';
    end if;

    v_role := case v_role
        when 'primary' then 'lead'
        when 'additional' then 'technician'
        else v_role
    end;

    if v_role not in ('lead', 'technician', 'helper', 'observer') then
        raise exception 'Invalid schedule role.';
    end if;

    select * into v_slot
    from public.job_schedule_slots
    where id = p_schedule_slot_id
      and company_id = p_company_id
    for update;

    if not found then
        raise exception 'Scheduled job not found for this company.';
    end if;

    if not exists (
        select 1
        from public.company_users
        where id = p_company_user_id
          and company_id = p_company_id
          and lower(btrim(coalesce(status, ''))) = 'active'
    ) then
        raise exception 'Active team member not found for this company.';
    end if;

    if exists (
        select 1
        from public.job_schedule_slots as other_slot
        where other_slot.company_id = p_company_id
          and other_slot.id <> p_schedule_slot_id
          and lower(btrim(coalesce(other_slot.status, ''))) not in ('cancelled', 'canceled', 'completed', 'archived')
          and tstzrange(other_slot.start_at, other_slot.end_at, '[)') && tstzrange(v_slot.start_at, v_slot.end_at, '[)')
          and (
              other_slot.technician_company_user_id = p_company_user_id
              or exists (
                  select 1
                  from public.job_schedule_slot_assignments as other_assignment
                  where other_assignment.schedule_slot_id = other_slot.id
                    and other_assignment.company_user_id = p_company_user_id
                    and lower(btrim(other_assignment.status)) <> 'removed'
              )
          )
    ) or exists (
        select 1
        from public.company_schedule_meetings as meeting
        join public.company_schedule_meeting_attendees as attendee
          on attendee.meeting_id = meeting.id
         and attendee.company_id = meeting.company_id
        where meeting.company_id = p_company_id
          and attendee.company_user_id = p_company_user_id
          and lower(btrim(meeting.status)) = 'scheduled'
          and tstzrange(meeting.start_at, meeting.end_at, '[)') && tstzrange(v_slot.start_at, v_slot.end_at, '[)')
    ) then
        raise exception 'That team member already has another scheduled item during this time.';
    end if;

    if v_role = 'lead' then
        update public.job_schedule_slot_assignments
        set role_on_schedule = 'technician',
            updated_at = now()
        where schedule_slot_id = p_schedule_slot_id
          and company_id = p_company_id
          and company_user_id <> p_company_user_id
          and lower(btrim(status)) <> 'removed'
          and lower(btrim(role_on_schedule)) = 'lead';
    elsif v_slot.technician_company_user_id = p_company_user_id then
        raise exception 'Choose another lead before changing the current lead role.';
    end if;

    insert into public.job_schedule_slot_assignments (
        company_id,
        schedule_slot_id,
        company_user_id,
        role_on_schedule,
        status,
        assigned_by_user_id
    ) values (
        p_company_id,
        p_schedule_slot_id,
        p_company_user_id,
        v_role,
        'assigned',
        auth.uid()
    )
    on conflict (schedule_slot_id, company_user_id)
    where lower(btrim(status)) <> 'removed'
    do update set
        role_on_schedule = excluded.role_on_schedule,
        status = 'assigned',
        assigned_by_user_id = excluded.assigned_by_user_id,
        assigned_at = now(),
        updated_at = now()
    returning * into v_assignment;

    if v_role = 'lead' then
        update public.job_schedule_slots
        set technician_company_user_id = p_company_user_id,
            updated_by_user_id = auth.uid(),
            updated_at = now()
        where id = p_schedule_slot_id
          and company_id = p_company_id;
    end if;

    return v_assignment;
end;
$$;

create or replace function public.remove_job_schedule_slot_assignment(
    p_company_id uuid,
    p_schedule_slot_id uuid,
    p_company_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.can_manage_company_schedule(p_company_id) then
        raise exception 'Not authorized to manage this company schedule.';
    end if;

    if exists (
        select 1
        from public.job_schedule_slots
        where id = p_schedule_slot_id
          and company_id = p_company_id
          and technician_company_user_id = p_company_user_id
    ) then
        raise exception 'Choose another lead before removing the current lead.';
    end if;

    update public.job_schedule_slot_assignments
    set status = 'removed',
        updated_at = now()
    where schedule_slot_id = p_schedule_slot_id
      and company_id = p_company_id
      and company_user_id = p_company_user_id
      and lower(btrim(status)) <> 'removed';

    return found;
end;
$$;

create or replace function public.create_company_schedule_meeting(
    p_company_id uuid,
    p_title text,
    p_notes text,
    p_start_at timestamptz,
    p_end_at timestamptz,
    p_attendee_company_user_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_meeting_id uuid;
    v_attendee_ids uuid[];
begin
    if not public.can_manage_company_schedule(p_company_id) then
        raise exception 'Not authorized to manage this company schedule.';
    end if;

    if char_length(btrim(coalesce(p_title, ''))) not between 1 and 200 then
        raise exception 'Meeting title is required and must be 200 characters or fewer.';
    end if;

    if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
        raise exception 'A valid meeting start and end time are required.';
    end if;

    select coalesce(array_agg(distinct attendee_id), array[]::uuid[])
    into v_attendee_ids
    from unnest(coalesce(p_attendee_company_user_ids, array[]::uuid[])) as attendee_id;

    if coalesce(array_length(v_attendee_ids, 1), 0) = 0 then
        raise exception 'Choose at least one meeting attendee.';
    end if;

    if (
        select count(*)
        from public.company_users
        where company_id = p_company_id
          and id = any(v_attendee_ids)
          and lower(btrim(coalesce(status, ''))) = 'active'
    ) <> array_length(v_attendee_ids, 1) then
        raise exception 'Every attendee must be an active member of this company.';
    end if;

    if exists (
        select 1
        from unnest(v_attendee_ids) as attendee_id
        where exists (
            select 1
            from public.job_schedule_slots as slot
            where slot.company_id = p_company_id
              and lower(btrim(coalesce(slot.status, ''))) not in ('cancelled', 'canceled', 'completed', 'archived')
              and tstzrange(slot.start_at, slot.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
              and (
                  slot.technician_company_user_id = attendee_id
                  or exists (
                      select 1
                      from public.job_schedule_slot_assignments as assignment
                      where assignment.schedule_slot_id = slot.id
                        and assignment.company_user_id = attendee_id
                        and lower(btrim(assignment.status)) <> 'removed'
                  )
              )
        )
        or exists (
            select 1
            from public.company_schedule_meetings as meeting
            join public.company_schedule_meeting_attendees as attendee
              on attendee.meeting_id = meeting.id
             and attendee.company_id = meeting.company_id
            where meeting.company_id = p_company_id
              and attendee.company_user_id = attendee_id
              and lower(btrim(meeting.status)) = 'scheduled'
              and tstzrange(meeting.start_at, meeting.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
        )
    ) then
        raise exception 'One or more attendees already have another scheduled item during this time.';
    end if;

    insert into public.company_schedule_meetings (
        company_id,
        title,
        notes,
        start_at,
        end_at,
        status,
        created_by_user_id
    ) values (
        p_company_id,
        btrim(p_title),
        nullif(btrim(coalesce(p_notes, '')), ''),
        p_start_at,
        p_end_at,
        'scheduled',
        auth.uid()
    ) returning id into v_meeting_id;

    insert into public.company_schedule_meeting_attendees (
        company_id,
        meeting_id,
        company_user_id,
        attendee_role
    )
    select
        p_company_id,
        v_meeting_id,
        attendee_id,
        'attendee'
    from unnest(v_attendee_ids) as attendee_id;

    return v_meeting_id;
end;
$$;

create or replace function public.complete_company_schedule_meeting(
    p_company_id uuid,
    p_meeting_id uuid
)
returns public.company_schedule_meetings
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_meeting public.company_schedule_meetings%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if not public.can_manage_company_schedule(p_company_id) and not exists (
        select 1
        from public.company_schedule_meeting_attendees as attendee
        join public.company_users as company_user
          on company_user.id = attendee.company_user_id
         and company_user.company_id = attendee.company_id
        where attendee.meeting_id = p_meeting_id
          and attendee.company_id = p_company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    ) then
        raise exception 'Not authorized to complete this meeting.';
    end if;

    update public.company_schedule_meetings
    set status = 'completed',
        completed_by_user_id = auth.uid(),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = p_meeting_id
      and company_id = p_company_id
      and lower(btrim(status)) = 'scheduled'
    returning * into v_meeting;

    if v_meeting.id is null then
        select * into v_meeting
        from public.company_schedule_meetings
        where id = p_meeting_id
          and company_id = p_company_id;
    end if;

    if v_meeting.id is null then
        raise exception 'Meeting not found for this company.';
    end if;

    update public.company_schedule_meeting_attendees
    set attendance_status = 'attended',
        updated_at = now()
    where meeting_id = p_meeting_id
      and company_id = p_company_id
      and lower(btrim(attendance_status)) = 'scheduled';

    return v_meeting;
end;
$$;

create or replace function public.get_company_schedule_overview(
    p_company_id uuid,
    p_start_at timestamptz,
    p_end_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_can_manage boolean := false;
    v_result jsonb;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if p_company_id is null or p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
        raise exception 'Company and a valid schedule window are required.';
    end if;

    v_can_manage := public.can_manage_company_schedule(p_company_id);

    if not v_can_manage and not exists (
        select 1
        from public.company_users
        where company_id = p_company_id
          and auth_user_id = auth.uid()
          and lower(btrim(coalesce(status, ''))) = 'active'
    ) then
        raise exception 'Not authorized to view this company schedule.';
    end if;

    select jsonb_build_object(
        'slot_assignments', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'id', assignment.id,
                    'company_id', assignment.company_id,
                    'schedule_slot_id', assignment.schedule_slot_id,
                    'company_user_id', assignment.company_user_id,
                    'role_on_schedule', assignment.role_on_schedule,
                    'status', assignment.status,
                    'display_name', coalesce(nullif(btrim(company_user.full_name), ''), nullif(btrim(company_user.email), ''), 'Team member'),
                    'email', company_user.email
                ) order by
                    case lower(btrim(assignment.role_on_schedule)) when 'lead' then 0 when 'technician' then 1 when 'helper' then 2 else 3 end,
                    company_user.full_name nulls last,
                    company_user.email nulls last
            )
            from public.job_schedule_slot_assignments as assignment
            join public.job_schedule_slots as slot
              on slot.id = assignment.schedule_slot_id
             and slot.company_id = assignment.company_id
            join public.company_users as company_user
              on company_user.id = assignment.company_user_id
             and company_user.company_id = assignment.company_id
            where assignment.company_id = p_company_id
              and lower(btrim(assignment.status)) <> 'removed'
              and slot.start_at < p_end_at
              and slot.end_at > p_start_at
              and (
                  v_can_manage
                  or exists (
                      select 1
                      from public.job_schedule_slot_assignments as actor_assignment
                      join public.company_users as actor_company_user
                        on actor_company_user.id = actor_assignment.company_user_id
                       and actor_company_user.company_id = actor_assignment.company_id
                      where actor_assignment.schedule_slot_id = slot.id
                        and actor_assignment.company_id = slot.company_id
                        and lower(btrim(actor_assignment.status)) <> 'removed'
                        and actor_company_user.auth_user_id = auth.uid()
                        and lower(btrim(coalesce(actor_company_user.status, ''))) = 'active'
                  )
              )
        ), '[]'::jsonb),
        'meetings', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'id', meeting.id,
                    'company_id', meeting.company_id,
                    'title', meeting.title,
                    'notes', meeting.notes,
                    'start_at', meeting.start_at,
                    'end_at', meeting.end_at,
                    'status', meeting.status,
                    'completed_at', meeting.completed_at,
                    'attendees', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'company_user_id', attendee.company_user_id,
                                'attendee_role', attendee.attendee_role,
                                'attendance_status', attendee.attendance_status,
                                'display_name', coalesce(nullif(btrim(company_user.full_name), ''), nullif(btrim(company_user.email), ''), 'Team member'),
                                'email', company_user.email
                            ) order by
                                case lower(btrim(attendee.attendee_role)) when 'organizer' then 0 when 'attendee' then 1 else 2 end,
                                company_user.full_name nulls last,
                                company_user.email nulls last
                        )
                        from public.company_schedule_meeting_attendees as attendee
                        join public.company_users as company_user
                          on company_user.id = attendee.company_user_id
                         and company_user.company_id = attendee.company_id
                        where attendee.meeting_id = meeting.id
                          and attendee.company_id = meeting.company_id
                    ), '[]'::jsonb)
                ) order by meeting.start_at, meeting.id
            )
            from public.company_schedule_meetings as meeting
            where meeting.company_id = p_company_id
              and meeting.start_at < p_end_at
              and meeting.end_at > p_start_at
              and (
                  v_can_manage
                  or exists (
                      select 1
                      from public.company_schedule_meeting_attendees as actor_attendee
                      join public.company_users as actor_company_user
                        on actor_company_user.id = actor_attendee.company_user_id
                       and actor_company_user.company_id = actor_attendee.company_id
                      where actor_attendee.meeting_id = meeting.id
                        and actor_attendee.company_id = meeting.company_id
                        and actor_company_user.auth_user_id = auth.uid()
                        and lower(btrim(coalesce(actor_company_user.status, ''))) = 'active'
                  )
              )
        ), '[]'::jsonb)
    ) into v_result;

    return v_result;
end;
$$;

revoke all on function public.can_manage_company_schedule(uuid) from public, anon;
grant execute on function public.can_manage_company_schedule(uuid) to authenticated;

revoke all on function public.sync_job_schedule_slot_lead_assignment() from public, anon;

revoke all on function public.set_job_schedule_slot_assignment(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.set_job_schedule_slot_assignment(uuid, uuid, uuid, text) to authenticated;

revoke all on function public.remove_job_schedule_slot_assignment(uuid, uuid, uuid) from public, anon;
grant execute on function public.remove_job_schedule_slot_assignment(uuid, uuid, uuid) to authenticated;

revoke all on function public.create_company_schedule_meeting(uuid, text, text, timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.create_company_schedule_meeting(uuid, text, text, timestamptz, timestamptz, uuid[]) to authenticated;

revoke all on function public.complete_company_schedule_meeting(uuid, uuid) from public, anon;
grant execute on function public.complete_company_schedule_meeting(uuid, uuid) to authenticated;

revoke all on function public.get_company_schedule_overview(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_company_schedule_overview(uuid, timestamptz, timestamptz) to authenticated;

commit;
