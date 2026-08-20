-- Rollback-only regression checks for 20260820110000_homeos_instance_parentage.sql.

begin;

create temporary table homeos_instance_parentage_runtime_ids (
    fixture_key text primary key,
    item_id uuid not null
);

do $$
declare
    v_parent_column_type text;
    v_parent_column_nullable text;
    v_label_column_type text;
    v_label_column_nullable text;
    v_label_check text;
    v_parent_fk_delete_action "char";
    v_parent_fk_validated boolean;
    v_parent_index text;
    v_parent_trigger_def text;
    v_lifecycle_trigger_def text;
    v_replacement_trigger_def text;
    v_starter_parent_trigger_def text;
    v_parent_validator text;
    v_lifecycle_validator text;
    v_replacement_function text;
    v_starter_parent_function text;
    v_starter_parent_trigger_function text;
    v_archive_function text;
    v_overlay_identity_function text;
    v_overlay_root_function text;
    v_overlay_parent_function text;
    v_provisioner text;
    v_provider_reader_result text;
    v_sales_reader_result text;
    v_provider_create_def text;
    v_provider_deck_def text;
    v_sales_create_def text;
    v_sales_deck_def text;
begin
    select column_row.data_type, column_row.is_nullable
    into v_parent_column_type, v_parent_column_nullable
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'home_items'
      and column_row.column_name = 'parent_home_item_id';

    select column_row.data_type, column_row.is_nullable
    into v_label_column_type, v_label_column_nullable
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'home_items'
      and column_row.column_name = 'placement_label';

    if v_parent_column_type is distinct from 'uuid'
       or v_parent_column_nullable is distinct from 'YES' then
        raise exception 'HomeOS parent_home_item_id must remain an additive nullable UUID.';
    end if;

    if v_label_column_type is distinct from 'text'
       or v_label_column_nullable is distinct from 'YES' then
        raise exception 'HomeOS placement_label must remain additive nullable presentation text.';
    end if;

    select pg_get_constraintdef(constraint_row.oid)
    into v_label_check
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.home_items'::regclass
      and constraint_row.conname = 'home_items_placement_label_check';

    if v_label_check is null
       or v_label_check !~* 'btrim'
       or v_label_check !~* '120' then
        raise exception 'HomeOS placement labels are not protected by trimmed 120-character validation.';
    end if;

    select constraint_row.confdeltype, constraint_row.convalidated
    into v_parent_fk_delete_action, v_parent_fk_validated
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.home_items'::regclass
      and constraint_row.conname = 'home_items_parent_home_item_id_fkey'
      and constraint_row.contype = 'f';

    if v_parent_fk_delete_action is distinct from 'r'::"char"
       or v_parent_fk_validated is distinct from true then
        raise exception 'HomeOS assembly deletion must restrict while component rows remain linked.';
    end if;

    select pg_get_indexdef(index_class.oid)
    into v_parent_index
    from pg_class index_class
    where index_class.oid = to_regclass('public.home_items_parent_home_item_id_idx');

    if v_parent_index is null or v_parent_index !~* 'parent_home_item_id' then
        raise exception 'HomeOS component lookup is missing its parent instance index.';
    end if;

    select pg_get_triggerdef(trigger_row.oid)
    into v_parent_trigger_def
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.home_items'::regclass
      and trigger_row.tgname = 'home_items_validate_item_parentage'
      and not trigger_row.tgisinternal;

    select pg_get_triggerdef(trigger_row.oid)
    into v_lifecycle_trigger_def
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.home_items'::regclass
      and trigger_row.tgname = 'home_items_validate_item_parent_lifecycle'
      and not trigger_row.tgisinternal;

    select pg_get_triggerdef(trigger_row.oid)
    into v_replacement_trigger_def
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.home_items'::regclass
      and trigger_row.tgname = 'home_items_preserve_replacement_parentage'
      and not trigger_row.tgisinternal;

    select pg_get_triggerdef(trigger_row.oid)
    into v_starter_parent_trigger_def
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.home_items'::regclass
      and trigger_row.tgname = 'home_items_resolve_starter_parentage_after_write'
      and not trigger_row.tgisinternal;

    if v_parent_trigger_def is null
       or v_parent_trigger_def !~* 'before insert or update' then
        raise exception 'All HomeOS writers must pass through the instance-parent validator.';
    end if;

    if v_lifecycle_trigger_def is null
       or v_lifecycle_trigger_def !~* 'constraint trigger'
       or v_lifecycle_trigger_def !~* 'deferrable initially deferred' then
        raise exception 'HomeOS archive consistency must be checked at transaction end.';
    end if;

    if exists (
        select 1
        from pg_trigger trigger_row
        where trigger_row.tgrelid = 'public.home_items'::regclass
          and trigger_row.tgname = 'home_items_sync_child_placement_from_parent'
          and not trigger_row.tgisinternal
    ) then
        raise exception 'Parent rename/move must not synchronously rewrite child rows and invert row/advisory locks.';
    end if;

    if v_replacement_trigger_def is null
       or v_replacement_trigger_def !~* 'after insert' then
        raise exception 'HomeOS replacements must preserve instance parentage.';
    end if;

    if v_starter_parent_trigger_def is null
       or v_starter_parent_trigger_def !~* 'constraint trigger'
       or v_starter_parent_trigger_def !~* 'after insert or update'
       or v_starter_parent_trigger_def !~* 'deferrable initially deferred' then
        raise exception 'Future HomeOS writers are missing deferred instance-parent reconciliation.';
    end if;

    v_parent_validator := pg_get_functiondef('public.homeos_validate_item_parentage()'::regprocedure);
    v_lifecycle_validator := pg_get_functiondef('public.homeos_validate_item_parent_lifecycle()'::regprocedure);
    v_replacement_function := pg_get_functiondef('public.homeos_preserve_replacement_parentage()'::regprocedure);
    v_archive_function := pg_get_functiondef('public.archive_home_item_with_components(uuid)'::regprocedure);
    v_overlay_identity_function := pg_get_functiondef('public.homeos_overlay_root_identity(text,text,text)'::regprocedure);
    v_overlay_root_function := pg_get_functiondef('public.homeos_resolve_overlay_root_for_placement(uuid,text,text,text)'::regprocedure);
    v_overlay_parent_function := pg_get_functiondef('public.homeos_resolve_unambiguous_overlay_parent(uuid)'::regprocedure);
    v_starter_parent_function := pg_get_functiondef('public.homeos_resolve_unambiguous_starter_parent(uuid)'::regprocedure);
    v_starter_parent_trigger_function := pg_get_functiondef('public.homeos_resolve_starter_parentage_after_write()'::regprocedure);

    if v_parent_validator !~* 'home-item-parentage'
       or v_parent_validator !~* 'v_parent.property_id is distinct from new.property_id'
       or v_parent_validator !~* 'v_parent.parent_home_item_id is not null'
       or v_parent_validator !~* 'v_parent.category'
       or v_parent_validator !~* 'new.id = new.parent_home_item_id'
       or v_parent_validator !~* 'new.location :='
       or v_parent_validator !~* 'new.parent_area :=' then
        raise exception 'HomeOS parent validation is missing property, depth, cycle, Area, or legacy-projection protection.';
    end if;

    if v_parent_validator ~* 'for[[:space:]]+(key[[:space:]]+share|update|no[[:space:]]+key[[:space:]]+update)'
       or v_parent_validator ~* 'update[[:space:]]+public.home_items[[:space:]]+child' then
        raise exception 'Parent validation must not wait on a parent row or synchronously rewrite child rows while holding the property advisory lock.';
    end if;

    if v_lifecycle_validator !~* 'active component cannot belong to an archived assembly'
       or v_lifecycle_validator !~* 'archive or reassign active component cards'
       or v_lifecycle_validator !~* 'v_parent.parent_home_item_id is not null'
       or v_lifecycle_validator !~* 'v_item.property_id is distinct from v_parent.property_id' then
        raise exception 'HomeOS archive lifecycle protection is incomplete.';
    end if;

    if v_replacement_function !~* 'v_old_item.parent_home_item_id'
       or v_replacement_function !~* 'v_old_item.placement_label'
       or v_replacement_function !~* 'v_old_item.starter_template_key'
       or v_replacement_function !~* 'set parent_home_item_id = new.id' then
        raise exception 'Replacement writes do not preserve starter type, labels, and both sides of instance parentage.';
    end if;

    if v_archive_function !~* 'homeos_can_mutate_property_record'
       or v_archive_function !~* 'for update'
       or v_archive_function !~* 'set archived = true'
       or v_archive_function !~* 'homeos_parentage_system_write'
       or v_archive_function !~* 'homeos_resolve_unambiguous_starter_parent'
       or v_archive_function !~* 'homeos_can_mutate_property_record\(child.property_id, child.user_id\)'
       or v_archive_function ~* 'pg_advisory_xact_lock' then
        raise exception 'The explicit archive RPC must authorize every row, lock deterministically, and archive the assembly/component set atomically.';
    end if;

    if v_overlay_identity_function !~* 'kitchen:kitchen_faucet'
       or v_overlay_identity_function !~* 'kitchen:garbage_disposal'
       or v_overlay_identity_function !~* 'bathroom:bathroom_sink'
       or v_overlay_identity_function !~* 'bathroom:bathroom_sink_faucet'
       or v_overlay_identity_function !~* 'kitchen:refrigerator_water_line'
       or v_overlay_root_function !~* 'v_candidate_count = 1'
       or v_overlay_root_function !~* 'starter_template_key is null'
       or v_overlay_parent_function !~* 'v_candidate_count <> 1' then
        raise exception 'Approved legacy overlays are not conservatively flattened to one unambiguous root assembly.';
    end if;

    if v_starter_parent_function !~* 'homeos_resolve_unambiguous_overlay_parent'
       or v_starter_parent_function !~* 'child_template.parent_template_key'
       or v_starter_parent_function !~* 'v_candidate_count <> 1'
       or v_starter_parent_function !~* 'lower\(btrim\(coalesce\(area.category'
       or v_starter_parent_trigger_function !~* 'pg_try_advisory_xact_lock'
       or v_starter_parent_trigger_function !~* 'homeos_resolve_unambiguous_starter_parent'
       or v_starter_parent_trigger_function !~* 'homeos_parentage_system_write'
       or v_starter_parent_trigger_function !~* 'home_items_property_placement_identity_key'
       or v_starter_parent_trigger_function !~* 'home_items_property_placement_slug_key'
       or v_starter_parent_trigger_function ~* 'for[[:space:]]+(key[[:space:]]+share|update|no[[:space:]]+key[[:space:]]+update)'
       or v_starter_parent_trigger_function ~* '(^|[^_])pg_advisory_xact_lock' then
        raise exception 'Deferred starter parentage must resolve all writers conservatively without blocking row/advisory lock inversion.';
    end if;

    if public.homeos_overlay_root_identity('kitchen:garbage_disposal', 'Garbage Disposal', 'kitchen')
           is distinct from 'template:kitchen:kitchen_sink'
       or public.homeos_overlay_root_identity('bathroom:bathroom_sink', 'Bathroom Sink', 'bathroom')
           is distinct from 'template:bathroom:bathroom_vanity'
       or public.homeos_overlay_root_identity('kitchen:refrigerator_water_line', 'Refrigerator Water Line', 'kitchen')
           is distinct from 'name:refrigerator' then
        raise exception 'Direct approved overlays do not resolve to the Kitchen Sink, Vanity, and Refrigerator roots.';
    end if;

    if public.homeos_overlay_root_identity('kitchen:disposal_flange', 'Disposal Flange', 'kitchen') is not null
       or public.homeos_overlay_root_identity('bathroom:bathroom_sink_p_trap', 'Bathroom Sink P-Trap', 'bathroom') is not null
       or public.homeos_overlay_root_identity('kitchen:refrigerator_water_filter', 'Refrigerator Water Filter', 'kitchen') is not null then
        raise exception 'Overlay descendants must require their saved intermediary cards instead of being inferred from catalog ancestry alone.';
    end if;

    if exists (
        select 1
        from public.home_items child
        join public.home_items parent on parent.id = child.parent_home_item_id
        where child.property_id is distinct from parent.property_id
           or lower(btrim(coalesce(child.category, ''))) = 'area'
           or lower(btrim(coalesce(parent.category, ''))) = 'area'
           or parent.parent_home_item_id is not null
           or child.id = parent.id
           or (
               coalesce(child.archived, false) = false
               and coalesce(parent.archived, false)
           )
    ) then
        raise exception 'Existing HomeOS instance links violate property, depth, Area, cycle, projection, or archive integrity.';
    end if;

    v_provisioner := pg_get_functiondef('public.provision_complete_room_starter_cards(uuid)'::regprocedure);
    if v_provisioner !~* 'v_parent_id'
       or v_provisioner !~* 'parent_home_item_id'
       or v_provisioner !~* 'homeos_overlay_root_identity'
       or v_provisioner !~* 'homeos_resolve_overlay_root_for_placement'
       or v_provisioner !~* 'v_parent_candidate_count <> 1' then
        raise exception 'Room starter provisioning does not persist concrete assembly instances safely.';
    end if;

    if exists (
        with starter_proposals as (
            select
                child.id as child_id,
                child.property_id,
                lower(child.item_slug) as proposed_slug,
                public.homeos_item_placement_identity(
                    child.system,
                    child.category,
                    child.name,
                    parent.name,
                    parent.location
                ) as proposed_identity,
                public.homeos_starter_identity(parent.name) as proposed_location,
                public.homeos_starter_identity(parent.location) as proposed_parent_area
            from public.home_items child
            join public.home_items parent
              on parent.id = public.homeos_resolve_unambiguous_starter_parent(child.id)
            where child.parent_home_item_id is null
              and coalesce(child.archived, false) = false
        )
        select 1
        from starter_proposals proposal
        join public.home_items child on child.id = proposal.child_id
        where (
            select count(*)
            from starter_proposals peer
            where peer.property_id = proposal.property_id
              and peer.proposed_identity = proposal.proposed_identity
        ) = 1
          and (
              proposal.proposed_slug is null
              or (
                  select count(*)
                  from starter_proposals peer
                  where peer.property_id = proposal.property_id
                    and peer.proposed_slug = proposal.proposed_slug
                    and peer.proposed_location = proposal.proposed_location
                    and peer.proposed_parent_area = proposal.proposed_parent_area
              ) = 1
          )
          and not exists (
              select 1
              from public.home_items conflict_item
              where conflict_item.property_id = proposal.property_id
                and conflict_item.id <> proposal.child_id
                and coalesce(conflict_item.archived, false) = false
                and public.homeos_item_placement_identity(
                    conflict_item.system,
                    conflict_item.category,
                    conflict_item.name,
                    conflict_item.location,
                    conflict_item.parent_area
                ) = proposal.proposed_identity
          )
          and not exists (
              select 1
              from public.home_items slug_conflict
              where slug_conflict.property_id = proposal.property_id
                and slug_conflict.id <> proposal.child_id
                and coalesce(slug_conflict.archived, false) = false
                and lower(slug_conflict.item_slug) = proposal.proposed_slug
                and public.homeos_starter_identity(slug_conflict.location) = proposal.proposed_location
                and public.homeos_starter_identity(slug_conflict.parent_area) = proposal.proposed_parent_area
          )
    ) then
        raise exception 'A safely unique canonical or approved legacy child remained active without its durable root relationship.';
    end if;

    if to_regprocedure('public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)') is not null
       or to_regprocedure('public.create_provider_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid)') is not null
       or to_regprocedure('public.create_sales_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)') is not null
       or to_regprocedure('public.create_sales_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid)') is not null then
        raise exception 'Obsolete create RPC overloads would make optional instance arguments ambiguous.';
    end if;

    if to_regprocedure('public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid,text)') is null
       or to_regprocedure('public.create_provider_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text)') is null
       or to_regprocedure('public.create_sales_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid,text)') is null
       or to_regprocedure('public.create_sales_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text)') is null then
        raise exception 'Current provider or Sales create RPC instance contract is missing.';
    end if;

    v_provider_reader_result := pg_get_function_result(
        'public.get_provider_homeos_items(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
    );
    v_sales_reader_result := pg_get_function_result(
        'public.get_sales_company_homeos_items(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
    );
    v_provider_create_def := pg_get_functiondef(
        'public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid,text)'::regprocedure
    );
    v_provider_deck_def := pg_get_functiondef(
        'public.create_provider_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text)'::regprocedure
    );
    v_sales_create_def := pg_get_functiondef(
        'public.create_sales_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid,text)'::regprocedure
    );
    v_sales_deck_def := pg_get_functiondef(
        'public.create_sales_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text)'::regprocedure
    );

    if v_provider_reader_result !~* 'parent_home_item_id uuid'
       or v_provider_reader_result !~* 'placement_label text'
       or v_sales_reader_result !~* 'parent_home_item_id uuid'
       or v_sales_reader_result !~* 'placement_label text' then
        raise exception 'Provider or Sales item reads do not return instance parentage and labels.';
    end if;

    if v_provider_create_def !~* 'p_parent_home_item_id uuid default null'
       or v_provider_create_def !~* 'p_placement_label text default null'
       or v_provider_create_def !~* 'v_item.parent_home_item_id'
       or v_provider_create_def !~* 'v_item.placement_label'
       or v_provider_create_def !~* 'item.parent_home_item_id = p_parent_home_item_id'
       or v_provider_create_def !~* 'v_component_candidate_count > 1'
       or v_provider_create_def !~* 'select exists'
       or v_provider_create_def !~* 'case when v_reused_existing then null::text else v_item.about end'
       or v_provider_create_def !~* 'null::text,[[:space:]]*v_item.created_at'
       or v_provider_create_def !~* 'v_item.install_state,[[:space:]]*null::text'
       or v_provider_deck_def !~* 'p_parent_home_item_id => p_parent_home_item_id'
       or v_provider_deck_def !~* 'p_placement_label => p_placement_label'
       or v_provider_deck_def !~* 'item.starter_template_key = v_template.template_key'
       or v_sales_create_def !~* 'p_parent_home_item_id => p_parent_home_item_id'
       or v_sales_create_def !~* 'p_placement_label => p_placement_label'
       or v_sales_deck_def !~* 'p_parent_home_item_id => p_parent_home_item_id'
       or v_sales_deck_def !~* 'p_placement_label => p_placement_label' then
        raise exception 'Provider or Sales creates do not preserve optional instance parentage and labels.';
    end if;

    if has_function_privilege(
        'anon',
        'public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid,text)',
        'EXECUTE'
    ) or not has_function_privilege(
        'authenticated',
        'public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid,text)',
        'EXECUTE'
    ) then
        raise exception 'Provider HomeOS create RPC execution privileges are incorrect.';
    end if;

    if has_function_privilege(
        'anon',
        'public.archive_home_item_with_components(uuid)',
        'EXECUTE'
    ) or not has_function_privilege(
        'authenticated',
        'public.archive_home_item_with_components(uuid)',
        'EXECUTE'
    ) then
        raise exception 'Homeowner assembly archive RPC execution privileges are incorrect.';
    end if;

    if has_function_privilege('anon', 'public.homeos_overlay_root_identity(text,text,text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.homeos_overlay_root_identity(text,text,text)', 'EXECUTE')
       or has_function_privilege('anon', 'public.homeos_resolve_overlay_root_for_placement(uuid,text,text,text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.homeos_resolve_overlay_root_for_placement(uuid,text,text,text)', 'EXECUTE')
       or has_function_privilege('anon', 'public.homeos_room_placement_identity(text,text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.homeos_room_placement_identity(text,text)', 'EXECUTE')
       or has_function_privilege('anon', 'public.homeos_resolve_unambiguous_overlay_parent(uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.homeos_resolve_unambiguous_overlay_parent(uuid)', 'EXECUTE')
       or has_function_privilege('anon', 'public.homeos_resolve_unambiguous_starter_parent(uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.homeos_resolve_unambiguous_starter_parent(uuid)', 'EXECUTE')
       or has_function_privilege('anon', 'public.homeos_resolve_starter_parentage_after_write()', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.homeos_resolve_starter_parentage_after_write()', 'EXECUTE') then
        raise exception 'Internal SECURITY DEFINER hierarchy helpers must not be directly executable by app roles.';
    end if;

    if to_regclass('public.home_items_property_placement_identity_key') is null
       or to_regclass('public.home_items_property_placement_slug_key') is null then
        raise exception 'Instance parentage must not weaken active HomeOS placement uniqueness.';
    end if;
end;
$$;

-- Exercise the archive contract against isolated homeowner/property/item rows.
-- Everything, including the temporary auth user, is rolled back below.
do $$
declare
    v_user_id uuid := gen_random_uuid();
    v_property_id uuid;
    v_assembly_id uuid;
    v_first_child_id uuid;
    v_second_child_id uuid;
    v_faucet_id uuid;
    v_disposal_id uuid;
    v_flange_id uuid;
    v_flange_variant_id uuid;
    v_sink_trap_id uuid;
    v_kitchen_area_id uuid;
    v_pantry_area_id uuid;
    v_pantry_faucet_id uuid;
    v_pantry_trap_id uuid;
    v_legacy_faucet_id uuid;
    v_refrigerator_id uuid;
    v_water_line_id uuid;
    v_water_filter_id uuid;
    v_orphan_assembly_id uuid;
    v_orphan_flange_id uuid;
    v_bathroom_area_id uuid;
    v_toilet_id uuid;
    v_toilet_flapper_id uuid;
    v_flat_bathroom_area_id uuid;
    v_flat_toilet_id uuid;
    v_flat_toilet_flapper_id uuid;
    v_bulk_toilet_id uuid := gen_random_uuid();
    v_bulk_flapper_id uuid := gen_random_uuid();
    v_duplicate_heater_a_id uuid;
    v_duplicate_heater_b_id uuid;
    v_duplicate_heater_child_id uuid;
    v_custom_area_id uuid;
    v_custom_sink_id uuid;
    v_custom_trap_id uuid;
    v_replacement_heater_id uuid;
    v_replacement_heater_child_id uuid;
    v_foreign_user_id uuid := gen_random_uuid();
    v_foreign_child_id uuid;
    v_archived_id uuid;
    v_archived_count integer;
    v_email text := 'homeos-parentage-regression-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
begin
    insert into auth.users (
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    ) values (
        v_user_id,
        'authenticated',
        'authenticated',
        v_email,
        '',
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"HOMEOWNER","full_name":"Parentage Regression"}'::jsonb,
        now(),
        now()
    );

    insert into auth.users (
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    ) values (
        v_foreign_user_id,
        'authenticated',
        'authenticated',
        'homeos-parentage-foreign-' || replace(v_foreign_user_id::text, '-', '') || '@example.invalid',
        '',
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"HOMEOWNER","full_name":"Foreign Parentage Regression"}'::jsonb,
        now(),
        now()
    );

    perform set_config('request.jwt.claim.sub', v_user_id::text, true);

    select created_property.property_id
    into v_property_id
    from public.create_homeowner_first_property(
        'Parentage Regression Home',
        '1 Regression Way',
        null,
        'Testville',
        'CA',
        '90000',
        'US',
        '1 Regression Way, Testville, CA 90000',
        34.000001,
        -118.000001,
        'homeos-parentage-regression-' || replace(gen_random_uuid()::text, '-', ''),
        'HOUSE'
    ) created_property
    limit 1;

    if v_property_id is null then
        raise exception 'Could not create the isolated HomeOS parentage regression property.';
    end if;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-kitchen-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Kitchen', 'HomeOS', 'Area',
        'Kitchen', 'Guest House', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_kitchen_area_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-pantry-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Pantry', 'HomeOS', 'Area',
        'Pantry', 'Kitchen', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_pantry_area_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, placement_label,
        starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-assembly-' || replace(gen_random_uuid()::text, '-', ''),
        'Kitchen Sink', 'Structural', 'Assembly',
        'Kitchen', 'Guest House', 'Missing Information', 'Unknown', false, 'Left sink',
        'kitchen:kitchen_sink'
    ) returning id into v_assembly_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, parent_home_item_id
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-child-a-' || replace(gen_random_uuid()::text, '-', ''),
        'Regression P-Trap', 'Structural', 'Component',
        'ignored legacy location', '', 'Missing Information', 'Unknown', false, v_assembly_id
    ) returning id into v_first_child_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, parent_home_item_id
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-child-b-' || replace(gen_random_uuid()::text, '-', ''),
        'Regression Supply Lines', 'Structural', 'Component',
        'ignored legacy location', '', 'Missing Information', 'Unknown', false, v_assembly_id
    ) returning id into v_second_child_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-faucet-' || replace(gen_random_uuid()::text, '-', ''),
        'Kitchen Faucet', 'Structural', 'Fixture',
        'Kitchen', 'Guest House', 'Missing Information', 'Unknown', false,
        'kitchen:kitchen_faucet'
    ) returning id into v_faucet_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-disposal-' || replace(gen_random_uuid()::text, '-', ''),
        'Garbage Disposal', 'Structural', 'Equipment',
        'Kitchen', 'Guest House', 'Missing Information', 'Unknown', false,
        'kitchen:garbage_disposal'
    ) returning id into v_disposal_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-flange-' || replace(gen_random_uuid()::text, '-', ''),
        'Disposal Flange', 'Structural', 'Component',
        'Garbage Disposal', 'Kitchen', 'Missing Information', 'Unknown', false,
        'kitchen:disposal_flange'
    ) returning id into v_flange_id;

    -- Same card identity in a different current placement would collide only
    -- after both rows flatten to the root. Migration backfill must leave that
    -- ambiguity untouched; explicit archive can still retain both histories
    -- because archived rows are outside the active uniqueness indexes.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-flange-variant-' || replace(gen_random_uuid()::text, '-', ''),
        'Disposal Flange', 'Structural', 'Component',
        'Kitchen', 'Guest House', 'Missing Information', 'Unknown', false,
        'kitchen:disposal_flange'
    ) returning id into v_flange_variant_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-nested-sink-trap-' || replace(gen_random_uuid()::text, '-', ''),
        'Kitchen Sink P-Trap', 'Structural', 'Component',
        'Kitchen Sink', 'Kitchen', 'Missing Information', 'Unknown', false,
        'kitchen:kitchen_sink_p_trap'
    ) returning id into v_sink_trap_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-legacy-faucet-' || replace(gen_random_uuid()::text, '-', ''),
        'Faucet', 'Structural', 'Fixture',
        'Kitchen Sink', 'Kitchen', 'Missing Information', 'Unknown', false
    ) returning id into v_legacy_faucet_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-pantry-faucet-' || replace(gen_random_uuid()::text, '-', ''),
        'Kitchen Faucet', 'Structural', 'Fixture',
        'Pantry', 'Kitchen', 'Missing Information', 'Unknown', false,
        'kitchen:kitchen_faucet'
    ) returning id into v_pantry_faucet_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-pantry-trap-' || replace(gen_random_uuid()::text, '-', ''),
        'Kitchen Sink P-Trap', 'Structural', 'Component',
        'Pantry', 'Kitchen', 'Missing Information', 'Unknown', false,
        'kitchen:kitchen_sink_p_trap'
    ) returning id into v_pantry_trap_id;

    if public.homeos_resolve_unambiguous_overlay_parent(v_faucet_id) is distinct from v_assembly_id
       or public.homeos_resolve_unambiguous_overlay_parent(v_disposal_id) is distinct from v_assembly_id
       or public.homeos_resolve_unambiguous_overlay_parent(v_flange_id) is distinct from v_assembly_id
       or public.homeos_resolve_unambiguous_overlay_parent(v_flange_variant_id) is distinct from v_assembly_id
       or public.homeos_resolve_unambiguous_overlay_parent(v_sink_trap_id) is distinct from v_assembly_id
       or public.homeos_resolve_unambiguous_overlay_parent(v_legacy_faucet_id) is distinct from v_assembly_id then
        raise exception 'Nested-room direct overlays and their saved descendant chain did not resolve to the exact outer-area assembly.';
    end if;

    if public.homeos_resolve_unambiguous_overlay_parent(v_pantry_faucet_id) is not null then
        raise exception 'An item in the saved Pantry-under-Kitchen Area was collapsed into its parent Kitchen.';
    end if;

    if public.homeos_resolve_unambiguous_starter_parent(v_pantry_trap_id) is not null then
        raise exception 'A keyed parented-template card in the saved Pantry Area crossed into the parent Kitchen.';
    end if;

    select archived.archived_home_item_id, archived.archived_component_count
    into v_archived_id, v_archived_count
    from public.archive_home_item_with_components(v_assembly_id) archived;

    if v_archived_id is distinct from v_assembly_id
       or v_archived_count is distinct from 8 then
        raise exception 'Assembly archive did not report direct and approved overlay components.';
    end if;

    if (
        select count(*)
        from public.home_items item
        where item.id in (
            v_assembly_id, v_first_child_id, v_second_child_id,
            v_faucet_id, v_disposal_id, v_flange_id, v_flange_variant_id,
            v_sink_trap_id, v_legacy_faucet_id
        )
          and coalesce(item.archived, false)
    ) <> 9 then
        raise exception 'Assembly archive did not atomically retain and archive the complete item set.';
    end if;

    if (
        select count(*)
        from public.home_items child
        where child.parent_home_item_id = v_assembly_id
          and child.id in (
              v_first_child_id, v_second_child_id,
              v_faucet_id, v_disposal_id, v_flange_id, v_flange_variant_id,
              v_sink_trap_id, v_legacy_faucet_id
          )
    ) <> 8 then
        raise exception 'Assembly archive did not preserve and flatten component relationships.';
    end if;

    if exists (
        select 1
        from public.home_items item
        where item.id in (v_pantry_faucet_id, v_pantry_trap_id)
          and (coalesce(item.archived, false) or item.parent_home_item_id is not null)
    ) then
        raise exception 'Assembly archive crossed the saved Pantry-under-Kitchen Area boundary.';
    end if;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-refrigerator-' || replace(gen_random_uuid()::text, '-', ''),
        'Refrigerator', 'Structural', 'Equipment',
        'Kitchen', 'Guest House', 'Missing Information', 'Unknown', false
    ) returning id into v_refrigerator_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-water-line-' || replace(gen_random_uuid()::text, '-', ''),
        'Refrigerator Water Line', 'Structural', 'Component',
        'Kitchen', 'Guest House', 'Missing Information', 'Unknown', false,
        'kitchen:refrigerator_water_line'
    ) returning id into v_water_line_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key,
        parent_home_item_id
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-water-filter-' || replace(gen_random_uuid()::text, '-', ''),
        'Refrigerator Water Filter', 'Structural', 'Component',
        'Refrigerator Water Line', 'Kitchen', 'Missing Information', 'Unknown', false,
        'kitchen:refrigerator_water_filter', v_water_line_id
    ) returning id into v_water_filter_id;

    select archived.archived_home_item_id, archived.archived_component_count
    into v_archived_id, v_archived_count
    from public.archive_home_item_with_components(v_refrigerator_id) archived;

    if v_archived_id is distinct from v_refrigerator_id
       or v_archived_count is distinct from 2
       or not exists (
           select 1
           from public.home_items child
           where child.id in (v_water_line_id, v_water_filter_id)
             and child.parent_home_item_id = v_refrigerator_id
             and coalesce(child.archived, false)
           group by child.parent_home_item_id
           having count(*) = 2
       ) then
        raise exception 'Refrigerator overlay archive did not flatten and archive the water-line deck.';
    end if;

    -- Catalog ancestry must not invent the missing Garbage Disposal card. The
    -- UI leaves this flange top-level, so persistence/archive must do the same.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-orphan-sink-' || replace(gen_random_uuid()::text, '-', ''),
        'Kitchen Sink', 'Structural', 'Assembly',
        'Orphan Kitchen', 'Detached Studio', 'Missing Information', 'Unknown', false,
        'kitchen:kitchen_sink'
    ) returning id into v_orphan_assembly_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-orphan-flange-' || replace(gen_random_uuid()::text, '-', ''),
        'Disposal Flange', 'Structural', 'Component',
        'Garbage Disposal', 'Orphan Kitchen', 'Missing Information', 'Unknown', false,
        'kitchen:disposal_flange'
    ) returning id into v_orphan_flange_id;

    if public.homeos_resolve_unambiguous_overlay_parent(v_orphan_flange_id) is not null then
        raise exception 'A missing overlay intermediary was synthesized from catalog ancestry.';
    end if;

    -- A SECURITY DEFINER cascade may not archive another property member's
    -- component merely because it is attached to this caller's assembly.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, parent_home_item_id
    ) values (
        v_foreign_user_id, v_property_id,
        'parentage-regression-foreign-child-' || replace(gen_random_uuid()::text, '-', ''),
        'Foreign-owned Component', 'Structural', 'Component',
        'ignored legacy location', '', 'Missing Information', 'Unknown', false,
        v_orphan_assembly_id
    ) returning id into v_foreign_child_id;

    begin
        perform public.archive_home_item_with_components(v_orphan_assembly_id);
        raise exception 'Assembly archive unexpectedly mutated another property member''s component.';
    exception
        when insufficient_privilege then null;
    end;

    if exists (
        select 1
        from public.home_items item
        where item.id in (v_orphan_assembly_id, v_foreign_child_id)
          and coalesce(item.archived, false)
    ) then
        raise exception 'Rejected cross-owner assembly archive changed item state.';
    end if;

    -- The oldest whole-home starter writer emits no starter keys. Root-first
    -- one-row writes must still persist a unique catalog relationship.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-bathroom-legacy-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Bathroom Legacy', 'HomeOS', 'Area',
        'Bathroom Legacy', 'Guest House', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_bathroom_area_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-toilet-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Structural', 'Fixture',
        'Bathroom Legacy', 'Guest House', 'Missing Information', 'Unknown', false
    ) returning id into v_toilet_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-toilet-flapper-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Flapper', 'Structural', 'Component',
        'Toilet', 'Bathroom Legacy', 'Missing Information', 'Unknown', false
    ) returning id into v_toilet_flapper_id;

    -- Older keyed rows may carry the room placement rather than the assembly
    -- name. Use a separate placement so this fixture does not intentionally
    -- collide with the unkeyed Flapper above after both resolve to a Toilet.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-bathroom-flat-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Bathroom Flat', 'HomeOS', 'Area',
        'Bathroom Flat', 'Guest House', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_flat_bathroom_area_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-flat-toilet-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Structural', 'Fixture',
        'Bathroom Flat', 'Guest House', 'Missing Information', 'Unknown', false
    ) returning id into v_flat_toilet_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-flat-toilet-flapper-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Flapper', 'Structural', 'Component',
        'Bathroom Flat', 'Guest House', 'Missing Information', 'Unknown', false,
        'bathroom:toilet_flapper'
    ) returning id into v_flat_toilet_flapper_id;

    -- A single bulk statement is intentionally child-first. The deferred
    -- resolver must see the complete statement and link it to the later root.
    insert into public.home_items (
        id, user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values
    (
        v_bulk_flapper_id, v_user_id, v_property_id,
        'parentage-regression-bulk-flapper-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Flapper', 'Structural', 'Component',
        'Toilet', 'Bathroom Bulk', 'Missing Information', 'Unknown', false,
        'bathroom:toilet_flapper'
    ),
    (
        v_bulk_toilet_id, v_user_id, v_property_id,
        'parentage-regression-bulk-toilet-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Structural', 'Fixture',
        'Bathroom Bulk', 'Guest House', 'Missing Information', 'Unknown', false,
        'bathroom:toilet'
    );

    -- Repeated assembly types are valid, but inference may not choose between
    -- two concrete instances merely because their starter key and Area match.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-heater-a-' || replace(gen_random_uuid()::text, '-', ''),
        'Water Heater A', 'Structural', 'Equipment',
        'Garage Duplicate', 'Guest House', 'Missing Information', 'Unknown', false,
        'garage:water_heater'
    ) returning id into v_duplicate_heater_a_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-heater-b-' || replace(gen_random_uuid()::text, '-', ''),
        'Water Heater B', 'Structural', 'Equipment',
        'Garage Duplicate', 'Guest House', 'Missing Information', 'Unknown', false,
        'garage:water_heater'
    ) returning id into v_duplicate_heater_b_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-duplicate-heater-child-' || replace(gen_random_uuid()::text, '-', ''),
        'Water Heater Drain Pan', 'Structural', 'Component',
        'Water Heater', 'Garage Duplicate', 'Missing Information', 'Unknown', false,
        'garage:water_heater_drain_pan'
    ) returning id into v_duplicate_heater_child_id;

    -- Custom room names cannot use the complete-room normalization, so exact
    -- saved legacy ancestry must still find the unique root.
    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, area_scope
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-cooking-alcove-area-' || replace(gen_random_uuid()::text, '-', ''),
        'Cooking Alcove', 'HomeOS', 'Area',
        'Cooking Alcove', 'Guest House', 'Missing Information', 'Unknown', false, 'interior'
    ) returning id into v_custom_area_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-custom-sink-' || replace(gen_random_uuid()::text, '-', ''),
        'Kitchen Sink', 'Structural', 'Fixture',
        'Cooking Alcove', 'Guest House', 'Missing Information', 'Unknown', false,
        'kitchen:kitchen_sink'
    ) returning id into v_custom_sink_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-custom-sink-trap-' || replace(gen_random_uuid()::text, '-', ''),
        'Kitchen Sink P-Trap', 'Structural', 'Component',
        'Kitchen Sink', 'Cooking Alcove', 'Missing Information', 'Unknown', false,
        'kitchen:kitchen_sink_p_trap'
    ) returning id into v_custom_trap_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, placement_label,
        starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-replacement-heater-' || replace(gen_random_uuid()::text, '-', ''),
        'Water Heater', 'Structural', 'Equipment',
        'Garage Replacement', 'Guest House', 'Missing Information', 'Unknown', false,
        'Original heater', 'garage:water_heater'
    ) returning id into v_replacement_heater_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_user_id, v_property_id,
        'parentage-regression-replacement-drain-pan-' || replace(gen_random_uuid()::text, '-', ''),
        'Water Heater Drain Pan', 'Structural', 'Component',
        'Water Heater', 'Garage Replacement', 'Missing Information', 'Unknown', false,
        'garage:water_heater_drain_pan'
    ) returning id into v_replacement_heater_child_id;

    insert into homeos_instance_parentage_runtime_ids(fixture_key, item_id) values
        ('toilet', v_toilet_id),
        ('toilet_flapper', v_toilet_flapper_id),
        ('flat_toilet', v_flat_toilet_id),
        ('flat_toilet_flapper', v_flat_toilet_flapper_id),
        ('bulk_toilet', v_bulk_toilet_id),
        ('bulk_flapper', v_bulk_flapper_id),
        ('duplicate_heater_child', v_duplicate_heater_child_id),
        ('pantry_faucet', v_pantry_faucet_id),
        ('pantry_trap', v_pantry_trap_id),
        ('custom_sink', v_custom_sink_id),
        ('custom_trap', v_custom_trap_id),
        ('replacement_heater', v_replacement_heater_id),
        ('replacement_heater_child', v_replacement_heater_child_id);

    select archived.archived_home_item_id, archived.archived_component_count
    into v_archived_id, v_archived_count
    from public.archive_home_item_with_components(v_assembly_id) archived;

    if v_archived_id is distinct from v_assembly_id
       or v_archived_count is distinct from 0 then
        raise exception 'Assembly archive is not safely idempotent.';
    end if;
end;
$$;

-- Force future-writer reconciliation and relationship checks while fixtures are
-- still available for executable assertions.
set constraints all immediate;

do $$
declare
    v_toilet_id uuid;
    v_toilet_flapper_id uuid;
    v_flat_toilet_id uuid;
    v_flat_toilet_flapper_id uuid;
    v_bulk_toilet_id uuid;
    v_bulk_flapper_id uuid;
    v_duplicate_heater_child_id uuid;
    v_pantry_faucet_id uuid;
    v_pantry_trap_id uuid;
    v_custom_sink_id uuid;
    v_custom_trap_id uuid;
    v_archived_id uuid;
    v_archived_count integer;
begin
    select item_id into v_toilet_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'toilet';
    select item_id into v_toilet_flapper_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'toilet_flapper';
    select item_id into v_flat_toilet_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'flat_toilet';
    select item_id into v_flat_toilet_flapper_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'flat_toilet_flapper';
    select item_id into v_bulk_toilet_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'bulk_toilet';
    select item_id into v_bulk_flapper_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'bulk_flapper';
    select item_id into v_duplicate_heater_child_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'duplicate_heater_child';
    select item_id into v_pantry_faucet_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'pantry_faucet';
    select item_id into v_pantry_trap_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'pantry_trap';
    select item_id into v_custom_sink_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'custom_sink';
    select item_id into v_custom_trap_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'custom_trap';

    if (select parent_home_item_id from public.home_items where id = v_toilet_flapper_id)
           is distinct from v_toilet_id then
        raise exception 'An unkeyed root-first Toilet Flapper write did not persist its Toilet instance.';
    end if;

    if (select parent_home_item_id from public.home_items where id = v_flat_toilet_flapper_id)
           is distinct from v_flat_toilet_id then
        raise exception 'A keyed legacy room-placement component did not persist its unique unkeyed Toilet instance.';
    end if;

    if (select parent_home_item_id from public.home_items where id = v_bulk_flapper_id)
           is distinct from v_bulk_toilet_id then
        raise exception 'A child-first bulk starter insert did not reconcile after its Toilet root became visible.';
    end if;

    if (select parent_home_item_id from public.home_items where id = v_duplicate_heater_child_id)
           is not null then
        raise exception 'A future starter write guessed between duplicate concrete Water Heater instances.';
    end if;

    if exists (
        select 1
        from public.home_items nested_area_item
        where nested_area_item.id in (v_pantry_faucet_id, v_pantry_trap_id)
          and nested_area_item.parent_home_item_id is not null
    ) then
        raise exception 'Deferred starter reconciliation crossed an exact Pantry-under-Kitchen Area boundary.';
    end if;

    if (select parent_home_item_id from public.home_items where id = v_custom_trap_id)
           is distinct from v_custom_sink_id then
        raise exception 'Exact custom-room starter ancestry did not persist its unique Kitchen Sink root.';
    end if;

    select archived.archived_home_item_id, archived.archived_component_count
    into v_archived_id, v_archived_count
    from public.archive_home_item_with_components(v_toilet_id) archived;

    if v_archived_id is distinct from v_toilet_id
       or v_archived_count is distinct from 1
       or not exists (
           select 1
           from public.home_items child
           where child.id = v_toilet_flapper_id
             and child.parent_home_item_id = v_toilet_id
             and coalesce(child.archived, false)
       ) then
        raise exception 'Generic non-overlay assembly archive did not retain the Toilet Flapper history.';
    end if;

    select archived.archived_home_item_id, archived.archived_component_count
    into v_archived_id, v_archived_count
    from public.archive_home_item_with_components(v_flat_toilet_id) archived;

    if v_archived_id is distinct from v_flat_toilet_id
       or v_archived_count is distinct from 1
       or not exists (
           select 1
           from public.home_items child
           where child.id = v_flat_toilet_flapper_id
             and child.parent_home_item_id = v_flat_toilet_id
             and coalesce(child.archived, false)
       ) then
        raise exception 'Keyed legacy room-placement archive did not retain the resolved Toilet Flapper history.';
    end if;

    select archived.archived_home_item_id, archived.archived_component_count
    into v_archived_id, v_archived_count
    from public.archive_home_item_with_components(v_custom_sink_id) archived;

    if v_archived_id is distinct from v_custom_sink_id
       or v_archived_count is distinct from 1
       or not exists (
           select 1
           from public.home_items child
           where child.id = v_custom_trap_id
             and child.parent_home_item_id = v_custom_sink_id
             and coalesce(child.archived, false)
       ) then
        raise exception 'Custom-room assembly archive did not retain its exact saved component history.';
    end if;
end;
$$;

-- Replacement closeout archives the old root before inserting its successor;
-- lifecycle validation is therefore intentionally deferred across both writes.
set constraints all deferred;

do $$
declare
    v_old_id uuid;
    v_old public.home_items%rowtype;
    v_new_id uuid;
begin
    select item_id into v_old_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'replacement_heater';

    select item.* into v_old
    from public.home_items item
    where item.id = v_old_id;

    update public.home_items item
    set status = 'Replaced',
        archived = true
    where item.id = v_old_id;

    insert into public.home_items (
        user_id, property_id, item_slug, name, system, category,
        location, parent_area, status, install_state, archived,
        replaces_home_item_id
    ) values (
        v_old.user_id, v_old.property_id,
        'parentage-regression-replacement-successor-' || replace(gen_random_uuid()::text, '-', ''),
        v_old.name, v_old.system, v_old.category,
        v_old.location, v_old.parent_area, 'Installed', 'Installed', false,
        v_old.id
    ) returning id into v_new_id;

    insert into homeos_instance_parentage_runtime_ids(fixture_key, item_id)
    values ('replacement_heater_successor', v_new_id);
end;
$$;

set constraints all immediate;

do $$
declare
    v_old_id uuid;
    v_child_id uuid;
    v_new_id uuid;
begin
    select item_id into v_old_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'replacement_heater';
    select item_id into v_child_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'replacement_heater_child';
    select item_id into v_new_id
    from homeos_instance_parentage_runtime_ids where fixture_key = 'replacement_heater_successor';

    if not exists (
        select 1
        from public.home_items successor
        where successor.id = v_new_id
          and successor.parent_home_item_id is null
          and successor.starter_template_key = 'garage:water_heater'
          and successor.placement_label = 'Original heater'
          and coalesce(successor.archived, false) = false
    ) or not exists (
        select 1
        from public.home_items child
        where child.id = v_child_id
          and child.parent_home_item_id = v_new_id
          and coalesce(child.archived, false) = false
    ) or not exists (
        select 1
        from public.home_items retired
        where retired.id = v_old_id
          and coalesce(retired.archived, false)
    ) then
        raise exception 'Replacement closeout did not preserve starter identity, label, and durable component parentage.';
    end if;
end;
$$;

select 'homeos_instance_parentage_ok' as result;

rollback;
