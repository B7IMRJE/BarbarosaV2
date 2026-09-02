-- Allow an authorized company user to deliberately create a separate quote
-- for the same customer, HomeOS item, and job context. The existing upsert
-- RPC continues to resume the most recent compatible draft.

begin;

do $$
begin
    if to_regclass('public.company_estimate_option_sessions') is null then
        raise exception 'public.company_estimate_option_sessions is required before distinct drafts can be installed.';
    end if;

    if to_regprocedure('public.company_estimate_session_context_can_use(uuid,uuid,uuid,uuid,uuid,uuid)') is null then
        raise exception 'public.company_estimate_session_context_can_use(uuid,uuid,uuid,uuid,uuid,uuid) is required before distinct drafts can be installed.';
    end if;
end;
$$;

create or replace function public.create_estimate_option_session_for_draft(
    p_company_id uuid default null,
    p_property_id uuid default null,
    p_service_request_id uuid default null,
    p_job_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_home_item_id uuid default null,
    p_category text default 'faucet_replacement',
    p_source text default 'techos'
)
returns table (
    id uuid,
    company_id uuid,
    property_id uuid,
    service_request_id uuid,
    job_id uuid,
    schedule_slot_id uuid,
    home_item_id uuid,
    category text,
    status text,
    source text,
    created_by_company_user_id uuid,
    technician_approved_at timestamptz,
    presented_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_created public.company_estimate_option_sessions%rowtype;
    v_company_user_id uuid := null;
    v_category text := coalesce(nullif(btrim(p_category), ''), 'faucet_replacement');
    v_source text := lower(btrim(coalesce(p_source, 'techos')));
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if p_company_id is null then
        raise exception 'Company is required before an estimate session can be created.';
    end if;

    if v_source not in ('techos', 'provider_mode', 'management', 'homeos') then
        v_source := 'techos';
    end if;

    select company_user.id
    into v_company_user_id
    from public.company_users as company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc nulls last, company_user.id asc
    limit 1;

    if not public.company_estimate_session_context_can_use(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id,
        p_home_item_id
    ) then
        raise exception 'Not authorized to create an estimate session for this property or request.';
    end if;

    insert into public.company_estimate_option_sessions (
        company_id,
        property_id,
        service_request_id,
        job_id,
        schedule_slot_id,
        home_item_id,
        category,
        status,
        source,
        created_by_company_user_id
    )
    values (
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_job_id,
        p_schedule_slot_id,
        p_home_item_id,
        v_category,
        'draft',
        v_source,
        v_company_user_id
    )
    returning * into v_created;

    return query
    select
        v_created.id,
        v_created.company_id,
        v_created.property_id,
        v_created.service_request_id,
        v_created.job_id,
        v_created.schedule_slot_id,
        v_created.home_item_id,
        v_created.category,
        v_created.status,
        v_created.source,
        v_created.created_by_company_user_id,
        v_created.technician_approved_at,
        v_created.presented_at;
end;
$$;

revoke all on function public.create_estimate_option_session_for_draft(uuid, uuid, uuid, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.create_estimate_option_session_for_draft(uuid, uuid, uuid, uuid, uuid, uuid, text, text) to authenticated;

commit;
