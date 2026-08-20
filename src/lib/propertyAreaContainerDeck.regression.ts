import { filterHomeOSStarterCardChoices } from './homeosStarterCardPickerCore';
import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';
import {
    buildPropertyAreaContainerCreateRoute,
    filterHomeOSContainerStarterCardChoices,
    propertyAreaRoutePath,
    resolvePropertyAreaContainerDeck,
} from './propertyAreaContainerDeck';
import type { HomeItemHierarchyRecord } from './homeItemHierarchy';

runPropertyAreaContainerDeckRegressions();

export function runPropertyAreaContainerDeckRegressions() {
    bathroomDeckKeepsContainersAndHidesLooseElectricalRows();
    kitchenDeckKeepsAssembliesWithoutLooseComponents();
    ambiguousKnownComponentRootsNeverBecomeContainers();
    garageAndLaundryDecksRemainConservative();
    containerPickerUsesTopLevelRoomAndPlacementContext();
    containerRoutePreservesTheExactPropertyArea();
    console.log('Property area container Deck regression checks passed.');
}

function ambiguousKnownComponentRootsNeverBecomeContainers() {
    const rows = [
        item('vanity-a', 'Bathroom Vanity', 'Bathroom 1', 'Fixture', 'Plumbing', 'bathroom:bathroom_vanity'),
        item('vanity-b', 'Bathroom Vanity', 'Bathroom 1', 'Fixture', 'Plumbing', 'bathroom:bathroom_vanity'),
        item('bath-sink', 'Bathroom Sink', 'Bathroom 1', 'Fixture', 'Plumbing', 'bathroom:bathroom_sink'),
        item('bath-faucet', 'Bathroom Sink Faucet', 'Bathroom 1', 'Fixture', 'Plumbing', 'bathroom:bathroom_sink_faucet'),
        item('sink-a', 'Kitchen Sink', 'Kitchen', 'Fixture', 'Plumbing', 'kitchen:kitchen_sink'),
        item('sink-b', 'Kitchen Sink', 'Kitchen', 'Fixture', 'Plumbing', 'kitchen:kitchen_sink'),
        item('kitchen-faucet', 'Kitchen Faucet', 'Kitchen', 'Fixture', 'Plumbing', 'kitchen:kitchen_faucet'),
        item('disposal', 'Garbage Disposal', 'Kitchen', 'Equipment', 'Plumbing', 'kitchen:garbage_disposal'),
    ];

    assertNames(
        resolvePropertyAreaContainerDeck(rows, { areaName: 'Bathroom 1' }),
        ['Bathroom Vanity', 'Bathroom Vanity'],
        'Ambiguous saved Bathroom components must not be promoted into the Containers deck.',
    );
    assertNames(
        resolvePropertyAreaContainerDeck(rows, { areaName: 'Kitchen' }),
        ['Kitchen Sink', 'Kitchen Sink'],
        'Ambiguous saved Kitchen components must not be promoted into the Containers deck.',
    );
}

function bathroomDeckKeepsContainersAndHidesLooseElectricalRows() {
    const rows = [
        item('vanity', 'Bathroom Vanity', 'Bathroom 1', 'Fixture', 'Plumbing', 'bathroom:bathroom_vanity'),
        item('sink', 'Bathroom Sink', 'Bathroom 1', 'Fixture', 'Plumbing', 'bathroom:bathroom_sink'),
        item('faucet', 'Bathroom Sink Faucet', 'Bathroom 1', 'Fixture', 'Plumbing', 'bathroom:bathroom_sink_faucet'),
        item('toilet', 'Toilet', 'Bathroom 1', 'Fixture', 'Plumbing', 'bathroom:toilet'),
        item('shower-tub', 'Shower / Tub', 'Bathroom 1', 'Fixture', 'Plumbing', 'bathroom:shower_tub'),
        item('roman-tub', 'Roman / Deck-Mount Tub', 'Bathroom 1', 'Fixture', 'Plumbing', 'master_bathroom:roman_deck_mount_tub'),
        item('steam', 'Steam Shower Module', 'Bathroom 1', 'Equipment', 'Plumbing'),
        item('trap', 'Bathroom Sink P-Trap', 'Bathroom 1', 'Component', 'Drains / Sewer', 'bathroom:bathroom_sink_p_trap'),
        item('gfi', 'Bathroom GFI Outlet', 'Bathroom 1', 'Equipment', 'Plumbing'),
        item('lights', 'Bathroom Lights', 'Bathroom 1', 'Fixture', 'Plumbing'),
        item('mirror', 'Lighted Mirror', 'Bathroom 1', 'Fixture', 'Plumbing'),
        { ...item('archived-bidet', 'Bidet', 'Bathroom 1', 'Fixture', 'Plumbing'), archived: true },
        { name: 'Unsaved suggestion', location: 'Bathroom 1', category: 'Equipment', system: 'Plumbing' },
    ];

    assertNames(
        resolvePropertyAreaContainerDeck(rows, { areaName: 'Bathroom 1' }),
        ['Bathroom Vanity', 'Roman / Deck-Mount Tub', 'Shower / Tub', 'Steam Shower Module', 'Toilet'],
        'Bathroom must show saved plumbing containers without loose components, GFI, lights, or a lighted mirror.',
    );
}

function kitchenDeckKeepsAssembliesWithoutLooseComponents() {
    const rows = [
        item('sink', 'Kitchen Sink', 'Kitchen', 'Fixture', 'Plumbing', 'kitchen:kitchen_sink'),
        item('faucet', 'Kitchen Faucet', 'Kitchen', 'Fixture', 'Plumbing', 'kitchen:kitchen_faucet'),
        item('disposal', 'Garbage Disposal', 'Kitchen', 'Equipment', 'Plumbing', 'kitchen:garbage_disposal'),
        item('dishwasher', 'Dishwasher', 'Kitchen', 'Equipment', 'Appliances', 'kitchen:dishwasher'),
        item('water-line', 'Refrigerator Water Line', 'Kitchen', 'Component', 'Plumbing', 'kitchen:refrigerator_water_line'),
        item('refrigerator', 'Refrigerator', 'Kitchen', 'Equipment', 'Appliances'),
        item('stove', 'Stove', 'Kitchen', 'Equipment', 'Appliances'),
        item('counter', 'Kitchen Counter', 'Kitchen', 'Fixture', 'Plumbing'),
        item('instant-hot', 'Instant Hot Water Dispenser', 'Kitchen', 'Equipment', 'Plumbing', 'kitchen:instant_hot_water_dispenser'),
        item('ro', 'Reverse Osmosis System', 'Kitchen', 'Equipment', 'Water Quality'),
        item('unknown-countertop', 'Countertop Water Appliance', 'Kitchen', 'Equipment', 'Water Quality'),
        item('gfi', 'Kitchen GFCI', 'Kitchen', 'Equipment', 'Plumbing'),
    ];

    assertNames(
        resolvePropertyAreaContainerDeck(rows, { areaName: 'Kitchen' }),
        ['Countertop Water Appliance', 'Dishwasher', 'Kitchen Counter', 'Kitchen Sink', 'Refrigerator', 'Stove'],
        'Kitchen must hide known Counter-bound roots while keeping unknown non-electrical Fixture/Equipment roots.',
    );
}

function garageAndLaundryDecksRemainConservative() {
    const garageRows = [
        item('heater', 'Water Heater', 'Garage', 'Equipment', 'Plumbing', 'garage:water_heater'),
        item('hose', 'Garage Hose Bibb', 'Garage', 'Fixture', 'Plumbing', 'garage:garage_hose_bibb'),
        item('washer-box', 'Washer Box / Laundry Connections', 'Garage', 'Equipment', 'Plumbing', 'garage:washer_box_laundry_connections'),
        item('basin', 'Custom Utility Basin', 'Garage', 'Fixture', 'Plumbing'),
        item('panel', 'Main Electrical Panel', 'Garage', 'Equipment', 'Electrical', 'electrical_whole_home:main_electrical_panel'),
        item('alarm', 'Smoke Alarm', 'Garage', 'Safety', 'Safety'),
        item('valve', 'Water Heater Shutoff Valve', 'Garage', 'Component', 'Plumbing', 'garage:water_heater_shutoff_valve'),
        { ...item('pump', 'Recirculation Pump', 'Garage', 'Equipment', 'Plumbing'), parent_home_item_id: 'missing-parent' },
    ];
    const laundryRows = [
        item('laundry-box', 'Washer Box / Laundry Connections', 'Laundry Room', 'Equipment', 'Plumbing', 'garage:washer_box_laundry_connections'),
        item('washer', 'Washing Machine', 'Laundry Room', 'Equipment', 'Appliances'),
        item('dryer', 'Dryer', 'Laundry Room', 'Equipment', 'Appliances'),
        item('utility-sink', 'Utility Sink', 'Laundry Room', 'Fixture', 'Plumbing'),
        item('dryer-outlet', 'Dryer Outlet', 'Laundry Room', 'Equipment', 'Electrical'),
        item('washer-valve', 'Washer Hot Valve', 'Laundry Room', 'Component', 'Plumbing', 'garage:washer_hot_valve'),
    ];
    const bathroomRows = [
        item('shower', 'Shower', 'Primary Bathroom', 'Fixture', 'Plumbing', 'bathroom:shower'),
        item('door', 'Shower Enclosure / Door', 'Primary Bathroom', 'Fixture', 'Plumbing', 'master_bathroom:shower_enclosure_door'),
    ];

    assertNames(
        resolvePropertyAreaContainerDeck(garageRows, { areaName: 'Garage' }),
        ['Custom Utility Basin', 'Garage Hose Bibb', 'Washer Box / Laundry Connections', 'Water Heater'],
        'Legacy fallback must keep unknown plumbing Fixture roots when Deck metadata is unavailable.',
    );
    assertNames(
        resolvePropertyAreaContainerDeck(garageRows, { areaName: 'Garage' }, [
            { ...card('garage:garage_hose_bibb', 'garage', 'Garage Hose Bibb', 'Fixture'), presentationRole: 'component' },
            { ...card('garage:washer_box_laundry_connections', 'garage', 'Washer Box / Laundry Connections', 'Equipment'), presentationRole: 'container' },
            { ...card('garage:water_heater', 'garage', 'Water Heater', 'Equipment'), presentationRole: 'container' },
        ]),
        ['Custom Utility Basin', 'Washer Box / Laundry Connections', 'Water Heater'],
        'Master Deck roles must hide a known saved component root while preserving containers and unknown legacy fixtures.',
    );
    assertNames(
        resolvePropertyAreaContainerDeck(laundryRows, { areaName: 'Laundry Room' }),
        ['Dryer', 'Utility Sink', 'Washer Box / Laundry Connections', 'Washing Machine'],
        'Laundry must keep saved appliance and plumbing containers without electrical or component rows.',
    );
    assertNames(
        resolvePropertyAreaContainerDeck(bathroomRows, { areaName: 'Primary Bathroom' }, [
            { ...card('bathroom:shower', 'bathroom', 'Shower', 'Fixture'), presentationRole: 'container' },
            { ...card('master_bathroom:shower_enclosure_door', 'master_bathroom', 'Shower Enclosure / Door', 'Fixture'), presentationRole: 'component' },
        ]),
        ['Shower'],
        'Master Deck roles must suppress every saved component-role root, not only hardcoded legacy examples.',
    );
}

function containerPickerUsesTopLevelRoomAndPlacementContext() {
    const cards = [
        card('bathroom:bathroom_vanity', 'bathroom', 'Bathroom Vanity', 'Fixture'),
        card('bathroom:bathroom_sink', 'bathroom', 'Bathroom Sink', 'Fixture'),
        card('bathroom:bathroom_sink_faucet', 'bathroom', 'Bathroom Sink Faucet', 'Fixture'),
        card('bathroom:toilet', 'bathroom', 'Toilet', 'Fixture'),
        card('bathroom:shower_tub', 'bathroom', 'Shower / Tub', 'Fixture'),
        { ...card('bathroom:tub', 'bathroom', 'Tub', 'Fixture'), presentationRole: 'container' as const, autoProvision: false },
        { ...card('bathroom:shower', 'bathroom', 'Shower', 'Fixture'), presentationRole: 'container' as const, autoProvision: false },
        card('bathroom:shower_valve', 'bathroom', 'Shower Valve', 'Component', 'bathroom:shower_tub'),
        card('master_bathroom:roman_deck_mount_tub', 'master_bathroom', 'Roman / Deck-Mount Tub', 'Fixture'),
        card('electrical_bathroom:bathroom_exhaust_fan', 'electrical_bathroom', 'Bathroom Exhaust Fan', 'Equipment', null, 'Electrical', ['bathroom'], 'electrical'),
        card('kitchen:kitchen_sink', 'kitchen', 'Kitchen Sink', 'Fixture'),
        card('kitchen:kitchen_faucet', 'kitchen', 'Kitchen Faucet', 'Fixture'),
        card('kitchen:garbage_disposal', 'kitchen', 'Garbage Disposal', 'Equipment'),
        card('kitchen:instant_hot_water_dispenser', 'kitchen', 'Instant Hot Water Dispenser', 'Equipment'),
        card('kitchen:reverse_osmosis_system', 'kitchen', 'Reverse Osmosis System', 'Equipment'),
        card('kitchen:dishwasher', 'kitchen', 'Dishwasher', 'Equipment', null, 'Appliances'),
        { ...card('kitchen:refrigerator', 'kitchen', 'Refrigerator', 'Equipment', null, 'Appliances'), presentationRole: 'container' as const, autoProvision: false },
        { ...card('kitchen:stove_range', 'kitchen', 'Stove / Range', 'Equipment', null, 'Appliances'), presentationRole: 'container' as const, autoProvision: false },
        { ...card('kitchen:kitchen_counter', 'kitchen', 'Kitchen Counter', 'Fixture'), presentationRole: 'container' as const, autoProvision: false },
        { ...card('kitchen:legacy_loose_root', 'kitchen', 'Legacy Loose Root', 'Equipment'), presentationRole: 'component' as const },
        card('kitchen:refrigerator_water_line', 'kitchen', 'Refrigerator Water Line', 'Component'),
        card('garage:water_heater', 'garage', 'Water Heater', 'Equipment'),
        card('garage:washer_box_laundry_connections', 'garage', 'Washer Box / Laundry Connections', 'Equipment', null, 'Plumbing', [], 'plumbing', ['Washer Box', 'Laundry Connections']),
        card('laundry:laundry_sink', 'laundry', 'Laundry Sink', 'Fixture'),
        card('whole_home:main_water_shutoff', 'whole_home', 'Main Water Shutoff', 'Equipment', null, 'Plumbing', ['garage']),
        card('safety:leak_sensor', 'garage', 'Water Leak Sensor', 'Safety', null, 'Safety'),
    ];

    assertCardNames(
        filterHomeOSContainerStarterCardChoices(cards, { areaName: 'Bathroom 2' }),
        ['Bathroom Vanity', 'Toilet', 'Shower / Tub', 'Tub', 'Shower'],
        'A numbered Bathroom must receive only top-level Bathroom containers.',
    );
    assertCardNames(
        filterHomeOSContainerStarterCardChoices(cards, { areaName: 'Water Closet', parentAreaName: 'Primary Bathroom' }),
        ['Bathroom Vanity', 'Toilet', 'Shower / Tub', 'Tub', 'Shower', 'Roman / Deck-Mount Tub'],
        'A nested Primary Bathroom area must retain its regular and Master Bathroom root choices.',
    );
    assertCardNames(
        filterHomeOSContainerStarterCardChoices(cards, { areaName: 'Kitchen' }),
        ['Kitchen Sink', 'Dishwasher', 'Refrigerator', 'Stove / Range', 'Kitchen Counter'],
        'Kitchen must show optional catalog containers while omitting overlay parts, Counter-bound equipment, and component-role roots.',
    );
    assertCardNames(
        filterHomeOSContainerStarterCardChoices(cards, { areaName: 'Garage' }),
        ['Water Heater', 'Washer Box / Laundry Connections', 'Main Water Shutoff'],
        'Garage must include exact-room roots and neutral roots explicitly tagged for Garage.',
    );
    assertCardNames(
        filterHomeOSContainerStarterCardChoices(cards, { areaName: 'Laundry Room' }),
        ['Washer Box / Laundry Connections', 'Laundry Sink'],
        'Laundry must use explicit Laundry roots plus the existing Laundry Connections compatibility card only.',
    );
    assert(
        filterHomeOSStarterCardChoices(cards, 'shower valve').some((entry) => entry.templateKey === 'bathroom:shower_valve'),
        'Normal Create Item Deck filtering must continue to expose child Component cards.',
    );
    for (const templateKey of [
        'bathroom:bathroom_sink',
        'bathroom:bathroom_sink_faucet',
        'kitchen:kitchen_faucet',
        'kitchen:garbage_disposal',
        'kitchen:instant_hot_water_dispenser',
        'kitchen:reverse_osmosis_system',
    ]) {
        assert(
            filterHomeOSStarterCardChoices(cards, '').some((entry) => entry.templateKey === templateKey),
            `${templateKey} must remain available in the normal Create Item Deck.`,
        );
    }
}

function containerRoutePreservesTheExactPropertyArea() {
    const route = buildPropertyAreaContainerCreateRoute({
        areaName: 'Kitchen Counter / Island',
        parentAreaName: 'Kitchen & Dining',
    });

    assert(route.pathname === '/item/create', 'Add Container must reuse the existing Create Item route.');
    assert(route.params.containerMode === 'true' && route.params.deckPicker === 'true', 'Add Container must open Create Item in filtered Deck mode.');
    assert(route.params.area === 'Kitchen Counter / Island', 'Create route must preserve the exact area label.');
    assert(route.params.parentArea === 'Kitchen & Dining', 'Create route must preserve the exact parent-area label.');
    assert(
        route.params.areaReturnTo === '/home/area/Kitchen%20Counter%20%2F%20Island?parentArea=Kitchen%20%26%20Dining',
        'Create route must carry an encoded return to the exact property area.',
    );
    assert(
        propertyAreaRoutePath({ areaName: 'Bathroom 10' }) === '/home/area/Bathroom%2010',
        'Top-level property-area returns must not add a different system route.',
    );
}

function item(
    id: string,
    name: string,
    location: string,
    category: string,
    system: string,
    starterTemplateKey?: string,
): HomeItemHierarchyRecord {
    return {
        id,
        item_slug: id,
        name,
        location,
        parent_area: '',
        category,
        system,
        archived: false,
        starter_template_key: starterTemplateKey || null,
    };
}

function card(
    templateKey: string,
    roomKind: string,
    name: string,
    category: string,
    parentTemplateKey: string | null = null,
    system = 'Plumbing',
    placementTags: string[] = [],
    tradeKey = 'plumbing',
    aliases: string[] = [],
): HomeOSStarterCardChoice {
    return {
        templateKey,
        shortCode: '',
        tradeKey,
        roomKind,
        placementTags,
        name,
        system,
        category,
        parentTemplateKey,
        aliases,
        displayOrder: 10,
    };
}

function assertNames(rows: HomeItemHierarchyRecord[], expected: string[], message: string) {
    const actual = rows.map((row) => row.name || '');
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} Received: ${actual.join(', ') || 'none'}.`);
}

function assertCardNames(rows: HomeOSStarterCardChoice[], expected: string[], message: string) {
    const actual = rows.map((row) => row.name);
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} Received: ${actual.join(', ') || 'none'}.`);
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
