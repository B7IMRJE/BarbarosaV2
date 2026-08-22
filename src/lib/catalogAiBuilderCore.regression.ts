import {
    buildCatalogAiDraftPayload,
    curateCatalogAiSources,
    readCatalogAiResearchResponse,
} from './catalogAiBuilderCore';
import {
    CATALOG_AI_BUILDER_DEFAULT_MODEL,
    CATALOG_RESEARCH_DEFAULT_MODEL,
} from '../../supabase/functions/research-catalog-product/index';

assert(CATALOG_AI_BUILDER_DEFAULT_MODEL === 'gpt-5.6-terra', 'The new AI Catalog Builder path must default to Terra.');
assert(CATALOG_RESEARCH_DEFAULT_MODEL === 'gpt-5.6-luna', 'The existing legacy research path must retain its current model default.');

const sources = curateCatalogAiSources([
    { title: 'Product', url: 'https://manufacturer.example/product#overview', source_type: 'manufacturer_product' },
    { title: 'Duplicate product', url: 'https://manufacturer.example/product', source_type: 'manufacturer_product' },
    { title: 'Install', url: 'https://manufacturer.example/install.pdf', source_type: 'installation_manual' },
    { title: 'Owner', url: 'https://manufacturer.example/owner.pdf', source_type: 'owner_manual' },
    { title: 'Specs', url: 'https://manufacturer.example/spec.pdf', source_type: 'specification_sheet' },
    { title: 'Warranty', url: 'https://manufacturer.example/warranty.pdf', source_type: 'warranty_document' },
    { title: 'Retailer', url: 'https://retailer.example/item', source_type: 'retailer_page' },
]);
assert(sources.length === 4, 'AI sources must be hard-capped at four.');
assert(new Set(sources.map((source) => source.sourceType)).size === sources.length, 'Only one source per authoritative source type should survive.');
assert(!sources.some((source) => source.url.includes('retailer')), 'Retailer links must not enter the curated AI source set.');

const research = readCatalogAiResearchResponse({
    model: 'gpt-5.6-terra',
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, web_search_calls: 2, max_output_tokens: 4200 },
    research: {
        product_name: 'Performance Platinum 50 Gallon Water Heater',
        manufacturer: 'Rheem',
        brand: 'Rheem',
        family_name: 'Performance Platinum',
        model_number: 'TEST-50G',
        manufacturer_part_number: 'TEST-50G',
        upc_gtin: '',
        primary_item_type: 'Equipment',
        subtype: 'Water Heater',
        category: 'Tank Water Heater',
        system: 'Plumbing',
        short_description: 'Gas storage water heater.',
        detailed_description: 'A verified test fixture.',
        tags: ['plumbing', 'gas', 'plumbing'],
        fields: [
            { key: 'Capacity', label: 'Capacity', value: '50 gallons', provenance: { kind: 'verified', source_urls: ['https://manufacturer.example/spec.pdf'], note: '' } },
            { key: 'Unverified Field', label: 'Unverified Field', value: 'Unknown', provenance: { kind: 'verified', source_urls: ['https://not-curated.example/source'], note: '' } },
        ],
        placements: [
            { system_key: 'plumbing', area_key: 'garage', parent_subtype: '', path: ['Garage'], reason: 'Typical installation area.' },
            { system_key: 'plumbing', area_key: 'garage', parent_subtype: '', path: ['Garage'], reason: 'Duplicate.' },
        ],
        sources: [
            { title: 'Product', url: 'https://manufacturer.example/product', source_type: 'manufacturer_product' },
            { title: 'Specs', url: 'https://manufacturer.example/spec.pdf', source_type: 'specification_sheet' },
        ],
        candidate_images: [
            { image_url: 'https://manufacturer.example/product.jpg', source_url: 'https://manufacturer.example/product', title: 'Front', alt_text: 'Water heater', confidence: 0.9, selected: false, primary: false },
        ],
        confidence: 'high', exact_model_match: true, warnings: [],
    },
});
assert(research.model === 'gpt-5.6-terra', 'The AI Catalog Builder should expose the requested Terra model.');
assert(research.tags.length === 2 && research.placements.length === 1, 'Tags and placements should be deduplicated.');
assert(research.fields[0]?.provenance.kind === 'verified', 'Curated source-backed facts should remain verified.');
assert(research.fields[1]?.provenance.sourceUrls.length === 0, 'Non-curated field sources should be removed.');

const payload = buildCatalogAiDraftPayload({
    prompt: 'Rheem 50 gallon gas water heater',
    manufacturer: 'Admin-entered Rheem',
    manufacturerPartNumber: 'ADMIN-MPN-50',
}, research, '11111111-1111-1111-1111-111111111111', '2026-08-22T12:00:00.000Z');
assert(payload.manufacturer === 'Admin-entered Rheem', 'Admin-entered values must win over AI research.');
assert(payload.fieldProvenance.manufacturer?.kind === 'admin_entered', 'Admin-entered fields must retain provenance.');
assert(payload.primaryItemType === 'Equipment' && payload.subtype === 'Water Heater', 'Canonical classification should be saved in the draft payload.');
assert(payload.manufacturerPartNumber === 'ADMIN-MPN-50', 'Administrator-entered manufacturer part numbers must remain first-class values.');
assert(payload.researchMetadata.research_model === 'gpt-5.6-terra', 'Research model metadata should be persisted.');
assert(payload.candidateImages.length === 1, 'Candidate images should be preserved for review, not auto-published.');

const incomplete = readCatalogAiResearchResponse({
    research: {
        manufacturer: 'Example Manufacturer',
        primary_item_type: 'Imaginary Type',
        sources: [], fields: [], placements: [], candidate_images: [], tags: [], warnings: [],
    },
});
const incompletePayload = buildCatalogAiDraftPayload({ prompt: 'A product without a verified model' }, incomplete, '');
assert(incomplete.primaryItemType === '', 'An invalid AI classification must remain blank instead of silently becoming a Component.');
assert(incompletePayload.modelNumber === '', 'An incomplete draft must not fabricate a model number.');
assert(incompletePayload.familyName === '', 'An incomplete draft must not persist a placeholder product family.');
assert(incompletePayload.missingFields.includes('model_number'), 'Incomplete identity should be recorded as a missing approval field.');

console.log('catalog AI Builder core regression checks passed');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
