begin;
select plan(3);
select has_table('public', 'company_technician_time_entries', 'technician time entries exist');
select has_function('public', 'set_company_technician_clock', array['uuid','text'], 'time clock action exists');
select has_column('public', 'company_technician_time_entries', 'clocked_out_at', 'clock out is recorded');
select * from finish();
rollback;
