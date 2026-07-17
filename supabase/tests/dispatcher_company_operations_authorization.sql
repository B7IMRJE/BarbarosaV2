do $$
declare
    v_operations_def text;
    v_dispatch_def text;
    v_manage_def text;
    v_roster_def text;
    v_request_def text;
begin
    if to_regprocedure('public.can_dispatch_company_operations(uuid)') is null then
        raise exception 'can_dispatch_company_operations RPC is missing.';
    end if;

    if to_regprocedure('public.get_company_users_for_dispatch(uuid)') is null then
        raise exception 'get_company_users_for_dispatch RPC is missing.';
    end if;

    v_operations_def := pg_get_functiondef('public.can_dispatch_company_operations(uuid)'::regprocedure);
    v_dispatch_def := pg_get_functiondef('public.can_dispatch_company(uuid)'::regprocedure);
    v_manage_def := pg_get_functiondef('public.can_manage_company_users(uuid)'::regprocedure);
    v_roster_def := pg_get_functiondef('public.get_company_users_for_dispatch(uuid)'::regprocedure);
    v_request_def := pg_get_functiondef('public.get_company_dispatch_requests(uuid)'::regprocedure);

    if v_operations_def not ilike '%security definer%' then
        raise exception 'can_dispatch_company_operations must remain security definer.';
    end if;

    if v_operations_def !~* 'set[[:space:]]+search_path[[:space:]]+(to|=)[[:space:]]+pg_catalog,[[:space:]]+public,[[:space:]]+pg_temp' then
        raise exception 'can_dispatch_company_operations must pin a safe search_path.';
    end if;

    if v_operations_def not ilike '%''dispatcher''%' then
        raise exception 'dispatcher role must be included in company operations authorization.';
    end if;

    if v_operations_def not ilike '%company_user.company_id = p_company_id%' then
        raise exception 'company operations authorization must remain company scoped.';
    end if;

    if v_operations_def not ilike '%auth.uid()%' then
        raise exception 'company operations authorization must bind to the authenticated user.';
    end if;

    if v_operations_def not ilike '%''active''%' then
        raise exception 'company operations authorization must require active membership.';
    end if;

    if v_dispatch_def not ilike '%can_dispatch_company_operations%' then
        raise exception 'can_dispatch_company must delegate to the shared operations helper.';
    end if;

    if v_manage_def ilike '%''dispatcher''%' or v_manage_def ilike '%''dispatch''%' or v_manage_def ilike '%''office''%' then
        raise exception 'can_manage_company_users must not grant dispatcher/office employee-management rights.';
    end if;

    if v_roster_def not ilike '%security definer%' then
        raise exception 'get_company_users_for_dispatch must remain security definer.';
    end if;

    if v_roster_def !~* 'set[[:space:]]+search_path[[:space:]]+(to|=)[[:space:]]+pg_catalog,[[:space:]]+public,[[:space:]]+pg_temp' then
        raise exception 'get_company_users_for_dispatch must pin a safe search_path.';
    end if;

    if v_roster_def not ilike '%can_dispatch_company_operations%' then
        raise exception 'dispatch roster RPC must use the shared operations helper.';
    end if;

    if pg_get_function_result('public.get_company_users_for_dispatch(uuid)'::regprocedure) not ilike '%full_name text%' then
        raise exception 'dispatch roster RPC must return technician display names.';
    end if;

    if pg_get_function_result('public.get_company_users_for_dispatch(uuid)'::regprocedure) not ilike '%role text%' then
        raise exception 'dispatch roster RPC must return operational roles.';
    end if;

    if pg_get_function_result('public.get_company_users_for_dispatch(uuid)'::regprocedure) ilike '%permissions%' then
        raise exception 'dispatch roster RPC must not expose employee permission JSON.';
    end if;

    if v_request_def not ilike '%can_dispatch_company%' then
        raise exception 'dispatch request RPC must keep dispatch authorization.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'job_schedule_slots'
          and policyname = 'job_schedule_slots_dispatch_operations_select'
          and qual ilike '%can_dispatch_company_operations%'
    ) then
        raise exception 'job_schedule_slots dispatch select policy is missing.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'service_requests'
          and policyname = 'service_requests_dispatch_operations_select'
          and qual ilike '%can_dispatch_company_operations%'
    ) then
        raise exception 'service_requests dispatch select policy is missing.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'service_request_events'
          and policyname = 'service_request_events_dispatch_operations_select'
          and qual ilike '%can_dispatch_company_operations%'
    ) then
        raise exception 'service_request_events dispatch select policy is missing.';
    end if;

    if exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and policyname in (
              'job_schedule_slots_dispatch_operations_select',
              'service_requests_dispatch_operations_select',
              'service_request_events_dispatch_operations_select'
          )
          and qual !~~ '%company_id%'
    ) then
        raise exception 'dispatch operations policies must stay company scoped.';
    end if;
end;
$$;

select 'dispatcher_company_operations_authorization_ok' as result;
