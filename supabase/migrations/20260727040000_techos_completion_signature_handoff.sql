begin;

create or replace function public.complete_company_job_workflow_from_techos(
    p_workflow_id uuid,
    p_schedule_slot_id uuid
)
returns public.company_job_workflows
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_slot public.job_schedule_slots%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_workflow
    from public.company_job_workflows
    where id=p_workflow_id
    for update;
    if not found then raise exception 'Sold-job workflow not found.'; end if;

    if v_workflow.schedule_slot_id is distinct from p_schedule_slot_id then
        raise exception 'This workflow is not linked to the current technician visit.';
    end if;

    select * into v_slot
    from public.job_schedule_slots
    where id=p_schedule_slot_id and company_id=v_workflow.company_id;
    if not found then raise exception 'Assigned technician visit not found.'; end if;

    if not exists (
        select 1
        from public.company_users cu
        where cu.company_id=v_workflow.company_id
          and cu.auth_user_id=auth.uid()
          and lower(btrim(coalesce(cu.status,'')))='active'
    ) then
        raise exception 'Active company access is required.';
    end if;

    if not exists (
        select 1
        from public.company_users cu
        where cu.company_id=v_workflow.company_id
          and cu.auth_user_id=auth.uid()
          and lower(btrim(coalesce(cu.status,'')))='active'
          and cu.id=v_slot.technician_company_user_id
    ) and not public.can_dispatch_company(v_workflow.company_id) then
        raise exception 'Only the assigned technician or Dispatch can complete this visit.';
    end if;

    if v_workflow.status in ('customer_completed','invoice_sent','collection_pending','closed') then
        return v_workflow;
    end if;

    update public.company_job_workflows
    set technician_completed_at=coalesce(technician_completed_at,now()),
        status='work_complete',
        updated_at=now()
    where id=v_workflow.id
    returning * into v_workflow;

    insert into public.company_job_workflow_events(
        workflow_id,company_id,event_type,title,detail,visibility,metadata
    ) values (
        v_workflow.id,v_workflow.company_id,'techos_complete_successfully',
        'Technician marked work complete',
        'Homeowner satisfactory-completion signature is required.',
        'homeowner',
        jsonb_build_object('schedule_slot_id',p_schedule_slot_id,'source','techos_closeout')
    );

    return v_workflow;
end;
$$;

revoke all on function public.complete_company_job_workflow_from_techos(uuid,uuid) from public,anon;
grant execute on function public.complete_company_job_workflow_from_techos(uuid,uuid) to authenticated;

commit;
