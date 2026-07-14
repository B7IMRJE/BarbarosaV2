import {
    getCompanyPriceBookRpcNames,
    getCompanyPriceBookUpsertRpcName,
    readCompanyPriceBookRpcRowForRegression,
} from './companyPriceBook';
import { mapCompanyPriceBookItemToEstimateEntry } from './estimateOptions';

runCompanyPriceBookRegressions();

export function runCompanyPriceBookRegressions() {
    estimateLoaderPrefersVersionedRpcWithLegacyFallback();
    adminPriceBookWritesKeepLegacyUpsertRpc();
    legacyRpcShapeStillMapsForExistingCallers();
    versionedRpcShapeSuppliesEstimateOptionFields();
}

function estimateLoaderPrefersVersionedRpcWithLegacyFallback() {
    const rpcNames = getCompanyPriceBookRpcNames();

    assert(rpcNames[0] === 'get_company_price_book_v2', 'Estimate price-book loader should try the versioned RPC first.');
    assert(rpcNames[1] === 'get_company_price_book', 'Estimate price-book loader should keep the existing RPC fallback.');
}

function adminPriceBookWritesKeepLegacyUpsertRpc() {
    assert(
        getCompanyPriceBookUpsertRpcName() === 'upsert_company_price_book_item',
        'Existing price-book editor writes should keep the legacy upsert RPC with production parameter defaults.'
    );
}

function legacyRpcShapeStillMapsForExistingCallers() {
    const item = readCompanyPriceBookRpcRowForRegression({
        id: 'price-1',
        company_id: 'company-1',
        price_key: 'faucet-basic',
        name: 'Basic Faucet Install',
        system: 'Plumbing',
        category: 'Faucets',
        unit: 'each',
        base_price: 225,
        labor_hours: 1.5,
        material_cost: 55,
        customer_description: 'Install a customer-selected faucet.',
        internal_notes: 'Legacy RPC shape.',
        active: true,
        created_by_user_id: 'user-1',
        created_at: '2026-07-14T12:00:00.000Z',
        updated_at: '2026-07-14T12:00:00.000Z',
    });

    assert(item, 'Legacy RPC row should still map to a price-book item.');

    const entry = mapCompanyPriceBookItemToEstimateEntry(item);

    assert(entry.recommendedSellingPrice === 225, 'Legacy RPC rows should fall back to base price for estimate pricing.');
    assert(entry.minimumPermittedSellingPrice === null, 'Legacy RPC rows should not require extended pricing fields.');
}

function versionedRpcShapeSuppliesEstimateOptionFields() {
    const item = readCompanyPriceBookRpcRowForRegression({
        id: 'price-2',
        company_id: 'company-1',
        price_key: 'repipe-core',
        name: 'Whole Home Repipe Core',
        system: 'Water Service',
        category: 'Repipe',
        unit: 'package',
        base_price: 1000,
        labor_hours: 12,
        material_cost: 350,
        customer_description: 'Legacy homeowner text.',
        internal_notes: 'Legacy internal text.',
        active: true,
        created_at: '2026-07-14T12:00:00.000Z',
        updated_at: '2026-07-14T12:00:00.000Z',
        service_category: 'whole_home_repipe',
        internal_description: 'Technician scope description.',
        homeowner_description: 'Homeowner-safe scope description.',
        base_labor_install_price: 1100,
        estimated_labor_hours: 14,
        internal_labor_cost: 700,
        internal_material_cost: 425,
        recommended_selling_price: 2200,
        minimum_permitted_selling_price: 2000,
        maximum_permitted_selling_price: 2600,
        required_minimum_gross_margin: 0.42,
        tax_behavior: 'taxable',
        effective_at: '2026-07-14',
        version_label: 'v2',
        included_warranty: 'Standard workmanship warranty',
        eligible_extended_warranties: ['extended-labor'],
        required_add_on_price_keys: ['permit-inspection'],
        incompatible_price_keys: ['spot-repair'],
        applicable_systems: ['Water Service'],
        applicable_areas: ['Main Home'],
        applicable_categories: ['Repipe'],
        management_notes: 'Manager-only guidance.',
    });

    assert(item, 'Versioned RPC row should map to a price-book item.');

    const entry = mapCompanyPriceBookItemToEstimateEntry(item);

    assert(entry.serviceCategory === 'whole_home_repipe', 'Versioned RPC should supply estimate-option service category.');
    assert(entry.internalDescription === 'Technician scope description.', 'Versioned RPC should preserve internal estimate text.');
    assert(entry.homeownerDescription === 'Homeowner-safe scope description.', 'Versioned RPC should preserve homeowner-safe text.');
    assert(entry.recommendedSellingPrice === 2200, 'Versioned RPC should supply deterministic recommended selling price.');
    assert(entry.minimumPermittedSellingPrice === 2000, 'Versioned RPC should supply minimum price guard.');
    assert(entry.maximumPermittedSellingPrice === 2600, 'Versioned RPC should supply maximum price guard.');
    assert(entry.requiredAddOnCodes.includes('permit-inspection'), 'Versioned RPC should supply required add-on codes.');
    assert(entry.incompatibleCodes.includes('spot-repair'), 'Versioned RPC should supply incompatible price keys.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
