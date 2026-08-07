begin;

select plan(6);

select has_function(
    'public',
    'company_estimate_customer_history_can_view',
    array['uuid', 'uuid'],
    'customer quote history authorization helper exists'
);

select has_function(
    'public',
    'list_company_estimate_quote_history',
    array['uuid', 'uuid'],
    'customer quote history list RPC exists'
);

select has_function(
    'public',
    'get_company_estimate_quote_history',
    array['uuid'],
    'read-only quote detail RPC exists'
);

select has_index(
    'public',
    'company_estimate_option_sessions',
    'company_estimate_option_sessions_customer_history_idx',
    'customer quote history has a property-scoped index'
);

select has_trigger(
    'public',
    'company_estimate_option_sessions',
    'company_estimate_option_sessions_protect_presented',
    'presented quote sessions are protected from later mutation'
);

select has_trigger(
    'public',
    'company_estimate_options',
    'company_estimate_options_protect_presented',
    'presented quote option snapshots are protected from later mutation'
);

select * from finish();
rollback;
