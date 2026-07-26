-- Allow a homeowner to accept multiple compatible option scopes, calculate the
-- combined contract total, and sign the cancellation notice separately first.

begin;

alter table public.company_job_workflows
    add column if not exists selected_source_choice_ids text[] not null default array[]::text[],
    add column if not exists selected_options_snapshot jsonb not null default '[]'::jsonb,
    add column if not exists selected_total numeric(12,2),
    add column if not exists cancellation_homeowner_name text,
    add column if not exists cancellation_homeowner_signature text;

create or replace function public.accept_company_job_workflow_quote_v2(
    p_workflow_id uuid,
    p_selected_choice_ids text[],
    p_cancellation_name text,
    p_cancellation_signature text,
    p_homeowner_name text,
    p_homeowner_signature text
)
returns public.company_job_workflows
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_rule jsonb;
    v_snapshots jsonb;
    v_selected_ids text[];
    v_selected_total numeric(12,2);
    v_expected_count integer;
    v_actual_count integer;
    v_title_list text;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id
    for update;

    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;
    if v_workflow.status <> 'presenting' then
        raise exception 'This quote is no longer awaiting homeowner selection.';
    end if;

    select array_agg(distinct btrim(choice_id) order by btrim(choice_id))
    into v_selected_ids
    from unnest(coalesce(p_selected_choice_ids, array[]::text[])) choice_id
    where nullif(btrim(choice_id), '') is not null;

    v_expected_count := coalesce(cardinality(v_selected_ids), 0);
    if v_expected_count = 0 then raise exception 'Select at least one option.'; end if;

    select
        count(*),
        jsonb_agg(option.choice_snapshot order by option.display_order),
        coalesce(sum(option.deterministic_total), 0),
        string_agg(option.title, ', ' order by option.display_order)
    into v_actual_count, v_snapshots, v_selected_total, v_title_list
    from public.company_estimate_options option
    where option.session_id = v_workflow.estimate_session_id
      and option.source_choice_id = any(v_selected_ids);

    if v_actual_count <> v_expected_count then
        raise exception 'One or more selected options are not part of the presented set.';
    end if;
    if nullif(btrim(coalesce(p_cancellation_name, '')), '') is null
       or nullif(btrim(coalesce(p_cancellation_signature, '')), '') is null then
        raise exception 'Sign the cancellation-right notice before approving the work.';
    end if;
    if nullif(btrim(coalesce(p_homeowner_name, '')), '') is null
       or nullif(btrim(coalesce(p_homeowner_signature, '')), '') is null then
        raise exception 'Homeowner name and work-approval signature are required.';
    end if;

    select coalesce(to_jsonb(rule), jsonb_build_object(
        'jurisdiction_label', 'Company configuration required',
        'cancellation_days', 3,
        'cancellation_notice_title', 'Notice of right to cancel',
        'cancellation_notice_text', 'Review the company-approved cancellation notice before signing.',
        'requires_homeowner_acknowledgment', true
    ))
    into v_rule
    from (select v_workflow.company_id as company_id) seed
    left join public.company_contract_rules rule on rule.company_id = seed.company_id;

    update public.company_job_workflows
    set selected_source_choice_id = v_selected_ids[1],
        selected_option_snapshot = v_snapshots->0,
        selected_source_choice_ids = v_selected_ids,
        selected_options_snapshot = v_snapshots,
        selected_total = v_selected_total,
        cancellation_homeowner_name = btrim(p_cancellation_name),
        cancellation_homeowner_signature = btrim(p_cancellation_signature),
        cancellation_rule_snapshot = v_rule,
        cancellation_acknowledged_at = now(),
        homeowner_name = btrim(p_homeowner_name),
        homeowner_signature = btrim(p_homeowner_signature),
        homeowner_accepted_at = now(),
        sold_at = now(),
        status = 'sold',
        updated_at = now()
    where id = v_workflow.id
    returning * into v_workflow;

    update public.company_estimate_option_sessions
    set status = 'presented', presented_at = now(), updated_at = now()
    where id = v_workflow.estimate_session_id;

    insert into public.company_job_workflow_events(
        workflow_id, company_id, event_type, title, detail, visibility, metadata
    ) values (
        v_workflow.id, v_workflow.company_id, 'accept_quote', 'Job sold',
        format('Homeowner accepted %s option(s): %s. Combined total: $%s.',
            v_actual_count, v_title_list, to_char(v_selected_total, 'FM999999990.00')),
        'homeowner',
        jsonb_build_object(
            'selected_choice_ids', to_jsonb(v_selected_ids),
            'selected_total', v_selected_total,
            'cancellation_notice_signed_first', true
        )
    );

    if v_workflow.service_request_id is not null then
        insert into public.service_request_events(
            company_id, service_request_id, property_id, schedule_slot_id,
            event_type, message, event_visibility, audience, metadata, dedupe_key
        ) values (
            v_workflow.company_id, v_workflow.service_request_id, v_workflow.property_id, v_workflow.schedule_slot_id,
            'accept_quote',
            format('Job sold — homeowner accepted %s option(s), combined total $%s.',
                v_actual_count, to_char(v_selected_total, 'FM999999990.00')),
            'homeowner_visible', 'homeowner',
            jsonb_build_object('workflow_id', v_workflow.id, 'selected_choice_ids', to_jsonb(v_selected_ids)),
            'accept_quote:v2:' || v_workflow.id::text
        );
    end if;

    return v_workflow;
end;
$$;

revoke all on function public.accept_company_job_workflow_quote_v2(uuid,text[],text,text,text,text) from public, anon;
grant execute on function public.accept_company_job_workflow_quote_v2(uuid,text[],text,text,text,text) to authenticated;

commit;
