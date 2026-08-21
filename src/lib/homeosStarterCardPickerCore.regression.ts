import {
    filterHomeOSStarterCardChoices,
    homeOSStarterCardGroups,
    homeOSStarterCardForInstalledContainer,
    homeOSStarterCardForInstalledComponent,
    homeOSStarterComponentCardsForContainer,
} from './homeosStarterCardPickerCore';
import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';

const cards = [
    card('bathroom:shower_valve', 'bathroom', 'Shower Valve', ['Shower Mixer'], 10),
    card('bathroom:shower_trim', 'bathroom', 'Shower Trim', ['Shower Control Trim'], 11),
    card('bathroom:tub_shower_trim', 'bathroom', 'Tub & Shower Trim', ['Tub and Shower Trim'], 12),
    card('kitchen:kitchen_faucet', 'kitchen', 'Kitchen Faucet', ['Sink Faucet'], 20),
    card('whole_home:main_water_shutoff', 'whole_home', 'Main Water Shutoff', ['Front Yard Main Water Valve'], 5, ['whole_home', 'front_yard', 'basement', 'garage', 'custom']),
    card('whole_home:smart_water_shutoff', 'whole_home', 'Smart Water Shutoff', ['Smart Water Monitor and Shutoff', 'Automatic Shutoff'], 10),
];

const componentDeck = [
    card('kitchen:kitchen_counter', 'kitchen', 'Kitchen Counter', [], 1, [], null, 'container'),
    card('kitchen:instant_hot', 'kitchen', 'Instant Hot Water Dispenser', [], 2, [], 'kitchen:kitchen_counter', 'component'),
    card('kitchen:ro_system', 'kitchen', 'Reverse Osmosis System', [], 3, [], 'kitchen:kitchen_counter', 'component'),
    card('kitchen:ro_membrane', 'kitchen', 'RO Membrane', [], 4, [], 'kitchen:ro_system', 'component'),
    card('kitchen:kitchen_sink', 'kitchen', 'Kitchen Sink', [], 5, [], null, 'container'),
    card('kitchen:kitchen_faucet', 'kitchen', 'Kitchen Faucet', [], 6, [], 'kitchen:kitchen_sink', 'component'),
    card('kitchen:garbage_disposal', 'kitchen', 'Garbage Disposal', [], 7, [], 'kitchen:kitchen_sink', 'component'),
    card('kitchen:disposal_flange', 'kitchen', 'Disposal Flange', [], 8, [], 'kitchen:garbage_disposal', 'component'),
    card('kitchen:dishwasher', 'kitchen', 'Dishwasher', [], 9, [], null, 'container'),
];

const vanityDeck = [
    card('bathroom:bathroom_vanity', 'bathroom', 'Bathroom Vanity', ['Vanity'], 1, [], null, 'container'),
    card('bathroom:bathroom_sink', 'bathroom', 'Bathroom Sink', ['Vanity Sink', 'Lavatory Sink', 'Sink'], 2, [], 'bathroom:bathroom_vanity', 'component'),
    card('bathroom:bathroom_sink_faucet', 'bathroom', 'Bathroom Sink Faucet', ['Bathroom Faucet', 'Lavatory Faucet', 'Faucet'], 3, [], 'bathroom:bathroom_vanity', 'component'),
    card('bathroom:bathroom_sink_hot_angle_stop', 'bathroom', 'Bathroom Sink Hot Angle Stop', ['Hot Angle Stop'], 4, [], 'bathroom:bathroom_sink', 'component'),
    card('bathroom:bathroom_sink_cold_angle_stop', 'bathroom', 'Bathroom Sink Cold Angle Stop', ['Cold Angle Stop'], 5, [], 'bathroom:bathroom_sink', 'component'),
    card('bathroom:bathroom_sink_p_trap', 'bathroom', 'Bathroom Sink P-Trap', ['Bathroom P-Trap', 'Lavatory P-Trap'], 6, [], 'bathroom:bathroom_sink', 'component'),
];

assert(homeOSStarterCardGroups(cards).some((group) => group.key === 'whole home' && group.label === 'Whole Home'), 'Location-neutral archetypes must have a readable Whole Home Deck group.');
for (const query of ['smart', 'water', 'shutoff']) {
    assert(filterHomeOSStarterCardChoices(cards, query).some((entry) => entry.templateKey === 'whole_home:smart_water_shutoff'), `Add from Deck search for “${query}” must find Smart Water Shutoff.`);
}
assert(filterHomeOSStarterCardChoices(cards, 'shower valve', 'bathroom')[0]?.templateKey === 'bathroom:shower_valve', 'A Shower Valve archetype must remain selectable for placement in an arbitrary user-selected container.');
assert(filterHomeOSStarterCardChoices(cards, 'tub shower trim', 'bathroom')[0]?.templateKey === 'bathroom:tub_shower_trim', 'Tub & Shower Trim must be independently searchable from Shower Valve.');
assert(filterHomeOSStarterCardChoices(cards, 'front yard main water valve')[0]?.templateKey === 'whole_home:main_water_shutoff', 'Existing shutoff terminology must find the reusable neutral archetype without forcing its placement.');
assert(filterHomeOSStarterCardChoices(cards, '', 'basement').map((entry) => entry.templateKey).includes('whole_home:main_water_shutoff'), 'Main Water Shutoff must be selectable for an observed Basement placement.');

const counterComponents = homeOSStarterComponentCardsForContainer(componentDeck, 'kitchen:kitchen_counter');
assert(counterComponents.map((card) => card.templateKey).join(',') === 'kitchen:instant_hot,kitchen:ro_system,kitchen:ro_membrane', 'Kitchen Counter must expose direct and nested canonical Component Cards in Deck order.');

const sinkComponents = homeOSStarterComponentCardsForContainer(componentDeck, 'KITCHEN:KITCHEN_SINK');
assert(sinkComponents.map((card) => card.templateKey).join(',') === 'kitchen:kitchen_faucet,kitchen:garbage_disposal,kitchen:disposal_flange', 'Kitchen Sink must include its canonical faucet, disposal, and nested disposal flange without unrelated containers.');
assert(!sinkComponents.some((card) => card.templateKey === 'kitchen:dishwasher'), 'A sibling Dishwasher container must never leak into the Kitchen Sink component picker.');
assert(homeOSStarterComponentCardsForContainer(componentDeck, '').length === 0, 'A missing permanent Deck identity must not guess component relationships from a display name.');

assert(
    homeOSStarterCardForInstalledContainer(
        vanityDeck,
        { name: 'Bathroom Vanity', starter_template_key: null },
    )?.templateKey === 'bathroom:bathroom_vanity',
    'A legacy root container without a permanent key must inherit its unique Super Admin Deck identity.'
);
const legacyVanityMaster = homeOSStarterCardForInstalledContainer(
    vanityDeck,
    { name: 'Bathroom Vanity', starter_template_key: null },
);
const legacyPTrapMaster = homeOSStarterCardForInstalledComponent(
    vanityDeck,
    legacyVanityMaster?.templateKey,
    { name: 'Bathroom P-Trap', starter_template_key: null },
);
assert(
    legacyPTrapMaster?.templateKey === 'bathroom:bathroom_sink_p_trap'
    && legacyPTrapMaster.name === 'Bathroom Sink P-Trap',
    'A legacy Bathroom P-Trap must render from the canonical Deck card reached through its reconciled Vanity master.'
);
assert(
    homeOSStarterCardForInstalledComponent(
        vanityDeck,
        'bathroom:bathroom_vanity',
        { name: 'Bathroom Faucet', starter_template_key: null },
    )?.templateKey === 'bathroom:bathroom_sink_faucet',
    'A legacy unkeyed Bathroom Faucet must inherit the one compatible Super Admin Deck identity beneath Bathroom Vanity.'
);
assert(
    homeOSStarterCardForInstalledComponent(
        vanityDeck,
        'bathroom:bathroom_vanity',
        { name: 'Left stop', starter_template_key: 'bathroom:hot_angle_stop' },
    )?.templateKey === 'bathroom:bathroom_sink_hot_angle_stop',
    'An older shortened template key must reconcile through a unique current Deck alias.'
);
assert(
    !homeOSStarterCardForInstalledComponent(
        vanityDeck,
        'bathroom:bathroom_vanity',
        { name: 'Angle Stop', starter_template_key: null },
    ),
    'An ambiguous legacy label must not be guessed between hot and cold master cards.'
);
assert(
    !homeOSStarterCardForInstalledComponent(
        vanityDeck,
        'bathroom:bathroom_vanity',
        { name: 'Bathroom Faucet', starter_template_key: 'custom:designer_faucet' },
    ),
    'A deliberate custom identity must not be silently reclassified as a Super Admin master card.'
);
assert(
    !homeOSStarterCardForInstalledContainer(
        vanityDeck,
        { name: 'Bathroom Vanity', starter_template_key: 'custom:designer_vanity' },
    ),
    'A deliberately custom root container must not be silently reclassified as a Super Admin master card.'
);

console.log('HomeOS Add from Deck picker regression checks passed.');

function card(
    templateKey: string,
    roomKind: string,
    name: string,
    aliases: string[],
    displayOrder: number,
    placementTags: string[] = [],
    parentTemplateKey: string | null = null,
    presentationRole?: 'container' | 'component',
): HomeOSStarterCardChoice {
    return { templateKey, shortCode: '', roomKind, placementTags, name, system: 'Plumbing', category: 'Equipment', parentTemplateKey, presentationRole, aliases, displayOrder };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
