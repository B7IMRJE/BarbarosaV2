begin;

create table if not exists public.company_technician_devices (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    technician_company_user_id uuid not null references public.company_users(id) on delete cascade,
    device_key text not null,
    device_role text not null,
    device_label text,
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint company_technician_devices_role_check
        check (device_role in ('primary_phone', 'companion_tablet')),
    unique (technician_company_user_id, device_role),
    unique (technician_company_user_id, device_key)
);

alter table public.company_technician_devices enable row level security;
drop policy if exists company_technician_devices_select on public.company_technician_devices;
create policy company_technician_devices_select on public.company_technician_devices
for select to authenticated using (
    exists (
        select 1 from public.company_users company_user
        where company_user.id=technician_company_user_id
          and company_user.auth_user_id=auth.uid()
          and lower(btrim(coalesce(company_user.status,'')))='active'
    ) or public.can_dispatch_company(company_id)
);

create table if not exists public.company_time_approval_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    technician_company_user_id uuid not null references public.company_users(id) on delete cascade,
    time_entry_id uuid not null references public.company_technician_time_entries(id) on delete cascade,
    approval_type text not null,
    status text not null default 'pending',
    requested_at timestamptz not null default now(),
    reviewed_by_user_id uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz,
    review_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_time_approval_requests_type_check
        check (approval_type in ('early_clock_in', 'overtime')),
    constraint company_time_approval_requests_status_check
        check (status in ('pending', 'approved', 'denied')),
    unique (time_entry_id, approval_type)
);

alter table public.company_time_approval_requests enable row level security;
drop policy if exists company_time_approval_requests_select on public.company_time_approval_requests;
create policy company_time_approval_requests_select on public.company_time_approval_requests
for select to authenticated using (
    exists (
        select 1 from public.company_users company_user
        where company_user.id=technician_company_user_id
          and company_user.auth_user_id=auth.uid()
          and lower(btrim(coalesce(company_user.status,'')))='active'
    ) or public.can_dispatch_company(company_id)
);

create or replace function public.register_company_technician_device(
    p_technician_company_user_id uuid,
    p_device_key text,
    p_device_role text,
    p_device_label text default null
)
returns public.company_technician_devices
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
    v_user public.company_users%rowtype;
    v_device public.company_technician_devices%rowtype;
    v_role text := lower(btrim(coalesce(p_device_role,'')));
begin
    select * into v_user from public.company_users
    where id=p_technician_company_user_id and auth_user_id=auth.uid()
      and lower(btrim(coalesce(status,'')))='active';
    if not found then raise exception 'Active technician access is required.'; end if;
    if v_role not in ('primary_phone','companion_tablet') then raise exception 'Unknown device role.'; end if;
    if char_length(btrim(coalesce(p_device_key,''))) < 16 then raise exception 'A valid device key is required.'; end if;

    select * into v_device from public.company_technician_devices
    where technician_company_user_id=v_user.id and device_key=btrim(p_device_key);
    if found then
        update public.company_technician_devices set last_seen_at=now(), device_label=coalesce(nullif(btrim(p_device_label),''),device_label)
        where id=v_device.id returning * into v_device;
        return v_device;
    end if;

    if exists (select 1 from public.company_technician_devices where technician_company_user_id=v_user.id and device_role=v_role) then
        raise exception 'This technician already has a registered % device. Dispatch must replace it.', replace(v_role,'_',' ');
    end if;
    insert into public.company_technician_devices(company_id,technician_company_user_id,device_key,device_role,device_label)
    values(v_user.company_id,v_user.id,btrim(p_device_key),v_role,nullif(btrim(p_device_label),''))
    returning * into v_device;
    return v_device;
end;
$$;

create or replace function public.request_company_time_approval(
    p_technician_company_user_id uuid,
    p_approval_type text
)
returns public.company_time_approval_requests
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
    v_user public.company_users%rowtype;
    v_entry public.company_technician_time_entries%rowtype;
    v_request public.company_time_approval_requests%rowtype;
    v_type text := lower(btrim(coalesce(p_approval_type,'')));
begin
    select * into v_user from public.company_users where id=p_technician_company_user_id
      and auth_user_id=auth.uid() and lower(btrim(coalesce(status,'')))='active';
    if not found then raise exception 'Active technician access is required.'; end if;
    if v_type not in ('early_clock_in','overtime') then raise exception 'Unknown approval type.'; end if;
    select * into v_entry from public.company_technician_time_entries
    where technician_company_user_id=v_user.id and clocked_out_at is null
    order by clocked_in_at desc limit 1;
    if not found then raise exception 'An open shift is required.'; end if;
    insert into public.company_time_approval_requests(company_id,technician_company_user_id,time_entry_id,approval_type)
    values(v_user.company_id,v_user.id,v_entry.id,v_type)
    on conflict(time_entry_id,approval_type) do update set updated_at=now()
    returning * into v_request;
    return v_request;
end;
$$;

create or replace function public.review_company_time_approval(
    p_request_id uuid,
    p_decision text,
    p_review_note text default null
)
returns public.company_time_approval_requests
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
    v_request public.company_time_approval_requests%rowtype;
    v_decision text := lower(btrim(coalesce(p_decision,'')));
begin
    select * into v_request from public.company_time_approval_requests where id=p_request_id for update;
    if not found then raise exception 'Time approval request not found.'; end if;
    if not public.can_dispatch_company(v_request.company_id) then raise exception 'Dispatch access is required.'; end if;
    if v_request.status <> 'pending' then raise exception 'This request was already reviewed.'; end if;
    if v_decision not in ('approved','denied') then raise exception 'Decision must be approved or denied.'; end if;
    update public.company_time_approval_requests set status=v_decision,reviewed_by_user_id=auth.uid(),
      reviewed_at=now(),review_note=nullif(btrim(p_review_note),''),updated_at=now()
    where id=v_request.id returning * into v_request;
    return v_request;
end;
$$;

revoke all on function public.register_company_technician_device(uuid,text,text,text) from public,anon;
revoke all on function public.request_company_time_approval(uuid,text) from public,anon;
revoke all on function public.review_company_time_approval(uuid,text,text) from public,anon;
grant execute on function public.register_company_technician_device(uuid,text,text,text) to authenticated;
grant execute on function public.request_company_time_approval(uuid,text) to authenticated;
grant execute on function public.review_company_time_approval(uuid,text,text) to authenticated;

-- Existing clock-ins before 8:00 AM create an auditable pending request.
create or replace function public.create_early_clock_in_approval()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
    if timezone('America/Los_Angeles',new.clocked_in_at)::time < time '08:00' then
        insert into public.company_time_approval_requests(company_id,technician_company_user_id,time_entry_id,approval_type)
        values(new.company_id,new.technician_company_user_id,new.id,'early_clock_in')
        on conflict(time_entry_id,approval_type) do nothing;
    end if;
    return new;
end;
$$;
drop trigger if exists company_time_entry_early_approval on public.company_technician_time_entries;
create trigger company_time_entry_early_approval after insert on public.company_technician_time_entries
for each row execute function public.create_early_clock_in_approval();

commit;
