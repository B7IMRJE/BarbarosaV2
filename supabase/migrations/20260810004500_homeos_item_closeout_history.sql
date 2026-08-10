-- Keep a linked HomeOS item as the permanent equipment/component record while
-- TechOS remains the transactional job record. The technician reviews one
-- compact draft; the item/history update is committed atomically when work is
-- marked complete.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.company_job_workflows') is null
       or to_regclass('public.company_estimate_option_sessions') is null
       or to_regclass('public.company_job_workflow_attachments') is null then
        raise exception 'HomeOS items and the TechOS job workflow are required before item closeout history can be installed.';
    end if;
end;
$$;

alter table public.home_items
    add column if not exists condition text,
    add column if not exists installed_on date,
    add column if not exists installed_by_company_id uuid references public.companies(id) on delete set null,
    add column if not exists installed_by_technician_user_id uuid references auth.users(id) on delete set null,
    add column if not exists part_number text,
    add column if not exists installation_notes text,
    add column if not exists replaced_on date,
    add column if not exists replaced_by_home_item_id uuid references public.home_items(id) on delete set null,
    add column if not exists replaces_home_item_id uuid references public.home_items(id) on delete set null;

alter table public.home_items
    drop constraint if exists home_items_condition_check;
alter table public.home_items
    add constraint home_items_condition_check check (
        condition is null
        or condition in ('Newly Installed', 'Good', 'Fair', 'Needs Attention', 'Failed', 'Unknown')
    ) not valid;

alter table public.company_job_workflows
    add column if not exists home_item_id uuid references public.home_items(id) on delete set null,
    add column if not exists completed_home_item_id uuid references public.home_items(id) on delete set null,
    add column if not exists homeos_item_update_payload jsonb,
    add column if not exists homeos_item_update_reviewed_at timestamptz,
    add column if not exists homeos_item_update_reviewed_by_user_id uuid references auth.users(id) on delete set null;

update public.company_job_workflows as workflow
set home_item_id = session.home_item_id
from public.company_estimate_option_sessions as session
join public.home_items as item
  on item.id = session.home_item_id
 and item.property_id = session.property_id
where workflow.estimate_session_id = session.id
  and workflow.home_item_id is null
  and session.home_item_id is not null;

create index if not exists company_job_workflows_home_item_idx
    on public.company_job_workflows(home_item_id, updated_at desc)
    where home_item_id is not null;

create table if not exists public.home_item_service_history (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid not null references public.home_items(id) on delete cascade,
    previous_home_item_id uuid references public.home_items(id) on delete set null,
    workflow_id uuid not null references public.company_job_workflows(id) on delete restrict,
    company_id uuid not null references public.companies(id) on delete restrict,
    technician_user_id uuid references auth.users(id) on delete set null,
    service_request_id uuid,
    estimate_session_id uuid references public.company_estimate_option_sessions(id) on delete set null,
    job_id uuid,
    schedule_slot_id uuid,
    entry_type text not null check (entry_type in (
        'installation', 'repair', 'replacement_installation', 'replacement_retired'
    )),
    completion_date date not null,
    company_name text,
    technician_name text,
    original_problem text,
    findings text,
    recommended_work text,
    approved_scope jsonb not null default '[]'::jsonb check (jsonb_typeof(approved_scope) = 'array'),
    work_performed text,
    installation_notes text,
    brand text,
    model text,
    serial_number text,
    part_number text,
    estimate_reference text,
    invoice_reference text,
    completion_homeowner_name text,
    completion_accepted_at timestamptz,
    customer_signature_recorded boolean not null default false,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (workflow_id, home_item_id, entry_type)
);

create index if not exists home_item_service_history_item_date_idx
    on public.home_item_service_history(home_item_id, completion_date desc, created_at desc);
create index if not exists home_item_service_history_workflow_idx
    on public.home_item_service_history(workflow_id);

create table if not exists public.home_item_warranties (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid not null references public.home_items(id) on delete cascade,
    service_history_id uuid not null references public.home_item_service_history(id) on delete cascade,
    workflow_id uuid not null references public.company_job_workflows(id) on delete restrict,
    warranty_type text not null check (warranty_type in ('workmanship', 'labor', 'manufacturer_parts')),
    coverage_kind text not null check (coverage_kind in (
        '1_year', '2_years', '5_years', '10_years',
        'limited_lifetime', 'lifetime', 'custom', 'unknown_verify_later'
    )),
    duration_value integer,
    duration_unit text check (duration_unit is null or duration_unit in ('day', 'month', 'year')),
    start_date date not null,
    expiration_date date,
    custom_label text,
    notes text,
    verification_status text not null default 'technician_entered' check (
        verification_status in ('technician_entered', 'verified', 'unknown', 'verify_later')
    ),
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (service_history_id, warranty_type),
    check (expiration_date is null or expiration_date >= start_date)
);

create index if not exists home_item_warranties_item_idx
    on public.home_item_warranties(home_item_id, start_date desc);

create table if not exists public.home_item_service_history_attachments (
    service_history_id uuid not null references public.home_item_service_history(id) on delete cascade,
    workflow_attachment_id uuid not null references public.company_job_workflow_attachments(id) on delete restrict,
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid not null references public.home_items(id) on delete cascade,
    media_role text not null,
    created_at timestamptz not null default now(),
    primary key (service_history_id, workflow_attachment_id)
);

create index if not exists home_item_service_history_attachments_item_idx
    on public.home_item_service_history_attachments(home_item_id, created_at desc);

create table if not exists public.home_item_warranty_attachments (
    warranty_id uuid not null references public.home_item_warranties(id) on delete cascade,
    workflow_attachment_id uuid not null references public.company_job_workflow_attachments(id) on delete restrict,
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid not null references public.home_items(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (warranty_id, workflow_attachment_id)
);

create table if not exists public.home_item_replacements (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    old_home_item_id uuid not null references public.home_items(id) on delete restrict,
    new_home_item_id uuid not null references public.home_items(id) on delete restrict,
    workflow_id uuid not null unique references public.company_job_workflows(id) on delete restrict,
    replaced_on date not null,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    check (old_home_item_id <> new_home_item_id)
);

create index if not exists home_item_replacements_old_idx on public.home_item_replacements(old_home_item_id);
create index if not exists home_item_replacements_new_idx on public.home_item_replacements(new_home_item_id);

-- Future-ready extraction sources. Current closeout only stores the source and
-- technician-confirmed values; no AI request is made by this migration.
create table if not exists public.home_item_identification_sources (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid not null references public.home_items(id) on delete cascade,
    service_history_id uuid references public.home_item_service_history(id) on delete cascade,
    workflow_attachment_id uuid not null references public.company_job_workflow_attachments(id) on delete restrict,
    capture_type text not null check (capture_type in (
        'product_box', 'model_label', 'serial_label', 'manual', 'warranty_card', 'product_information'
    )),
    extraction_status text not null default 'not_requested' check (
        extraction_status in ('not_requested', 'pending', 'extracted', 'confirmed', 'rejected', 'failed')
    ),
    extracted_values jsonb,
    confirmed_values jsonb,
    confirmed_by_user_id uuid references auth.users(id) on delete set null,
    confirmed_at timestamptz,
    created_at timestamptz not null default now(),
    unique (workflow_attachment_id, capture_type)
);

alter table public.company_job_workflows
    add column if not exists homeos_item_history_id uuid references public.home_item_service_history(id) on delete set null;

alter table public.company_job_workflow_attachments
    drop constraint if exists company_job_workflow_attachments_stage_check;
alter table public.company_job_workflow_attachments
    add constraint company_job_workflow_attachments_stage_check check (
        stage in ('before', 'receipt', 'purchased_item', 'issue', 'handoff', 'during', 'after', 'warranty')
    );

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

    if p_stage not in ('before', 'receipt', 'purchased_item', 'issue', 'handoff', 'during', 'after', 'warranty') then
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
        workflow_id, company_id, stage, visibility, storage_path,
        file_name, mime_type, size_bytes, caption
    ) values (
        v_workflow.id, v_workflow.company_id, p_stage, v_visibility, p_storage_path,
        btrim(p_file_name), p_mime_type, p_size_bytes, nullif(btrim(coalesce(p_caption, '')), '')
    ) returning * into v_attachment;

    return v_attachment;
end;
$$;

create or replace function public.sync_company_job_workflow_home_item()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session_item_id uuid;
    v_item_property_id uuid;
begin
    if new.home_item_id is null then
        select session.home_item_id
        into v_session_item_id
        from public.company_estimate_option_sessions as session
        where session.id = new.estimate_session_id;

        new.home_item_id := v_session_item_id;
    end if;

    if new.home_item_id is not null then
        select item.property_id into v_item_property_id
        from public.home_items as item
        where item.id = new.home_item_id;

        if v_item_property_id is null or new.property_id is distinct from v_item_property_id then
            raise exception 'The HomeOS item does not belong to this job property.';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists company_job_workflows_sync_home_item on public.company_job_workflows;
create trigger company_job_workflows_sync_home_item
before insert or update of estimate_session_id, home_item_id, property_id
on public.company_job_workflows
for each row execute function public.sync_company_job_workflow_home_item();

create or replace function public.propagate_estimate_home_item_to_job()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if new.home_item_id is not null then
        update public.company_job_workflows
        set home_item_id = new.home_item_id,
            updated_at = now()
        where estimate_session_id = new.id
          and home_item_id is null;
    end if;
    return new;
end;
$$;

drop trigger if exists company_estimate_sessions_propagate_home_item
    on public.company_estimate_option_sessions;
create trigger company_estimate_sessions_propagate_home_item
after insert or update of home_item_id on public.company_estimate_option_sessions
for each row execute function public.propagate_estimate_home_item_to_job();

create or replace function public.get_company_job_homeos_closeout(p_workflow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_item public.home_items%rowtype;
    v_scope jsonb := '[]'::jsonb;
    v_counts jsonb := '{}'::jsonb;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id;

    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;

    if v_workflow.home_item_id is not null then
        select * into v_item
        from public.home_items
        where id = v_workflow.home_item_id
          and property_id = v_workflow.property_id;
    end if;

    select coalesce(jsonb_agg(coalesce(option_value->>'title', 'Approved work') order by ordinal), '[]'::jsonb)
    into v_scope
    from jsonb_array_elements(
        case
            when jsonb_typeof(v_workflow.selected_options_snapshot) = 'array'
                then v_workflow.selected_options_snapshot
            when v_workflow.selected_option_snapshot is not null
                then jsonb_build_array(v_workflow.selected_option_snapshot)
            else '[]'::jsonb
        end
    ) with ordinality as option(option_value, ordinal);

    select coalesce(jsonb_object_agg(stage, stage_count), '{}'::jsonb)
    into v_counts
    from (
        select attachment.stage, count(*)::integer as stage_count
        from public.company_job_workflow_attachments as attachment
        where attachment.workflow_id = v_workflow.id
        group by attachment.stage
    ) as counts;

    return jsonb_build_object(
        'linked', v_item.id is not null,
        'workflow_id', v_workflow.id,
        'home_item_id', v_item.id,
        'item', case when v_item.id is null then null else jsonb_build_object(
            'id', v_item.id,
            'name', v_item.name,
            'system', v_item.system,
            'category', v_item.category,
            'location', v_item.location,
            'parent_area', v_item.parent_area,
            'status', v_item.status,
            'condition', v_item.condition,
            'install_state', v_item.install_state,
            'installed_on', v_item.installed_on,
            'brand', v_item.brand,
            'model', v_item.model,
            'serial_number', v_item.serial,
            'part_number', v_item.part_number,
            'installation_notes', v_item.installation_notes
        ) end,
        'draft', v_workflow.homeos_item_update_payload,
        'approved_scope', v_scope,
        'attachment_counts', v_counts
    );
end;
$$;

create or replace function public.save_company_job_homeos_closeout(
    p_workflow_id uuid,
    p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_item public.home_items%rowtype;
    v_completion_type text := nullif(btrim(coalesce(p_payload->>'completion_type', '')), '');
    v_condition text := nullif(btrim(coalesce(p_payload->>'condition', '')), '');
    v_installed_on date;
    v_completion_date date;
    v_warranty jsonb;
    v_seen_types text[] := array[]::text[];
    v_normalized jsonb;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if jsonb_typeof(p_payload) <> 'object' then raise exception 'HomeOS item update details are required.'; end if;

    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id
    for update;

    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;
    if v_workflow.status <> 'work_in_progress' then
        raise exception 'Review the HomeOS item update while work is in progress.';
    end if;
    if v_workflow.home_item_id is null then
        raise exception 'This job is not linked to a HomeOS item.';
    end if;

    select * into v_item
    from public.home_items
    where id = v_workflow.home_item_id
      and property_id = v_workflow.property_id
    for update;

    if not found then raise exception 'The linked HomeOS item is unavailable.'; end if;
    if v_completion_type not in ('installed', 'repaired', 'replaced') then
        raise exception 'Choose whether the item was installed, repaired, or replaced.';
    end if;
    if v_condition not in ('Newly Installed', 'Good', 'Fair', 'Needs Attention', 'Failed', 'Unknown') then
        raise exception 'Choose the item condition.';
    end if;
    if nullif(btrim(coalesce(p_payload->>'item_name', '')), '') is null then
        raise exception 'Confirm the item name.';
    end if;
    if nullif(btrim(coalesce(p_payload->>'work_performed', '')), '') is null then
        raise exception 'Describe the work performed.';
    end if;

    begin
        v_installed_on := (p_payload->>'installed_on')::date;
    exception when others then
        raise exception 'Enter a valid installation or completion date.';
    end;

    begin
        v_completion_date := coalesce(nullif(p_payload->>'completion_date', '')::date, current_date);
    exception when others then
        raise exception 'Enter a valid completion date.';
    end;

    if jsonb_typeof(coalesce(p_payload->'warranties', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_payload->'warranties', '[]'::jsonb)) > 3 then
        raise exception 'Warranty details must contain the three supported warranty types.';
    end if;

    for v_warranty in
        select value from jsonb_array_elements(coalesce(p_payload->'warranties', '[]'::jsonb))
    loop
        if v_warranty->>'warranty_type' not in ('workmanship', 'labor', 'manufacturer_parts') then
            raise exception 'Invalid warranty type.';
        end if;
        if v_warranty->>'coverage_kind' not in (
            '1_year', '2_years', '5_years', '10_years',
            'limited_lifetime', 'lifetime', 'custom', 'unknown_verify_later'
        ) then
            raise exception 'Choose a supported warranty duration.';
        end if;
        if (v_warranty->>'warranty_type') = any(v_seen_types) then
            raise exception 'Each warranty type can only be entered once.';
        end if;
        v_seen_types := array_append(v_seen_types, v_warranty->>'warranty_type');
    end loop;

    v_normalized := jsonb_build_object(
        'completion_type', v_completion_type,
        'item_name', btrim(p_payload->>'item_name'),
        'status', 'Installed',
        'condition', v_condition,
        'completion_date', v_completion_date,
        'installed_on', v_installed_on,
        'brand', nullif(btrim(coalesce(p_payload->>'brand', '')), ''),
        'model', nullif(btrim(coalesce(p_payload->>'model', '')), ''),
        'serial_number', nullif(btrim(coalesce(p_payload->>'serial_number', '')), ''),
        'part_number', nullif(btrim(coalesce(p_payload->>'part_number', '')), ''),
        'work_performed', btrim(p_payload->>'work_performed'),
        'installation_notes', nullif(btrim(coalesce(p_payload->>'installation_notes', '')), ''),
        'warranties', coalesce(p_payload->'warranties', '[]'::jsonb)
    );

    update public.company_job_workflows
    set homeos_item_update_payload = v_normalized,
        homeos_item_update_reviewed_at = now(),
        homeos_item_update_reviewed_by_user_id = auth.uid(),
        updated_at = now()
    where id = v_workflow.id;

    return public.get_company_job_homeos_closeout(v_workflow.id);
end;
$$;

create or replace function public.apply_company_job_homeos_closeout(p_workflow_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_old_item public.home_items%rowtype;
    v_target_item public.home_items%rowtype;
    v_payload jsonb;
    v_completion_type text;
    v_installed_on date;
    v_completion_date date;
    v_scope jsonb := '[]'::jsonb;
    v_recommended_work text;
    v_estimate_reference text;
    v_original_problem text;
    v_company_name text;
    v_technician_name text;
    v_history public.home_item_service_history%rowtype;
    v_old_history public.home_item_service_history%rowtype;
    v_warranty jsonb;
    v_warranty_row public.home_item_warranties%rowtype;
    v_duration integer;
    v_new_slug text;
begin
    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id
    for update;

    if not found or v_workflow.status <> 'work_complete' then
        raise exception 'The job must be marked complete before HomeOS is updated.';
    end if;
    if v_workflow.home_item_id is null then
        return jsonb_build_object('linked', false);
    end if;
    if v_workflow.homeos_item_update_reviewed_at is null
       or v_workflow.homeos_item_update_payload is null then
        raise exception 'Review and confirm the HomeOS item update before completing this linked job.';
    end if;

    v_payload := v_workflow.homeos_item_update_payload;
    v_completion_type := v_payload->>'completion_type';
    v_installed_on := (v_payload->>'installed_on')::date;
    v_completion_date := coalesce(nullif(v_payload->>'completion_date', '')::date, v_installed_on);

    select * into v_old_item
    from public.home_items
    where id = v_workflow.home_item_id
      and property_id = v_workflow.property_id
    for update;

    if not found then raise exception 'The linked HomeOS item is unavailable.'; end if;

    select coalesce(jsonb_agg(option_value order by ordinal), '[]'::jsonb)
    into v_scope
    from jsonb_array_elements(
        case
            when jsonb_typeof(v_workflow.selected_options_snapshot) = 'array'
                then v_workflow.selected_options_snapshot
            when v_workflow.selected_option_snapshot is not null
                then jsonb_build_array(v_workflow.selected_option_snapshot)
            else '[]'::jsonb
        end
    ) with ordinality as option(option_value, ordinal);

    select string_agg(coalesce(option_value->>'title', option_value->>'short_summary'), ', ' order by ordinal)
    into v_recommended_work
    from jsonb_array_elements(v_scope) with ordinality as option(option_value, ordinal);

    select request.issue_summary
    into v_original_problem
    from public.service_requests as request
    where request.id = v_workflow.service_request_id
      and request.company_id = v_workflow.company_id;

    select session.quote_number
    into v_estimate_reference
    from public.company_estimate_option_sessions as session
    where session.id = v_workflow.estimate_session_id;

    select coalesce(nullif(btrim(company.public_name), ''), nullif(btrim(company.dba_name), ''), nullif(btrim(company.name), ''))
    into v_company_name
    from public.companies as company
    where company.id = v_workflow.company_id;

    select coalesce(nullif(btrim(company_user.full_name), ''), nullif(btrim(company_user.email), ''))
    into v_technician_name
    from public.company_users as company_user
    where company_user.company_id = v_workflow.company_id
      and company_user.auth_user_id = v_workflow.homeos_item_update_reviewed_by_user_id
    order by company_user.created_at asc
    limit 1;

    if v_completion_type = 'replaced' then
        update public.home_items
        set status = 'Replaced',
            replaced_on = v_installed_on,
            archived = true
        where id = v_old_item.id;

        v_new_slug := trim(both '-' from lower(regexp_replace(
            coalesce(v_old_item.item_slug, v_payload->>'item_name', 'home-item'),
            '[^a-zA-Z0-9]+', '-', 'g'
        ))) || '-replacement-' || to_char(v_installed_on, 'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

        insert into public.home_items(
            user_id, property_id, item_slug, name, system, category, parent_area,
            install_state, status, condition, location, about, brand, model, serial,
            part_number, installed_on, install_date, installed_by_company_id,
            installed_by_technician_user_id, installation_notes, archived,
            replaces_home_item_id
        ) values (
            v_old_item.user_id, v_old_item.property_id, v_new_slug, v_payload->>'item_name',
            v_old_item.system, v_old_item.category, v_old_item.parent_area,
            'Installed', 'Installed', coalesce(v_payload->>'condition', 'Newly Installed'),
            v_old_item.location, coalesce(v_payload->>'installation_notes', v_old_item.about),
            coalesce(v_payload->>'brand', 'Unknown'), coalesce(v_payload->>'model', 'Unknown'),
            coalesce(v_payload->>'serial_number', 'Unknown'), v_payload->>'part_number',
            v_installed_on, v_installed_on::text, v_workflow.company_id,
            v_workflow.homeos_item_update_reviewed_by_user_id, v_payload->>'installation_notes',
            false, v_old_item.id
        ) returning * into v_target_item;

        update public.home_items
        set replaced_by_home_item_id = v_target_item.id
        where id = v_old_item.id;

        insert into public.home_item_replacements(
            property_id, old_home_item_id, new_home_item_id, workflow_id,
            replaced_on, created_by_user_id
        ) values (
            v_workflow.property_id, v_old_item.id, v_target_item.id, v_workflow.id,
            v_installed_on, v_workflow.homeos_item_update_reviewed_by_user_id
        ) on conflict (workflow_id) do nothing;

        insert into public.home_item_service_history(
            property_id, home_item_id, previous_home_item_id, workflow_id, company_id,
            technician_user_id, service_request_id, estimate_session_id, job_id,
            schedule_slot_id, entry_type, completion_date, company_name, technician_name,
            original_problem, findings, recommended_work, approved_scope, work_performed,
            installation_notes, brand, model, serial_number, part_number,
            estimate_reference, created_by_user_id
        ) values (
            v_workflow.property_id, v_old_item.id, null, v_workflow.id, v_workflow.company_id,
            v_workflow.homeos_item_update_reviewed_by_user_id, v_workflow.service_request_id,
            v_workflow.estimate_session_id, v_workflow.job_id, v_workflow.schedule_slot_id,
            'replacement_retired', v_completion_date, v_company_name, v_technician_name,
            v_original_problem, v_workflow.issue_summary, v_recommended_work, v_scope,
            v_payload->>'work_performed', v_payload->>'installation_notes',
            v_old_item.brand, v_old_item.model, v_old_item.serial, v_old_item.part_number,
            coalesce(v_estimate_reference, v_workflow.estimate_session_id::text), v_workflow.homeos_item_update_reviewed_by_user_id
        )
        on conflict (workflow_id, home_item_id, entry_type) do update
        set updated_at = now()
        returning * into v_old_history;
    else
        v_target_item := v_old_item;

        update public.home_items
        set status = case when v_completion_type = 'installed' then 'Installed' else coalesce(nullif(status, ''), 'Installed') end,
            install_state = case when v_completion_type = 'installed' then 'Installed' else install_state end,
            condition = v_payload->>'condition',
            installed_on = case when v_completion_type = 'installed' then v_installed_on else coalesce(installed_on, v_installed_on) end,
            install_date = case when v_completion_type = 'installed' then v_installed_on::text else coalesce(install_date, v_installed_on::text) end,
            installed_by_company_id = case when v_completion_type = 'installed' then v_workflow.company_id else installed_by_company_id end,
            installed_by_technician_user_id = case when v_completion_type = 'installed' then v_workflow.homeos_item_update_reviewed_by_user_id else installed_by_technician_user_id end,
            brand = coalesce(v_payload->>'brand', brand),
            model = coalesce(v_payload->>'model', model),
            serial = coalesce(v_payload->>'serial_number', serial),
            part_number = coalesce(v_payload->>'part_number', part_number),
            installation_notes = coalesce(v_payload->>'installation_notes', installation_notes),
            archived = false
        where id = v_target_item.id
        returning * into v_target_item;
    end if;

    insert into public.home_item_service_history(
        property_id, home_item_id, previous_home_item_id, workflow_id, company_id,
        technician_user_id, service_request_id, estimate_session_id, job_id,
        schedule_slot_id, entry_type, completion_date, company_name, technician_name,
        original_problem, findings, recommended_work, approved_scope, work_performed,
        installation_notes, brand, model, serial_number, part_number,
        estimate_reference, created_by_user_id
    ) values (
        v_workflow.property_id, v_target_item.id,
        case when v_completion_type = 'replaced' then v_old_item.id else null end,
        v_workflow.id, v_workflow.company_id,
        v_workflow.homeos_item_update_reviewed_by_user_id, v_workflow.service_request_id,
        v_workflow.estimate_session_id, v_workflow.job_id, v_workflow.schedule_slot_id,
        case
            when v_completion_type = 'replaced' then 'replacement_installation'
            when v_completion_type = 'installed' then 'installation'
            else 'repair'
        end,
        v_completion_date, v_company_name, v_technician_name, v_original_problem,
        v_workflow.issue_summary, v_recommended_work, v_scope,
        v_payload->>'work_performed', v_payload->>'installation_notes',
        v_target_item.brand, v_target_item.model, v_target_item.serial, v_target_item.part_number,
        coalesce(v_estimate_reference, v_workflow.estimate_session_id::text), v_workflow.homeos_item_update_reviewed_by_user_id
    )
    on conflict (workflow_id, home_item_id, entry_type) do update
    set work_performed = excluded.work_performed,
        installation_notes = excluded.installation_notes,
        brand = excluded.brand,
        model = excluded.model,
        serial_number = excluded.serial_number,
        part_number = excluded.part_number,
        updated_at = now()
    returning * into v_history;

    for v_warranty in
        select value from jsonb_array_elements(coalesce(v_payload->'warranties', '[]'::jsonb))
    loop
        v_duration := case v_warranty->>'coverage_kind'
            when '1_year' then 1
            when '2_years' then 2
            when '5_years' then 5
            when '10_years' then 10
            else null
        end;

        insert into public.home_item_warranties(
            property_id, home_item_id, service_history_id, workflow_id,
            warranty_type, coverage_kind, duration_value, duration_unit,
            start_date, expiration_date, custom_label, notes, verification_status,
            created_by_user_id
        ) values (
            v_workflow.property_id, v_target_item.id, v_history.id, v_workflow.id,
            v_warranty->>'warranty_type', v_warranty->>'coverage_kind', v_duration,
            case when v_duration is null then null else 'year' end,
            coalesce(nullif(v_warranty->>'start_date', '')::date, v_installed_on),
            nullif(v_warranty->>'expiration_date', '')::date,
            nullif(btrim(coalesce(v_warranty->>'custom_label', '')), ''),
            nullif(btrim(coalesce(v_warranty->>'notes', '')), ''),
            coalesce(nullif(v_warranty->>'verification_status', ''), 'technician_entered'),
            v_workflow.homeos_item_update_reviewed_by_user_id
        )
        on conflict (service_history_id, warranty_type) do update
        set coverage_kind = excluded.coverage_kind,
            duration_value = excluded.duration_value,
            duration_unit = excluded.duration_unit,
            start_date = excluded.start_date,
            expiration_date = excluded.expiration_date,
            custom_label = excluded.custom_label,
            notes = excluded.notes,
            verification_status = excluded.verification_status,
            updated_at = now()
        returning * into v_warranty_row;

        if v_warranty_row.warranty_type = 'manufacturer_parts' then
            insert into public.home_item_warranty_attachments(
                warranty_id, workflow_attachment_id, property_id, home_item_id
            )
            select v_warranty_row.id, attachment.id, v_workflow.property_id, v_target_item.id
            from public.company_job_workflow_attachments as attachment
            where attachment.workflow_id = v_workflow.id
              and attachment.stage = 'warranty'
            on conflict do nothing;
        end if;
    end loop;

    insert into public.home_item_service_history_attachments(
        service_history_id, workflow_attachment_id, property_id, home_item_id, media_role
    )
    select
        case
            when v_completion_type = 'replaced'
             and attachment.stage in ('before', 'issue')
             and v_old_history.id is not null
                then v_old_history.id
            else v_history.id
        end,
        attachment.id,
        v_workflow.property_id,
        case
            when v_completion_type = 'replaced'
             and attachment.stage in ('before', 'issue')
                then v_old_item.id
            else v_target_item.id
        end,
        case attachment.stage
            when 'before' then 'before'
            when 'issue' then 'diagnostic'
            when 'purchased_item' then 'installed_product'
            when 'after' then 'after'
            when 'warranty' then 'warranty_document'
            when 'receipt' then 'receipt'
            when 'handoff' then 'during_work'
            when 'during' then 'during_work'
            else attachment.stage
        end
    from public.company_job_workflow_attachments as attachment
    where attachment.workflow_id = v_workflow.id
    on conflict do nothing;

    insert into public.home_item_identification_sources(
        property_id, home_item_id, service_history_id, workflow_attachment_id, capture_type
    )
    select
        v_workflow.property_id,
        v_target_item.id,
        v_history.id,
        attachment.id,
        case
            when attachment.stage = 'warranty' then 'warranty_card'
            when lower(coalesce(attachment.caption, attachment.file_name, '')) like '%serial%' then 'serial_label'
            when lower(coalesce(attachment.caption, attachment.file_name, '')) like '%model%' then 'model_label'
            when lower(coalesce(attachment.caption, attachment.file_name, '')) like '%box%' then 'product_box'
            else 'product_information'
        end
    from public.company_job_workflow_attachments as attachment
    where attachment.workflow_id = v_workflow.id
      and (
          attachment.stage in ('purchased_item', 'warranty')
          or lower(coalesce(attachment.caption, attachment.file_name, '')) ~ '(serial|model|box|manual|warranty)'
      )
    on conflict do nothing;

    update public.company_job_workflows
    set completed_home_item_id = v_target_item.id,
        homeos_item_history_id = v_history.id,
        updated_at = now()
    where id = v_workflow.id;

    return jsonb_build_object(
        'linked', true,
        'home_item_id', v_target_item.id,
        'history_id', v_history.id,
        'completion_type', v_completion_type
    );
end;
$$;

create or replace function public.sync_company_job_homeos_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if new.status = 'work_complete' and old.status is distinct from new.status and new.home_item_id is not null then
        perform public.apply_company_job_homeos_closeout(new.id);
    end if;

    if new.completion_accepted_at is distinct from old.completion_accepted_at
       and new.completion_accepted_at is not null then
        update public.home_item_service_history
        set completion_homeowner_name = new.completion_homeowner_name,
            completion_accepted_at = new.completion_accepted_at,
            customer_signature_recorded = new.completion_homeowner_signature is not null,
            updated_at = now()
        where workflow_id = new.id;
    end if;

    if new.invoice_sent_at is distinct from old.invoice_sent_at
       and new.invoice_sent_at is not null then
        update public.home_item_service_history
        set invoice_reference = coalesce(invoice_reference, new.id::text),
            updated_at = now()
        where workflow_id = new.id;
    end if;

    return new;
end;
$$;

drop trigger if exists company_job_workflows_sync_homeos_history on public.company_job_workflows;
create trigger company_job_workflows_sync_homeos_history
after update of status, completion_accepted_at, invoice_sent_at
on public.company_job_workflows
for each row execute function public.sync_company_job_homeos_history();

create or replace function public.get_home_item_lifetime_history(
    p_home_item_id uuid,
    p_company_id uuid default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_property_id uuid;
    v_allowed boolean := false;
    v_entries jsonb := '[]'::jsonb;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select item.property_id into v_property_id
    from public.home_items as item
    where item.id = p_home_item_id;

    if v_property_id is null then raise exception 'HomeOS item not found.'; end if;

    v_allowed := public.homeos_can_read_property_record(v_property_id)
        or (
            p_company_id is not null
            and public.homeos_can_read_company_construction_history(
                p_company_id, v_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
            )
        )
        or (
            p_company_id is not null
            and public.homeos_can_read_provider_assigned_items(
                p_company_id, v_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
            )
        );

    if not v_allowed then
        raise exception 'Not authorized to view this item history.' using errcode = '42501';
    end if;

    with recursive item_family(id) as (
        select p_home_item_id
        union
        select replacement.old_home_item_id
        from public.home_item_replacements as replacement
        join item_family on replacement.new_home_item_id = item_family.id
        union
        select replacement.new_home_item_id
        from public.home_item_replacements as replacement
        join item_family on replacement.old_home_item_id = item_family.id
    )
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', history.id,
            'home_item_id', history.home_item_id,
            'previous_home_item_id', history.previous_home_item_id,
            'entry_type', history.entry_type,
            'completion_date', history.completion_date,
            'company_name', history.company_name,
            'technician_name', history.technician_name,
            'original_problem', history.original_problem,
            'findings', history.findings,
            'recommended_work', history.recommended_work,
            'approved_scope', history.approved_scope,
            'work_performed', history.work_performed,
            'installation_notes', history.installation_notes,
            'brand', history.brand,
            'model', history.model,
            'serial_number', history.serial_number,
            'part_number', history.part_number,
            'estimate_reference', history.estimate_reference,
            'invoice_reference', history.invoice_reference,
            'completion_homeowner_name', history.completion_homeowner_name,
            'completion_accepted_at', history.completion_accepted_at,
            'customer_signature_recorded', history.customer_signature_recorded,
            'warranties', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', warranty.id,
                    'warranty_type', warranty.warranty_type,
                    'coverage_kind', warranty.coverage_kind,
                    'custom_label', warranty.custom_label,
                    'start_date', warranty.start_date,
                    'expiration_date', warranty.expiration_date,
                    'notes', warranty.notes,
                    'verification_status', warranty.verification_status
                ) order by warranty.warranty_type)
                from public.home_item_warranties as warranty
                where warranty.service_history_id = history.id
            ), '[]'::jsonb),
            'media', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', attachment.id,
                    'stage', history_attachment.media_role,
                    'bucket', attachment.bucket,
                    'storage_path', attachment.storage_path,
                    'file_name', attachment.file_name,
                    'mime_type', attachment.mime_type,
                    'caption', attachment.caption,
                    'created_at', attachment.created_at
                ) order by attachment.created_at)
                from public.home_item_service_history_attachments as history_attachment
                join public.company_job_workflow_attachments as attachment
                  on attachment.id = history_attachment.workflow_attachment_id
                where history_attachment.service_history_id = history.id
            ), '[]'::jsonb)
        ) order by history.completion_date desc, history.created_at desc), '[]'::jsonb)
    into v_entries
    from public.home_item_service_history as history
    where history.home_item_id in (select id from item_family);

    return jsonb_build_object('item_id', p_home_item_id, 'entries', v_entries);
end;
$$;

alter table public.home_item_service_history enable row level security;
alter table public.home_item_warranties enable row level security;
alter table public.home_item_service_history_attachments enable row level security;
alter table public.home_item_warranty_attachments enable row level security;
alter table public.home_item_replacements enable row level security;
alter table public.home_item_identification_sources enable row level security;

do $$
declare
    v_table text;
begin
    foreach v_table in array array[
        'home_item_service_history',
        'home_item_warranties',
        'home_item_service_history_attachments',
        'home_item_warranty_attachments',
        'home_item_replacements',
        'home_item_identification_sources'
    ] loop
        execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    end loop;
end;
$$;

drop policy if exists home_item_history_media_homeowner_select on storage.objects;
create policy home_item_history_media_homeowner_select
on storage.objects for select to authenticated
using (
    bucket_id = 'company-job-files'
    and exists (
        select 1
        from public.company_job_workflow_attachments as attachment
        join public.home_item_service_history_attachments as history_attachment
          on history_attachment.workflow_attachment_id = attachment.id
        where attachment.bucket = storage.objects.bucket_id
          and attachment.storage_path = storage.objects.name
          and public.homeos_can_read_property_record(history_attachment.property_id)
    )
);

revoke all on function public.get_company_job_homeos_closeout(uuid) from public, anon;
revoke all on function public.save_company_job_homeos_closeout(uuid, jsonb) from public, anon;
revoke all on function public.get_home_item_lifetime_history(uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.apply_company_job_homeos_closeout(uuid) from public, anon, authenticated;
grant execute on function public.get_company_job_homeos_closeout(uuid) to authenticated;
grant execute on function public.save_company_job_homeos_closeout(uuid, jsonb) to authenticated;
grant execute on function public.get_home_item_lifetime_history(uuid, uuid, uuid, uuid, uuid) to authenticated;

commit;
