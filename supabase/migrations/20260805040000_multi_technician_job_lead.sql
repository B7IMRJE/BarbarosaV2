-- Allow several technicians on one job while requiring exactly one active lead.
-- Storage keeps the established primary/helper values for compatibility:
-- primary = lead technician; helper = additional technician.

begin;

do $$
begin
    if to_regclass('public.job_assignments') is null then
        raise exception 'public.job_assignments is required before multi-technician lead enforcement can be installed.';
    end if;

    if to_regclass('public.jobs') is null or to_regclass('public.company_users') is null then
        raise exception 'public.jobs and public.company_users are required before multi-technician lead enforcement can be installed.';
    end if;
end;
$$;

-- Earlier assignment screens sent every technician as primary. Preserve the
-- first active assignment as lead and convert later duplicate primaries to
-- additional technicians before adding the unique lead guard.
with ranked_leads as (
    select
        assignment.id,
        row_number() over (
            partition by assignment.job_id
            order by assignment.assigned_at asc nulls last,
                     assignment.created_at asc nulls last,
                     assignment.id asc
        ) as lead_rank
    from public.job_assignments as assignment
    where lower(btrim(coalesce(assignment.status, ''))) not in ('removed', 'revoked', 'cancelled', 'canceled')
      and lower(btrim(coalesce(assignment.role_on_job, ''))) = 'primary'
)
update public.job_assignments as assignment
set role_on_job = 'helper',
    updated_at = now()
from ranked_leads
where ranked_leads.id = assignment.id
  and ranked_leads.lead_rank > 1;

-- Repair any active crew that has no lead by promoting its first active member.
with jobs_without_leads as (
    select assignment.job_id
    from public.job_assignments as assignment
    where lower(btrim(coalesce(assignment.status, ''))) not in ('removed', 'revoked', 'cancelled', 'canceled')
    group by assignment.job_id
    having count(*) filter (
        where lower(btrim(coalesce(assignment.role_on_job, ''))) = 'primary'
    ) = 0
), ranked_assignments as (
    select
        assignment.id,
        row_number() over (
            partition by assignment.job_id
            order by assignment.assigned_at asc nulls last,
                     assignment.created_at asc nulls last,
                     assignment.id asc
        ) as assignment_rank
    from public.job_assignments as assignment
    join jobs_without_leads on jobs_without_leads.job_id = assignment.job_id
    where lower(btrim(coalesce(assignment.status, ''))) not in ('removed', 'revoked', 'cancelled', 'canceled')
)
update public.job_assignments as assignment
set role_on_job = 'primary',
    updated_at = now()
from ranked_assignments
where ranked_assignments.id = assignment.id
  and ranked_assignments.assignment_rank = 1;

create unique index if not exists job_assignments_one_active_lead_per_job
on public.job_assignments (job_id)
where lower(btrim(coalesce(status, ''))) not in ('removed', 'revoked', 'cancelled', 'canceled')
  and lower(btrim(coalesce(role_on_job, ''))) = 'primary';

create or replace function public.enforce_job_assignment_lead()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_job_id uuid;
    v_job_ids uuid[] := array[]::uuid[];
    v_active_count bigint;
    v_lead_count bigint;
begin
    if tg_op <> 'INSERT' then
        v_job_ids := array_append(v_job_ids, old.job_id);
    end if;

    if tg_op <> 'DELETE' then
        v_job_ids := array_append(v_job_ids, new.job_id);
    end if;

    foreach v_job_id in array v_job_ids
    loop
        if v_job_id is null then
            continue;
        end if;

        select
            count(*),
            count(*) filter (
                where lower(btrim(coalesce(assignment.role_on_job, ''))) = 'primary'
            )
        into v_active_count, v_lead_count
        from public.job_assignments as assignment
        where assignment.job_id = v_job_id
          and lower(btrim(coalesce(assignment.status, ''))) not in ('removed', 'revoked', 'cancelled', 'canceled');

        if v_active_count > 0 and v_lead_count <> 1 then
            raise exception 'Every assigned job crew must have exactly one lead technician.';
        end if;
    end loop;

    return null;
end;
$$;

drop trigger if exists job_assignments_require_one_active_lead on public.job_assignments;
create constraint trigger job_assignments_require_one_active_lead
after insert or update or delete on public.job_assignments
deferrable initially deferred
for each row
execute function public.enforce_job_assignment_lead();

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
    v_requested_role text := lower(btrim(coalesce(p_role_on_job, 'primary')));
    v_role text;
    v_can_dispatch boolean := false;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_job_id is null or p_technician_company_user_id is null then
        raise exception 'Company, job, and technician are required.';
    end if;

    v_role := case v_requested_role
        when 'lead' then 'primary'
        when 'additional' then 'helper'
        when 'additional_technician' then 'helper'
        else v_requested_role
    end;

    if v_role not in ('primary', 'helper', 'observer') then
        raise exception 'Invalid role_on_job. Use lead/primary, additional/helper, or observer.';
    end if;

    select public.is_platform_admin()
        or public.can_manage_company_users(p_company_id)
        or exists (
            select 1
            from public.company_users as company_user
            where company_user.company_id = p_company_id
              and company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(btrim(coalesce(company_user.role, ''))) in ('manager', 'admin', 'owner')
        )
    into v_can_dispatch;

    if not coalesce(v_can_dispatch, false) then
        raise exception 'Not authorized to assign technicians for this company.';
    end if;

    -- Serialize crew edits for one job so two dispatch clients cannot create
    -- competing leads at the same time.
    perform pg_advisory_xact_lock(hashtextextended(p_job_id::text, 0));

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
      and lower(btrim(coalesce(role, ''))) in ('technician', 'tech', 'manager', 'admin', 'owner');

    if not found then
        raise exception 'Active technician/company user not found for this company.';
    end if;

    if v_role = 'primary' then
        update public.job_assignments
        set role_on_job = 'helper',
            updated_at = now()
        where job_id = p_job_id
          and company_id = p_company_id
          and technician_company_user_id <> p_technician_company_user_id
          and lower(btrim(coalesce(status, ''))) not in ('removed', 'revoked', 'cancelled', 'canceled')
          and lower(btrim(coalesce(role_on_job, ''))) = 'primary';
    elsif not exists (
        select 1
        from public.job_assignments as lead_assignment
        where lead_assignment.job_id = p_job_id
          and lead_assignment.company_id = p_company_id
          and lead_assignment.technician_company_user_id <> p_technician_company_user_id
          and lower(btrim(coalesce(lead_assignment.status, ''))) not in ('removed', 'revoked', 'cancelled', 'canceled')
          and lower(btrim(coalesce(lead_assignment.role_on_job, ''))) = 'primary'
    ) then
        raise exception 'Assign a lead technician before adding another technician.';
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

revoke all on function public.enforce_job_assignment_lead() from public;
revoke all on function public.enforce_job_assignment_lead() from anon;

revoke all on function public.assign_technician_to_job(uuid, uuid, uuid, text) from public;
revoke all on function public.assign_technician_to_job(uuid, uuid, uuid, text) from anon;
grant execute on function public.assign_technician_to_job(uuid, uuid, uuid, text) to authenticated;

commit;
