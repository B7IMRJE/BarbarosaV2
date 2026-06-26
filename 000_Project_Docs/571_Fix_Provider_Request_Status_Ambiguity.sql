-- Phase 5.7.1
-- Review-only hotfix for the installed HomeOS provider request RPC.
--
-- Purpose:
-- - Fix "column reference status is ambiguous" inside
--   public.request_property_provider_connection(uuid, uuid).
-- - Preserve the installed provider connection behavior.
-- - Recreate only the RPC body with qualified table aliases.
--
-- Do not apply until reviewed in Supabase SQL Editor.

begin;

do $$
begin
    if to_regclass('public.properties') is null then
        raise exception 'public.properties is required before provider request RPC can be repaired.';
    end if;

    if to_regclass('public.property_memberships') is null then
        raise exception 'public.property_memberships is required before provider request RPC can be repaired.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before provider request RPC can be repaired.';
    end if;

    if to_regclass('public.property_connections') is null then
        raise exception 'public.property_connections is required before provider request RPC can be repaired.';
    end if;

    if to_regclass('public.property_preferred_providers') is null then
        raise exception 'public.property_preferred_providers is required before provider request RPC can be repaired.';
    end if;

    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required before provider request RPC can be repaired.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'property_connections_property_id_company_id_key'
          and conrelid = 'public.property_connections'::regclass
    ) then
        raise exception 'property_connections_property_id_company_id_key is required before provider request RPC can be repaired.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_property_clients_company_property_key'
          and conrelid = 'public.company_property_clients'::regclass
    ) then
        raise exception 'company_property_clients_company_property_key is required before provider request RPC can be repaired.';
    end if;
end
$$;

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

    insert into public.property_connections as property_connection (
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
                when property_connection.status in ('connected', 'pending') then property_connection.status
                else 'pending'
            end,
            can_view_documents = case
                when property_connection.status in ('revoked', 'declined', 'expired') then false
                else property_connection.can_view_documents
            end,
            can_view_photos = case
                when property_connection.status in ('revoked', 'declined', 'expired') then false
                else property_connection.can_view_photos
            end,
            can_view_service_history = case
                when property_connection.status in ('revoked', 'declined', 'expired') then false
                else property_connection.can_view_service_history
            end,
            can_view_quotes = case
                when property_connection.status in ('revoked', 'declined', 'expired') then false
                else property_connection.can_view_quotes
            end,
            expires_at = null,
            requested_by_user_id = v_user_id,
            requested_at = now(),
            request_source = 'homeowner_provider_request',
            updated_at = now()
    returning property_connection.id, property_connection.status
    into v_connection_id, v_connection_status;

    update public.property_preferred_providers as preferred_provider
    set status = 'archived',
        archived_at = now(),
        updated_at = now()
    where preferred_provider.property_id = p_property_id
      and preferred_provider.status = 'active'
      and preferred_provider.company_id <> p_company_id;

    update public.property_preferred_providers as preferred_provider
    set company_id = p_company_id,
        property_connection_id = v_connection_id,
        source = 'homeowner_provider_request',
        selected_by_user_id = v_user_id,
        selected_at = now(),
        archived_at = null,
        updated_at = now()
    where preferred_provider.property_id = p_property_id
      and preferred_provider.status = 'active'
    returning preferred_provider.id
    into v_preferred_provider_id;

    if v_preferred_provider_id is null then
        begin
            insert into public.property_preferred_providers as preferred_provider (
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
            returning preferred_provider.id
            into v_preferred_provider_id;
        exception when unique_violation then
            update public.property_preferred_providers as preferred_provider
            set company_id = p_company_id,
                property_connection_id = v_connection_id,
                source = 'homeowner_provider_request',
                selected_by_user_id = v_user_id,
                selected_at = now(),
                archived_at = null,
                updated_at = now()
            where preferred_provider.property_id = p_property_id
              and preferred_provider.status = 'active'
            returning preferred_provider.id
            into v_preferred_provider_id;
        end;
    end if;

    insert into public.company_property_clients as company_client (
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
            display_name = coalesce(excluded.display_name, company_client.display_name),
            status = case
                when company_client.status = 'active' or excluded.status = 'active' then 'active'
                else 'pending'
            end,
            source = excluded.source,
            last_requested_by_user_id = excluded.last_requested_by_user_id,
            last_requested_at = excluded.last_requested_at,
            connected_at = case
                when company_client.connected_at is not null then company_client.connected_at
                when excluded.status = 'active' then now()
                else null
            end,
            archived_at = null,
            updated_at = now()
    returning company_client.id
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
    'provider_request_status_ambiguity_hotfix' as section,
    to_regprocedure('public.request_property_provider_connection(uuid,uuid)') is not null as request_rpc_exists;
