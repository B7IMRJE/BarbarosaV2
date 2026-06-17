create table if not exists public.property_connections (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null,
    company_id uuid not null,
    status text not null default 'pending',
    can_view_documents boolean not null default false,
    can_view_photos boolean not null default true,
    can_view_service_history boolean not null default false,
    can_view_quotes boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    expires_at timestamptz null
);

create index if not exists property_connections_property_id_idx
on public.property_connections (property_id);

create index if not exists property_connections_company_id_idx
on public.property_connections (company_id);

create index if not exists property_connections_status_idx
on public.property_connections (status);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'property_connections_property_id_company_id_key'
          and conrelid = 'public.property_connections'::regclass
    ) then
        alter table public.property_connections
        add constraint property_connections_property_id_company_id_key
        unique (property_id, company_id);
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'property_connections_status_check'
          and conrelid = 'public.property_connections'::regclass
    ) then
        alter table public.property_connections
        add constraint property_connections_status_check
        check (status in ('pending', 'connected', 'revoked', 'expired', 'declined'));
    end if;
end
$$;

do $$
begin
    if to_regclass('public.properties') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'property_connections_property_id_fkey'
             and conrelid = 'public.property_connections'::regclass
       ) then
        alter table public.property_connections
        add constraint property_connections_property_id_fkey
        foreign key (property_id)
        references public.properties(id)
        on delete cascade;
    end if;
end
$$;

do $$
begin
    if to_regclass('public.companies') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'property_connections_company_id_fkey'
             and conrelid = 'public.property_connections'::regclass
       ) then
        alter table public.property_connections
        add constraint property_connections_company_id_fkey
        foreign key (company_id)
        references public.companies(id)
        on delete cascade;
    end if;
end
$$;
