-- Ensure homeowner request numbers and acknowledge activity follow the same
-- service request source of truth used by Dispatch.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before homeowner acknowledge activity can be installed.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before homeowner acknowledge activity can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before homeowner acknowledge activity can be installed.';
    end if;

    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required before homeowner request code receipts can be installed.';
    end if;

    if to_regclass('public.property_preferred_providers') is null then
        raise exception 'public.property_preferred_providers is required before homeowner request code receipts can be installed.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before homeowner acknowledge activity can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null then
        raise exception 'public.homeos_can_read_property_record(uuid) is required before homeowner request code receipts can be installed.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'service_requests'
          and column_name = 'display_code'
    ) then
        raise exception 'public.service_requests.display_code is required before homeowner request code receipts can be installed.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'service_requests'
          and column_name = 'display_sequence'
    ) then
        raise exception 'public.service_requests.display_sequence is required before homeowner request code receipts can be installed.';
    end if;
end;
$$;

drop function if exists public.create_homeowner_service_request(uuid, uuid, text, text, text);

create or replace function public.create_homeowner_service_request(
    p_property_id uuid,
    p_company_id uuid,
    p_request_type text default 'regular',
    p_issue_summary text default '',
    p_priority text default null
)
returns table (
    service_request_id uuid,
    display_sequence bigint,
    display_code text,
    company_id uuid,
    property_id uuid,
    request_type text,
    status text,
    priority text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_request_type text := lower(btrim(coalesce(p_request_type, 'regular')));
    v_priority text := lower(btrim(coalesce(p_priority, '')));
    v_summary text := nullif(btrim(coalesce(p_issue_summary, '')), '');
    v_property public.properties%rowtype;
    v_company_client public.company_property_clients%rowtype;
    v_request public.service_requests%rowtype;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_property_id is null or p_company_id is null then
        raise exception 'Property and provider company are required.';
    end if;

    if not public.homeos_can_read_property_record(p_property_id) then
        raise exception 'Not authorized to request service for this property.';
    end if;

    if v_request_type not in ('regular', 'emergency') then
        raise exception 'request_type must be regular or emergency.';
    end if;

    if v_summary is null then
        raise exception 'Issue summary is required.';
    end if;

    if v_priority = '' then
        v_priority := case when v_request_type = 'emergency' then 'emergency' else 'normal' end;
    end if;

    if v_priority not in ('low', 'normal', 'high', 'emergency') then
        raise exception 'priority must be low, normal, high, or emergency.';
    end if;

    select property.*
    into v_property
    from public.properties as property
    where property.id = p_property_id;

    if not found then
        raise exception 'Property not found.';
    end if;

    select company_client.*
    into v_company_client
    from public.company_property_clients as company_client
    join public.property_preferred_providers as preferred_provider
      on preferred_provider.property_id = company_client.property_id
     and preferred_provider.company_id = company_client.company_id
     and lower(btrim(coalesce(preferred_provider.status, ''))) = 'active'
    where company_client.property_id = p_property_id
      and company_client.company_id = p_company_id
      and lower(btrim(coalesce(company_client.status, ''))) = 'active'
    order by company_client.connected_at desc nulls last,
             company_client.created_at desc nulls last,
             company_client.id desc
    limit 1;

    if not found then
        raise exception 'Choose a provider before requesting service.';
    end if;

    insert into public.service_requests (
        property_id,
        company_id,
        company_property_client_id,
        requested_by_user_id,
        request_type,
        status,
        priority,
        issue_summary,
        customer_display_name,
        property_display_name,
        property_address,
        property_city,
        property_state,
        property_postal_code
    )
    values (
        p_property_id,
        p_company_id,
        v_company_client.id,
        v_user_id,
        v_request_type,
        'new',
        v_priority,
        v_summary,
        v_company_client.display_name,
        v_property.name,
        coalesce(v_property.address_line_1, v_property.address),
        v_property.city,
        v_property.state,
        coalesce(v_property.postal_code, v_property.zip)
    )
    returning *
    into v_request;

    return query
    select
        v_request.id,
        v_request.display_sequence,
        v_request.display_code,
        v_request.company_id,
        v_request.property_id,
        v_request.request_type,
        v_request.status,
        v_request.priority,
        v_request.created_at;
end;
$$;

drop function if exists public.acknowledge_service_request(uuid, uuid);

create or replace function public.acknowledge_service_request(
    p_company_id uuid,
    p_service_request_id uuid
)
returns public.service_requests
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_previous_status text;
    v_actor_company_user_id uuid;
    v_display_code text;
    v_internal_dedupe_key text;
    v_homeowner_dedupe_key text;
    v_homeowner_message text;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    if not public.can_dispatch_company(p_company_id) then
        raise exception 'Not authorized to acknowledge dispatch requests for this company.';
    end if;

    select request.*
    into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    for update;

    if not found then
        raise exception 'Service request not found for this company.';
    end if;

    if lower(btrim(coalesce(v_request.status, ''))) = 'converted_to_job' then
        raise exception 'Converted service requests cannot be acknowledged.';
    end if;

    v_previous_status := v_request.status;

    update public.service_requests as request
    set status = 'acknowledged',
        acknowledged_by_user_id = auth.uid(),
        acknowledged_at = coalesce(request.acknowledged_at, now()),
        updated_at = now()
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    returning request.*
    into v_request;

    select company_user.id
    into v_actor_company_user_id
    from public.company_users as company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at desc nulls last, company_user.id desc
    limit 1;

    v_display_code := nullif(btrim(coalesce(v_request.display_code, '')), '');
    v_internal_dedupe_key := 'dispatch-acknowledged:' || p_service_request_id::text;
    v_homeowner_dedupe_key := 'homeowner-acknowledged:' || p_service_request_id::text;
    v_homeowner_message := case
        when v_display_code is not null
            then 'Request ' || upper(v_display_code) || ' has been received. Dispatch is reviewing it and will update you when the next step is scheduled.'
        else 'Your request has been received. Dispatch is reviewing it and will update you when the next step is scheduled.'
    end;

    insert into public.service_request_events (
        service_request_id,
        company_id,
        property_id,
        created_by_user_id,
        event_type,
        message,
        event_visibility,
        audience,
        actor_user_id,
        actor_company_user_id,
        dedupe_key,
        metadata,
        notification_channels,
        notification_status
    )
    select
        p_service_request_id,
        p_company_id,
        v_request.property_id,
        auth.uid(),
        'request_acknowledged',
        'Request acknowledged by dispatch.',
        'internal',
        'dispatch',
        auth.uid(),
        v_actor_company_user_id,
        v_internal_dedupe_key,
        jsonb_build_object(
            'previous_request_status', v_previous_status,
            'new_request_status', v_request.status,
            'request_display_code', v_display_code
        ),
        array['in_app']::text[],
        'not_sent'
    where not exists (
        select 1
        from public.service_request_events as existing
        where existing.company_id = p_company_id
          and existing.service_request_id = p_service_request_id
          and existing.dedupe_key = v_internal_dedupe_key
    );

    insert into public.service_request_events (
        service_request_id,
        company_id,
        property_id,
        created_by_user_id,
        event_type,
        message,
        event_visibility,
        audience,
        actor_user_id,
        actor_company_user_id,
        dedupe_key,
        metadata,
        notification_channels,
        notification_status
    )
    select
        p_service_request_id,
        p_company_id,
        v_request.property_id,
        auth.uid(),
        'request_acknowledged',
        v_homeowner_message,
        'system_homeowner_update',
        'homeowner',
        auth.uid(),
        v_actor_company_user_id,
        v_homeowner_dedupe_key,
        jsonb_build_object(
            'homeowner_status', 'request_acknowledged',
            'homeowner_status_title', 'Request Acknowledged',
            'request_status', v_request.status,
            'previous_request_status', v_previous_status,
            'request_display_code', v_display_code,
            'idempotency_key', v_homeowner_dedupe_key
        ),
        array['in_app', 'push', 'sms', 'email']::text[],
        'pending'
    where not exists (
        select 1
        from public.service_request_events as existing
        where existing.company_id = p_company_id
          and existing.service_request_id = p_service_request_id
          and existing.dedupe_key = v_homeowner_dedupe_key
    );

    return v_request;
end;
$$;

revoke all on function public.create_homeowner_service_request(uuid, uuid, text, text, text) from public;
revoke all on function public.create_homeowner_service_request(uuid, uuid, text, text, text) from anon;
grant execute on function public.create_homeowner_service_request(uuid, uuid, text, text, text) to authenticated;

revoke all on function public.acknowledge_service_request(uuid, uuid) from public;
revoke all on function public.acknowledge_service_request(uuid, uuid) from anon;
grant execute on function public.acknowledge_service_request(uuid, uuid) to authenticated;

commit;
