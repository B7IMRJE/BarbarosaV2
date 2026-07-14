-- Add server-side estimate-option session authorization.
--
-- Additive only:
--   - does not edit the already-applied 20260713120000 foundation migration
--   - does not seed estimate sessions, options, homeowner data, or demo records
--   - keeps AI drafting scoped to a persisted estimate session before OpenAI is called

begin;

do $$
begin
    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before estimate session authorization can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before estimate session authorization can be installed.';
    end if;

    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required before estimate session authorization can be installed.';
    end if;

    if to_regclass('public.company_estimate_option_sessions') is null then
        raise exception 'public.company_estimate_option_sessions is required before estimate session authorization can be installed.';
    end if;

    if to_regclass('public.home_items') is null then
        raise exception 'public.home_items is required before estimate session authorization can be installed.';
    end if;

    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before estimate session authorization can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before estimate session authorization can be installed.';
    end if;

    if to_regclass('public.jobs') is null then
        raise exception 'public.jobs is required before estimate session authorization can be installed.';
    end if;

    if to_regprocedure('public.company_estimate_options_can_use(uuid)') is null then
        raise exception 'public.company_estimate_options_can_use(uuid) is required before estimate session authorization can be installed.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before estimate session authorization can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid)') is null then
        raise exception 'public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid) is required before estimate session authorization can be installed.';
    end if;
end;
$$;

create index if not exists company_estimate_option_sessions_context_idx
    on public.company_estimate_option_sessions(
        company_id,
        property_id,
        service_request_id,
        schedule_slot_id,
        job_id,
        home_item_id,
        source,
        status
    );

create or replace function public.company_estimate_session_context_can_use(
    p_company_id uuid,
    p_property_id uuid default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_home_item_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null or p_company_id is null then
        return false;
    end if;

    if not exists (
        select 1
        from public.companies as company
        where company.id = p_company_id
          and lower(btrim(coalesce(company.status, 'active'))) not in (
              'inactive',
              'archived',
              'cancelled',
              'canceled',
              'disabled',
              'suspended'
          )
    ) then
        return false;
    end if;

    if not public.company_estimate_options_can_use(p_company_id) then
        return false;
    end if;

    if p_home_item_id is not null and not exists (
        select 1
        from public.home_items as item
        where item.id = p_home_item_id
          and item.property_id = p_property_id
          and coalesce(item.archived, false) = false
    ) then
        return false;
    end if;

    if p_service_request_id is not null
       or p_schedule_slot_id is not null
       or p_job_id is not null then
        if p_property_id is null then
            return false;
        end if;

        if public.homeos_can_read_provider_assigned_items(
            p_company_id,
            p_property_id,
            p_service_request_id,
            p_schedule_slot_id,
            p_job_id
        ) then
            return true;
        end if;

        if public.can_dispatch_company(p_company_id) then
            if p_schedule_slot_id is not null and exists (
                select 1
                from public.job_schedule_slots as slot
                left join public.service_requests as request
                  on request.id = slot.service_request_id
                 and request.company_id = slot.company_id
                left join public.jobs as job
                  on job.id = slot.job_id
                 and job.company_id = slot.company_id
                where slot.id = p_schedule_slot_id
                  and slot.company_id = p_company_id
                  and (p_service_request_id is null or slot.service_request_id = p_service_request_id)
                  and (p_job_id is null or slot.job_id = p_job_id)
                  and (
                      (request.id is not null and request.property_id = p_property_id)
                      or (job.id is not null and job.property_id = p_property_id)
                  )
            ) then
                return true;
            end if;

            if p_service_request_id is not null and exists (
                select 1
                from public.service_requests as request
                where request.id = p_service_request_id
                  and request.company_id = p_company_id
                  and request.property_id = p_property_id
            ) then
                return true;
            end if;

            if p_job_id is not null and exists (
                select 1
                from public.jobs as job
                where job.id = p_job_id
                  and job.company_id = p_company_id
                  and job.property_id = p_property_id
            ) then
                return true;
            end if;
        end if;

        return false;
    end if;

    if p_property_id is null then
        return false;
    end if;

    return exists (
        select 1
        from public.company_property_clients as company_client
        where company_client.company_id = p_company_id
          and company_client.property_id = p_property_id
          and lower(btrim(coalesce(company_client.status, ''))) not in (
              'archived',
              'cancelled',
              'canceled',
              'declined',
              'inactive',
              'revoked'
          )
    );
end;
$$;

revoke all on function public.company_estimate_session_context_can_use(uuid, uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function public.company_estimate_session_context_can_use(uuid, uuid, uuid, uuid, uuid, uuid) from anon;
revoke all on function public.company_estimate_session_context_can_use(uuid, uuid, uuid, uuid, uuid, uuid) from authenticated;

create or replace function public.upsert_estimate_option_session_for_draft(
    p_session_id uuid default null,
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
    v_existing public.company_estimate_option_sessions%rowtype;
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

    if p_session_id is not null then
        select session.*
        into v_existing
        from public.company_estimate_option_sessions as session
        where session.id = p_session_id
        for update;

        if not found then
            raise exception 'Estimate session not found.';
        end if;

        if not public.company_estimate_session_context_can_use(
            v_existing.company_id,
            v_existing.property_id,
            v_existing.service_request_id,
            v_existing.schedule_slot_id,
            v_existing.job_id,
            v_existing.home_item_id
        ) then
            raise exception 'Not authorized to use this estimate session.';
        end if;

        if lower(btrim(coalesce(v_existing.status, ''))) not in ('draft', 'technician_review') then
            raise exception 'Estimate session is closed for AI drafting.';
        end if;

        update public.company_estimate_option_sessions as session
        set category = v_category,
            updated_at = now()
        where session.id = v_existing.id
        returning session.* into v_existing;
    else
        select session.*
        into v_existing
        from public.company_estimate_option_sessions as session
        where session.company_id = p_company_id
          and session.property_id is not distinct from p_property_id
          and session.service_request_id is not distinct from p_service_request_id
          and session.schedule_slot_id is not distinct from p_schedule_slot_id
          and session.job_id is not distinct from p_job_id
          and session.home_item_id is not distinct from p_home_item_id
          and session.source = v_source
          and lower(btrim(coalesce(session.status, ''))) in ('draft', 'technician_review')
        order by session.updated_at desc nulls last, session.created_at desc nulls last, session.id desc
        limit 1
        for update;

        if found then
            update public.company_estimate_option_sessions as session
            set category = v_category,
                updated_at = now()
            where session.id = v_existing.id
            returning session.* into v_existing;
        else
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
            returning * into v_existing;
        end if;
    end if;

    return query
    select
        v_existing.id,
        v_existing.company_id,
        v_existing.property_id,
        v_existing.service_request_id,
        v_existing.job_id,
        v_existing.schedule_slot_id,
        v_existing.home_item_id,
        v_existing.category,
        v_existing.status,
        v_existing.source,
        v_existing.created_by_company_user_id,
        v_existing.technician_approved_at,
        v_existing.presented_at;
end;
$$;

revoke all on function public.upsert_estimate_option_session_for_draft(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text) from public;
revoke all on function public.upsert_estimate_option_session_for_draft(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text) from anon;
grant execute on function public.upsert_estimate_option_session_for_draft(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text) to authenticated;

create or replace function public.get_estimate_option_session_for_draft(
    p_session_id uuid
)
returns table (
    allowed boolean,
    denial_code text,
    denial_message text,
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
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
begin
    if auth.uid() is null then
        return query
        select false, 'not_authenticated', 'Sign in before drafting estimate options.',
            null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid,
            null::text, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
        return;
    end if;

    if p_session_id is null then
        return query
        select false, 'missing_session_id', 'Estimate session is required before AI drafting.',
            null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid,
            null::text, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
        return;
    end if;

    select session.*
    into v_session
    from public.company_estimate_option_sessions as session
    where session.id = p_session_id;

    if not found then
        return query
        select false, 'session_not_found', 'Estimate session was not found.',
            null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid,
            null::text, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
        return;
    end if;

    if not exists (
        select 1
        from public.companies as company
        where company.id = v_session.company_id
          and lower(btrim(coalesce(company.status, 'active'))) not in (
              'inactive',
              'archived',
              'cancelled',
              'canceled',
              'disabled',
              'suspended'
          )
    ) then
        return query
        select false, 'company_inactive', 'Estimate session company is not active.',
            v_session.id, v_session.company_id, v_session.property_id, v_session.service_request_id,
            v_session.job_id, v_session.schedule_slot_id, v_session.home_item_id,
            v_session.category, v_session.status, v_session.source,
            v_session.created_by_company_user_id, v_session.technician_approved_at, v_session.presented_at;
        return;
    end if;

    if lower(btrim(coalesce(v_session.status, ''))) not in ('draft', 'technician_review') then
        return query
        select false, 'session_closed', 'Estimate session is closed for AI drafting.',
            v_session.id, v_session.company_id, v_session.property_id, v_session.service_request_id,
            v_session.job_id, v_session.schedule_slot_id, v_session.home_item_id,
            v_session.category, v_session.status, v_session.source,
            v_session.created_by_company_user_id, v_session.technician_approved_at, v_session.presented_at;
        return;
    end if;

    if not public.company_estimate_options_can_use(v_session.company_id) then
        return query
        select false, 'company_not_authorized', 'This account cannot use estimate options for the session company.',
            v_session.id, v_session.company_id, v_session.property_id, v_session.service_request_id,
            v_session.job_id, v_session.schedule_slot_id, v_session.home_item_id,
            v_session.category, v_session.status, v_session.source,
            v_session.created_by_company_user_id, v_session.technician_approved_at, v_session.presented_at;
        return;
    end if;

    if not public.company_estimate_session_context_can_use(
        v_session.company_id,
        v_session.property_id,
        v_session.service_request_id,
        v_session.schedule_slot_id,
        v_session.job_id,
        v_session.home_item_id
    ) then
        return query
        select false, 'session_context_not_authorized', 'This account cannot use the stored estimate session context.',
            v_session.id, v_session.company_id, v_session.property_id, v_session.service_request_id,
            v_session.job_id, v_session.schedule_slot_id, v_session.home_item_id,
            v_session.category, v_session.status, v_session.source,
            v_session.created_by_company_user_id, v_session.technician_approved_at, v_session.presented_at;
        return;
    end if;

    return query
    select true, null::text, null::text,
        v_session.id, v_session.company_id, v_session.property_id, v_session.service_request_id,
        v_session.job_id, v_session.schedule_slot_id, v_session.home_item_id,
        v_session.category, v_session.status, v_session.source,
        v_session.created_by_company_user_id, v_session.technician_approved_at, v_session.presented_at;
end;
$$;

revoke all on function public.get_estimate_option_session_for_draft(uuid) from public;
revoke all on function public.get_estimate_option_session_for_draft(uuid) from anon;
grant execute on function public.get_estimate_option_session_for_draft(uuid) to authenticated;

commit;
