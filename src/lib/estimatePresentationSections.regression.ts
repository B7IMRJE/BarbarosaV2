import {
    buildDetailedEstimatePresentationSections,
    type EstimatePresentationSection,
} from './estimatePresentationSections';
import type {
    EstimateApprovedProduct,
    EstimatePricingResult,
} from './estimateOptions';

runEstimatePresentationSectionRegressions();

export function runEstimatePresentationSectionRegressions() {
    toiletPresentationUsesOnlyVerifiedProductAndSelectedScope();
    waterHeaterPresentationSeparatesUnpricedConditions();
    selectedWaterHeaterAddOnsMoveOutOfConditions();
}

function toiletPresentationUsesOnlyVerifiedProductAndSelectedScope() {
    const sections = buildDetailedEstimatePresentationSections({
        category: 'toilet_replacement',
        answers: {
            rough_in: '12 in',
            bowl_shape: 'elongated',
            height: 'comfort / chair height',
            construction: 'two-piece',
            color: 'white',
            flush_type: 'gravity',
            verified_flush_efficiency: '1.28 GPF',
            flange_condition: 'damaged',
            floor_condition: 'water damage observed',
            angle_stop_condition: 'replace required',
            supply_line_replacement: true,
            haul_away: true,
            work_area_protection: 'protect work path and fixture area',
            installation_hardware: 'new wax or approved seal plus new approved closet bolts / hardware',
            perimeter_seal_practice: 'company standard — verify applicable requirements',
            completion_documentation: 'before / during / after photos and completion record',
        },
        pricingResult: pricingResult([
            line('toilet-base', 'water_service_bathroom_toilet_replacement', 'Toilet installation'),
        ]),
        product: product({
            specifications: {
                'Bowl Shape': 'Elongated',
                'Rough-In': '12 in',
                'Flush Rating': '1.28 GPF',
                'Internal Cost': '$125',
                'Internal Cost per Gallon': '$3.12',
            },
        }),
    });
    const serialized = JSON.stringify(sections).toLowerCase();

    assert(section(sections, 'product').items.some((item) => item.title.includes('Kohler K-3999')), 'The verified brand and model should appear in Selected Product.');
    assert(serialized.includes('1.28 gpf'), 'The verified efficiency fact should be shown.');
    assert(!serialized.includes('internal cost'), 'Internal product cost metadata must never enter the homeowner checklist.');
    assert(!serialized.includes('$125'), 'Internal product cost values must never enter the homeowner checklist.');
    assert(!serialized.includes('$3.12'), 'Internal metadata must remain hidden even when its key contains an allowed product term.');
    assert(hasConditional(sections, 'Flange repair or replacement'), 'Unpriced flange repair must remain conditional.');
    assert(hasConditional(sections, 'Floor or subfloor repair'), 'Observed floor damage must remain conditional.');
    assert(hasConditional(sections, 'Shutoff replacement'), 'Unpriced shutoff replacement must remain conditional.');
    assert(hasConditional(sections, 'Supply-line replacement'), 'Unpriced supply-line replacement must remain conditional.');
    assert(section(sections, 'verification').items.some((item) => item.title.includes('stable and level')), 'Toilet verification must include stability and leveling.');
    assert(section(sections, 'documentation').items.some((item) => item.title.includes('completion record')), 'Toilet completion documentation must be explicit.');
}

function waterHeaterPresentationSeparatesUnpricedConditions() {
    const sections = buildDetailedEstimatePresentationSections({
        category: 'water_heater',
        answers: waterHeaterAnswers(),
        pricingResult: pricingResult([
            line('water-heater-base', 'water_service_garage_standard_water_heater_replacement', '50 gallon gas water heater installation'),
        ]),
        product: product({
            category: 'Tank Water Heater',
            brand: 'Rheem',
            model: 'Verified-50G',
            specifications: {
                Capacity: '50 gallon',
                Fuel: 'Natural gas',
                UEF: '0.64',
                'Internal Margin': '42%',
            },
        }),
    });
    const serialized = JSON.stringify(sections).toLowerCase();
    const expectedConditions = [
        'Failed or replacement water shutoff',
        'Electrical outlet, circuit, disconnect, or service upgrade',
        'Venting or combustion-air correction',
        'Drain pan or drain route work',
        'Expansion control or pressure correction',
        'Seismic anchoring, straps, blocking, stand, or platform work',
        'T&P relief valve or discharge correction',
        'Recirculation modification',
        'Permit fees and inspection coordination',
        'Mold or microbial growth',
    ];

    expectedConditions.forEach((title) => {
        assert(hasConditional(sections, title), `${title} should remain separate until it is priced and authorized.`);
    });
    assert(serialized.includes('rheem verified-50g'), 'The verified water-heater brand and model should be shown.');
    assert(serialized.includes('0.64'), 'The verified efficiency value should be shown.');
    assert(!serialized.includes('internal margin'), 'Internal product margin metadata must never enter the homeowner checklist.');
    assert(section(sections, 'process').items.some((item) => item.title.includes('applicable gas or electrical utilities')), 'The process must include safe utility isolation.');
    assert(section(sections, 'verification').items.some((item) => item.title.includes('safety controls')), 'Startup verification must cover applicable safety controls.');
    assert(section(sections, 'verification').items.some((item) => item.title.includes('local code')), 'Manufacturer and local-code precedence must be explicit.');
}

function selectedWaterHeaterAddOnsMoveOutOfConditions() {
    const sections = buildDetailedEstimatePresentationSections({
        category: 'water_heater',
        answers: waterHeaterAnswers(),
        pricingResult: pricingResult([
            line('water-heater-base', 'water_service_garage_standard_water_heater_replacement', '50 gallon gas water heater installation'),
            line('water-heater-expansion', 'water_service_garage_expansion_tank_installation', 'Thermal expansion tank installation'),
            line('water-heater-permit', 'water_service_garage_permit_inspection', 'Permit and inspection coordination'),
        ]),
    });

    assert(!hasConditional(sections, 'Expansion control or pressure correction'), 'A selected and priced expansion-tank line must not also be shown as unpriced.');
    assert(!hasConditional(sections, 'Permit fees and inspection coordination'), 'A selected and priced permit line must not also be shown as unpriced.');
    assert(section(sections, 'included_components').items.some((item) => item.title === 'Thermal expansion tank installation'), 'Selected add-ons must appear in Included Components.');
}

function waterHeaterAnswers() {
    return {
        tank_or_tankless: '50 gallon',
        fuel_type: 'gas',
        location: 'garage',
        verified_efficiency_rating: '0.64 UEF',
        work_area_protection: 'protect work path and installation area',
        haul_away: true,
        water_shutoff_connections: 'failed / repair required',
        gas_valve_line: 'acceptable',
        electrical_needs: 'new outlet needed',
        venting: 'unknown',
        combustion_air: 'needs review',
        drain_pan_route: 'add pan and route',
        expansion_tank: 'add',
        prv_pressure: 'high pressure',
        straps: 'install',
        back_block: 'acceptable',
        platform: 'acceptable',
        tp_discharge: 'correct discharge',
        recirculation: 'add option',
        permit_inspection_scope: 'included in selected Price Book scope',
        conditional_remediation: ['mold or microbial growth'],
        completion_documentation: 'before / during / after photos and completion record',
    };
}

function pricingResult(lines: ReturnType<typeof line>[]): EstimatePricingResult {
    return {
        id: 'pricing-result',
        lineItems: lines,
        totalAmount: lines.reduce((total, item) => total + item.totalAmount, 0),
        totalCost: 900,
        grossMargin: 0.45,
        minimumAllowedTotal: 1800,
        recommendedTotal: 2200,
        maximumAllowedTotal: 3000,
        priceBookVersion: 'regression',
        priceBookSnapshot: [],
        warnings: [],
        missingPricingInputs: [],
        requiredManagementApproval: false,
    };
}

function line(id: string, code: string, name: string) {
    return {
        id,
        priceBookEntryId: id,
        code,
        name,
        quantity: 1,
        unitAmount: 2200,
        totalAmount: 2200,
        cost: 900,
        grossMargin: 0.45,
        required: true,
        source: 'base_installation' as const,
    };
}

function product(overrides: Partial<EstimateApprovedProduct> = {}): EstimateApprovedProduct {
    return {
        id: 'approved-product',
        companyId: 'company-a',
        category: 'Toilet',
        brand: 'Kohler',
        model: 'K-3999',
        tier: 'Professional',
        internalProductCost: 125,
        approvedSellingPrice: 450,
        priceBookEntryId: null,
        minimumSellingPrice: null,
        maximumSellingPrice: null,
        mainMedia: null,
        additionalMedia: [],
        masterPrimaryImageUrl: null,
        specifications: {},
        compatibleApplications: [],
        requiredAccessoryIds: [],
        installationRequirements: [],
        warranty: null,
        extendedWarrantyEligible: false,
        availabilityNote: null,
        manufacturerReference: null,
        companyNotes: null,
        approved: true,
        active: true,
        ...overrides,
    };
}

function section(sections: EstimatePresentationSection[], id: EstimatePresentationSection['id']) {
    const value = sections.find((candidate) => candidate.id === id);

    if (!value) throw new Error(`Missing ${id} presentation section.`);

    return value;
}

function hasConditional(sections: EstimatePresentationSection[], title: string) {
    return section(sections, 'conditions_exclusions').items.some((item) => item.title === title && item.status === 'conditional');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
