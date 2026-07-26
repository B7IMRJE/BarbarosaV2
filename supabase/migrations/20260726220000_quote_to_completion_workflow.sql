-- Quote acceptance through field completion.
-- The legal notice is snapshotted from company configuration; this migration
-- intentionally does not invent a universal cancellation period.

begin;

create table if not exists public.company_contract_rules (
    company_id uuid primary key references public.companies(id) on delete cascade,
    jurisdiction_label text not null default 'Company-configured jurisdiction',
    cancellation_days integer not null default 3 check (cancellation_days between 0 and 60),
    cancellation_notice_title text not null default 'Notice of right to cancel',
    cancellation_notice_text text not null default 'Review the company-approved cancellation notice before signing.',
    requires_homeowner_acknowledgment boolean not null default true,
    updated_at timestamptz not null default now(),
    updated_by_user_id uuid references auth.users(id) on delete set null
);

create table if not exists public.company_job_workflows (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    estimate_session_id uuid not null unique references public.company_estimate_option_sessions(id) on delete restrict,
    service_request_id uuid,
    schedule_slot_id uuid,
    job_id uuid,
    property_id uuid,
    selected_source_choice_id text,
    selected_option_snapshot jsonb,
    status text not null default 'presenting',
    homeowner_name text,
    homeowner_signature text,
    homeowner_accepted_at timestamptz,
    cancellation_rule_snapshot jsonb,
    cancellation_acknowledged_at timestamptz,
    sold_at timestamptz,
    execution_timing text,
    scheduled_for timestamptz,
    store_name text,
    store_address text,
    issue_summary text,
    resolution_summary text,
    technician_completed_at timestamptz,
    completion_homeowner_name text,
    completion_homeowner_signature text,
    completion_accepted_at timestamptz,
    invoice_sent_at timestamptz,
    payment_status text not null default 'not_requested',
    created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_job_workflows_status_check check (status in (
        'presenting', 'accepted', 'sold', 'scheduled_later', 'prework',
        'store_trip', 'returning_to_job', 'work_in_progress', 'issue_found',
        'work_complete', 'customer_completed', 'invoice_sent', 'collection_pending', 'closed'
    )),
    constraint company_job_workflows_execution_check check (execution_timing is null or execution_timing in ('now', 'later')),
    constraint company_job_workflows_payment_check check (payment_status in (
        'not_requested', 'invoice_sent', 'collection_pending', 'collected_externally', 'waived'
    ))
);

create index if not exists company_job_workflows_request_idx
    on public.company_job_workflows(company_id, service_request_id, updated_at desc);

create table if not exists public.company_job_workflow_events (
    id uuid primary key default gen_random_uuid(),
    workflow_id uuid not null references public.company_job_workflows(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    event_type text not null,
    title text not null,
    detail text,
    visibility text not null default 'company' check (visibility in ('company', 'homeowner')),
    metadata jsonb not null default '{}'::jsonb,
    created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now()
);

create index if not exists company_job_workflow_events_workflow_idx
    on public.company_job_workflow_events(workflow_id, created_at);

create table if not exists public.company_job_workflow_attachments (
    id uuid primary key default gen_random_uuid(),
    workflow_id uuid not null references public.company_job_workflows(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    stage text not null check (stage in ('before', 'receipt', 'purchased_item', 'issue', 'after')),
    visibility text not null check (visibility in ('company', 'homeowner')),
    bucket text not null default 'company-job-files',
    storage_path text not null unique,
    file_name text not null,
    mime_type text,
    size_bytes bigint,
    caption text,
    created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now()
);

alter table public.company_contract_rules enable row level security;
alter table public.company_job_workflows enable row level security;
alter table public.company_job_workflow_events enable row level security;
alter table public.company_job_workflow_attachments enable row level security;

do $$
declare
    v_table text;
begin
    foreach v_table in array array[
        'company_contract_rules',
        'company_job_workflows',
        'company_job_workflow_events',
        'company_job_workflow_attachments'
    ]
    loop
        execute format('drop policy if exists %I on public.%I', v_table || '_company_users', v_table);
        execute format(
            'create policy %I on public.%I for all to authenticated using (public.company_estimate_options_can_use(company_id)) with check (public.company_estimate_options_can_use(company_id))',
            v_table || '_company_users',
            v_table
        );
    end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-job-files', 'company-job-files', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_job_files_company_users_select on storage.objects;
create policy company_job_files_company_users_select
on storage.objects for select to authenticated
using (
    bucket_id = 'company-job-files'
    and public.company_estimate_options_can_use(nullif((storage.foldername(name))[2], '')::uuid)
);

drop policy if exists company_job_files_company_users_insert on storage.objects;
create policy company_job_files_company_users_insert
on storage.objects for insert to authenticated
with check (
    bucket_id = 'company-job-files'
    and public.company_estimate_options_can_use(nullif((storage.foldername(name))[2], '')::uuid)
);

drop policy if exists company_job_files_company_users_delete on storage.objects;
create policy company_job_files_company_users_delete
on storage.objects for delete to authenticated
using (
    bucket_id = 'company-job-files'
    and public.company_estimate_options_can_use(nullif((storage.foldername(name))[2], '')::uuid)
);

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
    on conflict (estimate_session_id) do update set updated_at = now()
    returning * into v_workflow;

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

create or replace function public.advance_company_job_workflow(
    p_workflow_id uuid,
    p_action text,
    p_payload jsonb default '{}'::jsonb
)
returns public.company_job_workflows
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_option jsonb;
    v_rule jsonb;
    v_title text;
    v_detail text;
    v_visibility text := 'company';
    v_required integer;
    v_actual integer;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_workflow from public.company_job_workflows
    where id = p_workflow_id for update;
    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;

    if p_action = 'accept_quote' then
        select option.choice_snapshot into v_option
        from public.company_estimate_options option
        where option.session_id = v_workflow.estimate_session_id
          and option.source_choice_id = nullif(btrim(p_payload->>'selected_choice_id'), '');
        if v_option is null then raise exception 'Select a valid presented option.'; end if;
        if nullif(btrim(p_payload->>'homeowner_name'), '') is null
           or nullif(btrim(p_payload->>'signature'), '') is null then
            raise exception 'Homeowner name and signature are required.';
        end if;
        select coalesce(to_jsonb(rule), jsonb_build_object(
            'jurisdiction_label', 'Company configuration required',
            'cancellation_days', 3,
            'cancellation_notice_title', 'Notice of right to cancel',
            'cancellation_notice_text', 'Review the company-approved cancellation notice before signing.',
            'requires_homeowner_acknowledgment', true
        )) into v_rule
        from (select v_workflow.company_id as company_id) seed
        left join public.company_contract_rules rule on rule.company_id = seed.company_id;
        if coalesce((v_rule->>'requires_homeowner_acknowledgment')::boolean, true)
           and not coalesce((p_payload->>'cancellation_acknowledged')::boolean, false) then
            raise exception 'The cancellation-right acknowledgment is required.';
        end if;
        update public.company_job_workflows set
            selected_source_choice_id = p_payload->>'selected_choice_id',
            selected_option_snapshot = v_option,
            homeowner_name = btrim(p_payload->>'homeowner_name'),
            homeowner_signature = btrim(p_payload->>'signature'),
            homeowner_accepted_at = now(),
            cancellation_rule_snapshot = v_rule,
            cancellation_acknowledged_at = case when coalesce((p_payload->>'cancellation_acknowledged')::boolean, false) then now() end,
            sold_at = now(),
            status = 'sold',
            updated_at = now()
        where id = v_workflow.id returning * into v_workflow;
        update public.company_estimate_option_sessions
        set status = 'presented', presented_at = now(), updated_at = now()
        where id = v_workflow.estimate_session_id;
        if v_workflow.service_request_id is not null then
            update public.service_requests set status = 'in_progress', updated_at = now()
            where id = v_workflow.service_request_id and company_id = v_workflow.company_id;
        end if;
        v_title := 'Job sold';
        v_detail := format('Homeowner accepted %s.', coalesce(v_option->>'title', 'the selected option'));
        v_visibility := 'homeowner';
    elsif p_action = 'choose_now' then
        if v_workflow.status <> 'sold' then raise exception 'The quote must be accepted first.'; end if;
        update public.company_job_workflows set execution_timing='now', status='prework', updated_at=now()
        where id=v_workflow.id returning * into v_workflow;
        v_title := 'Work approved for today'; v_detail := 'Pre-work documentation is next.'; v_visibility := 'homeowner';
    elsif p_action = 'choose_later' then
        if v_workflow.status <> 'sold' then raise exception 'The quote must be accepted first.'; end if;
        if nullif(p_payload->>'scheduled_for','') is null then raise exception 'Choose a return date and time.'; end if;
        update public.company_job_workflows set execution_timing='later',
            scheduled_for=(p_payload->>'scheduled_for')::timestamptz, status='scheduled_later', updated_at=now()
        where id=v_workflow.id returning * into v_workflow;
        v_title := 'Work scheduled for later'; v_detail := p_payload->>'scheduled_for'; v_visibility := 'homeowner';
    elsif p_action = 'begin_return_visit' then
        if v_workflow.status <> 'scheduled_later' then raise exception 'This job is not waiting for a return visit.'; end if;
        update public.company_job_workflows set status='prework', updated_at=now()
        where id=v_workflow.id returning * into v_workflow;
        v_title := 'Return visit started'; v_detail := 'Pre-work documentation is next.';
    elsif p_action = 'confirm_prework' then
        select count(*) into v_actual from public.company_job_workflow_attachments
        where workflow_id=v_workflow.id and stage='before';
        if v_actual < 1 or not coalesce((p_payload->>'condition_unchanged')::boolean,false) then
            raise exception 'Add a before photo and confirm the work area condition.';
        end if;
        update public.company_job_workflows set status='work_in_progress', updated_at=now()
        where id=v_workflow.id returning * into v_workflow;
        if v_workflow.schedule_slot_id is not null then
            update public.job_schedule_slots set status='in_progress', updated_at=now()
            where id=v_workflow.schedule_slot_id and company_id=v_workflow.company_id;
        end if;
        v_title := 'Work started'; v_detail := 'Before photos and condition confirmation recorded.'; v_visibility := 'homeowner';
    elsif p_action = 'start_store_trip' then
        if v_workflow.status not in ('prework','work_in_progress','issue_found') then raise exception 'Store trip is not available now.'; end if;
        if nullif(btrim(p_payload->>'store_name'),'') is null then raise exception 'Enter the store destination.'; end if;
        update public.company_job_workflows set store_name=btrim(p_payload->>'store_name'),
            store_address=nullif(btrim(p_payload->>'store_address'),''), status='store_trip', updated_at=now()
        where id=v_workflow.id returning * into v_workflow;
        v_title := 'Technician going to store'; v_detail := v_workflow.store_name; v_visibility := 'homeowner';
    elsif p_action = 'complete_purchase' then
        select count(*) filter (where stage='receipt'), count(*) filter (where stage='purchased_item')
        into v_required, v_actual from public.company_job_workflow_attachments where workflow_id=v_workflow.id;
        if v_required < 1 or v_actual < 1 then raise exception 'Add a receipt photo and a purchased-item photo.'; end if;
        update public.company_job_workflows set status='returning_to_job', updated_at=now()
        where id=v_workflow.id returning * into v_workflow;
        v_title := 'Purchase complete'; v_detail := 'Technician is returning to the job site.'; v_visibility := 'homeowner';
    elsif p_action = 'arrive_from_store' then
        update public.company_job_workflows set status='work_in_progress', updated_at=now()
        where id=v_workflow.id and status='returning_to_job' returning * into v_workflow;
        if not found then raise exception 'The workflow is not returning from a store.'; end if;
        v_title := 'Technician returned'; v_detail := 'Work is in progress.'; v_visibility := 'homeowner';
    elsif p_action = 'report_issue' then
        if nullif(btrim(p_payload->>'issue_summary'),'') is null then raise exception 'Describe the issue found.'; end if;
        update public.company_job_workflows set issue_summary=btrim(p_payload->>'issue_summary'), status='issue_found', updated_at=now()
        where id=v_workflow.id returning * into v_workflow;
        v_title := 'Issue found'; v_detail := v_workflow.issue_summary;
    elsif p_action = 'resume_work' then
        update public.company_job_workflows set resolution_summary=nullif(btrim(p_payload->>'resolution_summary'),''),
            status='work_in_progress', updated_at=now()
        where id=v_workflow.id and status='issue_found' returning * into v_workflow;
        if not found then raise exception 'There is no paused issue to resolve.'; end if;
        v_title := 'Work resumed'; v_detail := v_workflow.resolution_summary;
    elsif p_action = 'complete_work' then
        select count(*) into v_actual from public.company_job_workflow_attachments
        where workflow_id=v_workflow.id and stage='after';
        if v_actual < 1 then raise exception 'Add at least one completed-work photo.'; end if;
        update public.company_job_workflows set technician_completed_at=now(), status='work_complete', updated_at=now()
        where id=v_workflow.id returning * into v_workflow;
        v_title := 'Technician marked work complete'; v_detail := 'Completed-work photos recorded.'; v_visibility := 'homeowner';
    elsif p_action = 'accept_completion' then
        if v_workflow.status <> 'work_complete' then raise exception 'Technician completion is required first.'; end if;
        if nullif(btrim(p_payload->>'homeowner_name'),'') is null or nullif(btrim(p_payload->>'signature'),'') is null then
            raise exception 'Homeowner completion name and signature are required.';
        end if;
        update public.company_job_workflows set completion_homeowner_name=btrim(p_payload->>'homeowner_name'),
            completion_homeowner_signature=btrim(p_payload->>'signature'), completion_accepted_at=now(),
            status='customer_completed', updated_at=now()
        where id=v_workflow.id returning * into v_workflow;
        v_title := 'Completion accepted'; v_detail := 'Homeowner confirmed satisfactory completion.'; v_visibility := 'homeowner';
    elsif p_action = 'send_invoice' then
        if v_workflow.status <> 'customer_completed' then raise exception 'Homeowner completion acceptance is required.'; end if;
        update public.company_job_workflows set invoice_sent_at=now(), payment_status='collection_pending',
            status='collection_pending', updated_at=now()
        where id=v_workflow.id returning * into v_workflow;
        v_title := 'Invoice sent'; v_detail := 'Payment collection remains open for the office or an external terminal.'; v_visibility := 'homeowner';
    elsif p_action = 'record_external_payment' then
        update public.company_job_workflows set payment_status='collected_externally', status='closed', updated_at=now()
        where id=v_workflow.id and status='collection_pending' returning * into v_workflow;
        if not found then raise exception 'Invoice must be sent before payment can be recorded.'; end if;
        v_title := 'Payment recorded'; v_detail := 'Payment was collected outside HomeOS.';
    else
        raise exception 'Unknown workflow action.';
    end if;

    insert into public.company_job_workflow_events(workflow_id, company_id, event_type, title, detail, visibility, metadata)
    values(v_workflow.id, v_workflow.company_id, p_action, v_title, v_detail, v_visibility, p_payload);

    if v_workflow.service_request_id is not null then
        insert into public.service_request_events(
            company_id, service_request_id, property_id, schedule_slot_id,
            event_type, message, event_visibility, audience, metadata, dedupe_key
        ) values (
            v_workflow.company_id, v_workflow.service_request_id, v_workflow.property_id, v_workflow.schedule_slot_id,
            p_action, concat_ws(' — ', v_title, v_detail),
            case when v_visibility='homeowner' then 'homeowner_visible' else 'internal' end,
            case when v_visibility='homeowner' then 'homeowner' else 'internal' end,
            jsonb_build_object('workflow_id',v_workflow.id), p_action || ':' || v_workflow.id::text || ':' || extract(epoch from now())::bigint::text
        );
    end if;

    return v_workflow;
end;
$$;

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
    select * into v_workflow from public.company_job_workflows where id=p_workflow_id;
    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;
    if p_stage not in ('before','receipt','purchased_item','issue','after') then raise exception 'Invalid attachment stage.'; end if;
    if p_storage_path not like 'companies/' || v_workflow.company_id::text || '/workflows/' || v_workflow.id::text || '/%' then
        raise exception 'Attachment path does not match this workflow.';
    end if;
    v_visibility := case when p_stage in ('receipt','purchased_item','issue') then 'company' else 'homeowner' end;
    insert into public.company_job_workflow_attachments(
        workflow_id, company_id, stage, visibility, storage_path, file_name, mime_type, size_bytes, caption
    ) values (
        v_workflow.id, v_workflow.company_id, p_stage, v_visibility, p_storage_path,
        btrim(p_file_name), p_mime_type, p_size_bytes, nullif(btrim(p_caption),'')
    ) returning * into v_attachment;
    return v_attachment;
end;
$$;

revoke all on function public.get_or_create_company_job_workflow(uuid) from public, anon;
revoke all on function public.advance_company_job_workflow(uuid,text,jsonb) from public, anon;
revoke all on function public.record_company_job_workflow_attachment(uuid,text,text,text,text,bigint,text) from public, anon;
grant execute on function public.get_or_create_company_job_workflow(uuid) to authenticated;
grant execute on function public.advance_company_job_workflow(uuid,text,jsonb) to authenticated;
grant execute on function public.record_company_job_workflow_attachment(uuid,text,text,text,text,bigint,text) to authenticated;

commit;
