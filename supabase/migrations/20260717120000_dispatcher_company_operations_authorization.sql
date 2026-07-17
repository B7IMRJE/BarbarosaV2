-- Repair dispatcher operational reads without granting Super Admin or
-- company-management privileges.
--
-- Dispatchers need company-scoped operational data for Dispatch Office,
-- Leads, Activity Board, schedule, and assignment workflows. They should not
-- gain employee-management, billing, ownership, or cross-company access.

begin;

do $$
begin
    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before dispatcher operations authorization can be installed.';
    end if;

    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before dispatcher operations authorization can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before dispatcher operations authorization can be installed.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before dispatcher operations authorization can be installed.';
    end if;
end;
$$;

create or replace function public.can_dispatch_company_operations(
    p_company_id uuid
)
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
                 and lower(btrim(coalesce(company_user.role, ''))) in (
                    'owner',
                    'admin',
                    'manager',
                    'office',
                    'dispatcher',
                    'dispatch',
                    'supervisor'
                 )
           )
       );
$$;

revoke all on function public.can_dispatch_company_operations(uuid) from public;
revoke all on function public.can_dispatch_company_operations(uuid) from anon;
grant execute on function public.can_dispatch_company_operations(uuid) to authenticated;

create or replace function public.can_dispatch_company(
    p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select public.can_dispatch_company_operations(p_company_id);
$$;

revoke all on function public.can_dispatch_company(uuid) from public;
revoke all on function public.can_dispatch_company(uuid) from anon;
grant execute on function public.can_dispatch_company(uuid) to authenticated;

create or replace function public.get_company_users_for_dispatch(
    p_company_id uuid
)
returns table (
    id uuid,
    company_id uuid,
    auth_user_id uuid,
    full_name text,
    email text,
    role text,
    status text,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    if not public.can_dispatch_company_operations(p_company_id) then
        raise exception 'Not authorized to view dispatch roster for this company.';
    end if;

    return query
    select
        company_user.id,
        company_user.company_id,
        company_user.auth_user_id,
        company_user.full_name,
        company_user.email,
        company_user.role,
        company_user.status,
        company_user.created_at
    from public.company_users as company_user
    where company_user.company_id = p_company_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
      and lower(btrim(coalesce(company_user.role, ''))) in (
        'owner',
        'admin',
        'manager',
        'office',
        'dispatcher',
        'dispatch',
        'supervisor',
        'technician',
        'tech',
        'field_tech',
        'field-tech',
        'field technician'
      )
    order by
        case
            when lower(btrim(coalesce(company_user.role, ''))) in ('technician', 'tech', 'field_tech', 'field-tech', 'field technician') then 0
            else 1
        end,
        company_user.full_name asc nulls last,
        company_user.email asc nulls last,
        company_user.created_at asc nulls last,
        company_user.id asc;
end;
$$;

revoke all on function public.get_company_users_for_dispatch(uuid) from public;
revoke all on function public.get_company_users_for_dispatch(uuid) from anon;
grant execute on function public.get_company_users_for_dispatch(uuid) to authenticated;

alter table public.job_schedule_slots enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_request_events enable row level security;

grant select on table public.job_schedule_slots to authenticated;
grant select on table public.service_requests to authenticated;
grant select on table public.service_request_events to authenticated;

drop policy if exists job_schedule_slots_dispatch_operations_select on public.job_schedule_slots;
create policy job_schedule_slots_dispatch_operations_select
on public.job_schedule_slots
for select
to authenticated
using (
    public.can_dispatch_company_operations(company_id)
);

drop policy if exists service_requests_dispatch_operations_select on public.service_requests;
create policy service_requests_dispatch_operations_select
on public.service_requests
for select
to authenticated
using (
    public.can_dispatch_company_operations(company_id)
);

drop policy if exists service_request_events_dispatch_operations_select on public.service_request_events;
create policy service_request_events_dispatch_operations_select
on public.service_request_events
for select
to authenticated
using (
    public.can_dispatch_company_operations(company_id)
);

commit;
