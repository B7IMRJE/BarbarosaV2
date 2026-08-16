import {
    applyCatalogResearchToSeedDraft,
    applyCatalogProductResearch,
    mapCatalogResearchSpecifications,
    readCatalogProductResearchResponse,
    type CatalogResearchDraft,
} from './catalogProductResearchCore';
import { getPlumbingCatalogSuggestions } from './plumbingCatalogSuggestions';

const response = readCatalogProductResearchResponse({
    ok: true,
    model: 'gpt-5.6-luna',
    usage: {
        input_tokens: 900,
        output_tokens: 700,
        total_tokens: 1_600,
        web_search_calls: 1,
        max_output_tokens: 2_400,
    },
    research: {
        product_name: 'Moen Posi-Temp Shower Valve with Remodel Plate',
        category: 'Shower Valve',
        manufacturer: 'Moen Incorporated',
        brand: 'Moen',
        family_name: 'Posi-Temp',
        model_number: 'TEST-VALVE-1',
        manufacturer_part_number: 'TEST-VALVE-1',
        sku: '',
        description: 'Pressure-balancing shower valve package for a documented retrofit application.',
        specifications: [
            { key: 'Valve type', value: 'Pressure-balancing', source_url: 'https://www.moen.com/example' },
            { key: 'Valve type', value: 'Pressure-balancing', source_url: 'https://www.moen.com/example' },
        ],
        compatible_applications: [
            { value: 'Remodel / retrofit opening', source_url: 'https://www.moen.com/example' },
        ],
        installation_requirements: [
            { value: 'Confirm finished-wall coverage', source_url: 'https://www.moen.com/example-manual', requirement_type: 'manufacturer' },
            { value: 'Confirm local inspection requirements', source_url: '', requirement_type: 'code_verification' },
        ],
        manufacturer_warranty: 'Manufacturer limited warranty; verify eligibility and terms.',
        manufacturer_reference: 'https://www.moen.com/example',
        sources: [
            { title: 'Moen product page', url: 'https://www.moen.com/example', source_type: 'manufacturer_product' },
            { title: 'Unsafe source', url: 'javascript:alert(1)', source_type: 'other' },
        ],
        confidence: 'high',
        exact_model_match: true,
        warnings: [],
    },
});

assert(response.specifications.length === 1, 'Duplicate researched specifications should be removed.');
assert(response.sources.length === 1, 'Only safe HTTP(S) research sources should be retained.');
assert(response.installationRequirements[1]?.requirementType === 'code_verification', 'Requirement verification types should be preserved.');
assert(response.usage?.totalTokens === 1_600 && response.usage.maxOutputTokens === 2_400, 'Research usage and cost caps should be visible to the client.');

const faucetSpecifications = mapCatalogResearchSpecifications(response, {
    universalFields: [],
    specificationFields: [{ key: 'application' }, { key: 'valve_type' }],
    requiredFields: ['application'],
});
assert(faucetSpecifications.application === 'Remodel / retrofit opening', 'A researched compatible application should satisfy an application-required category template.');
assert(faucetSpecifications.valve_type === 'Pressure-balancing', 'Human-readable researched keys should map to canonical template keys.');

const draft: CatalogResearchDraft & { approvedSellingPrice: number; companyNotes: string } = {
    productName: 'Field-entered card',
    category: 'Shower Valve',
    brand: 'Moen',
    model: 'TEST-VALVE-1',
    manufacturerPartNumber: '',
    sku: 'COMPANY-SKU',
    description: 'Field description',
    specifications: { Finish: 'Chrome' },
    compatibleApplications: ['Shower only'],
    installationRequirements: ['Protect work area'],
    manufacturerWarranty: '',
    manufacturerReference: '',
    approvedSellingPrice: 925,
    companyNotes: 'Keep this private company note.',
};

const applied = applyCatalogProductResearch(
    draft,
    response,
    ['identity', 'specifications', 'applications', 'requirements', 'warranty'],
);

assert(applied.approvedSellingPrice === 925, 'Applying manufacturer research must preserve company pricing.');
assert(applied.companyNotes === 'Keep this private company note.', 'Applying manufacturer research must preserve company notes.');
assert(applied.specifications.Finish === 'Chrome', 'Applying research must merge with existing specifications.');
assert(applied.specifications['Valve type'] === 'Pressure-balancing', 'Researched specifications should be added to the draft.');
assert(applied.description === 'Field description', 'Unselected research groups must not overwrite draft fields.');
assert(applied.compatibleApplications.includes('Shower only') && applied.compatibleApplications.includes('Remodel / retrofit opening'), 'Applications should merge without removing field selections.');

const seedDraft = {
    category: 'shower_valve',
    manufacturer: 'Field-entered manufacturer',
    brand: 'Moen',
    family_name: '',
    model_number: 'TEST-VALVE-1',
    manufacturer_part_number: '',
    description: 'Keep this field-entered description.',
    specifications: JSON.stringify({ valve_type: 'Technician-confirmed valve type' }),
    sources: JSON.stringify([{ type: 'other', url: 'https://example.com/existing', title: 'Existing source' }]),
    confidence: '0.8',
    retail_listings: '[]',
    approvedSellingPrice: 925,
};
const appliedSeed = applyCatalogResearchToSeedDraft(seedDraft, response, {
    universalFields: [],
    specificationFields: [{ key: 'application' }, { key: 'valve_type' }],
    requiredFields: ['application'],
}, '2026-08-16T12:00:00.000Z');
const appliedSeedSpecifications = JSON.parse(appliedSeed.draft.specifications) as Record<string, unknown>;
const appliedSeedSources = JSON.parse(appliedSeed.draft.sources) as Record<string, unknown>[];
assert(appliedSeed.draft.manufacturer === 'Field-entered manufacturer', 'Seed research must not overwrite a non-empty manufacturer.');
assert(appliedSeed.draft.description === 'Keep this field-entered description.', 'Seed research must not overwrite a non-empty description.');
assert(appliedSeed.draft.family_name === 'Posi-Temp', 'Seed research should fill blank identity fields.');
assert(appliedSeed.draft.manufacturer_part_number === 'TEST-VALVE-1', 'Seed research should fill a blank manufacturer part number.');
assert(appliedSeedSpecifications.valve_type === 'Technician-confirmed valve type', 'Seed research must preserve conflicting existing specifications.');
assert(appliedSeedSpecifications.application === 'Remodel / retrofit opening', 'Seed research should merge new category specifications into blank fields.');
assert(appliedSeedSources.length === 2 && appliedSeedSources[0]?.url === 'https://example.com/existing', 'Seed research should retain existing sources and append new unique sources.');
assert(appliedSeed.draft.confidence === '0.8', 'Seed research must preserve an existing confidence value.');
assert(appliedSeed.draft.retail_listings === '[]' && appliedSeed.draft.approvedSellingPrice === 925, 'Applying research must not create pricing, offers, or other side effects.');
assert(appliedSeed.appliedFieldCount > 0 && appliedSeed.preservedFieldCount > 0, 'The seed transfer should report both applied and preserved values for visible click confirmation.');

const invalidJsonSeed = applyCatalogResearchToSeedDraft({ ...seedDraft, specifications: '{keep invalid', sources: '[keep invalid' }, response);
assert(invalidJsonSeed.draft.specifications === '{keep invalid' && invalidJsonSeed.draft.sources === '[keep invalid', 'Invalid existing advanced JSON must be preserved instead of overwritten by research.');

const showerSuggestions = getPlumbingCatalogSuggestions({ category: 'Shower Valve', brand: 'Moen', productName: 'Retrofit kit' });
assert(showerSuggestions.profileLabel === 'Shower or tub valve', 'Moen shower products should receive shower-valve field options.');
assert(showerSuggestions.specifications.some((item) => item.value === 'Moen Posi-Temp'), 'Moen shower-valve options should include the Posi-Temp platform.');
assert(showerSuggestions.installationRequirements.some((item) => item.includes('anti-scald')), 'Shower-valve requirements should include anti-scald setup.');

const nonMoenShowerSuggestions = getPlumbingCatalogSuggestions({ category: 'Shower Valve', brand: 'Delta' });
assert(!nonMoenShowerSuggestions.specifications.some((item) => item.value.includes('Moen')), 'Moen-only choices must not appear for another shower-valve brand.');
assert(!nonMoenShowerSuggestions.compatibleApplications.some((item) => item.includes('Moen')), 'Moen-only applications must not appear for another shower-valve brand.');

const tanklessSuggestions = getPlumbingCatalogSuggestions({ category: 'Tankless Water Heater' });
assert(tanklessSuggestions.profileLabel === 'Tankless water heater', 'Tankless products should receive the tankless profile.');
assert(tanklessSuggestions.installationRequirements.some((item) => item.includes('windows, doors, air intakes')), 'Tankless options should require termination-clearance verification.');
assert(tanklessSuggestions.installationRequirements.some((item) => item.includes('Category III')), 'Non-condensing tankless vent verification should be available.');
assert(tanklessSuggestions.installationRequirements.some((item) => item.includes('condensate')), 'Condensing tankless drain verification should be available.');

let incompleteRejected = false;
try {
    readCatalogProductResearchResponse({ research: { category: 'Shower Valve', brand: 'Moen' } });
} catch {
    incompleteRejected = true;
}
assert(incompleteRejected, 'Incomplete manufacturer research must not be applied.');

console.log('catalog product research regression checks passed');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
