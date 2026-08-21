import type { HomeItemHierarchyRecord } from './homeItemHierarchy';
import {
    resolveHomeItemAreaAssemblyDeck,
    resolveHomeItemAreaHierarchyProjection,
    resolveHomeItemComponentDeck,
    resolveHomeItemDirectComponentDeck,
} from './homeItemHierarchyProjection';

runHomeItemHierarchyProjectionRegressions();

export function runHomeItemHierarchyProjectionRegressions() {
    kitchenSinkClaimsOnlyTheApprovedExistingDeck();
    bathroomVanityAndRefrigeratorClaimsAreTransitive();
    itemDetailsKeepNestedLevelsDirect();
    kitchenCounterClaimsOnlyItsApprovedSavedEquipment();
    explicitParentIdsWinAndDisambiguateDuplicateAssemblies();
    ambiguousAndMismatchedLegacyRowsAreNotGuessed();
    nestedAreaItemsDoNotLeakIntoTheirParentDeck();
    projectionUsesEverySavedActiveRowAtMostOnce();
    legacyToiletDrainUsesOnlyOneExactSameRoomToilet();
}

function legacyToiletDrainUsesOnlyOneExactSameRoomToilet() {
    const toilet = item('toilet', 'Toilet', 'Bathroom 1', 'bathroom:toilet');
    const drain = toiletDrain('toilet-drain');
    const otherToilet = item('other-toilet', 'Toilet', 'Bathroom 2', 'bathroom:toilet');
    assertNames(resolveHomeItemComponentDeck([toilet, drain, otherToilet], toilet), ['Toilet Drain'], 'The exact legacy Toilet Drain should attach to the only Toilet in its own room.');
    const duplicateToilet = item('duplicate-toilet', 'Toilet', 'Bathroom 1', 'bathroom:toilet');
    assert(resolveHomeItemComponentDeck([toilet, duplicateToilet, drain], toilet).length === 0, 'The legacy Toilet Drain must stay unclaimed when same-room Toilets are ambiguous.');
    const keyedDrain = { ...toiletDrain('keyed-drain'), starter_template_key: 'custom:toilet_drain' };
    assert(resolveHomeItemComponentDeck([toilet, keyedDrain], toilet).length === 0, 'A keyed card must never be captured by the legacy Toilet Drain compatibility rule.');
    const wrongSystemChild = { ...toiletDrain('wrong-system-child'), system: 'Plumbing' };
    assert(resolveHomeItemComponentDeck([toilet, wrongSystemChild], toilet).length === 0, 'A Toilet Drain outside Drains / Sewer must not use the legacy compatibility relation.');
    const areaChild = { ...toiletDrain('area-child'), category: 'Area' };
    assert(resolveHomeItemComponentDeck([toilet, areaChild], toilet).length === 0, 'An Area card must never become a Toilet component.');
    const componentChild = { ...toiletDrain('component-child'), category: 'Component' };
    assert(resolveHomeItemComponentDeck([toilet, componentChild], toilet).length === 0, 'A Component-category Toilet Drain must not use the legacy Fixture compatibility rule.');
    const customCategoryChild = { ...toiletDrain('custom-category-child'), category: 'Custom' };
    assert(resolveHomeItemComponentDeck([toilet, customCategoryChild], toilet).length === 0, 'A custom-category Toilet Drain must not use the legacy Fixture compatibility rule.');
    const customParent = { ...item('custom-parent', 'Toilet', 'Bathroom 1', 'custom:toilet'), system: 'Plumbing', category: 'Fixture' };
    assert(resolveHomeItemComponentDeck([customParent, toiletDrain('custom-parent-child')], customParent).length === 0, 'A custom keyed Toilet must not be treated as the canonical legacy parent.');
    const wrongSystemParent = { ...item('wrong-system-parent', 'Toilet', 'Bathroom 1'), system: 'Water Quality', category: 'Fixture' };
    assert(resolveHomeItemComponentDeck([wrongSystemParent, toiletDrain('wrong-system-parent-child')], wrongSystemParent).length === 0, 'An unkeyed Toilet with the wrong system must not be claimed.');
    const legacyParent = { ...item('legacy-parent', 'Toilet', 'Bathroom 1'), system: 'Plumbing', category: 'Fixture' };
    assertNames(resolveHomeItemComponentDeck([legacyParent, toiletDrain('legacy-parent-child')], legacyParent), ['Toilet Drain'], 'An unkeyed Plumbing Fixture Toilet remains the precise legacy compatibility parent.');
}

function toiletDrain(id: string): HomeItemHierarchyRecord {
    return { ...item(id, 'Toilet Drain', 'Bathroom 1'), system: 'Drains / Sewer', category: 'Fixture' };
}

function kitchenCounterClaimsOnlyItsApprovedSavedEquipment() {
    const counter = item('counter', 'Kitchen Counter', 'Kitchen', 'kitchen:kitchen_counter');
    const instantHot = item('instant-hot', 'Instant Hot Water Dispenser', 'Kitchen', 'kitchen:instant_hot_water_dispenser');
    const instantValve = item('instant-valve', 'Instant Hot Shutoff Valve', 'Kitchen', 'kitchen:instant_hot_shutoff_valve');
    const reverseOsmosis = item('ro', 'Reverse Osmosis System', 'Kitchen', 'kitchen:reverse_osmosis_system');
    const roFilter = item('ro-filter', 'RO Sediment Filter', 'Kitchen', 'kitchen:ro_sediment_filter');
    const dishwasher = item('counter-dishwasher', 'Dishwasher', 'Kitchen', 'kitchen:dishwasher');
    const rows = [counter, instantHot, instantValve, reverseOsmosis, roFilter, dishwasher];

    assertNames(
        resolveHomeItemComponentDeck(rows, counter),
        ['Instant Hot Shutoff Valve', 'Instant Hot Water Dispenser', 'Reverse Osmosis System', 'RO Sediment Filter'],
        'Kitchen Counter should claim saved Instant Hot and Reverse Osmosis cards plus their saved descendants.'
    );
    assertNames(
        resolveHomeItemAreaAssemblyDeck(rows, 'Kitchen'),
        ['Dishwasher', 'Kitchen Counter'],
        'Counter-bound cards must no longer appear beside the Kitchen Counter on the area deck.'
    );
}

function kitchenSinkClaimsOnlyTheApprovedExistingDeck() {
    const sink = item('sink', 'Kitchen Sink', 'Kitchen', 'kitchen:kitchen_sink');
    const faucet = item('faucet', 'Kitchen Faucet', 'Kitchen', 'kitchen:kitchen_faucet');
    const disposal = item('disposal', 'Garbage Disposal', 'Kitchen', 'kitchen:garbage_disposal');
    const flange = item('flange', 'Disposal Flange', 'Kitchen', 'kitchen:disposal_flange');
    const dishwasher = item('dishwasher', 'Dishwasher', 'Kitchen', 'kitchen:dishwasher');
    const rows = [sink, faucet, disposal, flange, dishwasher];

    assertNames(
        resolveHomeItemComponentDeck(rows, sink),
        ['Disposal Flange', 'Garbage Disposal', 'Kitchen Faucet'],
        'Kitchen Sink should claim the existing Faucet, Garbage Disposal, and disposal descendants.'
    );
    assertNames(
        resolveHomeItemAreaAssemblyDeck(rows, 'Kitchen'),
        ['Dishwasher', 'Kitchen Sink'],
        'Claimed sink components should not remain duplicated on the Kitchen deck.'
    );
    assert(resolveHomeItemComponentDeck(rows, sink).includes(faucet), 'Projection must return the original saved row object.');
}

function bathroomVanityAndRefrigeratorClaimsAreTransitive() {
    const vanity = item('vanity', 'Bathroom Vanity', 'Bathroom 1', 'bathroom:bathroom_vanity');
    const sink = item('bath-sink', 'Bathroom Sink', 'Bathroom 1', 'bathroom:bathroom_sink');
    const faucet = item('bath-faucet', 'Bathroom Sink Faucet', 'Bathroom 1', 'bathroom:bathroom_sink_faucet');
    const trap = item('bath-trap', 'Bathroom Sink P-Trap', 'Bathroom 1', 'bathroom:bathroom_sink_p_trap');

    assertNames(
        resolveHomeItemComponentDeck([vanity, sink, faucet, trap], vanity),
        ['Bathroom Sink', 'Bathroom Sink Faucet', 'Bathroom Sink P-Trap'],
        'Bathroom Vanity should claim saved Sink/Faucet cards and the Sink descendants.'
    );

    const refrigerator = item('fridge', 'Refrigerator', 'Kitchen', 'kitchen:refrigerator');
    const waterLine = item('water-line', 'Refrigerator Water Line', 'Kitchen', 'kitchen:refrigerator_water_line');
    const waterFilter = item('water-filter', 'Refrigerator Water Filter', 'Kitchen', 'kitchen:refrigerator_water_filter');

    assertNames(
        resolveHomeItemComponentDeck([refrigerator, waterLine, waterFilter], refrigerator),
        ['Refrigerator Water Filter', 'Refrigerator Water Line'],
        'Refrigerator should claim only an existing Water Line and its saved descendants.'
    );
}

function itemDetailsKeepNestedLevelsDirect() {
    const vanity = item('vanity', 'Bathroom Vanity', 'Bathroom 1', 'bathroom:bathroom_vanity');
    const faucet = item('faucet', 'Bathroom Sink Faucet', 'Bathroom 1', 'bathroom:bathroom_sink_faucet');
    const trap = { ...item('trap', 'Bathroom Sink P-Trap', 'Bathroom 1', 'bathroom:bathroom_sink_p_trap'), parent_home_item_id: 'faucet' };
    const washer = { ...item('washer', 'P-Trap Washer', 'Bathroom 1'), parent_home_item_id: 'trap' };
    const rows = [vanity, faucet, trap, washer];

    assertNames(
        resolveHomeItemDirectComponentDeck(rows, vanity),
        ['Bathroom Sink Faucet'],
        'The Vanity item detail must show its direct Faucet card without flattening deeper components.'
    );
    assertNames(
        resolveHomeItemDirectComponentDeck(rows, faucet),
        ['Bathroom Sink P-Trap'],
        'The Faucet item detail must open its direct P-Trap assembly.'
    );
    assertNames(
        resolveHomeItemDirectComponentDeck(rows, trap),
        ['P-Trap Washer'],
        'A nested assembly must own its own direct component detail level.'
    );
}

function explicitParentIdsWinAndDisambiguateDuplicateAssemblies() {
    const firstSink = item('sink-a', 'Kitchen Sink', 'Kitchen', 'kitchen:kitchen_sink');
    const secondSink = item('sink-b', 'Kitchen Sink', 'Kitchen', 'kitchen:kitchen_sink');
    const firstTrap = { ...item('trap-a', 'Kitchen Sink P-Trap', 'Kitchen', 'kitchen:kitchen_sink_p_trap'), parent_home_item_id: 'sink-a' };
    const secondTrap = { ...item('trap-b', 'Kitchen Sink P-Trap', 'Kitchen', 'kitchen:kitchen_sink_p_trap'), parent_home_item_id: 'sink-b' };
    const rows = [firstSink, secondSink, firstTrap, secondTrap];

    assertNames(resolveHomeItemComponentDeck(rows, firstSink), ['Kitchen Sink P-Trap'], 'The first duplicate assembly should receive only its ID-linked child.');
    assert(resolveHomeItemComponentDeck(rows, firstSink)[0]?.id === 'trap-a', 'The first child should remain attached to sink-a.');
    assert(resolveHomeItemComponentDeck(rows, secondSink)[0]?.id === 'trap-b', 'The second child should remain attached to sink-b.');

    const dishwasher = item('dishwasher-explicit', 'Dishwasher', 'Kitchen', 'kitchen:dishwasher');
    const faucet = { ...item('explicit-faucet', 'Kitchen Faucet', 'Kitchen', 'kitchen:kitchen_faucet'), parent_home_item_id: dishwasher.id };
    const explicitRows = [firstSink, dishwasher, faucet];

    assert(resolveHomeItemComponentDeck(explicitRows, firstSink).length === 0, 'Overlay must not override an explicit parent ID.');
    assert(resolveHomeItemComponentDeck(explicitRows, dishwasher)[0]?.id === faucet.id, 'Explicit parent ID should win before every fallback.');
}

function ambiguousAndMismatchedLegacyRowsAreNotGuessed() {
    const firstSink = item('ambiguous-sink-a', 'Kitchen Sink', 'Kitchen', 'kitchen:kitchen_sink');
    const secondSink = item('ambiguous-sink-b', 'Kitchen Sink', 'Kitchen', 'kitchen:kitchen_sink');
    const unlinkedFaucet = item('ambiguous-faucet', 'Kitchen Faucet', 'Kitchen', 'kitchen:kitchen_faucet');
    const customFaucet = item('custom-faucet', 'Kitchen Faucet', 'Kitchen', 'custom:not_a_sink_faucet');
    const renamedSink = item('renamed-sink', 'Island Workstation', 'Kitchen', 'kitchen:kitchen_sink');
    const renamedTrap = item('renamed-trap', 'Left Drain Bend', 'Kitchen', 'kitchen:kitchen_sink_p_trap');

    assertNames(
        resolveHomeItemAreaAssemblyDeck([firstSink, secondSink, unlinkedFaucet], 'Kitchen'),
        ['Kitchen Faucet', 'Kitchen Sink', 'Kitchen Sink'],
        'An unlinked component should remain visible when duplicate parents make the legacy relation ambiguous.'
    );
    assertNames(
        resolveHomeItemAreaAssemblyDeck([firstSink, customFaucet], 'Kitchen'),
        ['Kitchen Faucet', 'Kitchen Sink'],
        'A conflicting stable template key must not be overridden by a matching display name.'
    );
    assert(
        resolveHomeItemComponentDeck([renamedSink, renamedTrap], renamedSink)[0]?.id === renamedTrap.id,
        'Stable starter template keys should preserve a canonical relation after display names change.'
    );
}

function nestedAreaItemsDoNotLeakIntoTheirParentDeck() {
    const kitchenSink = item('root-kitchen-sink', 'Kitchen Sink', 'Kitchen', 'kitchen:kitchen_sink');
    const pantryArea = {
        ...item('pantry-area', 'Pantry', 'Pantry'),
        category: 'Area',
        parent_area: 'Kitchen',
    };
    const pantrySink = {
        ...item('pantry-sink', 'Bar Sink', 'Pantry'),
        parent_area: 'Kitchen',
    };
    const pantryFaucet = {
        ...item('pantry-faucet', 'Kitchen Faucet', 'Pantry', 'kitchen:kitchen_faucet'),
        parent_area: 'Kitchen',
    };
    const legacySinkChild = {
        ...item('legacy-sink-child', 'Kitchen Sink P-Trap', 'Kitchen Sink', 'kitchen:kitchen_sink_p_trap'),
        parent_area: 'Kitchen',
    };
    const legacyKitchenItem = {
        ...item('legacy-kitchen-item', 'Legacy Kitchen Valve', ''),
        parent_area: 'Kitchen',
    };
    const rows = [pantryArea, kitchenSink, pantrySink, pantryFaucet, legacySinkChild, legacyKitchenItem];

    assertNames(
        resolveHomeItemAreaAssemblyDeck(rows, { areaName: 'Kitchen' }),
        ['Kitchen Sink', 'Legacy Kitchen Valve'],
        'A nested Pantry item must not also appear in its parent Kitchen deck.'
    );
    assertNames(
        resolveHomeItemAreaAssemblyDeck(rows, { areaName: 'Pantry', parentAreaName: 'Kitchen' }),
        ['Bar Sink', 'Kitchen Faucet'],
        'A keyed item in a saved nested area must remain in that exact child-area deck.'
    );
    assertNames(
        resolveHomeItemComponentDeck(rows, kitchenSink),
        ['Kitchen Sink P-Trap'],
        'A true legacy child placed at the parent item name should still attach to its assembly.'
    );
}

function projectionUsesEverySavedActiveRowAtMostOnce() {
    const sink = item('projection-sink', 'Kitchen Sink', 'Kitchen', 'kitchen:kitchen_sink');
    const faucet = item('projection-faucet', 'Kitchen Faucet', 'Kitchen', 'kitchen:kitchen_faucet');
    const dishwasher = item('projection-dishwasher', 'Dishwasher', 'Kitchen', 'kitchen:dishwasher');
    const archived = { ...item('projection-archived', 'Garbage Disposal', 'Kitchen', 'kitchen:garbage_disposal'), archived: true };
    const unsavedSuggestion: HomeItemHierarchyRecord = { name: 'Garbage Disposal', location: 'Kitchen', archived: false };
    const projection = resolveHomeItemAreaHierarchyProjection(
        [sink, faucet, dishwasher, archived, unsavedSuggestion],
        { areaName: 'Kitchen' }
    );
    const projectedIds = projection.flatMap((entry) => [entry.assembly, ...entry.components]).map((row) => row.id);

    assert(projectedIds.length === new Set(projectedIds).size, 'A saved row must be claimed at most once in the area projection.');
    assert(projectedIds.length === 3, 'Projection must neither synthesize cards nor include archived/unsaved suggestions.');
    assert(!projectedIds.includes(archived.id), 'Archived rows must be excluded.');
}

function item(
    id: string,
    name: string,
    location: string,
    starterTemplateKey?: string
): HomeItemHierarchyRecord {
    return {
        id,
        item_slug: id,
        name,
        location,
        parent_area: '',
        archived: false,
        starter_template_key: starterTemplateKey || null,
    };
}

function assertNames(rows: HomeItemHierarchyRecord[], expected: string[], message: string) {
    const actual = rows.map((row) => row.name || '');
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} Received: ${actual.join(', ') || 'none'}.`);
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
