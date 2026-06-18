-- Phase 2B.1
-- Company identity currently lives in public.profiles.account_type = 'Service Company'.
-- This foundation mirrors those legacy profiles into companies and company_users.
-- Expanded to match current super-admin UI expectations.

create table if not exists public.companies (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text null,
    status text not null default 'ACTIVE',
    theme_color text null,
    created_at timestamptz not null default now()
);

create table if not exists public.company_users (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    auth_user_id uuid not null,
    full_name text null,
    email text null,
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
    if to_regclass('public.companies') is not null then
        alter table public.companies
            add column if not exists slug text;

        alter table public.companies
            add column if not exists status text;

        alter table public.companies
            alter column status set default 'ACTIVE';

        update public.companies
        set status = 'ACTIVE'
        where status is null;

        alter table public.companies
            alter column status set not null;

        alter table public.companies
            add column if not exists theme_color text;
    end if;
end
$$;

do $$
begin
    if to_regclass('public.company_users') is not null then
        alter table public.company_users
            add column if not exists full_name text;

        alter table public.company_users
            add column if not exists email text;
    end if;
end
$$;

do $$
begin
    if to_regclass('public.profiles') is not null then
        update public.companies company
        set slug = nullif(
            regexp_replace(
                regexp_replace(
                    lower(trim(coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), '')))),
                    '[^a-z0-9]+',
                    '-',
                    'g'
                ),
                '(^-+|-+$)',
                '',
                'g'
            ),
            ''
        )
        from public.profiles p
        where company.id = p.id
          and lower(trim(coalesce(p.account_type, ''))) = 'service company'
          and nullif(trim(company.slug), '') is null;
    end if;
end
$$;

do $$
begin
    if to_regclass('public.profiles') is not null then
        update public.company_users company_user
        set full_name = coalesce(
                nullif(trim(company_user.full_name), ''),
                nullif(trim(p.full_name), '')
            ),
            email = coalesce(
                nullif(trim(company_user.email), ''),
                nullif(trim(p.email), '')
            )
        from public.profiles p
        where company_user.auth_user_id = p.id
          and lower(trim(coalesce(p.account_type, ''))) = 'service company';
    end if;
end
$$;

do $$
begin
    if to_regclass('public.profiles') is not null then
        insert into public.companies (id, name, slug, status, theme_color, created_at)
        select
            p.id,
            coalesce(
                nullif(trim(p.full_name), ''),
                nullif(trim(p.email), ''),
                'Service Company'
            ),
            nullif(
                regexp_replace(
                    regexp_replace(
                        lower(trim(coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), '')))),
                        '[^a-z0-9]+',
                        '-',
                        'g'
                    ),
                    '(^-+|-+$)',
                    '',
                    'g'
                ),
                ''
            ),
            'ACTIVE',
            null,
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
        insert into public.company_users (
            company_id,
            auth_user_id,
            full_name,
            email,
            role,
            status,
            created_at
        )
        select
            p.id,
            p.id,
            nullif(trim(p.full_name), ''),
            nullif(trim(p.email), ''),
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
