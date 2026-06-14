export type StarterItemCategory = 'Area' | 'Fixture' | 'Equipment' | 'Component';
export type StarterItemStatus = 'Missing Information' | 'Not Inspected';

export type AreaStarterItem = {
    name: string;
    system: string;
    category: StarterItemCategory;
    status: StarterItemStatus;
    install_state: 'Unknown';
};

export type AreaTemplate = {
    id: string;
    name: string;
    icon: string;
    starterItems: Record<string, AreaStarterItem[]>;
};

export type ExistingAreaItem = {
    name: string | null;
    system: string | null;
    location?: string | null;
    parent_area?: string | null;
};

export type HomeItemInsert = {
    user_id: string;
    item_slug: string;
    name: string;
    system: string;
    category: StarterItemCategory;
    location: string;
    parent_area: string;
    status: StarterItemStatus;
    install_state: 'Unknown';
    archived: boolean;
};

const missingInfo = 'Missing Information' as const;
const notInspected = 'Not Inspected' as const;
const unknown = 'Unknown' as const;

function item(
    name: string,
    system: string,
    category: StarterItemCategory,
    status: StarterItemStatus = missingInfo
): AreaStarterItem {
    return {
        name,
        system,
        category,
        status,
        install_state: unknown,
    };
}

export const areaTemplates: AreaTemplate[] = [
    {
        id: 'kitchen',
        name: 'Kitchen',
        icon: '🍳',
        starterItems: {
            Plumbing: [
                item('Kitchen Faucet', 'Plumbing', 'Fixture'),
                item('Kitchen Sink', 'Plumbing', 'Fixture'),
                item('Dishwasher Connection', 'Plumbing', 'Component'),
                item('Refrigerator Water Line', 'Plumbing', 'Component'),
                item('Garbage Disposal', 'Plumbing', 'Equipment'),
            ],
            'Drains / Sewer': [
                item('Kitchen Sink Drain', 'Drains / Sewer', 'Fixture'),
                item('Dishwasher Drain', 'Drains / Sewer', 'Component'),
                item('Cleanout if Applicable', 'Drains / Sewer', 'Component', notInspected),
            ],
            Gas: [item('Gas Range Connection', 'Gas', 'Component', notInspected)],
            Electrical: [
                item('GFCI Outlets', 'Electrical', 'Fixture', notInspected),
                item('Garbage Disposal Switch', 'Electrical', 'Component', notInspected),
                item('Dishwasher Power', 'Electrical', 'Component', notInspected),
                item('Refrigerator Outlet', 'Electrical', 'Fixture', notInspected),
                item('Lighting', 'Electrical', 'Fixture', notInspected),
            ],
            Appliances: [
                item('Refrigerator', 'Appliances', 'Equipment'),
                item('Dishwasher', 'Appliances', 'Equipment'),
                item('Range / Oven', 'Appliances', 'Equipment'),
                item('Microwave', 'Appliances', 'Equipment'),
            ],
            Safety: [
                item('Smoke Detector', 'Safety', 'Equipment', notInspected),
                item('Fire Extinguisher', 'Safety', 'Equipment', notInspected),
            ],
        },
    },
    {
        id: 'laundry',
        name: 'Laundry',
        icon: '🧺',
        starterItems: {
            Plumbing: [
                item('Washing Machine Valves', 'Plumbing', 'Fixture'),
                item('Laundry Sink', 'Plumbing', 'Fixture'),
            ],
            'Drains / Sewer': [
                item('Laundry Standpipe', 'Drains / Sewer', 'Fixture'),
                item('Floor Drain', 'Drains / Sewer', 'Fixture', notInspected),
            ],
            Gas: [item('Dryer Gas Connection', 'Gas', 'Component', notInspected)],
            Electrical: [
                item('Washer Outlet', 'Electrical', 'Fixture', notInspected),
                item('Dryer Outlet', 'Electrical', 'Fixture', notInspected),
            ],
            Appliances: [
                item('Washing Machine', 'Appliances', 'Equipment'),
                item('Dryer', 'Appliances', 'Equipment'),
            ],
        },
    },
    {
        id: 'bathroom',
        name: 'Bathroom',
        icon: '🚿',
        starterItems: {
            Plumbing: [
                item('Bathroom Faucet', 'Plumbing', 'Fixture'),
                item('Toilet', 'Plumbing', 'Fixture'),
                item('Shower / Tub Valve', 'Plumbing', 'Fixture'),
            ],
            'Drains / Sewer': [
                item('Lavatory Drain', 'Drains / Sewer', 'Fixture'),
                item('Toilet Drain', 'Drains / Sewer', 'Fixture'),
                item('Shower / Tub Drain', 'Drains / Sewer', 'Fixture'),
            ],
            Electrical: [
                item('GFCI Outlet', 'Electrical', 'Fixture', notInspected),
                item('Bathroom Fan', 'Electrical', 'Equipment', notInspected),
                item('Vanity Lighting', 'Electrical', 'Fixture', notInspected),
            ],
            Safety: [item('GFCI Protection', 'Safety', 'Component', notInspected)],
        },
    },
    {
        id: 'master-bathroom',
        name: 'Master Bathroom',
        icon: '🛁',
        starterItems: {
            Plumbing: [
                item('Master Bathroom Faucet', 'Plumbing', 'Fixture'),
                item('Master Bathroom Toilet', 'Plumbing', 'Fixture'),
                item('Master Shower Valve', 'Plumbing', 'Fixture'),
                item('Tub Filler', 'Plumbing', 'Fixture'),
            ],
            'Drains / Sewer': [
                item('Master Lavatory Drain', 'Drains / Sewer', 'Fixture'),
                item('Master Shower Drain', 'Drains / Sewer', 'Fixture'),
                item('Tub Drain', 'Drains / Sewer', 'Fixture'),
            ],
            Electrical: [
                item('GFCI Outlet', 'Electrical', 'Fixture', notInspected),
                item('Exhaust Fan', 'Electrical', 'Equipment', notInspected),
                item('Vanity Lighting', 'Electrical', 'Fixture', notInspected),
            ],
            Safety: [item('GFCI Protection', 'Safety', 'Component', notInspected)],
        },
    },
    {
        id: 'garage',
        name: 'Garage',
        icon: '🚗',
        starterItems: {
            Plumbing: [
                item('Utility Sink', 'Plumbing', 'Fixture'),
                item('Hose Bib', 'Plumbing', 'Fixture'),
            ],
            Gas: [
                item('Gas Shutoff', 'Gas', 'Component', notInspected),
                item('Furnace Gas Connection', 'Gas', 'Component', notInspected),
            ],
            Electrical: [
                item('Garage GFCI Outlet', 'Electrical', 'Fixture', notInspected),
                item('Garage Door Opener Outlet', 'Electrical', 'Fixture', notInspected),
                item('Subpanel if Present', 'Electrical', 'Equipment', notInspected),
            ],
            Appliances: [item('Garage Refrigerator', 'Appliances', 'Equipment')],
            Safety: [
                item('Smoke Detector', 'Safety', 'Equipment', notInspected),
                item('CO Detector', 'Safety', 'Equipment', notInspected),
                item('Fire Extinguisher', 'Safety', 'Equipment', notInspected),
            ],
        },
    },
    {
        id: 'backyard',
        name: 'Backyard',
        icon: '🌿',
        starterItems: {
            Plumbing: [
                item('Hose Bib', 'Plumbing', 'Fixture'),
                item('Outdoor Sink', 'Plumbing', 'Fixture'),
                item('Irrigation Supply', 'Plumbing', 'Component'),
            ],
            'Drains / Sewer': [
                item('Area Drain', 'Drains / Sewer', 'Fixture'),
                item('Outdoor Sink Drain', 'Drains / Sewer', 'Fixture'),
            ],
            Electrical: [
                item('GFCI Outlet', 'Electrical', 'Fixture', notInspected),
                item('Outdoor Lighting', 'Electrical', 'Fixture', notInspected),
            ],
            Irrigation: [
                item('Sprinkler Valve Box', 'Irrigation', 'Equipment'),
                item('Drip Line', 'Irrigation', 'Component'),
            ],
            Safety: [item('GFCI Protection', 'Safety', 'Component', notInspected)],
        },
    },
    {
        id: 'front-yard',
        name: 'Front Yard',
        icon: '🌳',
        starterItems: {
            Plumbing: [
                item('Front Hose Bib', 'Plumbing', 'Fixture'),
                item('Irrigation Supply', 'Plumbing', 'Component'),
            ],
            'Drains / Sewer': [item('Area Drain', 'Drains / Sewer', 'Fixture')],
            Electrical: [
                item('Exterior GFCI Outlet', 'Electrical', 'Fixture', notInspected),
                item('Landscape Lighting', 'Electrical', 'Fixture', notInspected),
            ],
            Irrigation: [
                item('Sprinkler Valve Box', 'Irrigation', 'Equipment'),
                item('Irrigation Controller', 'Irrigation', 'Equipment'),
            ],
            Safety: [item('Exterior Lighting', 'Safety', 'Fixture', notInspected)],
        },
    },
    {
        id: 'pool-area',
        name: 'Pool Area',
        icon: '🏊',
        starterItems: {
            Plumbing: [
                item('Hose Bib', 'Plumbing', 'Fixture'),
                item('Outdoor Shower', 'Plumbing', 'Fixture'),
            ],
            'Drains / Sewer': [
                item('Area Drain', 'Drains / Sewer', 'Fixture'),
                item('Deck Drain', 'Drains / Sewer', 'Fixture'),
            ],
            Electrical: [
                item('GFCI Outlet', 'Electrical', 'Fixture', notInspected),
                item('Outdoor Lighting', 'Electrical', 'Fixture', notInspected),
                item('Pool Equipment Power', 'Electrical', 'Component', notInspected),
            ],
            Pool: [
                item('Pool Pump', 'Pool', 'Equipment'),
                item('Pool Filter', 'Pool', 'Equipment'),
                item('Pool Heater', 'Pool', 'Equipment'),
                item('Pool Controls', 'Pool', 'Component'),
            ],
            Irrigation: [
                item('Sprinkler Valve Box', 'Irrigation', 'Equipment'),
                item('Drip Line', 'Irrigation', 'Component'),
                item('Irrigation Controller', 'Irrigation', 'Equipment'),
            ],
            Safety: [
                item('GFCI Protection', 'Safety', 'Component', notInspected),
                item('Pool Gate / Safety Barrier', 'Safety', 'Equipment', notInspected),
            ],
        },
    },
    {
        id: 'bbq-grill-area',
        name: 'BBQ / Grill Area',
        icon: '🔥',
        starterItems: {
            Gas: [item('BBQ Gas Connection', 'Gas', 'Component', notInspected)],
            Plumbing: [item('Outdoor Sink', 'Plumbing', 'Fixture')],
            'Drains / Sewer': [item('Outdoor Sink Drain', 'Drains / Sewer', 'Fixture')],
            Electrical: [
                item('GFCI Outlet', 'Electrical', 'Fixture', notInspected),
                item('Outdoor Lighting', 'Electrical', 'Fixture', notInspected),
            ],
            Appliances: [item('Built-in Grill', 'Appliances', 'Equipment')],
            Safety: [item('Fire Extinguisher', 'Safety', 'Equipment', notInspected)],
        },
    },
    {
        id: 'outdoor-kitchen',
        name: 'Outdoor Kitchen',
        icon: '🍽️',
        starterItems: {
            Plumbing: [
                item('Outdoor Sink', 'Plumbing', 'Fixture'),
                item('Outdoor Faucet', 'Plumbing', 'Fixture'),
            ],
            'Drains / Sewer': [item('Outdoor Sink Drain', 'Drains / Sewer', 'Fixture')],
            Gas: [item('Gas Grill Connection', 'Gas', 'Component', notInspected)],
            Electrical: [
                item('GFCI Outlet', 'Electrical', 'Fixture', notInspected),
                item('Appliance Power', 'Electrical', 'Component', notInspected),
            ],
            Appliances: [
                item('Outdoor Refrigerator', 'Appliances', 'Equipment'),
                item('Built-in Grill', 'Appliances', 'Equipment'),
            ],
            Safety: [item('Fire Extinguisher', 'Safety', 'Equipment', notInspected)],
        },
    },
    {
        id: 'koi-pond-area',
        name: 'Koi Pond Area',
        icon: '💧',
        starterItems: {
            Plumbing: [
                item('Pond Fill Valve', 'Plumbing', 'Fixture'),
                item('Pond Supply Line', 'Plumbing', 'Component'),
            ],
            Electrical: [
                item('GFCI Outlet', 'Electrical', 'Fixture', notInspected),
                item('Pond Pump Power', 'Electrical', 'Component', notInspected),
            ],
            Pool: [
                item('Pond Pump', 'Pool', 'Equipment'),
                item('Pond Filter', 'Pool', 'Equipment'),
                item('Water Feature Controls', 'Pool', 'Component'),
            ],
            Safety: [item('GFCI Protection', 'Safety', 'Component', notInspected)],
        },
    },
    {
        id: 'water-heater-area',
        name: 'Water Heater Area',
        icon: '🔥',
        starterItems: {
            Plumbing: [
                item('Water Heater', 'Plumbing', 'Equipment'),
                item('Cold Water Shutoff', 'Plumbing', 'Component'),
                item('Expansion Tank', 'Plumbing', 'Equipment'),
                item('T&P Discharge Line', 'Plumbing', 'Component'),
            ],
            Gas: [item('Water Heater Gas Connection', 'Gas', 'Component', notInspected)],
            Electrical: [item('Water Heater Power', 'Electrical', 'Component', notInspected)],
            Safety: [
                item('Seismic Straps', 'Safety', 'Component', notInspected),
                item('CO Detector', 'Safety', 'Equipment', notInspected),
            ],
        },
    },
    {
        id: 'main-shutoff-area',
        name: 'Main Shutoff Area',
        icon: '💧',
        starterItems: {
            Plumbing: [
                item('Main Water Shutoff', 'Plumbing', 'Equipment'),
                item('Pressure Regulator Valve', 'Plumbing', 'Equipment'),
                item('Backflow Preventer', 'Plumbing', 'Equipment'),
                item('Whole House Filter', 'Plumbing', 'Equipment'),
            ],
            Irrigation: [item('Irrigation Shutoff', 'Irrigation', 'Component')],
            Safety: [item('Emergency Water Shutoff', 'Safety', 'Component', notInspected)],
        },
    },
    {
        id: 'mechanical-room',
        name: 'Mechanical Room',
        icon: '⚙️',
        starterItems: {
            Plumbing: [
                item('Condensate Drain', 'Plumbing', 'Component'),
                item('Utility Sink', 'Plumbing', 'Fixture'),
            ],
            HVAC: [
                item('Air Handler', 'HVAC', 'Equipment'),
                item('Furnace', 'HVAC', 'Equipment'),
                item('Condensate Pump', 'HVAC', 'Equipment'),
            ],
            Electrical: [
                item('Service Outlet', 'Electrical', 'Fixture', notInspected),
                item('Equipment Disconnect', 'Electrical', 'Component', notInspected),
            ],
            Safety: [
                item('Smoke Detector', 'Safety', 'Equipment', notInspected),
                item('CO Detector', 'Safety', 'Equipment', notInspected),
            ],
        },
    },
    {
        id: 'attic',
        name: 'Attic',
        icon: '📦',
        starterItems: {
            HVAC: [
                item('Air Handler', 'HVAC', 'Equipment'),
                item('Ductwork', 'HVAC', 'Component'),
                item('Condensate Drain', 'HVAC', 'Component'),
            ],
            Electrical: [
                item('Attic Light', 'Electrical', 'Fixture', notInspected),
                item('Service Outlet', 'Electrical', 'Fixture', notInspected),
            ],
            Safety: [
                item('Smoke Detector', 'Safety', 'Equipment', notInspected),
                item('Access Ladder', 'Safety', 'Component', notInspected),
            ],
        },
    },
    {
        id: 'crawlspace',
        name: 'Crawlspace',
        icon: '🏠',
        starterItems: {
            Plumbing: [
                item('Water Supply Lines', 'Plumbing', 'Component'),
                item('Main Shutoff if Present', 'Plumbing', 'Component'),
            ],
            'Drains / Sewer': [
                item('Drain Piping', 'Drains / Sewer', 'Component'),
                item('Cleanout if Present', 'Drains / Sewer', 'Component', notInspected),
            ],
            Electrical: [item('Crawlspace Lighting', 'Electrical', 'Fixture', notInspected)],
            Safety: [
                item('Vapor Barrier', 'Safety', 'Component', notInspected),
                item('Access Hatch', 'Safety', 'Component', notInspected),
            ],
        },
    },
    {
        id: 'custom-area',
        name: 'Custom Area',
        icon: '➕',
        starterItems: {},
    },
];

export function getAreaTemplate(id: string) {
    return areaTemplates.find((template) => template.id === id) || null;
}

export function getStarterItems(template: AreaTemplate) {
    return Object.values(template.starterItems).flat();
}

export function makeSlug(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export function makeAreaSlug(areaName: string, system: string) {
    return makeSlug(`${areaName}-${system}-area`);
}

export function makeStarterItemSlug(areaName: string, item: AreaStarterItem) {
    return makeSlug(`${areaName}-${item.system}-${item.name}`);
}

export function duplicateKey(system: string, areaName: string, itemName: string) {
    return [system, areaName, itemName].map(normalize).join('|');
}

export function existingDuplicateKeys(items: ExistingAreaItem[]) {
    return new Set(
        items.map((item) =>
            duplicateKey(
                item.system || '',
                item.location || item.parent_area || '',
                item.name || ''
            )
        )
    );
}

export function buildAreaRow(userId: string, areaName: string, system: string): HomeItemInsert {
    return {
        user_id: userId,
        item_slug: makeAreaSlug(areaName, system),
        name: areaName,
        system,
        category: 'Area',
        location: areaName,
        parent_area: '',
        status: missingInfo,
        install_state: unknown,
        archived: false,
    };
}

export function buildStarterRows(userId: string, areaName: string, template: AreaTemplate): HomeItemInsert[] {
    return getStarterItems(template).map((starterItem) => ({
        user_id: userId,
        item_slug: makeStarterItemSlug(areaName, starterItem),
        name: starterItem.name,
        system: starterItem.system,
        category: starterItem.category,
        location: areaName,
        parent_area: '',
        status: starterItem.status,
        install_state: starterItem.install_state,
        archived: false,
    }));
}

function normalize(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
