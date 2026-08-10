-- Harden the four legacy shared tables used by HomeOS, TechOS,
-- Administration OS, and Project General. This migration intentionally keeps
-- server-owned SECURITY DEFINER workflows intact while removing broad client
-- access. Every policy and helper is named so a rollback can target only this
-- change without reverting data.

begin;

do $$
begin
    if to_regclass('public.companies') is null
       or to_regclass('public.profiles') is null
       or to_regclass('public.properties') is null
       or to_regclass('public.homeowners') is null then
        raise exception 'Shared core tables are required before RLS hardening can be installed.';
    end if;

    if to_regclass('public.company_users') is null
       or to_regclass('public.company_property_clients') is null
       or to_regclass('public.property_memberships') is null
       or to_regclass('public.jobs') is null
       or to_regclass('public.job_assignments') is null
       or to_regclass('public.job_schedule_slots') is null
       or to_regclass('public.job_schedule_slot_assignments') is null
       or to_regclass('public.service_requests') is null then
        raise exception 'Shared authorization relationships are incomplete; refusing to enable RLS.';
    end if;

    if to_regprocedure('public.homeos_is_platform_admin()') is null
       or to_regprocedure('public.homeos_has_active_property_membership(uuid)') is null
       or to_regprocedure('public.is_active_company_member(uuid)') is null
       or to_regprocedure('public.homeos_current_provider_company_visible(uuid)') is null
       or to_regprocedure('public.company_user_has_permission(uuid,text)') is null
       or to_regprocedure('public.can_create_company_customer_invites(uuid)') is null then
        raise exception 'Shared authorization helpers are incomplete; refusing to enable RLS.';
    end if;

    if exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'companies'
          and policyname not in (
              'companies_select_active_approved',
              'companies_select_access',
              'companies_select_provider_access'
          )
    ) then
        raise exception 'Unexpected companies policy found; review it before shared RLS hardening.';
    end if;

    if exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename in ('profiles', 'properties', 'homeowners')
    ) then
        raise exception 'Unexpected shared-table policy found; review it before shared RLS hardening.';
    end if;
end;
$$;

create or replace function public.bootstrap_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_role text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'role', 'HOMEOWNER')));
    v_full_name text := nullif(btrim(coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
    )), '');
    v_phone text := null;
begin
    if v_role not in ('HOMEOWNER', 'WORK') then
        v_role := 'HOMEOWNER';
    end if;

    if v_role = 'HOMEOWNER' then
        v_phone := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
    end if;

    insert into public.profiles (id, email, full_name, phone, role)
    values (
        new.id,
        nullif(lower(btrim(coalesce(new.email, ''))), ''),
        v_full_name,
        v_phone,
        v_role
    )
    on conflict (id) do nothing;

    return new;
end;
$$;

revoke all on function public.bootstrap_profile_from_auth_user() from public;
revoke all on function public.bootstrap_profile_from_auth_user() from anon;
revoke all on function public.bootstrap_profile_from_auth_user() from authenticated;

drop trigger if exists on_auth_user_created_shared_profile on auth.users;
create trigger on_auth_user_created_shared_profile
after insert on auth.users
for each row execute function public.bootstrap_profile_from_auth_user();

-- Safely repair accounts created before the trigger existed. Client-provided
-- metadata can create only HOMEOWNER or unprivileged WORK profiles.
insert into public.profiles (id, email, full_name, phone, role)
select
    auth_user.id,
    nullif(lower(btrim(coalesce(auth_user.email, ''))), ''),
    nullif(btrim(coalesce(
        auth_user.raw_user_meta_data ->> 'full_name',
        auth_user.raw_user_meta_data ->> 'name',
        ''
    )), ''),
    case
        when upper(btrim(coalesce(auth_user.raw_user_meta_data ->> 'role', 'HOMEOWNER'))) = 'HOMEOWNER'
            then nullif(btrim(coalesce(auth_user.raw_user_meta_data ->> 'phone', '')), '')
        else null
    end,
    case
        when upper(btrim(coalesce(auth_user.raw_user_meta_data ->> 'role', 'HOMEOWNER'))) = 'WORK'
            then 'WORK'
        else 'HOMEOWNER'
    end
from auth.users as auth_user
where not exists (
    select 1
    from public.profiles as profile
    where profile.id = auth_user.id
);

create or replace function public.sync_my_profile(
    p_full_name text default null,
    p_phone text default null,
    p_requested_role text default 'HOMEOWNER'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_requested_role text := upper(btrim(coalesce(p_requested_role, 'HOMEOWNER')));
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if v_requested_role not in ('HOMEOWNER', 'WORK') then
        raise exception 'Unsupported self-service profile role';
    end if;

    select nullif(lower(btrim(coalesce(auth_user.email, ''))), '')
    into v_email
    from auth.users as auth_user
    where auth_user.id = v_user_id;

    if not found then
        raise exception 'Authenticated account was not found';
    end if;

    insert into public.profiles (id, email, full_name, phone, role)
    values (
        v_user_id,
        v_email,
        nullif(btrim(coalesce(p_full_name, '')), ''),
        case
            when v_requested_role = 'HOMEOWNER'
                then nullif(btrim(coalesce(p_phone, '')), '')
            else null
        end,
        v_requested_role
    )
    on conflict (id) do update
    set
        email = coalesce(excluded.email, profiles.email),
        full_name = coalesce(excluded.full_name, profiles.full_name),
        phone = case
            when v_requested_role = 'HOMEOWNER'
                then coalesce(excluded.phone, profiles.phone)
            else profiles.phone
        end,
        role = case
            when upper(btrim(coalesce(profiles.role, ''))) = 'SUPER_ADMIN' then profiles.role
            when upper(btrim(coalesce(profiles.role, ''))) = 'WORK' then profiles.role
            when v_requested_role = 'WORK' then 'WORK'
            else 'HOMEOWNER'
        end;
end;
$$;

revoke all on function public.sync_my_profile(text, text, text) from public;
revoke all on function public.sync_my_profile(text, text, text) from anon;
grant execute on function public.sync_my_profile(text, text, text) to authenticated;

create or replace function public.shared_property_can_read(p_property_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_auth_user_id uuid := auth.uid();
begin
    if v_auth_user_id is null or p_property_id is null then
        return false;
    end if;

    if public.homeos_is_platform_admin()
       or public.homeos_has_active_property_membership(p_property_id)
       or exists (
           select 1
           from public.properties as property
           where property.id = p_property_id
             and property.owner_id = v_auth_user_id
       ) then
        return true;
    end if;

    if exists (
        select 1
        from public.properties as property
        where property.id = p_property_id
          and property.company_id is not null
          and public.company_user_has_permission(property.company_id, 'can_view_customers')
    ) then
        return true;
    end if;

    return exists (
        select 1
        from public.company_property_clients as company_client
        where company_client.property_id = p_property_id
          and lower(btrim(coalesce(company_client.status, ''))) not in (
              'archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'
          )
          and (
              public.company_user_has_permission(company_client.company_id, 'can_view_customers')
              or exists (
                  select 1
                  from public.company_users as company_user
                  where company_user.company_id = company_client.company_id
                    and company_user.auth_user_id = v_auth_user_id
                    and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                    and (
                        exists (
                            select 1
                            from public.job_assignments as assignment
                            join public.jobs as job
                              on job.id = assignment.job_id
                             and job.company_id = assignment.company_id
                            where assignment.company_id = company_client.company_id
                              and assignment.technician_company_user_id = company_user.id
                              and assignment.technician_auth_user_id = v_auth_user_id
                              and job.property_id = p_property_id
                              and lower(btrim(coalesce(assignment.status, ''))) not in (
                                  'removed', 'revoked', 'cancelled', 'canceled'
                              )
                        )
                        or exists (
                            select 1
                            from public.job_schedule_slots as slot
                            left join public.service_requests as request
                              on request.id = slot.service_request_id
                             and request.company_id = slot.company_id
                            left join public.jobs as job
                              on job.id = slot.job_id
                             and job.company_id = slot.company_id
                            where slot.company_id = company_client.company_id
                              and slot.technician_company_user_id = company_user.id
                              and (
                                  request.property_id = p_property_id
                                  or job.property_id = p_property_id
                              )
                        )
                        or exists (
                            select 1
                            from public.job_schedule_slot_assignments as slot_assignment
                            join public.job_schedule_slots as slot
                              on slot.id = slot_assignment.schedule_slot_id
                             and slot.company_id = slot_assignment.company_id
                            left join public.service_requests as request
                              on request.id = slot.service_request_id
                             and request.company_id = slot.company_id
                            left join public.jobs as job
                              on job.id = slot.job_id
                             and job.company_id = slot.company_id
                            where slot_assignment.company_id = company_client.company_id
                              and slot_assignment.company_user_id = company_user.id
                              and lower(btrim(coalesce(slot_assignment.status, ''))) not in (
                                  'removed', 'revoked', 'cancelled', 'canceled'
                              )
                              and (
                                  request.property_id = p_property_id
                                  or job.property_id = p_property_id
                              )
                        )
                    )
              )
          )
    );
end;
$$;

revoke all on function public.shared_property_can_read(uuid) from public;
revoke all on function public.shared_property_can_read(uuid) from anon;
grant execute on function public.shared_property_can_read(uuid) to authenticated;

create or replace function public.shared_homeowner_can_read(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           public.homeos_is_platform_admin()
           or public.company_user_has_permission(p_company_id, 'can_view_customers')
       );
$$;

create or replace function public.shared_company_customer_can_create(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           public.homeos_is_platform_admin()
           or public.can_create_company_customer_invites(p_company_id)
       );
$$;

revoke all on function public.shared_homeowner_can_read(uuid) from public;
revoke all on function public.shared_homeowner_can_read(uuid) from anon;
grant execute on function public.shared_homeowner_can_read(uuid) to authenticated;

revoke all on function public.shared_company_customer_can_create(uuid) from public;
revoke all on function public.shared_company_customer_can_create(uuid) from anon;
grant execute on function public.shared_company_customer_can_create(uuid) to authenticated;

drop policy if exists companies_select_active_approved on public.companies;
drop policy if exists companies_select_access on public.companies;
drop policy if exists companies_select_provider_access on public.companies;

create policy companies_select_provider_access
on public.companies
for select
to authenticated
using (
    public.homeos_is_platform_admin()
    or public.is_active_company_member(companies.id)
    or public.homeos_current_provider_company_visible(companies.id)
);

create policy profiles_select_self_or_platform
on public.profiles
for select
to authenticated
using (
    profiles.id = auth.uid()
    or public.homeos_is_platform_admin()
);

create policy profiles_update_self_contact
on public.profiles
for update
to authenticated
using (profiles.id = auth.uid())
with check (profiles.id = auth.uid());

create policy properties_select_authorized_context
on public.properties
for select
to authenticated
using (public.shared_property_can_read(properties.id));

create policy properties_insert_company_management
on public.properties
for insert
to authenticated
with check (
    public.homeos_is_platform_admin()
    or public.shared_company_customer_can_create(properties.company_id)
);

create policy homeowners_select_company_customers
on public.homeowners
for select
to authenticated
using (public.shared_homeowner_can_read(homeowners.company_id));

create policy homeowners_insert_company_customers
on public.homeowners
for insert
to authenticated
with check (public.shared_company_customer_can_create(homeowners.company_id));

revoke all privileges on table public.companies from public, anon, authenticated;
revoke all privileges on table public.profiles from public, anon, authenticated;
revoke all privileges on table public.properties from public, anon, authenticated;
revoke all privileges on table public.homeowners from public, anon, authenticated;

grant select on table public.companies to authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;
grant select, insert on table public.properties to authenticated;
grant select, insert on table public.homeowners to authenticated;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.homeowners enable row level security;

commit;
