begin;

alter table public.company_technician_time_entries
    add column if not exists break_started_at timestamptz,
    add column if not exists break_ended_at timestamptz,
    add column if not exists break_minutes integer not null default 0,
    add column if not exists automatic_lunch_applied boolean not null default false,
    add column if not exists meal_exception_reported boolean not null default false,
    add column if not exists shift_notes text,
    add column if not exists injury_reported boolean,
    add column if not exists injury_details text,
    add column if not exists technician_signature text,
    add column if not exists submitted_at timestamptz;

alter table public.company_technician_time_entries
    drop constraint if exists company_technician_time_entries_break_minutes_check;
alter table public.company_technician_time_entries
    add constraint company_technician_time_entries_break_minutes_check
        check (break_minutes >= 0 and break_minutes <= 240);

create table if not exists public.company_time_correction_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    technician_company_user_id uuid not null references public.company_users(id) on delete cascade,
    requested_clock_in_at timestamptz not null,
    reason text not null,
    location_latitude double precision,
    location_longitude double precision,
    location_accuracy_meters double precision,
    status text not null default 'pending',
    reviewed_by_user_id uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz,
    review_note text,
    resulting_time_entry_id uuid references public.company_technician_time_entries(id) on delete set null,
    created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_time_correction_requests_status_check
        check (status in ('pending', 'approved', 'denied')),
    constraint company_time_correction_requests_reason_check
        check (char_length(btrim(reason)) >= 4)
);

create index if not exists company_time_correction_requests_review_idx
    on public.company_time_correction_requests(company_id, status, created_at desc);

alter table public.company_time_correction_requests enable row level security;

drop policy if exists company_time_correction_requests_select on public.company_time_correction_requests;
create policy company_time_correction_requests_select
on public.company_time_correction_requests for select to authenticated
using (
    exists (
        select 1 from public.company_users company_user
        where company_user.id = technician_company_user_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
    or public.can_dispatch_company(company_id)
);

create or replace function public.manage_company_technician_time_entry(
    p_technician_company_user_id uuid,
    p_action text,
    p_payload jsonb default '{}'::jsonb
)
returns public.company_technician_time_entries
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_user public.company_users%rowtype;
    v_entry public.company_technician_time_entries%rowtype;
    v_action text := lower(btrim(coalesce(p_action, '')));
    v_break_minutes integer;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_company_user
    from public.company_users
    where id = p_technician_company_user_id
      and auth_user_id = auth.uid()
      and lower(btrim(coalesce(status, ''))) = 'active';
    if not found then raise exception 'Time clock is available only for your active technician profile.'; end if;

    select * into v_entry
    from public.company_technician_time_entries
    where technician_company_user_id = v_company_user.id
      and clocked_out_at is null
    order by clocked_in_at desc
    limit 1
    for update;

    if v_action = 'start_break' then
        if v_entry.id is null then raise exception 'Clock in before starting lunch.'; end if;
        if v_entry.break_started_at is not null and v_entry.break_ended_at is null then raise exception 'Lunch is already running.'; end if;
        if v_entry.break_minutes >= 30 then raise exception 'A lunch break is already recorded for this shift.'; end if;
        update public.company_technician_time_entries
        set break_started_at=now(), break_ended_at=null, updated_at=now()
        where id=v_entry.id returning * into v_entry;
    elsif v_action = 'end_break' then
        if v_entry.id is null or v_entry.break_started_at is null or v_entry.break_ended_at is not null then
            raise exception 'There is no active lunch break.';
        end if;
        v_break_minutes := greatest(1, round(extract(epoch from (now() - v_entry.break_started_at)) / 60.0)::integer);
        update public.company_technician_time_entries
        set break_ended_at=now(), break_minutes=least(240, break_minutes + v_break_minutes), updated_at=now()
        where id=v_entry.id returning * into v_entry;
    elsif v_action = 'add_30_minute_break' then
        if v_entry.id is null then raise exception 'Clock in before adding lunch.'; end if;
        update public.company_technician_time_entries
        set break_minutes=greatest(break_minutes, 30), break_started_at=coalesce(break_started_at, now() - interval '30 minutes'),
            break_ended_at=coalesce(break_ended_at, now()), updated_at=now()
        where id=v_entry.id returning * into v_entry;
    elsif v_action = 'submit_day' then
        if v_entry.id is null then
            select * into v_entry from public.company_technician_time_entries
            where technician_company_user_id=v_company_user.id
            order by clocked_in_at desc limit 1 for update;
        end if;
        if v_entry.id is null then raise exception 'No shift is available to submit.'; end if;
        if v_entry.clocked_out_at is null then raise exception 'Clock out before signing and submitting the day.'; end if;
        if (p_payload->>'injury_reported')::boolean and nullif(btrim(p_payload->>'injury_details'),'') is null then
            raise exception 'Describe the injury before submitting.';
        end if;
        if not public.is_company_drawn_signature(p_payload->>'signature') then
            raise exception 'Draw your signature before submitting the day.';
        end if;
        update public.company_technician_time_entries
        set shift_notes=nullif(btrim(p_payload->>'notes'),''),
            injury_reported=coalesce((p_payload->>'injury_reported')::boolean,false),
            injury_details=nullif(btrim(p_payload->>'injury_details'),''),
            technician_signature=p_payload->>'signature',
            submitted_at=now(), updated_at=now()
        where id=v_entry.id returning * into v_entry;
    else
        raise exception 'Unknown time-entry action.';
    end if;

    return v_entry;
end;
$$;

create or replace function public.request_company_clock_in_correction(
    p_technician_company_user_id uuid,
    p_requested_clock_in_at timestamptz,
    p_reason text,
    p_latitude double precision default null,
    p_longitude double precision default null,
    p_accuracy_meters double precision default null
)
returns public.company_time_correction_requests
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_user public.company_users%rowtype;
    v_request public.company_time_correction_requests%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    select * into v_company_user from public.company_users
    where id=p_technician_company_user_id and auth_user_id=auth.uid()
      and lower(btrim(coalesce(status,'')))='active';
    if not found then raise exception 'Correction requests are available only for your technician profile.'; end if;
    if p_requested_clock_in_at > now() then raise exception 'Requested clock-in time cannot be in the future.'; end if;
    if p_requested_clock_in_at < (
        date_trunc('day', timezone('America/Los_Angeles', now())) + interval '8 hours'
    ) at time zone 'America/Los_Angeles' then
        raise exception 'Clock-in corrections cannot be requested earlier than 8:00 AM today.';
    end if;
    if p_requested_clock_in_at < (
        date_trunc('day', timezone('America/Los_Angeles', now()))
    ) at time zone 'America/Los_Angeles' then
        raise exception 'Use today''s date for a forgotten clock-in request.';
    end if;
    if char_length(btrim(coalesce(p_reason,''))) < 4 then raise exception 'Explain why the clock-in was missed.'; end if;
    if exists (
        select 1 from public.company_time_correction_requests
        where technician_company_user_id=v_company_user.id and status='pending'
    ) then raise exception 'A clock correction request is already awaiting review.'; end if;

    insert into public.company_time_correction_requests(
        company_id, technician_company_user_id, requested_clock_in_at, reason,
        location_latitude, location_longitude, location_accuracy_meters
    ) values (
        v_company_user.company_id, v_company_user.id, p_requested_clock_in_at, btrim(p_reason),
        p_latitude, p_longitude, p_accuracy_meters
    ) returning * into v_request;
    return v_request;
end;
$$;

create or replace function public.review_company_clock_in_correction(
    p_request_id uuid,
    p_decision text,
    p_review_note text default null
)
returns public.company_time_correction_requests
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.company_time_correction_requests%rowtype;
    v_entry public.company_technician_time_entries%rowtype;
    v_decision text := lower(btrim(coalesce(p_decision,'')));
begin
    select * into v_request from public.company_time_correction_requests
    where id=p_request_id for update;
    if not found then raise exception 'Clock correction request not found.'; end if;
    if not public.can_dispatch_company(v_request.company_id) then raise exception 'Dispatch access is required.'; end if;
    if v_request.status <> 'pending' then raise exception 'This request was already reviewed.'; end if;
    if v_decision not in ('approved','denied') then raise exception 'Decision must be approved or denied.'; end if;

    if v_decision='approved' then
        if exists (
            select 1 from public.company_technician_time_entries
            where technician_company_user_id=v_request.technician_company_user_id and clocked_out_at is null
        ) then raise exception 'The technician already has an open shift.'; end if;
        insert into public.company_technician_time_entries(
            company_id, technician_company_user_id, clocked_in_at, created_by_user_id
        ) values (
            v_request.company_id, v_request.technician_company_user_id,
            v_request.requested_clock_in_at, auth.uid()
        ) returning * into v_entry;
    end if;

    update public.company_time_correction_requests
    set status=v_decision, reviewed_by_user_id=auth.uid(), reviewed_at=now(),
        review_note=nullif(btrim(p_review_note),''),
        resulting_time_entry_id=case when v_decision='approved' then v_entry.id else null end,
        updated_at=now()
    where id=v_request.id returning * into v_request;
    return v_request;
end;
$$;

create or replace function public.set_company_technician_clock(
    p_technician_company_user_id uuid,
    p_action text
)
returns public.company_technician_time_entries
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_user public.company_users%rowtype;
    v_entry public.company_technician_time_entries%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    select * into v_company_user from public.company_users
    where id=p_technician_company_user_id and auth_user_id=auth.uid()
      and lower(btrim(coalesce(status,'')))='active';
    if not found then raise exception 'Time clock is available only for your active technician profile.'; end if;

    if lower(btrim(p_action))='clock_in' then
        if exists (select 1 from public.company_technician_time_entries where technician_company_user_id=v_company_user.id and clocked_out_at is null)
            then raise exception 'You are already clocked in.'; end if;
        insert into public.company_technician_time_entries(company_id, technician_company_user_id)
        values(v_company_user.company_id,v_company_user.id) returning * into v_entry;
    elsif lower(btrim(p_action))='clock_out' then
        update public.company_technician_time_entries
        set clocked_out_at=now(),
            break_ended_at=case when break_started_at is not null and break_ended_at is null then now() else break_ended_at end,
            break_minutes=case
                when break_started_at is not null and break_ended_at is null
                    then least(240, break_minutes + greatest(1, round(extract(epoch from (now()-break_started_at))/60.0)::integer))
                else break_minutes end,
            meal_exception_reported=case
                when break_started_at is null and break_minutes=0
                    and timezone('America/Los_Angeles', clocked_in_at)::date=timezone('America/Los_Angeles', now())::date
                    and extract(epoch from (now()-clocked_in_at)) >= 5 * 60 * 60 then true
                else meal_exception_reported end,
            updated_at=now()
        where id=(select id from public.company_technician_time_entries
            where technician_company_user_id=v_company_user.id and clocked_out_at is null
            order by clocked_in_at desc limit 1)
        returning * into v_entry;
        if not found then raise exception 'You are not currently clocked in.'; end if;
    else raise exception 'Unknown time clock action.';
    end if;
    return v_entry;
end;
$$;

revoke all on function public.manage_company_technician_time_entry(uuid,text,jsonb) from public, anon;
revoke all on function public.request_company_clock_in_correction(uuid,timestamptz,text,double precision,double precision,double precision) from public, anon;
revoke all on function public.review_company_clock_in_correction(uuid,text,text) from public, anon;
grant execute on function public.manage_company_technician_time_entry(uuid,text,jsonb) to authenticated;
grant execute on function public.request_company_clock_in_correction(uuid,timestamptz,text,double precision,double precision,double precision) to authenticated;
grant execute on function public.review_company_clock_in_correction(uuid,text,text) to authenticated;

commit;
