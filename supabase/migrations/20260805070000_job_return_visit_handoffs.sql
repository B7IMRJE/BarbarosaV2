-- Persist a company-only return-visit handoff on the existing sold-job
-- workflow so the next assigned technician receives scope, materials, and
-- field media before traveling to the job.

begin;

do $$
begin
    if to_regclass('public.company_job_workflows') is null
       or to_regclass('public.company_job_workflow_attachments') is null then
        raise exception 'Company job workflows and attachments are required before return handoffs can be installed.';
    end if;

    if to_regprocedure('public.company_estimate_options_can_use(uuid)') is null then
        raise exception 'Company workflow authorization is required before return handoffs can be installed.';
    end if;
end;
$$;

alter table public.company_job_workflows
    add column if not exists return_visit_work_summary text,
    add column if not exists return_visit_remaining_work text,
    add column if not exists return_visit_materials jsonb not null default '[]'::jsonb,
    add column if not exists return_visit_no_materials_needed boolean not null default false,
    add column if not exists return_visit_pickup_notes text,
    add column if not exists return_visit_handoff_at timestamptz,
    add column if not exists return_visit_handoff_by_user_id uuid references auth.users(id) on delete set null;

alter table public.company_job_workflows
    drop constraint if exists company_job_workflows_return_visit_materials_check;
alter table public.company_job_workflows
    add constraint company_job_workflows_return_visit_materials_check check (
        jsonb_typeof(return_visit_materials) = 'array'
        and jsonb_array_length(return_visit_materials) <= 100
    );

alter table public.company_job_workflow_attachments
    drop constraint if exists company_job_workflow_attachments_stage_check;
alter table public.company_job_workflow_attachments
    add constraint company_job_workflow_attachments_stage_check check (
        stage in ('before', 'receipt', 'purchased_item', 'issue', 'handoff', 'after')
    );

update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array[
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'video/mp4',
        'video/quicktime',
        'video/webm'
    ]
where id = 'company-job-files';

create or replace function public.record_company_job_workflow_attachment(
    p_workflow_id uuid,
    p_stage text,
    p_storage_path text,
    p_file_name text,
    p_mime_type text default null,
    p_size_bytes bigint default null,
    p_caption text default null
)
returns public.company_job_workflow_attachments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_attachment public.company_job_workflow_attachments%rowtype;
    v_visibility text;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id;

    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;

    if p_stage not in ('before', 'receipt', 'purchased_item', 'issue', 'handoff', 'after') then
        raise exception 'Invalid attachment stage.';
    end if;

    if p_storage_path not like 'companies/' || v_workflow.company_id::text || '/workflows/' || v_workflow.id::text || '/%' then
        raise exception 'Attachment path does not match this workflow.';
    end if;

    v_visibility := case
        when p_stage in ('receipt', 'purchased_item', 'issue', 'handoff') then 'company'
        else 'homeowner'
    end;

    insert into public.company_job_workflow_attachments(
        workflow_id,
        company_id,
        stage,
        visibility,
        storage_path,
        file_name,
        mime_type,
        size_bytes,
        caption
    ) values (
        v_workflow.id,
        v_workflow.company_id,
        p_stage,
        v_visibility,
        p_storage_path,
        btrim(p_file_name),
        p_mime_type,
        p_size_bytes,
        nullif(btrim(p_caption), '')
    )
    returning * into v_attachment;

    return v_attachment;
end;
$$;

create or replace function public.create_company_job_return_handoff(
    p_workflow_id uuid,
    p_scheduled_for timestamptz,
    p_work_summary text,
    p_remaining_work text,
    p_materials jsonb default '[]'::jsonb,
    p_no_materials_needed boolean default false,
    p_pickup_notes text default null
)
returns public.company_job_workflows
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_materials jsonb := coalesce(p_materials, '[]'::jsonb);
    v_media_count integer := 0;
    v_return_detail text;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id
    for update;

    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;

    if v_workflow.status not in ('prework', 'work_in_progress', 'issue_found') then
        raise exception 'A return handoff can be created only while field work is active or paused.';
    end if;

    if p_scheduled_for is null or p_scheduled_for <= now() then
        raise exception 'Choose a future return date and time.';
    end if;

    if nullif(btrim(coalesce(p_work_summary, '')), '') is null then
        raise exception 'Document the completed work and current site condition.';
    end if;

    if nullif(btrim(coalesce(p_remaining_work, '')), '') is null then
        raise exception 'Document exactly what the next technician or crew must do.';
    end if;

    if jsonb_typeof(v_materials) <> 'array' or jsonb_array_length(v_materials) > 100 then
        raise exception 'Materials must be a list containing no more than 100 items.';
    end if;

    if exists (
        select 1
        from jsonb_array_elements(v_materials) as material(value)
        where jsonb_typeof(material.value) <> 'object'
           or nullif(btrim(material.value->>'name'), '') is null
    ) then
        raise exception 'Every material must have a name.';
    end if;

    if not coalesce(p_no_materials_needed, false) and jsonb_array_length(v_materials) = 0 then
        raise exception 'Add the materials needed or confirm that no materials are needed.';
    end if;

    select count(*)
    into v_media_count
    from public.company_job_workflow_attachments as attachment
    where attachment.workflow_id = v_workflow.id
      and attachment.stage = 'handoff';

    if v_media_count < 1 then
        raise exception 'Add at least one handoff photo or video before scheduling the return visit.';
    end if;

    update public.company_job_workflows
    set scheduled_for = p_scheduled_for,
        return_visit_work_summary = btrim(p_work_summary),
        return_visit_remaining_work = btrim(p_remaining_work),
        return_visit_materials = case
            when coalesce(p_no_materials_needed, false) then '[]'::jsonb
            else v_materials
        end,
        return_visit_no_materials_needed = coalesce(p_no_materials_needed, false),
        return_visit_pickup_notes = nullif(btrim(coalesce(p_pickup_notes, '')), ''),
        return_visit_handoff_at = now(),
        return_visit_handoff_by_user_id = auth.uid(),
        status = 'scheduled_later',
        updated_at = now()
    where id = v_workflow.id
    returning * into v_workflow;

    v_return_detail := 'Return visit scheduled for ' || p_scheduled_for::text || '. A technician handoff is attached.';

    insert into public.company_job_workflow_events(
        workflow_id,
        company_id,
        event_type,
        title,
        detail,
        visibility,
        metadata
    ) values (
        v_workflow.id,
        v_workflow.company_id,
        'create_return_handoff',
        'Return visit handoff saved',
        v_return_detail,
        'company',
        jsonb_build_object(
            'scheduled_for', p_scheduled_for,
            'material_count', jsonb_array_length(v_workflow.return_visit_materials),
            'media_count', v_media_count
        )
    );

    if v_workflow.service_request_id is not null then
        insert into public.service_request_events(
            company_id,
            service_request_id,
            property_id,
            schedule_slot_id,
            event_type,
            message,
            event_visibility,
            audience,
            metadata,
            dedupe_key
        ) values (
            v_workflow.company_id,
            v_workflow.service_request_id,
            v_workflow.property_id,
            v_workflow.schedule_slot_id,
            'return_visit_scheduled',
            'A return visit was scheduled for ' || p_scheduled_for::text || '.',
            'homeowner_visible',
            'homeowner',
            jsonb_build_object('workflow_id', v_workflow.id),
            'return_visit_scheduled:' || v_workflow.id::text || ':' || extract(epoch from now())::bigint::text
        );
    end if;

    return v_workflow;
end;
$$;

revoke all on function public.record_company_job_workflow_attachment(uuid,text,text,text,text,bigint,text) from public, anon;
revoke all on function public.create_company_job_return_handoff(uuid,timestamptz,text,text,jsonb,boolean,text) from public, anon;
grant execute on function public.record_company_job_workflow_attachment(uuid,text,text,text,text,bigint,text) to authenticated;
grant execute on function public.create_company_job_return_handoff(uuid,timestamptz,text,text,jsonb,boolean,text) to authenticated;

commit;
