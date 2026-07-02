-- 591 Company Owner Permissions And Transfer Foundation
-- Review-only SQL. Do not run automatically.
--
-- Goal:
--   Align the company permission RPC foundation with real company owners.
--   OWNER should have full company permissions after accepting a company user
--   invitation with role = owner.
--
-- Product notes:
--   - This does not remove any platform/super-admin support access.
--   - This does not transfer or remove existing owners automatically.
--   - Owner transfer/removal should be a separate, audited flow that never
--     leaves a company with zero active owners.
--   - Existing company invite acceptance should continue to use the invitation
--     role as the source of truth.

do $$
begin
    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before company owner permissions can be installed.';
    end if;

    if to_regclass('public.company_user_invitations') is null then
        raise exception 'public.company_user_invitations is required before company owner permissions can be installed.';
    end if;

    if to_regprocedure('public.company_permissions_are_valid(jsonb)') is null then
        raise exception 'public.company_permissions_are_valid(jsonb) is required. Apply SQL 587 first.';
    end if;

    if to_regprocedure('public.resolve_company_user_permissions(text,text,jsonb)') is null then
        raise exception 'public.resolve_company_user_permissions(text,text,jsonb) is required. Apply SQL 587 first.';
    end if;

    if to_regprocedure('public.company_user_has_permission(uuid,text)') is null then
        raise exception 'public.company_user_has_permission(uuid,text) is required. Apply SQL 587 first.';
    end if;
end $$;

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
                'can_view_jobs', true,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
            )
        when lower(btrim(coalesce(p_role, ''))) = 'manager' then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', true,
                'can_add_item_to_estimate', true,
                'can_view_customers', true,
                'can_view_jobs', true,
                'can_manage_company_users', true,
                'can_manage_company_profile', false
            )
        when lower(btrim(coalesce(p_role, ''))) = 'admin' then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', true,
                'can_add_item_to_estimate', true,
                'can_view_customers', true,
                'can_view_jobs', true,
                'can_manage_company_users', true,
                'can_manage_company_profile', true
            )
        when lower(btrim(coalesce(p_role, ''))) = 'owner' then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', true,
                'can_add_item_to_estimate', true,
                'can_view_customers', true,
                'can_view_jobs', true,
                'can_manage_company_users', true,
                'can_manage_company_profile', true
            )
        else
            jsonb_build_object(
                'can_view_techos', false,
                'can_create_estimates', false,
                'can_add_item_to_estimate', false,
                'can_view_customers', false,
                'can_view_jobs', false,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
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
                'can_view_jobs', false,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
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
stable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_permission text := lower(btrim(coalesce(p_permission, '')));
    v_permissions jsonb;
begin
    if auth.uid() is null then
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
        'can_view_jobs',
        'can_manage_company_users',
        'can_manage_company_profile'
    ) then
        return false;
    end if;

    select public.resolve_company_user_permissions(
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

-- Return type changes require dropping before recreating in PostgreSQL.
drop function if exists public.get_my_company_permissions(uuid);

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
        company_user.id as company_user_id,
        company_user.company_id,
        company_user.role,
        company_user.status,
        resolved.permissions,
        coalesce((resolved.permissions ->> 'can_view_techos')::boolean, false) as can_view_techos,
        coalesce((resolved.permissions ->> 'can_create_estimates')::boolean, false) as can_create_estimates,
        coalesce((resolved.permissions ->> 'can_add_item_to_estimate')::boolean, false) as can_add_item_to_estimate,
        coalesce((resolved.permissions ->> 'can_view_customers')::boolean, false) as can_view_customers,
        coalesce((resolved.permissions ->> 'can_view_jobs')::boolean, false) as can_view_jobs,
        coalesce((resolved.permissions ->> 'can_manage_company_users')::boolean, false) as can_manage_company_users,
        coalesce((resolved.permissions ->> 'can_manage_company_profile')::boolean, false) as can_manage_company_profile
    from public.company_users as company_user
    cross join lateral (
        select public.resolve_company_user_permissions(
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

-- Review note for the future ownership transfer pass:
--   Do not add remove/transfer owner UI until a dedicated RPC guarantees that
--   at least one active owner remains after the operation. A safe transfer RPC
--   should lock company_users rows for the company, verify the target user is
--   active with role owner, then demote or deactivate the prior owner only when
--   the active owner count will remain >= 1.
