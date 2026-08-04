begin;

do $$
declare
    v_function_definition text;
    v_trigger_definition text;
begin
    if to_regprocedure('public.ensure_homeowner_acknowledgement_event()') is null then
        raise exception 'Homeowner acknowledgement guard function is missing.';
    end if;

    if not exists (
        select 1
        from pg_trigger
        where tgrelid = 'public.service_requests'::regclass
          and tgname = 'service_requests_ensure_homeowner_acknowledgement_event'
          and not tgisinternal
    ) then
        raise exception 'Homeowner acknowledgement guard trigger is missing.';
    end if;

    select pg_get_functiondef('public.ensure_homeowner_acknowledgement_event()'::regprocedure)
    into v_function_definition;

    if v_function_definition not ilike '%request_acknowledged%'
       or v_function_definition not ilike '%system_homeowner_update%'
       or v_function_definition not ilike '%homeowner-acknowledged:%'
       or v_function_definition not ilike '%push%'
       or v_function_definition not ilike '%sms%'
       or v_function_definition not ilike '%email%' then
        raise exception 'Acknowledgement guard must create a deduped homeowner-visible event with delivery channels.';
    end if;

    select pg_get_triggerdef(oid)
    into v_trigger_definition
    from pg_trigger
    where tgrelid = 'public.service_requests'::regclass
      and tgname = 'service_requests_ensure_homeowner_acknowledgement_event'
      and not tgisinternal;

    if v_trigger_definition not ilike '%after update%'
       or v_trigger_definition not ilike '%acknowledged_at%'
       or v_trigger_definition not ilike '%status%' then
        raise exception 'Acknowledgement guard must run after acknowledgement fields change.';
    end if;
end;
$$;

rollback;
