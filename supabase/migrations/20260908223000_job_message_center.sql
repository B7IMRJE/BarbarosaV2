-- Job conversations remain company records. Customer communication is a separate store.
begin;

create table public.job_message_participants (
 company_id uuid not null references public.companies(id),
 service_request_id uuid not null references public.service_requests(id),
 company_user_id uuid not null references public.company_users(id) on delete cascade,
 added_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 primary key(company_id,service_request_id,company_user_id)
);
create table public.job_supervisor_requests (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 service_request_id uuid not null references public.service_requests(id),
 requested_by uuid references auth.users(id) on delete set null,
 recipient_company_user_id uuid references public.company_users(id) on delete set null,
 recipient_name text not null,
 question text not null check(char_length(btrim(question)) between 1 and 2000),
 status text not null default 'pending' check(status in ('pending','acknowledged','resolved')),
 notification_status text not null default 'queued' check(notification_status in ('queued','sending','accepted','unavailable','failed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index job_supervisor_requests_inbox on public.job_supervisor_requests(company_id,recipient_company_user_id,status,created_at desc);
create index job_message_participants_user on public.job_message_participants(company_user_id,company_id);
alter table public.job_message_participants enable row level security;
alter table public.job_supervisor_requests enable row level security;
revoke all on public.job_message_participants, public.job_supervisor_requests from anon,authenticated;

-- Archive jobs with company conversation history instead of cascading their deletion.
alter table public.service_request_dispatch_messages drop constraint service_request_dispatch_messages_service_request_id_fkey;
alter table public.service_request_dispatch_messages add constraint service_request_dispatch_messages_service_request_id_fkey foreign key(service_request_id) references public.service_requests(id) on delete restrict;
-- Removing an employee/account must not erase company conversation history.
alter table public.service_request_dispatch_messages drop constraint service_request_dispatch_messages_sender_user_id_fkey;
alter table public.service_request_dispatch_messages alter column sender_user_id drop not null;
alter table public.service_request_dispatch_messages add constraint service_request_dispatch_messages_sender_user_id_fkey foreign key(sender_user_id) references auth.users(id) on delete set null;
alter table public.service_request_dispatch_messages drop constraint service_request_dispatch_messages_sender_role_check;
alter table public.service_request_dispatch_messages add constraint service_request_dispatch_messages_sender_role_check check(sender_role in ('dispatch','technician','supervisor','management'));

create or replace function public.service_request_dispatch_chat_can_access(p_company_id uuid,p_service_request_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select auth.uid() is not null
 and exists(select 1 from public.service_requests r where r.id=p_service_request_id and r.company_id=p_company_id)
 and exists(
 select 1 from public.company_users u where u.company_id=p_company_id and u.auth_user_id=auth.uid() and u.status='active'
 and coalesce((public.resolve_company_user_permissions_for_company(u.company_id,u.role,u.status,u.permissions)->>'can_view_jobs')::boolean,false)
 and (
 public.company_user_has_permission(p_company_id,'can_view_all_job_messages')
 or public.can_dispatch_company(p_company_id)
 or exists(select 1 from public.job_message_participants p where p.company_id=p_company_id and p.service_request_id=p_service_request_id and p.company_user_id=u.id)
 or exists(select 1 from public.job_schedule_slots s where s.company_id=p_company_id and s.service_request_id=p_service_request_id and s.technician_company_user_id=u.id)
 or exists(select 1 from public.job_schedule_slots s join public.job_assignments a on a.job_id=s.job_id and a.company_id=s.company_id where s.company_id=p_company_id and s.service_request_id=p_service_request_id and a.technician_auth_user_id=auth.uid() and coalesce(a.status,'active') not in ('removed','revoked','cancelled','canceled'))
 ));
$$;

create or replace function public.get_job_message_directory(p_company_id uuid,p_archived boolean default false,p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 declare result jsonb; begin
 if not exists(select 1 from public.company_users u where u.company_id=p_company_id and u.auth_user_id=auth.uid() and u.status='active') then raise exception 'Active company access required.'; end if;
 select coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb) into result from (
 select r.id,r.display_code,r.issue_summary,r.status,r.property_id,
 coalesce(p.name,p.address,'Home') as property_name,
 coalesce(tech.full_name,'Unassigned technician') as technician_name,
 latest.message as latest_internal_message, latest.created_at as latest_message_at,
 customer.message as latest_customer_message,
 (select count(*) from public.service_request_dispatch_messages m where m.company_id=r.company_id and m.service_request_id=r.id and m.sender_user_id is distinct from auth.uid() and m.created_at>coalesce(rd.last_read_at,'-infinity')) as unread_count,
 (select count(*) from public.job_supervisor_requests h where h.company_id=r.company_id and h.service_request_id=r.id and h.status='pending') as help_count,
 (select count(*) from public.service_request_events e where e.company_id=r.company_id and e.service_request_id=r.id and e.event_visibility='homeowner_visible' and e.event_type='communication_message' and e.created_by_user_id is distinct from auth.uid() and e.created_at>coalesce(cr.last_read_at,'-infinity')) as customer_unread_count
 from public.service_requests r
 left join public.properties p on p.id=r.property_id
 left join lateral(select s.technician_company_user_id from public.job_schedule_slots s where s.company_id=r.company_id and s.service_request_id=r.id order by s.created_at desc limit 1) slot on true
 left join public.company_users tech on tech.id=slot.technician_company_user_id and tech.company_id=r.company_id
 left join lateral(select m.message,m.created_at from public.service_request_dispatch_messages m where m.company_id=r.company_id and m.service_request_id=r.id order by m.created_at desc,m.id desc limit 1) latest on true
 left join lateral(select e.message from public.service_request_events e where e.company_id=r.company_id and e.service_request_id=r.id and e.event_type='communication_message' and e.event_visibility='homeowner_visible' order by e.created_at desc limit 1) customer on true
 left join public.service_request_dispatch_chat_reads rd on rd.company_id=r.company_id and rd.service_request_id=r.id and rd.user_id=auth.uid()
 left join public.job_customer_message_reads cr on cr.company_id=r.company_id and cr.service_request_id=r.id and cr.user_id=auth.uid()
 where r.company_id=p_company_id and public.service_request_dispatch_chat_can_access(r.company_id,r.id)
 and (lower(coalesce(r.status,'')) in ('closed','completed','cancelled','canceled','rejected','declined','archived'))=p_archived
 and (coalesce(p_search,'')='' or concat_ws(' ',r.display_code,r.issue_summary,p.name,tech.full_name) ilike '%'||left(p_search,100)||'%')
 order by help_count desc, greatest(coalesce(latest.created_at,r.created_at),r.updated_at) desc,r.id
 limit 40 offset greatest(0,least(coalesce(p_offset,0),10000))
 ) rows;
 return result;
 end $$;

create table public.job_customer_message_reads (
 company_id uuid not null references public.companies(id),
 service_request_id uuid not null references public.service_requests(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 last_read_at timestamptz not null default now(),
 primary key(company_id,service_request_id,user_id)
);
alter table public.job_customer_message_reads enable row level security;
revoke all on public.job_customer_message_reads from anon,authenticated;
create or replace function public.mark_job_customer_messages_read(p_company_id uuid,p_service_request_id uuid,p_seen_at timestamptz default null)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
 begin
 if not public.service_request_dispatch_chat_can_access(p_company_id,p_service_request_id) then raise exception 'Not authorized.'; end if;
 if p_seen_at is null then return; end if;
 insert into public.job_customer_message_reads(company_id,service_request_id,user_id,last_read_at)
 select p_company_id,p_service_request_id,auth.uid(),coalesce(max(e.created_at),now()) from public.service_request_events e where e.company_id=p_company_id and e.service_request_id=p_service_request_id and e.event_visibility='homeowner_visible' and e.created_at <= coalesce(p_seen_at,'-infinity')
 on conflict(company_id,service_request_id,user_id) do update set last_read_at=greatest(public.job_customer_message_reads.last_read_at,excluded.last_read_at);
 end $$;

create or replace function public.get_job_supervisor_choices(p_company_id uuid,p_service_request_id uuid)
returns table(id uuid,full_name text,role text) language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 begin
 if not public.service_request_dispatch_chat_can_access(p_company_id,p_service_request_id) then raise exception 'Not authorized.'; end if;
 return query select u.id,coalesce(u.full_name,'Team member'),u.role from public.company_users u
 where u.company_id=p_company_id and u.status='active' and u.auth_user_id is not null and u.auth_user_id<>auth.uid()

 and coalesce((public.resolve_company_user_permissions_for_company(u.company_id,u.role,u.status,u.permissions)->>'can_view_jobs')::boolean,false)
 order by u.full_name;
 end $$;
create or replace function public.request_job_supervisor(p_company_id uuid,p_service_request_id uuid,p_recipient_company_user_id uuid,p_question text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
 declare recipient record; request_id uuid; begin
 if not public.service_request_dispatch_chat_can_access(p_company_id,p_service_request_id) then raise exception 'Not authorized.'; end if;
 select * into recipient from public.get_job_supervisor_choices(p_company_id,p_service_request_id) where id=p_recipient_company_user_id;
 if not found then raise exception 'Choose an active supervisor in this company.'; end if;
 if char_length(btrim(coalesce(p_question,''))) not between 1 and 2000 then raise exception 'Describe the help you need.'; end if;
 -- Serialize repeat taps for this requester/job/recipient; an open request is reused.
 perform pg_advisory_xact_lock(hashtextextended(p_service_request_id::text||p_recipient_company_user_id::text||auth.uid()::text,0));
 select h.id into request_id from public.job_supervisor_requests h where h.company_id=p_company_id and h.service_request_id=p_service_request_id and h.requested_by=auth.uid() and h.recipient_company_user_id=p_recipient_company_user_id and h.status='pending' order by h.created_at desc limit 1;
 if found then return request_id; end if;
 insert into public.job_message_participants(company_id,service_request_id,company_user_id,added_by)
 values(p_company_id,p_service_request_id,p_recipient_company_user_id,auth.uid()) on conflict do nothing;
 insert into public.job_supervisor_requests(company_id,service_request_id,requested_by,recipient_company_user_id,recipient_name,question)
 values(p_company_id,p_service_request_id,auth.uid(),p_recipient_company_user_id,recipient.full_name,btrim(p_question)) returning id into request_id;
 perform public.send_service_request_dispatch_chat_message(p_company_id,p_service_request_id,'Help requested from '||recipient.full_name||': '||left(btrim(p_question),1850));
 return request_id;
 end $$;
create or replace function public.get_job_supervisor_requests(p_company_id uuid,p_service_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 begin
 if not public.service_request_dispatch_chat_can_access(p_company_id,p_service_request_id) then raise exception 'Not authorized.'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from (
 select h.id,h.recipient_name,h.question,h.status,h.notification_status,h.created_at,
 (u.auth_user_id=auth.uid() or h.requested_by=auth.uid() or public.can_manage_company_users(p_company_id)) as can_update
 from public.job_supervisor_requests h left join public.company_users u on u.id=h.recipient_company_user_id and u.company_id=h.company_id
 where h.company_id=p_company_id and h.service_request_id=p_service_request_id order by h.created_at desc limit 40) t);
 end $$;
create or replace function public.update_job_supervisor_request(p_request_id uuid,p_status text)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
 declare h public.job_supervisor_requests%rowtype; begin
 select * into h from public.job_supervisor_requests where id=p_request_id for update;
 if not found or not public.service_request_dispatch_chat_can_access(h.company_id,h.service_request_id) then raise exception 'Not authorized.'; end if;
 if not (h.requested_by=auth.uid() or public.can_manage_company_users(h.company_id) or exists(select 1 from public.company_users u where u.id=h.recipient_company_user_id and u.auth_user_id=auth.uid() and u.status='active')) then raise exception 'Only the recipient, requester, or main management can update this request.'; end if;
 if p_status not in ('acknowledged','resolved') then raise exception 'Invalid status.'; end if;
 update public.job_supervisor_requests set status=p_status,updated_at=now() where id=h.id;
 end $$;
-- Only the delivery worker can claim a targeted phone notification. It supplies the verified caller.
create or replace function public.claim_job_supervisor_notification(p_request_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
 declare h public.job_supervisor_requests%rowtype; recipient uuid; begin
 select * into h from public.job_supervisor_requests where id=p_request_id for update;
 if not found or h.requested_by is distinct from p_actor_id then raise exception 'Not authorized.'; end if;
 if h.notification_status='accepted' then return null; end if;
 if h.notification_status='sending' and h.updated_at>now()-interval '2 minutes' then return null; end if;
 if h.notification_status in ('failed','unavailable') and h.updated_at>now()-interval '1 minute' then return null; end if;
 if not exists(select 1 from public.company_users u where u.company_id=h.company_id and u.auth_user_id=p_actor_id and u.status='active') then raise exception 'Membership inactive.'; end if;
 select u.auth_user_id into recipient from public.company_users u where u.id=h.recipient_company_user_id and u.company_id=h.company_id and u.status='active';
 if recipient is null then update public.job_supervisor_requests set notification_status='unavailable',updated_at=now() where id=h.id; return null; end if;
 update public.job_supervisor_requests set notification_status='sending',updated_at=now() where id=h.id;
 return jsonb_build_object('id',h.id,'company_id',h.company_id,'service_request_id',h.service_request_id,'recipient_user_id',recipient);
 end $$;
revoke all on function public.claim_job_supervisor_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_job_supervisor_notification(uuid,uuid) to service_role;

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
    v_technician_company_user_id uuid;
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

    select u.* into v_company_user from public.company_users u
    where u.company_id=p_company_id and u.auth_user_id=v_user_id and u.status='active' limit 1;
    v_sender_role := case when v_company_user.role in ('owner','admin','manager') then 'management'
       when v_company_user.role in ('field_supervisor','office_supervisor','supervisor') then 'supervisor'
       when public.can_dispatch_company(p_company_id) then 'dispatch' else 'technician' end;

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

create or replace function public.job_message_is_homeowner(p_property_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select auth.uid() is not null and (public.homeos_has_active_property_membership(p_property_id) or exists(select 1 from public.properties p where p.id=p_property_id and p.owner_id=auth.uid()));
$$;

create or replace function public.get_service_request_communication_thread(
    p_company_id uuid,
    p_service_request_id uuid
)
returns table (
    id uuid,
    service_request_id uuid,
    company_id uuid,
    property_id uuid,
    event_type text,
    message text,
    event_visibility text,
    audience text,
    schedule_slot_id uuid,
    dedupe_key text,
    metadata jsonb,
    notification_channels text[],
    notification_status text,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;

    select request.* into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id;

    if not found then raise exception 'Service request not found for this company.'; end if;

    if not public.job_message_is_homeowner(v_request.property_id)
       and not public.service_request_dispatch_chat_can_access(p_company_id,p_service_request_id)
 then
        raise exception 'Not authorized to view this service request communication thread.';
    end if;

    return query
    select
        event.id,
        event.service_request_id,
        event.company_id,
        event.property_id,
        event.event_type,
        event.message,
        event.event_visibility,
        event.audience,
        event.schedule_slot_id,
        event.dedupe_key,
        event.metadata,
        event.notification_channels,
        event.notification_status,
        event.created_at
    from public.service_request_events as event
    where event.company_id = p_company_id
      and event.service_request_id = p_service_request_id
      and event.event_visibility = 'homeowner_visible'
      and (
          lower(btrim(event.event_type)) = 'communication_message'
          or lower(btrim(event.event_type)) = 'homeowner_note'
          or lower(btrim(coalesce(event.metadata ->> 'thread_kind', ''))) = 'customer_communication'
      )
    order by event.created_at asc nulls last, event.id asc;
end;
$$;

create or replace function public.send_service_request_communication_message(
    p_company_id uuid,
    p_service_request_id uuid,
    p_message text,
    p_schedule_slot_id uuid default null
)
returns table (
    id uuid,
    service_request_id uuid,
    company_id uuid,
    property_id uuid,
    event_type text,
    message text,
    event_visibility text,
    audience text,
    schedule_slot_id uuid,
    dedupe_key text,
    metadata jsonb,
    notification_channels text[],
    notification_status text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_event public.service_request_events%rowtype;
    v_sender_company_user_id uuid;
    v_sender_role text;
    v_sender_name text;
    v_slot_id uuid;
    v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if p_company_id is null or p_service_request_id is null then
        raise exception 'Company and service request are required.';
    end if;
    if v_message is null then raise exception 'Message is required.'; end if;
    if char_length(v_message) > 2000 then raise exception 'Message must be 2000 characters or fewer.'; end if;

    select request.* into v_request
    from public.service_requests as request
    where request.id = p_service_request_id
      and request.company_id = p_company_id;

    if not found then raise exception 'Service request not found for this company.'; end if;

    if p_schedule_slot_id is not null
       and not exists (
            select 1
            from public.job_schedule_slots as requested_slot
            where requested_slot.id = p_schedule_slot_id
              and requested_slot.company_id = p_company_id
              and requested_slot.service_request_id = p_service_request_id
       ) then
        raise exception 'Schedule slot does not belong to this service request.';
    end if;

    if public.job_message_is_homeowner(v_request.property_id) then
        v_sender_role := 'homeowner';
        v_sender_name := 'Homeowner';
    elsif public.service_request_dispatch_chat_can_access(p_company_id,p_service_request_id) then
        v_sender_role := case when public.can_dispatch_company(p_company_id) then 'dispatch' else 'technician' end;

        select
            company_user.id,
            coalesce(nullif(btrim(company_user.full_name), ''), 'Office / Dispatch')
        into v_sender_company_user_id, v_sender_name
        from public.company_users as company_user
        where company_user.company_id = p_company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
        order by company_user.created_at desc nulls last, company_user.id desc
        limit 1;

    else
        raise exception 'Not authorized to message this service request.';
    end if;

    insert into public.service_request_events (
        service_request_id,
        company_id,
        property_id,
        created_by_user_id,
        event_type,
        message,
        event_visibility,
        audience,
        schedule_slot_id,
        actor_user_id,
        actor_company_user_id,
        metadata,
        notification_channels,
        notification_status
    ) values (
        v_request.id,
        v_request.company_id,
        v_request.property_id,
        auth.uid(),
        'communication_message',
        v_message,
        'homeowner_visible',
        case when v_sender_role = 'homeowner' then 'dispatch' else 'homeowner' end,
        coalesce(p_schedule_slot_id, v_slot_id),
        auth.uid(),
        v_sender_company_user_id,
        jsonb_build_object(
            'source', 'service_request_communication_thread',
            'thread_kind', 'customer_communication',
            'sender_role', v_sender_role,
            'sender_name', v_sender_name
        ),
        array['in_app']::text[],
        'pending'
    )
    returning * into v_event;

    update public.service_requests
    set updated_at = now()
    where id = v_request.id;

    return query
    select
        v_event.id,
        v_event.service_request_id,
        v_event.company_id,
        v_event.property_id,
        v_event.event_type,
        v_event.message,
        v_event.event_visibility,
        v_event.audience,
        v_event.schedule_slot_id,
        v_event.dedupe_key,
        v_event.metadata,
        v_event.notification_channels,
        v_event.notification_status,
        v_event.created_at;
end;
$$;

revoke all on function public.get_job_message_directory(uuid,boolean,text,integer) from public,anon;
grant execute on function public.get_job_message_directory(uuid,boolean,text,integer) to authenticated;

revoke all on function public.mark_job_customer_messages_read(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.mark_job_customer_messages_read(uuid,uuid,timestamptz) to authenticated;

revoke all on function public.get_job_supervisor_choices(uuid,uuid) from public,anon;
grant execute on function public.get_job_supervisor_choices(uuid,uuid) to authenticated;

revoke all on function public.request_job_supervisor(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.request_job_supervisor(uuid,uuid,uuid,text) to authenticated;

revoke all on function public.get_job_supervisor_requests(uuid,uuid) from public,anon;
grant execute on function public.get_job_supervisor_requests(uuid,uuid) to authenticated;

revoke all on function public.update_job_supervisor_request(uuid,text) from public,anon;
grant execute on function public.update_job_supervisor_request(uuid,text) to authenticated;

revoke all on function public.job_message_is_homeowner(uuid) from public,anon;
grant execute on function public.job_message_is_homeowner(uuid) to authenticated;

create or replace function public.get_job_message_context(p_company_id uuid,p_service_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 begin
 if not public.service_request_dispatch_chat_can_access(p_company_id,p_service_request_id) then raise exception 'You do not have access to this job.'; end if;
 return (select jsonb_build_object('id',r.id,'display_code',r.display_code,'issue_summary',r.issue_summary,'status',r.status,'property_name',coalesce(p.name,p.address,'Home'),
 'events',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select e.event_type,e.message,e.created_at from public.service_request_events e where e.company_id=r.company_id and e.service_request_id=r.id and e.event_type not in ('communication_message','homeowner_note') order by e.created_at desc limit 20) t))
 from public.service_requests r left join public.properties p on p.id=r.property_id where r.company_id=p_company_id and r.id=p_service_request_id);
 end $$;
revoke all on function public.get_job_message_context(uuid,uuid) from public,anon;
grant execute on function public.get_job_message_context(uuid,uuid) to authenticated;
grant all on public.job_supervisor_requests,public.job_message_participants,public.job_customer_message_reads to service_role;
create or replace function public.mark_job_internal_messages_read(p_company_id uuid,p_service_request_id uuid,p_seen_at timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
 declare seen timestamptz; begin
 if not public.service_request_dispatch_chat_can_access(p_company_id,p_service_request_id) then raise exception 'Not authorized.'; end if;
 select max(m.created_at) into seen from public.service_request_dispatch_messages m where m.company_id=p_company_id and m.service_request_id=p_service_request_id and m.created_at<=p_seen_at;
 if seen is null then return; end if;
 insert into public.service_request_dispatch_chat_reads(company_id,service_request_id,user_id,last_read_at) values(p_company_id,p_service_request_id,auth.uid(),seen)
 on conflict(company_id,service_request_id,user_id) do update set last_read_at=greatest(public.service_request_dispatch_chat_reads.last_read_at,excluded.last_read_at);
 end $$;
revoke all on function public.mark_job_internal_messages_read(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.mark_job_internal_messages_read(uuid,uuid,timestamptz) to authenticated;

create or replace function public.get_job_message_companies()
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('company_id',u.company_id,'company_name',c.name,'role',u.role,'status',u.status) order by c.name),'[]'::jsonb)
 from public.company_users u join public.companies c on c.id=u.company_id
 where u.auth_user_id=auth.uid() and u.status='active'
 and public.company_user_has_permission(u.company_id,'can_view_jobs');
$$;
revoke all on function public.get_job_message_companies() from public,anon;
grant execute on function public.get_job_message_companies() to authenticated;

commit;
