-- Adds permanent company-scoped service request display codes.
-- Review before applying. Do not edit the already-applied close-out migration.

begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before service request display codes can be installed.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before service request display codes can be installed.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before service request display codes can be installed.';
    end if;
end;
$$;

create table if not exists public.company_service_request_counters (
    company_id uuid primary key references public.companies(id) on delete cascade,
    last_sequence bigint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_service_request_counters_last_sequence_check
        check (last_sequence >= 0)
);

alter table public.company_service_request_counters enable row level security;
revoke all on table public.company_service_request_counters from public;
revoke all on table public.company_service_request_counters from anon;
revoke all on table public.company_service_request_counters from authenticated;

alter table public.service_requests
    add column if not exists display_sequence bigint null,
    add column if not exists display_code text null;

-- Block service request writes while existing rows are normalized, backfilled,
-- and counters are synchronized. RowExclusive inserts/updates wait until commit.
lock table public.service_requests in share row exclusive mode;
lock table public.company_service_request_counters in share row exclusive mode;

create or replace function public.service_request_sequence_to_display_code(p_sequence bigint)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_zero_based_sequence bigint;
    v_prefix_index bigint;
    v_number integer;
    v_prefix text := '';
    v_remainder bigint;
begin
    if p_sequence is null or p_sequence < 1 then
        raise exception 'Service request display sequence must be positive.';
    end if;

    v_zero_based_sequence := p_sequence - 1;
    v_prefix_index := v_zero_based_sequence / 9999;
    v_number := ((v_zero_based_sequence % 9999) + 1)::integer;
    v_remainder := v_prefix_index;

    loop
        v_prefix := chr(65 + (v_remainder % 26)::integer) || v_prefix;
        v_remainder := (v_remainder / 26) - 1;
        exit when v_remainder < 0;
    end loop;

    return v_prefix || lpad(v_number::text, 4, '0');
end;
$$;

create or replace function public.service_request_display_code_to_sequence(p_display_code text)
returns bigint
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_code text := upper(btrim(coalesce(p_display_code, '')));
    v_prefix text;
    v_suffix integer;
    v_prefix_number bigint := 0;
    v_index integer;
begin
    if v_code !~ '^[A-Z]+(000[1-9]|00[1-9][0-9]|0[1-9][0-9]{2}|[1-9][0-9]{3})$' then
        raise exception 'Invalid service request display code.';
    end if;

    v_prefix := substring(v_code from '^([A-Z]+)');
    v_suffix := substring(v_code from '([0-9]{4})$')::integer;

    for v_index in 1..char_length(v_prefix) loop
        v_prefix_number := (v_prefix_number * 26)
            + (ascii(substr(v_prefix, v_index, 1)) - 64);
    end loop;

    return ((v_prefix_number - 1) * 9999) + v_suffix;
end;
$$;

revoke all on function public.service_request_sequence_to_display_code(bigint) from public;
revoke all on function public.service_request_sequence_to_display_code(bigint) from anon;
revoke all on function public.service_request_sequence_to_display_code(bigint) from authenticated;
revoke all on function public.service_request_display_code_to_sequence(text) from public;
revoke all on function public.service_request_display_code_to_sequence(text) from anon;
revoke all on function public.service_request_display_code_to_sequence(text) from authenticated;

do $$
declare
    v_null_company_rows bigint;
    v_invalid_company_rows bigint;
    v_missing_created_at_rows bigint;
    v_invalid_existing_display_rows bigint;
    v_mismatched_existing_display_rows bigint;
begin
    select count(*)::bigint
    into v_null_company_rows
    from public.service_requests
    where company_id is null;

    select count(*)::bigint
    into v_invalid_company_rows
    from public.service_requests as request
    where request.company_id is not null
      and not exists (
          select 1
          from public.companies as company
          where company.id = request.company_id
      );

    select count(*)::bigint
    into v_missing_created_at_rows
    from public.service_requests
    where created_at is null;

    select count(*)::bigint
    into v_invalid_existing_display_rows
    from public.service_requests
    where nullif(btrim(coalesce(display_code, '')), '') is not null
      and upper(btrim(display_code)) !~ '^[A-Z]+(000[1-9]|00[1-9][0-9]|0[1-9][0-9]{2}|[1-9][0-9]{3})$';

    select count(*)::bigint
    into v_mismatched_existing_display_rows
    from public.service_requests
    where display_sequence is not null
      and nullif(btrim(coalesce(display_code, '')), '') is not null
      and upper(btrim(display_code)) ~ '^[A-Z]+(000[1-9]|00[1-9][0-9]|0[1-9][0-9]{2}|[1-9][0-9]{3})$'
      and public.service_request_display_code_to_sequence(display_code) <> display_sequence;

    raise notice 'Service request display-code preflight: null company rows %, invalid company rows %, missing created_at rows %, invalid existing display rows %, mismatched existing display rows %.',
        v_null_company_rows,
        v_invalid_company_rows,
        v_missing_created_at_rows,
        v_invalid_existing_display_rows,
        v_mismatched_existing_display_rows;

    if v_null_company_rows > 0 then
        raise exception 'Cannot assign company-scoped display codes while service_requests.company_id has null rows: %.',
            v_null_company_rows;
    end if;

    if v_invalid_company_rows > 0 then
        raise exception 'Cannot assign company-scoped display codes while service_requests.company_id has invalid references: %.',
            v_invalid_company_rows;
    end if;

    if v_invalid_existing_display_rows > 0 then
        raise exception 'Cannot preserve invalid existing service request display codes: %.',
            v_invalid_existing_display_rows;
    end if;

    if v_mismatched_existing_display_rows > 0 then
        raise exception 'Cannot preserve mismatched existing service request display code/sequence pairs: %.',
            v_mismatched_existing_display_rows;
    end if;
end;
$$;

update public.service_requests as request
set display_code = upper(btrim(request.display_code))
where nullif(btrim(coalesce(request.display_code, '')), '') is not null
  and request.display_code is distinct from upper(btrim(request.display_code));

update public.service_requests as request
set display_sequence = public.service_request_display_code_to_sequence(request.display_code)
where request.display_sequence is null
  and nullif(btrim(coalesce(request.display_code, '')), '') is not null;

update public.service_requests as request
set display_code = public.service_request_sequence_to_display_code(request.display_sequence)
where request.display_sequence is not null
  and nullif(btrim(coalesce(request.display_code, '')), '') is null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'service_requests_display_sequence_positive_check'
          and conrelid = 'public.service_requests'::regclass
    ) then
        alter table public.service_requests
            add constraint service_requests_display_sequence_positive_check
            check (display_sequence is null or display_sequence > 0);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'service_requests_display_code_format_check'
          and conrelid = 'public.service_requests'::regclass
    ) then
        alter table public.service_requests
            add constraint service_requests_display_code_format_check
            check (
                display_code is null
                or display_code ~ '^[A-Z]+(000[1-9]|00[1-9][0-9]|0[1-9][0-9]{2}|[1-9][0-9]{3})$'
            );
    end if;
end;
$$;

create unique index if not exists service_requests_company_display_sequence_uidx
    on public.service_requests (company_id, display_sequence)
    where display_sequence is not null;

create unique index if not exists service_requests_company_display_code_uidx
    on public.service_requests (company_id, display_code)
    where display_code is not null;

create or replace function public.assign_service_request_display_code()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_sequence bigint;
    v_expected_code text;
begin
    if new.company_id is null then
        raise exception 'company_id is required before assigning a service request display code.';
    end if;

    if new.display_sequence is null or nullif(btrim(coalesce(new.display_code, '')), '') is null then
        insert into public.company_service_request_counters (
            company_id,
            last_sequence,
            created_at,
            updated_at
        )
        values (
            new.company_id,
            1,
            now(),
            now()
        )
        on conflict (company_id)
        do update
            set last_sequence = public.company_service_request_counters.last_sequence + 1,
                updated_at = now()
        returning last_sequence
        into v_sequence;

        new.display_sequence := v_sequence;
        new.display_code := public.service_request_sequence_to_display_code(v_sequence);
        return new;
    end if;

    new.display_code := upper(btrim(new.display_code));
    v_expected_code := public.service_request_sequence_to_display_code(new.display_sequence);

    if new.display_code <> v_expected_code then
        raise exception 'service request display_code does not match display_sequence.';
    end if;

    insert into public.company_service_request_counters (
        company_id,
        last_sequence,
        created_at,
        updated_at
    )
    values (
        new.company_id,
        new.display_sequence,
        now(),
        now()
    )
    on conflict (company_id)
    do update
        set last_sequence = greatest(
                public.company_service_request_counters.last_sequence,
                excluded.last_sequence
            ),
            updated_at = case
                when excluded.last_sequence > public.company_service_request_counters.last_sequence
                    then now()
                else public.company_service_request_counters.updated_at
            end;

    return new;
end;
$$;

revoke all on function public.assign_service_request_display_code() from public;
revoke all on function public.assign_service_request_display_code() from anon;
revoke all on function public.assign_service_request_display_code() from authenticated;

drop trigger if exists service_requests_assign_display_code on public.service_requests;
create trigger service_requests_assign_display_code
before insert on public.service_requests
for each row
execute function public.assign_service_request_display_code();

do $$
declare
    v_backfill_records bigint;
    v_backfill_companies bigint;
begin
    select
        count(*)::bigint,
        count(distinct company_id)::bigint
    into v_backfill_records, v_backfill_companies
    from public.service_requests
    where display_sequence is null;

    raise notice 'Service request display-code backfill will assign % rows across % companies.',
        v_backfill_records,
        v_backfill_companies;

    with existing_max as (
        select
            company_id,
            coalesce(max(display_sequence), 0) as max_sequence
        from public.service_requests
        where display_sequence is not null
        group by company_id
    ),
    pending as (
        select
            request.id,
            request.company_id,
            coalesce(existing_max.max_sequence, 0)
                + row_number() over (
                    partition by request.company_id
                    order by coalesce(request.created_at, '1970-01-01 00:00:00+00'::timestamptz) asc,
                             request.id asc
                ) as assigned_sequence
        from public.service_requests as request
        left join existing_max
          on existing_max.company_id = request.company_id
        where request.display_sequence is null
    )
    update public.service_requests as request
    set display_sequence = pending.assigned_sequence,
        display_code = public.service_request_sequence_to_display_code(pending.assigned_sequence),
        updated_at = coalesce(request.updated_at, now())
    from pending
    where request.id = pending.id
      and request.company_id = pending.company_id;

    insert into public.company_service_request_counters (
        company_id,
        last_sequence,
        created_at,
        updated_at
    )
    select
        request.company_id,
        max(request.display_sequence),
        now(),
        now()
    from public.service_requests as request
    where request.display_sequence is not null
    group by request.company_id
    on conflict (company_id)
    do update
        set last_sequence = greatest(
                public.company_service_request_counters.last_sequence,
                excluded.last_sequence
            ),
            updated_at = now();
end;
$$;

alter table public.service_requests
    alter column display_sequence set not null,
    alter column display_code set not null;

create or replace function public.prevent_service_request_display_code_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if old.display_sequence is distinct from new.display_sequence
       or old.display_code is distinct from new.display_code then
        raise exception 'Service request display codes are permanent and cannot be changed.';
    end if;

    return new;
end;
$$;

revoke all on function public.prevent_service_request_display_code_change() from public;
revoke all on function public.prevent_service_request_display_code_change() from anon;
revoke all on function public.prevent_service_request_display_code_change() from authenticated;

drop trigger if exists service_requests_prevent_display_code_change on public.service_requests;
create trigger service_requests_prevent_display_code_change
before update of display_sequence, display_code on public.service_requests
for each row
execute function public.prevent_service_request_display_code_change();

drop function if exists public.get_company_dispatch_requests(uuid);

create or replace function public.get_company_dispatch_requests(
    p_company_id uuid
)
returns table (
    id uuid,
    display_sequence bigint,
    display_code text,
    company_id uuid,
    property_id uuid,
    company_property_client_id uuid,
    request_type text,
    status text,
    priority text,
    issue_summary text,
    customer_display_name text,
    property_display_name text,
    property_address text,
    property_city text,
    property_state text,
    property_postal_code text,
    created_at timestamptz,
    acknowledged_at timestamptz,
    converted_job_id uuid,
    converted_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.can_dispatch_company(p_company_id) then
        raise exception 'Not authorized to view dispatch requests for this company.';
    end if;

    return query
    select
        request.id,
        request.display_sequence,
        request.display_code,
        request.company_id,
        request.property_id,
        request.company_property_client_id,
        request.request_type,
        request.status,
        request.priority,
        request.issue_summary,
        request.customer_display_name,
        request.property_display_name,
        request.property_address,
        request.property_city,
        request.property_state,
        request.property_postal_code,
        request.created_at,
        request.acknowledged_at,
        request.converted_job_id,
        request.converted_at
    from public.service_requests as request
    where request.company_id = p_company_id
    order by request.created_at desc nulls last, request.id desc;
end;
$$;

revoke all on function public.get_company_dispatch_requests(uuid) from public;
revoke all on function public.get_company_dispatch_requests(uuid) from anon;
grant execute on function public.get_company_dispatch_requests(uuid) to authenticated;

commit;
