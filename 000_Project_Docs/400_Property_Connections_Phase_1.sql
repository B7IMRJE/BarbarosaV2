create table if not exists public.property_connections (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
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
