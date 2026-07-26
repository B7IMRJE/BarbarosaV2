import { applyEstimateChoicePriceAdjustment } from './estimatePriceAdjustments';
import type { EstimateChoice } from './estimateOptions';

runEstimatePriceAdjustmentRegression();

function runEstimatePriceAdjustmentRegression() {
    const baseChoice = choice();
    const adjustedChoice = applyEstimateChoicePriceAdjustment(baseChoice, 10);

    assert(adjustedChoice.pricingResult.totalAmount === 110, 'A 10% increase should change a $100 option to $110.');
    assert(adjustedChoice.pricingResult.lineItems[0]?.unitAmount === 110, 'Line item selling prices should increase with the option.');
    assert(adjustedChoice.pricingResult.totalCost === 60, 'Price changes must not change internal cost.');
    assert(adjustedChoice.pricingResult.grossMargin === 0.4545, 'Gross margin should be recalculated from the adjusted selling price.');
    assert(adjustedChoice.pricingResult.requiredManagementApproval, 'Prices above the company maximum should require approval.');
    assert(baseChoice.pricingResult.totalAmount === 100, 'The base deterministic option must remain unchanged.');
    assert(applyEstimateChoicePriceAdjustment(baseChoice, 0) === baseChoice, 'Resetting to 0% should restore the base option.');
}

function choice(): EstimateChoice {
    return {
        id: 'option-1',
        kind: 'individual',
        title: 'Option 1',
        shortSummary: 'Test option',
        homeownerExplanation: 'Test option',
        keyBenefits: [],
        whyItDiffers: 'Test',
        recommendedReason: null,
        productIds: [],
        scopeIds: [],
        warrantyIds: [],
        inclusionIds: [],
        exclusionIds: [],
        pricingResult: {
            id: 'pricing-1',
            lineItems: [{
                id: 'line-1',
                priceBookEntryId: 'price-1',
                code: 'TEST',
                name: 'Test line',
                quantity: 1,
                unitAmount: 100,
                totalAmount: 100,
                cost: 60,
                grossMargin: 0.4,
                required: true,
                source: 'base_installation',
            }],
            totalAmount: 100,
            totalCost: 60,
            grossMargin: 0.4,
            minimumAllowedTotal: 80,
            recommendedTotal: 100,
            maximumAllowedTotal: 105,
            priceBookVersion: 'test',
            priceBookSnapshot: [],
            warnings: [],
            missingPricingInputs: [],
            requiredManagementApproval: false,
        },
        recommended: false,
        displayOrder: 1,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
