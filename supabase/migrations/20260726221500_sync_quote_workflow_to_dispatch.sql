-- Keep the existing Dispatch lanes useful while the richer job workflow records
-- the precise field state. This also repairs the initial sold transition, which
-- briefly used the legacy converted_to_job terminal request status.

begin;

create or replace function public.sync_company_job_workflow_to_dispatch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_dispatch_status text;
begin
    select * into v_workflow
    from public.company_job_workflows
    where id = nullif(new.metadata->>'workflow_id', '')::uuid;

    if not found then return new; end if;

    v_dispatch_status := case
        when v_workflow.status = 'scheduled_later' then 'scheduled'
        when v_workflow.status = 'prework' then 'arrived'
        when v_workflow.status in ('store_trip', 'returning_to_job') then 'on_my_way'
        when v_workflow.status = 'issue_found' then 'estimate_needed'
        when v_workflow.status in ('work_complete', 'customer_completed', 'invoice_sent', 'collection_pending', 'closed') then 'completed'
        else 'in_progress'
    end;

    if v_workflow.service_request_id is not null then
        update public.service_requests
        set status = case
                when v_dispatch_status = 'completed' then 'completed'
                when v_dispatch_status = 'scheduled' then 'scheduled'
                else 'in_progress'
            end,
            updated_at = now()
        where id = v_workflow.service_request_id
          and company_id = v_workflow.company_id;
    end if;

    if v_workflow.schedule_slot_id is not null then
        update public.job_schedule_slots
        set status = v_dispatch_status,
            tech_status_note = case v_workflow.status
                when 'store_trip' then 'Going to ' || coalesce(v_workflow.store_name, 'store')
                when 'returning_to_job' then 'Purchase complete — returning to job site'
                when 'issue_found' then 'Issue found — review needed'
                when 'collection_pending' then 'Work complete — office collection pending'
                else tech_status_note
            end,
            updated_at = now()
        where id = v_workflow.schedule_slot_id
          and company_id = v_workflow.company_id;
    end if;

    return new;
end;
$$;

drop trigger if exists service_request_events_sync_job_workflow_dispatch on public.service_request_events;
create trigger service_request_events_sync_job_workflow_dispatch
after insert on public.service_request_events
for each row
when ((new.metadata->>'workflow_id') is not null)
execute function public.sync_company_job_workflow_to_dispatch();

commit;
