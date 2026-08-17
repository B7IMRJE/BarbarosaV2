import {
    calculateCompanyCatalogLaborAmount,
    calculateCompanyCatalogMinimum,
    calculateCompanyCatalogMarkupAmount,
    normalizeCompanyCatalogMarkupMode,
    splitCompanyCatalogMasterItems,
} from './companyCatalogPricingCore';
import type { ApprovedMasterCatalogItem } from './catalogFactory';

assert(normalizeCompanyCatalogMarkupMode(undefined) === 'amount', 'Existing markup values must default to dollar amount mode.');
assert(normalizeCompanyCatalogMarkupMode('percent') === 'percent', 'Percent mode must remain explicit.');
assert(calculateCompanyCatalogMarkupAmount(800, 15, 'percent') === 120, 'Percent markup must calculate from material cost.');
assert(calculateCompanyCatalogMarkupAmount(800, 125, 'amount') === 125, 'Dollar markup must preserve its saved amount.');
assert(calculateCompanyCatalogLaborAmount(2.5, 150) === 375, 'Fractional labor hours must use the company hourly rate.');
assert(calculateCompanyCatalogMinimum({
    materialCost: 800,
    markup: 15,
    markupMode: 'percent',
    laborHours: 2.5,
    laborAmount: null,
    minimumPrice: null,
    preferredSupplier: '',
    companyWarranty: '',
    active: true,
}, 150) === 1295, 'Pricing List must calculate cost plus markup plus hourly labor without mutating the saved minimum.');

const split = splitCompanyCatalogMasterItems([
    product('active-offering', true),
    product('available-master', false),
]);
assert(split.companyOfferings.map((item) => item.id).join() === 'active-offering', 'Company offerings must render in the company catalog list.');
assert(split.availableMasterProducts.map((item) => item.id).join() === 'available-master', 'Master browsing must omit already-added offerings.');

function product(id: string, hasOffering: boolean): ApprovedMasterCatalogItem {
    return {
        id,
        shortCode: 'F01',
        category: 'Smart Water Shutoff',
        manufacturer: 'Moen',
        brand: 'Flo by Moen',
        familyName: 'Smart Water Monitor and Shutoff',
        modelNumber: 'Test',
        manufacturerPartNumber: '',
        upcGtin: '',
        description: '',
        specifications: {},
        primaryImageUrl: '',
        primaryImageBucket: '',
        primaryImagePath: '',
        entitled: true,
        offering: hasOffering ? {
            materialCost: 400,
            markup: 100,
            markupMode: 'amount',
            laborHours: null,
            laborAmount: 200,
            minimumPrice: 900,
            preferredSupplier: '',
            companyWarranty: '',
            active: true,
        } : null,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

console.log('Company catalog pricing regression checks passed.');
