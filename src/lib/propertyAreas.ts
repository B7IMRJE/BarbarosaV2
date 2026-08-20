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
    area_placement_state?: string | null;
    archived?: boolean | null;
};

export type PropertyAreaDetailRouteParams = {
    area: string;
    parentArea?: string;
    areaId?: string;
};

export type PropertyAreaRelationRecord = {
    id?: string | null;
    name?: string | null;
    category?: string | null;
    location?: string | null;
    parent_area?: string | null;
    parent_home_item_id?: string | null;
    archived?: boolean | null;
};

export type PropertyAreaDetailResolution<T extends PropertyAreaRelationRecord = PropertyAreaRelationRecord> = {
    status: 'exact' | 'recovered' | 'ambiguous' | 'missing';
    area: T | null;
};

const interiorAreas = [
    'Kitchen', 'Living Room', 'Dining Room', 'Hallway', 'Garage', 'Laundry',
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
    'laundry room': 'interior',
};

export function normalizePropertyAreaName(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The canonical Laundry container may be placed inside another area. */
export function isCanonicalLaundryAreaName(value?: string | null) {
    return normalizePropertyAreaName(value) === 'laundry';
}

/** Legacy "Laundry Room" records represent the same portable Laundry area. */
export function isPortableLaundryAreaName(value?: string | null) {
    const name = normalizePropertyAreaName(value);
    return name === 'laundry' || name === 'laundry room';
}

/** Keeps the catalog and visible deck from treating legacy Laundry Room as a second Laundry. */
export function propertyAreaFunctionalIdentity(value?: string | null) {
    return isPortableLaundryAreaName(value) ? 'laundry' : normalizePropertyAreaName(value);
}

export function hasAmbiguousPortableLaundryAreas(
    rows: readonly Pick<PropertyAreaRecord, 'name' | 'archived'>[]
) {
    return rows.filter((row) => !row.archived && isPortableLaundryAreaName(row.name)).length > 1;
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
        const name = propertyAreaFunctionalIdentity(row.name);
        if (!name || row.archived) return false;
        if (classifyPropertyArea(row) !== scope || seen.has(name)) return false;
        seen.add(name);
        return true;
    });
}

/**
 * Root-deck selection is intentionally narrower than generic active-area selection:
 * ordinary legacy nested rooms stay inside their host, while Laundry and any
 * explicitly placed Area stay discoverable from My Home as the canonical card.
 */
export function visibleRootAreasForScope(rows: PropertyAreaRecord[], scope: PropertyAreaScope) {
    const visible = rows.filter((row) => (
        !row.archived
        && classifyPropertyArea(row) === scope
        && (
            isTopLevelPropertyArea(row)
            || isPortableLaundryAreaName(row.name)
            || normalizePropertyAreaName(row.area_placement_state) === 'inside_area'
        )
    ));
    const keepAllPortableLaundry = hasAmbiguousPortableLaundryAreas(visible);
    const selectedByIdentity = new Map<string, PropertyAreaRecord>();

    visible.forEach((row) => {
        const identity = rootDeckAreaIdentity(row);
        if (!identity) return;

        const current = selectedByIdentity.get(identity);
        if (!current || (
            identity === 'laundry'
            && isCanonicalLaundryAreaName(row.name)
            && !isCanonicalLaundryAreaName(current.name)
        )) {
            selectedByIdentity.set(identity, row);
        }
    });

    return visible.filter((row) => (
        keepAllPortableLaundry && isPortableLaundryAreaName(row.name)
            ? true
            : selectedByIdentity.get(rootDeckAreaIdentity(row)) === row
    ));
}

function rootDeckAreaIdentity(area: PropertyAreaRecord) {
    const identity = propertyAreaFunctionalIdentity(area.name);
    if (!identity || identity === 'laundry') return identity;

    return normalizePropertyAreaName(area.area_placement_state) === 'inside_area'
        ? `${identity}|inside|${normalizePropertyAreaName(area.parent_area)}`
        : identity;
}

/** Human-readable placement for any explicitly managed Area. */
export function propertyAreaPlacementText(area: Pick<PropertyAreaRecord, 'parent_area' | 'area_placement_state'>) {
    const parentArea = String(area.parent_area || '').trim();
    const placementState = normalizePropertyAreaName(area.area_placement_state);

    if (placementState === 'unassigned') return 'Location not assigned';
    if (placementState === 'inside_area') {
        return parentArea ? `Located in ${parentArea}` : 'Location needs review';
    }
    if (placementState === 'standalone') return 'Standalone area';
    if (parentArea) return `Located in ${parentArea}`;

    return 'Standalone area';
}

export function propertyAreaLocationActionLabel(area: Pick<PropertyAreaRecord, 'parent_area' | 'area_placement_state'>) {
    return normalizePropertyAreaName(area.area_placement_state) === 'unassigned'
        ? 'Assign location'
        : 'Change location';
}

export function laundryAreaPlacementText(area: Pick<PropertyAreaRecord, 'name' | 'parent_area' | 'area_placement_state'>) {
    const parentArea = String(area.parent_area || '').trim();
    const placementState = normalizePropertyAreaName(area.area_placement_state);

    if (placementState === 'unassigned') return 'Location not assigned';
    if (placementState === 'inside_area') {
        return parentArea ? `Located in ${parentArea}` : 'Location needs review';
    }
    if (placementState === 'standalone') return 'Standalone laundry room';
    if (parentArea) return `Located in ${parentArea}`;

    return 'Location not assigned';
}

export function laundryAreaLocationActionLabel(area: Pick<PropertyAreaRecord, 'parent_area' | 'area_placement_state'>) {
    return propertyAreaLocationActionLabel(area);
}

/** Preserve the exact nested placement whenever an area detail route is built. */
export function propertyAreaDetailRouteParams(
    area: Pick<PropertyAreaRecord, 'id' | 'name' | 'parent_area'>
): PropertyAreaDetailRouteParams {
    const name = String(area.name || '').trim();
    const parentArea = String(area.parent_area || '').trim();
    const areaId = String(area.id || '').trim();

    return {
        area: name,
        ...(parentArea ? { parentArea } : {}),
        ...(areaId ? { areaId } : {}),
    };
}

/**
 * Detail URLs now carry the Area UUID, but old URLs only know the text path.
 * A unique active Area can safely recover from an old parent snapshot; the
 * moment more than one same-named Area exists, the route is intentionally
 * not guessed. That prevents a moved or repeated area from accepting writes
 * under the wrong placement.
 */
export function resolvePropertyAreaDetail<T extends PropertyAreaRelationRecord>(
    rows: readonly T[],
    request: {
        areaName?: string | null;
        parentAreaName?: string | null;
        areaId?: string | null;
    }
): PropertyAreaDetailResolution<T> {
    const areaName = normalizePropertyAreaName(request.areaName);
    const parentAreaName = normalizePropertyAreaName(request.parentAreaName);
    const areaId = String(request.areaId || '').trim();
    const activeAreas = rows.filter((row) => (
        !row.archived
        && (!row.category || normalizePropertyAreaName(row.category) === 'area')
    ));
    const matchesRoute = (row: T) => (
        normalizePropertyAreaName(row.name) === areaName
        && normalizePropertyAreaName(row.parent_area) === parentAreaName
    );

    if (areaId) {
        const byId = activeAreas.filter((row) => String(row.id || '').trim() === areaId);

        if (byId.length === 1) {
            return { status: matchesRoute(byId[0]) ? 'exact' : 'recovered', area: byId[0] };
        }

        // Once a stable Area ID is present it is authoritative. Falling back
        // to a same-named row could turn an archived or obsolete link into a
        // write path for a different physical area.
        return { status: byId.length > 1 ? 'ambiguous' : 'missing', area: null };
    }

    const exactMatches = activeAreas.filter(matchesRoute);
    if (exactMatches.length === 1) return { status: 'exact', area: exactMatches[0] };
    if (exactMatches.length > 1) return { status: 'ambiguous', area: null };

    if (!areaName) return { status: 'missing', area: null };

    const sameName = activeAreas.filter((row) => normalizePropertyAreaName(row.name) === areaName);
    if (sameName.length === 1) return { status: 'recovered', area: sameName[0] };
    if (sameName.length > 1) return { status: 'ambiguous', area: null };

    return { status: 'missing', area: null };
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

/**
 * Project child-area portals only when their host can be proven. The current
 * Area schema uses name-only parent snapshots, so that fallback is allowed
 * only while the host name is unique for this property. If a later Area
 * parent UUID is persisted, it is stronger than the legacy fallback. This
 * deliberately hides ambiguous legacy children rather than showing a child
 * of "Kitchen Annex in Garage" inside "Kitchen Annex in Guest House".
 */
export function childPropertyAreasForHost<T extends PropertyAreaRelationRecord>(
    rows: readonly T[],
    host: Pick<PropertyAreaRelationRecord, 'id' | 'name' | 'parent_area'>
) {
    const hostId = String(host.id || '').trim();
    const hostName = normalizePropertyAreaName(host.name);
    if (!hostName) return [] as T[];

    const activeAreas = rows.filter((row) => (
        !row.archived && normalizePropertyAreaName(row.category) === 'area'
    ));
    const sameNamedHosts = activeAreas.filter((row) => (
        normalizePropertyAreaName(row.name) === hostName
    ));

    return activeAreas.filter((row) => (
        String(row.parent_home_item_id || '').trim()
            ? String(row.parent_home_item_id || '').trim() === hostId
            : sameNamedHosts.length === 1
                && normalizePropertyAreaName(row.parent_area) === hostName
    ));
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
        .map((row) => propertyAreaFunctionalIdentity(row.name)));

    return propertyAreaCatalog.filter(
        (card) => card.scope === scope && !activeNames.has(propertyAreaFunctionalIdentity(card.name))
    );
}

export function areaSlug(name: string) {
    return normalizePropertyAreaName(name)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'area';
}
