-- Rollback-only regression checks for 20260820120000_homeos_container_catalog_roles.sql.

begin;

do $$
declare
    v_role_type text;
    v_role_nullable text;
    v_auto_type text;
    v_auto_nullable text;
    v_role_check text;
    v_picker text;
    v_deck text;
    v_provisioner text;
    v_optional_count integer;
    v_home_item_count_before bigint;
    v_home_item_count_after bigint;
    v_home_item_fingerprint_before text;
    v_home_item_fingerprint_after text;
begin
    select
        count(*)::bigint,
        md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by item.id), ''))
    into v_home_item_count_before, v_home_item_fingerprint_before
    from public.home_items item;

    select column_row.data_type, column_row.is_nullable
    into v_role_type, v_role_nullable
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'homeos_starter_card_templates'
      and column_row.column_name = 'presentation_role';

    select column_row.data_type, column_row.is_nullable
    into v_auto_type, v_auto_nullable
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'homeos_starter_card_templates'
      and column_row.column_name = 'auto_provision';

    if v_role_type is distinct from 'text'
       or v_role_nullable is distinct from 'NO'
       or v_auto_type is distinct from 'boolean'
       or v_auto_nullable is distinct from 'NO' then
        raise exception 'Container presentation metadata must be additive, typed, and non-null.';
    end if;

    select pg_get_constraintdef(constraint_row.oid)
    into v_role_check
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.homeos_starter_card_templates'::regclass
      and constraint_row.conname = 'homeos_starter_card_templates_presentation_role_check';

    if v_role_check is null
       or v_role_check !~* 'container'
       or v_role_check !~* 'component' then
        raise exception 'Starter presentation roles are not constrained to container/component.';
    end if;

    select count(*)::integer
    into v_optional_count
    from public.homeos_starter_card_templates template
    where template.template_key in (
        'kitchen:refrigerator',
        'kitchen:stove_range',
        'kitchen:kitchen_counter',
        'bathroom:tub',
        'bathroom:shower'
    )
      and template.active
      and template.presentation_role = 'container'
      and not template.auto_provision
      and template.parent_template_key is null;

    if v_optional_count <> 5 then
        raise exception 'Every new Kitchen/Bathroom container must be active in Add Container and excluded from automatic provisioning.';
    end if;

    if exists (
        select 1
        from public.homeos_starter_card_templates template
        where template.template_key in ('kitchen:secondary_sink', 'kitchen:kitchen_secondary_sink')
           or public.homeos_starter_identity(template.name) = 'kitchen secondary sink'
    ) then
        raise exception 'A second Kitchen Sink must remain another placed instance, not a duplicate archetype.';
    end if;

    if exists (
        select 1
        from public.homeos_starter_card_templates template
        where not template.auto_provision
          and template.template_key not in (
              'kitchen:refrigerator',
              'kitchen:stove_range',
              'kitchen:kitchen_counter',
              'bathroom:tub',
              'bathroom:shower'
          )
    ) then
        raise exception 'Existing starter templates must preserve their automatic-provisioning behavior.';
    end if;

    if not exists (
        select 1
        from public.homeos_starter_card_templates template
        where template.template_key = 'bathroom:shower_tub'
          and template.presentation_role = 'container'
    ) then
        raise exception 'The established Shower / Tub archetype must be reused as the combination container.';
    end if;

    if exists (
        select 1
        from public.homeos_starter_card_templates template
        where template.template_key = 'bathroom:roman_tub'
    ) or not exists (
        select 1
        from public.homeos_starter_card_templates template
        where template.template_key = 'master_bathroom:roman_deck_mount_tub'
          and template.presentation_role = 'container'
          and template.placement_tags ? 'bathroom'
    ) then
        raise exception 'Roman Tub must reuse the established Roman / Deck-Mount archetype without a duplicate template.';
    end if;

    if exists (
        select 1
        from public.homeos_starter_card_templates template
        where template.template_key in (
            'bathroom:bathroom_sink',
            'bathroom:bathroom_sink_faucet',
            'kitchen:kitchen_faucet',
            'kitchen:garbage_disposal',
            'kitchen:refrigerator_water_line',
            'kitchen:refrigerator_water_filter',
            'kitchen:refrigerator_shutoff_valve',
            'kitchen:instant_hot_water_dispenser',
            'kitchen:reverse_osmosis_system'
        )
          and template.presentation_role <> 'component'
    ) then
        raise exception 'Loose fixtures and serviceable items must not return to the area-level container Deck.';
    end if;

    if exists (
        select 1
        from public.homeos_starter_card_templates template
        where (template.template_key in ('bathroom:bathroom_sink', 'bathroom:bathroom_sink_faucet')
               and template.parent_template_key is distinct from 'bathroom:bathroom_vanity')
           or (template.template_key in ('kitchen:kitchen_faucet', 'kitchen:garbage_disposal')
               and template.parent_template_key is distinct from 'kitchen:kitchen_sink')
           or (template.template_key in ('kitchen:refrigerator_water_line', 'kitchen:refrigerator_water_filter', 'kitchen:refrigerator_shutoff_valve')
               and template.parent_template_key is distinct from 'kitchen:refrigerator')
           or (template.template_key in ('kitchen:instant_hot_water_dispenser', 'kitchen:reverse_osmosis_system')
               and template.parent_template_key is distinct from 'kitchen:kitchen_counter')
    ) then
        raise exception 'Container/component template relationships are not stored in the master Deck.';
    end if;

    v_picker := pg_get_functiondef(
        'public.get_homeos_starter_card_picker(uuid,uuid,uuid,uuid,uuid)'::regprocedure
    );
    v_deck := pg_get_functiondef('public.get_homeos_starter_card_deck()'::regprocedure);
    v_provisioner := pg_get_functiondef(
        'public.provision_complete_room_starter_cards(uuid)'::regprocedure
    );

    if v_picker !~* 'presentation_role'
       or v_picker !~* 'auto_provision'
       or v_deck !~* 'presentation_role'
       or v_deck !~* 'auto_provision' then
        raise exception 'Picker and Catalog Factory Deck must expose the shared presentation metadata.';
    end if;

    if v_provisioner !~* 'template[.]auto_provision' then
        raise exception 'The complete-room provisioner must skip optional containers.';
    end if;

    if exists (
        select 1
        from pg_trigger trigger_row
        join pg_proc trigger_function on trigger_function.oid = trigger_row.tgfoid
        where trigger_row.tgrelid = 'public.homeos_starter_card_templates'::regclass
          and not trigger_row.tgisinternal
          and pg_get_functiondef(trigger_function.oid) ~* 'home_items'
    ) then
        raise exception 'Starter-template metadata writes must not cascade into installed HomeOS rows.';
    end if;

    select
        count(*)::bigint,
        md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by item.id), ''))
    into v_home_item_count_after, v_home_item_fingerprint_after
    from public.home_items item;

    if v_home_item_count_after is distinct from v_home_item_count_before
       or v_home_item_fingerprint_after is distinct from v_home_item_fingerprint_before then
        raise exception 'Container catalog regression must leave every installed HomeOS row unchanged.';
    end if;
end;
$$;

rollback;
