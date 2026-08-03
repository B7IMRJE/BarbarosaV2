-- A technician may start an approved job today when the company chooses to do
-- so. This migration records the selected documentation path without treating
-- the limited Service and Repair contract type as a price cap on all same-day
-- work. Standard same-day work retains any applicable cancellation notice;
-- immediate-protection emergency work records its separate customer waiver.

begin;

alter table public.company_job_workflows
    add column if not exists same_day_start_type text,
    add column if not exists same_day_start_reason text,
    add column if not exists same_day_start_homeowner_name text,
    add column if not exists same_day_start_homeowner_signature text,
    add column if not exists same_day_start_acknowledgment jsonb,
    add column if not exists same_day_start_acknowledged_at timestamptz,
    add column if not exists same_day_start_technician_confirmed_at timestamptz,
    add column if not exists same_day_emergency_waiver_signature text,
    add column if not exists same_day_emergency_waived_at timestamptz;

alter table public.company_job_workflows
    drop constraint if exists company_job_workflows_execution_check;

alter table public.company_job_workflows
    add constraint company_job_workflows_execution_check check (
        execution_timing is null
        or execution_timing in (
            'now',
            'later',
            'same_day_service_repair',
            'same_day_standard',
            'same_day_emergency'
        )
    );

alter table public.company_job_workflows
    drop constraint if exists company_job_workflows_same_day_start_type_check;

alter table public.company_job_workflows
    add constraint company_job_workflows_same_day_start_type_check check (
        same_day_start_type is null
        or same_day_start_type in ('standard_same_day', 'service_and_repair', 'emergency_immediate_protection')
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
    if new.same_day_start_homeowner_signature is distinct from old.same_day_start_homeowner_signature
       and new.same_day_start_homeowner_signature is not null
       and not public.is_company_drawn_signature(new.same_day_start_homeowner_signature) then
        raise exception 'Draw the Same-Day Work Authorization signature in the signature pad.';
    end if;
    if new.same_day_emergency_waiver_signature is distinct from old.same_day_emergency_waiver_signature
       and new.same_day_emergency_waiver_signature is not null
       and not public.is_company_drawn_signature(new.same_day_emergency_waiver_signature) then
        raise exception 'Draw the emergency waiver signature in the signature pad.';
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
    v_legacy_service_repair_ack jsonb := coalesce(new.same_day_service_repair_acknowledgment, '{}'::jsonb);
    v_same_day_ack jsonb := coalesce(new.same_day_start_acknowledgment, '{}'::jsonb);
begin
    if old.status = 'sold' and new.status = 'prework' then
        if new.same_day_start_type = 'standard_same_day' then
            if new.execution_timing <> 'same_day_standard'
               or new.same_day_start_acknowledged_at is null
               or new.same_day_start_technician_confirmed_at is null
               or nullif(btrim(new.same_day_start_reason), '') is null
               or nullif(btrim(new.same_day_start_homeowner_name), '') is null
               or not public.is_company_drawn_signature(new.same_day_start_homeowner_signature)
               or not coalesce((v_same_day_ack->>'customer_initiated')::boolean, false)
               or not coalesce((v_same_day_ack->>'signed_contract_confirmed')::boolean, false)
               or not coalesce((v_same_day_ack->>'technician_confirmed')::boolean, false) then
                raise exception 'Record the signed standard same-day authorization before starting work.';
            end if;
        elsif new.same_day_start_type = 'emergency_immediate_protection' then
            if new.execution_timing <> 'same_day_emergency'
               or new.same_day_start_acknowledged_at is null
               or new.same_day_start_technician_confirmed_at is null
               or new.same_day_emergency_waived_at is null
               or nullif(btrim(new.same_day_start_reason), '') is null
               or nullif(btrim(new.same_day_start_homeowner_name), '') is null
               or not public.is_company_drawn_signature(new.same_day_start_homeowner_signature)
               or not public.is_company_drawn_signature(new.same_day_emergency_waiver_signature)
               or not coalesce((v_same_day_ack->>'customer_initiated')::boolean, false)
               or not coalesce((v_same_day_ack->>'signed_contract_confirmed')::boolean, false)
               or not coalesce((v_same_day_ack->>'immediate_protection_confirmed')::boolean, false)
               or not coalesce((v_same_day_ack->>'technician_confirmed')::boolean, false) then
                raise exception 'Record the separate emergency, immediate-protection authorization before starting work.';
            end if;
        elsif new.same_day_start_type = 'service_and_repair' then
            if new.execution_timing <> 'same_day_service_repair'
               or new.same_day_start_acknowledged_at is null
               or new.same_day_start_technician_confirmed_at is null
               or nullif(btrim(new.same_day_start_reason), '') is null
               or nullif(btrim(new.same_day_start_homeowner_name), '') is null
               or not public.is_company_drawn_signature(new.same_day_start_homeowner_signature)
               or new.selected_total is null
               or new.selected_total > 750
               or not coalesce((v_same_day_ack->>'customer_initiated')::boolean, false)
               or not coalesce((v_same_day_ack->>'signed_contract_confirmed')::boolean, false)
               or not coalesce((v_same_day_ack->>'short_notice_requested')::boolean, false)
               or not coalesce((v_same_day_ack->>'scope_limited_to_repair')::boolean, false)
               or not coalesce((v_same_day_ack->>'no_payment_before_completion')::boolean, false)
               or not coalesce((v_same_day_ack->>'technician_confirmed')::boolean, false) then
                raise exception 'Record the qualifying Service and Repair agreement before starting work.';
            end if;
        elsif new.execution_timing = 'same_day_service_repair'
              and new.same_day_service_repair_acknowledged_at is not null
              and new.same_day_service_repair_technician_confirmed_at is not null
              and nullif(btrim(new.same_day_service_repair_reason), '') is not null
              and nullif(btrim(new.same_day_service_repair_homeowner_name), '') is not null
              and public.is_company_drawn_signature(new.same_day_service_repair_homeowner_signature)
              and new.selected_total is not null
              and new.selected_total <= 750
              and coalesce((v_legacy_service_repair_ack->>'customer_initiated')::boolean, false)
              and coalesce((v_legacy_service_repair_ack->>'short_notice_requested')::boolean, false)
              and coalesce((v_legacy_service_repair_ack->>'signed_service_repair_agreement_confirmed')::boolean, false)
              and coalesce((v_legacy_service_repair_ack->>'scope_limited_to_repair')::boolean, false)
              and coalesce((v_legacy_service_repair_ack->>'no_payment_before_completion')::boolean, false)
              and coalesce((v_legacy_service_repair_ack->>'technician_confirmed')::boolean, false) then
            null;
        else
            raise exception 'Choose and document a valid same-day start path before starting work.';
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

create or replace function public.start_company_job_workflow_same_day(
    p_workflow_id uuid,
    p_start_type text,
    p_reason text,
    p_homeowner_name text,
    p_homeowner_signature text,
    p_customer_initiated boolean,
    p_signed_contract_confirmed boolean,
    p_technician_confirmed boolean,
    p_short_notice_requested boolean,
    p_scope_limited_to_repair boolean,
    p_no_payment_before_completion boolean,
    p_immediate_protection_confirmed boolean,
    p_emergency_waiver_signature text default null
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
    v_timing text;
    v_ack jsonb;
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
    if v_workflow.status <> 'sold' then
        raise exception 'Only a sold job can start work today.';
    end if;
    if p_start_type not in ('standard_same_day', 'service_and_repair', 'emergency_immediate_protection') then
        raise exception 'Choose a valid same-day start path.';
    end if;
    if v_reason is null or v_name is null or not public.is_company_drawn_signature(p_homeowner_signature) then
        raise exception 'The work planned for today, homeowner name, and drawn authorization signature are required.';
    end if;
    if not coalesce(p_signed_contract_confirmed, false)
       or not coalesce(p_technician_confirmed, false) then
        raise exception 'Confirm the signed contract and technician readiness before starting work today.';
    end if;

    if p_start_type = 'service_and_repair' then
        if v_workflow.selected_total is null or v_workflow.selected_total > 750
           or not coalesce(p_customer_initiated, false)
           or not coalesce(p_short_notice_requested, false)
           or not coalesce(p_scope_limited_to_repair, false)
           or not coalesce(p_no_payment_before_completion, false) then
            raise exception 'The Service and Repair path is only for a customer-requested repair of $750 or less with no payment before completion.';
        end if;
        v_timing := 'same_day_service_repair';
        v_title := 'Same-Day Service and Repair started';
        v_detail := format('Customer requested short-notice repair: %s', v_reason);
    elsif p_start_type = 'emergency_immediate_protection' then
        if not coalesce(p_customer_initiated, false)
           or not coalesce(p_immediate_protection_confirmed, false)
           or not public.is_company_drawn_signature(p_emergency_waiver_signature) then
            raise exception 'An immediate-protection emergency needs the separate signed emergency waiver before work starts.';
        end if;
        v_timing := 'same_day_emergency';
        v_title := 'Emergency same-day work started';
        v_detail := format('Immediate protection work authorized: %s', v_reason);
    else
        v_timing := 'same_day_standard';
        v_title := 'Same-day work started';
        v_detail := format('Customer approved work to begin today: %s', v_reason);
    end if;

    v_ack := jsonb_build_object(
        'customer_initiated', coalesce(p_customer_initiated, false),
        'signed_contract_confirmed', true,
        'technician_confirmed', true,
        'short_notice_requested', coalesce(p_short_notice_requested, false),
        'scope_limited_to_repair', coalesce(p_scope_limited_to_repair, false),
        'no_payment_before_completion', coalesce(p_no_payment_before_completion, false),
        'immediate_protection_confirmed', coalesce(p_immediate_protection_confirmed, false),
        'selected_total', v_workflow.selected_total,
        'recorded_at', now()
    );

    update public.company_job_workflows
    set execution_timing = v_timing,
        same_day_start_type = p_start_type,
        same_day_start_reason = v_reason,
        same_day_start_homeowner_name = v_name,
        same_day_start_homeowner_signature = btrim(p_homeowner_signature),
        same_day_start_acknowledgment = v_ack,
        same_day_start_acknowledged_at = now(),
        same_day_start_technician_confirmed_at = now(),
        same_day_emergency_waiver_signature = case
            when p_start_type = 'emergency_immediate_protection' then btrim(p_emergency_waiver_signature)
            else null
        end,
        same_day_emergency_waived_at = case
            when p_start_type = 'emergency_immediate_protection' then now()
            else null
        end,
        status = 'prework',
        updated_at = now()
    where id = v_workflow.id
    returning * into v_workflow;

    insert into public.company_job_workflow_events(
        workflow_id, company_id, event_type, title, detail, visibility, metadata
    ) values (
        v_workflow.id,
        v_workflow.company_id,
        'start_same_day_work',
        v_title,
        v_detail,
        'homeowner',
        v_ack || jsonb_build_object('start_type', p_start_type)
    );

    return v_workflow;
end;
$$;

revoke all on function public.start_company_job_workflow_same_day(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.start_company_job_workflow_same_day(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) to authenticated;

commit;
