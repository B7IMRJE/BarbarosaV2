-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Give Company Management -> Team / Technicians a stable, RLS-safe way to
--   list company_users for the selected company. The page currently relies on
--   direct client table select, which can return an empty list if table RLS is
--   stricter than the existing company-user management RPC permissions.
--
-- Safety:
--   - Requires public.can_manage_company_users(p_company_id).
--   - Returns only company team/member fields already intended for this screen.
--   - Does not expose auth.users or customer/home data.

begin;

create or replace function public.get_company_users_for_management(
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

    if not public.can_manage_company_users(p_company_id) then
        raise exception 'Not authorized';
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
    from public.company_users company_user
    where company_user.company_id = p_company_id
    order by company_user.created_at desc nulls last, company_user.id desc;
end;
$$;

revoke all on function public.get_company_users_for_management(uuid) from public;
revoke all on function public.get_company_users_for_management(uuid) from anon;
grant execute on function public.get_company_users_for_management(uuid) to authenticated;

commit;

select
    to_regprocedure('public.get_company_users_for_management(uuid)') is not null as company_users_management_rpc_exists;
