import { getSystemDefinition } from './homeSystems';
import { normalizeAreaName } from './systemDefaults';

export type AreaVisibleHomeItem = {
    id?: string | null;
    name?: string | null;
    system?: string | null;
    item_slug?: string | null;
    category?: string | null;
    location?: string | null;
    parent_area?: string | null;
};

export type AreaItemVisibilityScope = {
    systemName: string;
    areaName: string;
    parentAreaName?: string | null;
};

export type AreaItemVisibilityResult<T extends AreaVisibleHomeItem> = {
    systemRows: T[];
    currentAreaRecord: T | null;
    childAreas: T[];
    directItems: T[];
};

export function resolveAreaVisibleItems<T extends AreaVisibleHomeItem>(
    rows: T[],
    scope: AreaItemVisibilityScope
): AreaItemVisibilityResult<T> {
    const systemRows = rows.filter((item) => sameHomeSystem(item.system, scope.systemName));
    const currentAreaRecord = systemRows.find((item) => isCurrentAreaRecord(item, scope.areaName, scope.parentAreaName || '')) || null;
    const childAreas = systemRows.filter((item) =>
        sameAreaText(item.category, 'Area') &&
        sameAreaText(item.parent_area, scope.areaName)
    );
    const directItems = rows.filter((item) => isDirectItemVisibleInArea(item, scope.areaName, scope.parentAreaName || ''));

    return {
        systemRows,
        currentAreaRecord,
        childAreas,
        directItems,
    };
}

export function sameHomeSystem(a?: string | null, b?: string | null) {
    return normalizeSystemIdentity(a) === normalizeSystemIdentity(b);
}

export function isDirectItemVisibleInArea(
    item: AreaVisibleHomeItem,
    areaName: string,
    parentAreaName = ''
) {
    if (sameAreaText(item.category, 'Area')) return false;

    if (parentAreaName) {
        return sameAreaText(item.parent_area, areaName) ||
            (sameAreaText(item.location, areaName) && sameAreaText(item.parent_area, parentAreaName));
    }

    return sameAreaText(item.location, areaName) ||
        (!String(item.location || '').trim() && sameAreaText(item.parent_area, areaName));
}

export function formatDirectItemsEmptyMessage({
    providerMode,
    queryFailed,
    returnedRowCount,
}: {
    providerMode: boolean;
    queryFailed: boolean;
    returnedRowCount: number | null;
}) {
    if (queryFailed) {
        return providerMode
            ? 'Client HomeOS items could not be loaded for this authorized property.'
            : 'Items could not be loaded for this area.';
    }

    if (providerMode && returnedRowCount === 0) {
        return 'No visible client HomeOS items were returned for this authorized property. If the homeowner has records, HomeOS sharing rules prevented them from loading.';
    }

    if (providerMode) {
        return 'No existing client items matched this area.';
    }

    return 'No direct items yet.';
}

function isCurrentAreaRecord(item: AreaVisibleHomeItem, areaName: string, parentAreaName: string) {
    if (!sameAreaText(item.category, 'Area')) return false;
    if (!sameAreaText(item.name || item.location, areaName)) return false;

    if (parentAreaName) {
        return sameAreaText(item.parent_area, parentAreaName);
    }

    return !String(item.parent_area || '').trim();
}

function sameAreaText(a?: string | null, b?: string | null) {
    return normalizeAreaName(a) === normalizeAreaName(b);
}

function normalizeSystemIdentity(value?: string | null) {
    const definition = getSystemDefinition(value);

    return normalizeAreaName(definition?.key || value);
}
