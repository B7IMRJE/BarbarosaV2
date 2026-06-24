begin;

do $$
declare
    v_table text;
    v_column text;
begin
    foreach v_table in array array[
        'profiles',
        'properties',
        'property_memberships',
        'home_items',
        'home_item_files',
        'home_emergencies',
        'jobs',
        'job_thread_events'
    ] loop
        if to_regclass(format('public.%I', v_table)) is null then
            raise exception 'public.% does not exist; cannot repair HomeOS property-member RLS.', v_table;
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
            raise exception 'public.properties is missing required column %. Cannot repair HomeOS property-member RLS.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'property_id', 'user_id', 'status'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'property_memberships'
              and column_name = v_column
        ) then
            raise exception 'public.property_memberships is missing required column %. Cannot repair HomeOS property-member RLS.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'property_id', 'user_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'home_items'
              and column_name = v_column
        ) then
            raise exception 'public.home_items is missing required column %. Cannot repair HomeOS property-member RLS.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'property_id', 'user_id', 'home_item_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'home_item_files'
              and column_name = v_column
        ) then
            raise exception 'public.home_item_files is missing required column %. Cannot repair HomeOS property-member RLS.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'property_id', 'user_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'home_emergencies'
              and column_name = v_column
        ) then
            raise exception 'public.home_emergencies is missing required column %. Cannot repair HomeOS property-member RLS.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'property_id', 'user_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'jobs'
              and column_name = v_column
        ) then
            raise exception 'public.jobs is missing required column %. Cannot repair HomeOS property-member RLS.', v_column;
        end if;
    end loop;

    foreach v_column in array array['id', 'property_id', 'user_id', 'job_id'] loop
        if not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'job_thread_events'
              and column_name = v_column
        ) then
            raise exception 'public.job_thread_events is missing required column %. Cannot repair HomeOS property-member RLS.', v_column;
        end if;
    end loop;
end
$$;

do $$
begin
    if exists (
        select 1
        from public.jobs as job
        where job.property_id is not null
          and not exists (
              select 1
              from public.properties as property
              where property.id = job.property_id
          )
    ) then
        raise exception 'public.jobs has non-null property_id values that do not exist in public.properties. Cleanup required before adding jobs_property_id_fkey.';
    end if;

    if exists (
        select 1
        from public.home_item_files as file_row
        where file_row.property_id is not null
          and file_row.home_item_id is not null
          and not exists (
              select 1
              from public.home_items as item
              where item.id = file_row.home_item_id
          )
    ) then
        raise exception 'public.home_item_files has property-scoped rows linked to missing home_items. Cleanup required before repairing RLS.';
    end if;

    if exists (
        select 1
        from public.home_item_files as file_row
        join public.home_items as item
          on item.id = file_row.home_item_id
        where file_row.property_id is not null
          and item.property_id is distinct from file_row.property_id
    ) then
        raise exception 'public.home_item_files has property_id values that do not match linked home_items. Cleanup required before repairing RLS.';
    end if;

    if exists (
        select 1
        from public.job_thread_events as event
        where event.property_id is not null
          and event.job_id is not null
          and not exists (
              select 1
              from public.jobs as job
              where job.id = event.job_id
          )
    ) then
        raise exception 'public.job_thread_events has property-scoped rows linked to missing jobs. Cleanup required before repairing RLS.';
    end if;

    if exists (
        select 1
        from public.job_thread_events as event
        join public.jobs as job
          on job.id = event.job_id
        where event.property_id is not null
          and job.property_id is distinct from event.property_id
    ) then
        raise exception 'public.job_thread_events has property_id values that do not match linked jobs. Cleanup required before repairing RLS.';
    end if;

    if not exists (
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
end
$$;

create index if not exists jobs_property_id_idx
    on public.jobs (property_id);

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
        'home_emergencies',
        'jobs',
        'job_thread_events'
    ] loop
        for v_policy in
            select policyname
            from pg_policies
            where schemaname = 'public'
              and tablename = v_table
        loop
            execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
        end loop;

        execute format('alter table public.%I enable row level security', v_table);
        execute format('revoke all on table public.%I from public', v_table);
        execute format('revoke all on table public.%I from anon', v_table);
        execute format('grant select, insert, update, delete on table public.%I to authenticated', v_table);
    end loop;
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
    with check (
        public.homeos_can_mutate_property_record(property_id, user_id)
        and exists (
            select 1
            from public.home_items as item
            where item.id = home_item_files.home_item_id
              and item.property_id = home_item_files.property_id
        )
    );

create policy home_item_files_update_property_creator
    on public.home_item_files
    for update
    to authenticated
    using (public.homeos_can_mutate_property_record(property_id, user_id))
    with check (
        public.homeos_can_mutate_property_record(property_id, user_id)
        and exists (
            select 1
            from public.home_items as item
            where item.id = home_item_files.home_item_id
              and item.property_id = home_item_files.property_id
        )
    );

create policy home_item_files_delete_property_creator
    on public.home_item_files
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

create policy job_thread_events_select_property_members
    on public.job_thread_events
    for select
    to authenticated
    using (public.homeos_can_read_property_record(property_id));

create policy job_thread_events_insert_property_creator
    on public.job_thread_events
    for insert
    to authenticated
    with check (
        public.homeos_can_mutate_property_record(property_id, user_id)
        and exists (
            select 1
            from public.jobs as job
            where job.id = job_thread_events.job_id
              and job.property_id = job_thread_events.property_id
        )
    );

create policy job_thread_events_update_property_creator
    on public.job_thread_events
    for update
    to authenticated
    using (public.homeos_can_mutate_property_record(property_id, user_id))
    with check (
        public.homeos_can_mutate_property_record(property_id, user_id)
        and exists (
            select 1
            from public.jobs as job
            where job.id = job_thread_events.job_id
              and job.property_id = job_thread_events.property_id
        )
    );

create policy job_thread_events_delete_property_creator
    on public.job_thread_events
    for delete
    to authenticated
    using (public.homeos_can_mutate_property_record(property_id, user_id));

commit;

select
    'homeos_property_membership_rls_repair_verification' as section,
    (
        select count(*)
        from pg_proc as proc
        join pg_namespace as namespace
          on namespace.oid = proc.pronamespace
        where namespace.nspname = 'public'
          and proc.proname in (
              'homeos_is_platform_admin',
              'homeos_has_active_property_membership',
              'homeos_can_read_property_record',
              'homeos_can_mutate_property_record'
          )
    ) as helper_functions_present,
    exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'jobs'
          and indexname = 'jobs_property_id_idx'
    ) as jobs_property_id_idx_exists,
    exists (
        select 1
        from pg_constraint
        where conrelid = 'public.jobs'::regclass
          and conname = 'jobs_property_id_fkey'
    ) as jobs_property_id_fkey_exists,
    (
        select count(*)
        from pg_policies
        where schemaname = 'public'
          and tablename in (
              'home_items',
              'home_item_files',
              'home_emergencies',
              'jobs',
              'job_thread_events'
          )
    ) as repaired_policy_count,
    (
        select count(*)
        from public.home_item_files as file_row
        where file_row.property_id is null
    ) as null_property_home_item_files_remaining_for_review;
