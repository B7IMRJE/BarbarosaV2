-- Introduce the server-owned profile bootstrap/sync path before the client is
-- switched away from direct profile upserts. The later shared-core hardening
-- migration reapplies these definitions idempotently before revoking legacy
-- table privileges.

begin;

do $$
begin
    if to_regclass('public.profiles') is null then
        raise exception 'public.profiles is required before secure profile sync can be installed.';
    end if;
end;
$$;

create or replace function public.bootstrap_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_role text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'role', 'HOMEOWNER')));
    v_full_name text := nullif(btrim(coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
    )), '');
    v_phone text := null;
begin
    if v_role not in ('HOMEOWNER', 'WORK') then
        v_role := 'HOMEOWNER';
    end if;

    if v_role = 'HOMEOWNER' then
        v_phone := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
    end if;

    insert into public.profiles (id, email, full_name, phone, role)
    values (
        new.id,
        nullif(lower(btrim(coalesce(new.email, ''))), ''),
        v_full_name,
        v_phone,
        v_role
    )
    on conflict (id) do nothing;

    return new;
end;
$$;

revoke all on function public.bootstrap_profile_from_auth_user() from public;
revoke all on function public.bootstrap_profile_from_auth_user() from anon;
revoke all on function public.bootstrap_profile_from_auth_user() from authenticated;

drop trigger if exists on_auth_user_created_shared_profile on auth.users;
create trigger on_auth_user_created_shared_profile
after insert on auth.users
for each row execute function public.bootstrap_profile_from_auth_user();

insert into public.profiles (id, email, full_name, phone, role)
select
    auth_user.id,
    nullif(lower(btrim(coalesce(auth_user.email, ''))), ''),
    nullif(btrim(coalesce(
        auth_user.raw_user_meta_data ->> 'full_name',
        auth_user.raw_user_meta_data ->> 'name',
        ''
    )), ''),
    case
        when upper(btrim(coalesce(auth_user.raw_user_meta_data ->> 'role', 'HOMEOWNER'))) = 'HOMEOWNER'
            then nullif(btrim(coalesce(auth_user.raw_user_meta_data ->> 'phone', '')), '')
        else null
    end,
    case
        when upper(btrim(coalesce(auth_user.raw_user_meta_data ->> 'role', 'HOMEOWNER'))) = 'WORK'
            then 'WORK'
        else 'HOMEOWNER'
    end
from auth.users as auth_user
where not exists (
    select 1
    from public.profiles as profile
    where profile.id = auth_user.id
);

create or replace function public.sync_my_profile(
    p_full_name text default null,
    p_phone text default null,
    p_requested_role text default 'HOMEOWNER'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_requested_role text := upper(btrim(coalesce(p_requested_role, 'HOMEOWNER')));
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if v_requested_role not in ('HOMEOWNER', 'WORK') then
        raise exception 'Unsupported self-service profile role';
    end if;

    select nullif(lower(btrim(coalesce(auth_user.email, ''))), '')
    into v_email
    from auth.users as auth_user
    where auth_user.id = v_user_id;

    if not found then
        raise exception 'Authenticated account was not found';
    end if;

    insert into public.profiles (id, email, full_name, phone, role)
    values (
        v_user_id,
        v_email,
        nullif(btrim(coalesce(p_full_name, '')), ''),
        case
            when v_requested_role = 'HOMEOWNER'
                then nullif(btrim(coalesce(p_phone, '')), '')
            else null
        end,
        v_requested_role
    )
    on conflict (id) do update
    set
        email = coalesce(excluded.email, profiles.email),
        full_name = coalesce(excluded.full_name, profiles.full_name),
        phone = case
            when v_requested_role = 'HOMEOWNER'
                then coalesce(excluded.phone, profiles.phone)
            else profiles.phone
        end,
        role = case
            when upper(btrim(coalesce(profiles.role, ''))) = 'SUPER_ADMIN' then profiles.role
            when upper(btrim(coalesce(profiles.role, ''))) = 'WORK' then profiles.role
            when v_requested_role = 'WORK' then 'WORK'
            else 'HOMEOWNER'
        end;
end;
$$;

revoke all on function public.sync_my_profile(text, text, text) from public;
revoke all on function public.sync_my_profile(text, text, text) from anon;
grant execute on function public.sync_my_profile(text, text, text) to authenticated;

commit;
