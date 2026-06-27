-- REVIEW ONLY: TechOS company service job foundation.
-- Do not run until reviewed and approved for production.
--
-- Purpose:
-- - Let an active company technician/manager/admin/owner create a service job
--   from a company_property_clients row for the same company and property.
-- - Keep HomeOS private records protected by property_id.
-- - Keep company identity separate from homeowner identity.
-- - Use an RPC so the client does not need broad direct write access.

begin;

do $$
begin
    if to_regclass('public.jobs') is null then
        raise exception 'public.jobs is required before TechOS service jobs can be installed.';
    end if;

    if to_regclass('public.job_thread_events') is null then
        raise exception 'public.job_thread_events is required before TechOS service jobs can be installed.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before TechOS service jobs can be installed.';
    end if;

    if to_regclass('public.properties') is null then
        raise exception 'public.properties is required before TechOS service jobs can be installed.';
    end if;

    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required before TechOS service jobs can be installed.';
    end if;

    if to_regclass('public.property_connections') is null then
        raise exception 'public.property_connections is required before TechOS service jobs can be installed.';
    end if;

    if to_regprocedure('public.is_active_company_member(uuid)') is null then
        raise exception 'public.is_active_company_member(uuid) is required before TechOS service jobs can be installed.';
    end if;
end
$$;

alter table public.jobs
    add column if not exists company_id uuid,
    add column if not exists company_property_client_id uuid,
    add column if not exists property_connection_id uuid,
    add column if not exists job_source text,
    add column if not exists job_type text,
    add column if not exists visibility_status text,
    add column if not exists dispatch_status text,
    add column if not exists priority text,
    add column if not exists created_by uuid,
    add column if not exists updated_at timestamptz default now();

alter table public.job_thread_events
    add column if not exists company_id uuid;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'jobs_company_id_fkey'
          and conrelid = 'public.jobs'::regclass
    ) then
        alter table public.jobs
            add constraint jobs_company_id_fkey
            foreign key (company_id)
            references public.companies(id)
            on delete set null;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'jobs_company_property_client_id_fkey'
          and conrelid = 'public.jobs'::regclass
    ) then
        alter table public.jobs
            add constraint jobs_company_property_client_id_fkey
            foreign key (company_property_client_id)
            references public.company_property_clients(id)
            on delete set null;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'jobs_property_connection_id_fkey'
          and conrelid = 'public.jobs'::regclass
    ) then
        alter table public.jobs
            add constraint jobs_property_connection_id_fkey
            foreign key (property_connection_id)
            references public.property_connections(id)
            on delete set null;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'job_thread_events_company_id_fkey'
          and conrelid = 'public.job_thread_events'::regclass
    ) then
        alter table public.job_thread_events
            add constraint job_thread_events_company_id_fkey
            foreign key (company_id)
            references public.companies(id)
            on delete set null;
    end if;
end
$$;

update public.job_thread_events as event
set company_id = job.company_id
from public.jobs as job
where event.job_id = job.id
  and event.company_id is null
  and job.company_id is not null;

create index if not exists jobs_company_id_idx
    on public.jobs (company_id);

create index if not exists jobs_company_property_idx
    on public.jobs (company_id, property_id);

create index if not exists jobs_company_status_idx
    on public.jobs (company_id, status);

create index if not exists jobs_company_property_client_id_idx
    on public.jobs (company_property_client_id);

create index if not exists job_thread_events_company_id_idx
    on public.job_thread_events (company_id);

drop policy if exists jobs_select_company_members on public.jobs;
create policy jobs_select_company_members
    on public.jobs
    for select
    to authenticated
    using (
        company_id is not null
        and public.is_active_company_member(company_id)
        and exists (
            select 1
            from public.company_property_clients as company_client
            where company_client.company_id = jobs.company_id
              and company_client.property_id = jobs.property_id
              and company_client.status = 'active'
        )
    );

drop policy if exists jobs_insert_company_members on public.jobs;
create policy jobs_insert_company_members
    on public.jobs
    for insert
    to authenticated
    with check (
        company_id is not null
        and user_id = auth.uid()
        and public.is_active_company_member(company_id)
        and exists (
            select 1
            from public.company_property_clients as company_client
            where company_client.company_id = jobs.company_id
              and company_client.property_id = jobs.property_id
              and company_client.status = 'active'
        )
    );

drop policy if exists jobs_update_company_members on public.jobs;
create policy jobs_update_company_members
    on public.jobs
    for update
    to authenticated
    using (
        company_id is not null
        and public.is_active_company_member(company_id)
        and exists (
            select 1
            from public.company_property_clients as company_client
            where company_client.company_id = jobs.company_id
              and company_client.property_id = jobs.property_id
              and company_client.status = 'active'
        )
    )
    with check (
        company_id is not null
        and public.is_active_company_member(company_id)
        and exists (
            select 1
            from public.company_property_clients as company_client
            where company_client.company_id = jobs.company_id
              and company_client.property_id = jobs.property_id
              and company_client.status = 'active'
        )
    );

drop policy if exists job_thread_events_select_company_members on public.job_thread_events;
create policy job_thread_events_select_company_members
    on public.job_thread_events
    for select
    to authenticated
    using (
        company_id is not null
        and public.is_active_company_member(company_id)
        and exists (
            select 1
            from public.jobs as job
            join public.company_property_clients as company_client
              on company_client.company_id = job.company_id
             and company_client.property_id = job.property_id
             and company_client.status = 'active'
            where job.id = job_thread_events.job_id
              and job.company_id = job_thread_events.company_id
        )
    );

drop policy if exists job_thread_events_insert_company_members on public.job_thread_events;
create policy job_thread_events_insert_company_members
    on public.job_thread_events
    for insert
    to authenticated
    with check (
        company_id is not null
        and user_id = auth.uid()
        and public.is_active_company_member(company_id)
        and exists (
            select 1
            from public.jobs as job
            where job.id = job_thread_events.job_id
              and job.company_id = job_thread_events.company_id
              and job.property_id = job_thread_events.property_id
        )
    );

create or replace function public.create_techos_service_job(
    p_company_id uuid,
    p_property_id uuid,
    p_company_property_client_id uuid default null,
    p_title text default 'Service Visit'
)
returns table (
    job_id uuid,
    company_id uuid,
    property_id uuid,
    title text,
    status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_client public.company_property_clients%rowtype;
    v_job public.jobs%rowtype;
    v_title text := coalesce(nullif(btrim(p_title), ''), 'Service Visit');
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_property_id is null then
        raise exception 'Company and property are required';
    end if;

    if not public.is_active_company_member(p_company_id) then
        raise exception 'No active membership found for this company';
    end if;

    select company_client.*
    into v_client
    from public.company_property_clients as company_client
    where company_client.company_id = p_company_id
      and company_client.property_id = p_property_id
      and company_client.status = 'active'
      and (
          p_company_property_client_id is null
          or company_client.id = p_company_property_client_id
      )
    order by company_client.connected_at desc nulls last,
             company_client.created_at desc nulls last,
             company_client.id desc
    limit 1;

    if v_client.id is null then
        raise exception 'No active company client relationship found for this property';
    end if;

    insert into public.jobs (
        user_id,
        property_id,
        company_id,
        company_property_client_id,
        property_connection_id,
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
        v_user_id,
        p_property_id,
        p_company_id,
        v_client.id,
        v_client.property_connection_id,
        v_title,
        'open',
        'normal',
        'techos_client',
        'service_visit',
        'company_basic',
        'not_dispatched',
        v_user_id,
        now()
    )
    returning *
    into v_job;

    insert into public.job_thread_events (
        job_id,
        user_id,
        property_id,
        company_id,
        event_type,
        message,
        visibility,
        actor_role,
        metadata
    )
    values (
        v_job.id,
        v_user_id,
        p_property_id,
        p_company_id,
        'job_created',
        'TechOS service job created.',
        'company',
        'technician',
        jsonb_build_object(
            'source', 'techos_client',
            'company_property_client_id', v_client.id
        )
    );

    return query
    select
        v_job.id,
        v_job.company_id,
        v_job.property_id,
        v_job.title,
        v_job.status;
end;
$$;

revoke all on function public.create_techos_service_job(uuid, uuid, uuid, text) from public;
revoke all on function public.create_techos_service_job(uuid, uuid, uuid, text) from anon;
grant execute on function public.create_techos_service_job(uuid, uuid, uuid, text) to authenticated;

commit;

select
    to_regprocedure('public.create_techos_service_job(uuid,uuid,uuid,text)') is not null as create_techos_service_job_exists,
    exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'jobs'
          and column_name = 'company_id'
    ) as jobs_company_id_exists,
    exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'job_thread_events'
          and column_name = 'company_id'
    ) as job_thread_events_company_id_exists,
    exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'jobs'
          and policyname = 'jobs_select_company_members'
    ) as jobs_company_select_policy_exists;
