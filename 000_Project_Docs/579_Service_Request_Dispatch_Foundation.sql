-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Add the first Service Request -> Dispatch Board foundation.
--   HomeOS homeowners create service requests for their selected provider.
--   Company dispatchers review requests before converting them to jobs.
--
-- Product rules:
--   - HomeOS can request regular or emergency service.
--   - Dispatch Board / Service Desk is the operator intake screen.
--   - TechOS is only for technicians after jobs are assigned.
--   - Private HomeOS photos/docs/history are not exposed by these RPCs.

begin;

do $$
begin
    if to_regclass('public.properties') is null then
        raise exception 'public.properties is required before service requests can be installed.';
    end if;

    if to_regclass('public.property_memberships') is null then
        raise exception 'public.property_memberships is required before service requests can be installed.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before service requests can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before service requests can be installed.';
    end if;

    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required before service requests can be installed.';
    end if;

    if to_regclass('public.property_preferred_providers') is null then
        raise exception 'public.property_preferred_providers is required before service requests can be installed.';
    end if;

    if to_regclass('public.jobs') is null then
        raise exception 'public.jobs is required before service request conversion can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null then
        raise exception 'public.homeos_can_read_property_record(uuid) is required before service requests can be installed.';
    end if;

    if to_regprocedure('public.is_platform_admin()') is null then
        raise exception 'public.is_platform_admin() is required before service requests can be installed.';
    end if;
end
$$;

create table if not exists public.service_requests (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    company_property_client_id uuid null references public.company_property_clients(id) on delete set null,
    requested_by_user_id uuid not null references auth.users(id) on delete cascade,
    request_type text not null default 'regular',
    status text not null default 'new',
    priority text not null default 'normal',
    issue_summary text not null,
    customer_display_name text null,
    property_display_name text null,
    property_address text null,
    property_city text null,
    property_state text null,
    property_postal_code text null,
    acknowledged_by_user_id uuid null references auth.users(id) on delete set null,
    acknowledged_at timestamptz null,
    converted_job_id uuid null references public.jobs(id) on delete set null,
    converted_by_user_id uuid null references auth.users(id) on delete set null,
    converted_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint service_requests_request_type_check
        check (lower(btrim(request_type)) in ('regular', 'emergency')),
    constraint service_requests_status_check
        check (lower(btrim(status)) in ('new', 'acknowledged', 'converted_to_job', 'cancelled')),
    constraint service_requests_priority_check
        check (lower(btrim(priority)) in ('low', 'normal', 'high', 'emergency'))
);

create index if not exists service_requests_property_id_idx
on public.service_requests (property_id);

create index if not exists service_requests_company_status_idx
on public.service_requests (company_id, status, created_at desc);

create index if not exists service_requests_requested_by_user_id_idx
on public.service_requests (requested_by_user_id);

create index if not exists service_requests_converted_job_id_idx
on public.service_requests (converted_job_id);

alter table public.service_requests enable row level security;

create or replace function public.can_dispatch_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           public.is_platform_admin()
           or exists (
               select 1
               from public.company_users company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'admin', 'manager')
           )
       );
$$;

drop policy if exists service_requests_select_homeowner_or_dispatch on public.service_requests;
create policy service_requests_select_homeowner_or_dispatch
on public.service_requests
for select
to authenticated
using (
    requested_by_user_id = auth.uid()
    or public.can_dispatch_company(company_id)
);

create or replace function public.create_homeowner_service_request(
    p_property_id uuid,
    p_company_id uuid,
    p_request_type text default 'regular',
    p_issue_summary text default '',
    p_priority text default null
)
returns table (
    service_request_id uuid,
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
    v_request_type text := lower(btrim(coalesce(p_request_type, 'regular')));
    v_priority text := lower(btrim(coalesce(p_priority, '')));
    v_summary text := nullif(btrim(coalesce(p_issue_summary, '')), '');
    v_property public.properties%rowtype;
    v_company_client public.company_property_clients%rowtype;
    v_request public.service_requests%rowtype;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_property_id is null or p_company_id is null then
        raise exception 'Property and provider company are required.';
    end if;

    if not public.homeos_can_read_property_record(p_property_id) then
        raise exception 'Not authorized to request service for this property.';
    end if;

    if v_request_type not in ('regular', 'emergency') then
        raise exception 'request_type must be regular or emergency.';
    end if;

    if v_summary is null then
        raise exception 'Issue summary is required.';
    end if;

    if v_priority = '' then
        v_priority := case when v_request_type = 'emergency' then 'emergency' else 'normal' end;
    end if;

    if v_priority not in ('low', 'normal', 'high', 'emergency') then
        raise exception 'priority must be low, normal, high, or emergency.';
    end if;

    select *
    into v_property
    from public.properties property
    where property.id = p_property_id;

    if not found then
        raise exception 'Property not found.';
    end if;

    select company_client.*
    into v_company_client
    from public.company_property_clients company_client
    join public.property_preferred_providers preferred_provider
      on preferred_provider.property_id = company_client.property_id
     and preferred_provider.company_id = company_client.company_id
     and lower(btrim(coalesce(preferred_provider.status, ''))) = 'active'
    where company_client.property_id = p_property_id
      and company_client.company_id = p_company_id
      and lower(btrim(coalesce(company_client.status, ''))) = 'active'
    order by company_client.connected_at desc nulls last,
             company_client.created_at desc nulls last,
             company_client.id desc
    limit 1;

    if not found then
        raise exception 'Choose a provider before requesting service.';
    end if;

    insert into public.service_requests (
        property_id,
        company_id,
        company_property_client_id,
        requested_by_user_id,
        request_type,
        status,
        priority,
        issue_summary,
        customer_display_name,
        property_display_name,
        property_address,
        property_city,
        property_state,
        property_postal_code
    )
    values (
        p_property_id,
        p_company_id,
        v_company_client.id,
        v_user_id,
        v_request_type,
        'new',
        v_priority,
        v_summary,
        v_company_client.display_name,
        v_property.name,
        coalesce(v_property.address_line_1, v_property.address),
        v_property.city,
        v_property.state,
        coalesce(v_property.postal_code, v_property.zip)
    )
    returning *
    into v_request;

    return query
    select
        v_request.id,
        v_request.company_id,
        v_request.property_id,
        v_request.request_type,
        v_request.status,
        v_request.priority,
        v_request.created_at;
end;
$$;

create or replace function public.get_company_dispatch_requests(
    p_company_id uuid
)
returns table (
    id uuid,
    company_id uuid,
    property_id uuid,
    company_property_client_id uuid,
    request_type text,
    status text,
    priority text,
    issue_summary text,
    customer_display_name text,
    property_display_name text,
    property_address text,
    property_city text,
    property_state text,
    property_postal_code text,
    created_at timestamptz,
    acknowledged_at timestamptz,
    converted_job_id uuid,
    converted_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.can_dispatch_company(p_company_id) then
        raise exception 'Not authorized to view dispatch requests for this company.';
    end if;

    return query
    select
        request.id,
        request.company_id,
        request.property_id,
        request.company_property_client_id,
        request.request_type,
        request.status,
        request.priority,
        request.issue_summary,
        request.customer_display_name,
        request.property_display_name,
        request.property_address,
        request.property_city,
        request.property_state,
        request.property_postal_code,
        request.created_at,
        request.acknowledged_at,
        request.converted_job_id,
        request.converted_at
    from public.service_requests request
    where request.company_id = p_company_id
    order by request.created_at desc nulls last, request.id desc;
end;
$$;

create or replace function public.acknowledge_service_request(
    p_service_request_id uuid
)
returns public.service_requests
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select *
    into v_request
    from public.service_requests
    where id = p_service_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if not public.can_dispatch_company(v_request.company_id) then
        raise exception 'Not authorized to acknowledge this service request.';
    end if;

    if lower(btrim(coalesce(v_request.status, ''))) = 'converted_to_job' then
        raise exception 'Converted service requests cannot be acknowledged.';
    end if;

    update public.service_requests
    set status = 'acknowledged',
        acknowledged_by_user_id = auth.uid(),
        acknowledged_at = coalesce(acknowledged_at, now()),
        updated_at = now()
    where id = p_service_request_id
    returning *
    into v_request;

    return v_request;
end;
$$;

create or replace function public.convert_service_request_to_job(
    p_service_request_id uuid,
    p_title text default null
)
returns table (
    service_request_id uuid,
    job_id uuid,
    company_id uuid,
    property_id uuid,
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_job public.jobs%rowtype;
    v_title text;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select *
    into v_request
    from public.service_requests
    where id = p_service_request_id
    for update;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if not public.can_dispatch_company(v_request.company_id) then
        raise exception 'Not authorized to convert this service request.';
    end if;

    if v_request.converted_job_id is not null then
        return query
        select
            v_request.id,
            v_request.converted_job_id,
            v_request.company_id,
            v_request.property_id,
            v_request.status;
        return;
    end if;

    v_title := coalesce(nullif(btrim(p_title), ''), left(v_request.issue_summary, 80), 'Service Request');

    insert into public.jobs (
        user_id,
        property_id,
        company_id,
        company_property_client_id,
        title,
        status,
        priority,
        job_source,
        job_type,
        visibility_status,
        dispatch_status,
        created_by,
        updated_at
    )
    values (
        auth.uid(),
        v_request.property_id,
        v_request.company_id,
        v_request.company_property_client_id,
        v_title,
        'open',
        v_request.priority,
        'homeowner_service_request',
        'service_request',
        'company_basic',
        'not_dispatched',
        auth.uid(),
        now()
    )
    returning *
    into v_job;

    update public.service_requests
    set status = 'converted_to_job',
        converted_job_id = v_job.id,
        converted_by_user_id = auth.uid(),
        converted_at = now(),
        updated_at = now()
    where id = v_request.id
    returning *
    into v_request;

    return query
    select
        v_request.id,
        v_job.id,
        v_request.company_id,
        v_request.property_id,
        v_request.status;
end;
$$;

revoke all on table public.service_requests from public;
revoke all on table public.service_requests from anon;
revoke insert, update, delete on table public.service_requests from authenticated;
grant select on table public.service_requests to authenticated;

revoke all on function public.can_dispatch_company(uuid) from public;
revoke all on function public.can_dispatch_company(uuid) from anon;
grant execute on function public.can_dispatch_company(uuid) to authenticated;

revoke all on function public.create_homeowner_service_request(uuid, uuid, text, text, text) from public;
revoke all on function public.create_homeowner_service_request(uuid, uuid, text, text, text) from anon;
grant execute on function public.create_homeowner_service_request(uuid, uuid, text, text, text) to authenticated;

revoke all on function public.get_company_dispatch_requests(uuid) from public;
revoke all on function public.get_company_dispatch_requests(uuid) from anon;
grant execute on function public.get_company_dispatch_requests(uuid) to authenticated;

revoke all on function public.acknowledge_service_request(uuid) from public;
revoke all on function public.acknowledge_service_request(uuid) from anon;
grant execute on function public.acknowledge_service_request(uuid) to authenticated;

revoke all on function public.convert_service_request_to_job(uuid, text) from public;
revoke all on function public.convert_service_request_to_job(uuid, text) from anon;
grant execute on function public.convert_service_request_to_job(uuid, text) to authenticated;

commit;

select
    to_regclass('public.service_requests') is not null as service_requests_exists,
    to_regprocedure('public.create_homeowner_service_request(uuid,uuid,text,text,text)') is not null as create_request_rpc_exists,
    to_regprocedure('public.get_company_dispatch_requests(uuid)') is not null as dispatch_requests_rpc_exists,
    to_regprocedure('public.acknowledge_service_request(uuid)') is not null as acknowledge_request_rpc_exists,
    to_regprocedure('public.convert_service_request_to_job(uuid,text)') is not null as convert_request_rpc_exists;
