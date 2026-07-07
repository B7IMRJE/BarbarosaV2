-- Add first-class Dispatch roles without giving plain technicians Dispatch.
--
-- Final model:
--   technician: TechOS assigned work only
--   office / dispatcher / supervisor: Dispatch, schedule, request handling
--   manager / admin / owner: Dispatch plus higher company permissions

begin;

do $$
begin
    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before company role hardening can be installed.';
    end if;

    if to_regclass('public.company_user_invitations') is null then
        raise exception 'public.company_user_invitations is required before company role hardening can be installed.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before company profile permission hardening can be installed.';
    end if;

    if to_regprocedure('public.is_platform_admin()') is null then
        raise exception 'public.is_platform_admin() is required before company role hardening can be installed.';
    end if;
end;
$$;

alter table public.company_users
    drop constraint if exists company_users_role_check;

alter table public.company_users
    add constraint company_users_role_check
    check (role in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor', 'technician'));

alter table public.company_user_invitations
    drop constraint if exists company_user_invitations_role_check;

alter table public.company_user_invitations
    add constraint company_user_invitations_role_check
    check (role in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor', 'technician'));

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
        when lower(btrim(coalesce(p_role, ''))) in ('office', 'dispatcher', 'supervisor') then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', false,
                'can_add_item_to_estimate', false,
                'can_view_customers', true,
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
                'can_manage_company_profile', true
            )
        when lower(btrim(coalesce(p_role, ''))) in ('admin', 'owner') then
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

create or replace function public.can_dispatch_company(p_company_id uuid)
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
           or exists (
               select 1
               from public.company_users as company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor')
           )
       );
$$;

revoke all on function public.can_dispatch_company(uuid) from public;
revoke all on function public.can_dispatch_company(uuid) from anon;
grant execute on function public.can_dispatch_company(uuid) to authenticated;

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
           or exists (
               select 1
               from public.company_users as company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'admin', 'manager')
           )
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
           or exists (
               select 1
               from public.company_users as company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'admin', 'manager')
           )
       );
$$;

revoke all on function public.can_manage_company_profile(uuid) from public;
revoke all on function public.can_manage_company_profile(uuid) from anon;
grant execute on function public.can_manage_company_profile(uuid) to authenticated;

create or replace function public.create_company_user_invitation(
    p_company_id uuid,
    p_email text,
    p_full_name text default null,
    p_role text default 'technician'
)
returns public.company_user_invitations
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text := lower(btrim(coalesce(p_email, '')));
    v_role text := lower(btrim(coalesce(p_role, 'technician')));
    v_invitation public.company_user_invitations%rowtype;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    if not public.can_manage_company_users(p_company_id) then
        raise exception 'Not authorized';
    end if;

    if v_email = '' then
        raise exception 'Email is required';
    end if;

    if v_role not in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor', 'technician') then
        raise exception 'Invalid company invitation role: %', p_role;
    end if;

    if exists (
        select 1
        from public.company_users as company_user
        where company_user.company_id = p_company_id
          and (
              lower(btrim(coalesce(company_user.email, ''))) = v_email
              or exists (
                  select 1
                  from public.profiles as profile
                  where profile.id = company_user.auth_user_id
                    and lower(btrim(coalesce(profile.email, ''))) = v_email
              )
          )
    ) then
        raise exception 'A company membership already exists for this email';
    end if;

    if exists (
        select 1
        from public.company_user_invitations as invitation
        where invitation.company_id = p_company_id
          and invitation.status = 'pending'
          and lower(btrim(invitation.email)) = v_email
    ) then
        raise exception 'A pending invitation already exists for this email';
    end if;

    insert into public.company_user_invitations (
        company_id,
        email,
        full_name,
        role,
        status,
        invited_by_user_id
    )
    values (
        p_company_id,
        v_email,
        nullif(btrim(p_full_name), ''),
        v_role,
        'pending',
        v_user_id
    )
    returning * into v_invitation;

    return v_invitation;
end;
$$;

revoke all on function public.create_company_user_invitation(uuid, text, text, text) from public;
revoke all on function public.create_company_user_invitation(uuid, text, text, text) from anon;
grant execute on function public.create_company_user_invitation(uuid, text, text, text) to authenticated;

create or replace function public.accept_company_user_invitation(
    p_invitation_id uuid
)
returns public.company_users
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_auth_email text;
    v_profile_email text;
    v_profile_full_name text;
    v_email_confirmed_at timestamptz;
    v_verified_email text;
    v_invitation public.company_user_invitations%rowtype;
    v_company_user public.company_users%rowtype;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_invitation_id is null then
        raise exception 'invitation_id is required';
    end if;

    select
        lower(btrim(coalesce(auth_user.email, ''))),
        auth_user.email_confirmed_at,
        lower(btrim(coalesce(profile.email, ''))),
        nullif(btrim(profile.full_name), '')
    into
        v_auth_email,
        v_email_confirmed_at,
        v_profile_email,
        v_profile_full_name
    from auth.users as auth_user
    left join public.profiles as profile
      on profile.id = auth_user.id
    where auth_user.id = v_user_id;

    if not found then
        raise exception 'Authenticated user not found';
    end if;

    if v_email_confirmed_at is null then
        raise exception 'Verified account email required';
    end if;

    v_verified_email := nullif(v_auth_email, '');

    if v_verified_email is null then
        v_verified_email := nullif(v_profile_email, '');
    end if;

    if v_verified_email is null then
        raise exception 'Verified account email required';
    end if;

    select *
    into v_invitation
    from public.company_user_invitations as invitation
    where invitation.id = p_invitation_id
    for update;

    if not found then
        raise exception 'Invitation not found';
    end if;

    if lower(btrim(v_invitation.email)) <> v_verified_email then
        raise exception 'Invitation email does not match authenticated account';
    end if;

    if v_invitation.status = 'accepted' then
        select *
        into v_company_user
        from public.company_users as company_user
        where company_user.company_id = v_invitation.company_id
          and company_user.auth_user_id = v_user_id;

        if found then
            return v_company_user;
        end if;

        raise exception 'Accepted membership not found';
    end if;

    if v_invitation.status = 'revoked' then
        raise exception 'Invitation has been revoked';
    end if;

    if v_invitation.status = 'expired'
       or (v_invitation.expires_at is not null and v_invitation.expires_at <= now()) then
        raise exception 'Invitation has expired';
    end if;

    if v_invitation.status <> 'pending' then
        raise exception 'Only pending invitations can be accepted';
    end if;

    if v_invitation.role not in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor', 'technician') then
        raise exception 'Invalid invitation role';
    end if;

    insert into public.company_users (
        company_id,
        auth_user_id,
        full_name,
        email,
        role,
        status,
        invited_by_user_id,
        created_at,
        updated_at,
        deactivated_at
    )
    values (
        v_invitation.company_id,
        v_user_id,
        coalesce(nullif(btrim(v_invitation.full_name), ''), v_profile_full_name),
        v_verified_email,
        v_invitation.role,
        'active',
        v_invitation.invited_by_user_id,
        now(),
        now(),
        null
    )
    on conflict (company_id, auth_user_id)
    do update set
        full_name = coalesce(
            nullif(btrim(excluded.full_name), ''),
            public.company_users.full_name
        ),
        email = excluded.email,
        role = excluded.role,
        status = 'active',
        invited_by_user_id = coalesce(
            public.company_users.invited_by_user_id,
            excluded.invited_by_user_id
        ),
        updated_at = now(),
        deactivated_at = null
    returning * into v_company_user;

    update public.company_user_invitations
    set status = 'accepted',
        accepted_by_user_id = v_user_id,
        accepted_at = now(),
        updated_at = now()
    where id = v_invitation.id
      and status = 'pending'
    returning * into v_invitation;

    if not found then
        raise exception 'Failed to accept invitation';
    end if;

    return v_company_user;
end;
$$;

revoke all on function public.accept_company_user_invitation(uuid) from public;
revoke all on function public.accept_company_user_invitation(uuid) from anon;
grant execute on function public.accept_company_user_invitation(uuid) to authenticated;

create or replace function public.update_company_brand_profile(
    p_company_id uuid,
    p_public_name text default null,
    p_dba_name text default null,
    p_logo_url text default null,
    p_primary_color text default null,
    p_secondary_color text default null,
    p_accent_color text default null,
    p_service_categories text[] default '{}'::text[],
    p_homeos_rating numeric default 0,
    p_homeos_rating_count integer default 0,
    p_combined_experience_years integer default 0,
    p_license_number text default null,
    p_phone text default null,
    p_website text default null,
    p_short_description text default null
)
returns public.companies
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    updated_company public.companies%rowtype;
begin
    if not public.can_manage_company_profile(p_company_id) then
        raise exception 'Not authorized';
    end if;

    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    update public.companies
    set
        public_name = nullif(btrim(p_public_name), ''),
        dba_name = nullif(btrim(p_dba_name), ''),
        logo_url = nullif(btrim(p_logo_url), ''),
        primary_color = coalesce(nullif(btrim(p_primary_color), ''), '#071B33'),
        secondary_color = coalesce(nullif(btrim(p_secondary_color), ''), '#FFFFFF'),
        accent_color = coalesce(nullif(btrim(p_accent_color), ''), '#0B5FFF'),
        theme_color = coalesce(nullif(btrim(p_primary_color), ''), theme_color, '#071B33'),
        service_categories = coalesce(p_service_categories, '{}'::text[]),
        homeos_rating = greatest(0, least(5, coalesce(p_homeos_rating, 0))),
        homeos_rating_count = greatest(0, coalesce(p_homeos_rating_count, 0)),
        combined_experience_years = greatest(0, coalesce(p_combined_experience_years, 0)),
        license_number = nullif(btrim(p_license_number), ''),
        phone = nullif(btrim(p_phone), ''),
        website = nullif(btrim(p_website), ''),
        short_description = nullif(btrim(p_short_description), ''),
        updated_at = now()
    where id = p_company_id
    returning * into updated_company;

    if updated_company.id is null then
        raise exception 'Company not found';
    end if;

    return updated_company;
end;
$$;

revoke all on function public.update_company_brand_profile(
    uuid, text, text, text, text, text, text, text[], numeric, integer, integer, text, text, text, text
) from public;
revoke all on function public.update_company_brand_profile(
    uuid, text, text, text, text, text, text, text[], numeric, integer, integer, text, text, text, text
) from anon;
grant execute on function public.update_company_brand_profile(
    uuid, text, text, text, text, text, text, text[], numeric, integer, integer, text, text, text, text
) to authenticated;

commit;
