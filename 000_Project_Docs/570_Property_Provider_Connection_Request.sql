-- Phase 5.7
-- Review-only SQL for HomeOS homeowner-selected provider requests.
--
-- Purpose:
-- - Let an active property member request an approved company from the HomeOS Connections screen.
-- - Create or update the property/company relationship through an RPC instead of client-side writes.
-- - Track one active preferred provider for the property.
-- - Create a separate company-facing customer/client record keyed by company_id + property_id.
-- - Keep homeowner auth/user identity as audit metadata only, not as the company customer identity.
--
-- Do not apply until reviewed in Supabase SQL Editor.

begin;

do $$
begin
    if to_regclass('public.properties') is null then
        raise exception 'public.properties is required before provider connection requests can be installed.';
    end if;

    if to_regclass('public.property_memberships') is null then
        raise exception 'public.property_memberships is required before provider connection requests can be installed.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before provider connection requests can be installed.';
    end if;

    if to_regclass('public.property_connections') is null then
        raise exception 'public.property_connections is required before provider connection requests can be installed.';
    end if;

    if to_regprocedure('public.homeos_is_platform_admin()') is null then
        raise exception 'public.homeos_is_platform_admin() is required before provider connection requests can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null then
        raise exception 'public.homeos_can_read_property_record(uuid) is required before provider connection requests can be installed.';
    end if;

    if to_regprocedure('public.is_active_company_member(uuid)') is null then
        raise exception 'public.is_active_company_member(uuid) is required before provider connection requests can be installed.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'property_connections_property_id_company_id_key'
          and conrelid = 'public.property_connections'::regclass
    ) then
        raise exception 'property_connections_property_id_company_id_key is required before provider connection requests can be installed.';
    end if;
end
$$;

alter table public.property_connections
    add column if not exists requested_by_user_id uuid null,
    add column if not exists requested_at timestamptz null,
    add column if not exists request_source text null;

do $$
begin
    if to_regclass('auth.users') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'property_connections_requested_by_user_id_fkey'
             and conrelid = 'public.property_connections'::regclass
       ) then
        alter table public.property_connections
            add constraint property_connections_requested_by_user_id_fkey
            foreign key (requested_by_user_id)
            references auth.users(id)
            on delete set null;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'property_connections_request_source_check'
          and conrelid = 'public.property_connections'::regclass
    ) then
        alter table public.property_connections
            add constraint property_connections_request_source_check
            check (
                request_source is null
                or request_source in (
                    'connection_code',
                    'homeowner_provider_request',
                    'company_request',
                    'manual'
                )
            );
    end if;
end
$$;

create index if not exists property_connections_requested_by_user_id_idx
on public.property_connections (requested_by_user_id);

create index if not exists property_connections_property_status_idx
on public.property_connections (property_id, status);

create table if not exists public.property_preferred_providers (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    property_connection_id uuid null references public.property_connections(id) on delete set null,
    status text not null default 'active',
    source text not null default 'homeowner_provider_request',
    selected_by_user_id uuid null,
    selected_at timestamptz not null default now(),
    archived_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint property_preferred_providers_status_check
        check (status in ('active', 'archived')),
    constraint property_preferred_providers_source_check
        check (source in ('homeowner_provider_request', 'manual'))
);

alter table public.property_preferred_providers
    add column if not exists property_connection_id uuid null,
    add column if not exists selected_by_user_id uuid null,
    add column if not exists selected_at timestamptz not null default now(),
    add column if not exists archived_at timestamptz null,
    add column if not exists updated_at timestamptz not null default now();

do $$
begin
    if to_regclass('auth.users') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'property_preferred_providers_selected_by_user_id_fkey'
             and conrelid = 'public.property_preferred_providers'::regclass
       ) then
        alter table public.property_preferred_providers
            add constraint property_preferred_providers_selected_by_user_id_fkey
            foreign key (selected_by_user_id)
            references auth.users(id)
            on delete set null;
    end if;
end
$$;

create unique index if not exists property_preferred_providers_one_active_property_idx
on public.property_preferred_providers (property_id)
where status = 'active';

create index if not exists property_preferred_providers_property_id_idx
on public.property_preferred_providers (property_id);

create index if not exists property_preferred_providers_company_id_idx
on public.property_preferred_providers (company_id);

create index if not exists property_preferred_providers_connection_id_idx
on public.property_preferred_providers (property_connection_id);

create table if not exists public.company_property_clients (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    property_connection_id uuid null references public.property_connections(id) on delete set null,
    display_name text null,
    status text not null default 'pending',
    source text not null default 'homeowner_provider_request',
    first_requested_by_user_id uuid null,
    last_requested_by_user_id uuid null,
    first_requested_at timestamptz not null default now(),
    last_requested_at timestamptz not null default now(),
    connected_at timestamptz null,
    archived_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_property_clients_company_property_key unique (company_id, property_id),
    constraint company_property_clients_status_check
        check (status in ('pending', 'active', 'archived')),
    constraint company_property_clients_source_check
        check (source in ('homeowner_provider_request', 'connection_code', 'manual'))
);

alter table public.company_property_clients
    add column if not exists property_connection_id uuid null,
    add column if not exists display_name text null,
    add column if not exists first_requested_by_user_id uuid null,
    add column if not exists last_requested_by_user_id uuid null,
    add column if not exists first_requested_at timestamptz not null default now(),
    add column if not exists last_requested_at timestamptz not null default now(),
    add column if not exists connected_at timestamptz null,
    add column if not exists archived_at timestamptz null,
    add column if not exists updated_at timestamptz not null default now();

do $$
begin
    if to_regclass('auth.users') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'company_property_clients_first_requested_by_user_id_fkey'
             and conrelid = 'public.company_property_clients'::regclass
       ) then
        alter table public.company_property_clients
            add constraint company_property_clients_first_requested_by_user_id_fkey
            foreign key (first_requested_by_user_id)
            references auth.users(id)
            on delete set null;
    end if;

    if to_regclass('auth.users') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'company_property_clients_last_requested_by_user_id_fkey'
             and conrelid = 'public.company_property_clients'::regclass
       ) then
        alter table public.company_property_clients
            add constraint company_property_clients_last_requested_by_user_id_fkey
            foreign key (last_requested_by_user_id)
            references auth.users(id)
            on delete set null;
    end if;
end
$$;

create index if not exists company_property_clients_company_id_idx
on public.company_property_clients (company_id);

create index if not exists company_property_clients_property_id_idx
on public.company_property_clients (property_id);

create index if not exists company_property_clients_connection_id_idx
on public.company_property_clients (property_connection_id);

create index if not exists company_property_clients_company_status_idx
on public.company_property_clients (company_id, status);

alter table public.property_preferred_providers enable row level security;
alter table public.company_property_clients enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'companies'
          and policyname = 'companies_select_active_approved'
    ) then
        create policy companies_select_active_approved
        on public.companies
        for select
        to authenticated
        using (lower(btrim(coalesce(status, ''))) = 'active');
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'property_preferred_providers'
          and policyname = 'property_preferred_providers_select_members'
    ) then
        create policy property_preferred_providers_select_members
        on public.property_preferred_providers
        for select
        to authenticated
        using (
            public.homeos_can_read_property_record(property_id)
            or public.is_active_company_member(company_id)
        );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'company_property_clients'
          and policyname = 'company_property_clients_select_members'
    ) then
        create policy company_property_clients_select_members
        on public.company_property_clients
        for select
        to authenticated
        using (
            public.homeos_can_read_property_record(property_id)
            or public.is_active_company_member(company_id)
        );
    end if;
end
$$;

revoke all on table public.property_preferred_providers from public;
revoke all on table public.property_preferred_providers from anon;
revoke insert, update, delete on table public.property_preferred_providers from authenticated;
grant select on table public.property_preferred_providers to authenticated;

revoke all on table public.company_property_clients from public;
revoke all on table public.company_property_clients from anon;
revoke insert, update, delete on table public.company_property_clients from authenticated;
grant select on table public.company_property_clients to authenticated;

create or replace function public.request_property_provider_connection(
    p_property_id uuid,
    p_company_id uuid
)
returns table (
    connection_id uuid,
    preferred_provider_id uuid,
    company_property_client_id uuid,
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
    v_property_name text;
    v_company_status text;
    v_connection_id uuid;
    v_connection_status text;
    v_preferred_provider_id uuid;
    v_company_property_client_id uuid;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_property_id is null then
        raise exception 'property_id is required';
    end if;

    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    select property.name
    into v_property_name
    from public.properties as property
    where property.id = p_property_id
    for share;

    if not found then
        raise exception 'Property not found';
    end if;

    if not exists (
        select 1
        from public.property_memberships as membership
        where membership.property_id = p_property_id
          and membership.user_id = v_user_id
          and membership.status = 'active'
    ) then
        raise exception 'Not authorized to request a provider for this property';
    end if;

    select company.status
    into v_company_status
    from public.companies as company
    where company.id = p_company_id
    for share;

    if not found then
        raise exception 'Provider not found';
    end if;

    if lower(btrim(coalesce(v_company_status, ''))) <> 'active' then
        raise exception 'Provider is not active';
    end if;

    insert into public.property_connections (
        property_id,
        company_id,
        status,
        can_view_documents,
        can_view_photos,
        can_view_service_history,
        can_view_quotes,
        expires_at,
        requested_by_user_id,
        requested_at,
        request_source
    )
    values (
        p_property_id,
        p_company_id,
        'pending',
        false,
        false,
        false,
        false,
        null,
        v_user_id,
        now(),
        'homeowner_provider_request'
    )
    on conflict on constraint property_connections_property_id_company_id_key do update
        set status = case
                when public.property_connections.status in ('connected', 'pending') then public.property_connections.status
                else 'pending'
            end,
            can_view_documents = case
                when public.property_connections.status in ('revoked', 'declined', 'expired') then false
                else public.property_connections.can_view_documents
            end,
            can_view_photos = case
                when public.property_connections.status in ('revoked', 'declined', 'expired') then false
                else public.property_connections.can_view_photos
            end,
            can_view_service_history = case
                when public.property_connections.status in ('revoked', 'declined', 'expired') then false
                else public.property_connections.can_view_service_history
            end,
            can_view_quotes = case
                when public.property_connections.status in ('revoked', 'declined', 'expired') then false
                else public.property_connections.can_view_quotes
            end,
            expires_at = null,
            requested_by_user_id = v_user_id,
            requested_at = now(),
            request_source = 'homeowner_provider_request',
            updated_at = now()
    returning id, status
    into v_connection_id, v_connection_status;

    update public.property_preferred_providers as preferred_provider
    set status = 'archived',
        archived_at = now(),
        updated_at = now()
    where preferred_provider.property_id = p_property_id
      and preferred_provider.status = 'active'
      and preferred_provider.company_id <> p_company_id;

    insert into public.property_preferred_providers (
        property_id,
        company_id,
        property_connection_id,
        status,
        source,
        selected_by_user_id,
        selected_at
    )
    values (
        p_property_id,
        p_company_id,
        v_connection_id,
        'active',
        'homeowner_provider_request',
        v_user_id,
        now()
    )
    on conflict (property_id) where status = 'active' do update
        set company_id = excluded.company_id,
            property_connection_id = excluded.property_connection_id,
            source = excluded.source,
            selected_by_user_id = excluded.selected_by_user_id,
            selected_at = excluded.selected_at,
            archived_at = null,
            updated_at = now()
    returning id
    into v_preferred_provider_id;

    insert into public.company_property_clients (
        company_id,
        property_id,
        property_connection_id,
        display_name,
        status,
        source,
        first_requested_by_user_id,
        last_requested_by_user_id,
        first_requested_at,
        last_requested_at,
        connected_at
    )
    values (
        p_company_id,
        p_property_id,
        v_connection_id,
        nullif(btrim(v_property_name), ''),
        case when v_connection_status = 'connected' then 'active' else 'pending' end,
        'homeowner_provider_request',
        v_user_id,
        v_user_id,
        now(),
        now(),
        case when v_connection_status = 'connected' then now() else null end
    )
    on conflict on constraint company_property_clients_company_property_key do update
        set property_connection_id = excluded.property_connection_id,
            display_name = coalesce(excluded.display_name, public.company_property_clients.display_name),
            status = case
                when public.company_property_clients.status = 'active' or excluded.status = 'active' then 'active'
                else 'pending'
            end,
            source = excluded.source,
            last_requested_by_user_id = excluded.last_requested_by_user_id,
            last_requested_at = excluded.last_requested_at,
            connected_at = case
                when public.company_property_clients.connected_at is not null then public.company_property_clients.connected_at
                when excluded.status = 'active' then now()
                else null
            end,
            archived_at = null,
            updated_at = now()
    returning id
    into v_company_property_client_id;

    return query
    select
        v_connection_id,
        v_preferred_provider_id,
        v_company_property_client_id,
        p_property_id,
        p_company_id,
        v_connection_status;
end;
$$;

revoke all on function public.request_property_provider_connection(uuid, uuid) from public;
revoke all on function public.request_property_provider_connection(uuid, uuid) from anon;
grant execute on function public.request_property_provider_connection(uuid, uuid) to authenticated;

commit;

select
    'property_provider_connection_request_review' as section,
    to_regclass('public.property_preferred_providers') is not null as preferred_provider_table_exists,
    to_regclass('public.company_property_clients') is not null as company_property_clients_table_exists,
    to_regprocedure('public.request_property_provider_connection(uuid,uuid)') is not null as request_rpc_exists,
    exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'companies'
          and policyname = 'companies_select_active_approved'
    ) as approved_company_select_policy_exists;
