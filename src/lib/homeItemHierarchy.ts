export type HomeItemHierarchyRecord = {
    id?: string | null;
    item_slug?: string | null;
    name?: string | null;
    system?: string | null;
    category?: string | null;
    location?: string | null;
    parent_area?: string | null;
    status?: string | null;
    install_state?: string | null;
    archived?: boolean | null;
};

export type HomeItemChildCreateContext = {
    location: string;
    parentArea: string | null;
};

export function resolveHomeItemChildCreateContext(parent: HomeItemHierarchyRecord): HomeItemChildCreateContext {
    return {
        location: cleanHierarchyText(parent.name),
        parentArea: cleanHierarchyText(parent.location) || cleanHierarchyText(parent.parent_area) || null,
    };
}

export function isChildHomeItem(candidate: HomeItemHierarchyRecord, parent: HomeItemHierarchyRecord) {
    if (!candidate || !parent) return false;
    if (candidate.archived === true) return false;
    if (sameHierarchyIdentity(candidate.id, parent.id)) return false;
    if (sameHierarchyIdentity(candidate.item_slug, parent.item_slug)) return false;

    const parentName = cleanHierarchyText(parent.name);
    if (!parentName) return false;

    const { parentArea } = resolveHomeItemChildCreateContext(parent);
    const candidateLocation = cleanHierarchyText(candidate.location);
    const candidateParentArea = cleanHierarchyText(candidate.parent_area);

    if (sameHierarchyText(candidateLocation, parentName) && sameHierarchyText(candidateParentArea, parentArea || '')) {
        return true;
    }

    return !candidateLocation && sameHierarchyText(candidateParentArea, parentName);
}

export function filterChildHomeItems(
    candidates: HomeItemHierarchyRecord[],
    parent: HomeItemHierarchyRecord
) {
    return candidates
        .filter((candidate) => isChildHomeItem(candidate, parent))
        .sort((a, b) => cleanHierarchyText(a.name).localeCompare(cleanHierarchyText(b.name)));
}

function cleanHierarchyText(value: unknown) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function sameHierarchyText(a: unknown, b: unknown) {
    return cleanHierarchyText(a).toLowerCase() === cleanHierarchyText(b).toLowerCase();
}

function sameHierarchyIdentity(a: unknown, b: unknown) {
    const cleanA = cleanHierarchyText(a);
    const cleanB = cleanHierarchyText(b);

    return Boolean(cleanA && cleanB && cleanA === cleanB);
}
