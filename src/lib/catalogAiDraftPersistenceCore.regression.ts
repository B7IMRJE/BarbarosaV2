import {
    parseCatalogAiDraftSummaries,
    parseCatalogAiLoadedDraft,
} from './catalogAiDraftPersistenceCore';

const summaries = parseCatalogAiDraftSummaries([
    {
        id: '11111111-1111-1111-1111-111111111111', status: 'draft', category_template_id: 'category-1',
        category_name: 'Water Heater', manufacturer: 'Rheem', product_name: 'Performance Platinum',
        family_name: 'Performance', model_number: 'TEST-50', subtype: 'Water Heater',
        primary_image_url: 'https://manufacturer.example/product.jpg', created_at: '2026-08-22T10:00:00Z',
        updated_at: '2026-08-22T11:00:00Z',
    },
    { id: 'approved-id', status: 'approved' },
]);
assert(summaries.length === 1 && summaries[0].modelNumber === 'TEST-50', 'Only typed open-draft summaries should survive.');

const loaded = parseCatalogAiLoadedDraft({
    id: '11111111-1111-1111-1111-111111111111',
    status: 'draft',
    category_template_id: 'category-1',
    created_at: '2026-08-22T10:00:00Z',
    updated_at: '2026-08-22T11:00:00Z',
    draft_payload: {
        category_template_id: 'category-1', manufacturer: 'Rheem', brand: 'Rheem',
        family_name: 'Performance', product_name: 'Performance Platinum', model_number: 'TEST-50',
        manufacturer_part_number: 'MPN-50', description: 'Stored draft', primary_item_type: 'Equipment',
        subtype: 'Water Heater', tags: ['plumbing'], specifications: { capacity: '50 gallons', vent_type: '' },
        field_provenance: {
            model_number: { kind: 'verified', source_urls: ['https://manufacturer.example/product'], note: '' },
            capacity: { kind: 'verified', source_urls: ['https://manufacturer.example/spec'], note: '' },
            product_url: { kind: 'admin_entered', source_urls: [], note: '' },
        },
        placements: [{ system_key: 'Plumbing', area_key: 'Garage', parent_subtype: '', path: ['Garage'], reason: 'Valid placement' }],
        sources: [
            { type: 'manufacturer_product', title: 'Product', url: 'https://manufacturer.example/product' },
            { type: 'specification_sheet', title: 'Specifications', url: 'https://manufacturer.example/spec' },
        ],
        confidence: 0.9, validation_warnings: [], missing_fields: [],
        research_metadata: { prompt: 'Rheem 50 gallon water heater', admin_notes: 'Confirm venting', system: 'Plumbing' },
    },
    candidate_images: [{
        id: '22222222-2222-2222-2222-222222222222', image_url: 'storage://catalog-factory-media/ai-drafts/example/photo.jpg',
        source_url: 'storage://catalog-factory-media/ai-drafts/example/photo.jpg', title: 'Primary', confidence: 1,
        copied_bucket: 'catalog-factory-media', copied_storage_path: 'ai-drafts/example/photo.jpg',
        file_name: 'photo.jpg', mime_type: 'image/jpeg', size_bytes: 1200, selection_status: 'selected', is_primary: true,
    }],
});
assert(loaded.payload.primaryItemType === 'Equipment', 'Stored classification should hydrate without inference.');
assert(Object.hasOwn(loaded.payload.specifications, 'vent_type'), 'Known specification fields should survive resume even while blank.');
assert(loaded.payload.fieldProvenance.model_number?.kind === 'verified', 'Stored provenance should be preserved.');
assert(
    loaded.payload.fieldProvenance.capacity?.sourceUrls.join(',') === 'https://manufacturer.example/spec',
    'A field must retain only its exact source URLs instead of every curated draft source.',
);
assert(loaded.payload.fieldProvenance.product_url?.kind === 'admin_entered', 'Stored product_url provenance should survive loading.');
assert(loaded.candidateImages[0]?.selected && loaded.candidateImages[0]?.primary, 'Authoritative image review state should hydrate.');
assert(loaded.candidateImages[0]?.copiedStoragePath === 'ai-drafts/example/photo.jpg', 'Staged upload metadata should hydrate.');
assert(loaded.candidateImages[0]?.imageUrl.startsWith('storage://catalog-factory-media/'), 'Canonical stored-upload identity should remain available for re-save.');

console.log('catalog AI draft persistence core regression checks passed');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
