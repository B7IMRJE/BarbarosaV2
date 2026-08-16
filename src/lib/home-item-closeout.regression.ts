import {
    buildCloseoutWarranty,
    buildHomeItemCloseoutDraft,
    defaultHomeItemCloseoutType,
    isInactiveHomeItemStatus,
    unresolvedCatalogPublicationConflicts,
    warrantyExpirationDate,
    type HomeItemCloseoutContext,
} from './home-item-closeout-core';

const baseContext: HomeItemCloseoutContext = {
    linked: true,
    workflow_id: 'workflow-1',
    home_item_id: 'item-1',
    item: {
        id: 'item-1',
        name: 'Shower Valve',
        system: 'Plumbing',
        category: 'Valve',
        location: 'Master Bathroom',
        parent_area: 'Shower',
        status: 'Missing',
        condition: 'Unknown',
        install_state: 'Not Installed',
        installed_on: null,
        brand: null,
        model: null,
        serial_number: null,
        part_number: null,
        installation_notes: null,
    },
    draft: null,
    approved_scope: ['Install shower valve'],
    attachment_counts: { before: 2, after: 4 },
};

assert(isInactiveHomeItemStatus('Missing', 'Not Installed'), 'Missing items should default to installation.');
assert(defaultHomeItemCloseoutType(baseContext) === 'installed', 'Inactive linked items should default to installed.');
assert(
    defaultHomeItemCloseoutType({
        ...baseContext,
        item: { ...baseContext.item!, status: 'Installed', install_state: 'Installed' },
    }) === 'repaired',
    'Active installed items should default to repaired work.'
);

assert(
    warrantyExpirationDate('2026-08-10', '1_year') === '2027-08-10',
    'A one-year warranty should expire one calendar year after installation.'
);
assert(
    warrantyExpirationDate('2026-08-10', 'limited_lifetime') === null,
    'Limited lifetime warranties should not invent an expiration date.'
);

const draft = buildHomeItemCloseoutDraft({
    completionType: 'installed',
    itemName: 'Shower Valve',
    condition: 'Newly Installed',
    completionDate: '2026-08-10',
    installedOn: '2026-08-10',
    brand: 'Delta',
    workPerformed: 'Installed the approved shower valve and tested operation.',
    warranties: [
        buildCloseoutWarranty({
            warrantyType: 'workmanship',
            choice: 'lifetime',
            startDate: '2026-08-10',
        }),
        buildCloseoutWarranty({
            warrantyType: 'labor',
            choice: '1_year',
            startDate: '2026-08-10',
        }),
        buildCloseoutWarranty({
            warrantyType: 'manufacturer_parts',
            choice: 'unknown_verify_later',
            startDate: '2026-08-10',
        }),
    ],
});

assert(draft.status === 'Installed', 'Permanent status must be Installed, never Brand New.');
assert(draft.condition === 'Newly Installed', 'Condition must remain separate from installed status.');
assert(draft.completion_date === '2026-08-10', 'Service completion and installation dates must remain explicit.');
assert(draft.warranties.length === 3, 'Warranty types must remain separate.');
assert(
    draft.warranties[1]?.expiration_date === '2027-08-10',
    'Labor warranty expiration should be calculated from installation date.'
);
assert(
    draft.warranties[2]?.verification_status === 'verify_later',
    'Unknown manufacturer coverage must remain explicitly unverified.'
);
assert(
    Object.keys(draft.catalog_conflict_resolutions).length === 0,
    'A new closeout draft should not invent catalog conflict decisions.'
);

const conflicts = unresolvedCatalogPublicationConflicts({
    proposal_id: 'proposal-1',
    reviewed_at: null,
    resolutions: {},
    existing_facts: { brand: 'Delta' },
    catalog_facts: { brand: 'Moen' },
    conflicts: [{ field: 'brand', label: 'Brand', existing_value: 'Delta', catalog_value: 'Moen' }],
    product: {
        id: 'product-1', product_name: 'Moen Faucet', category: 'Faucet', brand: 'Moen', model: 'M1',
        manufacturer_part_number: null, workmanship_warranty: null, labor_warranty: null, manufacturer_warranty: null,
    },
}, {});
assert(conflicts.length === 1, 'A conflicting non-empty installed fact must require an explicit closeout choice.');
assert(
    unresolvedCatalogPublicationConflicts({
        proposal_id: 'proposal-1', reviewed_at: null, resolutions: {}, existing_facts: {}, catalog_facts: {},
        conflicts: [{ field: 'brand', label: 'Brand', existing_value: 'Delta', catalog_value: 'Moen' }],
        product: {
            id: 'product-1', product_name: 'Moen Faucet', category: 'Faucet', brand: 'Moen', model: 'M1',
            manufacturer_part_number: null, workmanship_warranty: null, labor_warranty: null, manufacturer_warranty: null,
        },
    }, { brand: 'existing' }).length === 0,
    'Choosing the existing value should resolve the catalog conflict without overwriting it.'
);

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

console.log('Home item closeout regression checks passed.');
