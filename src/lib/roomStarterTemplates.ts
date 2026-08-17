export type CompleteRoomStarterKind = 'bathroom' | 'kitchen' | 'garage';

export type LocationNeutralStarterKind =
    | 'whole_home'
    | 'electrical_whole_home'
    | 'electrical_living_room'
    | 'electrical_hall'
    | 'electrical_kitchen'
    | 'electrical_bathroom'
    | 'electrical_exterior'
    | 'electrical_garage';

export type CompleteRoomStarterItem = {
    name: string;
    system: string;
    category: 'Fixture' | 'Equipment' | 'Component';
    aliases?: readonly string[];
    parentName?: string;
    parentAliases?: readonly string[];
};

const ROOM_PARENT_ALIASES: Record<string, readonly string[]> = {
    'Bathroom Sink': ['Vanity Sink', 'Lavatory Sink'],
    'Shower / Tub': ['Shower/Tub', 'Shower / Tub Valve', 'Tub / Shower Combination', 'Shower', 'Tub'],
    Toilet: ['Water Closet'],
    'Kitchen Sink': ['Sink'],
    'Garbage Disposal': ['Food Waste Disposer', 'Disposal'],
    Dishwasher: [],
    'Refrigerator Water Line': ['Ice Maker Line', 'Refrigerator Line'],
    'Instant Hot Water Dispenser': ['Instant Hot', 'Hot Water Dispenser'],
    'Reverse Osmosis System': ['Reverse Osmosis', 'RO System'],
    'Water Heater': ['Tank Water Heater', 'Storage Water Heater', '30 gallon', '40 gallon', '50 gallon', '70 gallon', '100 gallon', 'Tankless Water Heater'],
    'Washer Box / Laundry Connections': ['Washer Box', 'Laundry Connections', 'Washing Machine Box'],
};

const ROOM_STARTER_ITEMS: Record<CompleteRoomStarterKind, readonly CompleteRoomStarterItem[]> = {
    bathroom: [
        item('Bathroom Vanity', 'Plumbing', 'Fixture', ['Vanity']),
        item('Bathroom Sink', 'Plumbing', 'Fixture', ['Vanity Sink', 'Lavatory Sink']),
        item('Bathroom Sink Faucet', 'Plumbing', 'Fixture', ['Bathroom Faucet', 'Bathroom Sink / Faucet', 'Lavatory Faucet']),
        item('Shower / Tub', 'Plumbing', 'Fixture', ['Shower/Tub', 'Shower / Tub Valve', 'Tub / Shower Combination', 'Shower', 'Tub']),
        item('Toilet', 'Plumbing', 'Fixture', ['Water Closet']),

        child('Bathroom Sink Hot Angle Stop', 'Plumbing', 'Component', 'Bathroom Sink', ['Hot Angle Stop', 'Bathroom Hot Angle Stop']),
        child('Bathroom Sink Cold Angle Stop', 'Plumbing', 'Component', 'Bathroom Sink', ['Cold Angle Stop', 'Bathroom Cold Angle Stop', 'Bathroom Angle Stop']),
        child('Bathroom Sink Hot Supply Line', 'Plumbing', 'Component', 'Bathroom Sink', ['Hot Supply Line', 'Bathroom Hot Supply Line']),
        child('Bathroom Sink Cold Supply Line', 'Plumbing', 'Component', 'Bathroom Sink', ['Cold Supply Line', 'Bathroom Cold Supply Line']),
        child('Bathroom Sink P-Trap', 'Drains / Sewer', 'Component', 'Bathroom Sink', ['Bathroom P-Trap', 'Lavatory P-Trap']),
        child('Bathroom Sink Pop-Up / Drain Assembly', 'Drains / Sewer', 'Component', 'Bathroom Sink', ['Pop-Up Assembly', 'Bathroom Pop-Up Assembly', 'Drain Assembly', 'Lavatory Drain']),

        child('Shower Valve', 'Plumbing', 'Component', 'Shower / Tub'),
        child('Shower Cartridge', 'Plumbing', 'Component', 'Shower / Tub'),
        child('Shower Head', 'Plumbing', 'Fixture', 'Shower / Tub', ['Showerhead']),
        child('Shower Drain', 'Drains / Sewer', 'Fixture', 'Shower / Tub', ['Shower / Tub Drain', 'Tub Drain']),
        child('Tub / Shower Diverter', 'Plumbing', 'Component', 'Shower / Tub', ['Shower Diverter', 'Tub Diverter']),
        child('Tub Spout', 'Plumbing', 'Fixture', 'Shower / Tub'),
        child('Tub Waste and Overflow', 'Drains / Sewer', 'Component', 'Shower / Tub', ['Tub Waste & Overflow']),

        child('Toilet Shutoff / Angle Stop', 'Plumbing', 'Component', 'Toilet', ['Toilet Shutoff Valve', 'Toilet Angle Stop', 'Toilet Shutoff', 'Toilet Stop']),
        child('Toilet Supply Line', 'Plumbing', 'Component', 'Toilet'),
        child('Toilet Fill Valve', 'Plumbing', 'Component', 'Toilet', ['Fill Valve']),
        child('Toilet Flapper', 'Plumbing', 'Component', 'Toilet', ['Flapper']),
        child('Toilet Tank Bolts', 'Plumbing', 'Component', 'Toilet', ['Tank Bolts']),
        child('Toilet Wax Ring', 'Drains / Sewer', 'Component', 'Toilet', ['Wax Ring', 'Toilet Wax Seal']),
        child('Toilet Seat', 'Plumbing', 'Component', 'Toilet'),
    ],
    kitchen: [
        item('Kitchen Sink', 'Plumbing', 'Fixture', ['Sink']),
        item('Kitchen Faucet', 'Plumbing', 'Fixture', ['Faucet']),
        item('Garbage Disposal', 'Plumbing', 'Equipment', ['Food Waste Disposer', 'Disposal']),
        item('Dishwasher', 'Appliances', 'Equipment'),
        item('Refrigerator Water Line', 'Plumbing', 'Component', ['Ice Maker Line', 'Refrigerator Line']),
        item('Instant Hot Water Dispenser', 'Plumbing', 'Equipment', ['Instant Hot', 'Hot Water Dispenser']),
        item('Reverse Osmosis System', 'Water Quality', 'Equipment', ['Reverse Osmosis', 'RO System']),

        child('Kitchen Hot Angle Stop', 'Plumbing', 'Component', 'Kitchen Sink', ['Hot Angle Stop', 'Kitchen Sink Hot Angle Stop']),
        child('Kitchen Cold Angle Stop', 'Plumbing', 'Component', 'Kitchen Sink', ['Cold Angle Stop', 'Kitchen Sink Cold Angle Stop']),
        child('Kitchen Hot Supply Line', 'Plumbing', 'Component', 'Kitchen Sink', ['Hot Supply Line', 'Kitchen Sink Hot Supply Line']),
        child('Kitchen Cold Supply Line', 'Plumbing', 'Component', 'Kitchen Sink', ['Cold Supply Line', 'Kitchen Sink Cold Supply Line']),
        child('Kitchen Sink Drain', 'Drains / Sewer', 'Fixture', 'Kitchen Sink', ['Kitchen Drain', 'Sink Drain']),
        child('Kitchen Sink P-Trap', 'Drains / Sewer', 'Component', 'Kitchen Sink', ['Kitchen P-Trap', 'Kitchen Drain / P-Trap', 'P-Trap']),
        child('Kitchen Basket Strainer', 'Drains / Sewer', 'Component', 'Kitchen Sink', ['Basket Strainer', 'Sink Strainer']),

        child('Disposal Flange', 'Drains / Sewer', 'Component', 'Garbage Disposal', ['Garbage Disposal Flange']),
        child('Dishwasher Supply Line', 'Plumbing', 'Component', 'Dishwasher', ['Dishwasher Connection']),
        child('Dishwasher Drain Hose', 'Drains / Sewer', 'Component', 'Dishwasher', ['Dishwasher Drain Line', 'Dishwasher Drain']),
        child('Dishwasher Air Gap', 'Plumbing', 'Component', 'Dishwasher', ['Air Gap']),
        child('Dishwasher Shutoff Valve', 'Plumbing', 'Component', 'Dishwasher', ['Dishwasher Angle Stop']),

        child('Refrigerator Water Filter', 'Water Quality', 'Component', 'Refrigerator Water Line', ['Refrigerator Filter']),
        child('Refrigerator Shutoff Valve', 'Plumbing', 'Component', 'Refrigerator Water Line', ['Ice Maker Shutoff Valve']),
        child('Instant Hot Shutoff Valve', 'Plumbing', 'Component', 'Instant Hot Water Dispenser', ['Instant Hot Angle Stop']),
        child('Instant Hot Supply Line', 'Plumbing', 'Component', 'Instant Hot Water Dispenser'),

        child('RO Feed Shutoff Valve', 'Water Quality', 'Component', 'Reverse Osmosis System', ['Reverse Osmosis Feed Valve']),
        child('RO Sediment Filter', 'Water Quality', 'Component', 'Reverse Osmosis System', ['Sediment Filter']),
        child('RO Carbon Pre-Filter', 'Water Quality', 'Component', 'Reverse Osmosis System', ['Carbon Pre-Filter']),
        child('RO Membrane', 'Water Quality', 'Component', 'Reverse Osmosis System', ['Reverse Osmosis Membrane']),
        child('RO Post-Carbon Filter', 'Water Quality', 'Component', 'Reverse Osmosis System', ['Post-Carbon Filter']),
        child('RO Filter Canisters', 'Water Quality', 'Component', 'Reverse Osmosis System', ['RO Canisters', 'Filter Canisters']),
        child('RO Storage Tank', 'Water Quality', 'Component', 'Reverse Osmosis System', ['Reverse Osmosis Tank']),
        child('RO Faucet', 'Water Quality', 'Fixture', 'Reverse Osmosis System', ['Reverse Osmosis Faucet']),
    ],
    garage: [
        item('Water Heater', 'Plumbing', 'Equipment', ['Tank Water Heater', 'Storage Water Heater', '30 gallon', '40 gallon', '50 gallon', '70 gallon', '100 gallon', 'Tankless Water Heater']),
        item('Garage Hose Bibb', 'Plumbing', 'Fixture', ['Garage Hose Bib', 'Hose Bib', 'Hose Bibb']),
        item('Washer Box / Laundry Connections', 'Plumbing', 'Equipment', ['Washer Box', 'Laundry Connections', 'Washing Machine Box']),
        item('Whole Home Filter', 'Water Quality', 'Equipment', ['Whole House Filter', 'Whole Home Filter / Halo 5']),

        child('Water Heater Cold Water Connection', 'Plumbing', 'Component', 'Water Heater', ['Cold Water Connection', 'Water Heater Cold Supply']),
        child('Water Heater Hot Water Connection', 'Plumbing', 'Component', 'Water Heater', ['Hot Water Connection', 'Water Heater Hot Supply']),
        child('Water Heater Shutoff Valve', 'Plumbing', 'Component', 'Water Heater', ['Cold Water Shutoff', 'Water Heater Angle Stop']),
        child('Expansion Tank', 'Plumbing', 'Equipment', 'Water Heater'),
        child('TPR Valve', 'Plumbing', 'Component', 'Water Heater', ['T&P Valve', 'Temperature and Pressure Relief Valve']),
        child('TPR Discharge Line', 'Plumbing', 'Component', 'Water Heater', ['T&P Discharge Line']),
        child('Water Heater Drain Pan', 'Plumbing', 'Component', 'Water Heater', ['Drain Pan']),
        child('Water Heater Sediment / Drain Valve', 'Plumbing', 'Component', 'Water Heater', ['Water Heater Drain Valve', 'Sediment Drain Valve']),
        child('Water Heater Venting', 'Gas', 'Component', 'Water Heater', ['Water Heater Vent', 'Tankless Venting']),
        child('Water Heater Gas Connection', 'Gas', 'Component', 'Water Heater', ['Gas Connection']),
        child('Water Heater Recirculation Pump', 'Plumbing', 'Equipment', 'Water Heater', ['Recirculation Pump']),
        child('Water Heater Recirculation Line', 'Plumbing', 'Component', 'Water Heater', ['Recirculation Line']),
        child('Tankless Isolation Valve Set', 'Plumbing', 'Component', 'Water Heater', ['Tankless Isolation Valves']),
        child('Tankless Condensate Drain', 'Drains / Sewer', 'Component', 'Water Heater', ['Condensate Drain']),

        child('Washer Hot Valve', 'Plumbing', 'Component', 'Washer Box / Laundry Connections', ['Hot Washer Valve']),
        child('Washer Cold Valve', 'Plumbing', 'Component', 'Washer Box / Laundry Connections', ['Cold Washer Valve']),
        child('Washer Hot Supply Line', 'Plumbing', 'Component', 'Washer Box / Laundry Connections', ['Hot Washer Supply Line']),
        child('Washer Cold Supply Line', 'Plumbing', 'Component', 'Washer Box / Laundry Connections', ['Cold Washer Supply Line']),
        child('Washer Drain / Standpipe', 'Drains / Sewer', 'Fixture', 'Washer Box / Laundry Connections', ['Washer Drain', 'Laundry Standpipe']),
    ],
};

const LOCATION_NEUTRAL_STARTER_ITEMS: readonly (CompleteRoomStarterItem & {
    templateKey: string;
    kind: LocationNeutralStarterKind;
    placementTags?: readonly string[];
})[] = [
    {
        templateKey: 'whole_home:smart_water_shutoff',
        kind: 'whole_home',
        name: 'Smart Water Shutoff',
        system: 'Plumbing',
        category: 'Equipment',
        aliases: [
            'Smart Water Monitor and Shutoff',
            'Automatic Smart Water Shutoff',
            'Whole Home Smart Water Shutoff',
        ],
    },
    electrical('electrical_whole_home:main_electrical_panel', 'electrical_whole_home', 'Main Electrical Panel', 'Equipment', ['Main Panel', 'Breaker Panel', 'Service Panel'], ['whole_home']),
    electrical('electrical_whole_home:electrical_subpanel', 'electrical_whole_home', 'Electrical Subpanel', 'Equipment', ['Subpanel', 'Sub Panel'], ['whole_home', 'garage']),
    electrical('electrical_exterior:meter_service_entrance', 'electrical_exterior', 'Electrical Meter / Service Entrance', 'Equipment', ['Electrical Meter', 'Service Entrance', 'Utility Service'], ['whole_home', 'exterior']),
    electrical('electrical_living_room:receptacle_outlet', 'electrical_living_room', 'Receptacle / Outlet', 'Component', ['Electrical Outlet', 'Wall Outlet', 'Receptacle'], ['living_room', 'hall', 'kitchen', 'bathroom', 'exterior', 'garage']),
    electrical('electrical_whole_home:gfci_afci_protection', 'electrical_whole_home', 'GFCI / AFCI Protection', 'Component', ['GFCI', 'AFCI', 'Ground Fault Protection', 'Arc Fault Protection'], ['whole_home', 'kitchen', 'bathroom', 'exterior', 'garage']),
    electrical('electrical_living_room:switch_dimmer', 'electrical_living_room', 'Switch / Dimmer', 'Component', ['Light Switch', 'Dimmer Switch'], ['living_room', 'hall', 'kitchen', 'bathroom', 'exterior', 'garage']),
    electrical('electrical_living_room:interior_light_fixture', 'electrical_living_room', 'Interior Light Fixture', 'Fixture', ['Interior Light', 'Ceiling Light', 'Wall Light'], ['living_room', 'hall', 'kitchen', 'bathroom', 'garage']),
    electrical('electrical_exterior:exterior_light_fixture', 'electrical_exterior', 'Exterior Light Fixture', 'Fixture', ['Outdoor Light', 'Exterior Lighting'], ['exterior', 'garage']),
    electrical('electrical_living_room:ceiling_fan', 'electrical_living_room', 'Ceiling Fan', 'Equipment', ['Ceiling Light Fan'], ['living_room']),
    electrical('electrical_bathroom:bathroom_exhaust_fan', 'electrical_bathroom', 'Bathroom Exhaust Fan', 'Equipment', ['Exhaust Fan', 'Ventilation Fan'], ['bathroom']),
    electrical('electrical_hall:smoke_carbon_monoxide_alarm', 'electrical_hall', 'Smoke / Carbon Monoxide Alarm', 'Equipment', ['Smoke Alarm', 'CO Alarm', 'Carbon Monoxide Alarm', 'Combination Alarm'], ['whole_home', 'living_room', 'hall', 'kitchen', 'garage']),
    electrical('electrical_exterior:doorbell_low_voltage', 'electrical_exterior', 'Doorbell / Low-Voltage System', 'Equipment', ['Doorbell', 'Low Voltage', 'Chime'], ['whole_home', 'living_room', 'exterior']),
    electrical('electrical_kitchen:dedicated_electrical_circuit', 'electrical_kitchen', 'Dedicated Electrical Circuit', 'Component', ['Dedicated Circuit', 'Appliance Circuit'], ['whole_home', 'kitchen', 'bathroom', 'garage']),
    electrical('electrical_garage:ev_charger', 'electrical_garage', 'EV Charger', 'Equipment', ['Electric Vehicle Charger', 'EVSE'], ['garage', 'exterior']),
    electrical('electrical_whole_home:whole_home_surge_protector', 'electrical_whole_home', 'Whole-Home Surge Protector', 'Equipment', ['Surge Protection Device', 'Whole House Surge Protector'], ['whole_home']),
    electrical('electrical_garage:electric_heater', 'electrical_garage', 'Electric Heater', 'Equipment', ['Electric Space Heater', 'Wall Heater'], ['garage', 'living_room', 'bathroom']),
    electrical('electrical_garage:generator_transfer_switch', 'electrical_garage', 'Generator / Transfer Switch', 'Equipment', ['Standby Generator', 'Portable Generator Connection', 'Transfer Switch'], ['whole_home', 'garage', 'exterior']),
];

export function getLocationNeutralStarterItems() {
    return LOCATION_NEUTRAL_STARTER_ITEMS.map((starterItem) => ({
        ...starterItem,
        aliases: starterItem.aliases ? [...starterItem.aliases] : undefined,
        placementTags: starterItem.placementTags ? [...starterItem.placementTags] : undefined,
    }));
}

export function getCompleteRoomStarterKind(areaName?: string | null): CompleteRoomStarterKind | null {
    const normalized = normalizeRoomStarterIdentity(areaName);

    if (!normalized) return null;
    if (normalized.includes('outdoor kitchen')) return null;
    if (/(^| )(bathroom|bath room|master bath|primary bath|guest bath|half bath|powder room)( |$)/.test(normalized)) return 'bathroom';
    if (/(^| )kitchen( |$)/.test(normalized)) return 'kitchen';
    if (/(^| )garage( |$)/.test(normalized)) return 'garage';

    return null;
}

export function getCompleteRoomStarterItems(kind: CompleteRoomStarterKind) {
    return ROOM_STARTER_ITEMS[kind].map((starterItem) => ({
        ...starterItem,
        aliases: starterItem.aliases ? [...starterItem.aliases] : undefined,
        parentAliases: starterItem.parentAliases ? [...starterItem.parentAliases] : undefined,
    }));
}

export function completeRoomStarterTemplateKey(
    kind: CompleteRoomStarterKind,
    itemName: string,
) {
    return `${kind}:${normalizeRoomStarterIdentity(itemName).replace(/\s+/g, '_')}`;
}

export function resolveCompleteRoomStarterTemplate(input: {
    name?: string | null;
    location?: string | null;
    parentArea?: string | null;
}) {
    const locationNeutralItem = LOCATION_NEUTRAL_STARTER_ITEMS.find((itemDefinition) =>
        roomStarterItemNames(itemDefinition).some((name) => sameRoomStarterIdentity(name, input.name))
    );

    if (locationNeutralItem) {
        return {
            templateKey: locationNeutralItem.templateKey,
            kind: locationNeutralItem.kind,
            areaName: '',
            item: locationNeutralItem,
        };
    }

    const areaName = getCompleteRoomStarterKind(input.parentArea)
        ? String(input.parentArea || '').trim()
        : getCompleteRoomStarterKind(input.location)
            ? String(input.location || '').trim()
            : '';
    const kind = getCompleteRoomStarterKind(areaName);

    if (!kind) return null;

    const itemDefinition = findCompleteRoomStarterItem(areaName, String(input.name || ''));

    if (!itemDefinition) return null;

    return {
        templateKey: completeRoomStarterTemplateKey(kind, itemDefinition.name),
        kind,
        areaName,
        item: itemDefinition,
    };
}

export function roomStarterItemNames(itemDefinition: CompleteRoomStarterItem) {
    return [itemDefinition.name, ...(itemDefinition.aliases || [])];
}

export function roomStarterParentNames(itemDefinition: CompleteRoomStarterItem) {
    return itemDefinition.parentName
        ? [itemDefinition.parentName, ...(itemDefinition.parentAliases || [])]
        : [];
}

export function findCompleteRoomStarterItem(
    areaName: string,
    itemName: string,
) {
    const kind = getCompleteRoomStarterKind(areaName);

    if (!kind) return null;

    return ROOM_STARTER_ITEMS[kind].find((itemDefinition) =>
        roomStarterItemNames(itemDefinition).some((name) => sameRoomStarterIdentity(name, itemName))
    ) || null;
}

export function isCompleteRoomStarterRelation(input: {
    areaName: string;
    parentName: string;
    candidateName: string;
}) {
    const kind = getCompleteRoomStarterKind(input.areaName);

    if (!kind) return false;

    return ROOM_STARTER_ITEMS[kind].some((itemDefinition) => (
        Boolean(itemDefinition.parentName) &&
        roomStarterItemNames(itemDefinition).some((name) => sameRoomStarterIdentity(name, input.candidateName)) &&
        roomStarterParentNames(itemDefinition).some((name) => sameRoomStarterIdentity(name, input.parentName))
    ));
}

export function normalizeRoomStarterIdentity(value?: string | null) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function sameRoomStarterIdentity(first?: string | null, second?: string | null) {
    return normalizeRoomStarterIdentity(first) === normalizeRoomStarterIdentity(second);
}

function item(
    name: string,
    system: string,
    category: CompleteRoomStarterItem['category'],
    aliases: readonly string[] = [],
): CompleteRoomStarterItem {
    return { name, system, category, aliases };
}

function child(
    name: string,
    system: string,
    category: CompleteRoomStarterItem['category'],
    parentName: string,
    aliases: readonly string[] = [],
): CompleteRoomStarterItem {
    const parent = ROOM_PARENT_ALIASES[parentName] || [];

    return { name, system, category, aliases, parentName, parentAliases: parent };
}

function electrical(
    templateKey: string,
    kind: LocationNeutralStarterKind,
    name: string,
    category: CompleteRoomStarterItem['category'],
    aliases: readonly string[],
    placementTags: readonly string[],
) {
    return { templateKey, kind, name, system: 'Electrical', category, aliases, placementTags };
}
