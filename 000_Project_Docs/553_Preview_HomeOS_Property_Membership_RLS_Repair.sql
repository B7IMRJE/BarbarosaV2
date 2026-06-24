-- Read-only preview for the HomeOS property-membership RLS repair migration.
-- This file reports metadata and counts only. It does not modify data or policies.

with required_tables(table_name) as (
    values
        ('profiles'),
        ('properties'),
        ('property_memberships'),
        ('home_items'),
        ('home_item_files'),
        ('home_emergencies'),
        ('jobs'),
        ('job_thread_events')
),
required_columns(table_name, column_name) as (
    values
        ('properties', 'id'),
        ('property_memberships', 'id'),
        ('property_memberships', 'property_id'),
        ('property_memberships', 'user_id'),
        ('property_memberships', 'status'),
        ('home_items', 'id'),
        ('home_items', 'property_id'),
        ('home_items', 'user_id'),
        ('home_item_files', 'id'),
        ('home_item_files', 'property_id'),
        ('home_item_files', 'user_id'),
        ('home_item_files', 'home_item_id'),
        ('home_emergencies', 'id'),
        ('home_emergencies', 'property_id'),
        ('home_emergencies', 'user_id'),
        ('jobs', 'id'),
        ('jobs', 'property_id'),
        ('jobs', 'user_id'),
        ('job_thread_events', 'id'),
        ('job_thread_events', 'property_id'),
        ('job_thread_events', 'user_id'),
        ('job_thread_events', 'job_id')
),
table_checks as (
    select
        table_name,
        exists (
            select 1
            from information_schema.tables
            where table_schema = 'public'
              and information_schema.tables.table_name = required_tables.table_name
        ) as exists_ok
    from required_tables
),
column_checks as (
    select
        required_columns.table_name,
        required_columns.column_name,
        exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and information_schema.columns.table_name = required_columns.table_name
              and information_schema.columns.column_name = required_columns.column_name
        ) as exists_ok
    from required_columns
),
jobs_invalid_property_refs as (
    select count(*) as row_count
    from public.jobs as job
    where job.property_id is not null
      and not exists (
          select 1
          from public.properties as property
          where property.id = job.property_id
      )
),
home_item_file_property_mismatches as (
    select count(*) as row_count
    from public.home_item_files as file_row
    join public.home_items as item
      on item.id = file_row.home_item_id
    where file_row.property_id is not null
      and item.property_id is distinct from file_row.property_id
),
home_item_file_missing_linked_items as (
    select count(*) as row_count
    from public.home_item_files as file_row
    where file_row.property_id is not null
      and file_row.home_item_id is not null
      and not exists (
          select 1
          from public.home_items as item
          where item.id = file_row.home_item_id
      )
),
job_thread_event_property_mismatches as (
    select count(*) as row_count
    from public.job_thread_events as event
    join public.jobs as job
      on job.id = event.job_id
    where event.property_id is not null
      and job.property_id is distinct from event.property_id
),
job_thread_event_missing_linked_jobs as (
    select count(*) as row_count
    from public.job_thread_events as event
    where event.property_id is not null
      and event.job_id is not null
      and not exists (
          select 1
          from public.jobs as job
          where job.id = event.job_id
      )
),
readiness_checks(check_name, expected_ok, actual_ok) as (
    select 'required_tables_exist', true, not exists (select 1 from table_checks where not exists_ok)
    union all
    select 'required_columns_exist', true, not exists (select 1 from column_checks where not exists_ok)
    union all
    select 'jobs_property_refs_valid', true, (select row_count = 0 from jobs_invalid_property_refs)
    union all
    select 'home_item_file_linked_items_exist', true, (select row_count = 0 from home_item_file_missing_linked_items)
    union all
    select 'home_item_file_property_links_valid', true, (select row_count = 0 from home_item_file_property_mismatches)
    union all
    select 'job_thread_event_linked_jobs_exist', true, (select row_count = 0 from job_thread_event_missing_linked_jobs)
    union all
    select 'job_thread_event_property_links_valid', true, (select row_count = 0 from job_thread_event_property_mismatches)
)
select
    '01_readiness_summary' as section,
    case when bool_and(expected_ok = actual_ok) then 'PASS' else 'FAIL' end as result,
    count(*) as total_checks,
    count(*) filter (where expected_ok <> actual_ok) as failed_checks
from readiness_checks;

with required_tables(table_name) as (
    values
        ('profiles'),
        ('properties'),
        ('property_memberships'),
        ('home_items'),
        ('home_item_files'),
        ('home_emergencies'),
        ('jobs'),
        ('job_thread_events')
)
select
    '02_required_tables' as section,
    required_tables.table_name,
    exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and information_schema.tables.table_name = required_tables.table_name
    ) as exists_ok
from required_tables
order by required_tables.table_name;

with required_columns(table_name, column_name) as (
    values
        ('properties', 'id'),
        ('property_memberships', 'id'),
        ('property_memberships', 'property_id'),
        ('property_memberships', 'user_id'),
        ('property_memberships', 'status'),
        ('home_items', 'id'),
        ('home_items', 'property_id'),
        ('home_items', 'user_id'),
        ('home_item_files', 'id'),
        ('home_item_files', 'property_id'),
        ('home_item_files', 'user_id'),
        ('home_item_files', 'home_item_id'),
        ('home_emergencies', 'id'),
        ('home_emergencies', 'property_id'),
        ('home_emergencies', 'user_id'),
        ('jobs', 'id'),
        ('jobs', 'property_id'),
        ('jobs', 'user_id'),
        ('job_thread_events', 'id'),
        ('job_thread_events', 'property_id'),
        ('job_thread_events', 'user_id'),
        ('job_thread_events', 'job_id')
)
select
    '03_required_columns' as section,
    required_columns.table_name,
    required_columns.column_name,
    coalesce(columns.data_type, '[missing]') as data_type,
    columns.is_nullable,
    columns.column_default,
    columns.column_name is not null as exists_ok
from required_columns
left join information_schema.columns as columns
  on columns.table_schema = 'public'
 and columns.table_name = required_columns.table_name
 and columns.column_name = required_columns.column_name
order by required_columns.table_name, required_columns.column_name;

select
    '04_helper_functions' as section,
    expected.function_name,
    exists (
        select 1
        from pg_proc as proc
        join pg_namespace as namespace
          on namespace.oid = proc.pronamespace
        where namespace.nspname = 'public'
          and proc.proname = expected.function_name
    ) as exists_ok
from (
    values
        ('homeos_is_platform_admin'),
        ('homeos_has_active_property_membership'),
        ('homeos_can_read_property_record'),
        ('homeos_can_mutate_property_record')
) as expected(function_name)
order by expected.function_name;

select
    '05_current_public_policies' as section,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    left(coalesce(qual, ''), 240) as using_expression,
    left(coalesce(with_check, ''), 240) as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
      'home_items',
      'home_item_files',
      'home_emergencies',
      'jobs',
      'job_thread_events',
      'home_item_maintenance_tasks',
      'home_item_maintenance_completions'
  )
order by tablename, policyname;

select
    '06_property_scope_counts' as section,
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
        'jobs'::text as table_name,
        count(*) filter (where property_id is null) as null_property_id_count,
        count(*) filter (where property_id is not null) as non_null_property_id_count
    from public.jobs
    union all
    select
        'job_thread_events'::text as table_name,
        count(*) filter (where property_id is null) as null_property_id_count,
        count(*) filter (where property_id is not null) as non_null_property_id_count
    from public.job_thread_events
) as counts
order by table_name;

select
    '07_relationship_safety_counts' as section,
    (select count(*) from public.jobs as job where job.property_id is not null and not exists (
        select 1 from public.properties as property where property.id = job.property_id
    )) as jobs_invalid_property_refs,
    (select count(*) from public.home_item_files as file_row where file_row.property_id is not null and file_row.home_item_id is not null and not exists (
        select 1 from public.home_items as item where item.id = file_row.home_item_id
    )) as home_item_file_missing_linked_items,
    (select count(*) from public.home_item_files as file_row join public.home_items as item on item.id = file_row.home_item_id where file_row.property_id is not null and item.property_id is distinct from file_row.property_id) as home_item_file_property_mismatches,
    (select count(*) from public.job_thread_events as event where event.property_id is not null and event.job_id is not null and not exists (
        select 1 from public.jobs as job where job.id = event.job_id
    )) as job_thread_event_missing_linked_jobs,
    (select count(*) from public.job_thread_events as event join public.jobs as job on job.id = event.job_id where event.property_id is not null and job.property_id is distinct from event.property_id) as job_thread_event_property_mismatches,
    (select count(*) from public.home_item_files as file_row where file_row.property_id is null and file_row.home_item_id is null and file_row.user_id is null and file_row.storage_bucket is null and btrim(coalesce(file_row.storage_path, '')) = '') as preserved_orphan_file_rows;

select
    '08_jobs_property_support' as section,
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
    ) as jobs_property_id_fkey_exists;

select
    '09_storage_object_policy_snapshot' as section,
    policyname,
    permissive,
    roles,
    cmd,
    left(coalesce(qual, ''), 240) as using_expression,
    left(coalesce(with_check, ''), 240) as with_check_expression
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
      policyname ilike '%item%'
      or coalesce(qual, '') ilike '%item-files%'
      or coalesce(qual, '') ilike '%item-photos%'
      or coalesce(with_check, '') ilike '%item-files%'
      or coalesce(with_check, '') ilike '%item-photos%'
  )
order by policyname;
