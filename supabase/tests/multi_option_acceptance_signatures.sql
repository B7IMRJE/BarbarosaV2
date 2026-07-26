begin;

select plan(7);

select has_function(
    'public',
    'accept_company_job_workflow_quote_v2',
    array['uuid','text[]','text','text','text','text'],
    'multi-option signed acceptance RPC exists'
);
select has_column('public', 'company_job_workflows', 'selected_source_choice_ids', 'all selected ids are stored');
select has_column('public', 'company_job_workflows', 'selected_options_snapshot', 'all selected options are snapshotted');
select has_column('public', 'company_job_workflows', 'selected_total', 'combined selected total is stored');
select has_column('public', 'company_job_workflows', 'cancellation_homeowner_name', 'cancellation recipient is stored');
select has_column('public', 'company_job_workflows', 'cancellation_homeowner_signature', 'cancellation signature is separate');
select has_column('public', 'company_job_workflows', 'homeowner_signature', 'work approval signature remains separate');

select * from finish();
rollback;
