-- Read-only preview for confirmed legacy HomeOS null-property cleanup.
-- This file reports counts only. It does not expose file URLs, storage paths, or private data.

with legacy_users(user_label, user_id, expected_item_count) as (
    values
        ('legacy_user_1', '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid, 58),
        ('legacy_user_2', 'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid, 3)
),
null_property_home_items as (
    select item_row.*
    from public.home_items as item_row
    where item_row.property_id is null
),
legacy_home_items as (
    select item_row.*
    from null_property_home_items as item_row
    join legacy_users
      on legacy_users.user_id = item_row.user_id
),
unexpected_null_property_home_items as (
    select item_row.*
    from null_property_home_items as item_row
    where not exists (
        select 1
        from legacy_users
        where legacy_users.user_id = item_row.user_id
    )
),
null_property_home_item_files as (
    select file_row.*
    from public.home_item_files as file_row
    where file_row.property_id is null
),
legacy_attached_file_rows as (
    select file_row.*
    from null_property_home_item_files as file_row
    join legacy_home_items as item_row
      on item_row.id = file_row.home_item_id
),
orphan_file_rows_for_review as (
    select file_row.*
    from null_property_home_item_files as file_row
    where file_row.home_item_id is null
      and file_row.user_id is null
      and file_row.storage_bucket is null
      and btrim(coalesce(file_row.storage_path, '')) = ''
),
null_property_files_attached_to_property_items as (
    select file_row.*
    from null_property_home_item_files as file_row
    join public.home_items as item_row
      on item_row.id = file_row.home_item_id
    where item_row.property_id is not null
),
null_property_files_attached_to_missing_items as (
    select file_row.*
    from null_property_home_item_files as file_row
    left join public.home_items as item_row
      on item_row.id = file_row.home_item_id
    where file_row.home_item_id is not null
      and item_row.id is null
),
safety_checks(check_name, expected_count, actual_count) as (
    select 'null_property_home_items_total', 61, (select count(*) from null_property_home_items)
    union all
    select 'legacy_user_1_null_property_home_items', 58, (
        select count(*)
        from legacy_home_items
        where user_id = '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid
    )
    union all
    select 'legacy_user_2_null_property_home_items', 3, (
        select count(*)
        from legacy_home_items
        where user_id = 'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid
    )
    union all
    select 'unexpected_null_property_home_items', 0, (select count(*) from unexpected_null_property_home_items)
    union all
    select 'legacy_attached_home_item_files', 15, (select count(*) from legacy_attached_file_rows)
    union all
    select 'legacy_attached_files_missing_storage_metadata', 15, (
        select count(*)
        from legacy_attached_file_rows
        where storage_bucket is null
          and btrim(coalesce(storage_path, '')) = ''
    )
    union all
    select 'legacy_attached_files_with_storage_metadata', 0, (
        select count(*)
        from legacy_attached_file_rows
        where storage_bucket is not null
           or btrim(coalesce(storage_path, '')) <> ''
    )
    union all
    select 'null_property_files_attached_to_property_items', 0, (
        select count(*)
        from null_property_files_attached_to_property_items
    )
    union all
    select 'null_property_files_attached_to_missing_items', 0, (
        select count(*)
        from null_property_files_attached_to_missing_items
    )
    union all
    select 'null_property_home_item_files_total', 25, (select count(*) from null_property_home_item_files)
    union all
    select 'orphan_file_rows_for_separate_review', 10, (select count(*) from orphan_file_rows_for_review)
)
select
    '01_pass_fail_summary' as section,
    case
        when bool_and(actual_count = expected_count) then 'PASS'
        else 'FAIL'
    end as result,
    count(*) as total_checks,
    count(*) filter (where actual_count <> expected_count) as failed_checks
from safety_checks;

with legacy_users(user_label, user_id, expected_item_count) as (
    values
        ('legacy_user_1', '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid, 58),
        ('legacy_user_2', 'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid, 3)
),
null_property_home_items as (
    select item_row.*
    from public.home_items as item_row
    where item_row.property_id is null
),
legacy_home_items as (
    select item_row.*
    from null_property_home_items as item_row
    join legacy_users
      on legacy_users.user_id = item_row.user_id
),
unexpected_null_property_home_items as (
    select item_row.*
    from null_property_home_items as item_row
    where not exists (
        select 1
        from legacy_users
        where legacy_users.user_id = item_row.user_id
    )
),
null_property_home_item_files as (
    select file_row.*
    from public.home_item_files as file_row
    where file_row.property_id is null
),
legacy_attached_file_rows as (
    select file_row.*
    from null_property_home_item_files as file_row
    join legacy_home_items as item_row
      on item_row.id = file_row.home_item_id
),
orphan_file_rows_for_review as (
    select file_row.*
    from null_property_home_item_files as file_row
    where file_row.home_item_id is null
      and file_row.user_id is null
      and file_row.storage_bucket is null
      and btrim(coalesce(file_row.storage_path, '')) = ''
),
null_property_files_attached_to_property_items as (
    select file_row.*
    from null_property_home_item_files as file_row
    join public.home_items as item_row
      on item_row.id = file_row.home_item_id
    where item_row.property_id is not null
),
null_property_files_attached_to_missing_items as (
    select file_row.*
    from null_property_home_item_files as file_row
    left join public.home_items as item_row
      on item_row.id = file_row.home_item_id
    where file_row.home_item_id is not null
      and item_row.id is null
),
safety_checks(check_name, expected_count, actual_count) as (
    select 'null_property_home_items_total', 61, (select count(*) from null_property_home_items)
    union all
    select 'legacy_user_1_null_property_home_items', 58, (
        select count(*)
        from legacy_home_items
        where user_id = '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid
    )
    union all
    select 'legacy_user_2_null_property_home_items', 3, (
        select count(*)
        from legacy_home_items
        where user_id = 'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid
    )
    union all
    select 'unexpected_null_property_home_items', 0, (select count(*) from unexpected_null_property_home_items)
    union all
    select 'legacy_attached_home_item_files', 15, (select count(*) from legacy_attached_file_rows)
    union all
    select 'legacy_attached_files_missing_storage_metadata', 15, (
        select count(*)
        from legacy_attached_file_rows
        where storage_bucket is null
          and btrim(coalesce(storage_path, '')) = ''
    )
    union all
    select 'legacy_attached_files_with_storage_metadata', 0, (
        select count(*)
        from legacy_attached_file_rows
        where storage_bucket is not null
           or btrim(coalesce(storage_path, '')) <> ''
    )
    union all
    select 'null_property_files_attached_to_property_items', 0, (
        select count(*)
        from null_property_files_attached_to_property_items
    )
    union all
    select 'null_property_files_attached_to_missing_items', 0, (
        select count(*)
        from null_property_files_attached_to_missing_items
    )
    union all
    select 'null_property_home_item_files_total', 25, (select count(*) from null_property_home_item_files)
    union all
    select 'orphan_file_rows_for_separate_review', 10, (select count(*) from orphan_file_rows_for_review)
)
select
    '02_safety_checks' as section,
    check_name,
    expected_count,
    actual_count,
    case when actual_count = expected_count then 'PASS' else 'FAIL' end as result
from safety_checks
order by check_name;

with legacy_users(user_label, user_id, expected_item_count) as (
    values
        ('legacy_user_1', '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid, 58),
        ('legacy_user_2', 'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid, 3)
),
legacy_home_items as (
    select item_row.*
    from public.home_items as item_row
    join legacy_users
      on legacy_users.user_id = item_row.user_id
    where item_row.property_id is null
)
select
    '03_legacy_item_counts_by_user' as section,
    legacy_users.user_label,
    legacy_users.expected_item_count,
    count(legacy_home_items.id) as actual_item_count,
    case
        when count(legacy_home_items.id) = legacy_users.expected_item_count then 'PASS'
        else 'FAIL'
    end as result
from legacy_users
left join legacy_home_items
  on legacy_home_items.user_id = legacy_users.user_id
group by legacy_users.user_label, legacy_users.expected_item_count
order by legacy_users.user_label;

with null_property_home_item_files as (
    select file_row.*
    from public.home_item_files as file_row
    where file_row.property_id is null
)
select
    '04_orphan_file_rows_for_separate_review' as section,
    count(*) filter (
        where home_item_id is null
          and user_id is null
          and storage_bucket is null
          and btrim(coalesce(storage_path, '')) = ''
    ) as orphan_rows_preserved_for_later_review,
    count(*) filter (where home_item_id is null) as null_home_item_id_rows,
    count(*) filter (where user_id is null) as null_user_id_rows,
    count(*) filter (where storage_bucket is null) as null_storage_bucket_rows,
    count(*) filter (where btrim(coalesce(storage_path, '')) = '') as blank_storage_path_rows
from null_property_home_item_files;
