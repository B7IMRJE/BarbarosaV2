-- Company User Invitation Acceptance - Phase 1B
-- Lets an authenticated user list and accept only pending company invitations
-- for their verified account email. Writes remain RPC-only.

begin;

create index if not exists company_user_invitations_pending_normalized_email_idx
on public.company_user_invitations (lower(btrim(email)), status)
where status = 'pending';

create or replace function public.get_my_company_user_invitations()
returns table (
    invitation_id uuid,
    company_id uuid,
    company_name text,
    invited_role text,
    full_name text,
    email text,
    status text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_auth_email text;
    v_profile_email text;
    v_email_confirmed_at timestamptz;
    v_verified_email text;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    select
        lower(btrim(coalesce(auth_user.email, ''))),
        auth_user.email_confirmed_at,
        lower(btrim(coalesce(profile.email, '')))
    into
        v_auth_email,
        v_email_confirmed_at,
        v_profile_email
    from auth.users auth_user
    left join public.profiles profile
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

    return query
    select
        invitation.id as invitation_id,
        invitation.company_id,
        company.name as company_name,
        invitation.role as invited_role,
        invitation.full_name,
        invitation.email,
        invitation.status,
        invitation.created_at
    from public.company_user_invitations invitation
    join public.companies company
      on company.id = invitation.company_id
    where invitation.status = 'pending'
      and (invitation.expires_at is null or invitation.expires_at > now())
      and lower(btrim(invitation.email)) = v_verified_email
    order by invitation.created_at desc, invitation.id desc;
end;
$$;

revoke all on function public.get_my_company_user_invitations() from public;
revoke all on function public.get_my_company_user_invitations() from anon;
grant execute on function public.get_my_company_user_invitations() to authenticated;

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
    from auth.users auth_user
    left join public.profiles profile
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
    from public.company_user_invitations invitation
    where invitation.id = p_invitation_id
    for update;

    if not found then
        raise exception 'Invitation not found';
    end if;

    if lower(btrim(v_invitation.email)) <> v_verified_email then
        raise exception 'Invitation email does not match authenticated account';
    end if;

    if v_invitation.status = 'accepted' then
        if v_invitation.accepted_by_user_id = v_user_id then
            select *
            into v_company_user
            from public.company_users company_user
            where company_user.company_id = v_invitation.company_id
              and company_user.auth_user_id = v_user_id;

            if found then
                return v_company_user;
            end if;

            raise exception 'Accepted membership not found';
        end if;

        raise exception 'Invitation already accepted';
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

    if v_invitation.role not in ('owner', 'admin', 'manager', 'office', 'technician') then
        raise exception 'Invalid invitation role';
    end if;

    if exists (
        select 1
        from public.company_users company_user
        left join auth.users existing_auth_user
          on existing_auth_user.id = company_user.auth_user_id
        left join public.profiles existing_profile
          on existing_profile.id = company_user.auth_user_id
        where company_user.company_id = v_invitation.company_id
          and company_user.auth_user_id <> v_user_id
          and (
              lower(btrim(coalesce(company_user.email, ''))) = v_verified_email
              or lower(btrim(coalesce(existing_auth_user.email, ''))) = v_verified_email
              or lower(btrim(coalesce(existing_profile.email, ''))) = v_verified_email
          )
    ) then
        raise exception 'A company membership already exists for this email';
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

alter table public.company_user_invitations enable row level security;
alter table public.company_users enable row level security;

do $$
declare
    v_policy record;
begin
    for v_policy in
        select tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and tablename in ('company_user_invitations', 'company_users')
          and cmd <> 'SELECT'
    loop
        execute format(
            'drop policy if exists %I on public.%I',
            v_policy.policyname,
            v_policy.tablename
        );
    end loop;
end
$$;

revoke all on table public.company_user_invitations from public;
revoke all on table public.company_user_invitations from anon;
revoke all on table public.company_user_invitations from authenticated;
grant select on table public.company_user_invitations to authenticated;

revoke all on table public.company_users from public;
revoke all on table public.company_users from anon;
revoke all on table public.company_users from authenticated;
grant select on table public.company_users to authenticated;

commit;
