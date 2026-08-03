-- Same-day Service and Repair is a separate, limited path. It is never a
-- blanket waiver of a customer's cancellation rights: the customer must have
-- initiated the short-notice request, the signed agreement must stay within
-- the statutory repair scope and $750 ceiling, and no payment is collected
-- before the work is complete. The company must use attorney-approved
-- contract wording in addition to this recorded acknowledgement.

begin;

alter table public.company_job_workflows
    add column if not exists same_day_service_repair_reason text,
    add column if not exists same_day_service_repair_homeowner_name text,
    add column if not exists same_day_service_repair_homeowner_signature text,
    add column if not exists same_day_service_repair_acknowledgment jsonb,
    add column if not exists same_day_service_repair_acknowledged_at timestamptz,
    add column if not exists same_day_service_repair_technician_confirmed_at timestamptz,
    add column if not exists closed_at timestamptz;

alter table public.company_job_workflows
    drop constraint if exists company_job_workflows_execution_check;

alter table public.company_job_workflows
    add constraint company_job_workflows_execution_check check (
        execution_timing is null
        or execution_timing in ('now', 'later', 'same_day_service_repair')
    );

create or replace function public.validate_company_job_workflow_drawn_signatures()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if new.cancellation_homeowner_signature is distinct from old.cancellation_homeowner_signature
       and new.cancellation_homeowner_signature is not null
       and not public.is_company_drawn_signature(new.cancellation_homeowner_signature) then
        raise exception 'Draw the cancellation-notice signature in the signature pad.';
    end if;
    if new.homeowner_signature is distinct from old.homeowner_signature
       and new.homeowner_signature is not null
       and not public.is_company_drawn_signature(new.homeowner_signature) then
        raise exception 'Draw the work-approval signature in the signature pad.';
    end if;
    if new.same_day_service_repair_homeowner_signature is distinct from old.same_day_service_repair_homeowner_signature
       and new.same_day_service_repair_homeowner_signature is not null
       and not public.is_company_drawn_signature(new.same_day_service_repair_homeowner_signature) then
        raise exception 'Draw the Same-Day Service and Repair signature in the signature pad.';
    end if;
    if new.completion_homeowner_signature is distinct from old.completion_homeowner_signature
       and new.completion_homeowner_signature is not null
       and not public.is_company_drawn_signature(new.completion_homeowner_signature) then
        raise exception 'Draw the satisfactory-completion signature in the signature pad.';
    end if;
    return new;
end;
$$;

create or replace function public.enforce_company_job_workflow_cancellation_wait()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_days integer;
    v_first_work_date date;
    v_same_day_ack jsonb := coalesce(new.same_day_service_repair_acknowledgment, '{}'::jsonb);
begin
    if old.status = 'sold' and new.status = 'prework' then
        if new.execution_timing <> 'same_day_service_repair'
           or new.same_day_service_repair_acknowledged_at is null
           or new.same_day_service_repair_technician_confirmed_at is null
           or nullif(btrim(new.same_day_service_repair_reason), '') is null
           or nullif(btrim(new.same_day_service_repair_homeowner_name), '') is null
           or not public.is_company_drawn_signature(new.same_day_service_repair_homeowner_signature)
           or new.selected_total is null
           or new.selected_total > 750
           or not coalesce((v_same_day_ack->>'customer_initiated')::boolean, false)
           or not coalesce((v_same_day_ack->>'short_notice_requested')::boolean, false)
           or not coalesce((v_same_day_ack->>'signed_service_repair_agreement_confirmed')::boolean, false)
           or not coalesce((v_same_day_ack->>'scope_limited_to_repair')::boolean, false)
           or not coalesce((v_same_day_ack->>'no_payment_before_completion')::boolean, false)
           or not coalesce((v_same_day_ack->>'technician_confirmed')::boolean, false) then
            raise exception 'Immediate start requires a fully validated Same-Day Service and Repair agreement or a separate emergency-repair exception.';
        end if;
    end if;

    if old.status = 'sold' and new.status = 'scheduled_later' then
        v_days := coalesce((old.cancellation_rule_snapshot->>'cancellation_days')::integer, 3);
        v_first_work_date := public.company_add_business_days(
            coalesce(old.homeowner_accepted_at, old.sold_at, now())::date,
            v_days
        ) + 1;
        if new.scheduled_for is null or new.scheduled_for::date < v_first_work_date then
            raise exception 'Schedule work after the cancellation period, on or after %.', v_first_work_date;
        end if;
    end if;

    return new;
end;
$$;

create or replace function public.start_company_job_workflow_same_day_service_repair(
    p_workflow_id uuid,
    p_reason text,
    p_homeowner_name text,
    p_homeowner_signature text,
    p_customer_initiated boolean,
    p_short_notice_requested boolean,
    p_signed_service_repair_agreement_confirmed boolean,
    p_scope_limited_to_repair boolean,
    p_no_payment_before_completion boolean,
    p_technician_confirmed boolean
)
returns public.company_job_workflows
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
    v_name text := nullif(btrim(coalesce(p_homeowner_name, '')), '');
    v_ack jsonb;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id
    for update;

    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;
    if v_workflow.status <> 'sold' then
        raise exception 'Only a sold job can enter Same-Day Service and Repair.';
    end if;
    if v_workflow.selected_total is null or v_workflow.selected_total > 750 then
        raise exception 'Same-Day Service and Repair is limited to a total contract price of $750 or less.';
    end if;
    if v_reason is null or v_name is null or not public.is_company_drawn_signature(p_homeowner_signature) then
        raise exception 'The repair reason, homeowner name, and drawn acknowledgement signature are required.';
    end if;
    if not coalesce(p_customer_initiated, false)
       or not coalesce(p_short_notice_requested, false)
       or not coalesce(p_signed_service_repair_agreement_confirmed, false)
       or not coalesce(p_scope_limited_to_repair, false)
       or not coalesce(p_no_payment_before_completion, false)
       or not coalesce(p_technician_confirmed, false) then
        raise exception 'Confirm every Same-Day Service and Repair requirement before starting work.';
    end if;

    v_ack := jsonb_build_object(
        'customer_initiated', true,
        'short_notice_requested', true,
        'signed_service_repair_agreement_confirmed', true,
        'scope_limited_to_repair', true,
        'no_payment_before_completion', true,
        'technician_confirmed', true,
        'selected_total', v_workflow.selected_total,
        'recorded_at', now()
    );

    update public.company_job_workflows
    set execution_timing = 'same_day_service_repair',
        same_day_service_repair_reason = v_reason,
        same_day_service_repair_homeowner_name = v_name,
        same_day_service_repair_homeowner_signature = btrim(p_homeowner_signature),
        same_day_service_repair_acknowledgment = v_ack,
        same_day_service_repair_acknowledged_at = now(),
        same_day_service_repair_technician_confirmed_at = now(),
        status = 'prework',
        updated_at = now()
    where id = v_workflow.id
    returning * into v_workflow;

    insert into public.company_job_workflow_events(
        workflow_id, company_id, event_type, title, detail, visibility, metadata
    ) values (
        v_workflow.id,
        v_workflow.company_id,
        'start_same_day_service_repair',
        'Same-Day Service and Repair started',
        format('Customer requested a short-notice repair. Recorded scope: %s', v_reason),
        'homeowner',
        v_ack
    );

    return v_workflow;
end;
$$;

create or replace function public.close_company_job_workflow(
    p_workflow_id uuid,
    p_payment_handling text
)
returns public.company_job_workflows
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_payment_status text;
    v_title text;
    v_detail text;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id
    for update;

    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;
    if v_workflow.status <> 'customer_completed' then
        raise exception 'Technician completion and the homeowner acknowledgement are required before close out.';
    end if;

    if p_payment_handling = 'paid_externally' then
        v_payment_status := 'collected_externally';
        v_title := 'Job closed out — payment recorded';
        v_detail := 'The technician recorded payment collected outside HomeOS.';
    elsif p_payment_handling = 'balance_due_to_office' then
        v_payment_status := 'collection_pending';
        v_title := 'Job closed out — balance routed to office';
        v_detail := 'The completed job is closed in the field; the office owns the remaining balance.';
    else
        raise exception 'Choose whether payment was collected or the balance goes to the office.';
    end if;

    update public.company_job_workflows
    set invoice_sent_at = coalesce(invoice_sent_at, now()),
        payment_status = v_payment_status,
        status = 'closed',
        closed_at = now(),
        updated_at = now()
    where id = v_workflow.id
    returning * into v_workflow;

    insert into public.company_job_workflow_events(
        workflow_id, company_id, event_type, title, detail, visibility, metadata
    ) values (
        v_workflow.id,
        v_workflow.company_id,
        'close_out_job',
        v_title,
        v_detail,
        'homeowner',
        jsonb_build_object('payment_handling', p_payment_handling)
    );

    return v_workflow;
end;
$$;

create or replace function public.record_company_job_workflow_closeout_payment(
    p_workflow_id uuid
)
returns public.company_job_workflows
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id
    for update;

    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;
    if v_workflow.status <> 'closed' or v_workflow.payment_status <> 'collection_pending' then
        raise exception 'This job does not have a balance awaiting office collection.';
    end if;

    update public.company_job_workflows
    set payment_status = 'collected_externally', updated_at = now()
    where id = v_workflow.id
    returning * into v_workflow;

    insert into public.company_job_workflow_events(
        workflow_id, company_id, event_type, title, detail, visibility, metadata
    ) values (
        v_workflow.id,
        v_workflow.company_id,
        'record_closeout_payment',
        'Closeout balance collected',
        'Payment was recorded after field closeout.',
        'homeowner',
        '{}'::jsonb
    );

    return v_workflow;
end;
$$;

revoke all on function public.start_company_job_workflow_same_day_service_repair(uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean) from public, anon;
revoke all on function public.close_company_job_workflow(uuid,text) from public, anon;
revoke all on function public.record_company_job_workflow_closeout_payment(uuid) from public, anon;
grant execute on function public.start_company_job_workflow_same_day_service_repair(uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.close_company_job_workflow(uuid,text) to authenticated;
grant execute on function public.record_company_job_workflow_closeout_payment(uuid) to authenticated;

commit;
