-- Rollback-only regression checks for 20260820130000_homeos_area_location_assignment.sql.

begin;

do $$
declare
    v_state_column_type text;
    v_state_column_nullable text;
    v_state_check text;
    v_trigger_def text;
    v_root_lock_trigger_def text;
    v_delete_trigger_def text;
    v_validator_def text;
    v_root_lock_def text;
    v_delete_guard_def text;
    v_sync_def text;
    v_move_def text;
    v_reset_def text;
    v_reset_config text[];
begin
    select column_row.data_type, column_row.is_nullable
    into v_state_column_type, v_state_column_nullable
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'home_items'
      and column_row.column_name = 'area_placement_state';

    if v_state_column_type is distinct from 'text'
       or v_state_column_nullable is distinct from 'YES' then
        raise exception 'Area placement state must remain an additive nullable text column.';
    end if;

    select pg_get_constraintdef(constraint_row.oid)
    into v_state_check
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.home_items'::regclass
      and constraint_row.conname = 'home_items_area_placement_state_check';

    if v_state_check is null
       or v_state_check !~* 'unassigned'
       or v_state_check !~* 'standalone'
       or v_state_check !~* 'inside_area'
       or v_state_check !~* 'category' then
        raise exception 'Area placement state is not restricted to Area-only canonical values.';
    end if;

    select pg_get_triggerdef(trigger_row.oid)
    into v_trigger_def
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.home_items'::regclass
      and trigger_row.tgname = 'home_items_validate_area_location_assignment'
      and not trigger_row.tgisinternal;

    if v_trigger_def is null
       or v_trigger_def !~* 'before insert or update'
       or v_trigger_def !~* 'homeos_validate_area_location_assignment' then
        raise exception 'All Area placement writers must pass through the location validator.';
    end if;

    v_validator_def := pg_get_functiondef('public.homeos_validate_area_location_assignment()'::regprocedure);
    v_root_lock_def := pg_get_functiondef('public.homeos_lock_area_location_root_write()'::regprocedure);
    v_delete_guard_def := pg_get_functiondef('public.homeos_prevent_area_hard_delete()'::regprocedure);
    v_sync_def := pg_get_functiondef('public.sync_complete_room_starter_cards()'::regprocedure);
    v_move_def := pg_get_functiondef('public.move_homeowner_property_area(uuid,text,uuid)'::regprocedure);
    v_reset_def := pg_get_functiondef('public.reset_active_home_for_testing(text)'::regprocedure);

    select pg_get_triggerdef(trigger_row.oid)
    into v_root_lock_trigger_def
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.home_items'::regclass
      and trigger_row.tgname = 'home_items_lock_area_location_root_write'
      and not trigger_row.tgisinternal;

    select pg_get_triggerdef(trigger_row.oid)
    into v_delete_trigger_def
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.home_items'::regclass
      and trigger_row.tgname = 'home_items_prevent_area_hard_delete'
      and not trigger_row.tgisinternal;

    select function_row.proconfig
    into v_reset_config
    from pg_proc function_row
    where function_row.oid = to_regprocedure('public.reset_active_home_for_testing(text)');

    if v_validator_def !~* 'laundry room'
       or v_validator_def !~* 'homeos_area_location_write'
       or v_validator_def !~* 'homeos-canonical-area'
       or v_validator_def !~* 'pg_advisory_xact_lock'
       or v_validator_def !~* 'tg_op[[:space:]]*=[[:space:]]*''insert'''
       or v_validator_def !~* '23505'
       or v_validator_def !~* 'archive assigned child areas'
       or v_validator_def !~* 'archive an area without changing its placement snapshot'
       or v_validator_def !~* 'old.parent_area is distinct from new.parent_area'
       or v_validator_def !~* 'area identity changes require a dedicated atomic workflow'
       or v_validator_def !~* 'active top-level area' then
        raise exception 'The Area validator must default canonical Laundry safely and protect moves and host/child archival.';
    end if;

    if v_sync_def !~* 'homeos_area_location_write'
       or v_sync_def !~* 'provision_complete_room_starter_cards'
       or v_sync_def !~* 'old.name is distinct from new.name' then
        raise exception 'Complete-room synchronization must preserve its established behavior and skip atomic Area moves.';
    end if;

    if v_root_lock_trigger_def is null
       or v_root_lock_trigger_def !~* 'before insert or update'
       or v_root_lock_trigger_def !~* 'homeos_lock_area_location_root_write'
       or v_root_lock_def !~* 'homeos-area-location'
       or v_root_lock_def !~* 'parent_home_item_id'
       or v_root_lock_def !~* 'pg_try_advisory_xact_lock'
       or v_root_lock_def !~* '40001'
       or has_function_privilege('authenticated', 'public.homeos_lock_area_location_root_write()', 'EXECUTE') then
        raise exception 'Direct-root writers must serialize with Area moves through a non-blocking retryable property lock.';
    end if;

    if v_delete_trigger_def is null
       or v_delete_trigger_def !~* 'before delete'
       or v_delete_trigger_def !~* 'homeos_prevent_area_hard_delete'
       or v_delete_guard_def !~* 'homeos_property_teardown'
       or v_delete_guard_def !~* 'archive homeos areas'
       or has_function_privilege('authenticated', 'public.homeos_prevent_area_hard_delete()', 'EXECUTE')
       or coalesce('barbarosa.homeos_property_teardown=allowed' = any(v_reset_config), false)
       or v_reset_def is null
       or v_reset_def !~* 'v_previous_homeos_property_teardown'
       or v_reset_def !~* 'set_config\(''barbarosa.homeos_property_teardown'', ''allowed'', true\)'
       or v_reset_def !~* 'delete from public.home_items where property_id = \$1'
       or v_reset_def !~* 'exception when others' then
        raise exception 'Area hard-delete protection or the reset-local teardown exemption is missing.';
    end if;

    if v_move_def !~* 'security definer'
       or v_move_def !~* 'homeos_has_active_property_membership'
       or v_move_def !~* 'homeos_can_mutate_property_record'
       or v_move_def !~* 'v_state is null'
       or v_move_def !~* 'pg_advisory_xact_lock'
       or v_move_def !~* 'parent_home_item_id is null'
       or v_move_def !~* 'moving_roots'
       or v_move_def !~* 'moving.property_id, moving.user_id'
       or v_move_def !~* 'coalesce\([[:space:]]*moving\.archived,[[:space:]]*false[[:space:]]*\)[[:space:]]*=[[:space:]]*false'
       or v_move_def !~* 'coalesce\([[:space:]]*direct_root\.archived,[[:space:]]*false[[:space:]]*\)[[:space:]]*=[[:space:]]*false'
       or v_move_def !~* 'v_previous_area_location_write'
       or v_move_def !~* 'child areas' then
        raise exception 'Area location moves are missing authorization, locking, direct-root-only scope, or child-Area protection.';
    end if;

    if has_function_privilege('anon', 'public.move_homeowner_property_area(uuid,text,uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.move_homeowner_property_area(uuid,text,uuid)', 'EXECUTE') then
        raise exception 'Area location RPC execution privileges are incorrect.';
    end if;
end;
$$;

do $$
declare
    v_user_id uuid := gen_random_uuid();
    v_foreign_user_id uuid := gen_random_uuid();
    v_property_id uuid;
    v_foreign_property_id uuid;
    v_garage_id uuid;
    v_hallway_id uuid;
    v_kitchen_id uuid;
    v_laundry_id uuid;
    v_replacement_laundry_id uuid;
    v_archived_laundry_alias_id uuid;
    v_child_area_id uuid;
    v_archive_host_id uuid;
    v_archive_child_id uuid;
    v_legacy_area_id uuid;
    v_legacy_root_id uuid;
    v_foreign_legacy_laundry_id uuid;
    v_delete_guard_area_id uuid;
    v_delete_guard_item_id uuid;
    v_foreign_host_id uuid;
    v_root_id uuid;
    v_archived_root_id uuid;
    v_foreign_owned_root_id uuid;
    v_component_id uuid;
    v_file_id uuid;
    v_property_item_count_before bigint;
    v_kitchen_template_count_before bigint;
    v_teardown_user_id uuid := gen_random_uuid();
    v_teardown_property_id uuid;
    v_teardown_host_id uuid;
    v_teardown_child_id uuid;
    v_teardown_root_id uuid;
    v_teardown_component_id uuid;
    v_teardown_file_id uuid;
    v_reset_user_id uuid := gen_random_uuid();
    v_reset_property_id uuid;
    v_reset_area_id uuid;
    v_result record;
    v_email text := 'homeos-area-location-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
    v_foreign_email text := 'homeos-area-location-foreign-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
    v_teardown_email text := 'homeos-area-location-teardown-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
    v_reset_email text := 'homeos-area-location-reset-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
    v_previous_area_location_write text;
    v_rejected boolean;
begin
    insert into auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
        v_user_id, 'authenticated', 'authenticated', v_email, '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"HOMEOWNER","full_name":"Area Location Regression"}'::jsonb,
        now(), now()
    );

    insert into auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
        v_foreign_user_id, 'authenticated', 'authenticated', v_foreign_email, '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"HOMEOWNER","full_name":"Foreign Area Location Regression"}'::jsonb,
        now(), now()
    );

    insert into auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
        v_teardown_user_id, 'authenticated', 'authenticated', v_teardown_email, '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"HOMEOWNER","full_name":"Area Teardown Regression"}'::jsonb,
        now(), now()
    );

    insert into auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
        v_reset_user_id, 'authenticated', 'authenticated', v_reset_email, '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"HOMEOWNER","full_name":"Area Reset Regression"}'::jsonb,
        now(), now()
    );

    perform set_config('request.jwt.claim.sub', v_user_id::text, true);

    select created_property.property_id
    into v_property_id
    from public.create_homeowner_first_property(
        'Area Location Regression Home', '13 Assignment Way', null,
        'Testville', 'CA', '90013', 'US',
        '13 Assignment Way, Testville, CA 90013',
        34.000013, -118.000013,
        'homeos-area-location-' || replace(gen_random_uuid()::text, '-', ''), 'HOUSE'
    ) created_property
    limit 1;

    if v_property_id is null then
        raise exception 'Could not create the isolated Area location regression property.';
    end if;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id, 'garage-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Garage', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_garage_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id, 'hallway-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Hallway', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_hallway_id;

    -- NULL-state legacy Areas still support ordinary edits, but their text
    -- placement must not move independently of their direct root containers.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id, 'legacy-utility-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Legacy Utility Nook', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_legacy_area_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_user_id, v_property_id, 'legacy-utility-root-' || replace(gen_random_uuid()::text, '-', ''),
        'Legacy Utility Fixture', 'Plumbing', 'Equipment', 'Legacy Utility Nook', '',
        'Missing Information', 'Installed', false
    ) returning id into v_legacy_root_id;

    v_rejected := false;
    begin
        update public.home_items
        set parent_area = 'Hallway'
        where id = v_legacy_area_id;
    exception when others then
        v_rejected := sqlstate = '42501';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items legacy_area
           where legacy_area.id = v_legacy_area_id
             and legacy_area.area_placement_state is null
             and nullif(btrim(coalesce(legacy_area.parent_area, '')), '') is null
       )
       or not exists (
           select 1 from public.home_items legacy_root
           where legacy_root.id = v_legacy_root_id
             and nullif(btrim(coalesce(legacy_root.parent_area, '')), '') is null
    ) then
        raise exception 'A NULL-state legacy Area parent must not change outside the atomic move path.';
    end if;

    v_rejected := false;
    begin
        update public.home_items
        set category = 'Equipment'
        where id = v_legacy_area_id;
    exception when others then
        v_rejected := sqlstate = '42501';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items legacy_area
           where legacy_area.id = v_legacy_area_id
             and lower(btrim(coalesce(legacy_area.category, ''))) = 'area'
       ) then
        raise exception 'An Area must not bypass Area guards by changing category directly.';
    end if;

    v_rejected := false;
    begin
        update public.home_items
        set name = 'Legacy Utility Annex'
        where id = v_legacy_area_id;
    exception when others then
        v_rejected := sqlstate = '42501';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items legacy_area
           where legacy_area.id = v_legacy_area_id
             and legacy_area.name = 'Legacy Utility Nook'
       )
       or not exists (
           select 1 from public.home_items legacy_root
           where legacy_root.id = v_legacy_root_id
             and legacy_root.location = 'Legacy Utility Nook'
       ) then
        raise exception 'An Area name identity must not change without an atomic root-preserving workflow.';
    end if;

    -- A non-placement write that names the same parent snapshot remains valid.
    update public.home_items
    set parent_area = parent_area
    where id = v_legacy_area_id;

    v_rejected := false;
    begin
        update public.home_items
        set archived = true,
            parent_area = 'Hallway'
        where id = v_legacy_area_id;
    exception when others then
        v_rejected := sqlstate = '42501';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items legacy_area
           where legacy_area.id = v_legacy_area_id
             and coalesce(legacy_area.archived, false) = false
             and nullif(btrim(coalesce(legacy_area.parent_area, '')), '') is null
       )
       or not exists (
           select 1 from public.home_items legacy_root
           where legacy_root.id = v_legacy_root_id
             and nullif(btrim(coalesce(legacy_root.parent_area, '')), '') is null
       ) then
        raise exception 'Archiving an Area must not rewrite its placement snapshot.';
    end if;

    -- An active host cannot be archived while an explicitly assigned child
    -- still points to it. Once the child is archived, both lifecycle changes
    -- remain ordinary writes and no Area history is duplicated.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope,
        area_placement_state
    ) values (
        v_user_id, v_property_id, 'archive-host-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Archive Host', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior',
        'standalone'
    ) returning id into v_archive_host_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope,
        area_placement_state
    ) values (
        v_user_id, v_property_id, 'archive-child-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Archive Child', 'Structural', 'Area', '', 'Archive Host', 'Missing Information', 'Unknown', false, 'interior',
        'inside_area'
    ) returning id into v_archive_child_id;

    v_rejected := false;
    begin
        update public.home_items set archived = true where id = v_archive_host_id;
    exception when others then
        v_rejected := sqlstate = '23514';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items host
           where host.id = v_archive_host_id
             and coalesce(host.archived, false) = false
       )
       or not exists (
           select 1 from public.home_items child_area
           where child_area.id = v_archive_child_id
             and coalesce(child_area.archived, false) = false
       ) then
        raise exception 'An active host Area must reject archival while an assigned child Area remains active.';
    end if;

    update public.home_items set archived = true where id = v_archive_child_id;
    if not exists (
        select 1 from public.home_items child_area
        where child_area.id = v_archive_child_id
          and coalesce(child_area.archived, false)
    ) then
        raise exception 'An assigned child Area must remain archivable.';
    end if;

    update public.home_items set archived = true where id = v_archive_host_id;
    if not exists (
        select 1 from public.home_items host
        where host.id = v_archive_host_id
          and coalesce(host.archived, false)
    ) then
        raise exception 'A host Area must become archivable after its assigned children are archived.';
    end if;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id, 'laundry-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Laundry', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_laundry_id;

    if not exists (
        select 1 from public.home_items area
        where area.id = v_laundry_id
          and area.area_placement_state = 'unassigned'
          and nullif(btrim(coalesce(area.parent_area, '')), '') is null
    ) then
        raise exception 'A newly inserted top-level Laundry Area must begin unassigned.';
    end if;

    v_rejected := false;
    begin
        perform * from public.move_homeowner_property_area(v_laundry_id, null, null);
    exception when others then
        v_rejected := sqlstate = '22023';
    end;
    if not v_rejected then
        raise exception 'A NULL Area placement state must be rejected explicitly.';
    end if;

    v_rejected := false;
    begin
        perform * from public.move_homeowner_property_area(v_laundry_id, '   ', null);
    exception when others then
        v_rejected := sqlstate = '22023';
    end;
    if not v_rejected then
        raise exception 'A blank Area placement state must be rejected explicitly.';
    end if;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id, 'archived-laundry-alias-' || replace(gen_random_uuid()::text, '-', ''),
        'Laundry Room', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', true, 'interior'
    ) returning id into v_archived_laundry_alias_id;

    v_rejected := false;
    begin
        update public.home_items
        set archived = false
        where id = v_archived_laundry_alias_id;
    exception when others then
        v_rejected := sqlstate = '23505';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items archived_alias
           where archived_alias.id = v_archived_laundry_alias_id
             and coalesce(archived_alias.archived, false)
       ) then
        raise exception 'Reactivating an archived Laundry alias must not create a second active canonical Laundry.';
    end if;

    v_rejected := false;
    begin
        update public.home_items
        set name = 'Laundry Room'
        where id = v_legacy_area_id;
    exception when others then
        v_rejected := sqlstate = '23505';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items legacy_area
           where legacy_area.id = v_legacy_area_id
             and legacy_area.name = 'Legacy Utility Nook'
       ) then
        raise exception 'Renaming a legacy Area into the active Laundry alias family must be rejected.';
    end if;

    -- Moving a recognized nested complete room must not auto-provision a deck
    -- simply because it becomes top-level during the location RPC.
    if public.homeos_complete_room_kind('Kitchen') is null then
        raise exception 'Kitchen must remain a recognized complete-room kind for this regression.';
    end if;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope,
        area_placement_state
    ) values (
        v_user_id, v_property_id, 'nested-kitchen-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Kitchen', 'Structural', 'Area', '', 'Hallway', 'Missing Information', 'Unknown', false, 'interior',
        'inside_area'
    ) returning id into v_kitchen_id;

    select count(*) into v_property_item_count_before
    from public.home_items item
    where item.property_id = v_property_id;

    select count(*) into v_kitchen_template_count_before
    from public.home_items item
    where item.property_id = v_property_id
      and item.starter_template_key is not null
      and (
          public.homeos_starter_identity(item.location) = 'kitchen'
          or public.homeos_starter_identity(item.parent_area) = 'kitchen'
      );

    perform * from public.move_homeowner_property_area(v_kitchen_id, 'standalone', null);

    if (select count(*) from public.home_items item where item.property_id = v_property_id)
           is distinct from v_property_item_count_before
       or (
           select count(*)
           from public.home_items item
           where item.property_id = v_property_id
             and item.starter_template_key is not null
             and (
                 public.homeos_starter_identity(item.location) = 'kitchen'
                 or public.homeos_starter_identity(item.parent_area) = 'kitchen'
             )
       ) is distinct from v_kitchen_template_count_before
       or not exists (
           select 1 from public.home_items kitchen
           where kitchen.id = v_kitchen_id
             and kitchen.area_placement_state = 'standalone'
             and nullif(btrim(coalesce(kitchen.parent_area, '')), '') is null
       ) then
        raise exception 'Moving nested Kitchen standalone must not provision or duplicate complete-room cards.';
    end if;

    -- The internal write flag must be restored before control returns to the
    -- caller, even when another write happens in the same transaction.
    v_rejected := false;
    begin
        update public.home_items
        set parent_area = 'Hallway'
        where id = v_kitchen_id;
    exception when others then
        v_rejected := sqlstate = '42501';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items kitchen
           where kitchen.id = v_kitchen_id
             and kitchen.area_placement_state = 'standalone'
             and nullif(btrim(coalesce(kitchen.parent_area, '')), '') is null
       ) then
        raise exception 'The Area location RPC must restore its internal write flag before returning.';
    end if;

    v_rejected := false;
    begin
        update public.home_items
        set area_placement_state = 'standalone'
        where id = v_laundry_id;
    exception when others then
        v_rejected := sqlstate = '42501';
    end;
    if not v_rejected then
        raise exception 'Direct explicit Area placement updates must be rejected outside the atomic RPC.';
    end if;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_user_id, v_property_id, 'laundry-washer-' || replace(gen_random_uuid()::text, '-', ''),
        'Washer', 'Plumbing', 'Equipment', 'Laundry', '', 'Missing Information', 'Installed', false
    ) returning id into v_root_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_user_id, v_property_id, 'laundry-archived-washer-' || replace(gen_random_uuid()::text, '-', ''),
        'Archived Washer', 'Plumbing', 'Equipment', 'Laundry', '', 'Replaced', 'Installed', true
    ) returning id into v_archived_root_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, parent_home_item_id
    ) values (
        v_user_id, v_property_id, 'laundry-washer-supply-' || replace(gen_random_uuid()::text, '-', ''),
        'Washer Supply Lines', 'Plumbing', 'Component', 'ignored', '', 'Missing Information', 'Installed', false, v_root_id
    ) returning id into v_component_id;

    insert into public.home_item_files (
        user_id, property_id, home_item_id, item_slug, file_url, file_name, file_type, category
    ) values (
        v_user_id, v_property_id, v_root_id,
        (select item_slug from public.home_items where id = v_root_id),
        'https://example.invalid/homeos-area-location-regression.jpg',
        'area-location-regression.jpg', 'photo', 'other'
    ) returning id into v_file_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id, 'delete-guard-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Delete Guard Area', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_delete_guard_area_id;

    v_rejected := false;
    begin
        delete from public.home_items where id = v_delete_guard_area_id;
    exception when others then
        v_rejected := sqlstate = '23514';
    end;
    if not v_rejected
       or not exists (select 1 from public.home_items area where area.id = v_delete_guard_area_id) then
        raise exception 'A normal hard delete must not remove an active Area.';
    end if;

    update public.home_items set archived = true where id = v_delete_guard_area_id;
    v_rejected := false;
    begin
        delete from public.home_items where id = v_delete_guard_area_id;
    exception when others then
        v_rejected := sqlstate = '23514';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items area
           where area.id = v_delete_guard_area_id
             and coalesce(area.archived, false)
       ) then
        raise exception 'Archived Area history must remain protected from a normal hard delete.';
    end if;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_user_id, v_property_id, 'delete-guard-item-' || replace(gen_random_uuid()::text, '-', ''),
        'Disposable Non-Area', 'Plumbing', 'Equipment', 'Delete Guard Area', '',
        'Missing Information', 'Unknown', false
    ) returning id into v_delete_guard_item_id;

    v_rejected := false;
    begin
        update public.home_items
        set category = 'Area'
        where id = v_delete_guard_item_id;
    exception when others then
        v_rejected := sqlstate = '42501';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items item
           where item.id = v_delete_guard_item_id
             and lower(btrim(coalesce(item.category, ''))) = 'equipment'
       ) then
        raise exception 'A non-Area must not become an Area outside a dedicated atomic workflow.';
    end if;

    delete from public.home_items where id = v_delete_guard_item_id;
    if exists (select 1 from public.home_items item where item.id = v_delete_guard_item_id) then
        raise exception 'The Area hard-delete guard must not block an isolated non-Area delete.';
    end if;

    v_rejected := false;
    begin
        delete from public.home_items where id = v_laundry_id;
    exception when others then
        v_rejected := sqlstate = '23514';
    end;
    if not v_rejected
       or not exists (select 1 from public.home_items area where area.id = v_laundry_id)
       or not exists (select 1 from public.home_items root where root.id = v_root_id)
       or not exists (select 1 from public.home_items component where component.id = v_component_id)
       or not exists (select 1 from public.home_item_files file where file.id = v_file_id) then
        raise exception 'Canonical Laundry and its container, component, and file history must survive a hard-delete attempt.';
    end if;

    select * into v_result
    from public.move_homeowner_property_area(v_laundry_id, 'inside_area', v_garage_id);

    if v_result.area_id is distinct from v_laundry_id
       or v_result.area_name is distinct from 'Laundry'
       or v_result.parent_area is distinct from 'Garage'
       or v_result.area_placement_state is distinct from 'inside_area'
       or v_result.host_area_id is distinct from v_garage_id then
        raise exception 'Assigning Laundry to Garage did not return the canonical placement result.';
    end if;

    if not exists (
        select 1 from public.home_items area
        where area.id = v_laundry_id
          and area.parent_area = 'Garage'
          and area.area_placement_state = 'inside_area'
    ) or not exists (
        select 1 from public.home_items root
        where root.id = v_root_id
          and root.location = 'Laundry'
          and root.parent_area = 'Garage'
          and root.parent_home_item_id is null
    ) or not exists (
        select 1 from public.home_items archived_root
        where archived_root.id = v_archived_root_id
          and nullif(btrim(coalesce(archived_root.parent_area, '')), '') is null
          and coalesce(archived_root.archived, false)
    ) or not exists (
        select 1 from public.home_items component
        where component.id = v_component_id
          and component.parent_home_item_id = v_root_id
    ) or not exists (
        select 1 from public.home_item_files file
        where file.id = v_file_id
          and file.home_item_id = v_root_id
          and file.property_id = v_property_id
    ) or (select count(*) from public.home_items area where area.id = v_laundry_id) <> 1 then
        raise exception 'Area assignment copied or lost canonical Area, direct container, component, or file history.';
    end if;

    select * into v_result
    from public.move_homeowner_property_area(v_laundry_id, 'inside_area', v_hallway_id);

    if v_result.parent_area is distinct from 'Hallway'
       or not exists (
           select 1 from public.home_items root
           where root.id = v_root_id and root.parent_area = 'Hallway'
       ) then
        raise exception 'Reassigning Laundry did not move the same canonical Area and direct roots.';
    end if;

    select * into v_result
    from public.move_homeowner_property_area(v_laundry_id, 'unassigned', null);

    if v_result.parent_area is not null
       or v_result.area_placement_state is distinct from 'unassigned'
       or not exists (
           select 1 from public.home_items root
           where root.id = v_root_id and nullif(btrim(coalesce(root.parent_area, '')), '') is null
       ) then
        raise exception 'Unassigning Laundry did not retain the canonical Area and root containers.';
    end if;

    select * into v_result
    from public.move_homeowner_property_area(v_laundry_id, 'standalone', null);

    if v_result.parent_area is not null
       or v_result.area_placement_state is distinct from 'standalone' then
        raise exception 'Standalone Laundry placement was not persisted.';
    end if;

    v_rejected := false;
    begin
        insert into public.home_items (
            user_id, property_id, item_slug, name, system, category,
            location, parent_area, status, install_state, archived, area_scope
        ) values (
            v_user_id, v_property_id, 'second-laundry-area-' || replace(gen_random_uuid()::text, '-', ''),
            'Laundry Room', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior'
        );
    exception when others then
        v_rejected := sqlstate = '23505';
    end;
    if not v_rejected then
        raise exception 'One assigned or standalone Laundry must block a second Laundry/Laundry Room Area in every placement.';
    end if;

    insert into public.property_memberships (property_id, user_id, role, status)
    values (v_property_id, v_foreign_user_id, 'HOMEOWNER', 'active')
    on conflict (property_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        updated_at = now();

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_foreign_user_id, v_property_id,
        'foreign-owned-laundry-root-' || replace(gen_random_uuid()::text, '-', ''),
        'Foreign-Owned Laundry Root', 'Plumbing', 'Equipment', 'Laundry', '', 'Missing Information', 'Installed', false
    ) returning id into v_foreign_owned_root_id;

    v_rejected := false;
    begin
        perform * from public.move_homeowner_property_area(v_laundry_id, 'inside_area', v_hallway_id);
    exception when others then
        v_rejected := sqlstate = '42501';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items root
           where root.id = v_foreign_owned_root_id
             and nullif(btrim(coalesce(root.parent_area, '')), '') is null
       )
       or not exists (
           select 1 from public.home_items area
           where area.id = v_laundry_id
             and area.area_placement_state = 'standalone'
             and nullif(btrim(coalesce(area.parent_area, '')), '') is null
       ) then
        raise exception 'A foreign-owned active direct root must abort the entire Area move without mutation.';
    end if;

    perform set_config('request.jwt.claim.sub', v_foreign_user_id::text, true);
    update public.home_items set archived = true where id = v_foreign_owned_root_id;
    perform set_config('request.jwt.claim.sub', v_user_id::text, true);

    v_rejected := false;
    begin
        perform * from public.move_homeowner_property_area(v_laundry_id, 'inside_area', v_laundry_id);
    exception when others then
        v_rejected := sqlstate = '23514';
    end;
    if not v_rejected then
        raise exception 'An Area must not be assignable inside itself.';
    end if;

    -- A nested child makes the parent unsafe to relocate in this one-level
    -- route model. The child is legacy/null-state by design.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id, 'laundry-child-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Laundry Closet', 'Structural', 'Area', '', 'Laundry', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_child_area_id;

    v_rejected := false;
    begin
        perform * from public.move_homeowner_property_area(v_laundry_id, 'inside_area', v_garage_id);
    exception when others then
        v_rejected := sqlstate = '23514';
    end;
    if not v_rejected then
        raise exception 'An Area with active child Areas must not relocate in the first-phase route model.';
    end if;

    update public.home_items set archived = true where id = v_child_area_id;
    update public.home_items set archived = true where id = v_garage_id;

    v_rejected := false;
    begin
        perform * from public.move_homeowner_property_area(v_laundry_id, 'inside_area', v_garage_id);
    exception when others then
        v_rejected := sqlstate = '23514';
    end;
    if not v_rejected then
        raise exception 'Archived host Areas must be rejected.';
    end if;

    perform set_config('request.jwt.claim.sub', v_foreign_user_id::text, true);
    select created_property.property_id
    into v_foreign_property_id
    from public.create_homeowner_first_property(
        'Foreign Area Location Home', '14 Assignment Way', null,
        'Testville', 'CA', '90014', 'US',
        '14 Assignment Way, Testville, CA 90014',
        34.000014, -118.000014,
        'homeos-area-location-foreign-' || replace(gen_random_uuid()::text, '-', ''), 'HOUSE'
    ) created_property
    limit 1;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_foreign_user_id, v_foreign_property_id, 'foreign-host-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Foreign Garage', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_foreign_host_id;

    -- Exercise the migration's unique-only legacy adoption rule in a temporary
    -- table. Production triggers intentionally make this pre-migration state
    -- impossible to manufacture in home_items, and the hosted database does
    -- not permit disabling those triggers for regression setup.
    create temporary table homeos_area_location_legacy_adoption_regression (
        id uuid primary key,
        property_id uuid not null,
        name text,
        category text,
        archived boolean,
        area_placement_state text
    ) on commit drop;

    insert into homeos_area_location_legacy_adoption_regression (
        id, property_id, name, category, archived, area_placement_state
    ) values (
        gen_random_uuid(), v_foreign_property_id, 'Laundry', 'Area', false, null
    ), (
        gen_random_uuid(), v_foreign_property_id, 'Laundry Room', 'Area', false, null
    );

    with active_laundry as (
        select
            area.id,
            count(*) over (partition by area.property_id) as active_laundry_count
        from homeos_area_location_legacy_adoption_regression area
        where lower(btrim(coalesce(area.category, ''))) = 'area'
          and coalesce(area.archived, false) = false
          and public.homeos_starter_identity(area.name) in ('laundry', 'laundry room')
    )
    update homeos_area_location_legacy_adoption_regression area
    set area_placement_state = 'unassigned'
    from active_laundry laundry
    where area.id = laundry.id
      and laundry.active_laundry_count = 1
      and area.area_placement_state is null;

    if exists (
        select 1
        from homeos_area_location_legacy_adoption_regression legacy_laundry
        where legacy_laundry.property_id = v_foreign_property_id
          and public.homeos_starter_identity(legacy_laundry.name) in ('laundry', 'laundry room')
          and legacy_laundry.area_placement_state is not null
    ) then
        raise exception 'Ambiguous legacy Laundry aliases must remain NULL and never be auto-adopted.';
    end if;

    -- Resolving one ambiguous legacy alias must leave the surviving NULL-state
    -- record untouched until the homeowner chooses a location.
    update homeos_area_location_legacy_adoption_regression legacy_laundry
    set archived = true
    where legacy_laundry.property_id = v_foreign_property_id
      and public.homeos_starter_identity(legacy_laundry.name) = 'laundry room';

    if not exists (
        select 1
        from homeos_area_location_legacy_adoption_regression surviving_laundry
        where surviving_laundry.property_id = v_foreign_property_id
          and public.homeos_starter_identity(surviving_laundry.name) = 'laundry'
          and coalesce(surviving_laundry.archived, false) = false
          and surviving_laundry.area_placement_state is null
    ) then
        raise exception 'Archiving one ambiguous legacy Laundry alias must leave the surviving NULL-state record unchanged.';
    end if;

    -- Independently exercise the real home_items lifecycle guard. A migration-
    -- era NULL-state Laundry may be archived through an ordinary write without
    -- silently acquiring a state or changing its placement snapshot.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_foreign_user_id, v_foreign_property_id,
        'legacy-laundry-lifecycle-' || replace(gen_random_uuid()::text, '-', ''),
        'Laundry', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_foreign_legacy_laundry_id;

    v_previous_area_location_write := coalesce(
        current_setting('barbarosa.homeos_area_location_write', true),
        ''
    );
    perform set_config('barbarosa.homeos_area_location_write', 'allowed', true);
    update public.home_items
    set area_placement_state = null
    where id = v_foreign_legacy_laundry_id;
    perform set_config(
        'barbarosa.homeos_area_location_write',
        v_previous_area_location_write,
        true
    );

    update public.home_items
    set archived = true
    where id = v_foreign_legacy_laundry_id;

    if not exists (
        select 1
        from public.home_items legacy_laundry
        where legacy_laundry.id = v_foreign_legacy_laundry_id
          and coalesce(legacy_laundry.archived, false)
          and legacy_laundry.area_placement_state is null
          and nullif(btrim(coalesce(legacy_laundry.parent_area, '')), '') is null
    ) then
        raise exception 'Archiving a real legacy NULL-state Laundry must preserve its placement snapshot.';
    end if;

    perform set_config('request.jwt.claim.sub', v_user_id::text, true);
    v_rejected := false;
    begin
        update public.home_items
        set property_id = v_foreign_property_id
        where id = v_legacy_area_id;
    exception when others then
        v_rejected := sqlstate = '42501';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items legacy_area
           where legacy_area.id = v_legacy_area_id
             and legacy_area.property_id = v_property_id
       )
       or not exists (
           select 1 from public.home_items legacy_root
           where legacy_root.id = v_legacy_root_id
             and legacy_root.property_id = v_property_id
       ) then
        raise exception 'An Area property identity must not change outside a dedicated atomic workflow.';
    end if;

    v_rejected := false;
    begin
        perform * from public.move_homeowner_property_area(v_laundry_id, 'inside_area', v_foreign_host_id);
    exception when others then
        v_rejected := sqlstate = '23514';
    end;
    if not v_rejected then
        raise exception 'Cross-property host Areas must be rejected.';
    end if;

    perform set_config('request.jwt.claim.sub', v_foreign_user_id::text, true);
    v_rejected := false;
    begin
        perform * from public.move_homeowner_property_area(v_laundry_id, 'standalone', null);
    exception when others then
        v_rejected := sqlstate = '42501';
    end;
    if not v_rejected then
        raise exception 'A different homeowner must not be able to move this Area.';
    end if;

    -- Archiving the canonical Laundry frees the alias family for one new
    -- canonical record while preserving the archived record and its history.
    perform set_config('request.jwt.claim.sub', v_user_id::text, true);
    update public.home_items set archived = true where id = v_laundry_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id, 'replacement-laundry-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Laundry Room', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_replacement_laundry_id;

    if v_replacement_laundry_id is null
       or v_replacement_laundry_id = v_laundry_id
       or not exists (
           select 1 from public.home_items old_laundry
           where old_laundry.id = v_laundry_id
             and coalesce(old_laundry.archived, false)
       )
       or not exists (
           select 1 from public.home_items replacement_laundry
           where replacement_laundry.id = v_replacement_laundry_id
             and coalesce(replacement_laundry.archived, false) = false
             and replacement_laundry.area_placement_state = 'unassigned'
       )
       or (
           select count(*)
           from public.home_items active_laundry
           where active_laundry.property_id = v_property_id
             and lower(btrim(coalesce(active_laundry.category, ''))) = 'area'
             and coalesce(active_laundry.archived, false) = false
             and public.homeos_starter_identity(active_laundry.name) in ('laundry', 'laundry room')
       ) <> 1 then
        raise exception 'Archiving canonical Laundry must permit exactly one replacement canonical Laundry Area.';
    end if;

    -- A true property teardown still cascades through Areas, nested Areas,
    -- containers, UUID components, and files because the parent property row
    -- is already absent when the HomeOS delete trigger runs.
    perform set_config('request.jwt.claim.sub', v_teardown_user_id::text, true);
    select created_property.property_id
    into v_teardown_property_id
    from public.create_homeowner_first_property(
        'Area Teardown Regression Home', '15 Assignment Way', null,
        'Testville', 'CA', '90015', 'US',
        '15 Assignment Way, Testville, CA 90015',
        34.000015, -118.000015,
        'homeos-area-teardown-' || replace(gen_random_uuid()::text, '-', ''), 'HOUSE'
    ) created_property
    limit 1;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope,
        area_placement_state
    ) values (
        v_teardown_user_id, v_teardown_property_id,
        'teardown-host-' || replace(gen_random_uuid()::text, '-', ''),
        'Teardown Host', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior',
        'standalone'
    ) returning id into v_teardown_host_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope,
        area_placement_state
    ) values (
        v_teardown_user_id, v_teardown_property_id,
        'teardown-child-' || replace(gen_random_uuid()::text, '-', ''),
        'Teardown Child', 'Structural', 'Area', '', 'Teardown Host', 'Missing Information', 'Unknown', false, 'interior',
        'inside_area'
    ) returning id into v_teardown_child_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_teardown_user_id, v_teardown_property_id,
        'teardown-root-' || replace(gen_random_uuid()::text, '-', ''),
        'Teardown Fixture', 'Plumbing', 'Equipment', 'Teardown Child', 'Teardown Host',
        'Missing Information', 'Installed', false
    ) returning id into v_teardown_root_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, parent_home_item_id
    ) values (
        v_teardown_user_id, v_teardown_property_id,
        'teardown-component-' || replace(gen_random_uuid()::text, '-', ''),
        'Teardown Component', 'Plumbing', 'Component', 'ignored', '',
        'Missing Information', 'Installed', false, v_teardown_root_id
    ) returning id into v_teardown_component_id;

    insert into public.home_item_files (
        user_id, property_id, home_item_id, item_slug, file_url, file_name, file_type, category
    ) values (
        v_teardown_user_id, v_teardown_property_id, v_teardown_root_id,
        (select item_slug from public.home_items where id = v_teardown_root_id),
        'https://example.invalid/homeos-area-teardown.jpg',
        'area-teardown.jpg', 'photo', 'other'
    ) returning id into v_teardown_file_id;

    delete from public.properties where id = v_teardown_property_id;

    if exists (select 1 from public.properties where id = v_teardown_property_id)
       or exists (
           select 1 from public.home_items
           where id in (
               v_teardown_host_id,
               v_teardown_child_id,
               v_teardown_root_id,
               v_teardown_component_id
           )
       )
       or exists (select 1 from public.home_item_files where id = v_teardown_file_id) then
        raise exception 'Property teardown must continue cascading through the complete HomeOS Area graph.';
    end if;

    -- The existing test reset deletes HomeOS rows before deleting its property,
    -- so its function-local marker is the only explicit normal-delete bypass.
    -- It must restore a caller's existing setting after the Area is deleted.
    if to_regprocedure('public.reset_active_home_for_testing(text)') is not null then
        perform set_config('request.jwt.claim.sub', v_reset_user_id::text, true);
        select created_property.property_id
        into v_reset_property_id
        from public.create_homeowner_first_property(
            'Area Reset Regression Home', '16 Assignment Way', null,
            'Testville', 'CA', '90016', 'US',
            '16 Assignment Way, Testville, CA 90016',
            34.000016, -118.000016,
            'homeos-area-reset-' || replace(gen_random_uuid()::text, '-', ''), 'HOUSE'
        ) created_property
        limit 1;

        insert into public.home_items (
            user_id, property_id, item_slug, name, system, category,
            location, parent_area, status, install_state, archived, area_scope
        ) values (
            v_reset_user_id, v_reset_property_id,
            'reset-area-' || replace(gen_random_uuid()::text, '-', ''),
            'Reset Area', 'Structural', 'Area', '', '', 'Missing Information', 'Unknown', false, 'interior'
        ) returning id into v_reset_area_id;

        perform set_config('barbarosa.homeos_property_teardown', 'before-reset', true);
        select * into v_result
        from public.reset_active_home_for_testing('RESET');

        if v_result.property_id is distinct from v_reset_property_id
           or v_result.reset_status is distinct from 'deleted'
           or exists (select 1 from public.properties where id = v_reset_property_id)
           or exists (select 1 from public.home_items where id = v_reset_area_id)
           or current_setting('barbarosa.homeos_property_teardown', true) is distinct from 'before-reset' then
            raise exception 'The existing reset workflow must remove its property and restore the Area-delete bypass.';
        end if;

        perform set_config('barbarosa.homeos_property_teardown', '', true);
    end if;

    perform set_config('request.jwt.claim.sub', v_user_id::text, true);
    v_rejected := false;
    begin
        delete from public.home_items where id = v_replacement_laundry_id;
    exception when others then
        v_rejected := sqlstate = '23514';
    end;
    if not v_rejected
       or not exists (
           select 1 from public.home_items replacement_laundry
           where replacement_laundry.id = v_replacement_laundry_id
             and coalesce(replacement_laundry.archived, false) = false
       ) then
        raise exception 'The reset teardown bypass must not leak into later normal Area writes.';
    end if;
end;
$$;

select 'homeos_area_location_assignment_ok' as result;

rollback;
