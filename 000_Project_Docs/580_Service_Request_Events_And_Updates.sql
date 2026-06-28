-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Add notes/update-request events for HomeOS service requests and align
--   Dispatch Board access with dispatcher/office roles.
--
-- Safety:
--   - Events are scoped to service_requests by company_id and property_id.
--   - Homeowners can add notes/request updates only for their own readable
--     property request.
--   - Company dispatchers can read safe request events for their company.
--   - Private HomeOS photos/docs/history are not exposed here.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before service request events can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null then
        raise exception 'public.homeos_can_read_property_record(uuid) is required before service request events can be installed.';
    end if;

    if to_regprocedure('public.is_platform_admin()') is null then
        raise exception 'public.is_platform_admin() is required before service request events can be installed.';
    end if;
end
$$;

create or replace function public.can_dispatch_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           public.is_platform_admin()
           or exists (
               select 1
               from public.company_users company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'admin', 'manager', 'office', 'dispatcher')
           )
       );
$$;

create table if not exists public.service_request_events (
    id uuid primary key default gen_random_uuid(),
    service_request_id uuid not null references public.service_requests(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    created_by_user_id uuid not null references auth.users(id) on delete cascade,
    event_type text not null,
    message text not null,
    created_at timestamptz not null default now(),
    constraint service_request_events_event_type_check
        check (lower(btrim(event_type)) in ('homeowner_note', 'update_requested', 'company_note', 'status_change'))
);

create index if not exists service_request_events_request_created_idx
on public.service_request_events (service_request_id, created_at desc);

create index if not exists service_request_events_company_created_idx
on public.service_request_events (company_id, created_at desc);

alter table public.service_request_events enable row level security;

drop policy if exists service_request_events_select_request_parties on public.service_request_events;
create policy service_request_events_select_request_parties
on public.service_request_events
for select
to authenticated
using (
    public.can_dispatch_company(company_id)
    or public.homeos_can_read_property_record(property_id)
);

create or replace function public.add_service_request_note(
    p_service_request_id uuid,
    p_message text
)
returns public.service_request_events
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_event public.service_request_events%rowtype;
    v_message text := nullif(btrim(coalesce(p_message, '')), '');
    v_event_type text := 'homeowner_note';
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if v_message is null then
        raise exception 'Note is required.';
    end if;

    select *
    into v_request
    from public.service_requests
    where id = p_service_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if not public.homeos_can_read_property_record(v_request.property_id) then
        if not public.can_dispatch_company(v_request.company_id) then
            raise exception 'Not authorized to add a note to this service request.';
        end if;

        v_event_type := 'company_note';
    end if;

    insert into public.service_request_events (
        service_request_id,
        company_id,
        property_id,
        created_by_user_id,
        event_type,
        message
    )
    values (
        v_request.id,
        v_request.company_id,
        v_request.property_id,
        auth.uid(),
        v_event_type,
        v_message
    )
    returning *
    into v_event;

    update public.service_requests
    set updated_at = now()
    where id = v_request.id;

    return v_event;
end;
$$;

create or replace function public.request_service_request_update(
    p_service_request_id uuid
)
returns public.service_request_events
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_event public.service_request_events%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select *
    into v_request
    from public.service_requests
    where id = p_service_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if not public.homeos_can_read_property_record(v_request.property_id) then
        raise exception 'Not authorized to request an update for this service request.';
    end if;

    insert into public.service_request_events (
        service_request_id,
        company_id,
        property_id,
        created_by_user_id,
        event_type,
        message
    )
    values (
        v_request.id,
        v_request.company_id,
        v_request.property_id,
        auth.uid(),
        'update_requested',
        'Homeowner requested an update.'
    )
    returning *
    into v_event;

    update public.service_requests
    set updated_at = now()
    where id = v_request.id;

    return v_event;
end;
$$;

create or replace function public.get_service_request_events(
    p_service_request_id uuid
)
returns table (
    id uuid,
    service_request_id uuid,
    company_id uuid,
    property_id uuid,
    event_type text,
    message text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select *
    into v_request
    from public.service_requests
    where id = p_service_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if not public.homeos_can_read_property_record(v_request.property_id)
       and not public.can_dispatch_company(v_request.company_id) then
        raise exception 'Not authorized to view service request events.';
    end if;

    return query
    select
        event.id,
        event.service_request_id,
        event.company_id,
        event.property_id,
        event.event_type,
        event.message,
        event.created_at
    from public.service_request_events event
    where event.service_request_id = p_service_request_id
    order by event.created_at desc nulls last, event.id desc;
end;
$$;

revoke all on table public.service_request_events from public;
revoke all on table public.service_request_events from anon;
revoke insert, update, delete on table public.service_request_events from authenticated;
grant select on table public.service_request_events to authenticated;

revoke all on function public.can_dispatch_company(uuid) from public;
revoke all on function public.can_dispatch_company(uuid) from anon;
grant execute on function public.can_dispatch_company(uuid) to authenticated;

revoke all on function public.add_service_request_note(uuid, text) from public;
revoke all on function public.add_service_request_note(uuid, text) from anon;
grant execute on function public.add_service_request_note(uuid, text) to authenticated;

revoke all on function public.request_service_request_update(uuid) from public;
revoke all on function public.request_service_request_update(uuid) from anon;
grant execute on function public.request_service_request_update(uuid) to authenticated;

revoke all on function public.get_service_request_events(uuid) from public;
revoke all on function public.get_service_request_events(uuid) from anon;
grant execute on function public.get_service_request_events(uuid) to authenticated;

commit;

select
    to_regclass('public.service_request_events') is not null as service_request_events_exists,
    to_regprocedure('public.add_service_request_note(uuid,text)') is not null as add_note_rpc_exists,
    to_regprocedure('public.request_service_request_update(uuid)') is not null as request_update_rpc_exists,
    to_regprocedure('public.get_service_request_events(uuid)') is not null as get_events_rpc_exists;
