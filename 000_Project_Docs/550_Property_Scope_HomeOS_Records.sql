begin;

do $$
begin
    if to_regclass('public.properties') is null then
        raise exception 'public.properties does not exist; cannot property-scope HomeOS records.';
    end if;

    if to_regclass('public.property_memberships') is null then
        raise exception 'public.property_memberships does not exist; cannot property-scope HomeOS records.';
    end if;

    if to_regclass('public.home_items') is null then
        raise exception 'public.home_items does not exist; cannot property-scope HomeOS records.';
    end if;

    if to_regclass('public.home_item_files') is null then
        raise exception 'public.home_item_files does not exist; cannot property-scope HomeOS records.';
    end if;

    if to_regclass('public.maintenance_records') is null then
        raise exception 'public.maintenance_records does not exist; cannot property-scope HomeOS records.';
    end if;

    if to_regclass('public.home_emergencies') is null then
        raise exception 'public.home_emergencies does not exist; cannot property-scope HomeOS records.';
    end if;
end
$$;

alter table public.home_items
    add column if not exists property_id uuid;

alter table public.home_item_files
    add column if not exists property_id uuid;

alter table public.maintenance_records
    add column if not exists property_id uuid;

alter table public.home_emergencies
    add column if not exists property_id uuid;

do $$
begin
    if to_regclass('public.jobs') is not null then
        alter table public.jobs
            add column if not exists property_id uuid;
    end if;

    if to_regclass('public.job_thread_events') is not null then
        alter table public.job_thread_events
            add column if not exists property_id uuid;
    end if;
end
$$;

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
        where conname = 'maintenance_records_property_id_fkey'
          and conrelid = 'public.maintenance_records'::regclass
    ) then
        alter table public.maintenance_records
            add constraint maintenance_records_property_id_fkey
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

    if to_regclass('public.jobs') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'jobs_property_id_fkey'
             and conrelid = 'public.jobs'::regclass
       ) then
        alter table public.jobs
            add constraint jobs_property_id_fkey
            foreign key (property_id)
            references public.properties(id)
            on delete cascade;
    end if;

    if to_regclass('public.job_thread_events') is not null
       and not exists (
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
)
update public.home_items as record
set property_id = membership.property_id
from single_active_memberships as membership
where record.property_id is null
  and record.user_id = membership.user_id;

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
)
update public.maintenance_records as record
set property_id = membership.property_id
from single_active_memberships as membership
where record.property_id is null
  and record.user_id = membership.user_id;

update public.maintenance_records as record
set property_id = item.property_id
from public.home_items as item
where record.property_id is null
  and record.item_id = item.id
  and item.property_id is not null;

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
)
update public.home_emergencies as record
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

with exact_item_matches as (
    select
        file_row.id as file_id,
        (array_agg(item_row.property_id order by item_row.id))[1] as property_id,
        count(distinct item_row.property_id) as property_count
    from public.home_item_files as file_row
    join public.home_items as item_row
      on item_row.user_id = file_row.user_id
     and item_row.item_slug = file_row.item_slug
    where file_row.property_id is null
      and file_row.user_id is not null
      and file_row.item_slug is not null
      and item_row.property_id is not null
    group by file_row.id
)
update public.home_item_files as file_row
set property_id = exact_item_matches.property_id
from exact_item_matches
where file_row.id = exact_item_matches.file_id
  and exact_item_matches.property_count = 1;

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
)
update public.home_item_files as file_row
set property_id = membership.property_id
from single_active_memberships as membership
where file_row.property_id is null
  and file_row.user_id = membership.user_id;

do $$
begin
    if to_regclass('public.jobs') is not null then
        update public.jobs as job
        set property_id = item.property_id
        from public.home_items as item
        where job.property_id is null
          and job.user_id = item.user_id
          and job.item_slug = item.item_slug
          and item.property_id is not null;

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
        )
        update public.jobs as job
        set property_id = membership.property_id
        from single_active_memberships as membership
        where job.property_id is null
          and job.user_id = membership.user_id;
    end if;

    if to_regclass('public.job_thread_events') is not null
       and to_regclass('public.jobs') is not null then
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
        )
        update public.job_thread_events as event
        set property_id = membership.property_id
        from single_active_memberships as membership
        where event.property_id is null
          and event.user_id = membership.user_id;
    end if;
end
$$;

do $$
declare
    v_ambiguous_home_items integer;
    v_ambiguous_home_item_files integer;
    v_ambiguous_maintenance_records integer;
    v_ambiguous_home_emergencies integer;
    v_ambiguous_jobs integer := 0;
    v_ambiguous_job_thread_events integer := 0;
    v_unresolved_home_items integer;
    v_unresolved_home_item_files integer;
    v_unresolved_maintenance_records integer;
    v_unresolved_home_emergencies integer;
    v_unresolved_jobs integer := 0;
    v_unresolved_job_thread_events integer := 0;
begin
    with ambiguous_users as (
        select user_id
        from public.property_memberships
        where status = 'active'
        group by user_id
        having count(*) > 1
    )
    select count(*) into v_ambiguous_home_items
    from public.home_items as record
    join ambiguous_users as ambiguous_user
      on ambiguous_user.user_id = record.user_id
    where record.property_id is null;

    with ambiguous_users as (
        select user_id
        from public.property_memberships
        where status = 'active'
        group by user_id
        having count(*) > 1
    )
    select count(*) into v_ambiguous_home_item_files
    from public.home_item_files as record
    join ambiguous_users as ambiguous_user
      on ambiguous_user.user_id = record.user_id
    where record.property_id is null;

    with ambiguous_users as (
        select user_id
        from public.property_memberships
        where status = 'active'
        group by user_id
        having count(*) > 1
    )
    select count(*) into v_ambiguous_maintenance_records
    from public.maintenance_records as record
    join ambiguous_users as ambiguous_user
      on ambiguous_user.user_id = record.user_id
    where record.property_id is null;

    with ambiguous_users as (
        select user_id
        from public.property_memberships
        where status = 'active'
        group by user_id
        having count(*) > 1
    )
    select count(*) into v_ambiguous_home_emergencies
    from public.home_emergencies as record
    join ambiguous_users as ambiguous_user
      on ambiguous_user.user_id = record.user_id
    where record.property_id is null;

    select count(*) into v_unresolved_home_items
    from public.home_items
    where property_id is null;

    select count(*) into v_unresolved_home_item_files
    from public.home_item_files
    where property_id is null;

    select count(*) into v_unresolved_maintenance_records
    from public.maintenance_records
    where property_id is null;

    select count(*) into v_unresolved_home_emergencies
    from public.home_emergencies
    where property_id is null;

    if to_regclass('public.jobs') is not null then
        with ambiguous_users as (
            select user_id
            from public.property_memberships
            where status = 'active'
            group by user_id
            having count(*) > 1
        )
        select count(*) into v_ambiguous_jobs
        from public.jobs as record
        join ambiguous_users as ambiguous_user
          on ambiguous_user.user_id = record.user_id
        where record.property_id is null;

        select count(*) into v_unresolved_jobs
        from public.jobs
        where property_id is null;
    end if;

    if to_regclass('public.job_thread_events') is not null then
        with ambiguous_users as (
            select user_id
            from public.property_memberships
            where status = 'active'
            group by user_id
            having count(*) > 1
        )
        select count(*) into v_ambiguous_job_thread_events
        from public.job_thread_events as record
        join ambiguous_users as ambiguous_user
          on ambiguous_user.user_id = record.user_id
        where record.property_id is null;

        select count(*) into v_unresolved_job_thread_events
        from public.job_thread_events
        where property_id is null;
    end if;

    if v_unresolved_home_items > 0
       or v_unresolved_home_item_files > 0
       or v_unresolved_maintenance_records > 0
       or v_unresolved_home_emergencies > 0
       or v_unresolved_jobs > 0
       or v_unresolved_job_thread_events > 0 then
        raise exception 'Cannot complete property-scope migration; unresolved rows remain. unresolved home_items=%, home_item_files=%, maintenance_records=%, home_emergencies=%, jobs=%, job_thread_events=%. ambiguous active membership rows home_items=%, home_item_files=%, maintenance_records=%, home_emergencies=%, jobs=%, job_thread_events=%',
            v_unresolved_home_items,
            v_unresolved_home_item_files,
            v_unresolved_maintenance_records,
            v_unresolved_home_emergencies,
            v_unresolved_jobs,
            v_unresolved_job_thread_events,
            v_ambiguous_home_items,
            v_ambiguous_home_item_files,
            v_ambiguous_maintenance_records,
            v_ambiguous_home_emergencies,
            v_ambiguous_jobs,
            v_ambiguous_job_thread_events;
    end if;
end
$$;

alter table public.home_items
    alter column property_id set not null;

alter table public.home_item_files
    alter column property_id set not null;

alter table public.maintenance_records
    alter column property_id set not null;

alter table public.home_emergencies
    alter column property_id set not null;

do $$
begin
    if to_regclass('public.jobs') is not null then
        alter table public.jobs
            alter column property_id set not null;
    end if;

    if to_regclass('public.job_thread_events') is not null then
        alter table public.job_thread_events
            alter column property_id set not null;
    end if;
end
$$;

do $$
begin
    if exists (
        select 1
        from public.home_items
        where item_slug is not null
        group by property_id, item_slug
        having count(*) > 1
    ) then
        raise exception 'Cannot add property-scoped item slug uniqueness: duplicate non-null (property_id, item_slug) pairs exist.';
    end if;
end
$$;

alter table public.home_items
    drop constraint if exists home_items_user_id_item_slug_key;

drop index if exists public.home_items_user_id_item_slug_key;

create unique index if not exists home_items_property_id_item_slug_key
    on public.home_items (property_id, item_slug)
    where item_slug is not null;

create index if not exists home_items_property_id_idx
    on public.home_items (property_id);

create index if not exists home_items_property_id_category_idx
    on public.home_items (property_id, category);

create index if not exists home_items_property_id_system_idx
    on public.home_items (property_id, system);

create index if not exists home_item_files_property_id_idx
    on public.home_item_files (property_id);

create index if not exists maintenance_records_property_id_idx
    on public.maintenance_records (property_id);

create index if not exists home_emergencies_property_id_idx
    on public.home_emergencies (property_id);

do $$
begin
    if to_regclass('public.jobs') is not null then
        create index if not exists jobs_property_id_idx
            on public.jobs (property_id);
    end if;

    if to_regclass('public.job_thread_events') is not null then
        create index if not exists job_thread_events_property_id_idx
            on public.job_thread_events (property_id);
    end if;
end
$$;

create or replace function public.homeos_is_platform_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_has_platform_flag boolean := false;
    v_is_admin boolean := false;
begin
    if v_user_id is null or to_regclass('public.profiles') is null then
        return false;
    end if;

    if to_regprocedure('public.is_platform_admin()') is not null then
        execute 'select public.is_platform_admin()'
        into v_is_admin;

        return coalesce(v_is_admin, false);
    end if;

    select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name = 'is_platform_admin'
    )
    into v_has_platform_flag;

    if v_has_platform_flag then
        execute $sql$
            select exists (
                select 1
                from public.profiles as profile
                where profile.id = $1
                  and (
                      upper(trim(coalesce(profile.role, ''))) = 'SUPER_ADMIN'
                      or coalesce(profile.is_platform_admin, false) = true
                  )
            )
        $sql$
        into v_is_admin
        using v_user_id;
    else
        select exists (
            select 1
            from public.profiles as profile
            where profile.id = v_user_id
              and upper(trim(coalesce(profile.role, ''))) = 'SUPER_ADMIN'
        )
        into v_is_admin;
    end if;

    return coalesce(v_is_admin, false);
end;
$$;

create or replace function public.homeos_has_active_property_membership(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
    select p_property_id is not null
       and exists (
           select 1
           from public.property_memberships as membership
           where membership.property_id = p_property_id
             and membership.user_id = auth.uid()
             and membership.status = 'active'
       );
$$;

create or replace function public.homeos_can_read_property_record(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
    select public.homeos_is_platform_admin()
        or public.homeos_has_active_property_membership(p_property_id);
$$;

create or replace function public.homeos_can_mutate_property_record(
    p_property_id uuid,
    p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
    select public.homeos_is_platform_admin()
        or (
            p_user_id = auth.uid()
            and public.homeos_has_active_property_membership(p_property_id)
        );
$$;

revoke all on function public.homeos_is_platform_admin() from public;
revoke all on function public.homeos_has_active_property_membership(uuid) from public;
revoke all on function public.homeos_can_read_property_record(uuid) from public;
revoke all on function public.homeos_can_mutate_property_record(uuid, uuid) from public;

grant execute on function public.homeos_is_platform_admin() to authenticated;
grant execute on function public.homeos_has_active_property_membership(uuid) to authenticated;
grant execute on function public.homeos_can_read_property_record(uuid) to authenticated;
grant execute on function public.homeos_can_mutate_property_record(uuid, uuid) to authenticated;

do $$
declare
    v_table text;
    v_policy record;
begin
    foreach v_table in array array[
        'home_items',
        'home_item_files',
        'maintenance_records',
        'home_emergencies',
        'jobs',
        'job_thread_events'
    ] loop
        if to_regclass(format('public.%I', v_table)) is not null then
            for v_policy in
                select policyname
                from pg_policies
                where schemaname = 'public'
                  and tablename = v_table
            loop
                execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
            end loop;
        end if;
    end loop;
end
$$;

alter table public.home_items enable row level security;
alter table public.home_item_files enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.home_emergencies enable row level security;

do $$
begin
    if to_regclass('public.jobs') is not null then
        alter table public.jobs enable row level security;
    end if;

    if to_regclass('public.job_thread_events') is not null then
        alter table public.job_thread_events enable row level security;
    end if;
end
$$;

grant select, insert, update, delete on public.home_items to authenticated;
grant select, insert, update, delete on public.home_item_files to authenticated;
grant select, insert, update, delete on public.maintenance_records to authenticated;
grant select, insert, update, delete on public.home_emergencies to authenticated;

do $$
begin
    if to_regclass('public.jobs') is not null then
        grant select, insert, update, delete on public.jobs to authenticated;
    end if;

    if to_regclass('public.job_thread_events') is not null then
        grant select, insert, update, delete on public.job_thread_events to authenticated;
    end if;
end
$$;

create policy home_items_select_property_members
on public.home_items
for select
to authenticated
using (public.homeos_can_read_property_record(property_id));

create policy home_items_insert_property_creator
on public.home_items
for insert
to authenticated
with check (public.homeos_can_mutate_property_record(property_id, user_id));

create policy home_items_update_property_creator
on public.home_items
for update
to authenticated
using (public.homeos_can_mutate_property_record(property_id, user_id))
with check (public.homeos_can_mutate_property_record(property_id, user_id));

create policy home_items_delete_property_creator
on public.home_items
for delete
to authenticated
using (public.homeos_can_mutate_property_record(property_id, user_id));

create policy home_item_files_select_property_members
on public.home_item_files
for select
to authenticated
using (public.homeos_can_read_property_record(property_id));

create policy home_item_files_insert_property_creator
on public.home_item_files
for insert
to authenticated
with check (public.homeos_can_mutate_property_record(property_id, user_id));

create policy home_item_files_update_property_creator
on public.home_item_files
for update
to authenticated
using (public.homeos_can_mutate_property_record(property_id, user_id))
with check (public.homeos_can_mutate_property_record(property_id, user_id));

create policy home_item_files_delete_property_creator
on public.home_item_files
for delete
to authenticated
using (public.homeos_can_mutate_property_record(property_id, user_id));

create policy maintenance_records_select_property_members
on public.maintenance_records
for select
to authenticated
using (public.homeos_can_read_property_record(property_id));

create policy maintenance_records_insert_property_creator
on public.maintenance_records
for insert
to authenticated
with check (public.homeos_can_mutate_property_record(property_id, user_id));

create policy maintenance_records_update_property_creator
on public.maintenance_records
for update
to authenticated
using (public.homeos_can_mutate_property_record(property_id, user_id))
with check (public.homeos_can_mutate_property_record(property_id, user_id));

create policy maintenance_records_delete_property_creator
on public.maintenance_records
for delete
to authenticated
using (public.homeos_can_mutate_property_record(property_id, user_id));

create policy home_emergencies_select_property_members
on public.home_emergencies
for select
to authenticated
using (public.homeos_can_read_property_record(property_id));

create policy home_emergencies_insert_property_creator
on public.home_emergencies
for insert
to authenticated
with check (public.homeos_can_mutate_property_record(property_id, user_id));

create policy home_emergencies_update_property_creator
on public.home_emergencies
for update
to authenticated
using (public.homeos_can_mutate_property_record(property_id, user_id))
with check (public.homeos_can_mutate_property_record(property_id, user_id));

create policy home_emergencies_delete_property_creator
on public.home_emergencies
for delete
to authenticated
using (public.homeos_can_mutate_property_record(property_id, user_id));

do $$
begin
    if to_regclass('public.jobs') is not null then
        create policy jobs_select_property_members
        on public.jobs
        for select
        to authenticated
        using (public.homeos_can_read_property_record(property_id));

        create policy jobs_insert_property_creator
        on public.jobs
        for insert
        to authenticated
        with check (public.homeos_can_mutate_property_record(property_id, user_id));

        create policy jobs_update_property_creator
        on public.jobs
        for update
        to authenticated
        using (public.homeos_can_mutate_property_record(property_id, user_id))
        with check (public.homeos_can_mutate_property_record(property_id, user_id));

        create policy jobs_delete_property_creator
        on public.jobs
        for delete
        to authenticated
        using (public.homeos_can_mutate_property_record(property_id, user_id));
    end if;

    if to_regclass('public.job_thread_events') is not null then
        create policy job_thread_events_select_property_members
        on public.job_thread_events
        for select
        to authenticated
        using (public.homeos_can_read_property_record(property_id));

        create policy job_thread_events_insert_property_creator
        on public.job_thread_events
        for insert
        to authenticated
        with check (public.homeos_can_mutate_property_record(property_id, user_id));

        create policy job_thread_events_update_property_creator
        on public.job_thread_events
        for update
        to authenticated
        using (public.homeos_can_mutate_property_record(property_id, user_id))
        with check (public.homeos_can_mutate_property_record(property_id, user_id));

        create policy job_thread_events_delete_property_creator
        on public.job_thread_events
        for delete
        to authenticated
        using (public.homeos_can_mutate_property_record(property_id, user_id));
    end if;
end
$$;

commit;
