-- Phase 2D RLS foundation
-- Select-only policies for connection-related tables.
-- Writes remain RPC-only for now.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and upper(trim(coalesce(profile.role, ''))) = 'SUPER_ADMIN'
    );
$$;

grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.is_active_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select p_company_id is not null
       and exists (
           select 1
           from public.company_users company_user
           where company_user.company_id = p_company_id
             and company_user.auth_user_id = auth.uid()
             and company_user.status = 'active'
       );
$$;

grant execute on function public.is_active_company_member(uuid) to authenticated;

create or replace function public.is_active_property_member(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select p_property_id is not null
       and exists (
           select 1
           from public.property_memberships membership
           where membership.property_id = p_property_id
             and membership.user_id = auth.uid()
             and membership.status = 'active'
       );
$$;

grant execute on function public.is_active_property_member(uuid) to authenticated;

alter table public.company_users enable row level security;
alter table public.property_connections enable row level security;
alter table public.companies enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'company_users'
          and policyname = 'company_users_select_members'
    ) then
        create policy company_users_select_members
        on public.company_users
        for select
        to authenticated
        using (
            public.is_platform_admin()
            or public.is_active_company_member(company_id)
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'property_connections'
          and policyname = 'property_connections_select_members'
    ) then
        create policy property_connections_select_members
        on public.property_connections
        for select
        to authenticated
        using (
            public.is_platform_admin()
            or public.is_active_property_member(property_id)
            or public.is_active_company_member(company_id)
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'companies'
          and policyname = 'companies_select_access'
    ) then
        create policy companies_select_access
        on public.companies
        for select
        to authenticated
        using (
            public.is_platform_admin()
            or public.is_active_company_member(id)
            or exists (
                select 1
                from public.property_connections connection
                where connection.company_id = companies.id
                  and public.is_active_property_member(connection.property_id)
            )
        );
    end if;
end
$$;
