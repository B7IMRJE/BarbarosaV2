-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Add company-scoped TechOS job assignments so technician logins only see
--   jobs assigned to their company_user record. This keeps ManagementOS
--   dispatch separate from the technician field workspace.
--
-- Current gap:
--   573 adds company service-job fields, but there is no safe assignment model
--   linking jobs to company_users. Legacy jobs.assigned_technician is text-like
--   homeowner workflow data and should not drive TechOS access.
--
-- Safety:
--   - Assignments are company-scoped.
--   - Technician views use assignment rows for auth.uid().
--   - Company overview remains manager/admin/owner/platform-admin scoped.
--   - HomeOS private photos/docs/history are not exposed here.

begin;

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
        check (role_on_job in ('primary', 'helper', 'observer')),
    constraint job_assignments_status_check
        check (status in ('assigned', 'accepted', 'in_progress', 'completed', 'removed'))
);

create unique index if not exists job_assignments_unique_active_assignment
on public.job_assignments (job_id, technician_company_user_id)
where status <> 'removed';

create index if not exists job_assignments_company_id_idx
on public.job_assignments (company_id);

create index if not exists job_assignments_technician_auth_user_id_idx
on public.job_assignments (technician_auth_user_id);

create index if not exists job_assignments_job_id_idx
on public.job_assignments (job_id);

alter table public.job_assignments enable row level security;

drop policy if exists job_assignments_select_company_managers on public.job_assignments;
create policy job_assignments_select_company_managers
on public.job_assignments
for select
to authenticated
using (
    public.can_manage_company_users(company_id)
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
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.can_manage_company_users(p_company_id) then
        raise exception 'Not authorized';
    end if;

    select *
    into v_job
    from public.jobs
    where id = p_job_id
      and company_id = p_company_id;

    if not found then
        raise exception 'Job not found for company';
    end if;

    select *
    into v_technician
    from public.company_users
    where id = p_technician_company_user_id
      and company_id = p_company_id
      and status = 'active'
      and lower(btrim(coalesce(role, ''))) in ('technician', 'manager', 'admin', 'owner');

    if not found then
        raise exception 'Active technician/company user not found';
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
    where status <> 'removed'
    do update set
        role_on_job = excluded.role_on_job,
        status = 'assigned',
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
      and assignment.status <> 'removed'
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
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.can_manage_company_users(p_company_id) then
        raise exception 'Not authorized';
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
        count(assignment.id) filter (where assignment.status <> 'removed') as assignment_count
    from public.jobs job
    left join public.job_assignments assignment
      on assignment.job_id = job.id
     and assignment.company_id = job.company_id
    where job.company_id = p_company_id
    group by job.id
    order by job.created_at desc nulls last, job.id desc;
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

commit;

select
    to_regclass('public.job_assignments') is not null as job_assignments_exists,
    to_regprocedure('public.assign_technician_to_job(uuid,uuid,uuid,text)') is not null as assign_rpc_exists,
    to_regprocedure('public.get_my_techos_jobs()') is not null as my_jobs_rpc_exists,
    to_regprocedure('public.get_company_techos_overview(uuid)') is not null as overview_rpc_exists;
