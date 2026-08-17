import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(
    process.cwd(),
    'supabase/migrations/20260817150000_maintenance_wizard_electrical_deck.sql'
), 'utf8');

const electricalTemplateKeys = [
    'electrical_whole_home:main_electrical_panel',
    'electrical_whole_home:electrical_subpanel',
    'electrical_exterior:meter_service_entrance',
    'electrical_living_room:receptacle_outlet',
    'electrical_whole_home:gfci_afci_protection',
    'electrical_living_room:switch_dimmer',
    'electrical_living_room:interior_light_fixture',
    'electrical_exterior:exterior_light_fixture',
    'electrical_living_room:ceiling_fan',
    'electrical_bathroom:bathroom_exhaust_fan',
    'electrical_hall:smoke_carbon_monoxide_alarm',
    'electrical_exterior:doorbell_low_voltage',
    'electrical_kitchen:dedicated_electrical_circuit',
    'electrical_garage:ev_charger',
    'electrical_whole_home:whole_home_surge_protector',
    'electrical_garage:electric_heater',
    'electrical_garage:generator_transfer_switch',
];

for (const templateKey of electricalTemplateKeys) {
    assert(migration.includes(`'${templateKey}'`), `Electrical Deck is missing ${templateKey}.`);
}

assert(
    migration.includes('public.company_sales_context_matches_client_home(')
    && migration.includes('public.homeos_can_read_provider_assigned_items('),
    'Maintenance writes must accept only a valid assigned Sales or Tech context.'
);
assert(
    migration.includes("raise exception 'Maintenance changes require an assigned company job or sales visit.'"),
    'Unassigned provider maintenance writes need an explicit server-side denial.'
);
assert(
    migration.includes("'provider_homeos_maintenance_create'")
    && migration.includes("'provider_homeos_maintenance_update'")
    && migration.includes("'provider_homeos_maintenance_complete'"),
    'Provider maintenance create, edit, and completion must remain auditable.'
);
assert(
    !/insert\s+into\s+public\.home_items/i.test(migration),
    'Electrical Deck archetypes must not auto-install or claim customer equipment.'
);
assert(
    migration.includes('placement_tags') && migration.includes("'[\"whole_home\",\"kitchen\",\"bathroom\",\"exterior\",\"garage\"]'::jsonb"),
    'Electrical placement/search metadata must remain extensible and location-neutral.'
);

console.log('Maintenance Wizard and Electrical Deck migration regression checks passed.');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
