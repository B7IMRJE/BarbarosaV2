-- DESTRUCTIVE cleanup for confirmed legacy HomeOS null-property rows.
-- Run only after 552_Preview_Legacy_Null_Property_HomeOS_Cleanup.sql returns PASS.
-- This file does not delete storage.objects because targeted file metadata has no bucket/path.
-- The 10 orphan home_item_files rows with null property_id, null home_item_id, null user_id,
-- and missing storage metadata are intentionally preserved for separate review.

begin;

select
    '01_before_cleanup_counts' as section,
    (select count(*) from public.home_items where property_id is null) as null_property_home_items_before,
    (select count(*) from public.home_item_files where property_id is null) as null_property_home_item_files_before;

do $$
declare
    v_legacy_user_ids constant uuid[] := array[
        '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid,
        'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid
    ];
    v_expected_legacy_user_1_count constant integer := 58;
    v_expected_legacy_user_2_count constant integer := 3;
    v_expected_legacy_item_count constant integer := 61;
    v_expected_attached_file_count constant integer := 15;
    v_expected_null_property_file_count constant integer := 25;
    v_expected_orphan_file_count constant integer := 10;
    v_null_property_item_count integer;
    v_legacy_user_1_item_count integer;
    v_legacy_user_2_item_count integer;
    v_unexpected_null_property_item_count integer;
    v_null_property_file_count integer;
    v_attached_file_count integer;
    v_attached_file_missing_storage_count integer;
    v_attached_file_with_storage_count integer;
    v_property_item_file_count integer;
    v_missing_item_file_count integer;
    v_orphan_file_count integer;
    v_deleted_file_count integer;
    v_deleted_item_count integer;
    v_remaining_legacy_item_count integer;
    v_remaining_broken_file_reference_count integer;
    v_remaining_orphan_file_count integer;
begin
    select count(*)
    into v_null_property_item_count
    from public.home_items as item_row
    where item_row.property_id is null;

    select count(*)
    into v_legacy_user_1_item_count
    from public.home_items as item_row
    where item_row.property_id is null
      and item_row.user_id = '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid;

    select count(*)
    into v_legacy_user_2_item_count
    from public.home_items as item_row
    where item_row.property_id is null
      and item_row.user_id = 'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid;

    select count(*)
    into v_unexpected_null_property_item_count
    from public.home_items as item_row
    where item_row.property_id is null
      and (
          item_row.user_id is null
          or item_row.user_id <> all(v_legacy_user_ids)
      );

    select count(*)
    into v_null_property_file_count
    from public.home_item_files as file_row
    where file_row.property_id is null;

    select count(*)
    into v_attached_file_count
    from public.home_item_files as file_row
    join public.home_items as item_row
      on item_row.id = file_row.home_item_id
    where file_row.property_id is null
      and item_row.property_id is null
      and item_row.user_id = any(v_legacy_user_ids);

    select count(*)
    into v_attached_file_missing_storage_count
    from public.home_item_files as file_row
    join public.home_items as item_row
      on item_row.id = file_row.home_item_id
    where file_row.property_id is null
      and item_row.property_id is null
      and item_row.user_id = any(v_legacy_user_ids)
      and file_row.storage_bucket is null
      and btrim(coalesce(file_row.storage_path, '')) = '';

    select count(*)
    into v_attached_file_with_storage_count
    from public.home_item_files as file_row
    join public.home_items as item_row
      on item_row.id = file_row.home_item_id
    where file_row.property_id is null
      and item_row.property_id is null
      and item_row.user_id = any(v_legacy_user_ids)
      and (
          file_row.storage_bucket is not null
          or btrim(coalesce(file_row.storage_path, '')) <> ''
      );

    select count(*)
    into v_property_item_file_count
    from public.home_item_files as file_row
    join public.home_items as item_row
      on item_row.id = file_row.home_item_id
    where file_row.property_id is null
      and item_row.property_id is not null;

    select count(*)
    into v_missing_item_file_count
    from public.home_item_files as file_row
    left join public.home_items as item_row
      on item_row.id = file_row.home_item_id
    where file_row.property_id is null
      and file_row.home_item_id is not null
      and item_row.id is null;

    select count(*)
    into v_orphan_file_count
    from public.home_item_files as file_row
    where file_row.property_id is null
      and file_row.home_item_id is null
      and file_row.user_id is null
      and file_row.storage_bucket is null
      and btrim(coalesce(file_row.storage_path, '')) = '';

    if v_null_property_item_count <> v_expected_legacy_item_count then
        raise exception 'Expected % null-property home_items, found %. Cleanup aborted.',
            v_expected_legacy_item_count,
            v_null_property_item_count;
    end if;

    if v_legacy_user_1_item_count <> v_expected_legacy_user_1_count
       or v_legacy_user_2_item_count <> v_expected_legacy_user_2_count then
        raise exception 'Legacy user split did not match expected 58 + 3. Cleanup aborted.';
    end if;

    if v_unexpected_null_property_item_count <> 0 then
        raise exception 'Found % unexpected null-property home_items outside the approved legacy users. Cleanup aborted.',
            v_unexpected_null_property_item_count;
    end if;

    if v_null_property_file_count <> v_expected_null_property_file_count then
        raise exception 'Expected % null-property home_item_files, found %. Cleanup aborted.',
            v_expected_null_property_file_count,
            v_null_property_file_count;
    end if;

    if v_attached_file_count <> v_expected_attached_file_count then
        raise exception 'Expected % legacy-attached home_item_files, found %. Cleanup aborted.',
            v_expected_attached_file_count,
            v_attached_file_count;
    end if;

    if v_attached_file_missing_storage_count <> v_expected_attached_file_count
       or v_attached_file_with_storage_count <> 0 then
        raise exception 'Legacy-attached file storage metadata did not match the no-storage expectation. Cleanup aborted.';
    end if;

    if v_property_item_file_count <> 0 then
        raise exception 'Found % null-property home_item_files attached to property-scoped home_items. Cleanup aborted.',
            v_property_item_file_count;
    end if;

    if v_missing_item_file_count <> 0 then
        raise exception 'Found % null-property home_item_files attached to missing home_items. Cleanup aborted.',
            v_missing_item_file_count;
    end if;

    if v_orphan_file_count <> v_expected_orphan_file_count then
        raise exception 'Expected % orphan home_item_files for later review, found %. Cleanup aborted.',
            v_expected_orphan_file_count,
            v_orphan_file_count;
    end if;

    delete from public.home_item_files as file_row
    using public.home_items as item_row
    where file_row.property_id is null
      and file_row.home_item_id = item_row.id
      and item_row.property_id is null
      and item_row.user_id = any(v_legacy_user_ids)
      and file_row.storage_bucket is null
      and btrim(coalesce(file_row.storage_path, '')) = '';
    get diagnostics v_deleted_file_count = row_count;

    if v_deleted_file_count <> v_expected_attached_file_count then
        raise exception 'Deleted % home_item_files, expected %. Cleanup aborted.',
            v_deleted_file_count,
            v_expected_attached_file_count;
    end if;

    delete from public.home_items as item_row
    where item_row.property_id is null
      and item_row.user_id = any(v_legacy_user_ids);
    get diagnostics v_deleted_item_count = row_count;

    if v_deleted_item_count <> v_expected_legacy_item_count then
        raise exception 'Deleted % home_items, expected %. Cleanup aborted.',
            v_deleted_item_count,
            v_expected_legacy_item_count;
    end if;

    select count(*)
    into v_remaining_legacy_item_count
    from public.home_items as item_row
    where item_row.property_id is null
      and item_row.user_id = any(v_legacy_user_ids);

    if v_remaining_legacy_item_count <> 0 then
        raise exception 'Legacy null-property home_items remain after cleanup. Cleanup aborted.';
    end if;

    select count(*)
    into v_remaining_broken_file_reference_count
    from public.home_item_files as file_row
    left join public.home_items as item_row
      on item_row.id = file_row.home_item_id
    where file_row.property_id is null
      and file_row.home_item_id is not null
      and item_row.id is null;

    if v_remaining_broken_file_reference_count <> 0 then
        raise exception 'Cleanup would leave % null-property file rows attached to missing home_items. Cleanup aborted.',
            v_remaining_broken_file_reference_count;
    end if;

    select count(*)
    into v_remaining_orphan_file_count
    from public.home_item_files as file_row
    where file_row.property_id is null
      and file_row.home_item_id is null
      and file_row.user_id is null
      and file_row.storage_bucket is null
      and btrim(coalesce(file_row.storage_path, '')) = '';

    if v_remaining_orphan_file_count <> v_expected_orphan_file_count then
        raise exception 'Orphan file rows for later review changed from % to %. Cleanup aborted.',
            v_expected_orphan_file_count,
            v_remaining_orphan_file_count;
    end if;

    raise notice 'Legacy null-property cleanup deleted home_items=%, home_item_files=%. Preserved orphan home_item_files=%.',
        v_deleted_item_count,
        v_deleted_file_count,
        v_remaining_orphan_file_count;
end
$$;

select
    '02_after_cleanup_counts' as section,
    (select count(*) from public.home_items where property_id is null) as null_property_home_items_after,
    (select count(*) from public.home_items where property_id is not null) as property_scoped_home_items_after,
    (select count(*) from public.home_item_files where property_id is null) as null_property_home_item_files_after,
    (select count(*) from public.home_item_files where property_id is not null) as property_scoped_home_item_files_after;

select
    '03_preserved_orphan_file_rows' as section,
    count(*) as orphan_file_rows_preserved_for_later_review
from public.home_item_files as file_row
where file_row.property_id is null
  and file_row.home_item_id is null
  and file_row.user_id is null
  and file_row.storage_bucket is null
  and btrim(coalesce(file_row.storage_path, '')) = '';

commit;
