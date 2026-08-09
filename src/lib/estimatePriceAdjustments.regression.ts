import {
    applyEstimateChoiceLinePriceAdjustments,
    applyEstimateChoicePriceAdjustment,
    formatEstimatePriceAdjustmentPercentage,
    normalizeEstimatePriceAdjustmentPercentage,
    restoreCompatibleEstimateChoiceBasePricing,
} from './estimatePriceAdjustments';
import type { EstimateChoice } from './estimateOptions';

runEstimatePriceAdjustmentRegression();

function runEstimatePriceAdjustmentRegression() {
    const baseChoice = choice();
    const adjustedChoice = applyEstimateChoicePriceAdjustment(baseChoice, 10);
    const discountedChoice = applyEstimateChoicePriceAdjustment(baseChoice, -10);
    const belowMinimumChoice = applyEstimateChoicePriceAdjustment(baseChoice, -30);
    const individuallyAdjustedChoice = applyEstimateChoiceLinePriceAdjustments(multiLineChoice(), {
        'line-1': { percentage: -10, mode: 'discount', label: 'Service discount' },
        'line-2': { percentage: 20, mode: 'markup' },
    });
    const flapperChoice = choiceAtPrice(695);
    const regularFlapperChoice = applyEstimateChoiceLinePriceAdjustments(flapperChoice, {
        'line-1': { percentage: 0, dollarAmount: -550, mode: 'discount', label: 'Regular toilet flapper price' },
    });
    const specialtyFlapperChoice = applyEstimateChoiceLinePriceAdjustments(choiceAtPrice(145), {
        'line-1': { percentage: 0, dollarAmount: 54, mode: 'markup', label: 'Specialty / Toto flapper price' },
    });
    const safelyRestoredBaseChoice = restoreCompatibleEstimateChoiceBasePricing({
        ...adjustedChoice,
        basePricingResult: baseChoice.pricingResult,
    });
    const mismatchedSavedChoice = multiLineChoice();
    const safelyKeptComposedChoice = restoreCompatibleEstimateChoiceBasePricing({
        ...mismatchedSavedChoice,
        basePricingResult: baseChoice.pricingResult,
    });

    assert(adjustedChoice.pricingResult.totalAmount === 110, 'A 10% increase should change a $100 option to $110.');
    assert(adjustedChoice.pricingResult.lineItems[0]?.unitAmount === 110, 'Line item selling prices should increase with the option.');
    assert(adjustedChoice.pricingResult.totalCost === 60, 'Price changes must not change internal cost.');
    assert(adjustedChoice.pricingResult.grossMargin === 0.4545, 'Gross margin should be recalculated from the adjusted selling price.');
    assert(adjustedChoice.pricingResult.requiredManagementApproval, 'Prices above the company maximum should require approval.');
    assert(baseChoice.pricingResult.totalAmount === 100, 'The base deterministic option must remain unchanged.');
    assert(applyEstimateChoicePriceAdjustment(baseChoice, 0) === baseChoice, 'Resetting to 0% should restore the base option.');
    assert(discountedChoice.pricingResult.totalAmount === 90, 'A 10% discount should change a $100 option to $90.');
    assert(!discountedChoice.pricingResult.requiredManagementApproval, 'A discount at the company minimum should not require approval.');
    assert(belowMinimumChoice.pricingResult.totalAmount === 70, 'A 30% discount should change a $100 option to $70.');
    assert(belowMinimumChoice.pricingResult.requiredManagementApproval, 'A discount below the company minimum should require approval.');
    assert(belowMinimumChoice.pricingResult.warnings.some((warning) => warning.includes('below the company minimum')), 'Below-minimum discounts should show a clear warning.');
    assert(normalizeEstimatePriceAdjustmentPercentage(-150) === -100, 'Discount normalization should prevent totals below zero.');
    assert(formatEstimatePriceAdjustmentPercentage(20) === '+20%', 'Price increases should display with a plus sign.');
    assert(formatEstimatePriceAdjustmentPercentage(-5) === '-5%', 'Discounts should display with a minus sign.');
    assert(individuallyAdjustedChoice.pricingResult.lineItems[0]?.totalAmount === 90, 'A line discount should change only the selected line.');
    assert(individuallyAdjustedChoice.pricingResult.lineItems[1]?.totalAmount === 60, 'A separate line markup should use that line\'s own price.');
    assert(individuallyAdjustedChoice.pricingResult.totalAmount === 150, 'The option total should equal the independently adjusted line totals.');
    assert(multiLineChoice().pricingResult.totalAmount === 150, 'Individual adjustments must not mutate the deterministic base option.');
    assert(regularFlapperChoice.pricingResult.totalAmount === 145, 'A signed $-550 adjustment should change a $695 flapper line to $145.');
    assert(regularFlapperChoice.pricingResult.lineItems[0]?.unitAmount === 145, 'A dollar adjustment should recalculate the service-line unit price.');
    assert(specialtyFlapperChoice.pricingResult.totalAmount === 199, 'A signed $54 adjustment should change a $145 flapper line to the $199 specialty/Toto price.');
    assert(flapperChoice.pricingResult.totalAmount === 695, 'A dollar adjustment must preserve the original company price for later edits.');
    assert(safelyRestoredBaseChoice.pricingResult.totalAmount === 100, 'A matching saved base snapshot should restore deterministic pricing before adjustments.');
    assert(safelyKeptComposedChoice.pricingResult.totalAmount === 150, 'A mismatched saved base snapshot must not erase composed option lines.');
    assert(safelyKeptComposedChoice.pricingResult.lineItems.length === 2, 'Existing composed options must keep every promised priced line.');
}

function multiLineChoice(): EstimateChoice {
    const baseChoice = choice();
    const secondLine = {
        ...baseChoice.pricingResult.lineItems[0],
        id: 'line-2',
        priceBookEntryId: 'price-2',
        code: 'TEST_2',
        name: 'Second test line',
        unitAmount: 50,
        totalAmount: 50,
        cost: 20,
        grossMargin: 0.6,
    };

    return {
        ...baseChoice,
        pricingResult: {
            ...baseChoice.pricingResult,
            lineItems: [...baseChoice.pricingResult.lineItems, secondLine],
            totalAmount: 150,
            totalCost: 80,
            grossMargin: 0.4667,
            minimumAllowedTotal: null,
            maximumAllowedTotal: null,
        },
    };
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

function choiceAtPrice(price: number): EstimateChoice {
    const baseChoice = choice();
    const line = baseChoice.pricingResult.lineItems[0]!;

    return {
        ...baseChoice,
        pricingResult: {
            ...baseChoice.pricingResult,
            lineItems: [{
                ...line,
                unitAmount: price,
                totalAmount: price,
                grossMargin: price > 0 ? Math.round(((price - line.cost) / price) * 10_000) / 10_000 : null,
            }],
            totalAmount: price,
            grossMargin: price > 0 ? Math.round(((price - baseChoice.pricingResult.totalCost) / price) * 10_000) / 10_000 : null,
            minimumAllowedTotal: null,
            maximumAllowedTotal: null,
        },
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
