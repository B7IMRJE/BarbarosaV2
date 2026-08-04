-- Guarantee a homeowner-visible acknowledgement whenever a service request is
-- acknowledged, even when a client updates the request without the Dispatch RPC.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before acknowledgement delivery can be guarded.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before acknowledgement delivery can be guarded.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before acknowledgement delivery can be guarded.';
    end if;
end;
$$;

create or replace function public.ensure_homeowner_acknowledgement_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_actor_company_user_id uuid;
    v_created_by_user_id uuid;
    v_display_code text;
    v_dedupe_key text;
    v_message text;
begin
    if new.acknowledged_at is null
       and lower(btrim(coalesce(new.status, ''))) <> 'acknowledged' then
        return new;
    end if;

    v_created_by_user_id := coalesce(new.acknowledged_by_user_id, new.requested_by_user_id);
    v_display_code := nullif(btrim(coalesce(new.display_code, '')), '');
    v_dedupe_key := 'homeowner-acknowledged:' || new.id::text;
    v_message := case
        when v_display_code is not null
            then 'Request ' || upper(v_display_code) || ' has been received. Dispatch is reviewing it and will update you when the next step is scheduled.'
        else 'Your request has been received. Dispatch is reviewing it and will update you when the next step is scheduled.'
    end;

    select company_user.id
    into v_actor_company_user_id
    from public.company_users as company_user
    where company_user.company_id = new.company_id
      and company_user.auth_user_id = new.acknowledged_by_user_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at desc nulls last, company_user.id desc
    limit 1;

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
        new.id,
        new.company_id,
        new.property_id,
        v_created_by_user_id,
        'request_acknowledged',
        v_message,
        'system_homeowner_update',
        'homeowner',
        new.acknowledged_by_user_id,
        v_actor_company_user_id,
        v_dedupe_key,
        jsonb_build_object(
            'homeowner_status', 'request_acknowledged',
            'homeowner_status_title', 'Request Acknowledged',
            'request_status', new.status,
            'request_display_code', v_display_code,
            'idempotency_key', v_dedupe_key,
            'source', 'service_request_acknowledgement_guard'
        ),
        array['in_app', 'push', 'sms', 'email']::text[],
        'pending'
    where not exists (
        select 1
        from public.service_request_events as existing
        where existing.company_id = new.company_id
          and existing.service_request_id = new.id
          and existing.dedupe_key = v_dedupe_key
    );

    return new;
end;
$$;

revoke all on function public.ensure_homeowner_acknowledgement_event() from public, anon, authenticated;

drop trigger if exists service_requests_ensure_homeowner_acknowledgement_event
    on public.service_requests;

create trigger service_requests_ensure_homeowner_acknowledgement_event
after update of status, acknowledged_at, acknowledged_by_user_id
on public.service_requests
for each row
when (
    old.status is distinct from new.status
    or old.acknowledged_at is distinct from new.acknowledged_at
    or old.acknowledged_by_user_id is distinct from new.acknowledged_by_user_id
)
execute function public.ensure_homeowner_acknowledgement_event();

-- Restore the in-app timeline for acknowledgements created before this guard.
-- Historical rows intentionally do not enqueue stale push, SMS, or email alerts.
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
    notification_status,
    created_at
)
select
    request.id,
    request.company_id,
    request.property_id,
    coalesce(request.acknowledged_by_user_id, request.requested_by_user_id),
    'request_acknowledged',
    case
        when nullif(btrim(coalesce(request.display_code, '')), '') is not null
            then 'Request ' || upper(btrim(request.display_code)) || ' has been received. Dispatch is reviewing it and will update you when the next step is scheduled.'
        else 'Your request has been received. Dispatch is reviewing it and will update you when the next step is scheduled.'
    end,
    'system_homeowner_update',
    'homeowner',
    request.acknowledged_by_user_id,
    actor.id,
    'homeowner-acknowledged:' || request.id::text,
    jsonb_build_object(
        'homeowner_status', 'request_acknowledged',
        'homeowner_status_title', 'Request Acknowledged',
        'request_status', request.status,
        'request_display_code', nullif(btrim(coalesce(request.display_code, '')), ''),
        'idempotency_key', 'homeowner-acknowledged:' || request.id::text,
        'source', 'service_request_acknowledgement_backfill'
    ),
    array['in_app']::text[],
    'pending',
    coalesce(request.acknowledged_at, request.updated_at, request.created_at, now())
from public.service_requests as request
left join lateral (
    select company_user.id
    from public.company_users as company_user
    where company_user.company_id = request.company_id
      and company_user.auth_user_id = request.acknowledged_by_user_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at desc nulls last, company_user.id desc
    limit 1
) as actor on true
where (
        request.acknowledged_at is not null
        or lower(btrim(coalesce(request.status, ''))) = 'acknowledged'
    )
  and not exists (
      select 1
      from public.service_request_events as existing
      where existing.company_id = request.company_id
        and existing.service_request_id = request.id
        and existing.dedupe_key = 'homeowner-acknowledged:' || request.id::text
  );

commit;
