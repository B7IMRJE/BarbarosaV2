-- Add a suggestion-only Master Bathroom deck, explicit shower trim taxonomy,
-- and a reusable Main Water Shutoff archetype whose placement is selected by
-- the person observing the home. Existing installed rows and locations are not
-- updated or moved by this migration.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.homeos_starter_card_templates') is null
       or to_regclass('public.homeos_starter_card_catalog_variants') is null
       or to_regclass('public.catalog_product_variants') is null
       or to_regclass('public.catalog_product_families') is null
       or to_regprocedure('public.homeos_starter_identity(text)') is null
       or to_regprocedure('public.homeos_complete_room_kind(text)') is null
       or to_regprocedure('public.homeos_property_trade_enabled(uuid,text)') is null then
        raise exception 'Master Bathroom and neutral shutoff templates require the complete, trade-scoped HomeOS Deck.';
    end if;
end;
$$;

with starter_seed(
    template_key, room_kind, name, system, category, parent_template_key,
    aliases, placement_tags, display_order, trade_key
) as (
    values
    ('bathroom:shower_trim', 'bathroom', 'Shower Trim', 'Plumbing', 'Component', 'bathroom:shower_tub',
        '["Shower Control Trim","Shower Valve Trim"]'::jsonb, '["bathroom","master_bathroom","shower"]'::jsonb, 125, 'plumbing'),
    ('bathroom:tub_shower_trim', 'bathroom', 'Tub & Shower Trim', 'Plumbing', 'Component', 'bathroom:shower_tub',
        '["Tub and Shower Trim","Tub / Shower Trim","Tub-Shower Trim"]'::jsonb, '["bathroom","master_bathroom","shower","tub"]'::jsonb, 126, 'plumbing'),

    ('master_bathroom:roman_deck_mount_tub', 'master_bathroom', 'Roman / Deck-Mount Tub', 'Plumbing', 'Fixture', null,
        '["Roman Tub","Deck-Mount Tub"]'::jsonb, '["master_bathroom","tub"]'::jsonb, 1000, 'plumbing'),
    ('master_bathroom:freestanding_soaking_tub', 'master_bathroom', 'Freestanding / Soaking Tub', 'Plumbing', 'Fixture', null,
        '["Freestanding Tub","Soaking Tub"]'::jsonb, '["master_bathroom","tub"]'::jsonb, 1010, 'plumbing'),
    ('master_bathroom:standalone_walk_in_shower', 'master_bathroom', 'Standalone / Walk-In Shower', 'Plumbing', 'Fixture', null,
        '["Standalone Shower","Walk-In Shower"]'::jsonb, '["master_bathroom","shower"]'::jsonb, 1020, 'plumbing'),
    ('master_bathroom:shower_enclosure_door', 'master_bathroom', 'Shower Enclosure / Door', 'Plumbing', 'Fixture', null,
        '["Shower Enclosure","Shower Door"]'::jsonb, '["master_bathroom","shower"]'::jsonb, 1030, 'plumbing'),
    ('master_bathroom:double_vanity', 'master_bathroom', 'Double Vanity', 'Plumbing', 'Fixture', null,
        '["Dual Vanity","Two-Sink Vanity"]'::jsonb, '["master_bathroom","vanity","sink"]'::jsonb, 1040, 'plumbing'),
    ('master_bathroom:bidet', 'master_bathroom', 'Bidet', 'Plumbing', 'Fixture', null,
        '["Bidet Fixture"]'::jsonb, '["master_bathroom","toilet"]'::jsonb, 1050, 'plumbing'),
    ('master_bathroom:thermostatic_shower_valve', 'master_bathroom', 'Thermostatic Shower Valve', 'Plumbing', 'Component', 'master_bathroom:standalone_walk_in_shower',
        '["Thermostatic Valve"]'::jsonb, '["master_bathroom","shower"]'::jsonb, 1100, 'plumbing'),
    ('master_bathroom:rain_shower_head', 'master_bathroom', 'Rain Shower Head', 'Plumbing', 'Fixture', 'master_bathroom:standalone_walk_in_shower',
        '["Rain Shower"]'::jsonb, '["master_bathroom","shower"]'::jsonb, 1110, 'plumbing'),
    ('master_bathroom:hand_shower', 'master_bathroom', 'Hand Shower', 'Plumbing', 'Fixture', 'master_bathroom:standalone_walk_in_shower',
        '["Handheld Shower","Handheld Shower Head"]'::jsonb, '["master_bathroom","shower"]'::jsonb, 1120, 'plumbing'),
    ('master_bathroom:body_sprays', 'master_bathroom', 'Body Sprays', 'Plumbing', 'Fixture', 'master_bathroom:standalone_walk_in_shower',
        '["Body Jets","Shower Body Sprays"]'::jsonb, '["master_bathroom","shower"]'::jsonb, 1130, 'plumbing'),
    ('master_bathroom:bidet_seat', 'master_bathroom', 'Bidet Seat', 'Plumbing', 'Component', 'bathroom:toilet',
        '["Washlet Seat"]'::jsonb, '["master_bathroom","toilet"]'::jsonb, 1140, 'plumbing'),
    ('master_bathroom:roman_tub_filler', 'master_bathroom', 'Roman Tub Filler', 'Plumbing', 'Fixture', 'master_bathroom:roman_deck_mount_tub',
        '["Deck-Mount Tub Filler"]'::jsonb, '["master_bathroom","tub"]'::jsonb, 1150, 'plumbing'),
    ('master_bathroom:freestanding_tub_filler', 'master_bathroom', 'Freestanding Tub Filler', 'Plumbing', 'Fixture', 'master_bathroom:freestanding_soaking_tub',
        '["Floor-Mount Tub Filler"]'::jsonb, '["master_bathroom","tub"]'::jsonb, 1160, 'plumbing'),

    ('whole_home:main_water_shutoff', 'whole_home', 'Main Water Shutoff', 'Plumbing', 'Equipment', null,
        '["Whole Home Water Shutoff","Main Water Shutoff Valve","Main Water Valve","Front Yard Main Water Valve"]'::jsonb,
        '["whole_home","basement","crawlspace","garage","utility_room","mechanical_room","interior_closet","exterior","front_yard","back_yard","side_yard","custom"]'::jsonb,
        5, 'plumbing')
)
insert into public.homeos_starter_card_templates(
    template_key, room_kind, name, system, category, parent_template_key,
    aliases, placement_tags, display_order, readiness_status, active, trade_key
)
select
    seed.template_key, seed.room_kind, seed.name, seed.system, seed.category,
    seed.parent_template_key, seed.aliases, seed.placement_tags,
    seed.display_order, 'unbuilt', true, seed.trade_key
from starter_seed seed
on conflict (template_key) do update
set room_kind = excluded.room_kind,
    name = excluded.name,
    system = excluded.system,
    category = excluded.category,
    parent_template_key = excluded.parent_template_key,
    aliases = excluded.aliases,
    placement_tags = excluded.placement_tags,
    display_order = excluded.display_order,
    active = true,
    trade_key = excluded.trade_key,
    updated_at = now();

-- Move existing parent-level trim mappings to the new exposed-trim archetype.
-- A tub/spout description is required for Tub & Shower Trim; otherwise the
-- product remains Shower Trim. This changes only the Deck relationship, not
-- the product record, offering, installed item, media, or history.
with mapped_trim as (
    select
        link.product_variant_id,
        case
            when lower(concat_ws(' ',
                variant.variant_name,
                variant.description,
                family.description,
                variant.specifications->>'product_type',
                variant.specifications->>'application',
                variant.specifications->>'configuration',
                variant.specifications->>'tub_spout'
            )) ~ '(tub spout|bathtub spout)'
              or lower(btrim(coalesce(variant.specifications->>'tub_spout_included', ''))) ~ '^(yes|true|included)([^a-z]|$)'
                then 'bathroom:tub_shower_trim'
            else 'bathroom:shower_trim'
        end as target_template_key,
        link.created_by_user_id
    from public.homeos_starter_card_catalog_variants link
    join public.catalog_product_variants variant on variant.id = link.product_variant_id
    join public.catalog_product_families family on family.id = variant.product_family_id
    where link.template_key = 'bathroom:shower_tub'
      and (
          lower(concat_ws(' ',
              variant.variant_name,
              variant.description,
              family.description,
              variant.specifications->>'product_type',
              variant.specifications->>'application',
              variant.specifications->>'configuration',
              variant.specifications->>'tub_spout'
          )) ~ '(^|[^a-z])trim([^a-z]|$)'
          or lower(btrim(coalesce(variant.specifications->>'trim_included', ''))) ~ '^(yes|true|included)([^a-z]|$)'
      )
)
insert into public.homeos_starter_card_catalog_variants(
    template_key, product_variant_id, created_by_user_id
)
select target_template_key, product_variant_id, created_by_user_id
from mapped_trim
on conflict (template_key, product_variant_id) do nothing;

-- Explicitly verified trim + rough-in packages may also appear under the
-- concealed Shower Valve archetype. Text such as "with valve" is not enough;
-- the structured rough-in field must affirm inclusion.
insert into public.homeos_starter_card_catalog_variants(
    template_key, product_variant_id, created_by_user_id
)
select 'bathroom:shower_valve', link.product_variant_id, link.created_by_user_id
from public.homeos_starter_card_catalog_variants link
join public.catalog_product_variants variant on variant.id = link.product_variant_id
where link.template_key in ('bathroom:shower_trim', 'bathroom:tub_shower_trim')
  and lower(btrim(coalesce(variant.specifications->>'rough_in_valve_included', ''))) ~ '^(yes|true|included)([^a-z]|$)'
on conflict (template_key, product_variant_id) do nothing;

delete from public.homeos_starter_card_catalog_variants legacy
where legacy.template_key = 'bathroom:shower_tub'
  and exists (
      select 1
      from public.homeos_starter_card_catalog_variants migrated
      where migrated.product_variant_id = legacy.product_variant_id
        and migrated.template_key in ('bathroom:shower_trim', 'bathroom:tub_shower_trim')
  );

-- Exposed-trim products remain off Shower Valve unless a structured field
-- explicitly verifies that the concealed rough-in valve is part of the package.
delete from public.homeos_starter_card_catalog_variants valve_link
using public.catalog_product_variants variant
where valve_link.template_key = 'bathroom:shower_valve'
  and variant.id = valve_link.product_variant_id
  and exists (
      select 1
      from public.homeos_starter_card_catalog_variants trim_link
      where trim_link.product_variant_id = valve_link.product_variant_id
        and trim_link.template_key in ('bathroom:shower_trim', 'bathroom:tub_shower_trim')
  )
  and lower(btrim(coalesce(variant.specifications->>'rough_in_valve_included', ''))) !~ '^(yes|true|included)([^a-z]|$)';

-- Enforce the taxonomy on every future mapping path, including the visual Deck
-- editor and helper RPC. Exposed trim cannot masquerade as a concealed valve;
-- Tub & Shower Trim additionally requires a verified tub-spout configuration.
create or replace function public.enforce_homeos_shower_trim_mapping()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_product_text text;
    v_specifications jsonb;
    v_is_trim boolean;
    v_is_tub_shower_trim boolean;
    v_has_verified_rough_in boolean;
begin
    if new.template_key not in (
        'bathroom:shower_trim',
        'bathroom:tub_shower_trim',
        'bathroom:shower_valve'
    ) then
        return new;
    end if;

    select
        lower(concat_ws(' ',
            variant.variant_name,
            variant.description,
            family.description,
            variant.specifications->>'product_type',
            variant.specifications->>'application',
            variant.specifications->>'configuration',
            variant.specifications->>'tub_spout'
        )),
        coalesce(variant.specifications, '{}'::jsonb)
    into v_product_text, v_specifications
    from public.catalog_product_variants variant
    join public.catalog_product_families family on family.id = variant.product_family_id
    where variant.id = new.product_variant_id;

    if not found then raise exception 'Mapped catalog product was not found.'; end if;

    v_is_trim := v_product_text ~ '(^|[^a-z])trim([^a-z]|$)'
        or lower(btrim(coalesce(v_specifications->>'trim_included', ''))) ~ '^(yes|true|included)([^a-z]|$)';
    v_is_tub_shower_trim := v_product_text ~ '(tub spout|bathtub spout)'
        or lower(btrim(coalesce(v_specifications->>'tub_spout_included', ''))) ~ '^(yes|true|included)([^a-z]|$)';
    v_has_verified_rough_in := lower(btrim(coalesce(v_specifications->>'rough_in_valve_included', ''))) ~ '^(yes|true|included)([^a-z]|$)';

    if new.template_key = 'bathroom:tub_shower_trim' and (not v_is_trim or not v_is_tub_shower_trim) then
        raise exception 'Tub & Shower Trim requires verified exposed trim with a tub-spout configuration.';
    end if;
    if new.template_key = 'bathroom:shower_trim' and (not v_is_trim or v_is_tub_shower_trim) then
        raise exception 'Use Shower Trim only for exposed trim without a tub-spout configuration.';
    end if;
    if new.template_key = 'bathroom:shower_valve' and v_is_trim and not v_has_verified_rough_in then
        raise exception 'Trim-only products cannot be mapped to Shower Valve without a verified included rough-in valve.';
    end if;

    return new;
end;
$$;

drop trigger if exists enforce_homeos_shower_trim_mapping_trigger
    on public.homeos_starter_card_catalog_variants;
create trigger enforce_homeos_shower_trim_mapping_trigger
before insert or update of template_key, product_variant_id
on public.homeos_starter_card_catalog_variants
for each row execute function public.enforce_homeos_shower_trim_mapping();

revoke all on function public.enforce_homeos_shower_trim_mapping() from public, anon, authenticated;

create or replace function public.homeos_is_master_bathroom(p_area_name text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select public.homeos_starter_identity(p_area_name)
        ~ '(^| )(master bath|master bathroom|primary bath|primary bathroom)( |$)';
$$;

create or replace function public.provision_complete_room_starter_cards(p_area_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_area public.home_items%rowtype;
    v_template public.homeos_starter_card_templates%rowtype;
    v_parent_name text;
    v_slug text;
    v_base_slug text;
    v_suffix integer;
    v_created integer := 0;
    v_inserted integer := 0;
    v_existing_id uuid;
    v_is_master_bathroom boolean := false;
begin
    select area.* into v_area
    from public.home_items area
    where area.id = p_area_id
      and lower(btrim(area.category)) = 'area'
      and coalesce(area.archived, false) = false
      and nullif(btrim(coalesce(area.parent_area, '')), '') is null
    for update;

    if not found or public.homeos_complete_room_kind(v_area.name) is null then return 0; end if;
    v_is_master_bathroom := public.homeos_is_master_bathroom(v_area.name);

    for v_template in
        select template.*
        from public.homeos_starter_card_templates template
        where template.active
          and public.homeos_property_trade_enabled(v_area.property_id, template.trade_key)
          and (
              template.room_kind = public.homeos_complete_room_kind(v_area.name)
              or (
                  v_is_master_bathroom
                  and (
                      template.room_kind = 'master_bathroom'
                      or template.template_key in (
                          'electrical_bathroom:bathroom_exhaust_fan',
                          'electrical_living_room:interior_light_fixture'
                      )
                  )
              )
          )
        order by
            case
                when template.room_kind = 'bathroom' then 0
                when template.room_kind = 'master_bathroom' then 1
                else 2
            end,
            template.display_order,
            template.name
    loop
        v_parent_name := null;
        if v_template.parent_template_key is not null then
            select parent.name into v_parent_name
            from public.home_items parent
            join public.homeos_starter_card_templates parent_template
              on parent_template.template_key = v_template.parent_template_key
            where parent.property_id = v_area.property_id
              and coalesce(parent.archived, false) = false
              and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_area.name)
              and nullif(btrim(coalesce(parent.parent_area, '')), '') is null
              and public.homeos_starter_identity(parent.name) in (
                  select public.homeos_starter_identity(value)
                  from jsonb_array_elements_text(parent_template.aliases || jsonb_build_array(parent_template.name)) value
              )
            order by parent.created_at, parent.id
            limit 1;
        end if;

        perform pg_advisory_xact_lock(hashtextextended(
            v_area.property_id::text || '|' || public.homeos_item_placement_identity(
                v_template.system,
                v_template.category,
                v_template.name,
                case when v_template.parent_template_key is null then v_area.name else v_parent_name end,
                case when v_template.parent_template_key is null then '' else v_area.name end
            ),
            0
        ));

        v_existing_id := null;
        select item.id into v_existing_id
        from public.home_items item
        where item.property_id = v_area.property_id
          and lower(btrim(item.category)) <> 'area'
          and coalesce(item.archived, false) = false
          and public.homeos_starter_identity(item.name) in (
              select public.homeos_starter_identity(value)
              from jsonb_array_elements_text(v_template.aliases || jsonb_build_array(v_template.name)) value
          )
          and (
              (
                  v_template.parent_template_key is null
                  and public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_area.name)
                  and nullif(btrim(coalesce(item.parent_area, '')), '') is null
              )
              or (
                  v_template.parent_template_key is not null
                  and (
                      (
                          public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_area.name)
                          and nullif(btrim(coalesce(item.parent_area, '')), '') is null
                      )
                      or public.homeos_starter_identity(item.parent_area) = public.homeos_starter_identity(v_area.name)
                  )
              )
          )
        order by item.created_at, item.id
        limit 1;

        if v_existing_id is not null then
            update public.home_items item
            set starter_template_key = v_template.template_key
            where item.id = v_existing_id
              and item.starter_template_key is null;
            continue;
        end if;

        v_base_slug := regexp_replace(lower(v_area.name || '-' || v_template.name), '[^a-z0-9]+', '-', 'g');
        v_base_slug := trim(both '-' from v_base_slug);
        v_slug := v_base_slug;
        v_suffix := 2;
        while exists (
            select 1 from public.home_items item
            where item.property_id = v_area.property_id and lower(item.item_slug) = lower(v_slug)
        ) loop
            v_slug := v_base_slug || '-' || v_suffix::text;
            v_suffix := v_suffix + 1;
        end loop;

        insert into public.home_items(
            user_id, property_id, item_slug, name, system, category,
            location, parent_area, status, install_state, archived,
            starter_template_key
        ) values (
            v_area.user_id,
            v_area.property_id,
            v_slug,
            v_template.name,
            v_template.system,
            v_template.category,
            case when v_template.parent_template_key is null then v_area.name else v_parent_name end,
            case when v_template.parent_template_key is null then '' else v_area.name end,
            'Missing Information',
            case
                when v_is_master_bathroom
                  or v_template.template_key in ('bathroom:shower_trim', 'bathroom:tub_shower_trim')
                    then 'Unknown'
                else 'Installed'
            end,
            false,
            v_template.template_key
        )
        on conflict do nothing;

        get diagnostics v_inserted = row_count;
        v_created := v_created + v_inserted;
    end loop;

    return v_created;
end;
$$;

revoke all on function public.homeos_is_master_bathroom(text) from public, anon, authenticated;

comment on function public.homeos_is_master_bathroom(text) is
    'Recognizes Master/Primary Bathroom areas without changing the general bathroom room-kind mapping.';

comment on function public.provision_complete_room_starter_cards(uuid) is
    'Idempotently fills enabled-trade starter cards per placement. Master Bathroom cards and trim archetypes remain unconfirmed suggestions.';

-- Existing Master/Primary Bathroom areas receive the same inactive suggestions
-- now. The function preserves every matching installed row and its history,
-- and fills only missing placement-scoped cards.
do $$
declare
    v_area_id uuid;
begin
    for v_area_id in
        select area.id
        from public.home_items area
        where lower(btrim(area.category)) = 'area'
          and coalesce(area.archived, false) = false
          and nullif(btrim(coalesce(area.parent_area, '')), '') is null
          and public.homeos_is_master_bathroom(area.name)
        order by area.id
    loop
        perform public.provision_complete_room_starter_cards(v_area_id);
    end loop;
end;
$$;

commit;
