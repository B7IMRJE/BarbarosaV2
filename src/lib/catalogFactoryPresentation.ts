export const CATALOG_SPECIFICATION_PREVIEW_COUNT = 4;
export const CATALOG_SOURCE_PREVIEW_COUNT = 3;

const UPPERCASE_CATALOG_TERMS = new Set([
    'ada',
    'btu',
    'gpm',
    'gtin',
    'mpn',
    'psi',
    'sku',
    'upc',
]);

export type CatalogSpecificationDisplay = {
    key: string;
    label: string;
    value: string;
};

export function catalogSpecificationDisplays(specifications: Record<string, unknown>) {
    return Object.entries(specifications)
        .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
        .map(([key, value]) => ({
            key,
            label: catalogFieldLabel(key),
            value: catalogFieldValue(value),
        } satisfies CatalogSpecificationDisplay));
}

export function catalogFieldLabel(value: string) {
    return value
        .trim()
        .replaceAll('_', ' ')
        .replace(/\s+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((word) => {
            const normalized = word.toLowerCase();
            if (UPPERCASE_CATALOG_TERMS.has(normalized)) return normalized.toUpperCase();
            return normalized.charAt(0).toUpperCase() + normalized.slice(1);
        })
        .join(' ');
}

export function catalogFieldValue(value: unknown): string {
    if (value === null || value === undefined) return 'Not supplied';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ');
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (Array.isArray(value)) return value.map(catalogFieldValue).filter(Boolean).join(', ');
    if (typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
            .map(([key, entry]) => `${catalogFieldLabel(key)}: ${catalogFieldValue(entry)}`)
            .join(' · ');
    }
    return String(value);
}

export function catalogPreviewItems<T>(items: T[], expanded: boolean, previewCount: number) {
    return expanded ? items : items.slice(0, previewCount);
}

export function catalogSourceDisplayName(title: string, sourceUrl: string) {
    const cleanTitle = title.trim();
    if (cleanTitle && !looksLikeUrl(cleanTitle)) return cleanTitle;

    try {
        const url = new URL(sourceUrl);
        const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
        return shorten(`${url.hostname.replace(/^www\./, '')}${path}`, 78);
    } catch {
        return shorten(sourceUrl.trim() || 'Untitled source', 78);
    }
}

function looksLikeUrl(value: string) {
    return /^https?:\/\//i.test(value);
}

function shorten(value: string, maximumLength: number) {
    if (value.length <= maximumLength) return value;
    return `${value.slice(0, maximumLength - 1)}…`;
}
