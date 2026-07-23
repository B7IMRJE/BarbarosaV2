import { getSystemDefinition } from './homeSystems';

export type SystemDefaults = {
    areas: string[];
    fixtures: string[];
    equipment: string[];
};

export type BroadZoneDefinition = {
    area: string;
    suggestedChildAreas: string[];
};

export const broadZoneDefinitions: BroadZoneDefinition[] = [
    {
        area: 'Exterior',
        suggestedChildAreas: [
            'Outdoor Laundry',
            'Backyard',
            'Front Yard',
            'Side Yard',
            'Patio',
            'Balcony',
            'Roof',
            'Crawl Space',
            'Other Exterior Area',
        ],
    },
];

export function normalizeAreaName(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getBroadZoneDefinition(area?: string | null) {
    const normalizedArea = normalizeAreaName(area);

    return broadZoneDefinitions.find((zone) => normalizeAreaName(zone.area) === normalizedArea) || null;
}

export function isBroadZoneArea(area?: string | null) {
    return !!getBroadZoneDefinition(area);
}

export function getSuggestedChildAreas(area?: string | null) {
    return getBroadZoneDefinition(area)?.suggestedChildAreas || [];
}

const waterServiceDefaults: SystemDefaults = {
    areas: [
        'Kitchen',
        'Master Bathroom',
        'Bathroom 2',
        'Laundry',
        'Garage',
        'Exterior',
        'Water Heater Area',
        'Main Shutoff Area',
    ],
    fixtures: [
        'Kitchen Faucet',
        'Bathroom Faucet',
        'Shower',
        'Tub',
        'Toilet',
        'Hose Bib',
        'Laundry Valves',
        'Ice Maker Line',
    ],
    equipment: [
        'Water Heater',
        'Main Water Shutoff',
        'Pressure Regulator Valve',
        'Expansion Tank',
        'Water Softener',
        'Whole House Filter',
        'Backflow Preventer',
        'Sump Pump',
    ],
};

export const systemDefaultsByKey: Record<string, SystemDefaults> = {
    Plumbing: waterServiceDefaults,
    Gas: {
        areas: [
            'Garage',
            'Kitchen',
            'Laundry',
            'Fireplace',
            'Exterior',
            'BBQ / Grill Area',
        ],
        fixtures: [
            'Gas Range Connection',
            'Dryer Gas Connection',
            'Fireplace Gas Valve',
            'BBQ Gas Stub',
            'Gas Shutoff Valve',
        ],
        equipment: [
            'Gas Meter',
            'Gas Regulator',
            'Gas Water Heater',
            'Furnace',
            'Pool Heater',
            'Generator Gas Line',
        ],
    },
    'Drains / Sewer': {
        areas: [
            'Kitchen',
            'Bathrooms',
            'Laundry',
            'Garage',
            'Exterior Cleanout',
            'Sewer Line',
            'Basement / Crawlspace',
        ],
        fixtures: [
            'Sink Drain',
            'Toilet Drain',
            'Shower Drain',
            'Tub Drain',
            'Floor Drain',
            'Laundry Standpipe',
        ],
        equipment: [
            'Main Sewer Cleanout',
            'Secondary Cleanout',
            'Sewer Line',
            'Backwater Valve',
            'Ejector Pump',
            'Camera Inspection',
        ],
    },
    HVAC: {
        areas: [
            'Attic',
            'Hallway',
            'Garage',
            'Exterior Condenser Area',
            'Living Room',
        ],
        fixtures: [
            'Supply Vent',
            'Return Vent',
            'Thermostat',
            'Condensate Drain',
            'Filter Grille',
        ],
        equipment: [
            'Air Handler',
            'Exterior Condenser',
            'Furnace',
            'Heat Pump',
            'Thermostat',
            'Condensate Pump',
        ],
    },
    Electrical: {
        areas: [
            'Main Panel',
            'Garage',
            'Exterior',
            'Kitchen',
            'Bedrooms',
            'Living Room',
        ],
        fixtures: [
            'Outlet',
            'GFCI Outlet',
            'Light Switch',
            'Light Fixture',
            'Ceiling Fan',
            'Exterior Lighting',
        ],
        equipment: [
            'Main Electrical Panel',
            'Subpanel',
            'Breaker',
            'GFCI Protection',
            'Generator Inlet',
            'EV Charger',
        ],
    },
    Safety: {
        areas: [
            'Bedrooms',
            'Hallway',
            'Kitchen',
            'Garage',
            'Mechanical Room',
            'Exterior',
        ],
        fixtures: [
            'Smoke Detector',
            'CO Detector',
            'Fire Extinguisher',
            'Alarm Keypad',
            'Emergency Shutoff',
        ],
        equipment: [
            'Smoke Alarm System',
            'CO Alarm System',
            'Security Alarm',
            'Water Shutoff',
            'Gas Shutoff',
            'Fire Sprinkler Riser',
        ],
    },
    Irrigation: {
        areas: [
            'Front Yard',
            'Back Yard',
            'Side Yard',
            'Planter Beds',
            'Controller Area',
            'Valve Box Area',
        ],
        fixtures: [
            'Sprinkler Head',
            'Drip Emitter',
            'Hose Bib',
            'Irrigation Valve',
            'Backflow Device',
        ],
        equipment: [
            'Irrigation Controller',
            'Valve Box',
            'Backflow Preventer',
            'Pressure Vacuum Breaker',
            'Irrigation Pump',
            'Rain Sensor',
        ],
    },
    Pool: {
        areas: [
            'Pool',
            'Spa / Jacuzzi',
            'Equipment Pad',
            'Outdoor Shower',
            'BBQ / Grill Area',
            'Water Features',
            'Pool Deck',
        ],
        fixtures: [
            'Pool Light',
            'Spa Jet',
            'Skimmer',
            'Pool Return',
            'Main Drain',
            'Outdoor Shower',
        ],
        equipment: [
            'Pool Pump',
            'Spa Pump',
            'Pool Heater',
            'Pool Filter',
            'Salt Cell',
            'Automation Controller',
            'Chemical Feeder',
        ],
    },
};

export function getSystemDefaults(system?: string | null): SystemDefaults {
    const canonicalKey = getSystemDefinition(system)?.key || system || 'Plumbing';

    return systemDefaultsByKey[canonicalKey] || {
        areas: ['Garage', 'Exterior', 'Kitchen', 'Living Room', 'Other'],
        fixtures: ['Fixture', 'Control', 'Outlet', 'Valve'],
        equipment: ['Equipment', 'Main Component', 'Controller'],
    };
}

export function getAreaIcon(area: string) {
    const lowerArea = area.toLowerCase();

    if (lowerArea.includes('kitchen')) return '🍳';
    if (lowerArea.includes('bath') || lowerArea.includes('shower') || lowerArea.includes('spa') || lowerArea.includes('jacuzzi')) return '🚿';
    if (lowerArea.includes('laundry')) return '🧺';
    if (lowerArea.includes('garage')) return '🚗';
    if (lowerArea.includes('attic')) return '📦';
    if (lowerArea.includes('hall')) return '🚪';
    if (lowerArea.includes('panel') || lowerArea.includes('electrical')) return '⚡';
    if (lowerArea.includes('pool')) return '🏊';
    if (lowerArea.includes('yard') || lowerArea.includes('irrigation')) return '🌿';
    if (lowerArea.includes('gas') || lowerArea.includes('bbq') || lowerArea.includes('grill')) return '🔥';
    if (lowerArea.includes('sewer') || lowerArea.includes('drain') || lowerArea.includes('cleanout')) return '🧰';
    if (lowerArea.includes('exterior') || lowerArea.includes('deck')) return '🏠';
    if (lowerArea.includes('living') || lowerArea.includes('bedroom')) return '🛋️';
    if (lowerArea.includes('safety') || lowerArea.includes('alarm')) return '🛡️';

    return '🏠';
}
