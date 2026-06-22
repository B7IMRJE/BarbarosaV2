-- Preview only: legacy HomeOS data cleanup for two confirmed obsolete users.
-- Read-only SELECT statements. Do not use this file to modify data.

with legacy_users(user_id) as (
    values
        ('05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid),
        ('aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid)
),
target_home_items as (
    select item_row.*
    from public.home_items as item_row
    join legacy_users
      on legacy_users.user_id = item_row.user_id
),
active_membership_users as (
    select distinct membership.user_id
    from public.property_memberships as membership
    where membership.status = 'active'
),
target_file_rows as (
    select distinct file_row.*
    from public.home_item_files as file_row
    left join target_home_items as item_row
      on item_row.id = file_row.home_item_id
    left join target_home_items as slug_item
      on slug_item.user_id = file_row.user_id
     and slug_item.item_slug = file_row.item_slug
     and file_row.item_slug is not null
    where item_row.id is not null
       or (
           file_row.user_id in (select user_id from legacy_users)
           and (
               file_row.home_item_id is null
               or slug_item.id is not null
           )
       )
),
target_jobs as (
    select distinct job.*
    from public.jobs as job
    join target_home_items as item_row
      on item_row.user_id = job.user_id
     and item_row.item_slug = job.item_slug
    where job.item_slug is not null
),
target_job_thread_events as (
    select event.*
    from public.job_thread_events as event
    join target_jobs as job
      on job.id = event.job_id
)
select
    '01_target_summary' as section,
    (select count(*) from target_home_items) as targeted_home_items,
    (select count(*) from target_home_items where user_id = '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid) as legacy_user_05a8532f_count,
    (select count(*) from target_home_items where user_id = 'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid) as legacy_user_aadf895f_count,
    (select count(*) from target_home_items where category = 'Area') as targeted_area_rows,
    (select min(created_at) from target_home_items) as earliest_target_created_at,
    (select max(created_at) from target_home_items) as latest_target_created_at,
    (select count(*) from target_home_items where user_id in (select user_id from active_membership_users)) as targeted_rows_with_active_membership_user,
    (select count(*) from public.home_items as item_row where item_row.user_id not in (select user_id from legacy_users) or item_row.user_id is null) as expected_non_legacy_home_items_remaining;

with legacy_users(user_id) as (
    values
        ('05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid),
        ('aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid)
),
target_home_items as (
    select item_row.*
    from public.home_items as item_row
    join legacy_users
      on legacy_users.user_id = item_row.user_id
)
select
    '02_target_count_by_legacy_user' as section,
    target_home_items.user_id,
    count(*) as item_count,
    min(created_at) as earliest_created_at,
    max(created_at) as latest_created_at
from target_home_items
group by target_home_items.user_id
order by item_count desc, target_home_items.user_id;

with legacy_users(user_id) as (
    values
        ('05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid),
        ('aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid)
),
target_home_items as (
    select item_row.*
    from public.home_items as item_row
    join legacy_users
      on legacy_users.user_id = item_row.user_id
)
select
    '03_target_count_by_category' as section,
    coalesce(category, '[null]') as category,
    coalesce(system, '[null]') as system,
    count(*) as item_count,
    count(*) filter (where category = 'Area') as area_row_count,
    min(created_at) as earliest_created_at,
    max(created_at) as latest_created_at
from target_home_items
group by coalesce(category, '[null]'), coalesce(system, '[null]')
order by item_count desc, category, system;

with legacy_users(user_id) as (
    values
        ('05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid),
        ('aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid)
),
target_home_items as (
    select item_row.*
    from public.home_items as item_row
    join legacy_users
      on legacy_users.user_id = item_row.user_id
),
target_file_rows as (
    select distinct file_row.*
    from public.home_item_files as file_row
    left join target_home_items as item_row
      on item_row.id = file_row.home_item_id
    left join target_home_items as slug_item
      on slug_item.user_id = file_row.user_id
     and slug_item.item_slug = file_row.item_slug
     and file_row.item_slug is not null
    where item_row.id is not null
       or (
           file_row.user_id in (select user_id from legacy_users)
           and (
               file_row.home_item_id is null
               or slug_item.id is not null
           )
       )
),
cross_user_file_rows as (
    select file_row.*
    from public.home_item_files as file_row
    join target_home_items as item_row
      on item_row.id = file_row.home_item_id
    where file_row.user_id is not null
      and file_row.user_id not in (select user_id from legacy_users)
),
legacy_files_linked_elsewhere as (
    select file_row.*
    from public.home_item_files as file_row
    where file_row.user_id in (select user_id from legacy_users)
      and file_row.home_item_id is not null
      and not exists (
          select 1
          from target_home_items as item_row
          where item_row.id = file_row.home_item_id
      )
)
select
    '04_home_item_files_preview' as section,
    (select count(*) from target_file_rows) as related_file_rows_targeted,
    (select count(*) from target_file_rows where home_item_id in (select id from target_home_items)) as file_rows_with_linked_targeted_home_item_id,
    (select count(*) from public.home_item_files as file_row where file_row.user_id in (select user_id from legacy_users) and file_row.home_item_id is null) as legacy_user_file_rows_missing_home_item_id,
    (select count(*) from cross_user_file_rows) as cross_user_file_rows_linked_to_target_items_should_abort,
    (select count(*) from legacy_files_linked_elsewhere) as legacy_user_file_rows_linked_to_non_target_items_require_decision,
    (select count(*) from public.home_item_files as file_row where file_row.home_item_id in (select id from target_home_items) and file_row.id not in (select id from target_file_rows)) as file_rows_that_would_remain_orphaned_after_delete,
    (select count(*) from target_file_rows where nullif(storage_bucket, '') is not null and nullif(storage_path, '') is not null) as storage_objects_with_bucket_and_path;

with legacy_users(user_id) as (
    values
        ('05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid),
        ('aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid)
),
target_home_items as (
    select item_row.*
    from public.home_items as item_row
    join legacy_users
      on legacy_users.user_id = item_row.user_id
),
target_file_rows as (
    select distinct file_row.*
    from public.home_item_files as file_row
    left join target_home_items as item_row
      on item_row.id = file_row.home_item_id
    left join target_home_items as slug_item
      on slug_item.user_id = file_row.user_id
     and slug_item.item_slug = file_row.item_slug
     and file_row.item_slug is not null
    where item_row.id is not null
       or (
           file_row.user_id in (select user_id from legacy_users)
           and (
               file_row.home_item_id is null
               or slug_item.id is not null
           )
       )
)
select
    '05_storage_bucket_path_counts' as section,
    coalesce(storage_bucket, '[null]') as storage_bucket,
    count(*) as file_row_count,
    count(*) filter (where nullif(storage_path, '') is not null) as rows_with_storage_path,
    count(distinct storage_path) filter (where nullif(storage_path, '') is not null) as distinct_storage_paths
from target_file_rows
group by coalesce(storage_bucket, '[null]')
order by file_row_count desc, storage_bucket;

with legacy_users(user_id) as (
    values
        ('05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid),
        ('aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid)
),
target_home_items as (
    select item_row.*
    from public.home_items as item_row
    join legacy_users
      on legacy_users.user_id = item_row.user_id
),
target_jobs as (
    select distinct job.*
    from public.jobs as job
    join target_home_items as item_row
      on item_row.user_id = job.user_id
     and item_row.item_slug = job.item_slug
    where job.item_slug is not null
),
target_job_thread_events as (
    select event.*
    from public.job_thread_events as event
    join target_jobs as job
      on job.id = event.job_id
)
select
    '06_jobs_and_threads_preview' as section,
    (select count(*) from target_jobs) as related_jobs_targeted,
    (select count(*) from target_job_thread_events) as related_job_thread_events_targeted,
    (select count(*) from public.jobs as job where job.user_id not in (select user_id from legacy_users) and job.item_slug in (select item_slug from target_home_items where item_slug is not null)) as non_legacy_jobs_with_matching_legacy_item_slug_not_targeted;

with legacy_users(user_id) as (
    values
        ('05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid),
        ('aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid)
),
target_home_items as (
    select item_row.*
    from public.home_items as item_row
    join legacy_users
      on legacy_users.user_id = item_row.user_id
),
active_membership_users as (
    select distinct membership.user_id
    from public.property_memberships as membership
    where membership.status = 'active'
)
select
    '07_safety_confirmation' as section,
    count(*) as targeted_home_items,
    count(*) filter (where target_home_items.user_id in (select user_id from active_membership_users)) as targeted_rows_with_active_membership_user,
    count(*) filter (where target_home_items.user_id not in (select user_id from legacy_users)) as non_legacy_rows_accidentally_targeted,
    (select count(*) from public.home_items as item_row where item_row.user_id in (select user_id from active_membership_users)) as active_membership_user_home_items_not_targeted
from target_home_items;
