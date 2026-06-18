-- Phase 2E
-- Company admin write RPCs for platform-admin-only writes.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and upper(coalesce(p.role, '')) = 'SUPER_ADMIN'
    );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.create_company(
    p_name text,
    p_slug text default null,
    p_status text default 'ACTIVE',
    p_theme_color text default null
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
    created_company public.companies%rowtype;
begin
    if not public.is_platform_admin() then
        raise exception 'Not authorized';
    end if;

    if nullif(trim(p_name), '') is null then
        raise exception 'Company name is required';
    end if;

    insert into public.companies (
        name,
        slug,
        status,
        theme_color
    )
    values (
        trim(p_name),
        nullif(trim(p_slug), ''),
        coalesce(nullif(trim(p_status), ''), 'ACTIVE'),
        nullif(trim(p_theme_color), '')
    )
    returning * into created_company;

    return created_company;
end;
$$;

revoke all on function public.create_company(text, text, text, text) from public;
grant execute on function public.create_company(text, text, text, text) to authenticated;

create or replace function public.create_company_user(
    p_company_id uuid,
    p_auth_user_id uuid,
    p_full_name text default null,
    p_email text default null,
    p_role text default 'user',
    p_status text default 'active'
)
returns public.company_users
language plpgsql
security definer
set search_path = public
as $$
declare
    existing_company_user public.company_users%rowtype;
    created_company_user public.company_users%rowtype;
    normalized_role text := upper(coalesce(nullif(trim(p_role), ''), 'USER'));
    normalized_status text := lower(coalesce(nullif(trim(p_status), ''), 'active'));
begin
    if not public.is_platform_admin() then
        raise exception 'Not authorized';
    end if;

    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    if p_auth_user_id is null then
        raise exception 'auth_user_id is required';
    end if;

    if normalized_role = 'HOMEOWNER' then
        raise exception 'HOMEOWNER is not a valid company role';
    end if;

    normalized_role :=
        case normalized_role
            when 'ADMIN' then 'admin'
            when 'MANAGER' then 'manager'
            when 'TECHNICIAN' then 'tech'
            when 'TECH' then 'tech'
            when 'OFFICE' then 'office'
            when 'OWNER' then 'owner'
            when 'USER' then 'user'
            else lower(normalized_role)
        end;

    if normalized_role not in ('owner', 'admin', 'manager', 'tech', 'office', 'user') then
        raise exception 'Invalid company role: %', p_role;
    end if;

    if normalized_status not in ('active', 'inactive', 'revoked', 'pending') then
        raise exception 'Invalid company user status: %', p_status;
    end if;

    select *
    into existing_company_user
    from public.company_users company_user
    where company_user.auth_user_id = p_auth_user_id
    order by company_user.created_at desc
    limit 1;

    if found then
        if existing_company_user.company_id <> p_company_id then
            raise exception 'Auth user is already assigned to another company';
        end if;

        update public.company_users
        set full_name = coalesce(nullif(trim(p_full_name), ''), public.company_users.full_name),
            email = coalesce(nullif(trim(p_email), ''), public.company_users.email),
            role = normalized_role,
            status = normalized_status
        where id = existing_company_user.id
        returning * into created_company_user;

        return created_company_user;
    end if;

    insert into public.company_users (
        company_id,
        auth_user_id,
        full_name,
        email,
        role,
        status
    )
    values (
        p_company_id,
        p_auth_user_id,
        nullif(trim(p_full_name), ''),
        nullif(trim(p_email), ''),
        normalized_role,
        normalized_status
    )
    returning * into created_company_user;

    return created_company_user;
end;
$$;

revoke all on function public.create_company_user(uuid, uuid, text, text, text, text) from public;
grant execute on function public.create_company_user(uuid, uuid, text, text, text, text) to authenticated;

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
    updated_company_user public.company_users%rowtype;
    normalized_status text := lower(coalesce(nullif(trim(p_status), ''), 'active'));
begin
    if not public.is_platform_admin() then
        raise exception 'Not authorized';
    end if;

    if p_company_user_id is null then
        raise exception 'company_user_id is required';
    end if;

    if normalized_status not in ('active', 'inactive', 'revoked', 'pending') then
        raise exception 'Invalid company user status: %', p_status;
    end if;

    update public.company_users
    set status = normalized_status
    where id = p_company_user_id
    returning * into updated_company_user;

    if not found then
        raise exception 'Company user not found';
    end if;

    return updated_company_user;
end;
$$;

revoke all on function public.update_company_user_status(uuid, text) from public;
grant execute on function public.update_company_user_status(uuid, text) to authenticated;
