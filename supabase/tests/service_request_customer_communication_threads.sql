begin;

do $$
declare
    v_get_definition text;
    v_send_definition text;
begin
    if to_regprocedure('public.get_service_request_communication_thread(uuid,uuid)') is null
       or to_regprocedure('public.send_service_request_communication_message(uuid,uuid,text,uuid)') is null then
        raise exception 'Customer communication thread RPCs are missing.';
    end if;

    select pg_get_functiondef('public.get_service_request_communication_thread(uuid,uuid)'::regprocedure)
    into v_get_definition;

    if v_get_definition not ilike '%homeos_can_read_property_record%'
       or v_get_definition not ilike '%can_dispatch_company%'
       or v_get_definition not ilike '%job_schedule_slots%'
       or v_get_definition not ilike '%communication_message%'
       or v_get_definition not ilike '%homeowner_note%' then
        raise exception 'Thread reads must be participant-scoped and preserve customer-visible history.';
    end if;

    select pg_get_functiondef('public.send_service_request_communication_message(uuid,uuid,text,uuid)'::regprocedure)
    into v_send_definition;

    if v_send_definition not ilike '%homeos_can_read_property_record%'
       or v_send_definition not ilike '%can_dispatch_company%'
       or v_send_definition not ilike '%service_request_id = p_service_request_id%'
       or v_send_definition not ilike '%char_length(v_message) > 2000%'
       or v_send_definition not ilike '%customer_communication%'
       or v_send_definition not ilike '%homeowner_visible%' then
        raise exception 'Thread sends must validate participants, request scope, message size, and customer visibility.';
    end if;

    if not has_function_privilege('authenticated', 'public.get_service_request_communication_thread(uuid,uuid)', 'execute')
       or not has_function_privilege('authenticated', 'public.send_service_request_communication_message(uuid,uuid,text,uuid)', 'execute') then
        raise exception 'Authenticated participants must be able to use the communication thread RPCs.';
    end if;
end;
$$;

rollback;
