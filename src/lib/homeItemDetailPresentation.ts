import type { HomeItemHierarchyRecord } from './homeItemHierarchy';
import { resolveHomeItemCardDetails } from './homeItemDisplay';

export function initialUniversalHomeItemActionGroups() {
    return {
        components: true,
        maintenance: false,
        estimate: false,
        provider: false,
        catalog: false,
        media: false,
        item: false,
    } as const;
}

/**
 * The permanent, shared item identity shown by every HomeOS and provider item
 * route. Property-specific history and actions remain outside this card.
 */
export function resolveUniversalHomeItemDetailFields(item: HomeItemHierarchyRecord) {
    const fields = resolveHomeItemCardDetails({
        ...item,
        status: item.status || 'Missing Information',
        condition: item.condition || item.install_state || 'Unknown',
        system: item.system || 'Unknown',
        category: item.category || 'Unknown',
        location: item.location || 'Unknown',
        brand: item.brand || 'Unknown',
        model: item.model || 'Unknown',
        serial: item.serial || 'Unknown',
        part_number: item.part_number || 'Unknown',
        installed_on: item.installed_on || item.install_date || 'Unknown',
    });

    return [
        ...fields.slice(0, 5),
        { label: 'Parent Area', value: item.parent_area || 'None' },
        ...fields.slice(5),
    ];
}
