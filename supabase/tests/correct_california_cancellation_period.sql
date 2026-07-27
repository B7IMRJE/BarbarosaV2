begin;

select plan(3);

select has_function('public', 'company_add_business_days', array['date','integer'], 'business-day calculator exists');
select is(public.company_add_business_days(date '2026-07-24', 3), date '2026-07-29', 'weekends are excluded');
select has_function(
    'public',
    'enforce_company_job_workflow_cancellation_wait',
    array[]::text[],
    'cancellation wait enforcement exists'
);

select * from finish();
rollback;
