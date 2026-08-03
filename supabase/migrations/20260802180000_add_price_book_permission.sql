-- Add an explicit, company-configurable Price Book management permission.
-- Existing management roles keep access; technician and dispatch roles remain view-only
-- unless an owner or manager intentionally enables this permission.

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
                'can_manage_price_book',
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
                'can_manage_price_book', false,
                'can_view_customers', false,
                'can_view_jobs', true,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
            )
        when lower(btrim(coalesce(p_role, ''))) in ('office', 'dispatcher', 'supervisor') then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', false,
                'can_add_item_to_estimate', false,
                'can_manage_price_book', false,
                'can_view_customers', true,
                'can_view_jobs', true,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
            )
        when lower(btrim(coalesce(p_role, ''))) in ('manager', 'admin', 'owner') then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', true,
                'can_add_item_to_estimate', true,
                'can_manage_price_book', true,
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
                'can_manage_price_book', false,
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
                'can_manage_price_book', false,
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
        'can_manage_price_book',
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
    can_manage_price_book boolean,
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
        coalesce((resolved.permissions ->> 'can_manage_price_book')::boolean, false),
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

create or replace function public.company_price_book_can_manage(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           coalesce(public.homeos_is_platform_admin(), false)
           or public.company_user_has_permission(p_company_id, 'can_manage_price_book')
       );
$$;

revoke all on function public.company_price_book_can_manage(uuid) from public;
revoke all on function public.company_price_book_can_manage(uuid) from anon;
grant execute on function public.company_price_book_can_manage(uuid) to authenticated;

commit;
