-- Company-scoped ManagementOS audit log foundation.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.company_audit_logs (
    id uuid primary key default extensions.gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    actor_user_id uuid not null references auth.users(id) on delete cascade,
    actor_email text,
    actor_company_user_id uuid references public.company_users(id) on delete set null,
    actor_role text,
    action text not null,
    target_type text not null,
    target_id uuid,
    target_label text,
    before_data jsonb,
    after_data jsonb,
    metadata jsonb,
    created_at timestamptz not null default now()
);

create index if not exists company_audit_logs_company_created_idx
    on public.company_audit_logs (company_id, created_at desc);

create index if not exists company_audit_logs_actor_created_idx
    on public.company_audit_logs (actor_user_id, created_at desc);

create index if not exists company_audit_logs_action_created_idx
    on public.company_audit_logs (action, created_at desc);

alter table public.company_audit_logs enable row level security;

create or replace function public.can_view_company_audit_logs(p_company_id uuid)
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
               from public.company_users as company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'admin', 'manager')
           )
       );
$$;

revoke all on function public.can_view_company_audit_logs(uuid) from public;
revoke all on function public.can_view_company_audit_logs(uuid) from anon;
grant execute on function public.can_view_company_audit_logs(uuid) to authenticated;

drop policy if exists company_audit_logs_select_company_managers on public.company_audit_logs;

create policy company_audit_logs_select_company_managers
on public.company_audit_logs
for select
to authenticated
using (public.can_view_company_audit_logs(company_id));

create or replace function public.log_company_audit_event(
    p_company_id uuid,
    p_action text,
    p_target_type text,
    p_target_id uuid default null,
    p_target_label text default null,
    p_before_data jsonb default null,
    p_after_data jsonb default null,
    p_metadata jsonb default null
)
returns public.company_audit_logs
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_actor_user_id uuid := auth.uid();
    v_actor_email text;
    v_company_user public.company_users%rowtype;
    v_audit_log public.company_audit_logs%rowtype;
begin
    if v_actor_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null then
        raise exception 'Company id is required for audit logging.';
    end if;

    if nullif(btrim(coalesce(p_action, '')), '') is null then
        raise exception 'Audit action is required.';
    end if;

    if nullif(btrim(coalesce(p_target_type, '')), '') is null then
        raise exception 'Audit target type is required.';
    end if;

    select company_user.*
    into v_company_user
    from public.company_users as company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = v_actor_user_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc nulls last
    limit 1;

    if not public.is_platform_admin() and v_company_user.id is null then
        raise exception 'Not authorized to write audit events for this company.';
    end if;

    select auth_user.email
    into v_actor_email
    from auth.users as auth_user
    where auth_user.id = v_actor_user_id;

    insert into public.company_audit_logs (
        company_id,
        actor_user_id,
        actor_email,
        actor_company_user_id,
        actor_role,
        action,
        target_type,
        target_id,
        target_label,
        before_data,
        after_data,
        metadata
    )
    values (
        p_company_id,
        v_actor_user_id,
        v_actor_email,
        v_company_user.id,
        v_company_user.role,
        lower(btrim(p_action)),
        lower(btrim(p_target_type)),
        p_target_id,
        nullif(btrim(coalesce(p_target_label, '')), ''),
        p_before_data,
        p_after_data,
        p_metadata
    )
    returning *
    into v_audit_log;

    return v_audit_log;
end;
$$;

revoke all on function public.log_company_audit_event(uuid, text, text, uuid, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.log_company_audit_event(uuid, text, text, uuid, text, jsonb, jsonb, jsonb) from anon;
grant execute on function public.log_company_audit_event(uuid, text, text, uuid, text, jsonb, jsonb, jsonb) to authenticated;

grant select on public.company_audit_logs to authenticated;

commit;
