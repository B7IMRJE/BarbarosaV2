-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Add a safe durable link between HomeOS issue/report records and
--   company-facing service_requests.
--
-- Product rules:
--   - HomeOS homeowners may send an existing issue/emergency to their
--     preferred provider as a real service request.
--   - Dispatch sees only safe service_request fields created by SQL 579.
--   - HomeOS photos, documents, videos, and private issue timeline entries
--     remain private unless a later explicit sharing model is approved.

begin;

do $$
begin
    if to_regclass('public.home_emergencies') is null then
        raise exception 'public.home_emergencies is required before issue service request linking can be installed.';
    end if;

    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before issue service request linking can be installed.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before issue service request linking can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null then
        raise exception 'public.homeos_can_read_property_record(uuid) is required before issue service request linking can be installed.';
    end if;
end
$$;

alter table public.home_emergencies
    add column if not exists service_request_id uuid null references public.service_requests(id) on delete set null,
    add column if not exists service_request_company_id uuid null references public.companies(id) on delete set null,
    add column if not exists service_request_sent_at timestamptz null;

create index if not exists home_emergencies_service_request_id_idx
on public.home_emergencies (service_request_id);

create index if not exists home_emergencies_service_request_company_id_idx
on public.home_emergencies (service_request_company_id);

create or replace function public.link_home_emergency_service_request(
    p_home_emergency_id uuid,
    p_service_request_id uuid
)
returns table (
    home_emergency_id uuid,
    service_request_id uuid,
    service_request_company_id uuid,
    service_request_sent_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_emergency public.home_emergencies%rowtype;
    v_request public.service_requests%rowtype;
    v_sent_at timestamptz := now();
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_home_emergency_id is null or p_service_request_id is null then
        raise exception 'HomeOS issue and service request are required.';
    end if;

    select *
    into v_emergency
    from public.home_emergencies
    where id = p_home_emergency_id;

    if not found then
        raise exception 'HomeOS issue not found.';
    end if;

    if not public.homeos_can_read_property_record(v_emergency.property_id) then
        raise exception 'Not authorized to link this HomeOS issue.';
    end if;

    select *
    into v_request
    from public.service_requests
    where id = p_service_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if v_request.property_id <> v_emergency.property_id then
        raise exception 'Service request property does not match this HomeOS issue.';
    end if;

    if v_request.requested_by_user_id <> auth.uid() then
        raise exception 'Only the homeowner who created the service request can link it to this issue.';
    end if;

    update public.home_emergencies
    set service_request_id = v_request.id,
        service_request_company_id = v_request.company_id,
        service_request_sent_at = coalesce(service_request_sent_at, v_sent_at),
        updated_at = v_sent_at
    where id = v_emergency.id
    returning
        id,
        service_request_id,
        service_request_company_id,
        service_request_sent_at
    into
        home_emergency_id,
        service_request_id,
        service_request_company_id,
        service_request_sent_at;

    return next;
end;
$$;

revoke all on function public.link_home_emergency_service_request(uuid, uuid) from public;
revoke all on function public.link_home_emergency_service_request(uuid, uuid) from anon;
grant execute on function public.link_home_emergency_service_request(uuid, uuid) to authenticated;

commit;

-- Verification after review/install:
-- select
--   exists (
--     select 1
--     from information_schema.columns
--     where table_schema = 'public'
--       and table_name = 'home_emergencies'
--       and column_name = 'service_request_id'
--   ) as home_emergency_service_request_id_exists,
--   to_regprocedure('public.link_home_emergency_service_request(uuid,uuid)') is not null as link_rpc_exists;
