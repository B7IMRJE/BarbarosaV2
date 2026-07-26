begin;

create or replace function public.get_platform_people_accounts()
returns table (
    id uuid,
    full_name text,
    email text,
    role text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select
        profile.id,
        profile.full_name,
        auth_user.email::text,
        profile.role
    from public.profiles as profile
    left join auth.users as auth_user
      on auth_user.id = profile.id
    where public.homeos_is_platform_admin()
    order by lower(coalesce(profile.full_name, auth_user.email, profile.id::text));
$$;

revoke all on function public.get_platform_people_accounts() from public;
revoke all on function public.get_platform_people_accounts() from anon;
grant execute on function public.get_platform_people_accounts() to authenticated;

commit;
