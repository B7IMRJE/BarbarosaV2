import type { ApprovedMasterCatalogItem } from './catalogFactory';
import {
    estimateCategoryForHomeItemCatalog,
    filterCatalogItemsForHomeItem,
} from './home-item-catalog-core';

const kitchenFaucet = product({
    id: 'kitchen-faucet',
    category: 'Faucet',
    description: 'Single-handle kitchen faucet',
    specifications: { application: 'Kitchen', finish: 'Chrome' },
});
const showerTrim = product({
    id: 'shower-trim',
    category: 'Faucet',
    description: 'Posi-Temp shower and tub trim',
    specifications: { application: 'Shower' },
});
const unentitledKitchenFaucet = product({
    id: 'unentitled-kitchen-faucet',
    category: 'Faucet',
    description: 'Kitchen faucet',
    entitled: false,
});
const inactiveKitchenFaucet = product({
    id: 'inactive-kitchen-faucet',
    category: 'Faucet',
    description: 'Kitchen faucet',
    offering: { ...offering(), active: false },
});

const kitchenMatches = filterCatalogItemsForHomeItem(
    [showerTrim, unentitledKitchenFaucet, inactiveKitchenFaucet, kitchenFaucet],
    {
        name: 'Kitchen Faucet',
        category: 'Fixture',
        system: 'Plumbing',
        location: 'Kitchen',
    },
);

assert(kitchenMatches.length === 1, 'Only the entitled, active, context-matched company offering should remain.');
assert(kitchenMatches[0]?.id === 'kitchen-faucet', 'Kitchen Faucet must not match a shower/tub faucet.');

const genericKitchenMatches = filterCatalogItemsForHomeItem(
    [showerTrim, kitchenFaucet],
    { name: 'Kitchen', category: 'Area', location: 'Kitchen' },
);
assert(genericKitchenMatches[0]?.id === 'kitchen-faucet', 'A generic Kitchen context should require a Kitchen application match.');
assert(
    estimateCategoryForHomeItemCatalog({ name: 'Kitchen Faucet' }, kitchenFaucet) === 'faucet_replacement',
    'A faucet catalog choice should open the faucet replacement estimate category.',
);

function product(overrides: Partial<ApprovedMasterCatalogItem>): ApprovedMasterCatalogItem {
    return {
        id: 'product',
        category: 'Fixture',
        manufacturer: 'Manufacturer',
        brand: 'Brand',
        familyName: 'Family',
        modelNumber: 'Model',
        manufacturerPartNumber: 'MPN',
        upcGtin: '',
        description: '',
        specifications: {},
        primaryImageUrl: '',
        primaryImageBucket: '',
        primaryImagePath: '',
        entitled: true,
        offering: offering(),
        ...overrides,
    };
}

function offering() {
    return {
        id: 'offering',
        companyId: 'company',
        productVariantId: 'variant',
        companyCatalogProductId: 'company-product',
        materialCost: 100,
        markup: 1,
        laborAmount: 100,
        installedPrice: 300,
        preferredSupplier: '',
        companyWarranty: '',
        active: true,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

console.log('Home item catalog regression checks passed.');
