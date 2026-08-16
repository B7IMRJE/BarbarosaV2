import { filterHomeOSStarterCardChoices, homeOSStarterCardGroups } from './homeosStarterCardPickerCore';
import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';

const cards = [
    card('bathroom:shower_valve', 'bathroom', 'Shower Valve', ['Shower Mixer'], 10),
    card('kitchen:kitchen_faucet', 'kitchen', 'Kitchen Faucet', ['Sink Faucet'], 20),
    card('whole_home:smart_water_shutoff', 'whole_home', 'Smart Water Shutoff', ['Smart Water Monitor and Shutoff', 'Automatic Shutoff'], 10),
];

assert(homeOSStarterCardGroups(cards).some((group) => group.key === 'whole home' && group.label === 'Whole Home'), 'Location-neutral archetypes must have a readable Whole Home Deck group.');
for (const query of ['smart', 'water', 'shutoff']) {
    assert(filterHomeOSStarterCardChoices(cards, query).map((entry) => entry.templateKey).join(',') === 'whole_home:smart_water_shutoff', `Add from Deck search for “${query}” must find Smart Water Shutoff.`);
}
assert(filterHomeOSStarterCardChoices(cards, 'shower valve', 'bathroom')[0]?.templateKey === 'bathroom:shower_valve', 'A Shower Valve archetype must remain selectable for placement in an arbitrary user-selected container.');

console.log('HomeOS Add from Deck picker regression checks passed.');

function card(templateKey: string, roomKind: string, name: string, aliases: string[], displayOrder: number): HomeOSStarterCardChoice {
    return { templateKey, shortCode: '', roomKind, name, system: 'Plumbing', category: 'Equipment', parentTemplateKey: null, aliases, displayOrder };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
