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
end
$$;

do $$
declare
    v_table text;
    v_column text;
begin
    foreach v_column in array array['id', 'property_id', 'user_id', 'status', 'created_at'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'property_memberships'
              and column_name = v_column
        ) then
            raise exception 'public.property_memberships is missing required column %. Cannot property-scope HomeOS records.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'user_id', 'item_slug'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'home_items'
              and column_name = v_column
        ) then
            raise exception 'public.home_items is missing required column %. Cannot property-scope HomeOS records.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'user_id', 'item_slug', 'home_item_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'home_item_files'
              and column_name = v_column
        ) then
            raise exception 'public.home_item_files is missing required column %. Cannot property-scope HomeOS records.', v_column;
        end if;
    end loop;

    foreach v_table in array array[
        'maintenance_records',
        'home_emergencies',
        'jobs',
        'job_thread_events'
    ] loop
        if to_regclass(format('public.%I', v_table)) is null then
            raise notice 'Optional HomeOS table public.% does not exist; skipping property-scope changes for that feature.', v_table;
        elsif not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = v_table
              and column_name = 'user_id'
        ) then
            raise exception 'public.% exists but is missing required user_id column. Cannot property-scope this table.', v_table;
        end if;
    end loop;
end
$$;

alter table public.home_items
    add column if not exists property_id uuid;

alter table public.home_item_files
    add column if not exists property_id uuid;

do $$
declare
    v_table text;
begin
    foreach v_table in array array[
        'maintenance_records',
        'home_emergencies',
        'jobs',
        'job_thread_events'
    ] loop
        if to_regclass(format('public.%I', v_table)) is not null then
            execute format('alter table public.%I add column if not exists property_id uuid', v_table);
        end if;
    end loop;
end
$$;

do $$
declare
    v_table text;
    v_constraint_name text;
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

    foreach v_table in array array[
        'maintenance_records',
        'home_emergencies',
        'jobs',
        'job_thread_events'
    ] loop
        if to_regclass(format('public.%I', v_table)) is not null then
            v_constraint_name := v_table || '_property_id_fkey';

            if not exists (
                select 1
                from pg_constraint
                where conname = v_constraint_name
                  and conrelid = to_regclass(format('public.%I', v_table))
            ) then
                execute format(
                    'alter table public.%I add constraint %I foreign key (property_id) references public.properties(id) on delete cascade',
                    v_table,
                    v_constraint_name
                );
            end if;
        end if;
    end loop;
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
    if to_regclass('public.maintenance_records') is not null then
        if exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'maintenance_records'
              and column_name = 'item_id'
        ) then
            execute $sql$
            update public.maintenance_records as record
            set property_id = item.property_id
            from public.home_items as item
            where record.property_id is null
              and record.item_id = item.id
              and item.property_id is not null;
            $sql$;
        end if;

        execute $sql$
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
        $sql$;
    end if;

    if to_regclass('public.home_emergencies') is not null then
        execute $sql$
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
        $sql$;
    end if;

    if to_regclass('public.jobs') is not null then
        if exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'jobs'
              and column_name = 'id'
        ) and exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'jobs'
              and column_name = 'item_slug'
        ) then
            execute $sql$
            with exact_item_matches as (
                select
                    job.id as job_id,
                    (array_agg(item.property_id order by item.id))[1] as property_id,
                    count(distinct item.property_id) as property_count
                from public.jobs as job
                join public.home_items as item
                  on item.user_id = job.user_id
                 and item.item_slug = job.item_slug
                where job.property_id is null
                  and job.user_id is not null
                  and job.item_slug is not null
                  and item.property_id is not null
                group by job.id
            )
            update public.jobs as job
            set property_id = exact_item_matches.property_id
            from exact_item_matches
            where job.id = exact_item_matches.job_id
              and exact_item_matches.property_count = 1;
            $sql$;
        end if;

        execute $sql$
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
        $sql$;
    end if;

    if to_regclass('public.job_thread_events') is not null then
        if to_regclass('public.jobs') is not null
           and exists (
               select 1
               from information_schema.columns
               where table_schema = 'public'
                 and table_name = 'job_thread_events'
                 and column_name = 'job_id'
           ) then
            execute $sql$
            update public.job_thread_events as event
            set property_id = job.property_id
            from public.jobs as job
            where event.property_id is null
              and event.job_id = job.id
              and job.property_id is not null;
            $sql$;
        end if;

        execute $sql$
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
        $sql$;
    end if;
end
$$;

do $$
declare
    v_table text;
    v_ambiguous_count integer;
    v_unresolved_count integer;
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
            execute format($sql$
                with ambiguous_users as (
                    select user_id
                    from public.property_memberships
                    where status = 'active'
                    group by user_id
                    having count(*) > 1
                )
                select count(*)
                from public.%I as record
                join ambiguous_users as ambiguous_user
                  on ambiguous_user.user_id = record.user_id
                where record.property_id is null
            $sql$, v_table)
            into v_ambiguous_count;

            execute format(
                'select count(*) from public.%I where property_id is null',
                v_table
            )
            into v_unresolved_count;

            if v_unresolved_count > 0 then
                raise exception 'Cannot complete property-scope migration; unresolved rows remain in public.%: %. ambiguous active membership rows: %',
                    v_table,
                    v_unresolved_count,
                    v_ambiguous_count;
            end if;
        end if;
    end loop;
end
$$;

do $$
declare
    v_table text;
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
            execute format('alter table public.%I alter column property_id set not null', v_table);
        end if;
    end loop;
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

do $$
declare
    v_table text;
    v_index_name text;
begin
    foreach v_table in array array[
        'maintenance_records',
        'home_emergencies',
        'jobs',
        'job_thread_events'
    ] loop
        if to_regclass(format('public.%I', v_table)) is not null then
            v_index_name := v_table || '_property_id_idx';

            execute format(
                'create index if not exists %I on public.%I (property_id)',
                v_index_name,
                v_table
            );
        end if;
    end loop;
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

            execute format('alter table public.%I enable row level security', v_table);
            execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);

            execute format(
                'create policy %I on public.%I for select to authenticated using (public.homeos_can_read_property_record(property_id))',
                v_table || '_select_property_members',
                v_table
            );

            execute format(
                'create policy %I on public.%I for insert to authenticated with check (public.homeos_can_mutate_property_record(property_id, user_id))',
                v_table || '_insert_property_creator',
                v_table
            );

            execute format(
                'create policy %I on public.%I for update to authenticated using (public.homeos_can_mutate_property_record(property_id, user_id)) with check (public.homeos_can_mutate_property_record(property_id, user_id))',
                v_table || '_update_property_creator',
                v_table
            );

            execute format(
                'create policy %I on public.%I for delete to authenticated using (public.homeos_can_mutate_property_record(property_id, user_id))',
                v_table || '_delete_property_creator',
                v_table
            );
        end if;
    end loop;
end
$$;

commit;
