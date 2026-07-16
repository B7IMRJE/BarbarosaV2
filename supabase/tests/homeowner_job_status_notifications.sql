do $$
begin
    if to_regclass('public.homeowner_notification_preferences') is null then
        raise exception 'homeowner_notification_preferences table is missing.';
    end if;

    if to_regclass('public.homeowner_push_devices') is null then
        raise exception 'homeowner_push_devices table is missing.';
    end if;

    if to_regclass('public.service_notification_deliveries') is null then
        raise exception 'service_notification_deliveries table is missing.';
    end if;

    if to_regprocedure('public.record_service_request_visit_status(uuid,uuid,uuid,text,text,text,text,jsonb)') is null then
        raise exception 'record_service_request_visit_status RPC is missing.';
    end if;

    if to_regprocedure('public.mark_homeowner_service_notification_read(uuid)') is null then
        raise exception 'mark_homeowner_service_notification_read RPC is missing.';
    end if;

    if to_regprocedure('public.acknowledge_service_request(uuid,uuid)') is null then
        raise exception 'acknowledge_service_request RPC is missing.';
    end if;

    if to_regprocedure('public.create_homeowner_service_request(uuid,uuid,text,text,text)') is null then
        raise exception 'create_homeowner_service_request RPC is missing.';
    end if;

    if pg_get_function_result('public.create_homeowner_service_request(uuid,uuid,text,text,text)'::regprocedure) not ilike '%display_code text%' then
        raise exception 'create_homeowner_service_request must return display_code for homeowner request references.';
    end if;

    if pg_get_functiondef('public.acknowledge_service_request(uuid,uuid)'::regprocedure) not ilike '%homeowner-acknowledged:%' then
        raise exception 'acknowledge_service_request must dedupe homeowner acknowledge activity.';
    end if;

    if pg_get_functiondef('public.acknowledge_service_request(uuid,uuid)'::regprocedure) not ilike '%request_acknowledged%' then
        raise exception 'acknowledge_service_request must create request_acknowledged activity.';
    end if;

    if not exists (
        select 1
        from pg_trigger
        where tgname = 'service_request_events_queue_homeowner_deliveries'
          and tgrelid = 'public.service_request_events'::regclass
    ) then
        raise exception 'homeowner delivery queue trigger is missing.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.service_notification_deliveries'::regclass
          and conname = 'service_notification_deliveries_status_check'
    ) then
        raise exception 'delivery status check constraint is missing.';
    end if;
end;
$$;

select 'homeowner_job_status_notifications_ok' as result;
