begin;

do $$
declare
    v_permission_definition text;
    v_context_definition text;
begin
    select lower(pg_get_functiondef(
        'public.resolve_company_user_permissions_for_company(uuid,text,text,jsonb)'::regprocedure
    )) into v_permission_definition;

    if v_permission_definition !~ '''can_create_estimates'', true'
       or v_permission_definition !~ '''can_add_item_to_estimate'', true' then
        raise exception 'Active Sales Tech estimate-authoring permissions are not authoritative.';
    end if;

    select lower(pg_get_functiondef(
        'public.company_estimate_session_context_can_use(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure
    )) into v_context_definition;

    if v_context_definition !~ 'company_current_user_is_sales_tech'
       or v_context_definition !~ 'company_sales_context_matches_client_home' then
        raise exception 'Estimate sessions do not recognize the scoped Sales Visit authorization path.';
    end if;
end;
$$;

rollback;
