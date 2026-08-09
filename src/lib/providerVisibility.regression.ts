import {
    filterAvailableProviderCompanies,
    getExplicitProviderCategoryKeys,
    getProviderCategoryCatalog,
    hasExplicitProviderClassification,
} from './providerVisibility';

runProviderVisibilityRegressions();

export function runProviderVisibilityRegressions() {
    unclassifiedProviderIsHidden();
    existingPlumbingProviderHidesOtherPlumbers();
    unfilledHvacAndElectricalProvidersRemainVisible();
    invitationDoesNotBypassClassification();
    providerNeverAppearsUnderWrongCategory();
    categoryPickerUsesOnlyExplicitCanonicalCategories();
}

function unclassifiedProviderIsHidden() {
    const result = filterAvailableProviderCompanies([
        provider('unclassified', null),
        provider('blank', ['   ']),
        provider('unknown', ['Unknown']),
        provider('no-category', ['No category']),
        provider('invalid', ['Plumbing-ish services']),
    ], []);

    assert(result.companies.length === 0, 'Null, blank, unknown, No category, and invalid providers must be hidden.');
    assert(result.hiddenUnclassifiedCount === 5, 'Every invalid classification should be counted as hidden.');
}

function existingPlumbingProviderHidesOtherPlumbers() {
    const result = filterAvailableProviderCompanies([
        provider('current-plumber', ['Plumbing']),
        provider('other-plumber', ['Drain Cleaning']),
    ], ['plumbing'], ['current-plumber']);

    assert(result.companies.length === 0, 'An occupied Plumbing category must hide every competing Plumbing provider.');
    assert(result.hiddenByOccupiedCategoryCount === 1, 'The competing plumber should be hidden by the occupied category.');
}

function unfilledHvacAndElectricalProvidersRemainVisible() {
    const result = filterAvailableProviderCompanies([
        provider('plumber', ['Plumbing']),
        provider('hvac', ['HVAC']),
        provider('electrician', ['Electrical']),
    ], ['plumbing']);
    const visibleIds = result.companies.map((company) => company.id);

    assert(!visibleIds.includes('plumber'), 'A second Plumbing provider must be hidden.');
    assert(visibleIds.includes('hvac'), 'HVAC should remain visible while its category is unfilled.');
    assert(visibleIds.includes('electrician'), 'Electrical should remain visible while its category is unfilled.');
}

function invitationDoesNotBypassClassification() {
    const invitedProvider = {
        ...provider('invited', ['No category']),
        source: 'company_customer_invite',
    };
    const result = filterAvailableProviderCompanies([invitedProvider], []);

    assert(result.companies.length === 0, 'Invitation source must not make an unclassified provider visible.');
    assert(!hasExplicitProviderClassification(invitedProvider), 'An invitation must still require an explicit valid classification.');
}

function providerNeverAppearsUnderWrongCategory() {
    const hvacProvider = provider('hvac-only', ['HVAC']);
    const categoryKeys = getExplicitProviderCategoryKeys(hvacProvider.service_categories);
    const mixedProviderResult = filterAvailableProviderCompanies([
        provider('mixed', ['Plumbing', 'HVAC']),
    ], ['plumbing']);

    assert(categoryKeys.length === 1 && categoryKeys[0] === 'hvac', 'An HVAC provider should appear only in HVAC.');
    assert(!categoryKeys.includes('electrical'), 'A provider must never be inferred into an unassigned category.');
    assert(
        mixedProviderResult.companies[0]?.service_categories?.join(',') === 'HVAC',
        'A mixed provider must not appear under its occupied Plumbing category.'
    );
}

function categoryPickerUsesOnlyExplicitCanonicalCategories() {
    const catalog = getProviderCategoryCatalog();
    const labels = catalog.map((category) => category.label);

    assert(labels.includes('Plumbing'), 'The category picker must include the canonical Plumbing category.');
    assert(labels.includes('HVAC'), 'The category picker must include the canonical HVAC category.');
    assert(labels.includes('Electrical'), 'The category picker must include the canonical Electrical category.');
    assert(!labels.includes('No category'), 'No category must remain a hiding action, not a valid classification.');
    assert(
        new Set(catalog.map((category) => category.key)).size === catalog.length,
        'The category picker must not contain duplicate category assignments.'
    );
}

function provider(id: string, serviceCategories: string[] | null) {
    return {
        id,
        service_categories: serviceCategories,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
