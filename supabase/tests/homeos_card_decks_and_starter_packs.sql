-- Rollback-only regression checks for 20260820140000_homeos_card_decks_and_starter_packs.sql.

begin;

do $$
declare
    v_table text;
    v_rls boolean;
    v_constraint text;
    v_read_def text;
    v_save_def text;
    v_publish_def text;
    v_archive_def text;
    v_validate_def text;
    v_revision_mutation_def text;
    v_member_mutation_def text;
    v_mapper_def text;
    v_config text[];
begin
    foreach v_table in array array[
        'homeos_area_card_templates',
        'homeos_card_sets',
        'homeos_card_set_revisions',
        'homeos_card_set_revision_members'
    ] loop
        select class_row.relrowsecurity
        into v_rls
        from pg_class class_row
        where class_row.oid = ('public.' || v_table)::regclass;

        if not coalesce(v_rls, false)
           or has_table_privilege('authenticated', 'public.' || v_table, 'SELECT, INSERT, UPDATE, DELETE') then
            raise exception 'Card Deck table % must be RLS-protected and RPC-write-only.', v_table;
        end if;
    end loop;

    select pg_get_constraintdef(constraint_row.oid)
    into v_constraint
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.homeos_card_set_revision_members'::regclass
      and constraint_row.conname = 'homeos_card_set_revision_members_exactly_one_target_check';

    if v_constraint is null or v_constraint !~* 'num_nonnulls' then
        raise exception 'Card Set members must retain the one-target XOR constraint.';
    end if;

    if not exists (
        select 1 from pg_constraint constraint_row
        where constraint_row.conrelid = 'public.homeos_card_set_revision_members'::regclass
          and constraint_row.conname = 'homeos_card_set_revision_members_same_revision_parent_fkey'
          and constraint_row.condeferrable
    ) then
        raise exception 'Card Set parents must use a deferrable same-revision foreign key.';
    end if;

    select pg_get_functiondef('public.get_super_admin_homeos_card_decks()'::regprocedure), proc.proconfig
    into v_read_def, v_config
    from pg_proc proc
    where proc.oid = 'public.get_super_admin_homeos_card_decks()'::regprocedure;
    select pg_get_functiondef('public.save_admin_homeos_card_set_draft(jsonb)'::regprocedure)
    into v_save_def;
    select pg_get_functiondef('public.publish_admin_homeos_card_set(uuid)'::regprocedure)
    into v_publish_def;
    select pg_get_functiondef('public.archive_admin_homeos_card_set(uuid)'::regprocedure)
    into v_archive_def;
    select pg_get_functiondef('public.homeos_validate_card_set_revision_for_publication(uuid)'::regprocedure)
    into v_validate_def;
    select pg_get_functiondef('public.homeos_prevent_published_card_set_revision_mutation()'::regprocedure)
    into v_revision_mutation_def;
    select pg_get_functiondef('public.homeos_prevent_published_card_set_member_mutation()'::regprocedure)
    into v_member_mutation_def;
    select pg_get_functiondef('public.save_homeos_starter_card_deck_entry(text,uuid[],text,text)'::regprocedure)
    into v_mapper_def;

    if v_read_def !~* 'security definer'
       or not coalesce(v_config, array[]::text[]) @> array['search_path=pg_catalog, public, pg_temp']
       or v_read_def !~* 'areas'
       or v_read_def !~* 'card_sets'
       or v_read_def !~* 'members' then
        raise exception 'The Super Admin Card Deck reader must be hardened and return areas, sets, revisions, and members.';
    end if;

    if v_save_def !~* 'homeos_is_platform_admin'
       or v_save_def !~* 'full members array'
       or v_save_def !~* 'v_max_revision_number'
       or v_publish_def !~* 'homeos_validate_card_set_revision_for_publication'
       or v_publish_def !~* 'current_published_revision_id'
       or v_archive_def !~* 'archived' then
        raise exception 'Card Deck save/publish/archive lifecycle is incomplete.';
    end if;

    if v_validate_def !~* 'exactly one instantiated Area root'
       or v_validate_def !~* 'presentation_role'
       or v_validate_def !~* 'approved'
       or v_validate_def !~* 'Starter-template cards must be instantiated'
       or v_validate_def !~* 'recommendation-only leaves'
       or v_validate_def !~* 'cycle' then
        raise exception 'Published Starter Pack hierarchy/status validation is incomplete.';
    end if;

    if v_revision_mutation_def !~* 'old[.]publication_status = ''retired'''
       or v_member_mutation_def !~* 'v_old_revision_status'
       or v_member_mutation_def !~* 'v_new_revision_status' then
        raise exception 'Published and retired revision/member immutability guards are incomplete.';
    end if;

    if v_mapper_def !~* 'variant.status = ''approved'''
       or v_mapper_def !~* 'Starter-card product mappings require approved' then
        raise exception 'Bulk Starter Card product mappings must reject every non-approved product variant.';
    end if;

    if has_function_privilege('anon', 'public.get_super_admin_homeos_card_decks()', 'EXECUTE')
       or has_function_privilege('anon', 'public.save_admin_homeos_card_set_draft(jsonb)', 'EXECUTE')
       or has_function_privilege('anon', 'public.publish_admin_homeos_card_set(uuid)', 'EXECUTE')
       or has_function_privilege('anon', 'public.archive_admin_homeos_card_set(uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.get_super_admin_homeos_card_decks()', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.save_admin_homeos_card_set_draft(jsonb)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.publish_admin_homeos_card_set(uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.archive_admin_homeos_card_set(uuid)', 'EXECUTE') then
        raise exception 'Card Deck RPC execution grants are incorrect.';
    end if;

    if (select count(*) from public.homeos_area_card_templates) <> 44
       or exists (
           select 1 from public.homeos_area_card_templates
           where publication_status <> 'published'
       ) then
        raise exception 'The propertyAreaCatalog Area card seed is incomplete or unpublished.';
    end if;

    if (select count(*) from public.homeos_card_sets
        where id in (
            '62000000-0000-4000-8000-000000000001'::uuid,
            '62000000-0000-4000-8000-000000000002'::uuid,
            '62000000-0000-4000-8000-000000000003'::uuid
        )
          and current_published_revision_id is not null) <> 3
       or exists (
            select 1 from public.homeos_card_set_revisions revision
            where revision.id in (
                '62100000-0000-4000-8000-000000000001'::uuid,
                '62100000-0000-4000-8000-000000000002'::uuid,
                '62100000-0000-4000-8000-000000000003'::uuid
            )
              and (revision.revision_number <> 1 or revision.publication_status <> 'published')
       ) then
        raise exception 'The three immutable published v1 reference packs are missing.';
    end if;

    if exists (
        select 1
        from public.homeos_card_set_revision_members member
        where member.revision_id in (
            '62100000-0000-4000-8000-000000000001'::uuid,
            '62100000-0000-4000-8000-000000000002'::uuid,
            '62100000-0000-4000-8000-000000000003'::uuid
        )
          and (
              (member.starter_template_key is not null and member.member_behavior <> 'instantiate')
              or (member.catalog_product_variant_id is not null and member.member_behavior <> 'recommendation')
          )
    ) or exists (
        select 1
        from public.homeos_card_set_revision_members member
        where member.revision_id in (
            '62100000-0000-4000-8000-000000000001'::uuid,
            '62100000-0000-4000-8000-000000000002'::uuid,
            '62100000-0000-4000-8000-000000000003'::uuid
        )
        group by member.revision_id, member.display_order
        having count(*) > 1
    ) then
        raise exception 'Published v1 reference packs must instantiate canonical cards in a unique stable order.';
    end if;

    if exists (
        select 1
        from public.homeos_card_set_revision_members member
        join public.homeos_card_set_revisions revision on revision.id = member.revision_id
        where revision.id in (
            '62100000-0000-4000-8000-000000000001'::uuid,
            '62100000-0000-4000-8000-000000000002'::uuid,
            '62100000-0000-4000-8000-000000000003'::uuid
        )
          and member.starter_template_key is not null
          and exists (
              select 1
              from public.homeos_starter_card_templates template
              where template.template_key = member.starter_template_key
                and (
                    template.trade_key <> 'plumbing'
                    or lower(btrim(coalesce(template.system, ''))) in ('electrical', 'safety')
                )
          )
    ) then
        raise exception 'Reference packs must not include electrical or safety cards.';
    end if;

    if not exists (
        select 1 from public.homeos_starter_card_templates template
        where template.template_key = 'bathroom:toilet_drain'
          and template.parent_template_key = 'bathroom:toilet'
          and template.presentation_role = 'component'
          and template.active
          and not template.auto_provision
    ) then
        raise exception 'The canonical Bathroom Toilet Drain component must be template-only and non-provisioning.';
    end if;
end;
$$;

-- Keep this structurally identical to the migration's bounded Toilet Drain
-- repair predicate.  The runtime fixture below changes only data, so each
-- assertion exercises the same candidate, conflict, and ambiguity gates that
-- production uses rather than a looser name-only approximation.
create temporary view homeos_card_decks_toilet_drain_candidate_regression as
with eligible_parent_matches as (
    select
        child.id as child_id,
        parent.id as parent_id,
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
        public.homeos_starter_identity(parent.location) as proposed_parent_area,
        nullif(btrim(coalesce(parent.name, '')), '') as expected_location,
        nullif(btrim(coalesce(parent.location, '')), '') as expected_parent_area,
        case
            when public.homeos_starter_identity(child.location) = public.homeos_starter_identity(parent.name)
             and public.homeos_starter_identity(child.parent_area) = public.homeos_starter_identity(parent.location)
                then 'legacy_chain'
            else 'same_room_root'
        end as attachment_shape,
        count(*) over (partition by child.id) as parent_count
    from public.home_items child
    join public.home_items parent
      on parent.property_id = child.property_id
     and parent.parent_home_item_id is null
     and coalesce(parent.archived, false) = false
     and public.homeos_complete_room_kind(parent.location) = 'bathroom'
     and (
         parent.starter_template_key = 'bathroom:toilet'
         or (
             parent.starter_template_key is null
             and public.homeos_starter_identity(parent.name) = 'toilet'
             and public.homeos_starter_identity(parent.system) = 'plumbing'
             and lower(btrim(coalesce(parent.category, ''))) in ('fixture', 'equipment')
         )
     )
     and (
         (
             public.homeos_starter_identity(child.location) = public.homeos_starter_identity(parent.name)
             and public.homeos_starter_identity(child.parent_area) = public.homeos_starter_identity(parent.location)
         )
         or (
             public.homeos_starter_identity(child.location) = public.homeos_starter_identity(parent.location)
             and public.homeos_starter_identity(child.parent_area) = public.homeos_starter_identity(parent.parent_area)
         )
     )
    where child.starter_template_key is null
      and child.parent_home_item_id is null
      and coalesce(child.archived, false) = false
      and public.homeos_starter_identity(child.name) = 'toilet drain'
      and public.homeos_starter_identity(child.system) = 'drains sewer'
      and public.homeos_starter_identity(child.category) = 'fixture'
      and not exists (
          select 1
          from public.home_items descendant
          where descendant.parent_home_item_id = child.id
      )
),
destination_safe_candidates as (
    select candidate.*
    from eligible_parent_matches candidate
    where candidate.parent_count = 1
      and not exists (
          select 1
          from public.home_items placement_conflict
          where placement_conflict.property_id = candidate.property_id
            and placement_conflict.id <> candidate.child_id
            and coalesce(placement_conflict.archived, false) = false
            and public.homeos_item_placement_identity(
                placement_conflict.system,
                placement_conflict.category,
                placement_conflict.name,
                placement_conflict.location,
                placement_conflict.parent_area
            ) = candidate.proposed_identity
      )
      and not exists (
          select 1
          from public.home_items slug_conflict
          where candidate.proposed_slug is not null
            and slug_conflict.property_id = candidate.property_id
            and slug_conflict.id <> candidate.child_id
            and coalesce(slug_conflict.archived, false) = false
            and lower(slug_conflict.item_slug) = candidate.proposed_slug
            and public.homeos_starter_identity(slug_conflict.location) = candidate.proposed_location
            and public.homeos_starter_identity(slug_conflict.parent_area) = candidate.proposed_parent_area
      )
),
uniquely_resolved as (
    select
        candidate.*,
        count(*) over (
            partition by candidate.property_id, candidate.proposed_identity
        ) as proposed_identity_count,
        case
            when candidate.proposed_slug is null then 1
            else count(*) over (
                partition by
                    candidate.property_id,
                    candidate.proposed_slug,
                    candidate.proposed_location,
                    candidate.proposed_parent_area
            )
        end as proposed_slug_count
    from destination_safe_candidates candidate
)
select child_id, parent_id
from uniquely_resolved
where proposed_identity_count = 1
  and proposed_slug_count = 1;

do $$
declare
    v_admin_id uuid := gen_random_uuid();
    v_nonadmin_id uuid := gen_random_uuid();
    v_property_id uuid;
    v_set jsonb;
    v_set_id uuid;
    v_draft_revision_id uuid;
    v_retired_empty_revision_id uuid;
    v_next_draft_revision_id uuid;
    v_approved_variant_id uuid;
    v_draft_variant_id uuid;
    v_category_id uuid;
    v_family_id uuid;
    v_cycle_template_a text := 'card-deck-cycle-a-' || replace(gen_random_uuid()::text, '-', '');
    v_cycle_template_b text := 'card-deck-cycle-b-' || replace(gen_random_uuid()::text, '-', '');
    v_rejected boolean;
    v_rpc_before_count bigint;
    v_rpc_before_fingerprint text;
    v_rpc_after_count bigint;
    v_rpc_after_fingerprint text;
    v_toilet_id uuid;
    v_unique_child_id uuid;
    v_same_room_child_id uuid;
    v_descendant_candidate_id uuid;
    v_placement_conflict_child_id uuid;
    v_slug_conflict_child_id uuid;
    v_two_parent_conflict_child_id uuid;
    v_ambiguous_child_id uuid;
    v_wrong_child_id uuid;
    v_component_child_id uuid;
    v_explicit_child_id uuid;
    v_second_toilet_id uuid;
    v_wrong_system_parent_id uuid;
    v_wrong_system_child_id uuid;
    v_custom_parent_id uuid;
    v_custom_child_id uuid;
    v_canonical_parent_id uuid;
    v_canonical_child_id uuid;
    v_candidate_count integer;
    v_protected_parent_candidate_count integer;
begin
    insert into auth.users(
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
        v_admin_id, 'authenticated', 'authenticated',
        'homeos-card-decks-admin-' || replace(v_admin_id::text, '-', '') || '@example.invalid',
        '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"HOMEOWNER","full_name":"Card Deck Admin Regression"}'::jsonb, now(), now()
    ), (
        v_nonadmin_id, 'authenticated', 'authenticated',
        'homeos-card-decks-nonadmin-' || replace(v_nonadmin_id::text, '-', '') || '@example.invalid',
        '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"HOMEOWNER","full_name":"Card Deck Nonadmin Regression"}'::jsonb, now(), now()
    );

    update public.profiles set role = 'SUPER_ADMIN' where id = v_admin_id;
    update public.profiles set role = 'HOMEOWNER' where id = v_nonadmin_id;

    perform set_config('request.jwt.claim.sub', v_nonadmin_id::text, true);
    v_rejected := false;
    begin
        perform public.get_super_admin_homeos_card_decks();
    exception when insufficient_privilege then
        v_rejected := true;
    end;
    if not v_rejected then
        raise exception 'Non-admin users must not read Super Admin Card Decks.';
    end if;

    v_rejected := false;
    begin
        perform public.save_admin_homeos_card_set_draft('{}'::jsonb);
    exception when insufficient_privilege then
        v_rejected := true;
    end;
    if not v_rejected then
        raise exception 'Non-admin users must not save Super Admin Card Deck drafts.';
    end if;

    v_rejected := false;
    begin
        perform public.publish_admin_homeos_card_set(gen_random_uuid());
    exception when insufficient_privilege then
        v_rejected := true;
    end;
    if not v_rejected then
        raise exception 'Non-admin users must not publish Super Admin Card Decks.';
    end if;

    v_rejected := false;
    begin
        perform public.archive_admin_homeos_card_set(gen_random_uuid());
    exception when insufficient_privilege then
        v_rejected := true;
    end;
    if not v_rejected then
        raise exception 'Non-admin users must not archive Super Admin Card Decks.';
    end if;

    perform set_config('request.jwt.claim.sub', v_admin_id::text, true);

    select count(*)::bigint,
           md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by item.id), ''))
    into v_rpc_before_count, v_rpc_before_fingerprint
    from public.home_items item;

    insert into public.catalog_category_templates(
        template_key, category_name, status, created_by_user_id, updated_by_user_id
    ) values (
        'card-deck-regression-' || replace(gen_random_uuid()::text, '-', ''),
        'Card Deck Regression', 'approved', v_admin_id, v_admin_id
    ) returning id into v_category_id;

    insert into public.catalog_product_families(
        category_template_id, manufacturer, brand, family_name, status,
        created_by_user_id, updated_by_user_id
    ) values (
        v_category_id, 'Regression Manufacturer', 'Regression Brand',
        'Card Deck Family', 'approved', v_admin_id, v_admin_id
    ) returning id into v_family_id;

    insert into public.catalog_product_variants(
        product_family_id, manufacturer_snapshot, model_number, status,
        created_by_user_id, updated_by_user_id
    ) values (
        v_family_id, 'Regression Manufacturer', 'CARD-DECK-APPROVED-' || replace(gen_random_uuid()::text, '-', ''), 'approved', v_admin_id, v_admin_id
    ) returning id into v_approved_variant_id;

    insert into public.catalog_product_variants(
        product_family_id, manufacturer_snapshot, model_number, status,
        created_by_user_id, updated_by_user_id
    ) values (
        v_family_id, 'Regression Manufacturer', 'CARD-DECK-DRAFT-' || replace(gen_random_uuid()::text, '-', ''), 'draft', v_admin_id, v_admin_id
    ) returning id into v_draft_variant_id;

    -- The mapper must reject before it can delete an existing approved mapping.
    perform public.save_homeos_starter_card_deck_entry(
        'bathroom:toilet', array[v_approved_variant_id], 'unbuilt', null
    );
    v_rejected := false;
    begin
        perform public.save_homeos_starter_card_deck_entry(
            'bathroom:toilet', array[v_draft_variant_id], 'unbuilt', null
        );
    exception when check_violation then
        v_rejected := true;
    end;
    if not v_rejected then
        raise exception 'The bulk starter-card mapper accepted a draft catalog product variant.';
    end if;
    if not exists (
        select 1
        from public.homeos_starter_card_catalog_variants mapping
        where mapping.template_key = 'bathroom:toilet'
          and mapping.product_variant_id = v_approved_variant_id
    ) then
        raise exception 'The bulk starter-card mapper changed approved mappings after rejecting a draft variant.';
    end if;

    v_set := public.save_admin_homeos_card_set_draft(jsonb_build_object(
        'set_key', 'card_deck_regression_' || replace(gen_random_uuid()::text, '-', ''),
        'name', 'Card Deck Regression',
        'description', 'Regression-only pack',
        'members', jsonb_build_array(
            jsonb_build_object('slot_key', 'kitchen_area', 'display_order', 10, 'member_behavior', 'instantiate',
                'target', jsonb_build_object('kind', 'area', 'key', 'kitchen')),
            jsonb_build_object('slot_key', 'kitchen_sink', 'parent_slot_key', 'kitchen_area', 'display_order', 20, 'member_behavior', 'instantiate',
                'target', jsonb_build_object('kind', 'starter_template', 'key', 'kitchen:kitchen_sink')),
            jsonb_build_object('slot_key', 'kitchen_faucet', 'parent_slot_key', 'kitchen_sink', 'display_order', 30, 'member_behavior', 'instantiate',
                'target', jsonb_build_object('kind', 'starter_template', 'key', 'kitchen:kitchen_faucet')),
            jsonb_build_object('slot_key', 'approved_product', 'parent_slot_key', 'kitchen_sink', 'display_order', 40, 'member_behavior', 'recommendation',
                'target', jsonb_build_object('kind', 'catalog_product_variant', 'id', v_approved_variant_id))
        )
    ));
    v_set_id := (v_set->>'id')::uuid;

    perform public.publish_admin_homeos_card_set(v_set_id);

    if not exists (
        select 1 from public.homeos_card_set_revisions revision
        where revision.card_set_id = v_set_id
          and revision.revision_number = 1
          and revision.publication_status = 'published'
    ) then
        raise exception 'A valid Area-rooted Starter Pack did not publish.';
    end if;

    v_rejected := false;
    begin
        update public.homeos_card_set_revision_members
        set display_order = 999
        where id = (
            select member.id
            from public.homeos_card_set_revision_members member
            join public.homeos_card_set_revisions revision on revision.id = member.revision_id
            where revision.card_set_id = v_set_id and revision.revision_number = 1
            order by member.display_order, member.slot_key
            limit 1
        );
    exception when object_not_in_prerequisite_state then
        v_rejected := true;
    end;
    if not v_rejected then
        raise exception 'Published Card Set revision members must be immutable.';
    end if;

    v_rejected := false;
    begin
        update public.homeos_card_set_revisions
        set updated_at = now()
        where card_set_id = v_set_id and revision_number = 1;
    exception when object_not_in_prerequisite_state then
        v_rejected := true;
    end;
    if not v_rejected then
        raise exception 'Published Card Set revisions must be immutable.';
    end if;

    -- Editing the published set creates v2, and an unpublished product must
    -- block publication even though a draft may contain it.
    v_set := public.save_admin_homeos_card_set_draft(jsonb_build_object(
        'id', v_set_id,
        'members', jsonb_build_array(
            jsonb_build_object('slot_key', 'kitchen_area', 'display_order', 10, 'member_behavior', 'instantiate',
                'target', jsonb_build_object('kind', 'area', 'key', 'kitchen')),
            jsonb_build_object('slot_key', 'kitchen_sink', 'parent_slot_key', 'kitchen_area', 'display_order', 20, 'member_behavior', 'instantiate',
                'target', jsonb_build_object('kind', 'starter_template', 'key', 'kitchen:kitchen_sink')),
            jsonb_build_object('slot_key', 'draft_product', 'parent_slot_key', 'kitchen_sink', 'display_order', 30, 'member_behavior', 'recommendation',
                'target', jsonb_build_object('kind', 'catalog_product_variant', 'id', v_draft_variant_id))
        )
    ));
    select revision.id into v_draft_revision_id
    from public.homeos_card_set_revisions revision
    where revision.card_set_id = v_set_id and revision.publication_status = 'draft';

    if (select revision_number from public.homeos_card_set_revisions where id = v_draft_revision_id) <> 2 then
        raise exception 'Editing a published Card Set must create the next numbered draft revision.';
    end if;

    v_rejected := false;
    begin
        perform public.publish_admin_homeos_card_set(v_set_id);
    exception when check_violation then
        v_rejected := true;
    end;
    if not v_rejected then
        raise exception 'Publishing accepted an unapproved product variant.';
    end if;

    update public.catalog_product_variants set status = 'approved' where id = v_draft_variant_id;
    perform public.publish_admin_homeos_card_set(v_set_id);

    if not exists (
        select 1 from public.homeos_card_set_revisions revision
        where revision.card_set_id = v_set_id and revision.revision_number = 1 and revision.publication_status = 'retired'
    ) or not exists (
        select 1 from public.homeos_card_sets card_set
        where card_set.id = v_set_id and card_set.current_published_revision_id = v_draft_revision_id
    ) then
        raise exception 'Publishing v2 must atomically retire v1 and advance the current pointer.';
    end if;

    -- A retired revision remains immutable even when empty, and an UPDATE may
    -- not move a member out of its published revision into an otherwise
    -- mutable draft revision.
    insert into public.homeos_card_set_revisions(
        card_set_id, revision_number, publication_status, created_by_user_id, retired_at
    ) values (
        v_set_id, 3, 'retired', v_admin_id, now()
    ) returning id into v_retired_empty_revision_id;

    v_rejected := false;
    begin
        delete from public.homeos_card_set_revisions
        where id = v_retired_empty_revision_id;
    exception when object_not_in_prerequisite_state then
        v_rejected := true;
    end;
    if not v_rejected then
        raise exception 'Retired Card Set revisions must remain immutable even when empty.';
    end if;

    insert into public.homeos_card_set_revisions(
        card_set_id, revision_number, publication_status, created_by_user_id
    ) values (
        v_set_id, 4, 'draft', v_admin_id
    ) returning id into v_next_draft_revision_id;

    v_rejected := false;
    begin
        update public.homeos_card_set_revision_members
        set revision_id = v_next_draft_revision_id
        where revision_id = v_draft_revision_id
          and slot_key = 'draft_product';
    exception when object_not_in_prerequisite_state then
        v_rejected := true;
    end;
    if not v_rejected then
        raise exception 'A published Card Set member may not be moved into a draft revision.';
    end if;

    perform public.archive_admin_homeos_card_set(v_set_id);
    if not exists (select 1 from public.homeos_card_sets where id = v_set_id and status = 'archived') then
        raise exception 'Archiving a Card Set failed.';
    end if;

    -- Same-revision parent FK, XOR, hierarchy, and cycle defenses are tested
    -- on a disposable draft revision.  No direct member table write can make
    -- an invalid published pack because publish revalidates the full graph.
    insert into public.homeos_card_sets(set_key, name, created_by_user_id, updated_by_user_id)
    values ('card-deck-direct-' || replace(gen_random_uuid()::text, '-', ''), 'Direct Constraint Regression', v_admin_id, v_admin_id)
    returning id into v_set_id;
    insert into public.homeos_card_set_revisions(card_set_id, revision_number, created_by_user_id)
    values (v_set_id, 1, v_admin_id) returning id into v_draft_revision_id;

    v_rejected := false;
    begin
        insert into public.homeos_card_set_revision_members(
            revision_id, slot_key, display_order, member_behavior, area_card_key, starter_template_key
        ) values (v_draft_revision_id, 'xor_bad', 10, 'instantiate', 'kitchen', 'kitchen:kitchen_sink');
    exception when check_violation then
        v_rejected := true;
    end;
    if not v_rejected then raise exception 'Member target XOR accepted two targets.'; end if;

    insert into public.homeos_card_set_revision_members(
        revision_id, slot_key, parent_slot_key, display_order, member_behavior, area_card_key
    ) values (v_draft_revision_id, 'area_root', null, 10, 'instantiate', 'kitchen');
    insert into public.homeos_card_set_revision_members(
        revision_id, slot_key, parent_slot_key, display_order, member_behavior, starter_template_key
    ) values (v_draft_revision_id, 'sink', 'area_root', 20, 'instantiate', 'kitchen:kitchen_sink');
    insert into public.homeos_card_set_revision_members(
        revision_id, slot_key, parent_slot_key, display_order, member_behavior, starter_template_key
    ) values (v_draft_revision_id, 'faucet', 'sink', 30, 'instantiate', 'kitchen:kitchen_faucet');

    v_rejected := false;
    begin
        insert into public.homeos_card_set_revision_members(
            revision_id, slot_key, parent_slot_key, display_order, member_behavior, starter_template_key
        ) values (v_draft_revision_id, 'duplicate_order', 'sink', 30, 'instantiate', 'kitchen:garbage_disposal');
    exception when unique_violation then
        v_rejected := true;
    end;
    if not v_rejected then raise exception 'Member display order must be unique within a revision.'; end if;

    v_rejected := false;
    begin
        insert into public.homeos_card_set_revision_members(
            revision_id, slot_key, parent_slot_key, display_order, member_behavior, starter_template_key
        ) values (v_draft_revision_id, 'cross_revision_parent', 'missing_slot', 40, 'instantiate', 'kitchen:garbage_disposal');
        set constraints homeos_card_set_revision_members_same_revision_parent_fkey immediate;
    exception when foreign_key_violation then
        v_rejected := true;
    end;
    if not v_rejected then raise exception 'Member parent slots must resolve within the same revision.'; end if;

    v_rejected := false;
    begin
        update public.homeos_card_set_revision_members
        set parent_slot_key = 'area_root'
        where revision_id = v_draft_revision_id and slot_key = 'faucet';
        perform public.homeos_validate_card_set_revision_for_publication(v_draft_revision_id);
    exception when check_violation then
        v_rejected := true;
    end;
    if not v_rejected then raise exception 'A component Card Set member may not parent an Area root.'; end if;

    insert into public.homeos_starter_card_templates(
        template_key, room_kind, name, system, category, aliases, placement_tags,
        display_order, readiness_status, active, trade_key, presentation_role, auto_provision
    ) values (
        v_cycle_template_a, 'bathroom', 'Cycle A', 'Plumbing', 'Component', '[]'::jsonb, '[]'::jsonb,
        9901, 'unbuilt', true, 'plumbing', 'component', false
    ), (
        v_cycle_template_b, 'bathroom', 'Cycle B', 'Plumbing', 'Component', '[]'::jsonb, '[]'::jsonb,
        9902, 'unbuilt', true, 'plumbing', 'component', false
    );

    v_rejected := false;
    begin
        insert into public.homeos_card_set_revision_members(
            revision_id, slot_key, parent_slot_key, display_order, member_behavior, starter_template_key
        ) values
            (v_draft_revision_id, 'cycle_a', 'cycle_b', 50, 'instantiate', v_cycle_template_a),
            (v_draft_revision_id, 'cycle_b', 'cycle_a', 60, 'instantiate', v_cycle_template_b);
        perform public.homeos_validate_card_set_revision_for_publication(v_draft_revision_id);
    exception when check_violation then
        v_rejected := true;
    end;
    if not v_rejected then raise exception 'Card Set cycle validation accepted a cycle.'; end if;

    select count(*)::bigint,
           md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by item.id), ''))
    into v_rpc_after_count, v_rpc_after_fingerprint
    from public.home_items item;
    if v_rpc_after_count is distinct from v_rpc_before_count
       or v_rpc_after_fingerprint is distinct from v_rpc_before_fingerprint then
        raise exception 'Card Deck catalog and RPC lifecycle work must not mutate installed HomeOS cards.';
    end if;

    -- The migration-level installed-card guard is complemented by a focused
    -- predicate regression for the sole authorized Toilet Drain attachment.
    perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
    select created_property.property_id into v_property_id
    from public.create_homeowner_first_property(
        'Card Deck Toilet Drain Regression', '1400 Deck Way', null,
        'Testville', 'CA', '91400', 'US', '1400 Deck Way, Testville, CA 91400',
        34.14, -118.14, 'card-deck-toilet-' || replace(gen_random_uuid()::text, '-', ''), 'HOUSE'
    ) created_property limit 1;

    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Plumbing', 'Fixture', 'Bathroom', '', 'Missing Information', 'Installed', false
    ) returning id into v_toilet_id;
    -- A second allowed legacy parent in a different Bathroom exercises the
    -- same-room root shape without converging on the chain row's destination.
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-guest-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Plumbing', 'Equipment', 'Guest Bathroom', '', 'Missing Information', 'Installed', false
    );
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-unique-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Toilet', 'Bathroom', 'Missing Information', 'Installed', false
    ) returning id into v_unique_child_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-same-room-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Guest Bathroom', '', 'Missing Information', 'Installed', false
    ) returning id into v_same_room_child_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-wrong-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Plumbing', 'Component', 'Toilet', 'Bathroom', 'Missing Information', 'Installed', false
    ) returning id into v_wrong_child_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-component-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Component', 'Toilet', 'Bathroom', 'Missing Information', 'Installed', false
    ) returning id into v_component_child_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived, parent_home_item_id
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-explicit-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Equipment', 'Toilet', 'Bathroom', 'Missing Information', 'Installed', false, v_toilet_id
    ) returning id into v_explicit_child_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-wrong-system-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Electrical', 'Fixture', 'Wrong System Bathroom', '', 'Missing Information', 'Installed', false
    ) returning id into v_wrong_system_parent_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-wrong-system-parent-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Toilet', 'Wrong System Bathroom', 'Missing Information', 'Installed', false
    ) returning id into v_wrong_system_child_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-custom-parent-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Plumbing', 'Fixture', 'Custom Parent Bathroom', '', 'Missing Information', 'Installed', false, 'bathroom:shower_tub'
    ) returning id into v_custom_parent_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-custom-parent-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Toilet', 'Custom Parent Bathroom', 'Missing Information', 'Installed', false
    ) returning id into v_custom_child_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-canonical-parent-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Plumbing', 'Fixture', 'Canonical Key Bathroom', '', 'Missing Information', 'Installed', false, 'bathroom:toilet'
    ) returning id into v_canonical_parent_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-canonical-parent-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Toilet', 'Canonical Key Bathroom', 'Missing Information', 'Installed', false
    ) returning id into v_canonical_child_id;

    -- These otherwise matching snapshots are deliberately protected: one
    -- already has a child, one would collide with an active destination, and
    -- one would collide with an active placement-qualified slug.
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-descendant-parent-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Plumbing', 'Equipment', 'Descendant Bathroom', '', 'Missing Information', 'Installed', false
    );
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-descendant-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Descendant Bathroom', '', 'Missing Information', 'Installed', false
    ) returning id into v_descendant_candidate_id;
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived, parent_home_item_id
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-descendant-note-' || replace(gen_random_uuid()::text, '-', ''),
        'Inspection Note', 'Plumbing', 'Component', 'Toilet Drain', 'Descendant Bathroom', 'Missing Information', 'Installed', false, v_descendant_candidate_id
    );

    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-placement-conflict-parent-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Plumbing', 'Equipment', 'Placement Conflict Bathroom', '', 'Missing Information', 'Installed', false
    );
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-placement-conflict-existing-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Toilet', 'Placement Conflict Bathroom', 'Missing Information', 'Installed', false, 'bathroom:toilet_drain'
    );
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-placement-conflict-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Placement Conflict Bathroom', '', 'Missing Information', 'Installed', false
    ) returning id into v_placement_conflict_child_id;

    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-slug-conflict-parent-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Plumbing', 'Equipment', 'Slug Conflict Bathroom', '', 'Missing Information', 'Installed', false
    );
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-slug-shared',
        'Different Drain', 'Plumbing', 'Component', 'Toilet', 'Slug Conflict Bathroom', 'Missing Information', 'Installed', false
    );
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-slug-shared',
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Slug Conflict Bathroom', '', 'Missing Information', 'Installed', false
    ) returning id into v_slug_conflict_child_id;

    -- Both roots below are otherwise valid matches for this same-room
    -- Fixture.  The existing canonical destination conflicts only with the
    -- unkeyed Toilet target.  Parent ambiguity must be counted before that
    -- target collision is considered, so the alternate canonical parent
    -- cannot be guessed.
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-two-parent-legacy-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Plumbing', 'Equipment', 'Two Parent Bathroom', '', 'Missing Information', 'Installed', false
    );
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-two-parent-canonical-' || replace(gen_random_uuid()::text, '-', ''),
        'Alternate Toilet', 'Plumbing', 'Fixture', 'Two Parent Bathroom', '', 'Missing Information', 'Installed', false, 'bathroom:toilet'
    );
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived, starter_template_key
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-two-parent-existing-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Toilet', 'Two Parent Bathroom', 'Missing Information', 'Installed', false, 'bathroom:toilet_drain'
    );
    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-drain-two-parent-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet Drain', 'Drains / Sewer', 'Fixture', 'Two Parent Bathroom', '', 'Missing Information', 'Installed', false
    ) returning id into v_two_parent_conflict_child_id;

    select
        count(*) filter (where child_id in (v_unique_child_id, v_same_room_child_id, v_canonical_child_id))::integer,
        count(*) filter (where child_id in (
            v_wrong_child_id, v_component_child_id, v_explicit_child_id,
            v_wrong_system_child_id, v_custom_child_id,
            v_descendant_candidate_id, v_placement_conflict_child_id, v_slug_conflict_child_id,
            v_two_parent_conflict_child_id
        ))::integer
    into v_candidate_count, v_protected_parent_candidate_count
    from homeos_card_decks_toilet_drain_candidate_regression;
    if v_candidate_count <> 3 or v_protected_parent_candidate_count <> 0 then
        raise exception 'Only exact unkeyed Toilet Drain Fixture snapshots with canonical or exact legacy Toilet parents may attach.';
    end if;

    insert into public.home_items(
        user_id, property_id, item_slug, name, system, category, location, parent_area, status, install_state, archived
    ) values (
        v_admin_id, v_property_id, 'deck-toilet-second-' || replace(gen_random_uuid()::text, '-', ''),
        'Toilet', 'Plumbing', 'Equipment', 'Bathroom', '', 'Missing Information', 'Installed', false
    ) returning id into v_second_toilet_id;
    -- The formerly unique chain Fixture is now ambiguous; creating a second
    -- identical active Fixture would itself violate placement identity.
    v_ambiguous_child_id := v_unique_child_id;

    select count(*)::integer into v_candidate_count
    from homeos_card_decks_toilet_drain_candidate_regression
    where child_id in (v_unique_child_id, v_ambiguous_child_id);

    -- The unique row became ambiguous after the second Toilet was inserted,
    -- so neither it nor the explicit/wrong rows may be a candidate.  This is
    -- the conservative migration behavior for real legacy data.
    if v_candidate_count <> 0
       or exists (
            select 1
            from homeos_card_decks_toilet_drain_candidate_regression
            where child_id in (
                v_unique_child_id, v_ambiguous_child_id, v_wrong_child_id,
                v_component_child_id, v_explicit_child_id, v_wrong_system_child_id,
                v_custom_child_id, v_descendant_candidate_id,
                v_placement_conflict_child_id, v_slug_conflict_child_id,
                v_two_parent_conflict_child_id
            )
       ) then
        raise exception 'Toilet Drain backfill predicate would attach ambiguous, wrong, or explicit rows.';
    end if;

end;
$$;

rollback;
