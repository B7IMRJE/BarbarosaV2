-- Keep structural access facts on the permanent property record while storing
-- gate codes behind RPC-only authorization instead of exposing them through the
-- broadly readable properties row.

begin;

do $$
begin
    if to_regclass('public.properties') is null
       or to_regclass('public.property_memberships') is null
       or to_regclass('public.service_requests') is null
       or to_regclass('public.companies') is null then
        raise exception 'Home story and gate access require properties, property memberships, companies, and service requests.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null
       or to_regprocedure('public.homeos_can_read_company_home_profile(uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.create_homeowner_service_request(uuid,uuid,text,text,text)') is null
       or to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'Home story and gate access require the existing HomeOS authorization functions.';
    end if;
end;
$$;

alter table public.properties
    add column if not exists homeowner_story_count text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'properties_homeowner_story_count_check'
          and conrelid = 'public.properties'::regclass
    ) then
        alter table public.properties
        add constraint properties_homeowner_story_count_check
        check (
            homeowner_story_count is null
            or homeowner_story_count in ('1', '2', '3', '4', '4_plus')
        );
    end if;
end;
$$;

create table if not exists public.property_access_details (
    property_id uuid primary key references public.properties(id) on delete cascade,
    gate_code text,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id) on delete set null,
    constraint property_access_details_gate_code_length_check check (
        gate_code is null or char_length(gate_code) <= 80
    )
);

alter table public.property_access_details enable row level security;
revoke all privileges on table public.property_access_details from public, anon, authenticated;

create table if not exists public.service_request_access_details (
    service_request_id uuid primary key references public.service_requests(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    access_instructions text,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id) on delete set null,
    constraint service_request_access_details_length_check check (
        access_instructions is null or char_length(access_instructions) <= 1000
    )
);

create index if not exists service_request_access_details_company_idx
    on public.service_request_access_details (company_id, service_request_id);

alter table public.service_request_access_details enable row level security;
revoke all privileges on table public.service_request_access_details from public, anon, authenticated;

create or replace function public.update_my_home_structure_access(
    p_property_id uuid,
    p_story_count text,
    p_gate_code text
)
returns table (property_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_story_count text := nullif(btrim(coalesce(p_story_count, '')), '');
    v_gate_code text := nullif(btrim(coalesce(p_gate_code, '')), '');
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    if not exists (
        select 1
        from public.property_memberships as membership
        where membership.property_id = p_property_id
          and membership.user_id = v_user_id
          and upper(btrim(coalesce(membership.role, ''))) = 'OWNER'
          and lower(btrim(coalesce(membership.status, ''))) = 'active'
    ) then
        raise exception 'Not authorized to update this home access record' using errcode = '42501';
    end if;

    if v_story_count is null
       or v_story_count not in ('1', '2', '3', '4', '4_plus') then
        raise exception 'Story count is invalid' using errcode = '22023';
    end if;

    if char_length(coalesce(v_gate_code, '')) > 80 then
        raise exception 'Gate code is too long' using errcode = '22023';
    end if;

    update public.properties as property
    set homeowner_story_count = v_story_count,
        homeowner_profile_updated_at = now(),
        homeowner_profile_updated_by = v_user_id
    where property.id = p_property_id;

    insert into public.property_access_details as access_detail (
        property_id,
        gate_code,
        updated_at,
        updated_by
    )
    values (
        p_property_id,
        v_gate_code,
        now(),
        v_user_id
    )
    on conflict (property_id)
    do update set
        gate_code = excluded.gate_code,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

    return query select p_property_id;
end;
$$;

create or replace function public.get_my_home_structure_access(p_property_id uuid)
returns table (
    homeowner_story_count text,
    gate_code text,
    access_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.homeos_can_read_property_record(p_property_id) then
        raise exception 'Not authorized to read this home access record' using errcode = '42501';
    end if;

    return query
    select
        property.homeowner_story_count,
        access_detail.gate_code,
        access_detail.updated_at
    from public.properties as property
    left join public.property_access_details as access_detail
      on access_detail.property_id = property.id
    where property.id = p_property_id;
end;
$$;

create or replace function public.get_company_home_structure_access(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns table (
    homeowner_story_count text,
    gate_code text,
    access_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.homeos_can_read_company_home_profile(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Not authorized to read this client access record' using errcode = '42501';
    end if;

    return query
    select
        property.homeowner_story_count,
        access_detail.gate_code,
        access_detail.updated_at
    from public.properties as property
    left join public.property_access_details as access_detail
      on access_detail.property_id = property.id
    where property.id = p_property_id;
end;
$$;

create or replace function public.create_homeowner_service_request_with_access(
    p_property_id uuid,
    p_company_id uuid,
    p_request_type text default 'regular',
    p_issue_summary text default '',
    p_priority text default null,
    p_access_instructions text default null
)
returns table (
    service_request_id uuid,
    display_sequence bigint,
    display_code text,
    company_id uuid,
    property_id uuid,
    request_type text,
    status text,
    priority text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_access_instructions text := nullif(btrim(coalesce(p_access_instructions, '')), '');
    v_receipt record;
begin
    if char_length(coalesce(v_access_instructions, '')) > 1000 then
        raise exception 'Property access instructions are too long' using errcode = '22023';
    end if;

    select *
    into v_receipt
    from public.create_homeowner_service_request(
        p_property_id,
        p_company_id,
        p_request_type,
        p_issue_summary,
        p_priority
    );

    if v_access_instructions is not null then
        insert into public.service_request_access_details (
            service_request_id,
            company_id,
            property_id,
            access_instructions,
            updated_at,
            updated_by
        )
        values (
            v_receipt.service_request_id,
            v_receipt.company_id,
            v_receipt.property_id,
            v_access_instructions,
            now(),
            v_user_id
        );
    end if;

    return query
    select
        v_receipt.service_request_id::uuid,
        v_receipt.display_sequence::bigint,
        v_receipt.display_code::text,
        v_receipt.company_id::uuid,
        v_receipt.property_id::uuid,
        v_receipt.request_type::text,
        v_receipt.status::text,
        v_receipt.priority::text,
        v_receipt.created_at::timestamptz;
end;
$$;

create or replace function public.get_company_service_request_access(p_company_id uuid)
returns table (
    service_request_id uuid,
    access_instructions text,
    access_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null or not public.can_dispatch_company(p_company_id) then
        raise exception 'Not authorized to read property access instructions for this company' using errcode = '42501';
    end if;

    return query
    select
        access_detail.service_request_id,
        access_detail.access_instructions,
        access_detail.updated_at
    from public.service_request_access_details as access_detail
    where access_detail.company_id = p_company_id;
end;
$$;

revoke all on function public.update_my_home_structure_access(uuid, text, text) from public, anon;
revoke all on function public.get_my_home_structure_access(uuid) from public, anon;
revoke all on function public.get_company_home_structure_access(uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.create_homeowner_service_request_with_access(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.get_company_service_request_access(uuid) from public, anon;

grant execute on function public.update_my_home_structure_access(uuid, text, text) to authenticated;
grant execute on function public.get_my_home_structure_access(uuid) to authenticated;
grant execute on function public.get_company_home_structure_access(uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.create_homeowner_service_request_with_access(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.get_company_service_request_access(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
