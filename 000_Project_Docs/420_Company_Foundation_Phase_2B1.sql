-- Phase 2B.1
-- Company identity currently lives in public.profiles.account_type = 'Service Company'.
-- This foundation mirrors those legacy profiles into companies and company_users.

create table if not exists public.companies (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.company_users (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    auth_user_id uuid not null,
    role text not null default 'user',
    status text not null default 'active',
    created_at timestamptz not null default now()
);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_users_company_id_fkey'
          and conrelid = 'public.company_users'::regclass
    ) then
        alter table public.company_users
        add constraint company_users_company_id_fkey
        foreign key (company_id)
        references public.companies(id)
        on delete cascade;
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_users_role_check'
          and conrelid = 'public.company_users'::regclass
    ) then
        alter table public.company_users
        add constraint company_users_role_check
        check (role in ('owner', 'admin', 'manager', 'tech', 'office', 'user'));
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_users_status_check'
          and conrelid = 'public.company_users'::regclass
    ) then
        alter table public.company_users
        add constraint company_users_status_check
        check (status in ('active', 'inactive', 'revoked', 'pending'));
    end if;
end
$$;

do $$
begin
    if to_regclass('auth.users') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'company_users_auth_user_id_fkey'
             and conrelid = 'public.company_users'::regclass
       ) then
        alter table public.company_users
        add constraint company_users_auth_user_id_fkey
        foreign key (auth_user_id)
        references auth.users(id)
        on delete cascade;
    end if;
end
$$;

create index if not exists company_users_auth_user_id_idx
on public.company_users (auth_user_id);

create index if not exists company_users_company_id_status_idx
on public.company_users (company_id, status);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_users_auth_user_id_key'
          and conrelid = 'public.company_users'::regclass
    ) then
        alter table public.company_users
        add constraint company_users_auth_user_id_key
        unique (auth_user_id);
    end if;
end
$$;

do $$
begin
    if to_regclass('public.profiles') is not null then
        insert into public.companies (id, name, created_at)
        select
            p.id,
            coalesce(
                nullif(trim(p.full_name), ''),
                nullif(trim(p.email), ''),
                'Service Company'
            ),
            now()
        from public.profiles p
        where lower(trim(coalesce(p.account_type, ''))) = 'service company'
          and not exists (
              select 1
              from public.companies company
              where company.id = p.id
          )
        on conflict (id) do nothing;
    end if;
end
$$;

do $$
begin
    if to_regclass('public.profiles') is not null then
        insert into public.company_users (company_id, auth_user_id, role, status, created_at)
        select
            p.id,
            p.id,
            'owner',
            'active',
            now()
        from public.profiles p
        where lower(trim(coalesce(p.account_type, ''))) = 'service company'
          and exists (
              select 1
              from auth.users u
              where u.id = p.id
          )
          and not exists (
              select 1
              from public.company_users company_user
              where company_user.auth_user_id = p.id
          )
        on conflict (auth_user_id) do nothing;
    end if;
end
$$;
