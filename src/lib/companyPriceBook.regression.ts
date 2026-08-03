import {
    applyStarterPriceBookRecommendationsForEstimate,
    companyPriceBookUnitConstraintValues,
    getCompanyPriceBookRpcNames,
    getCompanyPriceBookUpsertRpcName,
    priceBookUnits,
    readCompanyPriceBookRpcRowForRegression,
    validateCompanyPriceBookDraftUnit,
    type CompanyPriceBookDraft,
} from './companyPriceBook';
import {
    buildEstimateOptionWorkspace,
    mapCompanyPriceBookItemToEstimateEntry,
} from './estimateOptions';
import { temporaryRiversidePlumbingPrices } from './temporaryRiversidePlumbingPriceList';

runCompanyPriceBookRegressions();

export function runCompanyPriceBookRegressions() {
    estimateLoaderPrefersVersionedRpcWithLegacyFallback();
    adminPriceBookWritesKeepLegacyUpsertRpc();
    priceBookUnitsMatchDatabaseConstraint();
    unsupportedUnitsAreRejectedBeforeBackendSave();
    eachUnitPassesSaveValidation();
    validHistoricalUnitsContinueLoading();
    unsupportedLegacyUnitShowsCorrectionMessage();
    legacyRpcShapeStillMapsForExistingCallers();
    versionedRpcShapeSuppliesEstimateOptionFields();
    starterRecommendationsMakeUnpricedEstimateServicesUsable();
    savedCompanyPricesOverrideStarterRecommendations();
    archivedCompanyItemsStayInactive();
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

function priceBookUnitsMatchDatabaseConstraint() {
    const databaseUnits = ['each', 'hour', 'linear foot', 'package', 'inspection', 'other'];

    assert(JSON.stringify(priceBookUnits) === JSON.stringify(databaseUnits), 'UI price-book units should match the live database constraint.');
    assert(JSON.stringify(companyPriceBookUnitConstraintValues) === JSON.stringify(databaseUnits), 'Shared price-book unit source should match the live database constraint.');
    assert(!(priceBookUnits as readonly string[]).includes('install'), 'Unsupported install unit should not be exposed in the UI.');
}

function unsupportedUnitsAreRejectedBeforeBackendSave() {
    let rejected = false;

    try {
        validateCompanyPriceBookDraftUnit({ unit: 'install' } as unknown as Pick<CompanyPriceBookDraft, 'unit'>);
    } catch (error) {
        rejected = error instanceof Error && error.message.includes('Unsupported price-book unit "install"');
    }

    assert(rejected, 'Unsupported unit should be rejected before calling the backend RPC.');
}

function eachUnitPassesSaveValidation() {
    validateCompanyPriceBookDraftUnit({ unit: 'each' });
}

function validHistoricalUnitsContinueLoading() {
    priceBookUnits.forEach((unit) => {
        const item = readCompanyPriceBookRpcRowForRegression({
            id: `price-${unit.replace(/\s+/g, '-')}`,
            company_id: 'company-1',
            price_key: `valid-${unit.replace(/\s+/g, '-')}`,
            name: `Valid ${unit}`,
            system: 'Plumbing',
            category: 'General',
            unit,
            base_price: 100,
            labor_hours: 1,
            material_cost: 10,
            customer_description: null,
            internal_notes: null,
            active: true,
            created_at: '2026-07-14T12:00:00.000Z',
            updated_at: '2026-07-14T12:00:00.000Z',
        });

        assert(item?.unit === unit, `Valid historical unit ${unit} should load unchanged.`);
        assert(!item?.unit_validation_message, `Valid historical unit ${unit} should not show a correction message.`);
    });
}

function unsupportedLegacyUnitShowsCorrectionMessage() {
    const item = readCompanyPriceBookRpcRowForRegression({
        id: 'price-unsupported-unit',
        company_id: 'company-1',
        price_key: 'legacy-install-unit',
        name: 'Legacy Install Unit',
        system: 'Plumbing',
        category: 'General',
        unit: 'install',
        base_price: 100,
        labor_hours: 1,
        material_cost: 10,
        customer_description: null,
        internal_notes: null,
        active: true,
        created_at: '2026-07-14T12:00:00.000Z',
        updated_at: '2026-07-14T12:00:00.000Z',
    });

    assert(item, 'Unsupported legacy unit row should still load for correction.');
    assert(item.unit === 'other', 'Unsupported legacy unit should display with a safe supported fallback unit.');
    assert(item.unsupported_unit === 'install', 'Unsupported legacy unit should preserve the original value.');
    assert(item.unit_validation_message?.includes('Choose one of'), 'Unsupported legacy unit should show a clear correction message.');
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

function starterRecommendationsMakeUnpricedEstimateServicesUsable() {
    const items = applyStarterPriceBookRecommendationsForEstimate('company-1', []);
    const showerValve = items.find((item) =>
        item.price_key === 'water_service_bathroom_shower_valve_replacement'
    );

    assert(
        items.length === temporaryRiversidePlumbingPrices.length,
        'Estimate fallback should cover every Riverside plumbing catalog item.'
    );
    assert(showerValve, 'Estimate fallback should include shower valve replacement pricing.');
    assert(showerValve.recommended_selling_price === 1195, 'Shower valve replacement should use the Riverside starter recommendation.');
    assert(showerValve.source === 'template', 'Starter recommendation should remain distinguishable from a saved company price.');

    const workspace = buildEstimateOptionWorkspace({
        companyId: 'company-1',
        draftItems: [{
            id: 'shower-valve-1',
            property_id: 'property-1',
            name: 'Shower valve replacement',
            item_slug: 'bathroom-shower-valve',
            system: 'Water Service',
            category: 'Shower Valve',
            location: 'Bathroom',
            parent_area: 'Bathroom',
            status: 'Needs service',
            install_state: 'Existing',
            company_id: 'company-1',
            company_user_id: 'company-user-1',
            source: 'provider_mode',
            created_at: '2026-08-02T12:00:00.000Z',
        }],
        draftContext: null,
        category: 'valve_replacement',
        answers: {},
        priceBookItems: items,
        technicianApproved: false,
    });

    assert(!workspace.pricingSetupRequired, 'Starter recommendations should clear the estimate pricing setup blocker.');
    assert(workspace.pricingResults.length > 0, 'Starter recommendations should produce deterministic estimate pricing.');
}

function savedCompanyPricesOverrideStarterRecommendations() {
    const savedItem = readCompanyPriceBookRpcRowForRegression({
        id: 'saved-shower-valve',
        company_id: 'company-1',
        price_key: 'water_service_bathroom_shower_valve_replacement',
        name: 'Shower valve replacement',
        system: 'Water Service',
        category: 'Valves / Shutoffs',
        unit: 'each',
        base_price: 1775,
        labor_hours: 6,
        material_cost: 400,
        customer_description: 'Saved company scope.',
        internal_notes: 'Saved by management.',
        active: true,
        created_at: '2026-08-02T12:00:00.000Z',
        updated_at: '2026-08-02T12:00:00.000Z',
        recommended_selling_price: 1775,
    });

    assert(savedItem, 'Saved price-book item should load for starter override regression.');

    const items = applyStarterPriceBookRecommendationsForEstimate('company-1', [savedItem]);
    const showerValve = items.find((item) => item.price_key === savedItem.price_key);

    assert(showerValve?.id === savedItem.id, 'Saved company price should keep its persisted identity.');
    assert(showerValve?.recommended_selling_price === 1775, 'Saved company selling price should override the starter recommendation.');
    assert(showerValve?.source === 'backend', 'Saved company price should remain identified as backend data.');
}

function archivedCompanyItemsStayInactive() {
    const archivedItem = readCompanyPriceBookRpcRowForRegression({
        id: 'archived-shower-valve',
        company_id: 'company-1',
        price_key: 'water_service_bathroom_shower_valve_replacement',
        name: 'Shower valve replacement',
        system: 'Water Service',
        category: 'Valves / Shutoffs',
        unit: 'each',
        base_price: null,
        labor_hours: null,
        material_cost: null,
        customer_description: null,
        internal_notes: null,
        active: false,
        created_at: '2026-08-02T12:00:00.000Z',
        updated_at: '2026-08-02T12:00:00.000Z',
    });

    assert(archivedItem, 'Archived price-book item should load for starter fallback regression.');

    const items = applyStarterPriceBookRecommendationsForEstimate('company-1', [archivedItem]);
    const showerValve = items.find((item) => item.price_key === archivedItem.price_key);

    assert(showerValve?.active === false, 'Starter fallback should not reactivate a service archived by management.');
    assert(showerValve?.recommended_selling_price === null, 'Archived unpriced service should remain unavailable to estimates.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
