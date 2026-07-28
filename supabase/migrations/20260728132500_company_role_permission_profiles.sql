-- Company-specific role permissions for ManagementOS and TechOS.
-- Owners retain full access. Authorized owners and managers can customize
-- Admin, Manager, Office, Dispatcher, Supervisor, and Technician roles.

begin;

create or replace function public.company_permissions_are_valid(
    p_permissions jsonb
)
returns boolean
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
    select
        jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) = 'object'
        and not exists (
            select 1
            from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) as permission_entry
            where permission_entry.key not in (
                'can_view_techos',
                'can_create_estimates',
                'can_add_item_to_estimate',
                'can_view_customers',
                'can_view_jobs',
                'can_manage_company_users',
                'can_manage_company_profile'
            )
              or jsonb_typeof(permission_entry.value) <> 'boolean'
        );
$$;

revoke all on function public.company_permissions_are_valid(jsonb) from public;
revoke all on function public.company_permissions_are_valid(jsonb) from anon;
grant execute on function public.company_permissions_are_valid(jsonb) to authenticated;

alter table public.company_users
    add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.company_user_invitations
    add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.company_users
    drop constraint if exists company_users_permissions_object_check;

alter table public.company_users
    add constraint company_users_permissions_object_check
    check (public.company_permissions_are_valid(permissions));

alter table public.company_user_invitations
    drop constraint if exists company_user_invitations_permissions_object_check;

alter table public.company_user_invitations
    add constraint company_user_invitations_permissions_object_check
    check (public.company_permissions_are_valid(permissions));

create table if not exists public.company_role_permission_profiles (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    role text not null,
    permissions jsonb not null default '{}'::jsonb,
    updated_by_user_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_role_permission_profiles_company_role_key unique (company_id, role),
    constraint company_role_permission_profiles_role_check
        check (role in ('admin', 'manager', 'office', 'dispatcher', 'supervisor', 'technician')),
    constraint company_role_permission_profiles_permissions_check
        check (public.company_permissions_are_valid(permissions))
);

alter table public.company_role_permission_profiles enable row level security;

revoke all on table public.company_role_permission_profiles from public;
revoke all on table public.company_role_permission_profiles from anon;
revoke all on table public.company_role_permission_profiles from authenticated;

create or replace function public.resolve_company_user_permissions_for_company(
    p_company_id uuid,
    p_role text,
    p_status text,
    p_user_permissions jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select case
        when lower(btrim(coalesce(p_status, ''))) <> 'active' then
            jsonb_build_object(
                'can_view_techos', false,
                'can_create_estimates', false,
                'can_add_item_to_estimate', false,
                'can_view_customers', false,
                'can_view_jobs', false,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
            )
        when lower(btrim(coalesce(p_role, ''))) = 'owner' then
            public.company_role_default_permissions('owner')
        else
            public.company_role_default_permissions(p_role)
            || coalesce((
                select profile.permissions
                from public.company_role_permission_profiles as profile
                where profile.company_id = p_company_id
                  and profile.role = lower(btrim(coalesce(p_role, '')))
                limit 1
            ), '{}'::jsonb)
            || coalesce(nullif(p_user_permissions, 'null'::jsonb), '{}'::jsonb)
    end;
$$;

revoke all on function public.resolve_company_user_permissions_for_company(uuid, text, text, jsonb) from public;
revoke all on function public.resolve_company_user_permissions_for_company(uuid, text, text, jsonb) from anon;
grant execute on function public.resolve_company_user_permissions_for_company(uuid, text, text, jsonb) to authenticated;

create or replace function public.company_user_has_permission(
    p_company_id uuid,
    p_permission text
)
returns boolean
language plpgsql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_permission text := lower(btrim(coalesce(p_permission, '')));
    v_permissions jsonb;
begin
    if auth.uid() is null or p_company_id is null then
        return false;
    end if;

    if v_permission not in (
        'can_view_techos',
        'can_create_estimates',
        'can_add_item_to_estimate',
        'can_view_customers',
        'can_view_jobs',
        'can_manage_company_users',
        'can_manage_company_profile'
    ) then
        return false;
    end if;

    select public.resolve_company_user_permissions_for_company(
        company_user.company_id,
        company_user.role,
        company_user.status,
        company_user.permissions
    )
    into v_permissions
    from public.company_users as company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc
    limit 1;

    return coalesce((v_permissions ->> v_permission)::boolean, false);
end;
$$;

revoke all on function public.company_user_has_permission(uuid, text) from public;
revoke all on function public.company_user_has_permission(uuid, text) from anon;
grant execute on function public.company_user_has_permission(uuid, text) to authenticated;

create or replace function public.can_manage_company_users(p_company_id uuid)
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
           or public.company_user_has_permission(p_company_id, 'can_manage_company_users')
       );
$$;

revoke all on function public.can_manage_company_users(uuid) from public;
revoke all on function public.can_manage_company_users(uuid) from anon;
grant execute on function public.can_manage_company_users(uuid) to authenticated;

create or replace function public.can_manage_company_profile(p_company_id uuid)
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
           or public.company_user_has_permission(p_company_id, 'can_manage_company_profile')
       );
$$;

revoke all on function public.can_manage_company_profile(uuid) from public;
revoke all on function public.can_manage_company_profile(uuid) from anon;
grant execute on function public.can_manage_company_profile(uuid) to authenticated;

drop function if exists public.get_my_company_permissions(uuid);

create function public.get_my_company_permissions(
    p_company_id uuid default null
)
returns table (
    company_user_id uuid,
    company_id uuid,
    role text,
    status text,
    permissions jsonb,
    can_view_techos boolean,
    can_create_estimates boolean,
    can_add_item_to_estimate boolean,
    can_view_customers boolean,
    can_view_jobs boolean,
    can_manage_company_users boolean,
    can_manage_company_profile boolean
)
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
    select
        company_user.id,
        company_user.company_id,
        company_user.role,
        company_user.status,
        resolved.permissions,
        coalesce((resolved.permissions ->> 'can_view_techos')::boolean, false),
        coalesce((resolved.permissions ->> 'can_create_estimates')::boolean, false),
        coalesce((resolved.permissions ->> 'can_add_item_to_estimate')::boolean, false),
        coalesce((resolved.permissions ->> 'can_view_customers')::boolean, false),
        coalesce((resolved.permissions ->> 'can_view_jobs')::boolean, false),
        coalesce((resolved.permissions ->> 'can_manage_company_users')::boolean, false),
        coalesce((resolved.permissions ->> 'can_manage_company_profile')::boolean, false)
    from public.company_users as company_user
    cross join lateral (
        select public.resolve_company_user_permissions_for_company(
            company_user.company_id,
            company_user.role,
            company_user.status,
            company_user.permissions
        ) as permissions
    ) as resolved
    where company_user.auth_user_id = auth.uid()
      and (p_company_id is null or company_user.company_id = p_company_id)
    order by company_user.created_at asc;
$$;

revoke all on function public.get_my_company_permissions(uuid) from public;
revoke all on function public.get_my_company_permissions(uuid) from anon;
grant execute on function public.get_my_company_permissions(uuid) to authenticated;

create or replace function public.get_company_role_permission_profiles(
    p_company_id uuid
)
returns table (
    role text,
    permissions jsonb,
    is_custom boolean,
    updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not (
        public.is_platform_admin()
        or exists (
            select 1
            from public.company_users as company_user
            where company_user.company_id = p_company_id
              and company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'manager')
        )
    ) then
        raise exception 'Only a company owner or manager can review role permissions.';
    end if;

    return query
    with roles(role) as (
        values ('admin'), ('manager'), ('office'), ('dispatcher'), ('supervisor'), ('technician')
    )
    select
        roles.role,
        public.company_role_default_permissions(roles.role) || coalesce(profile.permissions, '{}'::jsonb),
        profile.id is not null,
        profile.updated_at
    from roles
    left join public.company_role_permission_profiles as profile
      on profile.company_id = p_company_id
     and profile.role = roles.role;
end;
$$;

revoke all on function public.get_company_role_permission_profiles(uuid) from public;
revoke all on function public.get_company_role_permission_profiles(uuid) from anon;
grant execute on function public.get_company_role_permission_profiles(uuid) to authenticated;

create or replace function public.set_company_role_permission_profile(
    p_company_id uuid,
    p_role text,
    p_permissions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_role text := lower(btrim(coalesce(p_role, '')));
    v_permissions jsonb := coalesce(p_permissions, '{}'::jsonb);
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    if v_role not in ('admin', 'manager', 'office', 'dispatcher', 'supervisor', 'technician') then
        raise exception 'This role cannot be customized.';
    end if;

    if not public.company_permissions_are_valid(v_permissions) then
        raise exception 'Permissions must contain only supported boolean values.';
    end if;

    if not (
        public.is_platform_admin()
        or exists (
            select 1
            from public.company_users as company_user
            where company_user.company_id = p_company_id
              and company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'manager')
        )
    ) then
        raise exception 'Only a company owner or manager can change role permissions.';
    end if;

    insert into public.company_role_permission_profiles (
        company_id,
        role,
        permissions,
        updated_by_user_id,
        updated_at
    )
    values (
        p_company_id,
        v_role,
        v_permissions,
        auth.uid(),
        now()
    )
    on conflict (company_id, role) do update
    set permissions = excluded.permissions,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now();

    return public.company_role_default_permissions(v_role) || v_permissions;
end;
$$;

revoke all on function public.set_company_role_permission_profile(uuid, text, jsonb) from public;
revoke all on function public.set_company_role_permission_profile(uuid, text, jsonb) from anon;
grant execute on function public.set_company_role_permission_profile(uuid, text, jsonb) to authenticated;

commit;
