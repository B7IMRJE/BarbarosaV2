import {
    catalogFactoryDuplicatePayload,
    createCatalogFactoryDuplicateDraft,
} from './catalogFactoryDuplicateCore';
import type { CatalogFactoryRecord } from './catalogFactory';

const source = {
    id: 'source-variant',
    shortCode: 'F01',
    familyId: 'family-1',
    templateId: 'template-1',
    category: 'Smart Water Shutoff And Leak Detection',
    manufacturer: 'Moen',
    brand: 'Moen',
    familyName: 'Flo Smart Water',
    modelNumber: '900-001',
    manufacturerPartNumber: '900-001',
    upcGtin: 'source-upc',
    color: '',
    finish: '',
    size: '',
    capacity: '',
    description: 'Source product',
    specifications: { product_name: 'Flo by Moen 3/4 in', size: '3/4 in', nested: { companion: 'meter spacer' } },
    status: 'approved',
    confidence: 1,
    validationWarnings: [],
    duplicateWarnings: [],
    missingFields: [],
    lastVerifiedAt: null,
    updatedAt: null,
    primaryImageUrl: 'https://example.test/source.jpg',
    assets: [],
    sources: [],
    retailListings: [],
} satisfies CatalogFactoryRecord;

const draft = createCatalogFactoryDuplicateDraft(source);
assert(draft.modelNumber === '', 'A duplicate must not copy the source model identity.');
assert(draft.manufacturerPartNumber === '', 'A duplicate must not copy the source MPN identity.');
assert(draft.upcGtin === '', 'A duplicate must not copy the source UPC identity.');
assert(draft.size === '3/4 in', 'A duplicate should copy product-specific size for editing.');
assert(draft.productTitle.startsWith('Copy of '), 'The unsaved copy must have an obvious new draft identity.');

(draft.specifications.nested as Record<string, unknown>).companion = 'new companion';
assert((source.specifications.nested as Record<string, unknown>).companion === 'meter spacer', 'Editing the duplicate must not mutate source specifications.');

draft.modelNumber = '900-002';
draft.manufacturerPartNumber = '900-002';
draft.size = '1 in';
const payload = catalogFactoryDuplicatePayload(draft);
assert(payload.model_number === '900-002', 'The new exact model must be sent to the duplicate RPC.');
assert(payload.specifications.size === '1 in', 'The edited size must replace the copied source size.');
assert(!('status' in payload), 'Duplicate authoring must not request approval or publication.');
assert(!('price' in payload), 'Duplicate authoring must not carry company pricing.');

console.log('Catalog Factory duplicate draft regression checks passed.');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
