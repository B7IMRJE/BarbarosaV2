-- Company-scoped legal document configuration with immutable revision and job snapshots.
-- TechOS provides editable defaults but does not treat those defaults as legal advice.

begin;

create table public.techos_legal_document_defaults (
    document_type text primary key check (document_type in (
        'home_improvement_contract',
        'notice_of_cancellation',
        'same_day_work_authorization',
        'emergency_immediate_work_waiver',
        'customer_authorization',
        'payment_authorization',
        'change_order',
        'completion_acknowledgment',
        'warranty_terms',
        'terms_and_conditions',
        'other_custom_legal_document'
    )),
    default_revision_number integer not null default 1 check (default_revision_number > 0),
    default_title text not null check (nullif(btrim(default_title), '') is not null),
    default_body text not null check (nullif(btrim(default_body), '') is not null),
    default_requires_customer_signature boolean not null,
    default_requires_customer_printed_name boolean not null,
    default_auto_record_datetime boolean not null,
    default_workflow_stage text not null check (default_workflow_stage in (
        'quote_approval', 'before_work', 'work_completion',
        'customer_completion', 'payment_closeout', 'job_record'
    )),
    default_blocks_progression boolean not null,
    default_is_active boolean not null,
    protected_fields text[] not null default array[]::text[],
    protected_notice text not null default '',
    display_order integer not null,
    updated_at timestamptz not null default now()
);

create table public.company_legal_document_templates (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    document_type text not null references public.techos_legal_document_defaults(document_type),
    current_revision_id uuid,
    created_at timestamptz not null default now(),
    created_by_user_id uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    unique (company_id, document_type)
);

create table public.company_legal_document_revisions (
    id uuid primary key default gen_random_uuid(),
    template_id uuid not null references public.company_legal_document_templates(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    document_type text not null references public.techos_legal_document_defaults(document_type),
    revision_number integer not null check (revision_number > 0),
    default_revision_number integer not null check (default_revision_number > 0),
    title text not null check (nullif(btrim(title), '') is not null),
    body text not null check (nullif(btrim(body), '') is not null),
    requires_customer_signature boolean not null,
    requires_customer_printed_name boolean not null,
    auto_record_datetime boolean not null,
    workflow_stage text not null check (workflow_stage in (
        'quote_approval', 'before_work', 'work_completion',
        'customer_completion', 'payment_closeout', 'job_record'
    )),
    blocks_progression boolean not null,
    is_active boolean not null,
    protected_fields text[] not null default array[]::text[],
    protected_notice text not null default '',
    source text not null check (source in ('techos_default', 'company_custom', 'attorney_approved')),
    created_at timestamptz not null default now(),
    created_by_user_id uuid references auth.users(id) on delete set null,
    unique (template_id, revision_number),
    unique (id, template_id, company_id)
);

alter table public.company_legal_document_templates
    add constraint company_legal_document_templates_current_revision_fk
    foreign key (current_revision_id)
    references public.company_legal_document_revisions(id)
    on delete restrict;

create table public.company_job_legal_document_snapshots (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete restrict,
    job_id uuid not null,
    job_workflow_id uuid not null references public.company_job_workflows(id) on delete restrict,
    template_id uuid not null references public.company_legal_document_templates(id) on delete restrict,
    document_revision_id uuid not null references public.company_legal_document_revisions(id) on delete restrict,
    document_type text not null,
    document_revision_number integer not null,
    document_title_snapshot text not null,
    document_body_snapshot text not null,
    rendered_document_text_snapshot text not null,
    workflow_stage_snapshot text not null,
    requirements_snapshot jsonb not null,
    protected_fields_snapshot text[] not null default array[]::text[],
    protected_notice_snapshot text not null default '',
    display_context_snapshot jsonb not null default '{}'::jsonb,
    customer_name text,
    signature text,
    signed_at timestamptz,
    recorded_at timestamptz not null default now(),
    date_time_displayed boolean not null,
    presented_by_user_id uuid not null references auth.users(id) on delete restrict,
    unique (job_workflow_id, template_id)
);

create index company_legal_document_revisions_company_idx
    on public.company_legal_document_revisions(company_id, document_type, revision_number desc);
create index company_job_legal_document_snapshots_job_idx
    on public.company_job_legal_document_snapshots(company_id, job_id, recorded_at);
create index company_job_legal_document_snapshots_workflow_idx
    on public.company_job_legal_document_snapshots(job_workflow_id, recorded_at);

insert into public.techos_legal_document_defaults (
    document_type, default_title, default_body,
    default_requires_customer_signature, default_requires_customer_printed_name,
    default_auto_record_datetime, default_workflow_stage,
    default_blocks_progression, default_is_active,
    protected_fields, protected_notice, display_order
) values
(
    'home_improvement_contract',
    'Home Improvement Contract',
    'Review the approved scope of work, price, project timing, and company terms presented with this agreement. Replace this TechOS starter language with the contract package approved for your company and jurisdiction before activating it.',
    true, true, true, 'quote_approval', true, false,
    array[]::text[], '', 10
),
(
    'notice_of_cancellation',
    'Three-Day Right to Cancel',
    'You, the buyer, have the right to cancel this contract within three business days. You may cancel by emailing, mailing, faxing, or delivering written notice to the contractor at the contractor address or email shown on the signed agreement before midnight of the third business day after you receive the completed, signed agreement and this notice. Include your name, address, and the date you received the signed agreement. Signing this acknowledgment confirms receipt; it does not waive your cancellation right.',
    true, true, true, 'quote_approval', true, true,
    array[
        'requires_customer_signature', 'requires_customer_printed_name',
        'auto_record_datetime', 'workflow_stage', 'blocks_progression',
        'is_active', 'cancellation_period_and_same_day_start_guards'
    ],
    'Protected TechOS controls: the company cancellation period, receipt acknowledgment, drawn signature, timestamp, and same-day-start safeguards remain server-enforced. Company wording is editable; these controls are not.',
    20
),
(
    'customer_authorization',
    'Customer Authorization',
    'I reviewed the selected work, included line items, and total authorized price shown with this document. I authorize the company to perform only that selected scope. Additional work or a material price change requires a separate explanation and approval.',
    true, true, true, 'quote_approval', true, true,
    array[
        'requires_customer_signature', 'requires_customer_printed_name',
        'auto_record_datetime', 'workflow_stage', 'blocks_progression', 'is_active'
    ],
    'Protected TechOS controls: selected scope and price, customer identity, drawn signature, timestamp, and quote-approval order are captured with the signed job.',
    30
),
(
    'same_day_work_authorization',
    'Same-Day Work Authorization',
    'I requested that the approved work described with this document begin today. I received the signed company agreement and authorize the company to start the approved work today. Any applicable cancellation notice remains part of my agreement.',
    true, true, true, 'before_work', true, true,
    array[
        'requires_customer_signature', 'requires_customer_printed_name',
        'auto_record_datetime', 'workflow_stage', 'blocks_progression', 'is_active',
        'same_day_start_validation'
    ],
    'Protected TechOS controls: a signed company agreement, customer name, drawn authorization signature, timestamp, and technician readiness confirmation are required before a same-day start.',
    35
),
(
    'emergency_immediate_work_waiver',
    'Emergency / Immediate Work Waiver',
    'I requested immediate work to protect people or property from the emergency described with this document. I received the company agreement and authorize only the immediate-protection work identified for this job. This record does not remove rights that cannot legally be waived.',
    true, true, true, 'before_work', true, true,
    array[
        'requires_customer_signature', 'requires_customer_printed_name',
        'auto_record_datetime', 'workflow_stage', 'blocks_progression', 'is_active',
        'emergency_immediate_protection_validation'
    ],
    'Protected TechOS controls: this document applies only to the separately validated emergency/immediate-protection path and requires a customer name, drawn signature, timestamp, and technician confirmation.',
    40
),
(
    'change_order',
    'Change Order',
    'Describe the requested change, the price and schedule impact, and the specific work being added, removed, or revised. Replace this starter language with your company-approved change-order terms before activation.',
    true, true, true, 'work_completion', true, false,
    array[]::text[], '', 50
),
(
    'completion_acknowledgment',
    'Completion Acknowledgment',
    'I have had an opportunity to inspect the completed work, ask questions, and identify any visible concerns. I acknowledge that the approved work has been performed and is satisfactory at the time of signing. This acknowledgment does not waive warranties or rights that cannot legally be waived.',
    true, true, true, 'customer_completion', true, true,
    array[
        'requires_customer_signature', 'requires_customer_printed_name',
        'auto_record_datetime', 'workflow_stage', 'blocks_progression', 'is_active',
        'technician_completion_first'
    ],
    'Protected TechOS controls: the technician must record completion before the customer can sign; customer name, drawn signature, timestamp, and the signed text revision are retained.',
    60
),
(
    'payment_authorization',
    'Payment Authorization',
    'Describe the payment method, amount, timing, and authorization approved by your company. Replace this TechOS starter language with company-approved payment terms before activation.',
    true, true, true, 'payment_closeout', true, false,
    array[]::text[], '', 70
),
(
    'warranty_terms',
    'Warranty Terms',
    'Enter the warranty coverage, exclusions, claim process, and effective period approved by your company. TechOS does not determine or extend the company warranty.',
    false, false, true, 'job_record', false, false,
    array[]::text[], '', 80
),
(
    'terms_and_conditions',
    'Terms and Conditions',
    'Enter the terms and conditions approved for your company and jurisdiction.',
    false, false, true, 'job_record', false, false,
    array[]::text[], '', 90
),
(
    'other_custom_legal_document',
    'Other Custom Legal Document',
    'Enter the company-approved document wording here before activation.',
    false, false, true, 'job_record', false, false,
    array[]::text[], '', 100
);

alter table public.techos_legal_document_defaults enable row level security;
alter table public.company_legal_document_templates enable row level security;
alter table public.company_legal_document_revisions enable row level security;
alter table public.company_job_legal_document_snapshots enable row level security;

create policy techos_legal_document_defaults_read
on public.techos_legal_document_defaults for select to authenticated
using (true);

create policy company_legal_document_templates_read
on public.company_legal_document_templates for select to authenticated
using (
    coalesce(public.homeos_is_platform_admin(), false)
    or public.company_estimate_options_can_use(company_id)
);

create policy company_legal_document_revisions_read
on public.company_legal_document_revisions for select to authenticated
using (
    coalesce(public.homeos_is_platform_admin(), false)
    or public.company_estimate_options_can_use(company_id)
);

create policy company_job_legal_document_snapshots_read
on public.company_job_legal_document_snapshots for select to authenticated
using (
    coalesce(public.homeos_is_platform_admin(), false)
    or public.company_estimate_options_can_use(company_id)
);

create or replace function public.company_legal_documents_can_manage(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           coalesce(public.homeos_is_platform_admin(), false)
           or public.company_user_has_permission(p_company_id, 'can_manage_company_profile')
       );
$$;

revoke all on function public.company_legal_documents_can_manage(uuid) from public, anon;
grant execute on function public.company_legal_documents_can_manage(uuid) to authenticated;

create or replace function public.provision_company_legal_documents(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    insert into public.company_legal_document_templates(company_id, document_type)
    select p_company_id, defaults.document_type
    from public.techos_legal_document_defaults defaults
    on conflict (company_id, document_type) do nothing;

    insert into public.company_legal_document_revisions(
        template_id, company_id, document_type, revision_number, default_revision_number,
        title, body, requires_customer_signature, requires_customer_printed_name,
        auto_record_datetime, workflow_stage, blocks_progression, is_active,
        protected_fields, protected_notice, source
    )
    select
        template.id, template.company_id, template.document_type, 1, defaults.default_revision_number,
        defaults.default_title, defaults.default_body,
        defaults.default_requires_customer_signature,
        defaults.default_requires_customer_printed_name,
        defaults.default_auto_record_datetime,
        defaults.default_workflow_stage,
        defaults.default_blocks_progression,
        defaults.default_is_active,
        defaults.protected_fields,
        defaults.protected_notice,
        'techos_default'
    from public.company_legal_document_templates template
    join public.techos_legal_document_defaults defaults
      on defaults.document_type = template.document_type
    where template.company_id = p_company_id
      and template.current_revision_id is null
    on conflict (template_id, revision_number) do nothing;

    update public.company_legal_document_templates template
    set current_revision_id = revision.id,
        updated_at = now()
    from public.company_legal_document_revisions revision
    where template.company_id = p_company_id
      and template.current_revision_id is null
      and revision.template_id = template.id
      and revision.revision_number = 1;
end;
$$;

revoke all on function public.provision_company_legal_documents(uuid) from public, anon, authenticated;

do $$
declare
    company_record record;
begin
    for company_record in select id from public.companies loop
        perform public.provision_company_legal_documents(company_record.id);
    end loop;
end;
$$;

-- Preserve each company's existing cancellation title and wording while moving it
-- into the new versioned document system.
update public.company_legal_document_revisions revision
set title = rule.cancellation_notice_title,
    body = rule.cancellation_notice_text,
    source = 'company_custom'
from public.company_legal_document_templates template
join public.company_contract_rules rule on rule.company_id = template.company_id
where revision.template_id = template.id
  and revision.id = template.current_revision_id
  and template.document_type = 'notice_of_cancellation';

create or replace function public.prevent_company_legal_document_history_changes()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
    raise exception 'Signed legal documents and legal document revisions are immutable.';
end;
$$;

create trigger company_legal_document_revisions_immutable
before update or delete on public.company_legal_document_revisions
for each row execute function public.prevent_company_legal_document_history_changes();

create trigger company_job_legal_document_snapshots_immutable
before update or delete on public.company_job_legal_document_snapshots
for each row execute function public.prevent_company_legal_document_history_changes();

create or replace function public.get_company_legal_documents(
    p_company_id uuid,
    p_job_workflow_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_documents jsonb;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not (
        coalesce(public.homeos_is_platform_admin(), false)
        or public.company_estimate_options_can_use(p_company_id)
    ) then
        raise exception 'Company legal documents are unavailable.';
    end if;
    if p_job_workflow_id is not null and not exists (
        select 1 from public.company_job_workflows workflow
        where workflow.id = p_job_workflow_id and workflow.company_id = p_company_id
    ) then
        raise exception 'Job workflow is unavailable.';
    end if;

    perform public.provision_company_legal_documents(p_company_id);

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'template_id', template.id,
            'company_id', template.company_id,
            'document_type', template.document_type,
            'revision_id', revision.id,
            'revision_number', revision.revision_number,
            'default_revision_number', revision.default_revision_number,
            'title', revision.title,
            'body', revision.body,
            'requires_customer_signature', revision.requires_customer_signature,
            'requires_customer_printed_name', revision.requires_customer_printed_name,
            'auto_record_datetime', revision.auto_record_datetime,
            'workflow_stage', revision.workflow_stage,
            'blocks_progression', revision.blocks_progression,
            'is_active', revision.is_active,
            'protected_fields', to_jsonb(revision.protected_fields),
            'protected_notice', revision.protected_notice,
            'source', revision.source,
            'is_default', revision.source = 'techos_default',
            'completed_snapshot_id', snapshot.id,
            'completed_at', snapshot.recorded_at
        ) order by defaults.display_order
    ), '[]'::jsonb)
    into v_documents
    from public.company_legal_document_templates template
    join public.company_legal_document_revisions revision
      on revision.id = template.current_revision_id
    join public.techos_legal_document_defaults defaults
      on defaults.document_type = template.document_type
    left join public.company_job_legal_document_snapshots snapshot
      on snapshot.template_id = template.id
     and snapshot.job_workflow_id = p_job_workflow_id
    where template.company_id = p_company_id;

    return v_documents;
end;
$$;

revoke all on function public.get_company_legal_documents(uuid, uuid) from public, anon;
grant execute on function public.get_company_legal_documents(uuid, uuid) to authenticated;

create or replace function public.save_company_legal_document(
    p_company_id uuid,
    p_template_id uuid,
    p_title text,
    p_body text,
    p_requires_customer_signature boolean,
    p_requires_customer_printed_name boolean,
    p_auto_record_datetime boolean,
    p_workflow_stage text,
    p_blocks_progression boolean,
    p_is_active boolean,
    p_source text default 'company_custom'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_template public.company_legal_document_templates%rowtype;
    v_defaults public.techos_legal_document_defaults%rowtype;
    v_revision public.company_legal_document_revisions%rowtype;
    v_next_revision integer;
    v_signature boolean := coalesce(p_requires_customer_signature, false);
    v_name boolean := coalesce(p_requires_customer_printed_name, false);
    v_datetime boolean := coalesce(p_auto_record_datetime, true);
    v_stage text := lower(btrim(coalesce(p_workflow_stage, '')));
    v_blocks boolean := coalesce(p_blocks_progression, false);
    v_active boolean := coalesce(p_is_active, false);
begin
    if not public.company_legal_documents_can_manage(p_company_id) then
        raise exception 'Company legal document administration access is required.';
    end if;
    if nullif(btrim(coalesce(p_title, '')), '') is null then
        raise exception 'Document title is required.';
    end if;
    if nullif(btrim(coalesce(p_body, '')), '') is null then
        raise exception 'Document wording is required.';
    end if;
    if v_stage not in (
        'quote_approval', 'before_work', 'work_completion',
        'customer_completion', 'payment_closeout', 'job_record'
    ) then
        raise exception 'Choose a valid job workflow location.';
    end if;
    if p_source not in ('company_custom', 'attorney_approved') then
        raise exception 'Choose company custom or attorney-approved as the document source.';
    end if;

    perform public.provision_company_legal_documents(p_company_id);

    select * into v_template
    from public.company_legal_document_templates
    where id = p_template_id and company_id = p_company_id
    for update;
    if not found then raise exception 'Company legal document is unavailable.'; end if;

    select * into v_defaults
    from public.techos_legal_document_defaults
    where document_type = v_template.document_type;

    if 'requires_customer_signature' = any(v_defaults.protected_fields) then
        v_signature := v_defaults.default_requires_customer_signature;
    end if;
    if 'requires_customer_printed_name' = any(v_defaults.protected_fields) then
        v_name := v_defaults.default_requires_customer_printed_name;
    end if;
    if 'auto_record_datetime' = any(v_defaults.protected_fields) then
        v_datetime := v_defaults.default_auto_record_datetime;
    end if;
    if 'workflow_stage' = any(v_defaults.protected_fields) then
        v_stage := v_defaults.default_workflow_stage;
    end if;
    if 'blocks_progression' = any(v_defaults.protected_fields) then
        v_blocks := v_defaults.default_blocks_progression;
    end if;
    if 'is_active' = any(v_defaults.protected_fields) then
        v_active := v_defaults.default_is_active;
    end if;

    select coalesce(max(revision_number), 0) + 1
    into v_next_revision
    from public.company_legal_document_revisions
    where template_id = v_template.id;

    insert into public.company_legal_document_revisions(
        template_id, company_id, document_type, revision_number, default_revision_number,
        title, body, requires_customer_signature, requires_customer_printed_name,
        auto_record_datetime, workflow_stage, blocks_progression, is_active,
        protected_fields, protected_notice, source, created_by_user_id
    ) values (
        v_template.id, v_template.company_id, v_template.document_type,
        v_next_revision, v_defaults.default_revision_number,
        btrim(p_title), btrim(p_body), v_signature, v_name, v_datetime,
        v_stage, v_blocks, v_active, v_defaults.protected_fields,
        v_defaults.protected_notice, p_source, auth.uid()
    ) returning * into v_revision;

    update public.company_legal_document_templates
    set current_revision_id = v_revision.id,
        updated_at = now()
    where id = v_template.id;

    return (
        select document
        from jsonb_array_elements(public.get_company_legal_documents(p_company_id, null)) document
        where document->>'template_id' = v_template.id::text
        limit 1
    );
end;
$$;

revoke all on function public.save_company_legal_document(uuid,uuid,text,text,boolean,boolean,boolean,text,boolean,boolean,text) from public, anon;
grant execute on function public.save_company_legal_document(uuid,uuid,text,text,boolean,boolean,boolean,text,boolean,boolean,text) to authenticated;

create or replace function public.restore_company_legal_document_default(
    p_company_id uuid,
    p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_template public.company_legal_document_templates%rowtype;
    v_defaults public.techos_legal_document_defaults%rowtype;
    v_revision public.company_legal_document_revisions%rowtype;
    v_next_revision integer;
begin
    if not public.company_legal_documents_can_manage(p_company_id) then
        raise exception 'Company legal document administration access is required.';
    end if;

    perform public.provision_company_legal_documents(p_company_id);

    select * into v_template
    from public.company_legal_document_templates
    where id = p_template_id and company_id = p_company_id
    for update;
    if not found then raise exception 'Company legal document is unavailable.'; end if;

    select * into v_defaults
    from public.techos_legal_document_defaults
    where document_type = v_template.document_type;

    select coalesce(max(revision_number), 0) + 1
    into v_next_revision
    from public.company_legal_document_revisions
    where template_id = v_template.id;

    insert into public.company_legal_document_revisions(
        template_id, company_id, document_type, revision_number, default_revision_number,
        title, body, requires_customer_signature, requires_customer_printed_name,
        auto_record_datetime, workflow_stage, blocks_progression, is_active,
        protected_fields, protected_notice, source, created_by_user_id
    ) values (
        v_template.id, v_template.company_id, v_template.document_type,
        v_next_revision, v_defaults.default_revision_number,
        v_defaults.default_title, v_defaults.default_body,
        v_defaults.default_requires_customer_signature,
        v_defaults.default_requires_customer_printed_name,
        v_defaults.default_auto_record_datetime,
        v_defaults.default_workflow_stage,
        v_defaults.default_blocks_progression,
        v_defaults.default_is_active,
        v_defaults.protected_fields,
        v_defaults.protected_notice,
        'techos_default', auth.uid()
    ) returning * into v_revision;

    update public.company_legal_document_templates
    set current_revision_id = v_revision.id,
        updated_at = now()
    where id = v_template.id;

    return (
        select document
        from jsonb_array_elements(public.get_company_legal_documents(p_company_id, null)) document
        where document->>'template_id' = v_template.id::text
        limit 1
    );
end;
$$;

revoke all on function public.restore_company_legal_document_default(uuid,uuid) from public, anon;
grant execute on function public.restore_company_legal_document_default(uuid,uuid) to authenticated;

create or replace function public.insert_job_legal_document_snapshot(
    p_workflow_id uuid,
    p_template_id uuid,
    p_customer_name text,
    p_signature text,
    p_display_context jsonb default '{}'::jsonb
)
returns public.company_job_legal_document_snapshots
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_template public.company_legal_document_templates%rowtype;
    v_revision public.company_legal_document_revisions%rowtype;
    v_snapshot public.company_job_legal_document_snapshots%rowtype;
    v_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
    v_signature text := nullif(btrim(coalesce(p_signature, '')), '');
begin
    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id
    for update;
    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;

    select * into v_template
    from public.company_legal_document_templates
    where id = p_template_id and company_id = v_workflow.company_id;
    if not found then raise exception 'Legal document is unavailable for this job.'; end if;

    select * into v_revision
    from public.company_legal_document_revisions
    where id = v_template.current_revision_id;
    if not found or not v_revision.is_active then
        raise exception 'This legal document is not active.';
    end if;

    select * into v_snapshot
    from public.company_job_legal_document_snapshots
    where job_workflow_id = v_workflow.id and template_id = v_template.id;
    if found then return v_snapshot; end if;

    if (v_revision.requires_customer_printed_name or v_revision.requires_customer_signature)
       and v_name is null then
        raise exception 'Customer printed name is required for this document.';
    end if;
    if v_revision.requires_customer_signature and not public.is_company_drawn_signature(v_signature) then
        raise exception 'Draw the customer signature for this document.';
    end if;
    if v_signature is not null and not public.is_company_drawn_signature(v_signature) then
        raise exception 'The saved signature must be drawn in the signature pad.';
    end if;

    if v_revision.workflow_stage = 'quote_approval' and v_workflow.status <> 'presenting' then
        raise exception 'This document belongs in quote approval.';
    elsif v_revision.workflow_stage = 'before_work'
          and v_workflow.status not in ('sold', 'scheduled_later', 'prework') then
        raise exception 'This document belongs before work starts.';
    elsif v_revision.workflow_stage = 'work_completion'
          and v_workflow.status not in ('work_in_progress', 'issue_found', 'store_trip', 'returning_to_job') then
        raise exception 'This document belongs before technician completion.';
    elsif v_revision.workflow_stage = 'customer_completion' and v_workflow.status <> 'work_complete' then
        raise exception 'Technician completion is required before this document.';
    elsif v_revision.workflow_stage = 'payment_closeout'
          and v_workflow.status not in ('customer_completed', 'invoice_sent', 'collection_pending') then
        raise exception 'This document belongs in payment and job closeout.';
    end if;

    insert into public.company_job_legal_document_snapshots(
        company_id, job_id, job_workflow_id, template_id, document_revision_id,
        document_type, document_revision_number,
        document_title_snapshot, document_body_snapshot, rendered_document_text_snapshot,
        workflow_stage_snapshot, requirements_snapshot,
        protected_fields_snapshot, protected_notice_snapshot, display_context_snapshot,
        customer_name, signature, signed_at, date_time_displayed, presented_by_user_id
    ) values (
        v_workflow.company_id, coalesce(v_workflow.job_id, v_workflow.id),
        v_workflow.id, v_template.id, v_revision.id,
        v_revision.document_type, v_revision.revision_number,
        v_revision.title, v_revision.body,
        v_revision.title || E'\n\n' || v_revision.body,
        v_revision.workflow_stage,
        jsonb_build_object(
            'requires_customer_signature', v_revision.requires_customer_signature,
            'requires_customer_printed_name', v_revision.requires_customer_printed_name,
            'auto_record_datetime', v_revision.auto_record_datetime,
            'blocks_progression', v_revision.blocks_progression,
            'is_active', v_revision.is_active,
            'source', v_revision.source
        ),
        v_revision.protected_fields,
        v_revision.protected_notice,
        coalesce(p_display_context, '{}'::jsonb),
        v_name, v_signature,
        case when v_signature is not null then now() else null end,
        v_revision.auto_record_datetime,
        auth.uid()
    ) returning * into v_snapshot;

    insert into public.company_job_workflow_events(
        workflow_id, company_id, event_type, title, detail, visibility, metadata
    ) values (
        v_workflow.id, v_workflow.company_id,
        'legal_document_recorded', v_revision.title,
        format('Legal document revision %s was recorded as an immutable job snapshot.', v_revision.revision_number),
        'company',
        jsonb_build_object(
            'template_id', v_template.id,
            'document_revision_id', v_revision.id,
            'document_type', v_revision.document_type,
            'signed', v_signature is not null
        )
    );

    return v_snapshot;
end;
$$;

revoke all on function public.insert_job_legal_document_snapshot(uuid,uuid,text,text,jsonb) from public, anon, authenticated;

create or replace function public.record_job_legal_document_snapshot(
    p_workflow_id uuid,
    p_template_id uuid,
    p_customer_name text default null,
    p_signature text default null
)
returns public.company_job_legal_document_snapshots
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    return public.insert_job_legal_document_snapshot(
        p_workflow_id, p_template_id, p_customer_name, p_signature, '{}'::jsonb
    );
end;
$$;

revoke all on function public.record_job_legal_document_snapshot(uuid,uuid,text,text) from public, anon;
grant execute on function public.record_job_legal_document_snapshot(uuid,uuid,text,text) to authenticated;

create or replace function public.enforce_company_legal_document_workflow_gates()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_stage text;
    v_missing_title text;
begin
    if new.status is not distinct from old.status then return new; end if;

    if old.status = 'presenting' and new.status = 'sold' then
        v_stage := 'quote_approval';
    elsif old.status in ('sold', 'scheduled_later') and new.status = 'prework' then
        v_stage := 'before_work';
    elsif old.status = 'prework' and new.status = 'work_in_progress' then
        v_stage := 'before_work';
    elsif new.status = 'work_complete' and old.status <> 'work_complete' then
        v_stage := 'work_completion';
    elsif old.status = 'work_complete' and new.status = 'customer_completed' then
        v_stage := 'customer_completion';
    elsif old.status in ('customer_completed', 'invoice_sent', 'collection_pending')
          and new.status = 'closed' then
        v_stage := 'payment_closeout';
    else
        return new;
    end if;

    select revision.title
    into v_missing_title
    from public.company_legal_document_templates template
    join public.company_legal_document_revisions revision
      on revision.id = template.current_revision_id
    where template.company_id = new.company_id
      -- Do not retroactively block an in-flight job that existed before this
      -- company's legal-document package was provisioned.
      and template.created_at <= new.created_at
      and revision.is_active
      and revision.blocks_progression
      and revision.workflow_stage = v_stage
      and case
          when revision.document_type = 'emergency_immediate_work_waiver'
              then new.same_day_start_type = 'emergency_immediate_protection'
          when revision.document_type = 'same_day_work_authorization'
              then new.same_day_start_type in ('standard_same_day', 'service_and_repair')
          else true
      end
      and not exists (
          select 1
          from public.company_job_legal_document_snapshots snapshot
          where snapshot.job_workflow_id = new.id
            and snapshot.template_id = template.id
      )
    order by revision.title
    limit 1;

    if v_missing_title is not null then
        raise exception 'Complete the required legal document before continuing: %.', v_missing_title;
    end if;

    return new;
end;
$$;

drop trigger if exists company_job_workflows_legal_document_gates on public.company_job_workflows;
create trigger company_job_workflows_legal_document_gates
before update on public.company_job_workflows
for each row execute function public.enforce_company_legal_document_workflow_gates();

create or replace function public.accept_company_job_workflow_quote_v3(
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
    v_template record;
    v_context jsonb;
begin
    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id;
    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;

    perform public.provision_company_legal_documents(v_workflow.company_id);

    select jsonb_build_object(
        'selected_choice_ids', to_jsonb(coalesce(p_selected_choice_ids, array[]::text[])),
        'selected_options', coalesce(jsonb_agg(option.choice_snapshot order by option.display_order), '[]'::jsonb),
        'selected_total', coalesce(sum(option.deterministic_total), 0)
    )
    into v_context
    from public.company_estimate_options option
    where option.session_id = v_workflow.estimate_session_id
      and option.source_choice_id = any(coalesce(p_selected_choice_ids, array[]::text[]));

    for v_template in
        select template.id, template.document_type
        from public.company_legal_document_templates template
        join public.company_legal_document_revisions revision on revision.id = template.current_revision_id
        where template.company_id = v_workflow.company_id
          and revision.is_active
          and template.document_type in ('notice_of_cancellation', 'customer_authorization')
    loop
        if v_template.document_type = 'notice_of_cancellation' then
            perform public.insert_job_legal_document_snapshot(
                p_workflow_id, v_template.id,
                p_cancellation_name, p_cancellation_signature,
                v_context || jsonb_build_object('document_role', 'cancellation_notice')
            );
        else
            perform public.insert_job_legal_document_snapshot(
                p_workflow_id, v_template.id,
                p_homeowner_name, p_homeowner_signature,
                v_context || jsonb_build_object('document_role', 'selected_work_authorization')
            );
        end if;
    end loop;

    return public.accept_company_job_workflow_quote_v2(
        p_workflow_id, p_selected_choice_ids,
        p_cancellation_name, p_cancellation_signature,
        p_homeowner_name, p_homeowner_signature
    );
end;
$$;

revoke all on function public.accept_company_job_workflow_quote_v2(uuid,text[],text,text,text,text) from authenticated;
revoke all on function public.accept_company_job_workflow_quote_v3(uuid,text[],text,text,text,text) from public, anon;
grant execute on function public.accept_company_job_workflow_quote_v3(uuid,text[],text,text,text,text) to authenticated;

create or replace function public.start_company_job_workflow_same_day_v2(
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
    v_template_id uuid;
    v_document_type text;
    v_document_signature text;
begin
    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id;
    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;

    perform public.provision_company_legal_documents(v_workflow.company_id);

    if p_start_type = 'emergency_immediate_protection' then
        v_document_type := 'emergency_immediate_work_waiver';
        v_document_signature := p_emergency_waiver_signature;
    else
        v_document_type := 'same_day_work_authorization';
        v_document_signature := p_homeowner_signature;
    end if;

    select template.id into v_template_id
    from public.company_legal_document_templates template
    join public.company_legal_document_revisions revision on revision.id = template.current_revision_id
    where template.company_id = v_workflow.company_id
      and template.document_type = v_document_type
      and revision.is_active;

    if v_template_id is not null then
        perform public.insert_job_legal_document_snapshot(
            v_workflow.id, v_template_id, p_homeowner_name, v_document_signature,
            jsonb_build_object(
                'start_type', p_start_type,
                'approved_work', p_reason,
                'selected_options', v_workflow.selected_options_snapshot,
                'selected_total', v_workflow.selected_total,
                'signed_contract_confirmed', p_signed_contract_confirmed,
                'technician_confirmed', p_technician_confirmed
            )
        );
    end if;

    return public.start_company_job_workflow_same_day(
        p_workflow_id,
        p_start_type,
        p_reason,
        p_homeowner_name,
        p_homeowner_signature,
        p_customer_initiated,
        p_signed_contract_confirmed,
        p_technician_confirmed,
        p_short_notice_requested,
        p_scope_limited_to_repair,
        p_no_payment_before_completion,
        p_immediate_protection_confirmed,
        p_emergency_waiver_signature
    );
end;
$$;

revoke all on function public.start_company_job_workflow_same_day(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) from authenticated;
revoke all on function public.start_company_job_workflow_same_day_v2(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.start_company_job_workflow_same_day_v2(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) to authenticated;

create or replace function public.accept_company_job_workflow_completion_v2(
    p_workflow_id uuid,
    p_homeowner_name text,
    p_signature text
)
returns public.company_job_workflows
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_template_id uuid;
begin
    select * into v_workflow
    from public.company_job_workflows
    where id = p_workflow_id
    for update;
    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;
    if v_workflow.status <> 'work_complete' then
        raise exception 'Technician completion is required first.';
    end if;

    perform public.provision_company_legal_documents(v_workflow.company_id);

    select template.id into v_template_id
    from public.company_legal_document_templates template
    join public.company_legal_document_revisions revision on revision.id = template.current_revision_id
    where template.company_id = v_workflow.company_id
      and template.document_type = 'completion_acknowledgment'
      and revision.is_active;

    if v_template_id is not null then
        perform public.insert_job_legal_document_snapshot(
            v_workflow.id, v_template_id, p_homeowner_name, p_signature,
            jsonb_build_object(
                'selected_options', v_workflow.selected_options_snapshot,
                'selected_total', v_workflow.selected_total,
                'technician_completed_at', v_workflow.technician_completed_at
            )
        );
    end if;

    update public.company_job_workflows
    set completion_homeowner_name = btrim(p_homeowner_name),
        completion_homeowner_signature = btrim(p_signature),
        completion_accepted_at = now(),
        status = 'customer_completed',
        updated_at = now()
    where id = v_workflow.id
    returning * into v_workflow;

    insert into public.company_job_workflow_events(
        workflow_id, company_id, event_type, title, detail, visibility, metadata
    ) values (
        v_workflow.id, v_workflow.company_id,
        'accept_completion', 'Completion accepted',
        'Homeowner confirmed satisfactory completion.', 'homeowner',
        jsonb_build_object('legal_document_template_id', v_template_id)
    );

    return v_workflow;
end;
$$;

revoke all on function public.accept_company_job_workflow_completion_v2(uuid,text,text) from public, anon;
grant execute on function public.accept_company_job_workflow_completion_v2(uuid,text,text) to authenticated;

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

    perform public.provision_company_legal_documents(v_session.company_id);
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
        'legal_documents', public.get_company_legal_documents(v_session.company_id, v_workflow.id),
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

commit;
