import {
    companyCatalogPackageLimit,
    parseCompanyCatalogEntitlement,
    toggleCompanyCatalogSelection,
    validateCompanyCatalogEntitlementDraft,
} from './companyCatalogEntitlementCore';

const parsed = parseCompanyCatalogEntitlement({
    company_id: 'company-a',
    active: true,
    package_tier: 'curated_10',
    selection_mode: 'package',
    selected_variant_ids: ['variant-a', 'variant-a', 'variant-b'],
    selected_count: 2,
    assigned_count: 2,
    available_count: 37,
    updated_at: '2026-08-15T12:00:00Z',
});

assert(parsed, 'A valid catalog entitlement should parse.');
assert(parsed.packageTier === 'curated_10', 'Curated 10 should remain a supported package tier.');
assert(parsed.selectedVariantIds.length === 2, 'Duplicate master-card selections should be removed.');
assert(companyCatalogPackageLimit('curated_20') === 20, 'Curated 20 should cap the company package at 20 cards.');
assert(companyCatalogPackageLimit('full') === null, 'Full catalog access should not have a card limit.');

const tenSelections = Array.from({ length: 10 }, (_, index) => `variant-${index}`);
assert(
    toggleCompanyCatalogSelection(tenSelections, 'variant-over-limit', 'curated_10').length === 10,
    'Curated packages must not exceed their card limit.',
);
assert(
    toggleCompanyCatalogSelection(tenSelections, 'variant-3', 'curated_10').length === 9,
    'An included card should be removable from a curated package.',
);
assert(
    validateCompanyCatalogEntitlementDraft({ active: true, packageTier: 'curated_10', selectedVariantIds: [] })
        .includes('Choose at least one'),
    'An active curated package must include at least one master card.',
);
assert(
    validateCompanyCatalogEntitlementDraft({ active: false, packageTier: 'curated_10', selectedVariantIds: [] }) === '',
    'An inactive catalog may be saved before its future package is selected.',
);
assert(
    validateCompanyCatalogEntitlementDraft({ active: true, packageTier: 'full', selectedVariantIds: [] }) === '',
    'The full master catalog should not require explicit duplicated selections.',
);

console.log('company catalog entitlement regression checks passed');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
