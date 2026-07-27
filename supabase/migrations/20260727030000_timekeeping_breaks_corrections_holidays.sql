begin;

alter table public.company_technician_time_entries
    add column if not exists rest_break_started_at timestamptz,
    add column if not exists rest_break_minutes integer not null default 0;

alter table public.company_technician_time_entries
    drop constraint if exists company_technician_time_entries_rest_break_minutes_check;
alter table public.company_technician_time_entries
    add constraint company_technician_time_entries_rest_break_minutes_check
        check (rest_break_minutes >= 0 and rest_break_minutes <= 120);

alter table public.company_time_correction_requests
    add column if not exists correction_type text not null default 'clock_in',
    add column if not exists requested_clock_out_at timestamptz;

alter table public.company_time_correction_requests
    drop constraint if exists company_time_correction_requests_type_check;
alter table public.company_time_correction_requests
    add constraint company_time_correction_requests_type_check
        check (correction_type in ('clock_in', 'clock_out'));

create table if not exists public.company_holidays (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    holiday_date date not null,
    name text not null,
    created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    unique (company_id, holiday_date),
    constraint company_holidays_name_check check (char_length(btrim(name)) >= 2)
);

alter table public.company_holidays enable row level security;
drop policy if exists company_holidays_select on public.company_holidays;
create policy company_holidays_select on public.company_holidays
for select to authenticated using (
    exists (
        select 1 from public.company_users company_user
        where company_user.company_id = company_holidays.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
);

create or replace function public.add_company_holiday(
    p_company_id uuid,
    p_holiday_date date,
    p_name text
)
returns public.company_holidays
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare v_holiday public.company_holidays%rowtype;
begin
    if not public.can_dispatch_company(p_company_id) then
        raise exception 'Management or Dispatch access is required.';
    end if;
    if char_length(btrim(coalesce(p_name,''))) < 2 then raise exception 'Enter a holiday name.'; end if;
    insert into public.company_holidays(company_id,holiday_date,name)
    values(p_company_id,p_holiday_date,btrim(p_name))
    on conflict(company_id,holiday_date) do update set name=excluded.name
    returning * into v_holiday;
    return v_holiday;
end;
$$;

create or replace function public.request_company_clock_out_correction(
    p_technician_company_user_id uuid,
    p_requested_clock_out_at timestamptz,
    p_reason text,
    p_latitude double precision default null,
    p_longitude double precision default null,
    p_accuracy_meters double precision default null
)
returns public.company_time_correction_requests
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
    v_user public.company_users%rowtype;
    v_entry public.company_technician_time_entries%rowtype;
    v_request public.company_time_correction_requests%rowtype;
begin
    select * into v_user from public.company_users
    where id=p_technician_company_user_id and auth_user_id=auth.uid()
      and lower(btrim(coalesce(status,'')))='active';
    if not found then raise exception 'Active technician access is required.'; end if;
    select * into v_entry from public.company_technician_time_entries
    where technician_company_user_id=v_user.id
    order by clocked_in_at desc limit 1;
    if not found then raise exception 'No shift is available to correct.'; end if;
    if p_requested_clock_out_at < v_entry.clocked_in_at or p_requested_clock_out_at > now() then
        raise exception 'The requested clock-out must be after clock-in and cannot be in the future.';
    end if;
    if char_length(btrim(coalesce(p_reason,''))) < 4 then raise exception 'Explain why clock-out was missed.'; end if;
    if exists (
        select 1 from public.company_time_correction_requests
        where technician_company_user_id=v_user.id and status='pending'
    ) then raise exception 'A time correction is already awaiting review.'; end if;
    insert into public.company_time_correction_requests(
        company_id,technician_company_user_id,requested_clock_in_at,requested_clock_out_at,
        correction_type,reason,location_latitude,location_longitude,location_accuracy_meters
    ) values (
        v_user.company_id,v_user.id,v_entry.clocked_in_at,p_requested_clock_out_at,
        'clock_out',btrim(p_reason),p_latitude,p_longitude,p_accuracy_meters
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
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
    v_request public.company_time_correction_requests%rowtype;
    v_entry public.company_technician_time_entries%rowtype;
    v_decision text := lower(btrim(coalesce(p_decision,'')));
begin
    select * into v_request from public.company_time_correction_requests where id=p_request_id for update;
    if not found then raise exception 'Time correction request not found.'; end if;
    if not public.can_dispatch_company(v_request.company_id) then raise exception 'Dispatch access is required.'; end if;
    if v_request.status <> 'pending' then raise exception 'This request was already reviewed.'; end if;
    if v_decision not in ('approved','denied') then raise exception 'Decision must be approved or denied.'; end if;

    if v_decision='approved' and v_request.correction_type='clock_out' then
        select * into v_entry from public.company_technician_time_entries
        where technician_company_user_id=v_request.technician_company_user_id
        order by clocked_in_at desc limit 1 for update;
        if not found then raise exception 'The shift to correct was not found.'; end if;
        update public.company_technician_time_entries
        set clocked_out_at=v_request.requested_clock_out_at,updated_at=now()
        where id=v_entry.id returning * into v_entry;
    elsif v_decision='approved' then
        if exists (
            select 1 from public.company_technician_time_entries
            where technician_company_user_id=v_request.technician_company_user_id and clocked_out_at is null
        ) then raise exception 'The technician already has an open shift.'; end if;
        insert into public.company_technician_time_entries(
            company_id,technician_company_user_id,clocked_in_at,created_by_user_id
        ) values (
            v_request.company_id,v_request.technician_company_user_id,
            v_request.requested_clock_in_at,auth.uid()
        ) returning * into v_entry;
    end if;

    update public.company_time_correction_requests
    set status=v_decision,reviewed_by_user_id=auth.uid(),reviewed_at=now(),
        review_note=nullif(btrim(p_review_note),''),
        resulting_time_entry_id=case when v_decision='approved' then v_entry.id else null end,
        updated_at=now()
    where id=v_request.id returning * into v_request;
    return v_request;
end;
$$;

create or replace function public.manage_company_technician_time_entry(
    p_technician_company_user_id uuid,
    p_action text,
    p_payload jsonb default '{}'::jsonb
)
returns public.company_technician_time_entries
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
    v_user public.company_users%rowtype;
    v_entry public.company_technician_time_entries%rowtype;
    v_action text := lower(btrim(coalesce(p_action,'')));
    v_minutes integer;
begin
    select * into v_user from public.company_users
    where id=p_technician_company_user_id and auth_user_id=auth.uid()
      and lower(btrim(coalesce(status,'')))='active';
    if not found then raise exception 'Time clock is available only for your active technician profile.'; end if;
    select * into v_entry from public.company_technician_time_entries
    where technician_company_user_id=v_user.id and clocked_out_at is null
    order by clocked_in_at desc limit 1 for update;

    if v_action='start_break' then
        if v_entry.id is null then raise exception 'Clock in before starting lunch.'; end if;
        if v_entry.break_started_at is not null and v_entry.break_ended_at is null then raise exception 'Lunch is already running.'; end if;
        update public.company_technician_time_entries set break_started_at=now(),break_ended_at=null,updated_at=now()
        where id=v_entry.id returning * into v_entry;
    elsif v_action='end_break' then
        if v_entry.id is null or v_entry.break_started_at is null or v_entry.break_ended_at is not null then raise exception 'There is no active lunch break.'; end if;
        v_minutes:=greatest(1,round(extract(epoch from(now()-v_entry.break_started_at))/60.0)::integer);
        update public.company_technician_time_entries set break_ended_at=now(),break_minutes=least(240,break_minutes+v_minutes),updated_at=now()
        where id=v_entry.id returning * into v_entry;
    elsif v_action='add_30_minute_break' then
        if v_entry.id is not null then raise exception 'Clock out before recording a forgotten lunch.'; end if;
        select * into v_entry from public.company_technician_time_entries
        where technician_company_user_id=v_user.id and clocked_out_at is not null
        order by clocked_in_at desc limit 1 for update;
        if not found then raise exception 'No completed shift is available.'; end if;
        update public.company_technician_time_entries
        set break_minutes=greatest(break_minutes,30),
            break_started_at=coalesce(break_started_at,(timezone('America/Los_Angeles',clocked_in_at)::date + time '11:30') at time zone 'America/Los_Angeles'),
            break_ended_at=coalesce(break_ended_at,(timezone('America/Los_Angeles',clocked_in_at)::date + time '12:00') at time zone 'America/Los_Angeles'),
            automatic_lunch_applied=true,updated_at=now()
        where id=v_entry.id returning * into v_entry;
    elsif v_action='start_rest_break' then
        if v_entry.id is null then raise exception 'Clock in before starting a rest break.'; end if;
        if v_entry.rest_break_started_at is not null then raise exception 'A rest break is already running.'; end if;
        update public.company_technician_time_entries set rest_break_started_at=now(),updated_at=now()
        where id=v_entry.id returning * into v_entry;
    elsif v_action='end_rest_break' then
        if v_entry.id is null or v_entry.rest_break_started_at is null then raise exception 'There is no active rest break.'; end if;
        v_minutes:=greatest(1,round(extract(epoch from(now()-v_entry.rest_break_started_at))/60.0)::integer);
        update public.company_technician_time_entries
        set rest_break_minutes=least(120,rest_break_minutes+v_minutes),rest_break_started_at=null,updated_at=now()
        where id=v_entry.id returning * into v_entry;
    elsif v_action='submit_day' then
        if v_entry.id is null then
            select * into v_entry from public.company_technician_time_entries
            where technician_company_user_id=v_user.id order by clocked_in_at desc limit 1 for update;
        end if;
        if v_entry.id is null or v_entry.clocked_out_at is null then raise exception 'Clock out before submitting the day.'; end if;
        if (p_payload->>'injury_reported')::boolean and nullif(btrim(p_payload->>'injury_details'),'') is null then raise exception 'Describe the injury before submitting.'; end if;
        if not public.is_company_drawn_signature(p_payload->>'signature') then raise exception 'Draw your signature before submitting the day.'; end if;
        update public.company_technician_time_entries
        set shift_notes=nullif(btrim(p_payload->>'notes'),''),
            injury_reported=coalesce((p_payload->>'injury_reported')::boolean,false),
            injury_details=nullif(btrim(p_payload->>'injury_details'),''),
            technician_signature=p_payload->>'signature',submitted_at=now(),updated_at=now()
        where id=v_entry.id returning * into v_entry;
    else raise exception 'Unknown time-entry action.'; end if;
    return v_entry;
end;
$$;

revoke all on function public.add_company_holiday(uuid,date,text) from public,anon;
revoke all on function public.request_company_clock_out_correction(uuid,timestamptz,text,double precision,double precision,double precision) from public,anon;
grant execute on function public.add_company_holiday(uuid,date,text) to authenticated;
grant execute on function public.request_company_clock_out_correction(uuid,timestamptz,text,double precision,double precision,double precision) to authenticated;

commit;
