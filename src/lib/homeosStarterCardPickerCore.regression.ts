import { filterHomeOSStarterCardChoices, homeOSStarterCardGroups } from './homeosStarterCardPickerCore';
import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';

const cards = [
    card('bathroom:shower_valve', 'bathroom', 'Shower Valve', ['Shower Mixer'], 10),
    card('bathroom:shower_trim', 'bathroom', 'Shower Trim', ['Shower Control Trim'], 11),
    card('bathroom:tub_shower_trim', 'bathroom', 'Tub & Shower Trim', ['Tub and Shower Trim'], 12),
    card('kitchen:kitchen_faucet', 'kitchen', 'Kitchen Faucet', ['Sink Faucet'], 20),
    card('whole_home:main_water_shutoff', 'whole_home', 'Main Water Shutoff', ['Front Yard Main Water Valve'], 5, ['whole_home', 'front_yard', 'basement', 'garage', 'custom']),
    card('whole_home:smart_water_shutoff', 'whole_home', 'Smart Water Shutoff', ['Smart Water Monitor and Shutoff', 'Automatic Shutoff'], 10),
];

assert(homeOSStarterCardGroups(cards).some((group) => group.key === 'whole home' && group.label === 'Whole Home'), 'Location-neutral archetypes must have a readable Whole Home Deck group.');
for (const query of ['smart', 'water', 'shutoff']) {
    assert(filterHomeOSStarterCardChoices(cards, query).some((entry) => entry.templateKey === 'whole_home:smart_water_shutoff'), `Add from Deck search for “${query}” must find Smart Water Shutoff.`);
}
assert(filterHomeOSStarterCardChoices(cards, 'shower valve', 'bathroom')[0]?.templateKey === 'bathroom:shower_valve', 'A Shower Valve archetype must remain selectable for placement in an arbitrary user-selected container.');
assert(filterHomeOSStarterCardChoices(cards, 'tub shower trim', 'bathroom')[0]?.templateKey === 'bathroom:tub_shower_trim', 'Tub & Shower Trim must be independently searchable from Shower Valve.');
assert(filterHomeOSStarterCardChoices(cards, 'front yard main water valve')[0]?.templateKey === 'whole_home:main_water_shutoff', 'Existing shutoff terminology must find the reusable neutral archetype without forcing its placement.');
assert(filterHomeOSStarterCardChoices(cards, '', 'basement').map((entry) => entry.templateKey).includes('whole_home:main_water_shutoff'), 'Main Water Shutoff must be selectable for an observed Basement placement.');

console.log('HomeOS Add from Deck picker regression checks passed.');

function card(templateKey: string, roomKind: string, name: string, aliases: string[], displayOrder: number, placementTags: string[] = []): HomeOSStarterCardChoice {
    return { templateKey, shortCode: '', roomKind, placementTags, name, system: 'Plumbing', category: 'Equipment', parentTemplateKey: null, aliases, displayOrder };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
