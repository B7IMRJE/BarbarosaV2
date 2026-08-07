create or replace function public.get_or_create_company_job_workflow(p_estimate_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
    v_workflow public.company_job_workflows%rowtype;
    v_rule public.company_contract_rules%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_session
    from public.company_estimate_option_sessions
    where id = p_estimate_session_id;

    if not found or not public.company_estimate_options_can_use(v_session.company_id) then
        raise exception 'Estimate session is unavailable.';
    end if;

    insert into public.company_job_workflows (
        company_id, estimate_session_id, service_request_id, schedule_slot_id, job_id, property_id
    ) values (
        v_session.company_id, v_session.id, v_session.service_request_id,
        v_session.schedule_slot_id, v_session.job_id, v_session.property_id
    )
    on conflict (estimate_session_id) do nothing
    returning * into v_workflow;

    if v_workflow.id is null then
        select * into v_workflow
        from public.company_job_workflows
        where estimate_session_id = v_session.id;
    end if;

    select * into v_rule from public.company_contract_rules where company_id = v_session.company_id;

    return jsonb_build_object(
        'workflow', to_jsonb(v_workflow),
        'contract_rule', coalesce(to_jsonb(v_rule), jsonb_build_object(
            'jurisdiction_label', 'Company configuration required',
            'cancellation_days', 3,
            'cancellation_notice_title', 'Notice of right to cancel',
            'cancellation_notice_text', 'Review the company-approved cancellation notice before signing.',
            'requires_homeowner_acknowledgment', true
        )),
        'options', coalesce((
            select jsonb_agg(option.choice_snapshot order by option.display_order)
            from public.company_estimate_options option
            where option.session_id = v_session.id
        ), '[]'::jsonb),
        'attachments', coalesce((
            select jsonb_agg(to_jsonb(attachment) order by attachment.created_at)
            from public.company_job_workflow_attachments attachment
            where attachment.workflow_id = v_workflow.id
        ), '[]'::jsonb),
        'events', coalesce((
            select jsonb_agg(to_jsonb(event) order by event.created_at)
            from public.company_job_workflow_events event
            where event.workflow_id = v_workflow.id
        ), '[]'::jsonb)
    );
end;
$$;

revoke all on function public.get_or_create_company_job_workflow(uuid) from public, anon;
grant execute on function public.get_or_create_company_job_workflow(uuid) to authenticated;
