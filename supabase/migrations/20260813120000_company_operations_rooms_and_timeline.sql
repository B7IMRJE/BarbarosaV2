begin;

do $$
begin
    if to_regclass('public.companies') is null
       or to_regclass('public.company_users') is null
       or to_regclass('public.company_technician_time_entries') is null
       or to_regclass('public.service_request_events') is null
       or to_regclass('public.company_job_workflow_events') is null
       or to_regclass('public.company_job_workflow_attachments') is null then
        raise exception 'Company, timekeeping, request, and job workflow foundations are required before Operations Rooms can be installed.';
    end if;
    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before Operations Rooms can be installed.';
    end if;
end;
$$;

create table if not exists public.company_operations_rooms (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    name text not null,
    description text,
    is_default boolean not null default false,
    is_active boolean not null default true,
    created_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_operations_rooms_name_check check (char_length(btrim(name)) between 2 and 80)
);

create unique index if not exists company_operations_rooms_default_idx
    on public.company_operations_rooms(company_id)
    where is_default and is_active;

create unique index if not exists company_operations_rooms_name_idx
    on public.company_operations_rooms(company_id, lower(btrim(name)))
    where is_active;

create table if not exists public.company_operations_room_members (
    room_id uuid not null references public.company_operations_rooms(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    company_user_id uuid not null references public.company_users(id) on delete cascade,
    added_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
    added_at timestamptz not null default now(),
    primary key (room_id, company_user_id)
);

create index if not exists company_operations_room_members_company_idx
    on public.company_operations_room_members(company_id, company_user_id);

create table if not exists public.company_operations_events (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    target_room_id uuid references public.company_operations_rooms(id) on delete cascade,
    subject_company_user_id uuid references public.company_users(id) on delete set null,
    actor_company_user_id uuid references public.company_users(id) on delete set null,
    actor_name text not null default 'Barbarosa',
    event_type text not null,
    title text not null,
    detail text,
    service_request_id uuid references public.service_requests(id) on delete set null,
    schedule_slot_id uuid references public.job_schedule_slots(id) on delete set null,
    workflow_id uuid references public.company_job_workflows(id) on delete set null,
    source_kind text not null,
    source_id uuid,
    media_bucket text,
    media_storage_path text,
    media_mime_type text,
    media_file_name text,
    metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
    occurred_at timestamptz not null default now(),
    recorded_at timestamptz not null default now(),
    constraint company_operations_events_title_check check (char_length(btrim(title)) between 1 and 240),
    constraint company_operations_events_source_check check (char_length(btrim(source_kind)) between 2 and 80)
);

create unique index if not exists company_operations_events_source_idx
    on public.company_operations_events(source_kind, source_id, event_type)
    where source_id is not null;

create index if not exists company_operations_events_company_time_idx
    on public.company_operations_events(company_id, occurred_at desc, id desc);

create index if not exists company_operations_events_subject_time_idx
    on public.company_operations_events(company_id, subject_company_user_id, occurred_at desc);

alter table public.company_operations_rooms enable row level security;
alter table public.company_operations_room_members enable row level security;
alter table public.company_operations_events enable row level security;

create or replace function public.company_operations_can_manage(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null and (
        public.homeos_is_platform_admin()
        or exists (
            select 1
            from public.company_users as company_user
            where company_user.company_id = p_company_id
              and company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(replace(replace(btrim(coalesce(company_user.role, '')), '-', '_'), ' ', '_'))
                  in ('owner', 'admin', 'manager', 'supervisor')
        )
    );
$$;

revoke all on function public.company_operations_can_manage(uuid) from public, anon;
grant execute on function public.company_operations_can_manage(uuid) to authenticated;

drop policy if exists company_operations_rooms_read on public.company_operations_rooms;
create policy company_operations_rooms_read on public.company_operations_rooms
for select to authenticated using (public.can_dispatch_company(company_id) or public.homeos_is_platform_admin());

drop policy if exists company_operations_room_members_read on public.company_operations_room_members;
create policy company_operations_room_members_read on public.company_operations_room_members
for select to authenticated using (public.can_dispatch_company(company_id) or public.homeos_is_platform_admin());

drop policy if exists company_operations_events_read on public.company_operations_events;
create policy company_operations_events_read on public.company_operations_events
for select to authenticated using (public.can_dispatch_company(company_id) or public.homeos_is_platform_admin());

revoke insert, update, delete on public.company_operations_rooms from authenticated;
revoke insert, update, delete on public.company_operations_room_members from authenticated;
revoke insert, update, delete on public.company_operations_events from authenticated;
grant select on public.company_operations_rooms, public.company_operations_room_members, public.company_operations_events to authenticated;

insert into public.company_operations_rooms(company_id, name, description, is_default, created_by_user_id)
select company.id, 'All Operations', 'Company-wide live operations timeline.', true, null
from public.companies as company
where not exists (
    select 1 from public.company_operations_rooms as room
    where room.company_id = company.id and room.is_default and room.is_active
);

create or replace function public.create_default_company_operations_room()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    insert into public.company_operations_rooms(company_id, name, description, is_default, created_by_user_id)
    values(new.id, 'All Operations', 'Company-wide live operations timeline.', true, null)
    on conflict do nothing;
    return new;
end;
$$;

drop trigger if exists companies_create_default_operations_room on public.companies;
create trigger companies_create_default_operations_room
after insert on public.companies
for each row execute function public.create_default_company_operations_room();

create or replace function public.capture_time_entry_operations_events()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_name text;
begin
    select coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member')
      into v_name
      from public.company_users as company_user
     where company_user.id = new.technician_company_user_id;

    if tg_op = 'INSERT' then
        insert into public.company_operations_events(
            company_id, subject_company_user_id, actor_company_user_id, actor_name,
            event_type, title, detail, source_kind, source_id, occurred_at
        ) values (
            new.company_id, new.technician_company_user_id, new.technician_company_user_id, v_name,
            'clock_in', v_name || ' clocked in', null, 'time_entry', new.id, new.clocked_in_at
        ) on conflict do nothing;
        return new;
    end if;

    if old.break_started_at is distinct from new.break_started_at and new.break_started_at is not null then
        insert into public.company_operations_events(company_id, subject_company_user_id, actor_company_user_id, actor_name, event_type, title, source_kind, source_id, occurred_at)
        values(new.company_id, new.technician_company_user_id, new.technician_company_user_id, v_name, 'lunch_started', v_name || ' started lunch', 'time_entry', new.id, new.break_started_at)
        on conflict do nothing;
    end if;
    if old.break_ended_at is distinct from new.break_ended_at and new.break_ended_at is not null then
        insert into public.company_operations_events(company_id, subject_company_user_id, actor_company_user_id, actor_name, event_type, title, detail, source_kind, source_id, occurred_at)
        values(new.company_id, new.technician_company_user_id, new.technician_company_user_id, v_name, 'lunch_ended', v_name || ' ended lunch', new.break_minutes::text || ' minutes recorded', 'time_entry', new.id, new.break_ended_at)
        on conflict do nothing;
    end if;
    if old.rest_break_started_at is distinct from new.rest_break_started_at and new.rest_break_started_at is not null then
        insert into public.company_operations_events(company_id, subject_company_user_id, actor_company_user_id, actor_name, event_type, title, source_kind, source_id, occurred_at)
        values(new.company_id, new.technician_company_user_id, new.technician_company_user_id, v_name, 'rest_break_started', v_name || ' started a rest break', 'time_entry', new.id, new.rest_break_started_at)
        on conflict do nothing;
    end if;
    if old.rest_break_started_at is not null and new.rest_break_started_at is null and new.rest_break_minutes > old.rest_break_minutes then
        insert into public.company_operations_events(company_id, subject_company_user_id, actor_company_user_id, actor_name, event_type, title, detail, source_kind, source_id, occurred_at)
        values(new.company_id, new.technician_company_user_id, new.technician_company_user_id, v_name, 'rest_break_ended', v_name || ' ended a rest break', new.rest_break_minutes::text || ' total rest-break minutes recorded', 'time_entry', new.id, now())
        on conflict do nothing;
    end if;
    if old.clocked_out_at is distinct from new.clocked_out_at and new.clocked_out_at is not null then
        insert into public.company_operations_events(company_id, subject_company_user_id, actor_company_user_id, actor_name, event_type, title, source_kind, source_id, occurred_at)
        values(new.company_id, new.technician_company_user_id, new.technician_company_user_id, v_name, 'clock_out', v_name || ' clocked out', 'time_entry', new.id, new.clocked_out_at)
        on conflict do nothing;
    end if;
    return new;
end;
$$;

drop trigger if exists company_time_entries_capture_operations on public.company_technician_time_entries;
create trigger company_time_entries_capture_operations
after insert or update on public.company_technician_time_entries
for each row execute function public.capture_time_entry_operations_events();

create or replace function public.capture_service_request_operations_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_subject uuid;
    v_actor uuid;
    v_name text;
begin
    v_actor := new.actor_company_user_id;
    begin
        v_subject := nullif(btrim(coalesce(new.metadata->>'technician_company_user_id', '')), '')::uuid;
    exception when invalid_text_representation then
        v_subject := null;
    end;
    v_subject := coalesce(v_subject, v_actor);

    select coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Dispatch')
      into v_name
      from public.company_users as company_user
     where company_user.id = coalesce(v_subject, v_actor);

    insert into public.company_operations_events(
        company_id, subject_company_user_id, actor_company_user_id, actor_name,
        event_type, title, detail, service_request_id, schedule_slot_id,
        source_kind, source_id, metadata, occurred_at
    ) values (
        new.company_id, v_subject, v_actor, coalesce(v_name, 'Dispatch'),
        new.event_type,
        case lower(btrim(new.event_type))
            when 'technician_assigned' then coalesce(v_name, 'Technician') || ' was assigned'
            when 'technician_on_the_way' then coalesce(v_name, 'Technician') || ' is on the way'
            when 'technician_arrived' then coalesce(v_name, 'Technician') || ' arrived'
            when 'work_in_progress' then coalesce(v_name, 'Technician') || ' started work'
            when 'work_completed' then coalesce(v_name, 'Technician') || ' completed work'
            else initcap(replace(new.event_type, '_', ' '))
        end,
        nullif(btrim(new.message), ''), new.service_request_id, new.schedule_slot_id,
        'service_request_event', new.id, coalesce(new.metadata, '{}'::jsonb), new.created_at
    ) on conflict do nothing;
    return new;
end;
$$;

drop trigger if exists service_request_events_capture_operations on public.service_request_events;
create trigger service_request_events_capture_operations
after insert on public.service_request_events
for each row execute function public.capture_service_request_operations_event();

create or replace function public.capture_job_workflow_operations_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_actor uuid;
    v_name text;
begin
    select * into v_workflow from public.company_job_workflows where id = new.workflow_id;
    select company_user.id,
           coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member')
      into v_actor, v_name
      from public.company_users as company_user
     where company_user.company_id = new.company_id
       and company_user.auth_user_id = new.created_by_user_id
     order by company_user.created_at desc nulls last
     limit 1;

    insert into public.company_operations_events(
        company_id, subject_company_user_id, actor_company_user_id, actor_name,
        event_type, title, detail, service_request_id, schedule_slot_id, workflow_id,
        source_kind, source_id, metadata, occurred_at
    ) values (
        new.company_id, v_actor, v_actor, coalesce(v_name, 'Team member'),
        new.event_type, new.title, new.detail, v_workflow.service_request_id,
        v_workflow.schedule_slot_id, new.workflow_id, 'job_workflow_event', new.id,
        coalesce(new.metadata, '{}'::jsonb), new.created_at
    ) on conflict do nothing;
    return new;
end;
$$;

drop trigger if exists company_job_events_capture_operations on public.company_job_workflow_events;
create trigger company_job_events_capture_operations
after insert on public.company_job_workflow_events
for each row execute function public.capture_job_workflow_operations_event();

create or replace function public.capture_job_media_operations_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_actor uuid;
    v_name text;
    v_media_kind text;
begin
    select * into v_workflow from public.company_job_workflows where id = new.workflow_id;
    select company_user.id,
           coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member')
      into v_actor, v_name
      from public.company_users as company_user
     where company_user.company_id = new.company_id
       and company_user.auth_user_id = new.created_by_user_id
     order by company_user.created_at desc nulls last
     limit 1;
    v_media_kind := case when lower(coalesce(new.mime_type, '')) like 'video/%' then 'video' else 'photo' end;

    insert into public.company_operations_events(
        company_id, subject_company_user_id, actor_company_user_id, actor_name,
        event_type, title, detail, service_request_id, schedule_slot_id, workflow_id,
        source_kind, source_id, media_bucket, media_storage_path, media_mime_type,
        media_file_name, metadata, occurred_at
    ) values (
        new.company_id, v_actor, v_actor, coalesce(v_name, 'Team member'),
        'job_media_added', coalesce(v_name, 'Team member') || ' added a ' || replace(new.stage, '_', ' ') || ' ' || v_media_kind,
        nullif(btrim(new.caption), ''), v_workflow.service_request_id, v_workflow.schedule_slot_id,
        new.workflow_id, 'job_workflow_attachment', new.id, new.bucket, new.storage_path,
        new.mime_type, new.file_name, jsonb_build_object('stage', new.stage, 'visibility', new.visibility), new.created_at
    ) on conflict do nothing;
    return new;
end;
$$;

drop trigger if exists company_job_attachments_capture_operations on public.company_job_workflow_attachments;
create trigger company_job_attachments_capture_operations
after insert on public.company_job_workflow_attachments
for each row execute function public.capture_job_media_operations_event();

-- Preserve the useful history that already exists before this feature is released.
insert into public.company_operations_events(
    company_id, subject_company_user_id, actor_company_user_id, actor_name,
    event_type, title, source_kind, source_id, occurred_at
)
select entry.company_id, entry.technician_company_user_id, entry.technician_company_user_id,
       coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member'),
       'clock_in', coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member') || ' clocked in',
       'time_entry', entry.id, entry.clocked_in_at
from public.company_technician_time_entries as entry
join public.company_users as company_user on company_user.id = entry.technician_company_user_id
on conflict do nothing;

insert into public.company_operations_events(
    company_id, subject_company_user_id, actor_company_user_id, actor_name,
    event_type, title, source_kind, source_id, occurred_at
)
select entry.company_id, entry.technician_company_user_id, entry.technician_company_user_id,
       coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member'),
       'clock_out', coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member') || ' clocked out',
       'time_entry', entry.id, entry.clocked_out_at
from public.company_technician_time_entries as entry
join public.company_users as company_user on company_user.id = entry.technician_company_user_id
where entry.clocked_out_at is not null
on conflict do nothing;

insert into public.company_operations_events(
    company_id, subject_company_user_id, actor_company_user_id, actor_name,
    event_type, title, detail, service_request_id, schedule_slot_id, workflow_id,
    source_kind, source_id, metadata, occurred_at
)
select event.company_id, company_user.id, company_user.id,
       coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member'),
       event.event_type, event.title, event.detail, workflow.service_request_id, workflow.schedule_slot_id,
       event.workflow_id, 'job_workflow_event', event.id, event.metadata, event.created_at
from public.company_job_workflow_events as event
join public.company_job_workflows as workflow on workflow.id = event.workflow_id
left join public.company_users as company_user
  on company_user.company_id = event.company_id and company_user.auth_user_id = event.created_by_user_id
on conflict do nothing;

insert into public.company_operations_events(
    company_id, subject_company_user_id, actor_company_user_id, actor_name,
    event_type, title, detail, service_request_id, schedule_slot_id, workflow_id,
    source_kind, source_id, media_bucket, media_storage_path, media_mime_type,
    media_file_name, metadata, occurred_at
)
select attachment.company_id, company_user.id, company_user.id,
       coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member'),
       'job_media_added',
       coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member')
           || ' added a ' || replace(attachment.stage, '_', ' ') || ' '
           || case when lower(coalesce(attachment.mime_type, '')) like 'video/%' then 'video' else 'photo' end,
       attachment.caption, workflow.service_request_id, workflow.schedule_slot_id, attachment.workflow_id,
       'job_workflow_attachment', attachment.id, attachment.bucket, attachment.storage_path,
       attachment.mime_type, attachment.file_name,
       jsonb_build_object('stage', attachment.stage, 'visibility', attachment.visibility), attachment.created_at
from public.company_job_workflow_attachments as attachment
join public.company_job_workflows as workflow on workflow.id = attachment.workflow_id
left join public.company_users as company_user
  on company_user.company_id = attachment.company_id and company_user.auth_user_id = attachment.created_by_user_id
on conflict do nothing;

create or replace function public.get_company_operations_rooms(p_company_id uuid)
returns table(
    id uuid, company_id uuid, name text, description text, is_default boolean,
    member_ids uuid[], member_count bigint, can_manage boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if not (public.can_dispatch_company(p_company_id) or public.homeos_is_platform_admin()) then
        raise exception 'Company operations access is required.';
    end if;
    return query
    select room.id, room.company_id, room.name, room.description, room.is_default,
           coalesce(array_agg(member.company_user_id order by member.added_at)
               filter (where member.company_user_id is not null), array[]::uuid[]),
           count(member.company_user_id), public.company_operations_can_manage(p_company_id)
    from public.company_operations_rooms as room
    left join public.company_operations_room_members as member on member.room_id = room.id
    where room.company_id = p_company_id and room.is_active
    group by room.id
    order by room.is_default desc, room.created_at, room.name;
end;
$$;

create or replace function public.get_company_operations_people(p_company_id uuid)
returns table(id uuid, full_name text, email text, role text, status text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if not (public.can_dispatch_company(p_company_id) or public.homeos_is_platform_admin()) then
        raise exception 'Company operations access is required.';
    end if;
    return query
    select company_user.id,
           coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member'),
           company_user.email, coalesce(company_user.role, 'team'), coalesce(company_user.status, 'active')
    from public.company_users as company_user
    where company_user.company_id = p_company_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by lower(coalesce(company_user.full_name, company_user.email, '')), company_user.created_at;
end;
$$;

create or replace function public.save_company_operations_room(
    p_company_id uuid,
    p_room_id uuid,
    p_name text,
    p_description text,
    p_member_ids uuid[]
)
returns public.company_operations_rooms
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_room public.company_operations_rooms%rowtype;
    v_name text := nullif(btrim(coalesce(p_name, '')), '');
    v_member_id uuid;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if not public.company_operations_can_manage(p_company_id) then
        raise exception 'Owner, admin, manager, or supervisor access is required to manage Operations Rooms.';
    end if;
    if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 80 then
        raise exception 'Room name must be between 2 and 80 characters.';
    end if;
    if coalesce(cardinality(p_member_ids), 0) = 0 then
        raise exception 'Choose at least one team member for this room.';
    end if;

    if p_room_id is null then
        insert into public.company_operations_rooms(company_id, name, description)
        values(p_company_id, v_name, nullif(btrim(coalesce(p_description, '')), ''))
        returning * into v_room;
    else
        update public.company_operations_rooms
           set name = v_name,
               description = nullif(btrim(coalesce(p_description, '')), ''),
               updated_at = now()
         where id = p_room_id and company_id = p_company_id and is_active and not is_default
        returning * into v_room;
        if not found then raise exception 'Custom Operations Room not found.'; end if;
        delete from public.company_operations_room_members where room_id = v_room.id;
    end if;

    foreach v_member_id in array p_member_ids loop
        if not exists (
            select 1 from public.company_users as company_user
            where company_user.id = v_member_id and company_user.company_id = p_company_id
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
        ) then raise exception 'Every room member must be an active user in this company.'; end if;
        insert into public.company_operations_room_members(room_id, company_id, company_user_id)
        values(v_room.id, p_company_id, v_member_id)
        on conflict do nothing;
    end loop;
    return v_room;
end;
$$;

create or replace function public.post_company_operations_update(
    p_company_id uuid,
    p_room_id uuid,
    p_message text
)
returns public.company_operations_events
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_actor public.company_users%rowtype;
    v_event public.company_operations_events%rowtype;
    v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if not (public.can_dispatch_company(p_company_id) or public.homeos_is_platform_admin()) then
        raise exception 'Company operations access is required.';
    end if;
    if not exists (
        select 1 from public.company_operations_rooms room
        where room.id = p_room_id and room.company_id = p_company_id and room.is_active
    ) then raise exception 'Operations Room not found.'; end if;
    if v_message is null or char_length(v_message) > 2000 then
        raise exception 'Update must be between 1 and 2000 characters.';
    end if;
    select * into v_actor from public.company_users
     where company_id = p_company_id and auth_user_id = auth.uid()
       and lower(btrim(coalesce(status, ''))) = 'active'
     order by created_at desc nulls last limit 1;

    insert into public.company_operations_events(
        company_id, target_room_id, subject_company_user_id, actor_company_user_id,
        actor_name, event_type, title, detail, source_kind, source_id, occurred_at
    ) values (
        p_company_id, p_room_id, v_actor.id, v_actor.id,
        coalesce(nullif(btrim(v_actor.full_name), ''), split_part(coalesce(v_actor.email, ''), '@', 1), 'Platform administrator'),
        'room_update', 'Room update', v_message, 'operations_room_update', gen_random_uuid(), now()
    ) returning * into v_event;
    return v_event;
end;
$$;

create or replace function public.get_company_operations_events(
    p_company_id uuid,
    p_room_id uuid,
    p_start_at timestamptz,
    p_end_at timestamptz
)
returns table(
    id uuid, company_id uuid, subject_company_user_id uuid, actor_company_user_id uuid,
    actor_name text, event_type text, title text, detail text, service_request_id uuid,
    schedule_slot_id uuid, workflow_id uuid, display_code text, source_kind text,
    source_id uuid, media_bucket text, media_storage_path text, media_mime_type text,
    media_file_name text, metadata jsonb, occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_room public.company_operations_rooms%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if not (public.can_dispatch_company(p_company_id) or public.homeos_is_platform_admin()) then
        raise exception 'Company operations access is required.';
    end if;
    if p_end_at <= p_start_at or p_end_at - p_start_at > interval '93 days' then
        raise exception 'Choose a valid date range of 93 days or fewer.';
    end if;
    select * into v_room from public.company_operations_rooms
     where company_operations_rooms.id = p_room_id and company_operations_rooms.company_id = p_company_id and is_active;
    if not found then raise exception 'Operations Room not found.'; end if;

    return query
    select event.id, event.company_id, event.subject_company_user_id, event.actor_company_user_id,
           event.actor_name, event.event_type, event.title, event.detail, event.service_request_id,
           event.schedule_slot_id, event.workflow_id, request.display_code, event.source_kind,
           event.source_id, event.media_bucket, event.media_storage_path, event.media_mime_type,
           event.media_file_name, event.metadata, event.occurred_at
    from public.company_operations_events as event
    left join public.service_requests as request on request.id = event.service_request_id
    where event.company_id = p_company_id
      and event.occurred_at >= p_start_at and event.occurred_at < p_end_at
      and (
          event.target_room_id = p_room_id
          or (
              event.target_room_id is null
              and (
                  v_room.is_default
                  or event.subject_company_user_id is null
                  or exists (
                      select 1 from public.company_operations_room_members as member
                      where member.room_id = p_room_id
                        and member.company_user_id = event.subject_company_user_id
                  )
              )
          )
      )
    order by event.occurred_at desc, event.id desc
    limit 1000;
end;
$$;

create or replace function public.get_company_operations_roster(
    p_company_id uuid,
    p_room_id uuid,
    p_day_start_at timestamptz,
    p_day_end_at timestamptz
)
returns table(
    company_user_id uuid, full_name text, email text, role text,
    activity_status text, status_label text, clocked_in_at timestamptz,
    clocked_out_at timestamptz, service_request_id uuid, display_code text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_room public.company_operations_rooms%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if not (public.can_dispatch_company(p_company_id) or public.homeos_is_platform_admin()) then
        raise exception 'Company operations access is required.';
    end if;
    select * into v_room from public.company_operations_rooms
     where company_operations_rooms.id = p_room_id and company_operations_rooms.company_id = p_company_id and is_active;
    if not found then raise exception 'Operations Room not found.'; end if;

    return query
    select company_user.id,
           coalesce(nullif(btrim(company_user.full_name), ''), split_part(coalesce(company_user.email, ''), '@', 1), 'Team member'),
           company_user.email, coalesce(company_user.role, 'team'),
           case
               when time_entry.id is null then 'not_clocked_in'
               when time_entry.clocked_out_at is not null then 'clocked_out'
               when time_entry.break_started_at is not null and time_entry.break_ended_at is null then 'on_break'
               when time_entry.rest_break_started_at is not null then 'on_break'
               when workflow.status = 'store_trip' then 'at_store'
               when lower(coalesce(slot.status, '')) in ('on_my_way', 'en_route', 'traveling') then 'on_my_way'
               when lower(coalesce(slot.status, '')) in ('arrived', 'working', 'in_progress') then 'on_job'
               else 'available'
           end,
           case
               when time_entry.id is null then 'Not clocked in'
               when time_entry.clocked_out_at is not null then 'Clocked out'
               when time_entry.break_started_at is not null and time_entry.break_ended_at is null then 'At lunch'
               when time_entry.rest_break_started_at is not null then 'On rest break'
               when workflow.status = 'store_trip' then 'At the store'
               when lower(coalesce(slot.status, '')) in ('on_my_way', 'en_route', 'traveling') then 'On the way'
               when lower(coalesce(slot.status, '')) in ('arrived', 'working', 'in_progress') then 'On a job'
               else 'Available'
           end,
           time_entry.clocked_in_at, time_entry.clocked_out_at, slot.service_request_id, request.display_code
    from public.company_users as company_user
    left join lateral (
        select entry.* from public.company_technician_time_entries as entry
        where entry.technician_company_user_id = company_user.id
          and entry.clocked_in_at < p_day_end_at
          and coalesce(entry.clocked_out_at, p_day_end_at) >= p_day_start_at
        order by entry.clocked_in_at desc limit 1
    ) as time_entry on true
    left join lateral (
        select schedule.* from public.job_schedule_slots as schedule
        where schedule.company_id = p_company_id
          and schedule.technician_company_user_id = company_user.id
          and lower(coalesce(schedule.status, '')) not in ('completed', 'closed', 'cancelled', 'canceled', 'archived')
        order by schedule.updated_at desc nulls last, schedule.start_at desc limit 1
    ) as slot on true
    left join public.service_requests as request on request.id = slot.service_request_id
    left join lateral (
        select job_workflow.status from public.company_job_workflows as job_workflow
        where job_workflow.company_id = p_company_id
          and (job_workflow.schedule_slot_id = slot.id or job_workflow.service_request_id = slot.service_request_id)
        order by job_workflow.updated_at desc limit 1
    ) as workflow on true
    where company_user.company_id = p_company_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
      and (
          v_room.is_default
          or exists (
              select 1 from public.company_operations_room_members as member
              where member.room_id = p_room_id and member.company_user_id = company_user.id
          )
      )
    order by
        case
            when time_entry.id is not null and time_entry.clocked_out_at is null then 0
            when time_entry.id is not null then 1
            else 2
        end,
        lower(coalesce(company_user.full_name, company_user.email, ''));
end;
$$;

revoke all on function public.get_company_operations_rooms(uuid) from public, anon;
revoke all on function public.get_company_operations_people(uuid) from public, anon;
revoke all on function public.save_company_operations_room(uuid,uuid,text,text,uuid[]) from public, anon;
revoke all on function public.post_company_operations_update(uuid,uuid,text) from public, anon;
revoke all on function public.get_company_operations_events(uuid,uuid,timestamptz,timestamptz) from public, anon;
revoke all on function public.get_company_operations_roster(uuid,uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_company_operations_rooms(uuid) to authenticated;
grant execute on function public.get_company_operations_people(uuid) to authenticated;
grant execute on function public.save_company_operations_room(uuid,uuid,text,text,uuid[]) to authenticated;
grant execute on function public.post_company_operations_update(uuid,uuid,text) to authenticated;
grant execute on function public.get_company_operations_events(uuid,uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.get_company_operations_roster(uuid,uuid,timestamptz,timestamptz) to authenticated;

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'company_operations_events'
       ) then
        alter publication supabase_realtime add table public.company_operations_events;
    end if;
end;
$$;

commit;
