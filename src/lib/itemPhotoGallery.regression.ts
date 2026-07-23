import {
    buildItemPhotoGalleryGroups,
    itemPhotoGalleryCategories,
    normalizeItemPhotoGalleryCategory,
} from './itemPhotoGallery';

runItemPhotoGalleryRegressions();

export function runItemPhotoGalleryRegressions() {
    everyPhotoAppearsInExactlyOneCategory();
    uploadCategoriesRemainSeparate();
    legacyOtherAndUnknownCategoriesStayVisible();
    emptyCategoriesRemainAvailable();
}

function everyPhotoAppearsInExactlyOneCategory() {
    const records = [
        photo('main', 'main_photo'),
        photo('equipment', 'equipment_photo'),
        photo('serial', 'serial_photo'),
        photo('model', 'model_photo'),
        photo('other', 'other_photo'),
    ];
    const groups = buildItemPhotoGalleryGroups(records, (record) => record.category);
    const groupedIds = groups.flatMap((group) => group.records.map((record) => record.id));

    assert(groupedIds.length === records.length, 'The photo gallery must not duplicate records between categories.');
    assert(new Set(groupedIds).size === records.length, 'Every photo must appear in exactly one category.');
}

function uploadCategoriesRemainSeparate() {
    const records = [
        photo('equipment', 'equipment_photo'),
        photo('serial', 'serial_photo'),
        photo('model', 'model_photo'),
    ];
    const groups = buildItemPhotoGalleryGroups(records, (record) => record.category);

    assert(groupCount(groups, 'equipment_photo') === 1, 'Equipment photos must stay in Equipment Photos.');
    assert(groupCount(groups, 'serial_photo') === 1, 'Serial number photos must stay in Serial Number Photos.');
    assert(groupCount(groups, 'model_photo') === 1, 'Model number photos must stay in Model Number Photos.');
}

function legacyOtherAndUnknownCategoriesStayVisible() {
    assert(
        normalizeItemPhotoGalleryCategory('other') === 'other_photo',
        'Legacy other photos must appear under Other Photos.'
    );
    assert(
        normalizeItemPhotoGalleryCategory('label_photo') === 'other_photo',
        'Historical photo labels must remain visible without being rewritten.'
    );
    assert(
        normalizeItemPhotoGalleryCategory('serial_number_photo') === 'serial_photo',
        'Historical serial-number labels must appear under Serial Number Photos.'
    );
    assert(
        normalizeItemPhotoGalleryCategory('model_number_photo') === 'model_photo',
        'Historical model-number labels must appear under Model Number Photos.'
    );
}

function emptyCategoriesRemainAvailable() {
    const groups = buildItemPhotoGalleryGroups([photo('serial', 'serial_photo')], (record) => record.category);

    assert(
        groups.length === itemPhotoGalleryCategories.length,
        'The gallery must render every category card even when a category is empty.'
    );
    assert(groupCount(groups, 'equipment_photo') === 0, 'Empty gallery categories must report a zero count.');
}

function photo(id: string, category: string) {
    return { id, category };
}

function groupCount(
    groups: ReturnType<typeof buildItemPhotoGalleryGroups<{ id: string; category: string }>>,
    category: typeof itemPhotoGalleryCategories[number]
) {
    return groups.find((group) => group.category === category)?.records.length || 0;
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
