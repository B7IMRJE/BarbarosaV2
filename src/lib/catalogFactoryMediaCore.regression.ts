import { reconcileCatalogFactoryMediaRemoval } from './catalogFactoryMediaCore';

const assets = [
    { id: 'primary-photo', assetType: 'image', active: true, isPrimary: true },
    { id: 'next-photo', assetType: 'image', active: true, isPrimary: false },
    { id: 'hidden-photo', assetType: 'image', active: false, isPrimary: false },
    { id: 'manual', assetType: 'installation_manual', active: true, isPrimary: false },
];

const afterPrimaryRemoval = reconcileCatalogFactoryMediaRemoval(
    assets,
    'primary-photo',
    'next-photo',
);

assert(!afterPrimaryRemoval.some((asset) => asset.id === 'primary-photo'), 'Only the selected media asset should be removed.');
assert(afterPrimaryRemoval.find((asset) => asset.id === 'next-photo')?.isPrimary, 'The server-selected replacement photo should become primary.');
assert(!afterPrimaryRemoval.find((asset) => asset.id === 'hidden-photo')?.isPrimary, 'A hidden photo must not become primary.');
assert(afterPrimaryRemoval.some((asset) => asset.id === 'manual'), 'Removing a photo must preserve unrelated reference files.');

const afterSupportingRemoval = reconcileCatalogFactoryMediaRemoval(
    assets,
    'next-photo',
    'primary-photo',
);

assert(afterSupportingRemoval.find((asset) => asset.id === 'primary-photo')?.isPrimary, 'Removing a supporting photo must preserve the existing primary photo.');
assert(!afterSupportingRemoval.some((asset) => asset.id === 'next-photo'), 'The exact supporting photo should be removed.');

const afterLastPhotoRemoval = reconcileCatalogFactoryMediaRemoval(
    [{ id: 'only-photo', assetType: 'image', active: true, isPrimary: true }],
    'only-photo',
    null,
);

assert(afterLastPhotoRemoval.length === 0, 'Removing the last photo should leave an empty media list without inventing a replacement.');

console.log('Catalog Factory media removal regression checks passed.');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
