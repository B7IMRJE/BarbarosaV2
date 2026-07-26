begin;

create or replace function public.get_platform_people_accounts_v3()
returns table (
    id uuid,
    full_name text,
    email text,
    role text,
    auth_status text,
    email_confirmed_at timestamptz,
    last_sign_in_at timestamptz,
    created_at timestamptz,
    avatar_url text
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
        profile.role,
        case
            when auth_user.id is null then 'missing_auth_account'
            when auth_user.banned_until is not null
                and auth_user.banned_until > now() then 'suspended'
            when auth_user.email_confirmed_at is null then 'pending_confirmation'
            else 'active'
        end,
        auth_user.email_confirmed_at,
        auth_user.last_sign_in_at,
        auth_user.created_at,
        coalesce(
            nullif(auth_user.raw_user_meta_data ->> 'avatar_url', ''),
            nullif(auth_user.raw_user_meta_data ->> 'picture', ''),
            nullif(auth_user.raw_user_meta_data ->> 'photo_url', '')
        )
    from public.profiles as profile
    left join auth.users as auth_user
      on auth_user.id = profile.id
    where public.homeos_is_platform_admin()
    order by lower(coalesce(profile.full_name, auth_user.email, profile.id::text));
$$;

revoke all on function public.get_platform_people_accounts_v3() from public;
revoke all on function public.get_platform_people_accounts_v3() from anon;
grant execute on function public.get_platform_people_accounts_v3() to authenticated;

commit;
