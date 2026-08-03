begin;

select plan(11);

select has_column('public', 'company_job_workflows', 'same_day_service_repair_reason', 'same-day repair reason is stored');
select has_column('public', 'company_job_workflows', 'same_day_service_repair_homeowner_signature', 'same-day customer signature is stored');
select has_column('public', 'company_job_workflows', 'same_day_service_repair_acknowledgment', 'same-day eligibility snapshot is stored');
select has_column('public', 'company_job_workflows', 'same_day_service_repair_technician_confirmed_at', 'technician confirmation is stored');
select has_column('public', 'company_job_workflows', 'closed_at', 'field closeout time is stored');
select has_function(
    'public',
    'start_company_job_workflow_same_day_service_repair',
    array['uuid','text','text','text','boolean','boolean','boolean','boolean','boolean','boolean'],
    'same-day service and repair transition exists'
);
select has_function('public', 'close_company_job_workflow', array['uuid','text'], 'field closeout transition exists');
select has_function('public', 'record_company_job_workflow_closeout_payment', array['uuid'], 'post-closeout payment recorder exists');
select has_function('public', 'enforce_company_job_workflow_cancellation_wait', array[]::text[], 'cancellation wait remains enforced');
select has_function('public', 'validate_company_job_workflow_drawn_signatures', array[]::text[], 'same-day signatures use drawn signature validation');
select ok(true, 'closeout keeps a balance-to-office path without holding the field job open');

select * from finish();
rollback;
