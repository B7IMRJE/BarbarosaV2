import {
    buildAreaRow,
    makeSlug,
    type ExistingAreaItem,
    type HomeItemInsert,
    type StarterItemCategory,
} from './areaTemplates';
import { getSystemDefinition } from './homeSystems';
import { supabase } from './supabase';

export type StarterHomeArea = {
    name: string;
    system: string;
    parentArea?: string;
    starterItems: StarterHomeItem[];
};

export type StarterHomeItem = {
    name: string;
    system: string;
    category: StarterItemCategory;
    aliases?: string[];
};

export type ExistingStarterHomeItem = ExistingAreaItem & {
    item_slug?: string | null;
    archived?: boolean | null;
};

export type StarterHomeSetupScope = {
    userId: string;
    propertyId: string;
};

export type StarterHomeSetupPlanResult = {
    rowsToInsert: HomeItemInsert[];
    createdAreaRows: number;
    createdItemRows: number;
    alreadyPresentAreaRows: number;
    alreadyPresentItemRows: number;
    skippedDuplicateRows: number;
};

export const STARTER_ITEM_STATUS = 'Missing Information' as const;
export const STARTER_ITEM_INSTALL_STATE = 'Unknown' as const;

export function buildDefaultStarterHomePlan(propertyType?: string | null): StarterHomeArea[] {
    const normalizedPropertyType = normalizeIdentity(propertyType);
    const compactHome = ['condo', 'apartment'].includes(normalizedPropertyType);

    return buildStarterHomePlan({
        bathrooms: compactHome ? 1 : 2,
        includeKitchen: true,
        includeLaundry: true,
        includeGarage: !compactHome,
        includeWaterHeater: true,
        includeHvac: true,
        includeExterior: !compactHome,
        includePool: false,
    });
}

export function buildStarterHomePlan({
    bathrooms = 2,
    includeKitchen = true,
    includeLaundry = true,
    includeGarage = true,
    includeWaterHeater = true,
    includeHvac = true,
    includeExterior = true,
    includePool = false,
}: {
    bathrooms?: number;
    includeKitchen?: boolean;
    includeLaundry?: boolean;
    includeGarage?: boolean;
    includeWaterHeater?: boolean;
    includeHvac?: boolean;
    includeExterior?: boolean;
    includePool?: boolean;
} = {}): StarterHomeArea[] {
    const plan: StarterHomeArea[] = [];

    if (includeKitchen) plan.push(starterArea('Kitchen', 'Plumbing', kitchenStarterItems()));

    for (let index = 1; index <= Math.max(0, Math.floor(bathrooms)); index += 1) {
        plan.push(starterArea(index === 1 ? 'Bathroom 1' : `Bathroom ${index}`, 'Plumbing', bathroomStarterItems()));
    }

    if (includeLaundry) plan.push(starterArea('Laundry', 'Plumbing', laundryStarterItems()));
    if (includeGarage) plan.push(starterArea('Garage', 'Plumbing', garageStarterItems(includeWaterHeater)));

    if (includeWaterHeater || includeHvac) {
        plan.push(starterArea('Mechanical Area', includeHvac ? 'HVAC' : 'Plumbing', mechanicalStarterItems(includeWaterHeater, includeHvac)));
    }

    if (includeExterior) {
        plan.push(starterArea('Exterior', 'Plumbing', []));
        plan.push(starterArea('Front Yard', 'Plumbing', exteriorStarterItems('Front Yard'), 'Exterior'));
        plan.push(starterArea('Back Yard', 'Plumbing', exteriorStarterItems('Back Yard'), 'Exterior'));
    }

    if (includePool) plan.push(starterArea('Pool Area', 'Pool', poolStarterItems()));

    return plan;
}

export function buildStarterHomeSetupPreview({
    existingItems,
    plan,
    propertyId,
    userId,
}: StarterHomeSetupScope & {
    existingItems: ExistingStarterHomeItem[];
    plan: StarterHomeArea[];
}): StarterHomeSetupPlanResult {
    const existingIdentityKeys = new Set<string>();
    const existingSlugs = new Set<string>();

    existingItems
        .filter((item) => item.archived !== true)
        .forEach((item) => {
            addAll(existingIdentityKeys, identityKeysForExistingItem(item));

            const slug = normalizeSlug(item.item_slug);
            if (slug) existingSlugs.add(slug);
        });

    const plannedIdentityKeys = new Set<string>();
    const plannedSlugs = new Set<string>();
    const rowsToInsert: HomeItemInsert[] = [];
    let createdAreaRows = 0;
    let createdItemRows = 0;
    let alreadyPresentAreaRows = 0;
    let alreadyPresentItemRows = 0;
    let skippedDuplicateRows = 0;

    plan.forEach((area) => {
        const areaRow = buildAreaRow(userId, propertyId, area.name, area.system, area.parentArea || '');
        const areaIdentityKeys = identityKeysForPlannedArea(area);
        const areaSlugs = slugKeysForPlannedArea(area);
        const areaPresent = hasAny(existingIdentityKeys, areaIdentityKeys) || hasAny(existingSlugs, areaSlugs);
        const areaAlreadyPlanned = hasAny(plannedIdentityKeys, areaIdentityKeys) || hasAny(plannedSlugs, areaSlugs);

        if (areaPresent) {
            alreadyPresentAreaRows += 1;
        } else if (areaAlreadyPlanned) {
            skippedDuplicateRows += 1;
        } else {
            rowsToInsert.push(areaRow);
            createdAreaRows += 1;
        }

        addAll(plannedIdentityKeys, areaIdentityKeys);
        addAll(plannedSlugs, areaSlugs);

        area.starterItems.forEach((starterItem) => {
            const itemRow = buildStarterItemRow(userId, propertyId, area, starterItem);
            const itemIdentityKeys = identityKeysForPlannedItem(area, starterItem);
            const itemSlugs = slugKeysForPlannedItem(area, starterItem);
            const plannedItemIdentityKeys = identityKeysForPlannedPrimaryItem(area, starterItem);
            const plannedItemSlugs = slugKeysForPlannedPrimaryItem(area, starterItem);
            const itemPresent = hasAny(existingIdentityKeys, itemIdentityKeys) || hasAny(existingSlugs, itemSlugs);
            const itemAlreadyPlanned = hasAny(plannedIdentityKeys, plannedItemIdentityKeys) || hasAny(plannedSlugs, plannedItemSlugs);

            if (itemPresent) {
                alreadyPresentItemRows += 1;
            } else if (itemAlreadyPlanned) {
                skippedDuplicateRows += 1;
            } else {
                rowsToInsert.push(itemRow);
                createdItemRows += 1;
            }

            addAll(plannedIdentityKeys, plannedItemIdentityKeys);
            addAll(plannedSlugs, plannedItemSlugs);
        });
    });

    return {
        rowsToInsert,
        createdAreaRows,
        createdItemRows,
        alreadyPresentAreaRows,
        alreadyPresentItemRows,
        skippedDuplicateRows,
    };
}

export async function createMissingStarterHomeItems(
    scope: StarterHomeSetupScope,
    plan: StarterHomeArea[]
): Promise<StarterHomeSetupPlanResult> {
    const { data, error } = await supabase
        .from('home_items')
        .select('name, system, category, location, parent_area, item_slug, archived')
        .eq('property_id', scope.propertyId)
        .or('archived.eq.false,archived.is.null');

    if (error) {
        throw new Error(`Could not check starter equipment: ${error.message}`);
    }

    const preview = buildStarterHomeSetupPreview({
        ...scope,
        existingItems: (data || []) as ExistingStarterHomeItem[],
        plan,
    });

    if (preview.rowsToInsert.length === 0) return preview;

    const { error: insertError } = await supabase.from('home_items').insert(preview.rowsToInsert);

    if (insertError) {
        throw new Error(`Starter equipment could not be created: ${insertError.message}`);
    }

    return preview;
}

export function starterPlanContainsArea(plan: StarterHomeArea[], areaName: string, parentArea = '') {
    return plan.some((area) =>
        sameIdentity(area.name, areaName) &&
        sameIdentity(area.parentArea || '', parentArea)
    );
}

export function starterSetupHasMissingRecords(result: StarterHomeSetupPlanResult | null) {
    return !!result && result.rowsToInsert.length > 0;
}

export function formatStarterSetupResult(result: StarterHomeSetupPlanResult) {
    const createdParts = [
        `${result.createdItemRows} starter card${result.createdItemRows === 1 ? '' : 's'}`,
        `${result.createdAreaRows} area${result.createdAreaRows === 1 ? '' : 's'}`,
    ];

    return [
        `Created ${createdParts.join(' and ')}.`,
        `${result.alreadyPresentItemRows} starter card${result.alreadyPresentItemRows === 1 ? '' : 's'} already present.`,
        `${result.skippedDuplicateRows} duplicate${result.skippedDuplicateRows === 1 ? '' : 's'} skipped.`,
    ].join(' ');
}

function starterArea(name: string, system: string, starterItems: StarterHomeItem[], parentArea = ''): StarterHomeArea {
    return { name, system, starterItems, parentArea };
}

function starterItem(
    name: string,
    system: string,
    category: StarterItemCategory,
    aliases: string[] = []
): StarterHomeItem {
    return { name, system, category, aliases };
}

function kitchenStarterItems(): StarterHomeItem[] {
    return [
        starterItem('Kitchen Faucet', 'Plumbing', 'Fixture'),
        starterItem('Kitchen Sink', 'Plumbing', 'Fixture', ['Sink']),
        starterItem('Garbage Disposal', 'Plumbing', 'Equipment'),
        starterItem('Dishwasher', 'Appliances', 'Equipment'),
        starterItem('Dishwasher Supply Line', 'Plumbing', 'Component', ['Dishwasher Connection']),
        starterItem('Dishwasher Drain Line', 'Drains / Sewer', 'Component', ['Dishwasher Drain Hose', 'Dishwasher Drain']),
        starterItem('Dishwasher Air Gap', 'Plumbing', 'Component', ['Air Gap']),
        starterItem('Kitchen Drain / P-Trap', 'Drains / Sewer', 'Fixture', ['Sink Drain', 'P-Trap', 'Kitchen Drain']),
        starterItem('Kitchen Hot Angle Stop', 'Plumbing', 'Component', ['Hot Angle Stop', 'Kitchen Angle Stops', 'Angle Stops']),
        starterItem('Kitchen Cold Angle Stop', 'Plumbing', 'Component', ['Cold Angle Stop', 'Kitchen Angle Stops', 'Angle Stops']),
        starterItem('Refrigerator Water Line', 'Plumbing', 'Component', ['Ice Maker Line']),
        starterItem('Stove / Range', 'Appliances', 'Equipment', ['Stove', 'Range']),
        starterItem('Kitchen GFCI / Outlets', 'Electrical', 'Fixture', ['GFCI Outlet', 'Kitchen GFCI Outlet']),
    ];
}

function bathroomStarterItems(): StarterHomeItem[] {
    return [
        starterItem('Bathroom Sink / Faucet', 'Plumbing', 'Fixture', ['Bathroom Faucet']),
        starterItem('Toilet', 'Plumbing', 'Fixture'),
        starterItem('Shower / Tub', 'Plumbing', 'Fixture', ['Shower / Tub Valve', 'Shower', 'Tub']),
        starterItem('Bathroom Drain', 'Drains / Sewer', 'Fixture', ['Lavatory Drain']),
        starterItem('Bathroom Angle Stops', 'Plumbing', 'Component'),
        starterItem('Bathroom GFCI / Outlets', 'Electrical', 'Fixture', ['GFCI Outlet']),
    ];
}

function laundryStarterItems(): StarterHomeItem[] {
    return [
        starterItem('Washer Valves', 'Plumbing', 'Fixture', ['Washing Machine Valves', 'Laundry Valves']),
        starterItem('Washer Drain', 'Drains / Sewer', 'Fixture', ['Laundry Standpipe']),
        starterItem('Dryer Vent', 'Appliances', 'Component'),
        starterItem('Laundry Sink', 'Plumbing', 'Fixture'),
    ];
}

function garageStarterItems(includeWaterHeater: boolean): StarterHomeItem[] {
    const items = [
        starterItem('Main Water Shutoff', 'Plumbing', 'Equipment'),
        starterItem('Pressure Regulator / PRV', 'Plumbing', 'Equipment', ['Pressure Regulator Valve']),
        starterItem('Whole Home Filter / Halo 5', 'Water Quality', 'Equipment', ['Whole House Filter']),
    ];

    if (!includeWaterHeater) return items;

    return [
        starterItem('Water Heater', 'Plumbing', 'Equipment'),
        starterItem('Expansion Tank', 'Plumbing', 'Equipment'),
        starterItem('T&P Valve', 'Plumbing', 'Component', ['T&P Discharge Line']),
        starterItem('Water Heater Drain Pan', 'Plumbing', 'Component'),
        ...items,
    ];
}

function mechanicalStarterItems(includeWaterHeater: boolean, includeHvac: boolean): StarterHomeItem[] {
    const items: StarterHomeItem[] = [];

    if (includeWaterHeater) {
        items.push(
            starterItem('Water Heater', 'Plumbing', 'Equipment'),
            starterItem('Expansion Tank', 'Plumbing', 'Equipment'),
            starterItem('T&P Valve', 'Plumbing', 'Component', ['T&P Discharge Line']),
            starterItem('Water Heater Drain Pan', 'Plumbing', 'Component'),
            starterItem('Main Water Shutoff', 'Plumbing', 'Equipment'),
            starterItem('Pressure Regulator / PRV', 'Plumbing', 'Equipment', ['Pressure Regulator Valve']),
            starterItem('Whole Home Filter / Halo 5', 'Water Quality', 'Equipment', ['Whole House Filter'])
        );
    }

    if (includeHvac) {
        items.push(
            starterItem('HVAC System', 'HVAC', 'Equipment'),
            starterItem('Air Filter', 'HVAC', 'Component'),
            starterItem('Condensate Drain', 'HVAC', 'Component'),
            starterItem('Safety Switch / Float Switch', 'HVAC', 'Component'),
            starterItem('Coil / Air Handler', 'HVAC', 'Equipment')
        );
    }

    return items;
}

function exteriorStarterItems(yardLabel: 'Front Yard' | 'Back Yard'): StarterHomeItem[] {
    return [
        starterItem(`${yardLabel} Hose Bibbs`, 'Exterior', 'Fixture', ['Hose Bib', `${yardLabel} Hose Bib`]),
        starterItem(`${yardLabel} Main Cleanout`, 'Exterior', 'Fixture', ['Main Cleanout']),
        starterItem(`Irrigation ${yardLabel}`, 'Irrigation', 'Equipment', ['Irrigation Supply', 'Irrigation Controller']),
    ];
}

function poolStarterItems(): StarterHomeItem[] {
    return [
        starterItem('Pool Equipment', 'Pool', 'Equipment'),
        starterItem('Pool Pump', 'Pool', 'Equipment'),
        starterItem('Pool Filter', 'Pool', 'Equipment'),
    ];
}

function buildStarterItemRow(
    userId: string,
    propertyId: string,
    area: StarterHomeArea,
    starterCard: StarterHomeItem
): HomeItemInsert {
    return {
        user_id: userId,
        property_id: propertyId,
        item_slug: makeSlug([area.parentArea, area.name, starterCard.system, starterCard.name].filter(Boolean).join('-')),
        name: starterCard.name,
        system: starterCard.system,
        category: starterCard.category,
        location: area.name,
        parent_area: area.parentArea || '',
        status: STARTER_ITEM_STATUS,
        install_state: STARTER_ITEM_INSTALL_STATE,
        archived: false,
    };
}

function identityKeysForExistingItem(item: ExistingStarterHomeItem) {
    if (sameIdentity(item.category, 'Area')) {
        return identityKeysForArea(
            item.system || '',
            item.name || item.location || '',
            item.parent_area || ''
        );
    }

    return identityKeysForItem(
        item.system || '',
        item.location || item.parent_area || '',
        item.name || '',
        item.location ? item.parent_area || '' : ''
    );
}

function identityKeysForPlannedArea(area: StarterHomeArea) {
    return identityKeysForArea(area.system, area.name, area.parentArea || '');
}

function identityKeysForPlannedItem(area: StarterHomeArea, item: StarterHomeItem) {
    return [item.name, ...(item.aliases || [])].flatMap((name) =>
        identityKeysForItem(item.system, area.name, name, area.parentArea || '')
    );
}

function identityKeysForPlannedPrimaryItem(area: StarterHomeArea, item: StarterHomeItem) {
    return identityKeysForItem(item.system, area.name, item.name, area.parentArea || '');
}

function identityKeysForArea(system: string, areaName: string, parentArea = '') {
    return [
        ['area', canonicalSystem(system), normalizeIdentity(parentArea), normalizeIdentity(areaName)].join('|'),
    ];
}

function identityKeysForItem(system: string, areaName: string, itemName: string, parentArea = '') {
    return [
        ['item', canonicalSystem(system), normalizeIdentity(parentArea), normalizeIdentity(areaName), normalizeIdentity(itemName)].join('|'),
    ];
}

function slugKeysForPlannedArea(area: StarterHomeArea) {
    return new Set([
        makeSlug([area.parentArea, area.name, area.system, 'area'].filter(Boolean).join('-')),
        makeSlug([area.parentArea, area.name, 'area'].filter(Boolean).join('-')),
    ].map(normalizeSlug));
}

function slugKeysForPlannedItem(area: StarterHomeArea, item: StarterHomeItem) {
    return new Set(
        [item.name, ...(item.aliases || [])].flatMap((name) => [
            makeSlug([area.parentArea, area.name, item.system, name].filter(Boolean).join('-')),
            makeSlug([area.parentArea, area.name, name].filter(Boolean).join('-')),
        ]).map(normalizeSlug)
    );
}

function slugKeysForPlannedPrimaryItem(area: StarterHomeArea, item: StarterHomeItem) {
    return new Set([
        makeSlug([area.parentArea, area.name, item.system, item.name].filter(Boolean).join('-')),
        makeSlug([area.parentArea, area.name, item.name].filter(Boolean).join('-')),
    ].map(normalizeSlug));
}

function canonicalSystem(system: string) {
    return normalizeIdentity(getSystemDefinition(system)?.key || system);
}

function sameIdentity(a?: string | null, b?: string | null) {
    return normalizeIdentity(a) === normalizeIdentity(b);
}

function normalizeIdentity(value?: string | null) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeSlug(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function hasAny<T>(haystack: Set<T>, needles: Iterable<T>) {
    for (const needle of needles) {
        if (haystack.has(needle)) return true;
    }

    return false;
}

function addAll<T>(target: Set<T>, values: Iterable<T>) {
    for (const value of values) {
        target.add(value);
    }
}
