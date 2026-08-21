-- Reconcile shared-core access controls with the current company role and
-- explicit-assignment model. This intentionally supersedes neither historical
-- migration nor newer Sales/dispatch helpers; it only replaces conflicting
-- direct-table policies on the shared core.
begin;

do $$
begin
    if to_regclass('public.companies') is null
       or to_regclass('public.profiles') is null
       or to_regclass('public.homeowners') is null
       or to_regclass('public.properties') is null
       or to_regclass('public.company_users') is null
       or to_regclass('public.company_property_clients') is null
       or to_regclass('public.jobs') is null
       or to_regclass('public.job_assignments') is null
       or to_regclass('public.job_schedule_slots') is null
       or to_regprocedure('public.homeos_is_platform_admin()') is null
       or to_regprocedure('public.homeos_has_active_property_membership(uuid)') is null
       or to_regprocedure('public.company_sales_can_read_client_home(uuid,uuid)') is null then
        raise exception 'Current shared-core, assignment, and HomeOS access primitives are required.';
    end if;
end;
$$;

create or replace function public.shared_core_current_company_role(p_company_id uuid)
returns text language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select lower(btrim(coalesce(company_user.role, '')))
    from public.company_users company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc nulls last, company_user.id asc
    limit 1;
$$;

create or replace function public.shared_core_current_user_is_internal(p_company_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select public.shared_core_current_company_role(p_company_id) in
        ('owner', 'admin', 'manager', 'supervisor', 'office', 'dispatcher');
$$;

create or replace function public.shared_core_current_user_can_manage_company(p_company_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select public.homeos_is_platform_admin()
        or exists (
            select 1 from public.companies company
            where company.id = p_company_id and company.owner_id = auth.uid()
        )
        or public.shared_core_current_company_role(p_company_id) in ('owner', 'admin');
$$;

create or replace function public.shared_core_property_is_explicitly_assigned(p_property_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_property_id is not null
       and (
           exists (
               select 1
               from public.jobs job
               join public.job_assignments assignment
                 on assignment.job_id = job.id
                and assignment.company_id = job.company_id
               where job.property_id = p_property_id
                 and assignment.technician_auth_user_id = auth.uid()
                 and lower(btrim(coalesce(assignment.status, ''))) not in
                     ('removed', 'revoked', 'cancelled', 'canceled')
           )
           or exists (
               select 1
               from public.job_schedule_slots slot
               left join public.jobs job
                 on job.id = slot.job_id and job.company_id = slot.company_id
               left join public.service_requests request
                 on request.id = slot.service_request_id and request.company_id = slot.company_id
               join public.company_users company_user
                 on company_user.id = slot.technician_company_user_id
                and company_user.company_id = slot.company_id
               where company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and (job.property_id = p_property_id or request.property_id = p_property_id)
           )
       );
$$;

create or replace function public.shared_core_property_can_read(p_property_id uuid)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_id uuid;
begin
    if auth.uid() is null or p_property_id is null then return false; end if;
    if public.homeos_is_platform_admin()
       or public.homeos_has_active_property_membership(p_property_id)
       or exists (select 1 from public.properties property where property.id = p_property_id and property.owner_id = auth.uid()) then
        return true;
    end if;

    select property.company_id into v_company_id from public.properties property where property.id = p_property_id;
    if v_company_id is not null and public.shared_core_current_user_is_internal(v_company_id) then return true; end if;
    if v_company_id is not null and public.shared_core_current_company_role(v_company_id) = 'sales'
       and public.company_sales_can_read_client_home(v_company_id, p_property_id) then return true; end if;

    if exists (
        select 1 from public.company_property_clients client
        where client.property_id = p_property_id
          and lower(btrim(coalesce(client.status, ''))) not in ('archived','cancelled','canceled','declined','inactive','revoked')
          and public.shared_core_current_user_is_internal(client.company_id)
    ) then return true; end if;
    if exists (
        select 1 from public.company_property_clients client
        where client.property_id = p_property_id
          and lower(btrim(coalesce(client.status, ''))) not in ('archived','cancelled','canceled','declined','inactive','revoked')
          and public.shared_core_current_company_role(client.company_id) = 'sales'
          and public.company_sales_can_read_client_home(client.company_id, p_property_id)
    ) then return true; end if;

    return public.shared_core_property_is_explicitly_assigned(p_property_id);
end;
$$;

create or replace function public.shared_core_property_can_update(p_property_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select public.homeos_is_platform_admin()
        or exists (
            select 1 from public.properties property
            where property.id = p_property_id
              and (property.owner_id = auth.uid() or public.homeos_has_active_property_membership(property.id))
        )
        or exists (
            select 1 from public.properties property
            where property.id = p_property_id and public.shared_core_current_user_is_internal(property.company_id)
        )
        or exists (
            select 1 from public.company_property_clients client
            where client.property_id = p_property_id
              and lower(btrim(coalesce(client.status, ''))) not in ('archived','cancelled','canceled','declined','inactive','revoked')
              and public.shared_core_current_user_is_internal(client.company_id)
        );
$$;

create or replace function public.shared_core_company_can_read(p_company_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null and (
        public.homeos_is_platform_admin()
        or public.shared_core_current_company_role(p_company_id) is not null
        or exists (
            select 1 from public.properties property
            where property.company_id = p_company_id
              and (property.owner_id = auth.uid() or public.homeos_has_active_property_membership(property.id))
        )
        or exists (
            select 1 from public.company_property_clients client
            join public.properties property on property.id = client.property_id
            where client.company_id = p_company_id
              and lower(btrim(coalesce(client.status, ''))) not in ('archived','cancelled','canceled','declined','inactive','revoked')
              and (property.owner_id = auth.uid() or public.homeos_has_active_property_membership(property.id))
        )
    );
$$;

create or replace function public.shared_core_company_user_can_read(p_company_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null and exists (
        select 1 from public.company_users target
        where target.id = p_company_user_id
          and (
              public.homeos_is_platform_admin()
              or target.auth_user_id = auth.uid()
              or public.shared_core_current_user_is_internal(target.company_id)
              or (
                  public.shared_core_current_company_role(target.company_id) = 'sales'
                  and lower(btrim(coalesce(target.role, ''))) = 'sales'
              )
              or exists (
                  select 1 from public.job_assignments mine
                  join public.job_assignments teammate
                    on teammate.job_id = mine.job_id and teammate.company_id = mine.company_id
                  where mine.technician_auth_user_id = auth.uid()
                    and teammate.technician_company_user_id = target.id
                    and lower(btrim(coalesce(mine.status, ''))) not in ('removed','revoked','cancelled','canceled')
                    and lower(btrim(coalesce(teammate.status, ''))) not in ('removed','revoked','cancelled','canceled')
              )
          )
    );
$$;

create or replace function public.shared_core_profile_can_read(p_profile_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select p_profile_id = auth.uid()
        or public.homeos_is_platform_admin()
        or exists (select 1 from public.company_users target where target.auth_user_id = p_profile_id and public.shared_core_company_user_can_read(target.id));
$$;

create or replace function public.shared_core_homeowner_can_read(p_homeowner_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select public.homeos_is_platform_admin()
        or exists (
            select 1 from public.properties property
            where property.homeowner_id = p_homeowner_id
              and public.shared_core_property_can_read(property.id)
        );
$$;

create or replace function public.shared_core_homeowner_can_update(p_homeowner_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select public.homeos_is_platform_admin()
        or exists (
            select 1 from public.properties property
            where property.homeowner_id = p_homeowner_id
              and (property.owner_id = auth.uid() or public.homeos_has_active_property_membership(property.id))
        );
$$;

revoke all on function public.shared_core_current_company_role(uuid) from public, anon;
revoke all on function public.shared_core_current_user_is_internal(uuid) from public, anon;
revoke all on function public.shared_core_current_user_can_manage_company(uuid) from public, anon;
revoke all on function public.shared_core_property_is_explicitly_assigned(uuid) from public, anon;
revoke all on function public.shared_core_property_can_read(uuid) from public, anon;
revoke all on function public.shared_core_property_can_update(uuid) from public, anon;
revoke all on function public.shared_core_company_can_read(uuid) from public, anon;
revoke all on function public.shared_core_company_user_can_read(uuid) from public, anon;
revoke all on function public.shared_core_profile_can_read(uuid) from public, anon;
revoke all on function public.shared_core_homeowner_can_read(uuid) from public, anon;
revoke all on function public.shared_core_homeowner_can_update(uuid) from public, anon;
grant execute on function public.shared_core_current_company_role(uuid), public.shared_core_current_user_is_internal(uuid), public.shared_core_current_user_can_manage_company(uuid), public.shared_core_property_is_explicitly_assigned(uuid), public.shared_core_property_can_read(uuid), public.shared_core_property_can_update(uuid), public.shared_core_company_can_read(uuid), public.shared_core_company_user_can_read(uuid), public.shared_core_profile_can_read(uuid), public.shared_core_homeowner_can_read(uuid), public.shared_core_homeowner_can_update(uuid) to authenticated;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.homeowners enable row level security;

drop policy if exists companies_select_provider_access on public.companies;
drop policy if exists shared_core_companies_select on public.companies;
drop policy if exists shared_core_companies_update on public.companies;
create policy shared_core_companies_select on public.companies for select to authenticated using (public.shared_core_company_can_read(id));
create policy shared_core_companies_update on public.companies for update to authenticated using (public.shared_core_current_user_can_manage_company(id)) with check (public.shared_core_current_user_can_manage_company(id));

drop policy if exists profiles_select_self_or_platform on public.profiles;
drop policy if exists profiles_update_self_contact on public.profiles;
drop policy if exists shared_core_profiles_select on public.profiles;
drop policy if exists shared_core_profiles_update on public.profiles;
create policy shared_core_profiles_select on public.profiles for select to authenticated using (public.shared_core_profile_can_read(id));
create policy shared_core_profiles_update on public.profiles for update to authenticated using (id = auth.uid() or exists (select 1 from public.company_users target where target.auth_user_id = profiles.id and public.shared_core_current_user_can_manage_company(target.company_id))) with check (id = auth.uid() or exists (select 1 from public.company_users target where target.auth_user_id = profiles.id and public.shared_core_current_user_can_manage_company(target.company_id)));

drop policy if exists homeowners_select_company_customers on public.homeowners;
drop policy if exists homeowners_insert_company_customers on public.homeowners;
drop policy if exists shared_core_homeowners_select on public.homeowners;
drop policy if exists shared_core_homeowners_update on public.homeowners;
create policy shared_core_homeowners_select on public.homeowners for select to authenticated using (public.shared_core_homeowner_can_read(id));
create policy shared_core_homeowners_update on public.homeowners for update to authenticated using (public.shared_core_homeowner_can_update(id)) with check (public.shared_core_homeowner_can_update(id));

drop policy if exists company_users_select_self on public.company_users;
drop policy if exists shared_core_company_users_select on public.company_users;
create policy shared_core_company_users_select on public.company_users for select to authenticated using (public.shared_core_company_user_can_read(id));

drop policy if exists properties_select_sales_scoped_current on public.properties;
drop policy if exists properties_insert_non_sales_authorized on public.properties;
drop policy if exists properties_update_non_sales_authorized on public.properties;
create policy shared_core_properties_select on public.properties for select to authenticated using (public.shared_core_property_can_read(id));
create policy shared_core_properties_insert on public.properties for insert to authenticated with check (public.homeos_is_platform_admin() or (owner_id = auth.uid() and company_id is null) or public.shared_core_current_user_is_internal(company_id));
create policy shared_core_properties_update on public.properties for update to authenticated using (public.shared_core_property_can_update(id)) with check (public.shared_core_property_can_update(id));

revoke all privileges on table public.companies from anon;
revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.homeowners from anon;
revoke all privileges on table public.properties from anon;
grant select, update on table public.companies to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, update on table public.homeowners to authenticated;

commit;
