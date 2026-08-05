import {
    buildEstimateOptionWorkspace,
    type CompanyPriceBookItemLike,
    type EstimateApprovedProduct,
} from './estimateOptions';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

const tanklessPriceKey = 'water_service_garage_mechanical_tankless_water_heater_replacement';
const workspace = buildEstimateOptionWorkspace({
    companyId: 'company-a',
    draftItems: [],
    draftContext: null,
    category: 'water_heater',
    answers: {
        fuel_type: 'gas',
        tank_or_tankless: 'tankless like-kind',
        desired_warranty: 'Let homeowner choose',
        code_corrections: ['None required'],
    },
    priceBookItems: [priceBookItem(tanklessPriceKey, 'Tankless water heater replacement', 4750)],
    approvedProducts: [
        product('navien-good', 'Navien', 'Company-Approved Tankless Model', 'Essential', 5200, 'Standard manufacturer warranty'),
        product('noritz-better', 'Noritz', 'Company-Approved Tankless Model', 'Professional', 5900, 'Enhanced manufacturer warranty'),
        product('ao-smith-premium', 'A.O. Smith', 'Company-Approved Tankless Model', 'Premium', 6700, 'Premium manufacturer warranty'),
        product('tank-product', 'Rheem', 'Company-Approved 50 Gallon', 'Essential', 3000, 'Tank warranty', {
            category: 'tank water heater',
            compatibleApplications: ['50 gallon', 'gas'],
        }),
        product('wrong-application', 'Other Brand', 'Conversion Only', 'Professional', 6100, 'Manufacturer warranty', {
            compatibleApplications: ['tankless conversion', 'gas'],
        }),
        product('unpriced', 'Other Brand', 'Unpriced Tankless', 'Professional', null, 'Manufacturer warranty'),
    ],
    technicianApproved: false,
});

assert(workspace.choices.length === 3, 'Only compatible, priced, approved tankless products should create homeowner choices.');
assert(workspace.choices.map((choice) => choice.productIds[0]).join(',') === 'navien-good,noritz-better,ao-smith-premium', 'Tankless choices should be ordered Good, Better, and Premium.');
assert(workspace.choices.map((choice) => choice.pricingResult.totalAmount).join(',') === '5200,5900,6700', 'Each tankless choice should use its own saved company selling price.');
assert(workspace.choices.every((choice) => choice.selectionGroup === 'water-heater-equipment'), 'Tankless brands must remain mutually exclusive equipment choices.');
assert(workspace.choices[0]?.shortSummary.startsWith('Good · Navien'), 'Essential tier should be presented to the homeowner as Good.');
assert(workspace.choices[1]?.shortSummary.startsWith('Better · Noritz'), 'Professional tier should be presented to the homeowner as Better.');
assert(workspace.choices[2]?.shortSummary.startsWith('Premium · A.O. Smith'), 'Premium tier should remain Premium.');
assert(workspace.choices[0]?.title.includes('Tankless Water Heater Replacement'), 'Like-kind tankless title should not repeat awkward tankless wording.');
assert(workspace.choices[2]?.customerSelections?.includes('Included warranty: Premium manufacturer warranty') === true, 'Each tankless warranty should stay attached to its matching brand and price.');
assert(workspace.choices[0]?.pricingResult.lineItems[0]?.name.includes('Navien Company-Approved Tankless Model') === true, 'The selected tankless brand and model should replace the generic base equipment line.');

const conversionWorkspace = buildEstimateOptionWorkspace({
    companyId: 'company-a',
    draftItems: [],
    draftContext: null,
    category: 'water_heater',
    answers: {
        fuel_type: 'gas',
        tank_or_tankless: 'tankless conversion',
        code_corrections: ['None required'],
    },
    priceBookItems: [priceBookItem(tanklessPriceKey, 'Tankless water heater replacement', 4750)],
    approvedProducts: [
        product('conversion-product', 'Navien', 'Company-Approved Conversion Model', 'Professional', 7200, 'Manufacturer warranty', {
            compatibleApplications: ['tankless conversion', 'gas'],
        }),
        product('like-kind-product', 'Noritz', 'Like-Kind Only', 'Professional', 5900, 'Manufacturer warranty'),
    ],
    technicianApproved: false,
});

assert(conversionWorkspace.choices.length === 1, 'A conversion quote must not display a product approved only for like-kind replacement.');
assert(conversionWorkspace.choices[0]?.title.includes('Tank-to-Tankless Water Heater Conversion'), 'Conversion choice should clearly describe the conversion scope.');

function product(
    id: string,
    brand: string,
    model: string,
    tier: EstimateApprovedProduct['tier'],
    approvedSellingPrice: number | null,
    warranty: string,
    overrides: Partial<EstimateApprovedProduct> = {}
): EstimateApprovedProduct {
    return {
        id,
        companyId: 'company-a',
        category: 'tankless water heater',
        brand,
        model,
        tier,
        internalProductCost: null,
        approvedSellingPrice,
        priceBookEntryId: null,
        minimumSellingPrice: null,
        maximumSellingPrice: null,
        mainMedia: null,
        additionalMedia: [],
        specifications: { fuel: 'gas' },
        compatibleApplications: ['tankless like-kind', 'gas'],
        requiredAccessoryIds: [],
        installationRequirements: ['Confirm gas sizing, venting, condensate, isolation valves, and electrical requirements'],
        warranty,
        extendedWarrantyEligible: true,
        availabilityNote: null,
        manufacturerReference: null,
        companyNotes: null,
        approved: true,
        active: true,
        ...overrides,
    };
}

function priceBookItem(priceKey: string, name: string, price: number): CompanyPriceBookItemLike {
    return {
        id: priceKey,
        company_id: 'company-a',
        price_key: priceKey,
        name,
        system: 'Water Service',
        category: 'Water Heaters',
        unit: 'each',
        base_price: price,
        labor_hours: 10,
        material_cost: 2100,
        customer_description: `${name}.`,
        internal_notes: null,
        active: true,
        created_at: null,
        updated_at: null,
        recommended_selling_price: price,
    };
}

console.log('tanklessWaterHeaterProducts regression checks passed');
