export type HomeItemSafetyGuideKind = 'water_main_shutoff';

export type HomeItemSafetyGuideRecord = {
    id: string;
    property_id: string;
    home_item_id: string;
    guide_kind: HomeItemSafetyGuideKind;
    location_description: string;
    operation_instructions: string;
    safety_warning: string | null;
    storage_bucket: string;
    photo_storage_path: string;
    video_storage_path: string;
    active: boolean;
    created_at: string;
    updated_at: string;
};

export type SafetyGuideEligibleItem = {
    name?: unknown;
    category?: unknown;
    item_slug?: unknown;
};

export const WATER_MAIN_SHUTOFF_DEFAULT_INSTRUCTIONS =
    'Turn the main water shutoff slowly clockwise until it stops. Do not force a stuck, damaged, or leaking valve. Call your provider or emergency services when the area is unsafe.';

function normalize(value: unknown) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ');
}
export function homeItemSafetyGuideKind(
    item: SafetyGuideEligibleItem | null | undefined
): HomeItemSafetyGuideKind | null {
    if (!item) return null;

    const identity = [item.name, item.category, item.item_slug]
        .map(normalize)
        .filter(Boolean)
        .join(' ');
    const isWaterMain = /\bwater\s+(main|service)\b/.test(identity);
    const isShutoff = /\b(shut\s*off|shutoff|stop\s*valve)\b/.test(identity);

    return isWaterMain && isShutoff ? 'water_main_shutoff' : null;
}

export function isCompleteHomeItemSafetyGuide(
    guide: Partial<HomeItemSafetyGuideRecord> | null | undefined
) {
    return Boolean(
        guide?.active &&
        String(guide.location_description || '').trim() &&
        String(guide.operation_instructions || '').trim() &&
        String(guide.photo_storage_path || '').trim() &&
        String(guide.video_storage_path || '').trim()
    );
}

export function readHomeItemSafetyGuide(value: unknown): HomeItemSafetyGuideRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const row = value as Record<string, unknown>;
    const guideKind = row.guide_kind === 'water_main_shutoff'
        ? row.guide_kind
        : null;

    if (
        !guideKind ||
        !row.id ||
        !row.property_id ||
        !row.home_item_id ||
        !row.location_description ||
        !row.operation_instructions ||
        !row.photo_storage_path ||
        !row.video_storage_path
    ) {
        return null;
    }

    return {
        id: String(row.id),
        property_id: String(row.property_id),
        home_item_id: String(row.home_item_id),
        guide_kind: guideKind,
        location_description: String(row.location_description),
        operation_instructions: String(row.operation_instructions),
        safety_warning: row.safety_warning ? String(row.safety_warning) : null,
        storage_bucket: String(row.storage_bucket || 'item-files'),
        photo_storage_path: String(row.photo_storage_path),
        video_storage_path: String(row.video_storage_path),
        active: row.active !== false,
        created_at: String(row.created_at || ''),
        updated_at: String(row.updated_at || ''),
    };
}
