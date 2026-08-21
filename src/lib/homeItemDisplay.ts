import type { HomeItemHierarchyRecord } from './homeItemHierarchy';

export function resolveHomeItemDisplay(item: HomeItemHierarchyRecord) {
    const name = cleanText(item.name) || 'Unnamed item';
    const placementLabel = cleanText(item.placement_label);

    return {
        title: placementLabel ? name.replace(/\s+(?:#\s*)?\d+$/i, '').trim() || name : name,
        placementLabel,
    };
}

export function resolveHomeItemCardDetails(item: HomeItemHierarchyRecord) {
    return [
        { label: 'Status', value: cleanText(item.status) || cleanText(item.install_state) },
        { label: 'Condition', value: cleanText(item.condition) },
        { label: 'System', value: cleanText(item.system) },
        { label: 'Category', value: cleanText(item.category) },
        { label: 'Location', value: cleanText(item.location) || cleanText(item.parent_area) },
        { label: 'Brand', value: cleanText(item.brand) },
        { label: 'Model', value: cleanText(item.model) },
        { label: 'Serial', value: cleanText(item.serial) },
        { label: 'Part Number', value: cleanText(item.part_number) },
        { label: 'Installed', value: formatItemDate(item.installed_on || item.install_date) },
    ];
}

function formatItemDate(value: unknown) {
    const text = cleanText(value);
    if (!text) return '';

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function cleanText(value: unknown) {
    return String(value || '').trim();
}
