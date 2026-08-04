-- Add a company-scoped technician <-> Dispatch chat channel for assigned
-- service requests. Direct writes stay closed; authenticated clients use the
-- guarded RPCs below.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before Dispatch chat can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before Dispatch chat can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before Dispatch chat can be installed.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before Dispatch chat can be installed.';
    end if;
end;
$$;

create table if not exists public.service_request_dispatch_messages (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    service_request_id uuid not null references public.service_requests(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    schedule_slot_id uuid null references public.job_schedule_slots(id) on delete set null,
    sender_user_id uuid not null references auth.users(id) on delete cascade,
    sender_company_user_id uuid null references public.company_users(id) on delete set null,
    sender_role text not null,
    sender_name text not null,
    message text not null,
    created_at timestamptz not null default now(),
    constraint service_request_dispatch_messages_sender_role_check
        check (lower(btrim(sender_role)) in ('dispatch', 'technician')),
    constraint service_request_dispatch_messages_sender_name_check
        check (nullif(btrim(sender_name), '') is not null),
    constraint service_request_dispatch_messages_message_check
        check (char_length(btrim(message)) between 1 and 2000)
);

create index if not exists service_request_dispatch_messages_company_created_idx
    on public.service_request_dispatch_messages (company_id, created_at desc);

create index if not exists service_request_dispatch_messages_request_created_idx
    on public.service_request_dispatch_messages (service_request_id, created_at asc);

create table if not exists public.service_request_dispatch_chat_reads (
    company_id uuid not null references public.companies(id) on delete cascade,
    service_request_id uuid not null references public.service_requests(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    last_read_at timestamptz not null default now(),
    primary key (company_id, service_request_id, user_id)
);

alter table public.service_request_dispatch_messages enable row level security;
alter table public.service_request_dispatch_chat_reads enable row level security;

create or replace function public.service_request_dispatch_chat_can_access(
    p_company_id uuid,
    p_service_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and p_service_request_id is not null
       and exists (
            select 1
            from public.service_requests as request
            where request.id = p_service_request_id
              and request.company_id = p_company_id
       )
       and (
            public.can_dispatch_company(p_company_id)
            or exists (
                select 1
                from public.job_schedule_slots as slot
                join public.company_users as company_user
                  on company_user.id = slot.technician_company_user_id
                 and company_user.company_id = slot.company_id
                where slot.company_id = p_company_id
                  and slot.service_request_id = p_service_request_id
                  and company_user.auth_user_id = auth.uid()
                  and lower(btrim(coalesce(company_user.status, ''))) = 'active'
            )
       );
$$;

revoke all on function public.service_request_dispatch_chat_can_access(uuid, uuid) from public, anon;
grant execute on function public.service_request_dispatch_chat_can_access(uuid, uuid) to authenticated;

drop policy if exists service_request_dispatch_messages_select_participants
    on public.service_request_dispatch_messages;

create policy service_request_dispatch_messages_select_participants
    on public.service_request_dispatch_messages
    for select
    to authenticated
    using (
        public.service_request_dispatch_chat_can_access(company_id, service_request_id)
    );

revoke insert, update, delete on table public.service_request_dispatch_messages from authenticated;
revoke all on table public.service_request_dispatch_chat_reads from authenticated;
grant select on table public.service_request_dispatch_messages to authenticated;

create or replace function public.send_service_request_dispatch_chat_message(
    p_company_id uuid,
    p_service_request_id uuid,
    p_message text
)
returns table (
    id uuid,
    company_id uuid,
    service_request_id uuid,
    property_id uuid,
    schedule_slot_id uuid,
    sender_user_id uuid,
    sender_company_user_id uuid,
    sender_role text,
    sender_name text,
    message text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_request public.service_requests%rowtype;
    v_company_user public.company_users%rowtype;
    v_schedule_slot_id uuid;
    v_sender_role text;
    v_message text := nullif(btrim(coalesce(p_message, '')), '');
    v_saved public.service_request_dispatch_messages%rowtype;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    if v_message is null then
        raise exception 'Message is required.';
    end if;

    if char_length(v_message) > 2000 then
        raise exception 'Message must be 2000 characters or fewer.';
    end if;

    if not public.service_request_dispatch_chat_can_access(p_company_id, p_service_request_id) then
        raise exception 'Not authorized to use Dispatch chat for this request.';
    end if;

    select request.*
    into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id;

    if public.can_dispatch_company(p_company_id) then
        v_sender_role := 'dispatch';

        select company_user.*
        into v_company_user
        from public.company_users as company_user
        where company_user.company_id = p_company_id
          and company_user.auth_user_id = v_user_id
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
        order by company_user.created_at desc nulls last, company_user.id desc
        limit 1;
    else
        v_sender_role := 'technician';

        select company_user, slot.id
        into v_company_user, v_schedule_slot_id
        from public.job_schedule_slots as slot
        join public.company_users as company_user
          on company_user.id = slot.technician_company_user_id
         and company_user.company_id = slot.company_id
        where slot.company_id = p_company_id
          and slot.service_request_id = p_service_request_id
          and company_user.auth_user_id = v_user_id
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
        order by slot.updated_at desc nulls last, slot.created_at desc nulls last, slot.id desc
        limit 1;
    end if;

    insert into public.service_request_dispatch_messages (
        company_id,
        service_request_id,
        property_id,
        schedule_slot_id,
        sender_user_id,
        sender_company_user_id,
        sender_role,
        sender_name,
        message
    )
    values (
        p_company_id,
        p_service_request_id,
        v_request.property_id,
        v_schedule_slot_id,
        v_user_id,
        v_company_user.id,
        v_sender_role,
        coalesce(
            nullif(btrim(coalesce(v_company_user.full_name, '')), ''),
            case when v_sender_role = 'dispatch' then 'Dispatch' else 'Technician' end
        ),
        v_message
    )
    returning * into v_saved;

    return query
    select
        v_saved.id,
        v_saved.company_id,
        v_saved.service_request_id,
        v_saved.property_id,
        v_saved.schedule_slot_id,
        v_saved.sender_user_id,
        v_saved.sender_company_user_id,
        v_saved.sender_role,
        v_saved.sender_name,
        v_saved.message,
        v_saved.created_at;
end;
$$;

create or replace function public.get_service_request_dispatch_chat_messages(
    p_company_id uuid,
    p_service_request_id uuid
)
returns table (
    id uuid,
    company_id uuid,
    service_request_id uuid,
    property_id uuid,
    schedule_slot_id uuid,
    sender_user_id uuid,
    sender_company_user_id uuid,
    sender_role text,
    sender_name text,
    message text,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.service_request_dispatch_chat_can_access(p_company_id, p_service_request_id) then
        raise exception 'Not authorized to view Dispatch chat for this request.';
    end if;

    return query
    select recent.*
    from (
        select
            chat_message.id,
            chat_message.company_id,
            chat_message.service_request_id,
            chat_message.property_id,
            chat_message.schedule_slot_id,
            chat_message.sender_user_id,
            chat_message.sender_company_user_id,
            chat_message.sender_role,
            chat_message.sender_name,
            chat_message.message,
            chat_message.created_at
        from public.service_request_dispatch_messages as chat_message
        where chat_message.company_id = p_company_id
          and chat_message.service_request_id = p_service_request_id
        order by chat_message.created_at desc, chat_message.id desc
        limit 200
    ) as recent
    order by recent.created_at asc, recent.id asc;
end;
$$;

create or replace function public.get_company_dispatch_chat_inbox(
    p_company_id uuid
)
returns table (
    service_request_id uuid,
    display_code text,
    issue_summary text,
    technician_name text,
    latest_message text,
    latest_sender_role text,
    latest_message_at timestamptz,
    unread_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.can_dispatch_company(p_company_id) then
        raise exception 'Not authorized to view this Dispatch chat inbox.';
    end if;

    return query
    select
        request.id,
        request.display_code,
        request.issue_summary,
        coalesce(latest_technician.sender_name, 'Technician')::text,
        latest_message.message,
        latest_message.sender_role,
        latest_message.created_at,
        (
            select count(*)
            from public.service_request_dispatch_messages as unread
            where unread.company_id = p_company_id
              and unread.service_request_id = request.id
              and unread.sender_role = 'technician'
              and unread.created_at > coalesce(read_state.last_read_at, '-infinity'::timestamptz)
        )::bigint
    from public.service_requests as request
    join lateral (
        select chat_message.*
        from public.service_request_dispatch_messages as chat_message
        where chat_message.company_id = p_company_id
          and chat_message.service_request_id = request.id
        order by chat_message.created_at desc, chat_message.id desc
        limit 1
    ) as latest_message on true
    left join lateral (
        select chat_message.sender_name
        from public.service_request_dispatch_messages as chat_message
        where chat_message.company_id = p_company_id
          and chat_message.service_request_id = request.id
          and chat_message.sender_role = 'technician'
        order by chat_message.created_at desc, chat_message.id desc
        limit 1
    ) as latest_technician on true
    left join public.service_request_dispatch_chat_reads as read_state
      on read_state.company_id = p_company_id
     and read_state.service_request_id = request.id
     and read_state.user_id = auth.uid()
    where request.company_id = p_company_id
    order by
        case when latest_message.sender_role = 'technician'
                  and latest_message.created_at > coalesce(read_state.last_read_at, '-infinity'::timestamptz)
            then 0 else 1 end,
        latest_message.created_at desc,
        request.id desc;
end;
$$;

create or replace function public.mark_service_request_dispatch_chat_read(
    p_company_id uuid,
    p_service_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_last_message_at timestamptz;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.service_request_dispatch_chat_can_access(p_company_id, p_service_request_id) then
        raise exception 'Not authorized to update Dispatch chat read state.';
    end if;

    select max(chat_message.created_at)
    into v_last_message_at
    from public.service_request_dispatch_messages as chat_message
    where chat_message.company_id = p_company_id
      and chat_message.service_request_id = p_service_request_id;

    insert into public.service_request_dispatch_chat_reads (
        company_id,
        service_request_id,
        user_id,
        last_read_at
    )
    values (
        p_company_id,
        p_service_request_id,
        auth.uid(),
        coalesce(v_last_message_at, now())
    )
    on conflict (company_id, service_request_id, user_id) do update
    set last_read_at = greatest(
        public.service_request_dispatch_chat_reads.last_read_at,
        excluded.last_read_at
    );
end;
$$;

revoke all on function public.send_service_request_dispatch_chat_message(uuid, uuid, text) from public, anon;
revoke all on function public.get_service_request_dispatch_chat_messages(uuid, uuid) from public, anon;
revoke all on function public.get_company_dispatch_chat_inbox(uuid) from public, anon;
revoke all on function public.mark_service_request_dispatch_chat_read(uuid, uuid) from public, anon;

grant execute on function public.send_service_request_dispatch_chat_message(uuid, uuid, text) to authenticated;
grant execute on function public.get_service_request_dispatch_chat_messages(uuid, uuid) to authenticated;
grant execute on function public.get_company_dispatch_chat_inbox(uuid) to authenticated;
grant execute on function public.mark_service_request_dispatch_chat_read(uuid, uuid) to authenticated;

do $$
begin
    if exists (
        select 1
        from pg_publication
        where pubname = 'supabase_realtime'
    ) and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'service_request_dispatch_messages'
    ) then
        alter publication supabase_realtime add table public.service_request_dispatch_messages;
    end if;
end;
$$;

commit;
