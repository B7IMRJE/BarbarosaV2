begin;

select plan(17);

select has_table('public', 'techos_legal_document_defaults', 'TechOS legal defaults exist');
select has_table('public', 'company_legal_document_templates', 'company legal templates exist');
select has_table('public', 'company_legal_document_revisions', 'company legal revisions exist');
select has_table('public', 'company_job_legal_document_snapshots', 'immutable job legal snapshots exist');

select has_column('public', 'company_job_legal_document_snapshots', 'document_body_snapshot', 'signed body is snapshotted');
select has_column('public', 'company_job_legal_document_snapshots', 'document_revision_id', 'signed revision id is stored');
select has_column('public', 'company_job_legal_document_snapshots', 'company_id', 'signed company id is stored');
select has_column('public', 'company_job_legal_document_snapshots', 'job_id', 'signed job id is stored');
select has_column('public', 'company_job_legal_document_snapshots', 'customer_name', 'signed customer name is stored');
select has_column('public', 'company_job_legal_document_snapshots', 'signature', 'drawn signature is stored');
select has_column('public', 'company_job_legal_document_snapshots', 'signed_at', 'signed timestamp is stored');
select has_column('public', 'company_job_legal_document_snapshots', 'presented_by_user_id', 'presenting user is stored');

select has_function('public', 'get_company_legal_documents', array['uuid','uuid'], 'company document loader exists');
select has_function('public', 'save_company_legal_document', array['uuid','uuid','text','text','boolean','boolean','boolean','text','boolean','boolean','text'], 'versioned save RPC exists');
select has_function('public', 'record_job_legal_document_snapshot', array['uuid','uuid','text','text'], 'immutable job snapshot RPC exists');
select has_function('public', 'accept_company_job_workflow_quote_v3', array['uuid','text[]','text','text','text','text'], 'quote acceptance snapshots company documents');
select has_function('public', 'start_company_job_workflow_same_day_v2', array['uuid','text','text','text','text','boolean','boolean','boolean','boolean','boolean','boolean','boolean','text'], 'same-day authorization snapshots company wording');

select * from finish();
rollback;
