begin;

do $$
begin
    if has_table_privilege('anon', 'public.company_estimate_presentation_sessions', 'select')
       or has_table_privilege('authenticated', 'public.company_estimate_presentation_sessions', 'select') then
        raise exception 'Presentation session tables must not be directly readable.';
    end if;
    if has_table_privilege('anon', 'public.company_estimate_presentation_events', 'select')
       or has_table_privilege('authenticated', 'public.company_estimate_presentation_events', 'select') then
        raise exception 'Presentation audit tables must not be directly readable.';
    end if;
    if not has_function_privilege('anon', 'public.join_estimate_presentation_session(text,text)', 'execute')
       or not has_function_privilege('anon', 'public.get_joined_estimate_presentation(text)', 'execute')
       or not has_function_privilege('anon', 'public.sign_joined_estimate_presentation(text,text,text)', 'execute') then
        raise exception 'Anonymous viewers need only the three token-gated presentation RPCs.';
    end if;
    if has_function_privilege('anon', 'public.create_estimate_presentation_session(uuid,text[],uuid[],boolean,boolean,integer)', 'execute')
       or has_function_privilege('anon', 'public.update_estimate_presentation_session(uuid,text[],uuid[],boolean,boolean)', 'execute')
       or has_function_privilege('anon', 'public.end_estimate_presentation_session(uuid,text)', 'execute') then
        raise exception 'Anonymous viewers must never manage presentation sessions.';
    end if;
    if has_function_privilege('anon', 'public.strip_unselected_estimate_presentation_prices()', 'execute')
       or has_function_privilege('authenticated', 'public.strip_unselected_estimate_presentation_prices()', 'execute') then
        raise exception 'Presentation payload scrubbing must remain server-only.';
    end if;
    if has_function_privilege('anon', 'public.attach_estimate_presentation_service_type()', 'execute')
       or has_function_privilege('authenticated', 'public.attach_estimate_presentation_service_type()', 'execute') then
        raise exception 'Presentation service-type attachment must remain server-only.';
    end if;
end;
$$;

rollback;
