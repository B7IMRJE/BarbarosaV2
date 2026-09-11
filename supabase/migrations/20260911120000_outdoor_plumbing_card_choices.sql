-- Optional outdoor plumbing archetypes. These are choices, never evidence of
-- installed equipment. Existing home records and published starter packs stay intact.
begin;

create temporary table outdoor_catalog_home_guard on commit drop as
select count(*) as row_count,
       md5(coalesce(string_agg(to_jsonb(i)::text, E'\n' order by i.id), '')) as fingerprint
from public.home_items i;

with outdoor_card(template_key, name, system, category, aliases, display_order) as (
    values
    ('exterior:water_meter', 'Water Meter', 'Plumbing', 'Equipment', '["Domestic Water Meter"]'::jsonb, 10),
    ('exterior:water_pressure_regulator', 'Water Pressure Regulator', 'Plumbing', 'Equipment', '["Pressure Reducing Valve","PRV","Pressure Regulator"]'::jsonb, 20),
    ('exterior:hose_bibb', 'Outdoor Hose Bibb', 'Plumbing', 'Fixture', '["Front Yard Hose Bibbs","Back Yard Hose Bibbs","Front Yard Hose Bib","Back Yard Hose Bib","Outdoor Faucet","Outdoor Spigot"]'::jsonb, 30),
    ('exterior:vacuum_breaker', 'Vacuum Breaker', 'Plumbing', 'Equipment', '["Hose Connection Vacuum Breaker","Hose Bibb Vacuum Breaker","Screw-on Vacuum Breaker"]'::jsonb, 40),
    ('exterior:hose_bibb_with_vacuum_breaker', 'Hose Bibb with Vacuum Breaker', 'Plumbing', 'Fixture', '["Hose Bib with Vacuum Breaker","Outdoor Faucet with Vacuum Breaker"]'::jsonb, 50),
    ('exterior:irrigation_backflow_preventer', 'Irrigation Backflow Preventer', 'Irrigation', 'Equipment', '["Backflow Preventer","Pressure Vacuum Breaker","Irrigation Vacuum Breaker","PVB"]'::jsonb, 60),
    ('exterior:irrigation_system', 'Irrigation System', 'Irrigation', 'Equipment', '["Irrigation Front Yard","Irrigation Back Yard","Front Yard Irrigation","Back Yard Irrigation","Irrigation Supply"]'::jsonb, 70),
    ('exterior:irrigation_shutoff', 'Irrigation Shutoff Valve', 'Irrigation', 'Equipment', '["Irrigation Isolation Valve","Sprinkler Shutoff Valve"]'::jsonb, 80),
    ('exterior:irrigation_valve_box', 'Irrigation Valve Box', 'Irrigation', 'Equipment', '["Valve Box","Sprinkler Valve Box"]'::jsonb, 90),
    ('exterior:irrigation_zone_valve', 'Irrigation Zone Valve', 'Irrigation', 'Equipment', '["Sprinkler Valve","Irrigation Solenoid Valve"]'::jsonb, 100),
    ('exterior:irrigation_controller', 'Irrigation Controller', 'Irrigation', 'Equipment', '["Sprinkler Timer","Irrigation Timer"]'::jsonb, 110),
    ('exterior:sprinkler_head', 'Sprinkler Head', 'Irrigation', 'Fixture', '["Pop-up Sprinkler","Lawn Sprinkler"]'::jsonb, 120),
    ('exterior:drip_irrigation', 'Drip Irrigation', 'Irrigation', 'Equipment', '["Drip Line","Drip Tubing","Drip Emitter"]'::jsonb, 130),
    ('exterior:water_softener', 'Water Softener', 'Water Quality', 'Equipment', '["Outdoor Water Softener","Softener System"]'::jsonb, 140),
    ('exterior:main_cleanout', 'Main Cleanout', 'Drains / Sewer', 'Fixture', '["Front Yard Main Cleanout","Back Yard Main Cleanout","Sewer Cleanout","Main Sewer Cleanout"]'::jsonb, 150)
)
insert into public.homeos_starter_card_templates (
    template_key, room_kind, name, system, category, parent_template_key,
    aliases, placement_tags, display_order, readiness_status, active,
    trade_key, presentation_role, auto_provision
)
select template_key, 'exterior', name, system, category, null,
       aliases, '["exterior","front_yard","back_yard","side_yard","patio","outdoor_mechanical"]'::jsonb,
       display_order, 'unbuilt', true, 'plumbing', 'container', false
from outdoor_card
on conflict (template_key) do update
set name = excluded.name, system = excluded.system, category = excluded.category,
    parent_template_key = null, aliases = excluded.aliases,
    placement_tags = excluded.placement_tags, display_order = excluded.display_order,
    active = true, trade_key = 'plumbing', presentation_role = 'container',
    auto_provision = false, updated_at = now();

-- Reuse the existing filter archetype. Placement tags expose optional choices;
-- they do not move the filter out of a recorded location or seed any outdoor rows.
update public.homeos_starter_card_templates t
set placement_tags = (
    select jsonb_agg(distinct value order by value)
    from jsonb_array_elements(coalesce(t.placement_tags, '[]'::jsonb)
        || '["garage","utility_room","mechanical_room","exterior","front_yard","back_yard","side_yard","outdoor_mechanical"]'::jsonb)
), updated_at = now()
where t.template_key = 'garage:whole_home_filter';

-- Main water shutoff remains its existing location-neutral archetype. Do not
-- create a second main valve or assign a presumed Front Yard/Garage location.
do $$
begin
    if exists (
        select 1 from outdoor_catalog_home_guard g
        cross join (
            select count(*) as row_count, md5(coalesce(string_agg(to_jsonb(i)::text, E'\n' order by i.id), '')) as fingerprint
            from public.home_items i
        ) after_update
        where (g.row_count, g.fingerprint) is distinct from (after_update.row_count, after_update.fingerprint)
    ) then
        raise exception 'Outdoor catalog update must not change any home records';
    end if;
end;
$$;

commit;
