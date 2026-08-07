begin;

select plan(13);

select has_table('public', 'company_estimate_quote_counters', 'company quote counter exists');
select has_column('public', 'company_estimate_option_sessions', 'quote_sequence', 'estimate session has a quote sequence');
select has_column('public', 'company_estimate_option_sessions', 'quote_number', 'estimate session has a quote number');
select has_column('public', 'company_estimate_option_sessions', 'current_builder_step', 'estimate session stores the current builder step');
select has_column('public', 'company_estimate_option_sessions', 'builder_state', 'estimate session stores the builder snapshot');

select has_function('public', 'list_company_estimate_drafts', array['uuid'], 'draft list RPC exists');
select has_function('public', 'get_company_estimate_builder_draft', array['uuid'], 'draft restore RPC exists');
select has_function('public', 'save_company_estimate_builder_draft', array['uuid','text','jsonb'], 'draft autosave RPC exists');
select has_function('public', 'archive_company_estimate_draft', array['uuid'], 'draft archive RPC exists');

select col_not_null('public', 'company_estimate_option_sessions', 'quote_sequence', 'quote sequence is required');
select col_not_null('public', 'company_estimate_option_sessions', 'quote_number', 'quote number is required');
select col_not_null('public', 'company_estimate_option_sessions', 'builder_state', 'builder snapshot is required');

select results_eq(
    $$
        select count(*)::bigint
        from public.company_estimate_option_sessions
        where quote_number !~ '^([A-Z]+[0-9]{4}-)?Q[0-9]{4,}$'
    $$,
    array[0::bigint],
    'all estimate sessions use a permanent formatted quote number'
);

select * from finish();
rollback;
