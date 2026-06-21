-- Company Users Foundation - Phase 1A
-- Creates multi-company membership support, invitation records, secured RPCs,
-- and explicit company-id connection-code redemption.

alter table public.company_users
    add column if not exists updated_at timestamptz;

update public.company_users
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.company_users
    alter column updated_at set default now(),
    alter column updated_at set not null,
    add column if not exists invited_by_user_id uuid null,
    add column if not exists deactivated_at timestamptz null;

alter table public.company_users
    alter column auth_user_id set not null;

update public.company_users company_user
set role = normalized.normalized_role,
    updated_at = now()
from (
    select
        id,
        case
            when lower(trim(coalesce(role, ''))) = 'owner' then 'owner'
            when lower(trim(coalesce(role, ''))) = 'admin' then 'admin'
            when lower(trim(coalesce(role, ''))) = 'manager' then 'manager'
            when lower(trim(coalesce(role, ''))) = 'office' then 'office'
            when lower(trim(coalesce(role, ''))) in ('tech', 'technician', 'user') then 'technician'
            else 'technician'
        end as normalized_role
    from public.company_users
) normalized
where company_user.id = normalized.id
  and company_user.role is distinct from normalized.normalized_role;

update public.company_users company_user
set status = normalized.normalized_status,
    updated_at = now()
from (
    select
        id,
        case
            when lower(trim(coalesce(status, ''))) in ('pending', 'active', 'suspended', 'inactive', 'revoked')
                then lower(trim(status))
            else 'inactive'
        end as normalized_status
    from public.company_users
) normalized
where company_user.id = normalized.id
  and company_user.status is distinct from normalized.normalized_status;

alter table public.company_users
    alter column role set default 'technician',
    alter column status set default 'active',
    alter column role set not null,
    alter column status set not null;

alter table public.company_users
    drop constraint if exists company_users_auth_user_id_key,
    drop constraint if exists company_users_role_check,
    drop constraint if exists company_users_status_check;

alter table public.company_users
    add constraint company_users_role_check
        check (role in ('owner', 'admin', 'manager', 'office', 'technician')),
    add constraint company_users_status_check
        check (status in ('pending', 'active', 'suspended', 'inactive', 'revoked'));

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_users_company_id_auth_user_id_key'
          and conrelid = 'public.company_users'::regclass
    ) then
        alter table public.company_users
            add constraint company_users_company_id_auth_user_id_key
            unique (company_id, auth_user_id);
    end if;
end
$$;

create index if not exists company_users_company_id_auth_user_id_idx
on public.company_users (company_id, auth_user_id);

create index if not exists company_users_company_id_normalized_email_idx
on public.company_users (company_id, lower(btrim(email)))
where email is not null;

do $$
begin
    if to_regclass('auth.users') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'company_users_invited_by_user_id_fkey'
             and conrelid = 'public.company_users'::regclass
       ) then
        alter table public.company_users
            add constraint company_users_invited_by_user_id_fkey
            foreign key (invited_by_user_id)
            references auth.users(id);
    end if;
end
$$;

create table if not exists public.company_user_invitations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    email text not null,
    full_name text null,
    role text not null,
    status text not null default 'pending',
    token_hash text null,
    expires_at timestamptz null,
    invited_by_user_id uuid not null,
    accepted_by_user_id uuid null,
    accepted_at timestamptz null,
    revoked_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.company_user_invitations
    add column if not exists id uuid,
    add column if not exists company_id uuid,
    add column if not exists email text,
    add column if not exists full_name text null,
    add column if not exists role text,
    add column if not exists status text,
    add column if not exists token_hash text null,
    add column if not exists expires_at timestamptz null,
    add column if not exists invited_by_user_id uuid,
    add column if not exists accepted_by_user_id uuid null,
    add column if not exists accepted_at timestamptz null,
    add column if not exists revoked_at timestamptz null,
    add column if not exists created_at timestamptz,
    add column if not exists updated_at timestamptz;

update public.company_user_invitations
set email = lower(btrim(email))
where email is not null
  and email is distinct from lower(btrim(email));

update public.company_user_invitations
set id = gen_random_uuid()
where id is null;

update public.company_user_invitations invitation
set role = normalized.normalized_role,
    updated_at = now()
from (
    select
        id,
        case
            when lower(trim(coalesce(role, ''))) = 'owner' then 'owner'
            when lower(trim(coalesce(role, ''))) = 'admin' then 'admin'
            when lower(trim(coalesce(role, ''))) = 'manager' then 'manager'
            when lower(trim(coalesce(role, ''))) = 'office' then 'office'
            when lower(trim(coalesce(role, ''))) in ('tech', 'technician', 'user') then 'technician'
            else 'technician'
        end as normalized_role
    from public.company_user_invitations
) normalized
where invitation.id = normalized.id
  and invitation.role is distinct from normalized.normalized_role;

update public.company_user_invitations invitation
set status = normalized.normalized_status,
    updated_at = now()
from (
    select
        id,
        case
            when lower(trim(coalesce(status, ''))) in ('pending', 'accepted', 'revoked', 'expired')
                then lower(trim(status))
            else 'pending'
        end as normalized_status
    from public.company_user_invitations
) normalized
where invitation.id = normalized.id
  and invitation.status is distinct from normalized.normalized_status;

update public.company_user_invitations
set created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, created_at, now()),
    status = coalesce(nullif(status, ''), 'pending')
where created_at is null
   or updated_at is null
   or status is null
   or status = '';

alter table public.company_user_invitations
    alter column id set default gen_random_uuid(),
    alter column id set not null,
    alter column company_id set not null,
    alter column email set not null,
    alter column role set not null,
    alter column role set default 'technician',
    alter column status set not null,
    alter column status set default 'pending',
    alter column invited_by_user_id set not null,
    alter column created_at set not null,
    alter column created_at set default now(),
    alter column updated_at set not null,
    alter column updated_at set default now();

alter table public.company_user_invitations
    drop constraint if exists company_user_invitations_email_not_blank,
    drop constraint if exists company_user_invitations_role_check,
    drop constraint if exists company_user_invitations_status_check;

alter table public.company_user_invitations
    add constraint company_user_invitations_email_not_blank
        check (btrim(email) <> ''),
    add constraint company_user_invitations_role_check
        check (role in ('owner', 'admin', 'manager', 'office', 'technician')),
    add constraint company_user_invitations_status_check
        check (status in ('pending', 'accepted', 'revoked', 'expired'));

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where contype = 'p'
          and conrelid = 'public.company_user_invitations'::regclass
    ) then
        alter table public.company_user_invitations
            add constraint company_user_invitations_pkey
            primary key (id);
    end if;
end
$$;

create index if not exists company_user_invitations_company_id_idx
on public.company_user_invitations (company_id);

create index if not exists company_user_invitations_status_idx
on public.company_user_invitations (status);

create index if not exists company_user_invitations_invited_by_user_id_idx
on public.company_user_invitations (invited_by_user_id);

create unique index if not exists company_user_invitations_pending_company_email_key
on public.company_user_invitations (company_id, lower(btrim(email)))
where status = 'pending';

do $$
begin
    if to_regclass('public.companies') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'company_user_invitations_company_id_fkey'
             and conrelid = 'public.company_user_invitations'::regclass
       ) then
        alter table public.company_user_invitations
            add constraint company_user_invitations_company_id_fkey
            foreign key (company_id)
            references public.companies(id)
            on delete cascade;
    end if;
end
$$;

do $$
begin
    if to_regclass('auth.users') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'company_user_invitations_invited_by_user_id_fkey'
             and conrelid = 'public.company_user_invitations'::regclass
       ) then
        alter table public.company_user_invitations
            add constraint company_user_invitations_invited_by_user_id_fkey
            foreign key (invited_by_user_id)
            references auth.users(id);
    end if;

    if to_regclass('auth.users') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'company_user_invitations_accepted_by_user_id_fkey'
             and conrelid = 'public.company_user_invitations'::regclass
       ) then
        alter table public.company_user_invitations
            add constraint company_user_invitations_accepted_by_user_id_fkey
            foreign key (accepted_by_user_id)
            references auth.users(id);
    end if;
end
$$;

create or replace function public.is_platform_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_has_platform_flag boolean := false;
    v_is_admin boolean := false;
begin
    if v_user_id is null or to_regclass('public.profiles') is null then
        return false;
    end if;

    select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name = 'is_platform_admin'
    )
    into v_has_platform_flag;

    if v_has_platform_flag then
        execute $sql$
            select exists (
                select 1
                from public.profiles profile
                where profile.id = $1
                  and (
                      upper(trim(coalesce(profile.role, ''))) = 'SUPER_ADMIN'
                      or coalesce(profile.is_platform_admin, false) = true
                  )
            )
        $sql$
        into v_is_admin
        using v_user_id;
    else
        select exists (
            select 1
            from public.profiles profile
            where profile.id = v_user_id
              and upper(trim(coalesce(profile.role, ''))) = 'SUPER_ADMIN'
        )
        into v_is_admin;
    end if;

    return coalesce(v_is_admin, false);
end;
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.can_manage_company_users(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           public.is_platform_admin()
           or exists (
               select 1
               from public.company_users company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and company_user.status = 'active'
                 and lower(trim(coalesce(company_user.role, ''))) in ('owner', 'admin')
           )
       );
$$;

revoke all on function public.can_manage_company_users(uuid) from public;
grant execute on function public.can_manage_company_users(uuid) to authenticated;

create or replace function public.create_company_user_invitation(
    p_company_id uuid,
    p_email text,
    p_full_name text default null,
    p_role text default 'technician'
)
returns public.company_user_invitations
language plpgsql
security definer
set search_path = public
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

    if v_role not in ('owner', 'admin', 'manager', 'office', 'technician') then
        raise exception 'Invalid company invitation role: %', p_role;
    end if;

    if exists (
        select 1
        from public.company_users company_user
        where company_user.company_id = p_company_id
          and (
              lower(btrim(coalesce(company_user.email, ''))) = v_email
              or exists (
                  select 1
                  from public.profiles profile
                  where profile.id = company_user.auth_user_id
                    and lower(btrim(coalesce(profile.email, ''))) = v_email
              )
          )
    ) then
        raise exception 'A company membership already exists for this email';
    end if;

    if exists (
        select 1
        from public.company_user_invitations invitation
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
grant execute on function public.create_company_user_invitation(uuid, text, text, text) to authenticated;

create or replace function public.update_company_user_status(
    p_company_user_id uuid,
    p_status text
)
returns public.company_users
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_status text := lower(btrim(coalesce(p_status, '')));
    v_company_user public.company_users%rowtype;
    v_updated_company_user public.company_users%rowtype;
    v_active_owner_count integer := 0;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_user_id is null then
        raise exception 'company_user_id is required';
    end if;

    if v_status not in ('active', 'suspended', 'inactive', 'revoked') then
        raise exception 'Invalid company user status: %', p_status;
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

    perform 1
    from public.company_users company_user
    where company_user.company_id = v_company_user.company_id
      and company_user.role = 'owner'
      and company_user.status = 'active'
    for update;

    select count(*)
    into v_active_owner_count
    from public.company_users company_user
    where company_user.company_id = v_company_user.company_id
      and company_user.role = 'owner'
      and company_user.status = 'active';

    if v_company_user.role = 'owner'
       and v_company_user.status = 'active'
       and v_status in ('suspended', 'inactive', 'revoked')
       and v_active_owner_count <= 1 then
        raise exception 'Cannot disable the last active owner';
    end if;

    update public.company_users
    set status = v_status,
        updated_at = now(),
        deactivated_at = case
            when v_status = 'active' then null
            when v_status in ('inactive', 'revoked') then now()
            else public.company_users.deactivated_at
        end
    where id = p_company_user_id
    returning * into v_updated_company_user;

    return v_updated_company_user;
end;
$$;

revoke all on function public.update_company_user_status(uuid, text) from public;
grant execute on function public.update_company_user_status(uuid, text) to authenticated;

create or replace function public.revoke_company_user_invitation(
    p_invitation_id uuid
)
returns public.company_user_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_invitation public.company_user_invitations%rowtype;
    v_updated_invitation public.company_user_invitations%rowtype;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_invitation_id is null then
        raise exception 'invitation_id is required';
    end if;

    select *
    into v_invitation
    from public.company_user_invitations invitation
    where invitation.id = p_invitation_id
    for update;

    if not found then
        raise exception 'Invitation not found';
    end if;

    if not public.can_manage_company_users(v_invitation.company_id) then
        raise exception 'Not authorized';
    end if;

    if v_invitation.status <> 'pending' then
        raise exception 'Only pending invitations can be revoked';
    end if;

    update public.company_user_invitations
    set status = 'revoked',
        revoked_at = now(),
        updated_at = now()
    where id = p_invitation_id
    returning * into v_updated_invitation;

    return v_updated_invitation;
end;
$$;

revoke all on function public.revoke_company_user_invitation(uuid) from public;
grant execute on function public.revoke_company_user_invitation(uuid) to authenticated;

drop function if exists public.redeem_connection_code(text);

create or replace function public.redeem_connection_code(
    p_code text,
    p_company_id uuid
)
returns table (
    connection_id uuid,
    property_id uuid,
    company_id uuid,
    status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_clean_code text := upper(btrim(coalesce(p_code, '')));
    v_code_hash text;
    v_code_row public.property_connection_codes%rowtype;
    v_connection_id uuid;
    v_connection_property_id uuid;
    v_connection_company_id uuid;
    v_connection_status text;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    if not exists (
        select 1
        from public.company_users company_user
        where company_user.company_id = p_company_id
          and company_user.auth_user_id = v_user_id
          and company_user.status = 'active'
    ) then
        raise exception 'No active membership found for this company';
    end if;

    if v_clean_code = '' then
        raise exception 'Code is required';
    end if;

    v_code_hash := encode(digest(v_clean_code, 'sha256'), 'hex');

    select *
    into v_code_row
    from public.property_connection_codes connection_code
    where connection_code.code_hash = v_code_hash
    for update;

    if not found then
        raise exception 'Connection code not found';
    end if;

    if v_code_row.status <> 'active' then
        raise exception 'Connection code is not active';
    end if;

    if v_code_row.expires_at <= now() then
        raise exception 'Connection code has expired';
    end if;

    if exists (
        select 1
        from public.property_connections connection
        where connection.property_id = v_code_row.property_id
          and connection.company_id = p_company_id
          and connection.status not in ('revoked', 'declined', 'expired')
    ) then
        raise exception 'A live connection already exists for this property and company';
    end if;

    insert into public.property_connections (
        property_id,
        company_id,
        status,
        can_view_documents,
        can_view_photos,
        can_view_service_history,
        can_view_quotes,
        expires_at
    )
    values (
        v_code_row.property_id,
        p_company_id,
        'pending',
        v_code_row.can_view_documents,
        v_code_row.can_view_photos,
        v_code_row.can_view_service_history,
        v_code_row.can_view_quotes,
        null
    )
    on conflict (property_id, company_id) do update
        set status = 'pending',
            can_view_documents = excluded.can_view_documents,
            can_view_photos = excluded.can_view_photos,
            can_view_service_history = excluded.can_view_service_history,
            can_view_quotes = excluded.can_view_quotes,
            expires_at = excluded.expires_at,
            updated_at = now()
        where public.property_connections.status in ('revoked', 'declined', 'expired')
    returning id, property_id, company_id, status
    into v_connection_id, v_connection_property_id, v_connection_company_id, v_connection_status;

    if v_connection_id is null then
        raise exception 'Failed to create property connection';
    end if;

    update public.property_connection_codes
    set status = 'redeemed',
        redeemed_at = now(),
        redeemed_by_company_id = p_company_id,
        redeemed_by_user_id = v_user_id,
        property_connection_id = v_connection_id,
        updated_at = now()
    where id = v_code_row.id;

    return query
    select
        v_connection_id,
        v_connection_property_id,
        v_connection_company_id,
        v_connection_status;
end;
$$;

revoke all on function public.redeem_connection_code(text, uuid) from public;
grant execute on function public.redeem_connection_code(text, uuid) to authenticated;

alter table public.company_user_invitations enable row level security;
alter table public.company_users enable row level security;

do $$
declare
    v_policy record;
begin
    for v_policy in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = 'company_user_invitations'
          and cmd <> 'SELECT'
    loop
        execute format(
            'drop policy if exists %I on public.company_user_invitations',
            v_policy.policyname
        );
    end loop;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'company_user_invitations'
          and policyname = 'company_user_invitations_select_company_managers'
    ) then
        create policy company_user_invitations_select_company_managers
        on public.company_user_invitations
        for select
        to authenticated
        using (public.can_manage_company_users(company_id));
    end if;
end
$$;

revoke all on table public.company_user_invitations from public;
revoke all on table public.company_user_invitations from anon;
revoke all on table public.company_user_invitations from authenticated;
grant select on table public.company_user_invitations to authenticated;

revoke insert, update, delete on table public.company_users from public;
revoke insert, update, delete on table public.company_users from anon;
revoke insert, update, delete on table public.company_users from authenticated;
grant select on table public.company_users to authenticated;

do $$
begin
    if to_regprocedure('public.create_company_user(uuid,uuid,text,text,text,text)') is not null then
        execute 'revoke all on function public.create_company_user(uuid, uuid, text, text, text, text) from public';
        execute 'revoke all on function public.create_company_user(uuid, uuid, text, text, text, text) from anon';
        execute 'revoke all on function public.create_company_user(uuid, uuid, text, text, text, text) from authenticated';
    end if;
end
$$;
