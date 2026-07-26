begin;

create or replace function public.get_platform_people_company_access()
returns table (
    id uuid,
    company_id uuid,
    auth_user_id uuid,
    full_name text,
    email text,
    role text,
    status text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select
        company_user.id,
        company_user.company_id,
        company_user.auth_user_id,
        company_user.full_name,
        company_user.email,
        company_user.role,
        company_user.status
    from public.company_users as company_user
    where public.homeos_is_platform_admin()
    order by
        company_user.company_id,
        lower(coalesce(company_user.full_name, company_user.email, company_user.id::text));
$$;

revoke all on function public.get_platform_people_company_access() from public;
revoke all on function public.get_platform_people_company_access() from anon;
grant execute on function public.get_platform_people_company_access() to authenticated;

commit;
