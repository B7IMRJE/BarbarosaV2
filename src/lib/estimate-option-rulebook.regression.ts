import {
    buildRecommendedEstimateChoice,
    getEligibleEstimateRecommendations,
} from './estimate-option-rulebook';
import type {
    CompanyPriceBookItemLike,
    EstimateChoice,
} from './estimateOptions';
import { applyEstimateChoiceLinePriceAdjustments } from './estimatePriceAdjustments';

runEstimateOptionRulebookRegressions();

export function runEstimateOptionRulebookRegressions() {
    recommendationsRequireDocumentedFindings();
    unavailablePriceBookWorkNeverAppears();
    recommendationsNeverExceedFour();
    showerValveReplacementSupersedesCartridgeCharge();
    relatedAddOnKeepsItsOwnPricedWork();
    recommendationsStayInsideTheirConfiguredCategory();
}

function recommendationsRequireDocumentedFindings() {
    const recommendations = getEligibleEstimateRecommendations({
        category: 'water_heater',
        answers: {},
        currentPriceKeys: ['water_service_garage_mechanical_standard_tank_water_heater_replacement'],
        priceBookItems: [
            priceBookItem('water_service_garage_mechanical_water_heater_expansion_tank_installation', 'Expansion tank'),
            priceBookItem('water_service_garage_mechanical_prv_pressure_regulator_replacement', 'Pressure regulator'),
            priceBookItem('water_quality_garage_mechanical_whole_home_filter_installation', 'Whole-home filtration'),
        ],
    });

    assert(recommendations.length === 0, 'Recommendations must not be inferred without documented findings.');
}

function unavailablePriceBookWorkNeverAppears() {
    const recommendations = getEligibleEstimateRecommendations({
        category: 'water_heater',
        answers: { prv_pressure: 'high pressure' },
        currentPriceKeys: ['water_service_garage_mechanical_standard_tank_water_heater_replacement'],
        priceBookItems: [
            priceBookItem('water_service_garage_mechanical_prv_pressure_regulator_replacement', 'Pressure regulator', false),
        ],
    });

    assert(recommendations.length === 0, 'Inactive or unavailable price-book work must not become an option.');
}

function recommendationsNeverExceedFour() {
    const recommendations = getEligibleEstimateRecommendations({
        category: 'faucet_repair',
        answers: {
            valve_body_condition: 'replacement recommended',
            faucet_mineral_condition: 'hard water confirmed',
            fixture_pressure_condition: 'high pressure',
            faucet_repair_area: 'bathroom sink',
            faucet_parts_available: 'obsolete / replacement recommended',
        },
        currentPriceKeys: ['water_service_bathroom_shower_cartridge_replacement'],
        priceBookItems: [
            priceBookItem('water_service_bathroom_shower_valve_replacement', 'Shower valve replacement'),
            priceBookItem('water_quality_garage_mechanical_whole_home_filter_installation', 'Whole-home filtration'),
            priceBookItem('water_service_garage_mechanical_prv_pressure_regulator_replacement', 'Pressure regulator'),
            priceBookItem('water_service_bathroom_bathroom_faucet_replacement', 'Bathroom faucet replacement'),
        ],
        max: 4,
    });

    assert(recommendations.length <= 4, 'The related-option picker must never show more than four recommendations.');
}

function showerValveReplacementSupersedesCartridgeCharge() {
    const priceBookItems = [
        priceBookItem('water_service_bathroom_shower_cartridge_replacement', 'Shower cartridge replacement', true, 300),
        priceBookItem('water_service_bathroom_shower_valve_replacement', 'Shower valve replacement', true, 900),
    ];
    const recommendation = getEligibleEstimateRecommendations({
        category: 'faucet_repair',
        answers: { valve_body_condition: 'rough / rusted / pitted' },
        currentPriceKeys: ['water_service_bathroom_shower_cartridge_replacement'],
        priceBookItems,
    })[0];
    const choice = buildRecommendedEstimateChoice({
        id: 'option-2',
        companyId: 'company-1',
        baseChoice: baseChoice(priceBookItems[0]),
        recommendation,
        priceBookItems,
        displayOrder: 2,
    });

    assert(!!choice, 'A documented damaged valve should create a valve-replacement option.');
    assert(choice?.pricingResult.lineItems.length === 1, 'Valve replacement must remove the standalone cartridge charge.');
    assert(
        choice?.pricingResult.lineItems[0]?.code === 'water_service_bathroom_shower_valve_replacement',
        'The composed option must include the replacement valve, not the superseded cartridge.',
    );
    assert(choice?.pricingResult.totalAmount === 900, 'The replacement option must use the approved valve price only.');
}

function relatedAddOnKeepsItsOwnPricedWork() {
    const gasControlValve = priceBookItem(
        'water_service_garage_mechanical_water_heater_gas_control_valve_replacement',
        'Water heater gas control valve replacement',
        true,
        425,
    );
    const wholeHomeFilter = priceBookItem(
        'water_quality_garage_mechanical_whole_home_filter_installation',
        'Whole-home filter installation',
        true,
        2150,
    );
    const originalChoice = baseChoice(gasControlValve);
    const persistedBaseChoice = {
        ...originalChoice,
        pricingResult: {
            ...originalChoice.pricingResult,
            totalAmount: 850,
            lineItems: originalChoice.pricingResult.lineItems.map((line) => ({
                ...line,
                unitAmount: 850,
                totalAmount: 850,
            })),
        },
        basePricingResult: originalChoice.pricingResult,
        linePriceAdjustments: {
            'line-1': {
                percentage: 100,
                mode: 'markup' as const,
            },
        },
    };
    const recommendation = getEligibleEstimateRecommendations({
        category: 'water_heater_service',
        answers: { water_quality_observation: 'scale / sediment' },
        currentPriceKeys: persistedBaseChoice.pricingResult.lineItems.map((line) => line.code),
        priceBookItems: [gasControlValve, wholeHomeFilter],
    })[0];
    const choice = buildRecommendedEstimateChoice({
        id: 'option-2',
        companyId: 'company-1',
        baseChoice: persistedBaseChoice,
        recommendation,
        priceBookItems: [gasControlValve, wholeHomeFilter],
        displayOrder: 2,
    });

    assert(!!choice, 'Documented scale should create a whole-home filtration option.');
    assert(choice.pricingResult.lineItems.length === 2, 'The add-on option must include both priced lines.');
    assert(
        choice.pricingResult.lineItems.some((line) => line.code === wholeHomeFilter.price_key),
        'The promised whole-home filtration work must appear in the option.',
    );
    assert(choice.pricingResult.totalAmount === 2575, 'The add-on option must total both company price-book lines.');
    const adjustedChoice = applyEstimateChoiceLinePriceAdjustments(
        choice,
        choice.linePriceAdjustments || {},
    );
    assert(
        adjustedChoice.pricingResult.totalAmount === 3000,
        'The source service adjustment must carry to the matching service while the filtration line keeps its own price.',
    );
    assert(
        !('basePricingResult' in choice),
        'A related option must not inherit the source option pricing snapshot.',
    );
}

function recommendationsStayInsideTheirConfiguredCategory() {
    const recommendations = getEligibleEstimateRecommendations({
        category: 'toilet_repair',
        answers: {
            valve_body_condition: 'replacement recommended',
            faucet_mineral_condition: 'hard water confirmed',
        },
        currentPriceKeys: ['water_service_bathroom_fill_valve_replacement'],
        priceBookItems: [
            priceBookItem('water_service_bathroom_shower_valve_replacement', 'Shower valve replacement'),
            priceBookItem('water_quality_garage_mechanical_whole_home_filter_installation', 'Whole-home filtration'),
        ],
    });

    assert(recommendations.length === 0, 'A provider option must never appear under an unrelated estimate category.');
}

function baseChoice(item: CompanyPriceBookItemLike): EstimateChoice {
    const amount = Number(item.recommended_selling_price || item.base_price || 0);

    return {
        id: 'option-1',
        kind: 'individual',
        title: item.name,
        shortSummary: item.name,
        homeownerExplanation: item.customer_description || item.name,
        keyBenefits: [],
        whyItDiffers: 'Documented repair.',
        recommendedReason: null,
        productIds: [],
        scopeIds: [item.price_key],
        warrantyIds: [],
        inclusionIds: [item.price_key],
        exclusionIds: [],
        pricingResult: {
            id: 'pricing-1',
            lineItems: [{
                id: 'line-1',
                priceBookEntryId: item.id,
                code: item.price_key,
                name: item.name,
                quantity: 1,
                unitAmount: amount,
                totalAmount: amount,
                cost: 0,
                grossMargin: null,
                required: true,
                source: 'base_installation',
            }],
            totalAmount: amount,
            totalCost: 0,
            grossMargin: null,
            minimumAllowedTotal: null,
            recommendedTotal: amount,
            maximumAllowedTotal: null,
            priceBookVersion: 'test',
            priceBookSnapshot: [],
            warnings: [],
            missingPricingInputs: [],
            requiredManagementApproval: false,
        },
        recommended: true,
        displayOrder: 1,
    };
}

function priceBookItem(
    priceKey: string,
    name: string,
    active = true,
    price = 100,
): CompanyPriceBookItemLike {
    return {
        id: `entry-${priceKey}`,
        company_id: 'company-1',
        price_key: priceKey,
        name,
        system: 'Plumbing',
        category: 'Plumbing',
        unit: 'each',
        base_price: price,
        labor_hours: null,
        material_cost: null,
        customer_description: `${name}.`,
        internal_notes: null,
        active,
        created_at: null,
        updated_at: null,
        recommended_selling_price: price,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
