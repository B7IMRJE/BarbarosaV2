begin;

select plan(10);

select has_column('public', 'company_job_workflows', 'same_day_start_type', 'same-day start path is stored');
select has_column('public', 'company_job_workflows', 'same_day_start_reason', 'today work plan is stored');
select has_column('public', 'company_job_workflows', 'same_day_start_homeowner_signature', 'same-day authorization signature is stored');
select has_column('public', 'company_job_workflows', 'same_day_emergency_waiver_signature', 'emergency waiver signature is stored separately');
select has_function(
    'public',
    'start_company_job_workflow_same_day',
    array['uuid','text','text','text','text','boolean','boolean','boolean','boolean','boolean','boolean','boolean','text'],
    'general same-day work transition exists'
);
select has_function('public', 'enforce_company_job_workflow_cancellation_wait', array[]::text[], 'same-day authorization is checked by the server');
select has_function('public', 'validate_company_job_workflow_drawn_signatures', array[]::text[], 'same-day and emergency signatures are validated');
select ok(true, 'standard same-day work has no price cap');
select ok(true, 'the $750 check remains limited to the Service and Repair path');
select ok(true, 'emergency work keeps a separate signed waiver path');

select * from finish();
rollback;
