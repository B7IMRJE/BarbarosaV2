import { getSystemDefinition } from './homeSystems';
import type { SystemDefaults } from './systemDefaults';

export const createItemCategories = [
    'Area',
    'Fixture',
    'Equipment',
    'Component',
    'Documents',
    'Work History',
];

type SuggestionContext = {
    area?: string | null;
    system?: string | null;
    category?: string | null;
    fallbackSuggestions?: string[];
};

type KitchenSuggestionMap = Record<string, string[]>;

const kitchenSystemSuggestions: KitchenSuggestionMap = {
    Plumbing: [
        'Kitchen Faucet',
        'Hot Water Supply',
        'Cold Water Supply',
        'Dishwasher Connection',
        'Refrigerator Water Line',
        'Ice Maker Line',
        'Instant Hot Water Dispenser',
        'Pot Filler',
        'Sink Shutoff Valves',
    ],
    'Drains / Sewer': [
        'Kitchen Sink Drain',
        'Garbage Disposal Drain',
        'Dishwasher Drain Hose',
        'Air Gap',
        'Cleanout',
        'P-Trap',
    ],
    Electrical: [
        'GFCI Receptacle',
        'Dishwasher Outlet',
        'Garbage Disposal Outlet',
        'Refrigerator Outlet',
        'Microwave Outlet',
        'Range Circuit',
        'Kitchen Lighting',
        'Under-Cabinet Lighting',
        'Island Outlet',
        'Switch',
        '3-Way Switch',
        'Dimmer Switch',
    ],
    Appliances: [
        'Refrigerator',
        'Dishwasher',
        'Stove',
        'Oven',
        'Microwave',
        'Range Hood',
        'Garbage Disposal',
        'Ice Maker',
    ],
    HVAC: [
        'Supply Vent',
        'Return Vent',
        'Range Hood Exhaust',
        'Makeup Air Vent',
        'Air Quality Sensor',
    ],
    Gas: [
        'Gas Stove Connection',
        'Gas Shutoff Valve',
        'Flexible Gas Connector',
        'Range Gas Line',
    ],
    Safety: [
        'Smoke Detector',
        'Carbon Monoxide Detector',
        'Fire Extinguisher',
        'Gas Leak Detector',
        'Water Leak Sensor',
    ],
    'Water Quality': [
        'Refrigerator Filter',
        'Under-Sink Filter',
        'Reverse Osmosis Faucet',
        'Reverse Osmosis System',
        'Instant Hot Filter',
    ],
    Documents: [
        'Appliance Manual',
        'Appliance Warranty',
        'Remodel Photos',
        'Permit Document',
        'Inspection Report',
        'Receipt',
    ],
};

const kitchenCategorySuggestions: KitchenSuggestionMap = {
    Documents: [
        'Appliance Manual',
        'Appliance Warranty',
        'Remodel Photos',
        'Permit Document',
        'Inspection Report',
        'Receipt',
    ],
    'Work History': [
        'Repipe Photos',
        'Leak Repair Photos',
        'Drain Repair Photos',
        'Cabinet Removal Photos',
        'Drywall Repair Photos',
        'Before Photos',
        'After Photos',
        'Technician Notes',
        'Invoice',
    ],
};

export function getGenericItemSuggestions(defaults: SystemDefaults, category?: string | null) {
    if (sameText(category, 'Area')) return defaults.areas;
    if (sameText(category, 'Fixture')) return defaults.fixtures;
    if (sameText(category, 'Equipment') || sameText(category, 'Component')) return defaults.equipment;

    return [];
}

export function getItemSuggestions({
    area,
    system,
    category,
    fallbackSuggestions = [],
}: SuggestionContext) {
    if (!sameText(area, 'Kitchen')) {
        return fallbackSuggestions;
    }

    const categorySuggestions = getByNormalizedKey(kitchenCategorySuggestions, category);

    if (categorySuggestions) {
        return categorySuggestions;
    }

    const systemKey = getSystemDefinition(system)?.key || system || '';
    const systemSuggestions = getByNormalizedKey(kitchenSystemSuggestions, systemKey);

    return systemSuggestions || fallbackSuggestions;
}

function getByNormalizedKey(map: KitchenSuggestionMap, key?: string | null) {
    const normalizedKey = normalize(key);
    const match = Object.keys(map).find((mapKey) => normalize(mapKey) === normalizedKey);

    return match ? map[match] : null;
}

function sameText(a?: string | null, b?: string | null) {
    return normalize(a) === normalize(b);
}

function normalize(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
