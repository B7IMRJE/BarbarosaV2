begin;

do $$
declare
    v_send_definition text;
    v_inbox_definition text;
begin
    if to_regclass('public.service_request_dispatch_messages') is null then
        raise exception 'Dispatch chat message table is missing.';
    end if;

    if to_regclass('public.service_request_dispatch_chat_reads') is null then
        raise exception 'Dispatch chat read-state table is missing.';
    end if;

    if to_regprocedure('public.send_service_request_dispatch_chat_message(uuid,uuid,text)') is null
       or to_regprocedure('public.get_service_request_dispatch_chat_messages(uuid,uuid)') is null
       or to_regprocedure('public.get_company_dispatch_chat_inbox(uuid)') is null
       or to_regprocedure('public.mark_service_request_dispatch_chat_read(uuid,uuid)') is null then
        raise exception 'One or more Dispatch chat RPCs are missing.';
    end if;

    select pg_get_functiondef('public.send_service_request_dispatch_chat_message(uuid,uuid,text)'::regprocedure)
    into v_send_definition;

    if v_send_definition not ilike '%service_request_dispatch_chat_can_access%'
       or v_send_definition not ilike '%can_dispatch_company%'
       or v_send_definition not ilike '%job_schedule_slots%'
       or v_send_definition not ilike '%2000%' then
        raise exception 'Dispatch chat send RPC must enforce participant scope and message limits.';
    end if;

    select pg_get_functiondef('public.get_company_dispatch_chat_inbox(uuid)'::regprocedure)
    into v_inbox_definition;

    if v_inbox_definition not ilike '%sender_role = ''technician''%'
       or v_inbox_definition not ilike '%last_read_at%'
       or v_inbox_definition not ilike '%unread_count%' then
        raise exception 'Dispatch inbox must calculate unread technician messages from persistent read state.';
    end if;

    if pg_get_functiondef('public.mark_service_request_dispatch_chat_read(uuid,uuid)'::regprocedure)
        not ilike '%max(chat_message.created_at)%' then
        raise exception 'Dispatch chat read state must stop at the latest message actually observed.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'service_request_dispatch_messages'
          and policyname = 'service_request_dispatch_messages_select_participants'
    ) then
        raise exception 'Dispatch chat participant select policy is missing.';
    end if;
end;
$$;

rollback;
