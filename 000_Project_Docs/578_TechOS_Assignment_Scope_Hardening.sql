-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Harden the TechOS assignment foundation before it goes live.
--   This file keeps 577 intact, but should be reviewed/applied instead of 577
--   if assignment scope is being installed for the first time.
--
-- Product rules:
--   - ManagementOS creates and dispatches jobs.
--   - TechOS is the assigned technician field workspace.
--   - Technicians can only load jobs assigned to their auth user.
--   - Managers/admins/owners/platform admins can load company-level preview
--     and dispatch-safe job details.
--   - Private HomeOS photos/docs/history are not returned here.

begin;

do $$
begin
    if to_regclass('public.jobs') is null then
        raise exception 'public.jobs is required before TechOS assignment hardening can be installed.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before TechOS assignment hardening can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before TechOS assignment hardening can be installed.';
    end if;

    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required before TechOS assignment hardening can be installed.';
    end if;

    if to_regclass('public.properties') is null then
        raise exception 'public.properties is required before TechOS assignment hardening can be installed.';
    end if;

    if to_regclass('public.profiles') is null then
        raise exception 'public.profiles is required before TechOS assignment hardening can be installed.';
    end if;

    if to_regprocedure('public.can_manage_company_users(uuid)') is null then
        raise exception 'public.can_manage_company_users(uuid) is required before TechOS assignment hardening can be installed.';
    end if;

    if to_regprocedure('public.is_active_company_member(uuid)') is null then
        raise exception 'public.is_active_company_member(uuid) is required before TechOS assignment hardening can be installed.';
    end if;

    if to_regprocedure('public.is_platform_admin()') is null then
        raise exception 'public.is_platform_admin() is required before TechOS assignment hardening can be installed.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'jobs'
          and column_name = 'company_id'
    ) then
        raise exception 'public.jobs.company_id is required before TechOS assignment hardening can be installed.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'jobs'
          and column_name = 'property_id'
    ) then
        raise exception 'public.jobs.property_id is required before TechOS assignment hardening can be installed.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'company_users'
          and column_name = 'auth_user_id'
    ) then
        raise exception 'public.company_users.auth_user_id is required before TechOS assignment hardening can be installed.';
    end if;
end
$$;

create table if not exists public.job_assignments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    job_id uuid not null references public.jobs(id) on delete cascade,
    technician_company_user_id uuid not null references public.company_users(id) on delete cascade,
    technician_auth_user_id uuid not null,
    role_on_job text not null default 'primary',
    status text not null default 'assigned',
    assigned_by_user_id uuid null references public.profiles(id) on delete set null,
    assigned_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint job_assignments_role_check
        check (lower(btrim(role_on_job)) in ('primary', 'helper', 'observer')),
    constraint job_assignments_status_check
        check (lower(btrim(status)) in ('assigned', 'accepted', 'in_progress', 'completed', 'removed'))
);

create unique index if not exists job_assignments_unique_active_assignment
on public.job_assignments (job_id, technician_company_user_id)
where lower(btrim(status)) <> 'removed';

create index if not exists job_assignments_job_id_idx
on public.job_assignments (job_id);

create index if not exists job_assignments_company_id_idx
on public.job_assignments (company_id);

create index if not exists job_assignments_technician_auth_user_id_status_idx
on public.job_assignments (technician_auth_user_id, lower(btrim(status)));

create index if not exists job_assignments_company_job_idx
on public.job_assignments (company_id, job_id);

alter table public.job_assignments enable row level security;

drop policy if exists job_assignments_select_company_managers on public.job_assignments;
create policy job_assignments_select_company_managers
on public.job_assignments
for select
to authenticated
using (
    public.is_platform_admin()
    or public.can_manage_company_users(company_id)
    or exists (
        select 1
        from public.company_users company_user
        where company_user.company_id = job_assignments.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
          and lower(btrim(coalesce(company_user.role, ''))) in ('manager', 'admin', 'owner')
    )
    or technician_auth_user_id = auth.uid()
);

create or replace function public.assign_technician_to_job(
    p_company_id uuid,
    p_job_id uuid,
    p_technician_company_user_id uuid,
    p_role_on_job text default 'primary'
)
returns public.job_assignments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_assignment public.job_assignments%rowtype;
    v_job public.jobs%rowtype;
    v_technician public.company_users%rowtype;
    v_role text := lower(btrim(coalesce(p_role_on_job, 'primary')));
    v_can_dispatch boolean := false;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select public.is_platform_admin()
        or public.can_manage_company_users(p_company_id)
        or exists (
            select 1
            from public.company_users company_user
            where company_user.company_id = p_company_id
              and company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(btrim(coalesce(company_user.role, ''))) in ('manager', 'admin', 'owner')
        )
    into v_can_dispatch;

    if not coalesce(v_can_dispatch, false) then
        raise exception 'Not authorized to assign technicians for this company.';
    end if;

    if v_role not in ('primary', 'helper', 'observer') then
        raise exception 'Invalid role_on_job. Use primary, helper, or observer.';
    end if;

    select *
    into v_job
    from public.jobs
    where id = p_job_id
      and company_id = p_company_id;

    if not found then
        raise exception 'Job not found for company.';
    end if;

    select *
    into v_technician
    from public.company_users
    where id = p_technician_company_user_id
      and company_id = p_company_id
      and lower(btrim(coalesce(status, ''))) = 'active'
      and lower(btrim(coalesce(role, ''))) in ('technician', 'manager', 'admin', 'owner');

    if not found then
        raise exception 'Active technician/company user not found for this company.';
    end if;

    insert into public.job_assignments (
        company_id,
        job_id,
        technician_company_user_id,
        technician_auth_user_id,
        role_on_job,
        assigned_by_user_id
    )
    values (
        p_company_id,
        p_job_id,
        p_technician_company_user_id,
        v_technician.auth_user_id,
        v_role,
        auth.uid()
    )
    on conflict (job_id, technician_company_user_id)
    where lower(btrim(status)) <> 'removed'
    do update set
        role_on_job = excluded.role_on_job,
        status = 'assigned',
        technician_auth_user_id = excluded.technician_auth_user_id,
        assigned_by_user_id = excluded.assigned_by_user_id,
        assigned_at = now(),
        updated_at = now()
    returning * into v_assignment;

    return v_assignment;
end;
$$;

create or replace function public.get_my_techos_jobs()
returns table (
    id uuid,
    company_id uuid,
    property_id uuid,
    company_property_client_id uuid,
    title text,
    status text,
    job_source text,
    created_at timestamptz,
    updated_at timestamptz,
    assignment_id uuid,
    assignment_status text,
    role_on_job text
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select
        job.id,
        job.company_id,
        job.property_id,
        job.company_property_client_id,
        job.title,
        job.status,
        job.job_source,
        job.created_at,
        job.updated_at,
        assignment.id,
        assignment.status,
        assignment.role_on_job
    from public.job_assignments assignment
    join public.jobs job
      on job.id = assignment.job_id
     and job.company_id = assignment.company_id
    where assignment.technician_auth_user_id = auth.uid()
      and lower(btrim(coalesce(assignment.status, ''))) not in ('removed', 'revoked', 'cancelled')
    order by job.created_at desc nulls last, job.id desc;
$$;

create or replace function public.get_company_techos_overview(
    p_company_id uuid
)
returns table (
    id uuid,
    company_id uuid,
    property_id uuid,
    company_property_client_id uuid,
    title text,
    status text,
    job_source text,
    created_at timestamptz,
    updated_at timestamptz,
    assignment_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_can_preview boolean := false;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select public.is_platform_admin()
        or public.can_manage_company_users(p_company_id)
        or exists (
            select 1
            from public.company_users company_user
            where company_user.company_id = p_company_id
              and company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(btrim(coalesce(company_user.role, ''))) in ('manager', 'admin', 'owner')
        )
    into v_can_preview;

    if not coalesce(v_can_preview, false) then
        raise exception 'Not authorized to view this TechOS company overview.';
    end if;

    return query
    select
        job.id,
        job.company_id,
        job.property_id,
        job.company_property_client_id,
        job.title,
        job.status,
        job.job_source,
        job.created_at,
        job.updated_at,
        count(assignment.id) filter (
            where lower(btrim(coalesce(assignment.status, ''))) not in ('removed', 'revoked', 'cancelled')
        ) as assignment_count
    from public.jobs job
    left join public.job_assignments assignment
      on assignment.job_id = job.id
     and assignment.company_id = job.company_id
    where job.company_id = p_company_id
    group by job.id
    order by job.created_at desc nulls last, job.id desc;
end;
$$;

create or replace function public.get_techos_job_detail(
    p_job_id uuid,
    p_company_id uuid default null
)
returns table (
    id uuid,
    company_id uuid,
    property_id uuid,
    company_property_client_id uuid,
    title text,
    status text,
    job_source text,
    created_at timestamptz,
    updated_at timestamptz,
    client_display_name text,
    client_status text,
    client_source text,
    client_linked_at timestamptz,
    property_name text,
    property_address text,
    property_city text,
    property_state text,
    property_postal_code text,
    assignment_id uuid,
    assignment_status text,
    role_on_job text,
    access_mode text,
    access_role text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_job public.jobs%rowtype;
    v_assignment public.job_assignments%rowtype;
    v_company_user public.company_users%rowtype;
    v_is_platform_admin boolean := false;
    v_can_preview boolean := false;
    v_access_mode text := null;
    v_access_role text := null;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_job_id is null then
        raise exception 'job_id is required.';
    end if;

    select *
    into v_job
    from public.jobs
    where jobs.id = p_job_id;

    if not found then
        raise exception 'Job not found or not available.';
    end if;

    if v_job.company_id is null then
        raise exception 'This job is not linked to a company workspace.';
    end if;

    if p_company_id is not null and p_company_id <> v_job.company_id then
        raise exception 'This job does not belong to the selected company.';
    end if;

    select public.is_platform_admin()
    into v_is_platform_admin;

    select *
    into v_company_user
    from public.company_users company_user
    where company_user.company_id = v_job.company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
      and lower(btrim(coalesce(company_user.role, ''))) in ('technician', 'manager', 'admin', 'owner')
    order by company_user.created_at asc nulls last, company_user.id asc
    limit 1;

    select *
    into v_assignment
    from public.job_assignments assignment
    where assignment.job_id = v_job.id
      and assignment.company_id = v_job.company_id
      and assignment.technician_auth_user_id = auth.uid()
      and lower(btrim(coalesce(assignment.status, ''))) not in ('removed', 'revoked', 'cancelled')
    order by assignment.assigned_at desc nulls last, assignment.created_at desc nulls last, assignment.id desc
    limit 1;

    select public.can_manage_company_users(v_job.company_id)
        or (
            v_company_user.id is not null
            and lower(btrim(coalesce(v_company_user.role, ''))) in ('manager', 'admin', 'owner')
        )
    into v_can_preview;

    if coalesce(v_is_platform_admin, false) and p_company_id = v_job.company_id then
        v_access_mode := 'platform_preview';
        v_access_role := 'platform_admin';
    elsif coalesce(v_can_preview, false) then
        v_access_mode := 'company_preview';
        v_access_role := lower(btrim(coalesce(v_company_user.role, 'manager')));
    elsif v_assignment.id is not null then
        v_access_mode := 'assigned_technician';
        v_access_role := lower(btrim(coalesce(v_company_user.role, 'technician')));
    elsif coalesce(v_is_platform_admin, false) then
        raise exception 'Open this job from a selected company TechOS preview.';
    else
        raise exception 'You are not assigned to this TechOS job.';
    end if;

    return query
    select
        job.id,
        job.company_id,
        job.property_id,
        job.company_property_client_id,
        job.title,
        job.status,
        job.job_source,
        job.created_at,
        job.updated_at,
        company_client.display_name,
        company_client.status,
        company_client.source,
        coalesce(company_client.connected_at, company_client.first_requested_at, company_client.created_at),
        property.name,
        coalesce(property.address_line_1, property.address),
        property.city,
        property.state,
        coalesce(property.postal_code, property.zip),
        v_assignment.id,
        v_assignment.status,
        v_assignment.role_on_job,
        v_access_mode,
        v_access_role
    from public.jobs job
    left join public.company_property_clients company_client
      on company_client.id = job.company_property_client_id
     and company_client.company_id = job.company_id
     and company_client.property_id = job.property_id
    left join public.properties property
      on property.id = job.property_id
    where job.id = v_job.id;
end;
$$;

revoke all on table public.job_assignments from public;
revoke all on table public.job_assignments from anon;
revoke insert, update, delete on table public.job_assignments from authenticated;
grant select on table public.job_assignments to authenticated;

revoke all on function public.assign_technician_to_job(uuid, uuid, uuid, text) from public;
revoke all on function public.assign_technician_to_job(uuid, uuid, uuid, text) from anon;
grant execute on function public.assign_technician_to_job(uuid, uuid, uuid, text) to authenticated;

revoke all on function public.get_my_techos_jobs() from public;
revoke all on function public.get_my_techos_jobs() from anon;
grant execute on function public.get_my_techos_jobs() to authenticated;

revoke all on function public.get_company_techos_overview(uuid) from public;
revoke all on function public.get_company_techos_overview(uuid) from anon;
grant execute on function public.get_company_techos_overview(uuid) to authenticated;

revoke all on function public.get_techos_job_detail(uuid, uuid) from public;
revoke all on function public.get_techos_job_detail(uuid, uuid) from anon;
grant execute on function public.get_techos_job_detail(uuid, uuid) to authenticated;

commit;

select
    to_regclass('public.job_assignments') is not null as job_assignments_exists,
    to_regprocedure('public.assign_technician_to_job(uuid,uuid,uuid,text)') is not null as assign_rpc_exists,
    to_regprocedure('public.get_my_techos_jobs()') is not null as my_jobs_rpc_exists,
    to_regprocedure('public.get_company_techos_overview(uuid)') is not null as overview_rpc_exists,
    to_regprocedure('public.get_techos_job_detail(uuid,uuid)') is not null as detail_rpc_exists;
