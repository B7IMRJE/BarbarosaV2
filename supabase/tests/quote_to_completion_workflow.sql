begin;

select plan(16);

select has_table('public', 'company_contract_rules', 'company contract rules exist');
select has_table('public', 'company_job_workflows', 'job workflows exist');
select has_table('public', 'company_job_workflow_events', 'workflow events exist');
select has_table('public', 'company_job_workflow_attachments', 'workflow attachments exist');
select has_function('public', 'get_or_create_company_job_workflow', array['uuid'], 'workflow loader exists');
select has_function('public', 'advance_company_job_workflow', array['uuid','text','jsonb'], 'workflow transition exists');
select has_function(
    'public',
    'record_company_job_workflow_attachment',
    array['uuid','text','text','text','text','bigint','text'],
    'workflow attachment recorder exists'
);
select has_column('public', 'company_job_workflows', 'selected_option_snapshot', 'selected option is snapshotted');
select has_column('public', 'company_job_workflows', 'homeowner_signature', 'acceptance signature is stored');
select has_column('public', 'company_job_workflows', 'cancellation_rule_snapshot', 'cancellation rule is snapshotted');
select has_column('public', 'company_job_workflows', 'sold_at', 'sold timestamp is stored');
select has_column('public', 'company_job_workflows', 'execution_timing', 'work timing decision is stored');
select has_column('public', 'company_job_workflows', 'technician_completed_at', 'technician completion is stored');
select has_column('public', 'company_job_workflows', 'completion_homeowner_signature', 'completion signature is stored');
select has_column('public', 'company_job_workflows', 'invoice_sent_at', 'invoice sent time is stored');
select has_column('public', 'company_job_workflow_attachments', 'visibility', 'attachment privacy is explicit');

select * from finish();
rollback;
