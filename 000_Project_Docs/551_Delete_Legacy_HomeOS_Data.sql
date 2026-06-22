-- One-time production cleanup for confirmed obsolete HomeOS legacy item data.
-- This is not an application migration. Run only after reviewing the preview file.

begin;

select
    '01_before_cleanup_counts' as section,
    (select count(*) from public.home_items) as total_home_items_before,
    (select count(*) from public.home_items where user_id in (
        '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid,
        'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid
    )) as targeted_legacy_home_items_before,
    (select count(*) from public.home_items where user_id not in (
        '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid,
        'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid
    ) or user_id is null) as non_legacy_home_items_before;

do $$
declare
    v_legacy_user_ids constant uuid[] := array[
        '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid,
        'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid
    ];
    v_expected_target_count constant integer := 61;
    v_target_item_ids uuid[];
    v_target_item_slugs text[];
    v_target_count integer;
    v_active_membership_target_count integer;
    v_non_legacy_home_items_before integer;
    v_non_legacy_home_items_after integer;
    v_cross_user_file_count integer;
    v_legacy_file_linked_elsewhere_count integer;
    v_related_file_count_before integer;
    v_related_file_count_after integer;
    v_related_job_count_before integer;
    v_related_job_count_after integer;
    v_related_thread_count_before integer;
    v_related_thread_count_after integer;
    v_deleted_thread_count integer;
    v_deleted_job_count integer;
    v_deleted_file_count integer;
    v_deleted_item_count integer;
begin
    if array_length(v_legacy_user_ids, 1) <> 2
       or not ('05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid = any(v_legacy_user_ids))
       or not ('aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid = any(v_legacy_user_ids)) then
        raise exception 'Cleanup target IDs do not exactly match the approved legacy users.';
    end if;

    select
        coalesce(array_agg(item_row.id order by item_row.id), array[]::uuid[]),
        coalesce(array_agg(distinct item_row.item_slug) filter (where item_row.item_slug is not null), array[]::text[]),
        count(*)
    into v_target_item_ids, v_target_item_slugs, v_target_count
    from public.home_items as item_row
    where item_row.user_id = any(v_legacy_user_ids);

    if v_target_count <> v_expected_target_count then
        raise exception 'Expected exactly % legacy home_items, found %. Cleanup aborted.', v_expected_target_count, v_target_count;
    end if;

    select count(*)
    into v_active_membership_target_count
    from public.home_items as item_row
    join public.property_memberships as membership
      on membership.user_id = item_row.user_id
     and membership.status = 'active'
    where item_row.id = any(v_target_item_ids);

    if v_active_membership_target_count > 0 then
        raise exception 'Targeted home_items include rows for active property-membership users. Cleanup aborted.';
    end if;

    select count(*)
    into v_non_legacy_home_items_before
    from public.home_items as item_row
    where item_row.user_id <> all(v_legacy_user_ids)
       or item_row.user_id is null;

    select count(*)
    into v_cross_user_file_count
    from public.home_item_files as file_row
    where file_row.home_item_id = any(v_target_item_ids)
      and file_row.user_id is not null
      and file_row.user_id <> all(v_legacy_user_ids);

    if v_cross_user_file_count > 0 then
        raise exception 'Found % non-legacy home_item_files linked to targeted legacy home_items. Cleanup aborted.', v_cross_user_file_count;
    end if;

    select count(*)
    into v_legacy_file_linked_elsewhere_count
    from public.home_item_files as file_row
    where file_row.user_id = any(v_legacy_user_ids)
      and file_row.home_item_id is not null
      and not (file_row.home_item_id = any(v_target_item_ids));

    if v_legacy_file_linked_elsewhere_count > 0 then
        raise exception 'Found % legacy-user file rows linked to non-target home_items. Michael must review before cleanup.', v_legacy_file_linked_elsewhere_count;
    end if;

    select count(*)
    into v_related_file_count_before
    from public.home_item_files as file_row
    where file_row.home_item_id = any(v_target_item_ids)
       or (
           file_row.user_id = any(v_legacy_user_ids)
           and (
               file_row.home_item_id is null
               or file_row.item_slug = any(v_target_item_slugs)
           )
       );

    select count(*)
    into v_related_job_count_before
    from public.jobs as job
    where job.user_id = any(v_legacy_user_ids)
      and job.item_slug = any(v_target_item_slugs);

    select count(*)
    into v_related_thread_count_before
    from public.job_thread_events as event
    join public.jobs as job
      on job.id = event.job_id
    where job.user_id = any(v_legacy_user_ids)
      and job.item_slug = any(v_target_item_slugs);

    delete from public.job_thread_events as event
    using public.jobs as job
    where job.id = event.job_id
      and job.user_id = any(v_legacy_user_ids)
      and job.item_slug = any(v_target_item_slugs);
    get diagnostics v_deleted_thread_count = row_count;

    delete from public.jobs as job
    where job.user_id = any(v_legacy_user_ids)
      and job.item_slug = any(v_target_item_slugs);
    get diagnostics v_deleted_job_count = row_count;

    delete from public.home_item_files as file_row
    where file_row.home_item_id = any(v_target_item_ids)
       or (
           file_row.user_id = any(v_legacy_user_ids)
           and (
               file_row.home_item_id is null
               or file_row.item_slug = any(v_target_item_slugs)
           )
       );
    get diagnostics v_deleted_file_count = row_count;

    delete from public.home_items as item_row
    where item_row.id = any(v_target_item_ids)
      and item_row.user_id = any(v_legacy_user_ids);
    get diagnostics v_deleted_item_count = row_count;

    if v_deleted_item_count <> v_expected_target_count then
        raise exception 'Deleted % home_items, expected %. Cleanup aborted.', v_deleted_item_count, v_expected_target_count;
    end if;

    select count(*)
    into v_related_file_count_after
    from public.home_item_files as file_row
    where file_row.home_item_id = any(v_target_item_ids)
       or (
           file_row.user_id = any(v_legacy_user_ids)
           and (
               file_row.home_item_id is null
               or file_row.item_slug = any(v_target_item_slugs)
           )
       );

    if v_related_file_count_after <> 0 then
        raise exception 'Related home_item_files remain after cleanup: %. Cleanup aborted.', v_related_file_count_after;
    end if;

    select count(*)
    into v_related_job_count_after
    from public.jobs as job
    where job.user_id = any(v_legacy_user_ids)
      and job.item_slug = any(v_target_item_slugs);

    if v_related_job_count_after <> 0 then
        raise exception 'Related jobs remain after cleanup: %. Cleanup aborted.', v_related_job_count_after;
    end if;

    select count(*)
    into v_related_thread_count_after
    from public.job_thread_events as event
    join public.jobs as job
      on job.id = event.job_id
    where job.user_id = any(v_legacy_user_ids)
      and job.item_slug = any(v_target_item_slugs);

    if v_related_thread_count_after <> 0 then
        raise exception 'Related job_thread_events remain after cleanup: %. Cleanup aborted.', v_related_thread_count_after;
    end if;

    if exists (
        select 1
        from public.home_items as item_row
        where item_row.user_id = any(v_legacy_user_ids)
    ) then
        raise exception 'Legacy home_items remain after cleanup. Cleanup aborted.';
    end if;

    select count(*)
    into v_non_legacy_home_items_after
    from public.home_items as item_row
    where item_row.user_id <> all(v_legacy_user_ids)
       or item_row.user_id is null;

    if v_non_legacy_home_items_after <> v_non_legacy_home_items_before then
        raise exception 'Non-legacy home_items count changed from % to %. Cleanup aborted.',
            v_non_legacy_home_items_before,
            v_non_legacy_home_items_after;
    end if;

    raise notice 'Legacy HomeOS cleanup deleted home_items=%, home_item_files=%, jobs=%, job_thread_events=%. Related before counts: files=%, jobs=%, thread_events=%. Non-legacy home_items preserved=%.',
        v_deleted_item_count,
        v_deleted_file_count,
        v_deleted_job_count,
        v_deleted_thread_count,
        v_related_file_count_before,
        v_related_job_count_before,
        v_related_thread_count_before,
        v_non_legacy_home_items_after;
end
$$;

select
    '02_after_cleanup_counts' as section,
    (select count(*) from public.home_items) as total_home_items_after,
    (select count(*) from public.home_items where user_id in (
        '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid,
        'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid
    )) as targeted_legacy_home_items_after,
    (select count(*) from public.home_items where user_id not in (
        '05a8532f-de7c-4a92-bcd0-dcfaf09b0048'::uuid,
        'aadf895f-92f1-40ce-893a-a5676cc9dbdb'::uuid
    ) or user_id is null) as non_legacy_home_items_after;

commit;
