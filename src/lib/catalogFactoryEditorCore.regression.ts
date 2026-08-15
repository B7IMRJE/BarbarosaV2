import {
    catalogFactoryEditorPayload,
    catalogFactoryEditorSpecifications,
    createCatalogFactoryEditorDraft,
} from './catalogFactoryEditorCore';
import type { CatalogFactoryRecord } from './catalogFactory';

function assert(condition: unknown, message: string) {
    if (!condition) throw new Error(message);
}

const record: CatalogFactoryRecord = {
    id: 'variant-1', familyId: 'family-1', templateId: 'template-1', category: 'Faucet', manufacturer: 'Acme', brand: 'Acme',
    familyName: 'Flow', modelNumber: 'F-100', manufacturerPartNumber: 'MPN-1', upcGtin: '', color: 'Chrome', finish: 'Polished',
    size: '', capacity: '', description: 'Fixture', specifications: {
        product_name: 'Acme Flow Faucet', compatibility: ['Deck mount', 'Three hole'], max_flow: '1.5 GPM', warranty: 'Old value',
    }, status: 'approved', confidence: 0.9, validationWarnings: [], duplicateWarnings: [], missingFields: [], lastVerifiedAt: null,
    updatedAt: null, primaryImageUrl: '', assets: [], sources: [], retailListings: [],
};

const draft = createCatalogFactoryEditorDraft(record);
assert(draft.productTitle === 'Acme Flow Faucet', 'The visual title must read the stored product name.');
assert(draft.compatibility.includes('Deck mount'), 'Compatibility arrays must become readable visual lines.');
assert(draft.specifications.max_flow === '1.5 GPM', 'Uncommon specifications must remain editable.');

draft.compatibility = 'Wall mount\nSingle hole';
draft.warranty = 'Limited lifetime';
const specifications = catalogFactoryEditorSpecifications(draft);
assert(Array.isArray(specifications.compatibility), 'Visual list fields must save as structured arrays.');
assert(specifications.manufacturer_warranty === 'Limited lifetime', 'Visual warranty must save in a stable metadata key.');
assert(!('warranty' in specifications), 'The legacy warranty key must not conflict with the visual field.');

const payload = catalogFactoryEditorPayload(draft, {
    confidence: record.confidence,
    validationWarnings: [],
    duplicateWarnings: [],
    missingFields: [],
});
assert(payload.model_number === 'F-100', 'Core identity fields must be preserved in the save payload.');
assert(Array.isArray(payload.sources), 'The save payload must always contain a sources array.');

console.log('catalogFactoryEditorCore regression checks passed');
