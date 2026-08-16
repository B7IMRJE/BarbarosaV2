import {
    CATALOG_QUICK_START_SUGGESTIONS,
    CATALOG_QUICK_START_GROUPS,
    catalogBrandSuggestions,
    catalogCategorySuggestions,
    catalogFamilySuggestions,
    catalogQuickStartIsReady,
    catalogQuickStartGroupsForDeck,
} from './catalogFactorySuggestions';

const starterCards = [
    starter('bathroom:shower_tub', 'bathroom', 'Shower / Tub Plumbing', ['Shower', 'Tub']),
    starter('kitchen:kitchen_faucet', 'kitchen', 'Kitchen Faucet', ['Faucet']),
    starter('garage:water_heater', 'garage', 'Water Heater', ['Tankless Water Heater']),
    starter('pool:pool_pump', 'pool', 'Pool Pump', ['Circulation Pump']),
];
const templates = [
    template('shower', 'shower_valve', 'Shower Valve'),
    template('faucet', 'faucet', 'Faucet'),
    template('heater', 'water_heater', 'Water Heater'),
    template('pool', 'pool_equipment', 'Pool Equipment'),
];
const records = [
    record('one', 'shower', 'Moen', 'Moen', 'Chateau', '181119', 'Shower Valve'),
    record('two', 'faucet', 'Delta', 'Delta', 'Trinsic', '9159T-DST', 'Faucet'),
];

assert(catalogBrandSuggestions('Bathroom angle stop and supply line', records, 'brand').slice(0, 2).map((option) => option.value).join(',') === 'BrassCraft,Dahl', 'Angle-stop suggestions must prioritize BrassCraft and Dahl.');
assert(catalogBrandSuggestions('Full port ball valve', records, 'brand').slice(0, 5).map((option) => option.value).join(',') === 'NIBCO,Apollo,Watts,Legend Valve,Webstone', 'Ball-valve suggestions must prioritize the verified valve group.');
assert(catalogBrandSuggestions('Kitchen faucet', records, 'brand').slice(0, 3).map((option) => option.value).join(',') === 'Moen,Delta,Kohler', 'Fixture suggestions must prioritize Moen, Delta, and Kohler.');

const poolCategory = catalogCategorySuggestions(templates, starterCards).find((option) => option.value === 'pool');
assert(poolCategory?.description?.includes('Pool Pump'), 'Future areas must flow into category suggestions from live starter taxonomy without a screen code change.');
assert(poolCategory?.searchText?.includes('pool'), 'Starter taxonomy must remain searchable through the category combobox.');
assert(catalogCategorySuggestions(templates, starterCards).some((option) => option.addNewValue === 'Pool Pump'), 'A future starter archetype must offer an explicit add-category path without a hard-coded category release.');

assert(catalogFamilySuggestions(records, { templateId: 'shower', brand: 'Moen' })[0]?.value === 'Chateau', 'Family suggestions must prioritize existing families for the selected brand and category.');
assert(CATALOG_QUICK_START_SUGGESTIONS.length === 3, 'The first safe quick-start release must contain only the three verified Shower / Tub choices.');
assert(CATALOG_QUICK_START_SUGGESTIONS.every(catalogQuickStartIsReady), 'Every quick-start product must have an exact model, compatibility fields, and matching retailer source.');
assert(CATALOG_QUICK_START_SUGGESTIONS[0].seed.specifications.rough_in_valve_included === 'No', 'Chateau 181119 must remain clearly trim-only.');
assert(CATALOG_QUICK_START_SUGGESTIONS.slice(1).every((suggestion) => suggestion.seed.specifications.rough_in_valve_included?.startsWith('Yes')), 'Brantford and Align must remain trim plus rough-in valve bundles.');
assert(CATALOG_QUICK_START_SUGGESTIONS.every((suggestion) => !('price' in suggestion.seed)), 'Quick starts must never seed a company selling price.');
assert(catalogQuickStartGroupsForDeck(starterCards).find((group) => group.id === 'shower_tub')?.matchedStarterNames.includes('Shower / Tub Plumbing'), 'Quick-start groups must visibly match the current HomeOS starter archetype.');
assert(CATALOG_QUICK_START_GROUPS.find((group) => group.id === 'expansion_tank')?.requiredFacts.includes('incoming_pressure'), 'Expansion-tank authoring must require incoming pressure.');
assert(CATALOG_QUICK_START_GROUPS.find((group) => group.id === 'expansion_tank')?.requiredFacts.includes('pressure_setpoint'), 'Expansion-tank authoring must require the tank pressure setpoint.');
assert(CATALOG_QUICK_START_GROUPS.find((group) => group.id === 'water_heater')?.authoringNote.includes('user-defined selling tiers'), 'Water-heater tier language must remain explicitly user-defined rather than an objective quality claim.');

console.log('Catalog Factory suggestion regression checks passed.');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function starter(templateKey: string, roomKind: string, name: string, aliases: string[]) {
    return {
        templateKey,
        shortCode: '',
        roomKind,
        name,
        system: 'Plumbing',
        category: 'Fixture',
        parentTemplateKey: null,
        aliases,
        displayOrder: 1,
        readinessStatus: 'unbuilt' as const,
        adminNotes: '',
        mappedVariantIds: [],
        mappedCount: 0,
        approvedOptionCount: 0,
        readinessIssues: [],
    };
}

function template(id: string, templateKey: string, categoryName: string) {
    return { id, templateKey, categoryName, description: '', universalFields: [], specificationFields: [], requiredFields: [], status: 'approved' as const };
}

function record(id: string, templateId: string, manufacturer: string, brand: string, familyName: string, modelNumber: string, category: string) {
    return {
        id,
        shortCode: '',
        familyId: `${id}-family`,
        templateId,
        category,
        manufacturer,
        brand,
        familyName,
        modelNumber,
        manufacturerPartNumber: modelNumber,
        upcGtin: '',
        color: '',
        finish: '',
        size: '',
        capacity: '',
        description: '',
        specifications: {},
        status: 'approved' as const,
        confidence: 1,
        validationWarnings: [],
        duplicateWarnings: [],
        missingFields: [],
        lastVerifiedAt: null,
        updatedAt: null,
        primaryImageUrl: '',
        assets: [],
        sources: [],
        retailListings: [],
    };
}
