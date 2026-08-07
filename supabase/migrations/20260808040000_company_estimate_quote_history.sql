-- Gives authorized company staff a read-only quote history for a connected
-- customer home while keeping active quote edits tied to their job context.

begin;

do $$
begin
    if to_regclass('public.company_estimate_option_sessions') is null
       or to_regclass('public.company_estimate_options') is null
       or to_regclass('public.company_job_workflows') is null
       or to_regclass('public.company_property_clients') is null then
        raise exception 'Estimate sessions, options, workflows, and company clients are required before quote history can be installed.';
    end if;

    if to_regprocedure('public.company_estimate_options_can_use(uuid)') is null then
        raise exception 'public.company_estimate_options_can_use(uuid) is required before quote history can be installed.';
    end if;
end;
$$;

create index if not exists company_estimate_option_sessions_customer_history_idx
    on public.company_estimate_option_sessions(company_id, property_id, updated_at desc)
    where status <> 'archived';

create or replace function public.company_estimate_customer_history_can_view(
    p_company_id uuid,
    p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and p_property_id is not null
       and public.company_estimate_options_can_use(p_company_id)
       and exists (
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
       )
       and exists (
           select 1
           from public.company_property_clients as company_client
           where company_client.company_id = p_company_id
             and company_client.property_id = p_property_id
             and lower(btrim(coalesce(company_client.status, 'active'))) not in (
                 'archived',
                 'cancelled',
                 'canceled',
                 'declined',
                 'inactive',
                 'revoked'
             )
       );
$$;

revoke all on function public.company_estimate_customer_history_can_view(uuid, uuid) from public, anon, authenticated;

create or replace function public.list_company_estimate_quote_history(
    p_company_id uuid,
    p_property_id uuid
)
returns table (
    id uuid,
    company_id uuid,
    quote_number text,
    current_builder_step text,
    status text,
    category text,
    property_id uuid,
    service_request_id uuid,
    job_id uuid,
    schedule_slot_id uuid,
    home_item_id uuid,
    source text,
    customer_name text,
    customer_address text,
    request_display_code text,
    issue_summary text,
    prepared_by_name text,
    option_count integer,
    lowest_total numeric,
    highest_total numeric,
    selected_option_count integer,
    selected_total numeric,
    presented_at timestamptz,
    accepted_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if not public.company_estimate_customer_history_can_view(p_company_id, p_property_id) then
        raise exception 'Not authorized to view quote history for this customer.';
    end if;

    return query
    select
        session.id,
        session.company_id,
        session.quote_number,
        session.current_builder_step,
        session.status,
        session.category,
        session.property_id,
        session.service_request_id,
        session.job_id,
        session.schedule_slot_id,
        session.home_item_id,
        session.source,
        coalesce(
            nullif(btrim(company_client.display_name), ''),
            nullif(btrim(property.name), ''),
            'Customer home'
        ) as customer_name,
        coalesce(
            nullif(btrim(property.address), ''),
            nullif(btrim(property.address_line_1), ''),
            ''
        ) as customer_address,
        nullif(upper(btrim(request.display_code)), '') as request_display_code,
        nullif(btrim(request.issue_summary), '') as issue_summary,
        coalesce(nullif(btrim(creator.full_name), ''), 'Company team member') as prepared_by_name,
        coalesce(option_totals.option_count, 0)::integer as option_count,
        option_totals.lowest_total,
        option_totals.highest_total,
        case
            when coalesce(cardinality(workflow.selected_source_choice_ids), 0) > 0
                then cardinality(workflow.selected_source_choice_ids)
            when nullif(btrim(workflow.selected_source_choice_id), '') is not null
                then 1
            else coalesce(option_totals.technician_selected_count, 0)
        end::integer as selected_option_count,
        coalesce(workflow.selected_total, option_totals.accepted_selected_total) as selected_total,
        session.presented_at,
        workflow.homeowner_accepted_at as accepted_at,
        session.created_at,
        session.updated_at
    from public.company_estimate_option_sessions as session
    left join public.service_requests as request
        on request.id = session.service_request_id
       and request.company_id = session.company_id
    left join public.properties as property
        on property.id = session.property_id
    left join public.company_users as creator
        on creator.id = session.created_by_company_user_id
       and creator.company_id = session.company_id
    left join public.company_job_workflows as workflow
        on workflow.estimate_session_id = session.id
       and workflow.company_id = session.company_id
    left join lateral (
        select client.display_name
        from public.company_property_clients as client
        where client.company_id = session.company_id
          and client.property_id = session.property_id
          and lower(btrim(coalesce(client.status, 'active'))) not in (
              'archived',
              'cancelled',
              'canceled',
              'declined',
              'inactive',
              'revoked'
          )
        order by client.connected_at desc nulls last, client.created_at desc nulls last, client.id desc
        limit 1
    ) as company_client on true
    left join lateral (
        select
            count(*)::integer as option_count,
            min(option_row.deterministic_total) as lowest_total,
            max(option_row.deterministic_total) as highest_total,
            count(*) filter (where option_row.selected_for_presentation)::integer as technician_selected_count,
            sum(option_row.deterministic_total) filter (
                where (
                    coalesce(cardinality(workflow.selected_source_choice_ids), 0) > 0
                    and option_row.source_choice_id = any(workflow.selected_source_choice_ids)
                ) or (
                    coalesce(cardinality(workflow.selected_source_choice_ids), 0) = 0
                    and nullif(btrim(workflow.selected_source_choice_id), '') is not null
                    and option_row.source_choice_id = workflow.selected_source_choice_id
                )
            ) as accepted_selected_total
        from public.company_estimate_options as option_row
        where option_row.session_id = session.id
          and option_row.company_id = session.company_id
    ) as option_totals on true
    where session.company_id = p_company_id
      and session.property_id = p_property_id
      and session.status <> 'archived'
    order by
        coalesce(workflow.homeowner_accepted_at, session.presented_at, session.updated_at) desc,
        session.created_at desc,
        session.id desc;
end;
$$;

revoke all on function public.list_company_estimate_quote_history(uuid, uuid) from public, anon;
grant execute on function public.list_company_estimate_quote_history(uuid, uuid) to authenticated;

create or replace function public.get_company_estimate_quote_history(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
    v_result jsonb;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    select session.*
    into v_session
    from public.company_estimate_option_sessions as session
    where session.id = p_session_id
      and session.status <> 'archived';

    if not found
       or not public.company_estimate_customer_history_can_view(
           v_session.company_id,
           v_session.property_id
       ) then
        raise exception 'Quote history is unavailable or not authorized.';
    end if;

    select jsonb_build_object(
        'id', session.id,
        'company_id', session.company_id,
        'quote_number', session.quote_number,
        'current_builder_step', session.current_builder_step,
        'status', session.status,
        'category', session.category,
        'property_id', session.property_id,
        'service_request_id', session.service_request_id,
        'job_id', session.job_id,
        'schedule_slot_id', session.schedule_slot_id,
        'home_item_id', session.home_item_id,
        'source', session.source,
        'customer_name', coalesce(
            nullif(btrim(company_client.display_name), ''),
            nullif(btrim(property.name), ''),
            'Customer home'
        ),
        'customer_address', coalesce(
            nullif(btrim(property.address), ''),
            nullif(btrim(property.address_line_1), '')
        ),
        'request_display_code', nullif(upper(btrim(request.display_code)), ''),
        'issue_summary', nullif(btrim(request.issue_summary), ''),
        'prepared_by_name', coalesce(nullif(btrim(creator.full_name), ''), 'Company team member'),
        'selected_source_choice_ids', case
            when coalesce(cardinality(workflow.selected_source_choice_ids), 0) > 0
                then to_jsonb(workflow.selected_source_choice_ids)
            when nullif(btrim(workflow.selected_source_choice_id), '') is not null
                then jsonb_build_array(workflow.selected_source_choice_id)
            else coalesce((
                select jsonb_agg(option_row.source_choice_id order by option_row.display_order, option_row.created_at)
                from public.company_estimate_options as option_row
                where option_row.session_id = session.id
                  and option_row.company_id = session.company_id
                  and option_row.selected_for_presentation
            ), '[]'::jsonb)
        end,
        'selected_total', coalesce(workflow.selected_total, (
            select sum(option_row.deterministic_total)
            from public.company_estimate_options as option_row
            where option_row.session_id = session.id
              and option_row.company_id = session.company_id
              and (
                  (
                      coalesce(cardinality(workflow.selected_source_choice_ids), 0) > 0
                      and option_row.source_choice_id = any(workflow.selected_source_choice_ids)
                  ) or (
                      coalesce(cardinality(workflow.selected_source_choice_ids), 0) = 0
                      and nullif(btrim(workflow.selected_source_choice_id), '') is not null
                      and option_row.source_choice_id = workflow.selected_source_choice_id
                  )
              )
        )),
        'accepted_customer_name', workflow.homeowner_name,
        'accepted_at', workflow.homeowner_accepted_at,
        'presented_at', session.presented_at,
        'created_at', session.created_at,
        'updated_at', session.updated_at,
        'options', coalesce((
            select jsonb_agg(
                option_row.choice_snapshot || jsonb_build_object(
                    'id', coalesce(nullif(option_row.choice_snapshot->>'id', ''), option_row.source_choice_id),
                    'priceAdjustmentPercentage', option_row.price_adjustment_percentage
                )
                order by option_row.display_order, option_row.created_at
            )
            from public.company_estimate_options as option_row
            where option_row.session_id = session.id
              and option_row.company_id = session.company_id
        ), '[]'::jsonb)
    )
    into v_result
    from public.company_estimate_option_sessions as session
    left join public.service_requests as request
        on request.id = session.service_request_id
       and request.company_id = session.company_id
    left join public.properties as property
        on property.id = session.property_id
    left join public.company_users as creator
        on creator.id = session.created_by_company_user_id
       and creator.company_id = session.company_id
    left join public.company_job_workflows as workflow
        on workflow.estimate_session_id = session.id
       and workflow.company_id = session.company_id
    left join lateral (
        select client.display_name
        from public.company_property_clients as client
        where client.company_id = session.company_id
          and client.property_id = session.property_id
          and lower(btrim(coalesce(client.status, 'active'))) not in (
              'archived',
              'cancelled',
              'canceled',
              'declined',
              'inactive',
              'revoked'
          )
        order by client.connected_at desc nulls last, client.created_at desc nulls last, client.id desc
        limit 1
    ) as company_client on true
    where session.id = v_session.id;

    return v_result;
end;
$$;

revoke all on function public.get_company_estimate_quote_history(uuid) from public, anon;
grant execute on function public.get_company_estimate_quote_history(uuid) to authenticated;

create or replace function public.prevent_presented_estimate_session_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if old.status = 'presented' then
        raise exception 'Presented quote sessions are immutable.';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$$;

revoke all on function public.prevent_presented_estimate_session_mutation() from public, anon, authenticated;

drop trigger if exists company_estimate_option_sessions_protect_presented
    on public.company_estimate_option_sessions;
create trigger company_estimate_option_sessions_protect_presented
before update or delete on public.company_estimate_option_sessions
for each row
execute function public.prevent_presented_estimate_session_mutation();

create or replace function public.prevent_presented_estimate_option_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session_id uuid := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
begin
    if exists (
        select 1
        from public.company_estimate_option_sessions as session
        where session.id = v_session_id
          and session.status = 'presented'
    ) then
        raise exception 'Presented quote options are immutable.';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$$;

revoke all on function public.prevent_presented_estimate_option_mutation() from public, anon, authenticated;

drop trigger if exists company_estimate_options_protect_presented
    on public.company_estimate_options;
create trigger company_estimate_options_protect_presented
before insert or update or delete on public.company_estimate_options
for each row
execute function public.prevent_presented_estimate_option_mutation();

commit;
