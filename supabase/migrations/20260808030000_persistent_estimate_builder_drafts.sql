-- Adds durable, company-scoped estimate builder drafts and customer-linked quote numbers.

begin;

do $$
begin
    if to_regclass('public.company_estimate_option_sessions') is null then
        raise exception 'public.company_estimate_option_sessions is required before persistent estimate drafts can be installed.';
    end if;

    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before customer-linked quote numbers can be installed.';
    end if;

    if to_regprocedure('public.company_estimate_options_can_use(uuid)') is null then
        raise exception 'public.company_estimate_options_can_use(uuid) is required before persistent estimate drafts can be installed.';
    end if;

    if to_regprocedure('public.company_estimate_session_context_can_use(uuid,uuid,uuid,uuid,uuid,uuid)') is null then
        raise exception 'public.company_estimate_session_context_can_use(uuid,uuid,uuid,uuid,uuid,uuid) is required before persistent estimate drafts can be installed.';
    end if;
end;
$$;

create table if not exists public.company_estimate_quote_counters (
    company_id uuid primary key references public.companies(id) on delete cascade,
    last_sequence bigint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_estimate_quote_counters_last_sequence_check check (last_sequence >= 0)
);

alter table public.company_estimate_quote_counters enable row level security;
revoke all on table public.company_estimate_quote_counters from public, anon, authenticated;

alter table public.company_estimate_option_sessions
    add column if not exists quote_sequence bigint,
    add column if not exists quote_number text,
    add column if not exists current_builder_step text not null default 'work',
    add column if not exists builder_state jsonb not null default '{}'::jsonb;

lock table public.company_estimate_option_sessions in share row exclusive mode;
lock table public.company_estimate_quote_counters in share row exclusive mode;

with ranked as (
    select
        session.id,
        row_number() over (
            partition by session.company_id
            order by session.created_at, session.id
        )::bigint as assigned_sequence
    from public.company_estimate_option_sessions as session
    where session.quote_sequence is null
)
update public.company_estimate_option_sessions as session
set quote_sequence = ranked.assigned_sequence
from ranked
where ranked.id = session.id;

insert into public.company_estimate_quote_counters (
    company_id,
    last_sequence,
    created_at,
    updated_at
)
select
    session.company_id,
    max(session.quote_sequence),
    now(),
    now()
from public.company_estimate_option_sessions as session
where session.quote_sequence is not null
group by session.company_id
on conflict (company_id) do update
set last_sequence = greatest(
        public.company_estimate_quote_counters.last_sequence,
        excluded.last_sequence
    ),
    updated_at = now();

update public.company_estimate_option_sessions as session
set quote_number = concat(
    case
        when nullif(btrim(coalesce(request.display_code, '')), '') is not null
            then upper(btrim(request.display_code)) || '-'
        else ''
    end,
    'Q',
    lpad(session.quote_sequence::text, 4, '0')
)
from public.service_requests as request
where request.id = session.service_request_id
  and nullif(btrim(coalesce(session.quote_number, '')), '') is null;

update public.company_estimate_option_sessions as session
set quote_number = 'Q' || lpad(session.quote_sequence::text, 4, '0')
where nullif(btrim(coalesce(session.quote_number, '')), '') is null;

do $$
begin
    if exists (
        select 1
        from public.company_estimate_option_sessions
        where quote_sequence is null
           or quote_sequence < 1
           or nullif(btrim(coalesce(quote_number, '')), '') is null
    ) then
        raise exception 'Every estimate session must have a positive quote sequence and quote number.';
    end if;

    if exists (
        select 1
        from public.company_estimate_option_sessions
        where quote_number !~ '^([A-Z]+[0-9]{4}-)?Q[0-9]{4,}$'
    ) then
        raise exception 'Existing estimate session quote numbers do not match the required format.';
    end if;
end;
$$;

alter table public.company_estimate_option_sessions
    alter column quote_sequence set not null,
    alter column quote_number set not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_estimate_option_sessions_quote_sequence_positive_check'
          and conrelid = 'public.company_estimate_option_sessions'::regclass
    ) then
        alter table public.company_estimate_option_sessions
            add constraint company_estimate_option_sessions_quote_sequence_positive_check
            check (quote_sequence > 0);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_estimate_option_sessions_quote_number_format_check'
          and conrelid = 'public.company_estimate_option_sessions'::regclass
    ) then
        alter table public.company_estimate_option_sessions
            add constraint company_estimate_option_sessions_quote_number_format_check
            check (quote_number ~ '^([A-Z]+[0-9]{4}-)?Q[0-9]{4,}$');
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_estimate_option_sessions_builder_step_check'
          and conrelid = 'public.company_estimate_option_sessions'::regclass
    ) then
        alter table public.company_estimate_option_sessions
            add constraint company_estimate_option_sessions_builder_step_check
            check (current_builder_step in (
                'work',
                'findings',
                'price',
                'option_added',
                'recommendations',
                'review'
            ));
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_estimate_option_sessions_builder_state_object_check'
          and conrelid = 'public.company_estimate_option_sessions'::regclass
    ) then
        alter table public.company_estimate_option_sessions
            add constraint company_estimate_option_sessions_builder_state_object_check
            check (jsonb_typeof(builder_state) = 'object');
    end if;
end;
$$;

create unique index if not exists company_estimate_option_sessions_company_quote_sequence_uidx
    on public.company_estimate_option_sessions(company_id, quote_sequence);

create unique index if not exists company_estimate_option_sessions_company_quote_number_uidx
    on public.company_estimate_option_sessions(company_id, quote_number);

create index if not exists company_estimate_option_sessions_active_drafts_idx
    on public.company_estimate_option_sessions(company_id, updated_at desc)
    where status in ('draft', 'technician_review');

create or replace function public.assign_estimate_session_quote_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_sequence bigint;
    v_request_code text := null;
begin
    if new.company_id is null then
        raise exception 'company_id is required before assigning an estimate quote number.';
    end if;

    if new.quote_sequence is not null or nullif(btrim(coalesce(new.quote_number, '')), '') is not null then
        raise exception 'Estimate quote numbers are assigned by HomeOS.';
    end if;

    insert into public.company_estimate_quote_counters (
        company_id,
        last_sequence,
        created_at,
        updated_at
    )
    values (new.company_id, 1, now(), now())
    on conflict (company_id) do update
    set last_sequence = public.company_estimate_quote_counters.last_sequence + 1,
        updated_at = now()
    returning last_sequence into v_sequence;

    if new.service_request_id is not null then
        select upper(btrim(request.display_code))
        into v_request_code
        from public.service_requests as request
        where request.id = new.service_request_id
          and request.company_id = new.company_id;
    end if;

    new.quote_sequence := v_sequence;
    new.quote_number := concat(
        case when nullif(v_request_code, '') is not null then v_request_code || '-' else '' end,
        'Q',
        lpad(v_sequence::text, 4, '0')
    );

    return new;
end;
$$;

revoke all on function public.assign_estimate_session_quote_number() from public, anon, authenticated;

drop trigger if exists company_estimate_option_sessions_assign_quote_number
    on public.company_estimate_option_sessions;
create trigger company_estimate_option_sessions_assign_quote_number
before insert on public.company_estimate_option_sessions
for each row
execute function public.assign_estimate_session_quote_number();

create or replace function public.prevent_estimate_session_quote_number_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if old.quote_sequence is distinct from new.quote_sequence
       or old.quote_number is distinct from new.quote_number then
        raise exception 'Estimate quote numbers cannot be changed after assignment.';
    end if;

    return new;
end;
$$;

revoke all on function public.prevent_estimate_session_quote_number_change() from public, anon, authenticated;

drop trigger if exists company_estimate_option_sessions_prevent_quote_number_change
    on public.company_estimate_option_sessions;
create trigger company_estimate_option_sessions_prevent_quote_number_change
before update of quote_sequence, quote_number on public.company_estimate_option_sessions
for each row
execute function public.prevent_estimate_session_quote_number_change();

create or replace function public.list_company_estimate_drafts(p_company_id uuid default null)
returns table (
    id uuid,
    company_id uuid,
    quote_number text,
    current_builder_step text,
    status text,
    category text,
    property_id uuid,
    service_request_id uuid,
    job_id uuid,
    schedule_slot_id uuid,
    home_item_id uuid,
    source text,
    customer_name text,
    customer_address text,
    request_display_code text,
    issue_summary text,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if p_company_id is null or not public.company_estimate_options_can_use(p_company_id) then
        raise exception 'Not authorized to view estimate drafts for this company.';
    end if;

    return query
    select
        session.id,
        session.company_id,
        session.quote_number,
        session.current_builder_step,
        session.status,
        session.category,
        session.property_id,
        session.service_request_id,
        session.job_id,
        session.schedule_slot_id,
        session.home_item_id,
        session.source,
        coalesce(
            nullif(btrim(company_client.display_name), ''),
            nullif(btrim(property.name), ''),
            'Customer home'
        ) as customer_name,
        coalesce(
            nullif(btrim(property.address), ''),
            nullif(btrim(property.address_line_1), ''),
            ''
        ) as customer_address,
        nullif(upper(btrim(request.display_code)), '') as request_display_code,
        nullif(btrim(request.issue_summary), '') as issue_summary,
        session.created_at,
        session.updated_at
    from public.company_estimate_option_sessions as session
    left join public.service_requests as request
        on request.id = session.service_request_id
       and request.company_id = session.company_id
    left join public.properties as property
        on property.id = session.property_id
    left join lateral (
        select client.display_name
        from public.company_property_clients as client
        where client.company_id = session.company_id
          and client.property_id = session.property_id
          and lower(btrim(coalesce(client.status, 'active'))) = 'active'
        order by client.connected_at desc nulls last, client.created_at desc nulls last, client.id desc
        limit 1
    ) as company_client on true
    where session.company_id = p_company_id
      and session.status in ('draft', 'technician_review')
      and public.company_estimate_session_context_can_use(
          session.company_id,
          session.property_id,
          session.service_request_id,
          session.schedule_slot_id,
          session.job_id,
          session.home_item_id
      )
    order by session.updated_at desc, session.created_at desc, session.id desc;
end;
$$;

revoke all on function public.list_company_estimate_drafts(uuid) from public, anon;
grant execute on function public.list_company_estimate_drafts(uuid) to authenticated;

create or replace function public.get_company_estimate_builder_draft(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
    v_request_display_code text := null;
    v_issue_summary text := null;
    v_customer_name text := 'Customer home';
    v_customer_address text := null;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    select session.*
    into v_session
    from public.company_estimate_option_sessions as session
    where session.id = p_session_id;

    if not found
       or not public.company_estimate_options_can_use(v_session.company_id)
       or not public.company_estimate_session_context_can_use(
           v_session.company_id,
           v_session.property_id,
           v_session.service_request_id,
           v_session.schedule_slot_id,
           v_session.job_id,
           v_session.home_item_id
       ) then
        raise exception 'Estimate draft is unavailable or not authorized.';
    end if;

    select
        nullif(upper(btrim(request.display_code)), ''),
        nullif(btrim(request.issue_summary), '')
    into v_request_display_code, v_issue_summary
    from public.service_requests as request
    where request.id = v_session.service_request_id
      and request.company_id = v_session.company_id;

    select
        coalesce(
            (
                select nullif(btrim(client.display_name), '')
                from public.company_property_clients as client
                where client.company_id = v_session.company_id
                  and client.property_id = v_session.property_id
                  and lower(btrim(coalesce(client.status, 'active'))) = 'active'
                order by client.connected_at desc nulls last, client.created_at desc nulls last, client.id desc
                limit 1
            ),
            nullif(btrim(property.name), ''),
            'Customer home'
        ),
        coalesce(
            nullif(btrim(property.address), ''),
            nullif(btrim(property.address_line_1), '')
        )
    into v_customer_name, v_customer_address
    from public.properties as property
    where property.id = v_session.property_id;

    return jsonb_build_object(
        'id', v_session.id,
        'company_id', v_session.company_id,
        'quote_number', v_session.quote_number,
        'current_builder_step', v_session.current_builder_step,
        'builder_state', v_session.builder_state,
        'category', v_session.category,
        'status', v_session.status,
        'property_id', v_session.property_id,
        'service_request_id', v_session.service_request_id,
        'job_id', v_session.job_id,
        'schedule_slot_id', v_session.schedule_slot_id,
        'home_item_id', v_session.home_item_id,
        'source', v_session.source,
        'request_display_code', v_request_display_code,
        'customer_name', v_customer_name,
        'customer_address', v_customer_address,
        'issue_summary', v_issue_summary,
        'created_at', v_session.created_at,
        'updated_at', v_session.updated_at
    );
end;
$$;

revoke all on function public.get_company_estimate_builder_draft(uuid) from public, anon;
grant execute on function public.get_company_estimate_builder_draft(uuid) to authenticated;

create or replace function public.save_company_estimate_builder_draft(
    p_session_id uuid,
    p_current_builder_step text,
    p_builder_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
    v_step text := lower(btrim(coalesce(p_current_builder_step, 'work')));
    v_state jsonb := coalesce(p_builder_state, '{}'::jsonb);
    v_updated_at timestamptz;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if v_step not in ('work', 'findings', 'price', 'option_added', 'recommendations', 'review') then
        raise exception 'Invalid estimate builder step.';
    end if;

    if jsonb_typeof(v_state) <> 'object' then
        raise exception 'Estimate builder state must be a JSON object.';
    end if;

    if octet_length(v_state::text) > 1048576 then
        raise exception 'Estimate builder state is too large to save.';
    end if;

    select session.*
    into v_session
    from public.company_estimate_option_sessions as session
    where session.id = p_session_id
    for update;

    if not found
       or v_session.status not in ('draft', 'technician_review')
       or not public.company_estimate_options_can_use(v_session.company_id)
       or not public.company_estimate_session_context_can_use(
           v_session.company_id,
           v_session.property_id,
           v_session.service_request_id,
           v_session.schedule_slot_id,
           v_session.job_id,
           v_session.home_item_id
       ) then
        raise exception 'Estimate draft is unavailable or not authorized.';
    end if;

    update public.company_estimate_option_sessions as session
    set current_builder_step = v_step,
        builder_state = v_state,
        updated_at = now()
    where session.id = v_session.id
    returning session.updated_at into v_updated_at;

    return jsonb_build_object(
        'id', v_session.id,
        'quote_number', v_session.quote_number,
        'current_builder_step', v_step,
        'updated_at', v_updated_at
    );
end;
$$;

revoke all on function public.save_company_estimate_builder_draft(uuid,text,jsonb) from public, anon;
grant execute on function public.save_company_estimate_builder_draft(uuid,text,jsonb) to authenticated;

create or replace function public.archive_company_estimate_draft(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    select session.*
    into v_session
    from public.company_estimate_option_sessions as session
    where session.id = p_session_id
    for update;

    if not found
       or v_session.status not in ('draft', 'technician_review')
       or not public.company_estimate_options_can_use(v_session.company_id)
       or not public.company_estimate_session_context_can_use(
           v_session.company_id,
           v_session.property_id,
           v_session.service_request_id,
           v_session.schedule_slot_id,
           v_session.job_id,
           v_session.home_item_id
       ) then
        raise exception 'Estimate draft is unavailable or not authorized.';
    end if;

    update public.company_estimate_option_sessions as session
    set status = 'archived',
        updated_at = now()
    where session.id = v_session.id;

    return jsonb_build_object(
        'id', v_session.id,
        'quote_number', v_session.quote_number,
        'archived', true
    );
end;
$$;

revoke all on function public.archive_company_estimate_draft(uuid) from public, anon;
grant execute on function public.archive_company_estimate_draft(uuid) to authenticated;

commit;
