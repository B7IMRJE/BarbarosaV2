import {
    completeRoomStarterTemplateKey,
    getCompleteRoomStarterItems,
    getCompleteRoomStarterKind,
    roomStarterItemNames,
    roomStarterParentNames,
    sameRoomStarterIdentity,
    type CompleteRoomStarterKind,
} from './roomStarterTemplates';
import {
    isChildHomeItem,
    type HomeItemHierarchyRecord,
} from './homeItemHierarchy';
import { isDirectPropertyAreaItem } from './propertyAreas';

export type HomeItemAreaHierarchyScope = {
    areaName: string;
    parentAreaName?: string | null;
};

export type HomeItemAreaHierarchyEntry<T extends HomeItemHierarchyRecord = HomeItemHierarchyRecord> = {
    assembly: T;
    components: T[];
};

type Hierarchy<T extends HomeItemHierarchyRecord> = {
    rows: T[];
    areaRows: T[];
    rowByKey: Map<string, T>;
    parentByChild: Map<string, string>;
    childrenByParent: Map<string, string[]>;
};

type StarterRelation = {
    kind: CompleteRoomStarterKind;
    childKey: string;
    parentKey: string;
};

type OverlayRelation = {
    kind: CompleteRoomStarterKind;
    assemblyKeys: readonly string[];
    assemblyNames: readonly string[];
    componentKeys: readonly string[];
    componentNames: readonly string[];
};

const STARTER_RELATIONS = buildStarterRelations();

const OVERLAY_RELATIONS: readonly OverlayRelation[] = [
    overlay('kitchen', ['kitchen:kitchen_sink'], ['Kitchen Sink', 'Sink'], ['kitchen:kitchen_faucet'], ['Kitchen Faucet', 'Faucet']),
    overlay('kitchen', ['kitchen:kitchen_sink'], ['Kitchen Sink', 'Sink'], ['kitchen:garbage_disposal'], ['Garbage Disposal', 'Food Waste Disposer', 'Disposal']),
    overlay('bathroom', ['bathroom:bathroom_vanity'], ['Bathroom Vanity', 'Vanity'], ['bathroom:bathroom_sink'], ['Bathroom Sink', 'Vanity Sink', 'Lavatory Sink', 'Sink']),
    overlay('bathroom', ['bathroom:bathroom_vanity'], ['Bathroom Vanity', 'Vanity'], ['bathroom:bathroom_sink_faucet'], ['Bathroom Sink Faucet', 'Bathroom Faucet', 'Lavatory Faucet', 'Faucet']),
    overlay('kitchen', ['kitchen:refrigerator'], ['Refrigerator'], ['kitchen:refrigerator_water_line'], ['Refrigerator Water Line', 'Ice Maker Line', 'Refrigerator Line', 'Water Line']),
    overlay('kitchen', ['kitchen:kitchen_counter'], ['Kitchen Counter', 'Counter', 'Countertop', 'Kitchen Island'], ['kitchen:instant_hot_water_dispenser'], ['Instant Hot Water Dispenser', 'Instant Hot', 'Hot Water Dispenser']),
    overlay('kitchen', ['kitchen:kitchen_counter'], ['Kitchen Counter', 'Counter', 'Countertop', 'Kitchen Island'], ['kitchen:reverse_osmosis_system'], ['Reverse Osmosis System', 'Reverse Osmosis', 'RO System']),
];

/** Returns the transitive saved component deck for one assembly. */
export function resolveHomeItemComponentDeck<T extends HomeItemHierarchyRecord>(
    rows: readonly T[],
    assembly: T
): T[] {
    if (!isSavedActiveRow(assembly)) return [];

    const hierarchy = resolveHierarchy([...rows, assembly]);
    const assemblyKey = rowKey(assembly);

    if (!hierarchy.rowByKey.has(assemblyKey)) return [];

    return descendantsOf(hierarchy, assemblyKey).sort(compareRows);
}

/**
 * Returns only the immediate children of an item. Item-detail screens use this
 * view so each nested item owns the next level of the recursive hierarchy,
 * while area projections can continue to use the transitive deck above.
 */
export function resolveHomeItemDirectComponentDeck<T extends HomeItemHierarchyRecord>(
    rows: readonly T[],
    assembly: T
): T[] {
    if (!isSavedActiveRow(assembly)) return [];

    const hierarchy = resolveHierarchy([...rows, assembly]);
    const assemblyKey = rowKey(assembly);
    const childKeys = hierarchy.childrenByParent.get(assemblyKey) || [];

    return childKeys
        .map((key) => hierarchy.rowByKey.get(key))
        .filter((child): child is T => Boolean(child))
        .sort(compareRows);
}

/** Returns area-level cards after removing every row claimed beneath another assembly. */
export function resolveHomeItemAreaAssemblyDeck<T extends HomeItemHierarchyRecord>(
    rows: readonly T[],
    scope?: string | HomeItemAreaHierarchyScope
): T[] {
    const hierarchy = resolveHierarchy(rows);
    const normalizedScope = normalizeScope(scope);

    return hierarchy.rows
        .filter((row) => !hierarchy.parentByChild.has(rowKey(row)))
        .filter((row) => !normalizedScope || belongsToArea(row, normalizedScope))
        .sort(compareRows);
}

/**
 * Returns a disjoint read-only projection. A saved active row occurs at most
 * once: as an area-level assembly or in that assembly's component deck.
 */
export function resolveHomeItemAreaHierarchyProjection<T extends HomeItemHierarchyRecord>(
    rows: readonly T[],
    scope?: string | HomeItemAreaHierarchyScope
): HomeItemAreaHierarchyEntry<T>[] {
    const hierarchy = resolveHierarchy(rows);
    const normalizedScope = normalizeScope(scope);
    const assemblies = hierarchy.rows
        .filter((row) => !hierarchy.parentByChild.has(rowKey(row)))
        .filter((row) => !normalizedScope || belongsToArea(row, normalizedScope))
        .sort(compareRows);

    return assemblies.map((assembly) => ({
        assembly,
        components: descendantsOf(hierarchy, rowKey(assembly)).sort(compareRows),
    }));
}

function resolveHierarchy<T extends HomeItemHierarchyRecord>(input: readonly T[]): Hierarchy<T> {
    const rows = uniqueRows(input.filter(isSavedActiveRow));
    const hierarchy: Hierarchy<T> = {
        rows,
        areaRows: uniqueRows(input.filter(isSavedAreaRow)),
        rowByKey: new Map(rows.map((row) => [rowKey(row), row])),
        parentByChild: new Map(),
        childrenByParent: new Map(),
    };
    const explicitParentRows = new Set<string>();

    // Explicit row identity is authoritative, even if the referenced parent is
    // absent from this authorized read. In that case we do not guess a parent.
    for (const child of rows) {
        const parentId = text(child.parent_home_item_id);

        if (!parentId) continue;
        explicitParentRows.add(rowKey(child));

        const parents = rows.filter((parent) => sameIdentity(parent.id, parentId));

        if (parents.length === 1) claim(hierarchy, child, parents[0]);
    }

    // Canonical template keys can preserve a relation after either card is renamed.
    for (const child of rows) {
        if (isClaimedOrExplicit(hierarchy, explicitParentRows, child)) continue;

        const relation = starterRelationFor(child);

        if (!relation) continue;

        const parents = rows.filter((parent) =>
            normalize(parent.starter_template_key) === relation.parentKey &&
            sameAreaPlacement(child, parent, hierarchy.areaRows)
        );

        if (parents.length === 1) claim(hierarchy, child, parents[0]);
    }

    // Retain existing location/parent-area hierarchy as the compatibility fallback.
    for (const child of rows) {
        if (isClaimedOrExplicit(hierarchy, explicitParentRows, child)) continue;

        const relation = starterRelationFor(child);
        let parents = rows.filter((parent) => rowKey(parent) !== rowKey(child) && isChildHomeItem(child, parent));

        if (relation) {
            const keyedParents = parents.filter((parent) => normalize(parent.starter_template_key) === relation.parentKey);
            parents = keyedParents.length > 0
                ? keyedParents
                : parents.filter((parent) => !normalize(parent.starter_template_key));
        }

        parents = uniqueRows(parents);
        if (parents.length === 1) claim(hierarchy, child, parents[0]);
    }

    // The only inferred assembly relationships are the explicitly approved overlays.
    for (const child of rows) {
        if (isClaimedOrExplicit(hierarchy, explicitParentRows, child)) continue;

        const parents = overlayParentsFor(child, rows, hierarchy.areaRows);

        if (parents.length === 1) claim(hierarchy, child, parents[0]);
    }

    // Narrow read-only compatibility for one historical generic card. It is
    // intentionally not a taxonomy rule: only a legacy, unkeyed "Toilet Drain"
    // can attach, and only where there is one exact "Toilet" in the same room.
    for (const child of rows) {
        if (isClaimedOrExplicit(hierarchy, explicitParentRows, child)) continue;
        const parents = legacyToiletDrainParents(child, rows, hierarchy.areaRows);
        if (parents.length === 1) claim(hierarchy, child, parents[0]);
    }

    return hierarchy;
}

function legacyToiletDrainParents<T extends HomeItemHierarchyRecord>(child: T, rows: T[], areaRows: T[]) {
    if (
        normalize(child.name) !== 'toilet drain' ||
        normalize(child.starter_template_key) ||
        normalize(child.system) !== 'drains / sewer' ||
        normalize(child.category) !== 'fixture'
    ) return [];
    const placement = roomPlacement(child, areaRows);
    if (!placement || placement.kind !== 'bathroom') return [];
    return rows.filter((parent) =>
        rowKey(parent) !== rowKey(child) &&
        isLegacyToiletDrainParent(parent) &&
        sameRoomPlacement(placement, roomPlacement(parent, areaRows))
    );
}

function isLegacyToiletDrainParent(parent: HomeItemHierarchyRecord) {
    if (normalize(parent.starter_template_key) === 'bathroom:toilet') return true;
    return !normalize(parent.starter_template_key) &&
        normalize(parent.name) === 'toilet' &&
        normalize(parent.system) === 'plumbing' &&
        ['fixture', 'equipment'].includes(normalize(parent.category));
}

function overlayParentsFor<T extends HomeItemHierarchyRecord>(child: T, rows: T[], areaRows: T[]) {
    const placement = roomPlacement(child, areaRows);

    if (!placement) return [];

    const relations = OVERLAY_RELATIONS.filter((relation) =>
        relation.kind === placement.kind &&
        matchesIdentity(child, relation.componentKeys, relation.componentNames)
    );

    if (relations.length === 0) return [];

    let parents = rows.filter((parent) =>
        rowKey(parent) !== rowKey(child) &&
        sameRoomPlacement(placement, roomPlacement(parent, areaRows)) &&
        relations.some((relation) => matchesIdentity(parent, relation.assemblyKeys, relation.assemblyNames))
    );
    const keyedParents = parents.filter((parent) => {
        const key = normalize(parent.starter_template_key);
        return Boolean(key) && relations.some((relation) => relation.assemblyKeys.map(normalize).includes(key));
    });

    parents = keyedParents.length > 0
        ? keyedParents
        : parents.filter((parent) => !normalize(parent.starter_template_key));

    return uniqueRows(parents);
}

function matchesIdentity(
    row: HomeItemHierarchyRecord,
    approvedKeys: readonly string[],
    approvedNames: readonly string[]
) {
    const key = normalize(row.starter_template_key);

    if (key) return approvedKeys.map(normalize).includes(key);
    return approvedNames.some((name) => sameRoomStarterIdentity(name, row.name));
}

function starterRelationFor(row: HomeItemHierarchyRecord) {
    const key = normalize(row.starter_template_key);

    return key ? STARTER_RELATIONS.find((relation) => relation.childKey === key) || null : null;
}

function sameAreaPlacement(
    first: HomeItemHierarchyRecord,
    second: HomeItemHierarchyRecord,
    areaRows: readonly HomeItemHierarchyRecord[]
) {
    if (text(first.parent_area) && sameText(first.parent_area, second.location)) {
        return !isExactSavedAreaPlacement(first, areaRows);
    }

    const firstPlacement = roomPlacement(first, areaRows);
    const secondPlacement = roomPlacement(second, areaRows);

    return sameRoomPlacement(firstPlacement, secondPlacement);
}

function roomPlacement(
    row: HomeItemHierarchyRecord,
    areaRows: readonly HomeItemHierarchyRecord[]
) {
    const location = text(row.location);
    const locationKind = getCompleteRoomStarterKind(location);

    if (locationKind) {
        return { kind: locationKind, areaName: normalize(location), parentAreaName: normalize(row.parent_area) };
    }

    if (isExactSavedAreaPlacement(row, areaRows)) return null;

    const parentArea = text(row.parent_area);
    const parentKind = getCompleteRoomStarterKind(parentArea);

    return parentKind
        ? { kind: parentKind, areaName: normalize(parentArea), parentAreaName: '' }
        : null;
}

function isExactSavedAreaPlacement(
    row: HomeItemHierarchyRecord,
    areaRows: readonly HomeItemHierarchyRecord[]
) {
    const location = text(row.location);

    return Boolean(location) && areaRows.some((area) =>
        sameText(area.name, location) && sameText(area.parent_area, row.parent_area)
    );
}

function sameRoomPlacement(
    first: ReturnType<typeof roomPlacement>,
    second: ReturnType<typeof roomPlacement>
) {
    return Boolean(first && second &&
        first.kind === second.kind &&
        first.areaName === second.areaName &&
        first.parentAreaName === second.parentAreaName
    );
}

function claim<T extends HomeItemHierarchyRecord>(hierarchy: Hierarchy<T>, child: T, parent: T) {
    const childKey = rowKey(child);
    const parentKey = rowKey(parent);

    if (!childKey || !parentKey || childKey === parentKey || hierarchy.parentByChild.has(childKey)) return;
    if (createsCycle(hierarchy.parentByChild, childKey, parentKey)) return;

    hierarchy.parentByChild.set(childKey, parentKey);
    hierarchy.childrenByParent.set(parentKey, [...(hierarchy.childrenByParent.get(parentKey) || []), childKey]);
}

function createsCycle(parents: Map<string, string>, childKey: string, parentKey: string) {
    let cursor = parentKey;
    const visited = new Set<string>();

    while (cursor && !visited.has(cursor)) {
        if (cursor === childKey) return true;
        visited.add(cursor);
        cursor = parents.get(cursor) || '';
    }

    return false;
}

function descendantsOf<T extends HomeItemHierarchyRecord>(hierarchy: Hierarchy<T>, rootKey: string) {
    const result: T[] = [];
    const visited = new Set([rootKey]);
    const pending = [...(hierarchy.childrenByParent.get(rootKey) || [])];

    while (pending.length > 0) {
        const childKey = pending.shift();

        if (!childKey || visited.has(childKey)) continue;
        visited.add(childKey);

        const child = hierarchy.rowByKey.get(childKey);
        if (child) result.push(child);
        pending.push(...(hierarchy.childrenByParent.get(childKey) || []));
    }

    return result;
}

function isClaimedOrExplicit<T extends HomeItemHierarchyRecord>(
    hierarchy: Hierarchy<T>,
    explicitRows: Set<string>,
    row: T
) {
    const key = rowKey(row);
    return explicitRows.has(key) || hierarchy.parentByChild.has(key);
}

function normalizeScope(scope?: string | HomeItemAreaHierarchyScope) {
    const areaName = typeof scope === 'string' ? text(scope) : text(scope?.areaName);

    if (!areaName) return null;

    return {
        areaName,
        parentAreaName: typeof scope === 'string' ? '' : text(scope?.parentAreaName),
    };
}

function belongsToArea(row: HomeItemHierarchyRecord, scope: { areaName: string; parentAreaName: string }) {
    return isDirectPropertyAreaItem(row, scope.areaName, scope.parentAreaName);
}

function isSavedActiveRow<T extends HomeItemHierarchyRecord>(row: T) {
    return Boolean(
        row &&
        row.archived !== true &&
        !sameText(row.category, 'Area') &&
        (text(row.id) || text(row.item_slug))
    );
}

function isSavedAreaRow<T extends HomeItemHierarchyRecord>(row: T) {
    return Boolean(
        row &&
        row.archived !== true &&
        sameText(row.category, 'Area') &&
        text(row.name) &&
        (text(row.id) || text(row.item_slug))
    );
}

function uniqueRows<T extends HomeItemHierarchyRecord>(rows: readonly T[]) {
    const seen = new Set<string>();

    return rows.filter((row) => {
        const key = rowKey(row);

        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function rowKey(row: HomeItemHierarchyRecord) {
    const id = normalize(row.id);

    if (id) return `id:${id}`;

    const slug = normalize(row.item_slug);

    return slug
        ? `slug:${slug}|${normalize(row.location)}|${normalize(row.parent_area)}`
        : '';
}

function compareRows(first: HomeItemHierarchyRecord, second: HomeItemHierarchyRecord) {
    return text(first.name).localeCompare(text(second.name)) || rowKey(first).localeCompare(rowKey(second));
}

function buildStarterRelations(): StarterRelation[] {
    const kinds: CompleteRoomStarterKind[] = ['bathroom', 'kitchen', 'garage'];

    return kinds.flatMap((kind) => {
        const definitions = getCompleteRoomStarterItems(kind);

        return definitions.flatMap((child) => {
            if (!child.parentName) return [];

            const parent = definitions.find((candidate) =>
                roomStarterParentNames(child).some((parentName) =>
                    roomStarterItemNames(candidate).some((candidateName) =>
                        sameRoomStarterIdentity(parentName, candidateName)
                    )
                )
            );

            return parent ? [{
                kind,
                childKey: normalize(completeRoomStarterTemplateKey(kind, child.name)),
                parentKey: normalize(completeRoomStarterTemplateKey(kind, parent.name)),
            }] : [];
        });
    });
}

function overlay(
    kind: CompleteRoomStarterKind,
    assemblyKeys: readonly string[],
    assemblyNames: readonly string[],
    componentKeys: readonly string[],
    componentNames: readonly string[]
): OverlayRelation {
    return { kind, assemblyKeys, assemblyNames, componentKeys, componentNames };
}

function text(value: unknown) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalize(value: unknown) {
    return text(value).toLowerCase();
}

function sameText(first: unknown, second: unknown) {
    return normalize(first) === normalize(second);
}

function sameIdentity(first: unknown, second: unknown) {
    const firstId = normalize(first);
    const secondId = normalize(second);

    return Boolean(firstId && secondId && firstId === secondId);
}
