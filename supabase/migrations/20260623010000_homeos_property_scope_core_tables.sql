begin;

do $$
declare
    v_table text;
    v_column text;
begin
    foreach v_table in array array[
        'properties',
        'property_memberships',
        'home_items',
        'home_item_files',
        'home_emergencies',
        'jobs',
        'job_thread_events'
    ] loop
        if to_regclass(format('public.%I', v_table)) is null then
            raise exception 'public.% does not exist; cannot property-scope HomeOS core tables.', v_table;
        end if;
    end loop;

    foreach v_column in array array['id', 'property_id', 'user_id', 'status', 'created_at'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'property_memberships'
              and column_name = v_column
        ) then
            raise exception 'public.property_memberships is missing required column %. Cannot property-scope HomeOS core tables.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'properties'
              and column_name = v_column
        ) then
            raise exception 'public.properties is missing required column %. Cannot property-scope HomeOS core tables.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'user_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'home_items'
              and column_name = v_column
        ) then
            raise exception 'public.home_items is missing required column %. Cannot property-scope HomeOS core tables.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'user_id', 'home_item_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'home_item_files'
              and column_name = v_column
        ) then
            raise exception 'public.home_item_files is missing required column %. Cannot property-scope HomeOS core tables.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'user_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'home_emergencies'
              and column_name = v_column
        ) then
            raise exception 'public.home_emergencies is missing required column %. Cannot property-scope HomeOS core tables.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'user_id', 'property_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'jobs'
              and column_name = v_column
        ) then
            raise exception 'public.jobs is missing required column %. Cannot property-scope HomeOS core tables.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'user_id', 'job_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'job_thread_events'
              and column_name = v_column
        ) then
            raise exception 'public.job_thread_events is missing required column %. Cannot property-scope HomeOS core tables.', v_column;
        end if;
    end loop;
end
$$;

alter table public.home_items
    add column if not exists property_id uuid;

alter table public.home_item_files
    add column if not exists property_id uuid;

alter table public.home_emergencies
    add column if not exists property_id uuid;

alter table public.job_thread_events
    add column if not exists property_id uuid;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'home_items_property_id_fkey'
          and conrelid = 'public.home_items'::regclass
    ) then
        alter table public.home_items
            add constraint home_items_property_id_fkey
            foreign key (property_id)
            references public.properties(id)
            on delete cascade;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'home_item_files_property_id_fkey'
          and conrelid = 'public.home_item_files'::regclass
    ) then
        alter table public.home_item_files
            add constraint home_item_files_property_id_fkey
            foreign key (property_id)
            references public.properties(id)
            on delete cascade;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'home_emergencies_property_id_fkey'
          and conrelid = 'public.home_emergencies'::regclass
    ) then
        alter table public.home_emergencies
            add constraint home_emergencies_property_id_fkey
            foreign key (property_id)
            references public.properties(id)
            on delete cascade;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'job_thread_events_property_id_fkey'
          and conrelid = 'public.job_thread_events'::regclass
    ) then
        alter table public.job_thread_events
            add constraint job_thread_events_property_id_fkey
            foreign key (property_id)
            references public.properties(id)
            on delete cascade;
    end if;
end
$$;

with active_memberships as (
    select
        membership.user_id,
        (array_agg(membership.property_id order by membership.created_at asc, membership.id asc))[1] as property_id,
        count(*) as active_count
    from public.property_memberships as membership
    where membership.status = 'active'
    group by membership.user_id
),
single_active_memberships as (
    select user_id, property_id
    from active_memberships
    where active_count = 1
      and property_id is not null
)
update public.home_items as record
set property_id = membership.property_id
from single_active_memberships as membership
where record.property_id is null
  and record.user_id = membership.user_id;

update public.home_item_files as file_row
set property_id = item_row.property_id
from public.home_items as item_row
where file_row.property_id is null
  and file_row.home_item_id = item_row.id
  and item_row.property_id is not null;

with active_memberships as (
    select
        membership.user_id,
        (array_agg(membership.property_id order by membership.created_at asc, membership.id asc))[1] as property_id,
        count(*) as active_count
    from public.property_memberships as membership
    where membership.status = 'active'
    group by membership.user_id
),
single_active_memberships as (
    select user_id, property_id
    from active_memberships
    where active_count = 1
      and property_id is not null
)
update public.home_item_files as file_row
set property_id = membership.property_id
from single_active_memberships as membership
where file_row.property_id is null
  and file_row.user_id = membership.user_id;

with active_memberships as (
    select
        membership.user_id,
        (array_agg(membership.property_id order by membership.created_at asc, membership.id asc))[1] as property_id,
        count(*) as active_count
    from public.property_memberships as membership
    where membership.status = 'active'
    group by membership.user_id
),
single_active_memberships as (
    select user_id, property_id
    from active_memberships
    where active_count = 1
      and property_id is not null
)
update public.home_emergencies as record
set property_id = membership.property_id
from single_active_memberships as membership
where record.property_id is null
  and record.user_id = membership.user_id;

update public.job_thread_events as event
set property_id = job.property_id
from public.jobs as job
where event.property_id is null
  and event.job_id = job.id
  and job.property_id is not null;

with active_memberships as (
    select
        membership.user_id,
        (array_agg(membership.property_id order by membership.created_at asc, membership.id asc))[1] as property_id,
        count(*) as active_count
    from public.property_memberships as membership
    where membership.status = 'active'
    group by membership.user_id
),
single_active_memberships as (
    select user_id, property_id
    from active_memberships
    where active_count = 1
      and property_id is not null
)
update public.job_thread_events as event
set property_id = membership.property_id
from single_active_memberships as membership
where event.property_id is null
  and event.user_id = membership.user_id;

create index if not exists home_items_property_id_idx
    on public.home_items (property_id);

create index if not exists home_item_files_property_id_idx
    on public.home_item_files (property_id);

create index if not exists home_emergencies_property_id_idx
    on public.home_emergencies (property_id);

create index if not exists job_thread_events_property_id_idx
    on public.job_thread_events (property_id);

commit;

select
    table_name,
    null_property_id_count,
    non_null_property_id_count
from (
    select
        'home_items'::text as table_name,
        count(*) filter (where property_id is null) as null_property_id_count,
        count(*) filter (where property_id is not null) as non_null_property_id_count
    from public.home_items

    union all

    select
        'home_item_files'::text as table_name,
        count(*) filter (where property_id is null) as null_property_id_count,
        count(*) filter (where property_id is not null) as non_null_property_id_count
    from public.home_item_files

    union all

    select
        'home_emergencies'::text as table_name,
        count(*) filter (where property_id is null) as null_property_id_count,
        count(*) filter (where property_id is not null) as non_null_property_id_count
    from public.home_emergencies

    union all

    select
        'job_thread_events'::text as table_name,
        count(*) filter (where property_id is null) as null_property_id_count,
        count(*) filter (where property_id is not null) as non_null_property_id_count
    from public.job_thread_events
) as property_scope_summary
order by table_name;
