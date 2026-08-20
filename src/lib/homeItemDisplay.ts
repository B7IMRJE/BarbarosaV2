import type { HomeItemHierarchyRecord } from './homeItemHierarchy';

export function resolveHomeItemDisplay(item: HomeItemHierarchyRecord) {
    const name = cleanText(item.name) || 'Unnamed item';
    const placementLabel = cleanText(item.placement_label);

    return {
        title: placementLabel ? name.replace(/\s+(?:#\s*)?\d+$/i, '').trim() || name : name,
        placementLabel,
    };
}

function cleanText(value: unknown) {
    return String(value || '').trim();
}
