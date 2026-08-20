export type PropertyAreaScope = 'interior' | 'exterior' | 'unclassified';

export type PropertyAreaCatalogCard = {
    name: string;
    scope: Exclude<PropertyAreaScope, 'unclassified'>;
};

export type PropertyAreaRecord = {
    id: string;
    name: string | null;
    system: string | null;
    area_scope?: string | null;
    parent_area?: string | null;
    archived?: boolean | null;
};

export type PropertyAreaRelationRecord = {
    category?: string | null;
    location?: string | null;
    parent_area?: string | null;
};

const interiorAreas = [
    'Kitchen', 'Living Room', 'Dining Room', 'Hallway', 'Garage', 'Laundry Room',
    'Primary Bedroom', 'Bedroom', 'Primary Bathroom', 'Bathroom', 'Office', 'Attic',
    'Basement', 'Utility or Mechanical Room', 'Gym', 'Bar', 'Theater', 'Man Cave',
    'Wine Room', 'Storage Room', 'Interior Walkway', 'Custom Area',
] as const;

const exteriorAreas = [
    'Front Yard', 'Backyard', 'Left Side Yard', 'Right Side Yard', 'Patio', 'Porch',
    'Balcony', 'Driveway', 'Pool Area', 'Spa Area', 'BBQ or Outdoor Kitchen',
    'Detached Garage', 'Shed', 'Workshop', 'Guest House or ADU', 'Pool House',
    'Landscaping', 'Irrigation', 'Roof', 'Exterior Mechanical Area',
    'Exterior Shutoff Area', 'Custom Exterior Area',
] as const;

export const propertyAreaCatalog: PropertyAreaCatalogCard[] = [
    ...interiorAreas.map((name) => ({ name, scope: 'interior' as const })),
    ...exteriorAreas.map((name) => ({ name, scope: 'exterior' as const })),
];

const explicitAliases: Record<string, PropertyAreaScope> = {
    'master bedroom': 'interior',
    'master bathroom': 'interior',
    'back yard': 'exterior',
    'side yard': 'unclassified',
    'utility / mechanical room': 'interior',
    'utility room': 'interior',
    'mechanical room': 'interior',
    'bbq / grill area': 'exterior',
    'outdoor kitchen': 'exterior',
    'guest house': 'exterior',
    'adu': 'exterior',
    'attached garage': 'interior',
    'detached garage': 'exterior',
};

export function normalizePropertyAreaName(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function propertyAreaScopeFromRoute(value?: string | null): PropertyAreaScope {
    const scope = normalizePropertyAreaName(value);

    if (scope === 'exterior') return 'exterior';
    if (scope === 'unclassified') return 'unclassified';
    return 'interior';
}

/** Conservative classification: ambiguous and unknown existing labels stay visible as unclassified. */
export function classifyPropertyArea(
    area: Pick<PropertyAreaRecord, 'name' | 'area_scope'>
): PropertyAreaScope {
    const persisted = normalizePropertyAreaName(area.area_scope);
    if (persisted === 'interior' || persisted === 'exterior') return persisted;

    const name = normalizePropertyAreaName(area.name);
    if (!name || name === 'garage') return 'unclassified';
    if (explicitAliases[name]) return explicitAliases[name];
    const catalogName = name.replace(/\s+#?\d+$/, '');
    if (interiorAreas.some((candidate) => normalizePropertyAreaName(candidate) === catalogName)) {
        return 'interior';
    }
    if (exteriorAreas.some((candidate) => normalizePropertyAreaName(candidate) === catalogName)) {
        return 'exterior';
    }
    return 'unclassified';
}

export function activeAreasForScope(rows: PropertyAreaRecord[], scope: PropertyAreaScope) {
    const seen = new Set<string>();

    return rows.filter((row) => {
        const name = normalizePropertyAreaName(row.name);
        if (!name || row.archived) return false;
        if (classifyPropertyArea(row) !== scope || seen.has(name)) return false;
        seen.add(name);
        return true;
    });
}

export function isTopLevelPropertyArea(area: Pick<PropertyAreaRelationRecord, 'parent_area'>) {
    return !normalizePropertyAreaName(area.parent_area);
}

export function isChildPropertyArea(item: PropertyAreaRelationRecord, areaName: string) {
    return (
        normalizePropertyAreaName(item.category) === 'area' &&
        normalizePropertyAreaName(item.parent_area) === normalizePropertyAreaName(areaName)
    );
}

export function isDirectPropertyAreaItem(
    item: PropertyAreaRelationRecord,
    areaName: string,
    parentAreaName = ''
) {
    if (normalizePropertyAreaName(item.category) === 'area') return false;

    const area = normalizePropertyAreaName(areaName);
    const expectedParent = normalizePropertyAreaName(parentAreaName);
    const location = normalizePropertyAreaName(item.location);
    const parent = normalizePropertyAreaName(item.parent_area);

    if (expectedParent) return location === area && parent === expectedParent;

    return (
        (location === area && (!parent || parent === area)) ||
        (!location && parent === area)
    );
}

export function catalogForScope(
    scope: Exclude<PropertyAreaScope, 'unclassified'>,
    activeRows: PropertyAreaRecord[]
) {
    const activeNames = new Set(activeRows
        .filter((row) => !row.archived)
        .map((row) => normalizePropertyAreaName(row.name)));

    return propertyAreaCatalog.filter(
        (card) => card.scope === scope && !activeNames.has(normalizePropertyAreaName(card.name))
    );
}

export function areaSlug(name: string) {
    return normalizePropertyAreaName(name)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'area';
}
