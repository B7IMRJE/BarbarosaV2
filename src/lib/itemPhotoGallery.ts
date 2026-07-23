export const itemPhotoGalleryCategories = [
    'main_photo',
    'equipment_photo',
    'serial_photo',
    'model_photo',
    'other_photo',
] as const;

export const itemPhotoUploadCategories = [
    'equipment_photo',
    'serial_photo',
    'model_photo',
    'other_photo',
] as const;

export type ItemPhotoGalleryCategory = typeof itemPhotoGalleryCategories[number];

export type ItemPhotoGalleryGroup<T> = {
    category: ItemPhotoGalleryCategory;
    records: T[];
};

export function normalizeItemPhotoGalleryCategory(
    category?: string | null
): ItemPhotoGalleryCategory {
    const normalized = String(category || '').trim().toLowerCase();

    if (normalized === 'main_photo') return 'main_photo';
    if (normalized === 'equipment_photo') return 'equipment_photo';
    if (normalized === 'serial_photo' || normalized === 'serial_number_photo') return 'serial_photo';
    if (normalized === 'model_photo' || normalized === 'model_number_photo') return 'model_photo';

    return 'other_photo';
}

export function buildItemPhotoGalleryGroups<T>(
    records: readonly T[],
    categoryFor: (record: T) => string | null | undefined
): ItemPhotoGalleryGroup<T>[] {
    const groups = new Map<ItemPhotoGalleryCategory, T[]>(
        itemPhotoGalleryCategories.map((category) => [category, []])
    );

    records.forEach((record) => {
        const category = normalizeItemPhotoGalleryCategory(categoryFor(record));
        groups.get(category)?.push(record);
    });

    return itemPhotoGalleryCategories.map((category) => ({
        category,
        records: groups.get(category) || [],
    }));
}

export function applyPersistedItemPhotoRemoval<T extends { id: string }>(
    records: readonly T[],
    removedId: string,
    persisted: boolean
) {
    if (!persisted) return [...records];

    return records.filter((record) => record.id !== removedId);
}
