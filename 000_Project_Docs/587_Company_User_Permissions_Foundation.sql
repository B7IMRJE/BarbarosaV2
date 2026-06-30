-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Add the first durable permission foundation for company TechOS accounts.
--   Company users already have separate company_users identities linked to the
--   same Supabase Auth account a homeowner may use for HomeOS. This proposal
--   keeps that split and adds role-derived plus overrideable permissions.
--
-- Product scope:
--   - Company admins/managers can invite TECH / MANAGER / ADMIN users through
--     the existing company_user_invitations flow.
--   - Accepted invitations continue to create/link company_users.
--   - HomeOS homeowner data remains separate. This file does not grant private
--     HomeOS documents/photos/history to TechOS.
--   - Estimate pricing is not added here; only permission gates are proposed.
--
-- Permission keys:
--   Postgres identifiers are lowercase, so the app-facing can_view_techoS
--   requirement is stored as can_view_techos.
--   - can_view_techos
--   - can_create_estimates
--   - can_add_item_to_estimate
--   - can_view_customers
--   - can_view_jobs

begin;

do $$
begin
    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before company permissions can be installed.';
    end if;

    if to_regclass('public.company_user_invitations') is null then
        raise exception 'public.company_user_invitations is required before company permissions can be installed.';
    end if;

    if to_regprocedure('public.can_manage_company_users(uuid)') is null then
        raise exception 'public.can_manage_company_users(uuid) is required before company permissions can be installed.';
    end if;
end;
$$;

alter table public.company_users
    add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.company_user_invitations
    add column if not exists permissions jsonb not null default '{}'::jsonb;

create or replace function public.company_permissions_are_valid(
    p_permissions jsonb
)
returns boolean
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select
        jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) = 'object'
        and not exists (
            select 1
            from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) permission_entry
            where permission_entry.key in (
                'can_view_techos',
                'can_create_estimates',
                'can_add_item_to_estimate',
                'can_view_customers',
                'can_view_jobs'
            )
              and jsonb_typeof(permission_entry.value) <> 'boolean'
        );
$$;

revoke all on function public.company_permissions_are_valid(jsonb) from public;
revoke all on function public.company_permissions_are_valid(jsonb) from anon;
grant execute on function public.company_permissions_are_valid(jsonb) to authenticated;

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

create or replace function public.company_role_default_permissions(
    p_role text
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
    select case
        when lower(btrim(coalesce(p_role, ''))) in ('tech', 'technician') then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', false,
                'can_add_item_to_estimate', false,
                'can_view_customers', false,
                'can_view_jobs', true
            )
        when lower(btrim(coalesce(p_role, ''))) in ('manager', 'admin', 'owner') then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', true,
                'can_add_item_to_estimate', true,
                'can_view_customers', true,
                'can_view_jobs', true
            )
        else
            jsonb_build_object(
                'can_view_techos', false,
                'can_create_estimates', false,
                'can_add_item_to_estimate', false,
                'can_view_customers', false,
                'can_view_jobs', false
            )
    end;
$$;

revoke all on function public.company_role_default_permissions(text) from public;
revoke all on function public.company_role_default_permissions(text) from anon;
grant execute on function public.company_role_default_permissions(text) to authenticated;

create or replace function public.resolve_company_user_permissions(
    p_role text,
    p_status text,
    p_permissions jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
    select case
        when lower(btrim(coalesce(p_status, ''))) = 'active' then
            public.company_role_default_permissions(p_role) ||
            coalesce(nullif(p_permissions, 'null'::jsonb), '{}'::jsonb)
        else
            jsonb_build_object(
                'can_view_techos', false,
                'can_create_estimates', false,
                'can_add_item_to_estimate', false,
                'can_view_customers', false,
                'can_view_jobs', false
            )
    end;
$$;

revoke all on function public.resolve_company_user_permissions(text, text, jsonb) from public;
revoke all on function public.resolve_company_user_permissions(text, text, jsonb) from anon;
grant execute on function public.resolve_company_user_permissions(text, text, jsonb) to authenticated;

create or replace function public.company_user_has_permission(
    p_company_id uuid,
    p_permission text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_permission text := lower(btrim(coalesce(p_permission, '')));
    v_permissions jsonb;
begin
    if v_user_id is null then
        return false;
    end if;

    if p_company_id is null then
        return false;
    end if;

    if v_permission not in (
        'can_view_techos',
        'can_create_estimates',
        'can_add_item_to_estimate',
        'can_view_customers',
        'can_view_jobs'
    ) then
        return false;
    end if;

    select public.resolve_company_user_permissions(
        company_user.role,
        company_user.status,
        company_user.permissions
    )
    into v_permissions
    from public.company_users company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = v_user_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc nulls last,
             company_user.id asc
    limit 1;

    return coalesce((v_permissions ->> v_permission)::boolean, false);
end;
$$;

revoke all on function public.company_user_has_permission(uuid, text) from public;
revoke all on function public.company_user_has_permission(uuid, text) from anon;
grant execute on function public.company_user_has_permission(uuid, text) to authenticated;

create or replace function public.get_my_company_permissions(
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
    can_view_jobs boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    return query
    select
        company_user.id as company_user_id,
        company_user.company_id,
        company_user.role,
        company_user.status,
        resolved.permissions,
        coalesce((resolved.permissions ->> 'can_view_techos')::boolean, false) as can_view_techos,
        coalesce((resolved.permissions ->> 'can_create_estimates')::boolean, false) as can_create_estimates,
        coalesce((resolved.permissions ->> 'can_add_item_to_estimate')::boolean, false) as can_add_item_to_estimate,
        coalesce((resolved.permissions ->> 'can_view_customers')::boolean, false) as can_view_customers,
        coalesce((resolved.permissions ->> 'can_view_jobs')::boolean, false) as can_view_jobs
    from public.company_users company_user
    cross join lateral (
        select public.resolve_company_user_permissions(
            company_user.role,
            company_user.status,
            company_user.permissions
        ) as permissions
    ) resolved
    where company_user.auth_user_id = auth.uid()
      and (p_company_id is null or company_user.company_id = p_company_id)
    order by company_user.created_at asc nulls last,
             company_user.id asc;
end;
$$;

revoke all on function public.get_my_company_permissions(uuid) from public;
revoke all on function public.get_my_company_permissions(uuid) from anon;
grant execute on function public.get_my_company_permissions(uuid) to authenticated;

create or replace function public.update_company_user_permissions(
    p_company_user_id uuid,
    p_permissions jsonb
)
returns table (
    company_user_id uuid,
    company_id uuid,
    role text,
    status text,
    permissions jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_user public.company_users%rowtype;
    v_permissions jsonb := coalesce(p_permissions, '{}'::jsonb);
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_user_id is null then
        raise exception 'company_user_id is required';
    end if;

    if not public.company_permissions_are_valid(v_permissions) then
        raise exception 'permissions must be a JSON object with boolean permission values';
    end if;

    select *
    into v_company_user
    from public.company_users company_user
    where company_user.id = p_company_user_id
    for update;

    if not found then
        raise exception 'Company user not found';
    end if;

    if not public.can_manage_company_users(v_company_user.company_id) then
        raise exception 'Not authorized';
    end if;

    update public.company_users
    set permissions = v_permissions,
        updated_at = now()
    where id = v_company_user.id;

    return query
    select
        company_user.id,
        company_user.company_id,
        company_user.role,
        company_user.status,
        public.resolve_company_user_permissions(
            company_user.role,
            company_user.status,
            company_user.permissions
        )
    from public.company_users company_user
    where company_user.id = v_company_user.id;
end;
$$;

revoke all on function public.update_company_user_permissions(uuid, jsonb) from public;
revoke all on function public.update_company_user_permissions(uuid, jsonb) from anon;
grant execute on function public.update_company_user_permissions(uuid, jsonb) to authenticated;

commit;

select
    to_regprocedure('public.company_permissions_are_valid(jsonb)') is not null as permissions_validation_exists,
    to_regprocedure('public.company_role_default_permissions(text)') is not null as default_permissions_exists,
    to_regprocedure('public.resolve_company_user_permissions(text,text,jsonb)') is not null as resolve_permissions_exists,
    to_regprocedure('public.company_user_has_permission(uuid,text)') is not null as permission_check_exists,
    to_regprocedure('public.get_my_company_permissions(uuid)') is not null as my_permissions_rpc_exists,
    to_regprocedure('public.update_company_user_permissions(uuid,jsonb)') is not null as update_permissions_rpc_exists;
