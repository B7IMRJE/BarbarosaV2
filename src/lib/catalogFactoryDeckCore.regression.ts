import {
    catalogFactoryStarterOptionsLabel,
    filterUnmappedCatalogFactoryRecords,
} from './catalogFactoryDeckCore';

const showerTub = {
    name: 'Shower / Tub',
    system: 'Plumbing',
    mappedVariantIds: ['moen-chateau'],
};
const records = [
    { id: 'moen-chateau', name: 'Moen Chateau' },
    { id: 'unmapped-faucet', name: 'Unmapped Faucet' },
];

assert(
    catalogFactoryStarterOptionsLabel(showerTub) === 'Options for Shower / Tub Plumbing',
    'The deck must label the exact starter parent relationship shown to Super Admin.',
);
assert(
    filterUnmappedCatalogFactoryRecords(records, [showerTub]).map((record) => record.id).join(',') === 'unmapped-faucet',
    'A mapped real product must appear inside its starter card and not as a loose card in the lower overview list.',
);

console.log('Catalog Factory deck presentation regression checks passed.');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
