-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Fix ambiguous column references in get_service_request_events.
--
-- Problem:
--   The function returns a column named id. Inside PL/pgSQL, unqualified
--   references such as "where id = p_service_request_id" can be ambiguous
--   between the output parameter id and table columns.
--
-- Safety:
--   This returns only service_request_events fields and does not expose
--   HomeOS photos, documents, videos, or private issue history.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before service request events can be repaired.';
    end if;

    if to_regclass('public.service_request_events') is null then
        raise exception 'public.service_request_events is required before service request events can be repaired.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null then
        raise exception 'public.homeos_can_read_property_record(uuid) is required before service request events can be repaired.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before service request events can be repaired.';
    end if;
end
$$;

create or replace function public.get_service_request_events(
    p_service_request_id uuid
)
returns table (
    id uuid,
    service_request_id uuid,
    company_id uuid,
    property_id uuid,
    event_type text,
    message text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select request.*
    into v_request
    from public.service_requests as request
    where request.id = p_service_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if not public.homeos_can_read_property_record(v_request.property_id)
       and not public.can_dispatch_company(v_request.company_id) then
        raise exception 'Not authorized to view service request events.';
    end if;

    return query
    select
        e.id,
        e.service_request_id,
        e.company_id,
        e.property_id,
        e.event_type,
        e.message,
        e.created_at
    from public.service_request_events as e
    where e.service_request_id = p_service_request_id
    order by e.created_at desc nulls last, e.id desc;
end;
$$;

revoke all on function public.get_service_request_events(uuid) from public;
revoke all on function public.get_service_request_events(uuid) from anon;
grant execute on function public.get_service_request_events(uuid) to authenticated;

commit;

-- Verification after review/install:
-- select to_regprocedure('public.get_service_request_events(uuid)') is not null as get_events_rpc_exists;
