import { buildEstimatePackageChoice, estimatePackagePreviewTotal } from './estimateOptionPackages';
import type { EstimateChoice } from './estimateOptions';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
    assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function assertJsonEqual(actual: unknown, expected: unknown, message: string) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

const first = makeChoice('option-1', 'Water heater', 1_000, 600);
const second = makeChoice('option-2', 'Water filtration', 500, 200);

const result = buildEstimatePackageChoice({
    choices: [first, second],
    sourceChoiceIds: [first.id, second.id],
    id: 'option-3',
    displayOrder: 3,
    title: 'Complete Water Package',
    discountPercentage: 10,
    discountLabel: 'Package Savings',
});

assertEqual(result.error, null, 'Package should not return an error');
assert(result.choice, 'Package should be created');
assertEqual(result.choice.kind, 'package', 'Choice should be a package');
assertJsonEqual(result.choice.packageSourceChoiceIds, ['option-1', 'option-2'], 'Package should retain source ids');
assertEqual(result.choice.basePricingResult.totalAmount, 1_500, 'Package base total should sum source choices');
assertEqual(result.choice.pricingResult.totalAmount, 1_350, 'Package total should include discount');
assertEqual(result.choice.pricingResult.totalCost, 800, 'Package should retain source cost');
assertEqual(result.choice.pricingResult.lineItems.length, 2, 'Package should retain both source lines');
assert(result.choice.pricingResult.lineItems[0].id !== result.choice.pricingResult.lineItems[1].id, 'Package line ids should not collide');
assertEqual(result.choice.priceAdjustmentPercentage, -10, 'Package should preserve discount percentage');
assertEqual(result.choice.priceAdjustmentLabel, 'Package Savings', 'Package should preserve discount label');
assertJsonEqual(estimatePackagePreviewTotal([first, second], [first.id, second.id], 10), {
    subtotal: 1_500,
    total: 1_350,
}, 'Preview should match package totals');

assertEqual(buildEstimatePackageChoice({
    choices: [first, second],
    sourceChoiceIds: [first.id],
    id: 'option-3',
    displayOrder: 3,
    title: 'Incomplete',
}).error, 'Select at least two options to build a package.', 'A package should require two sources');

assertEqual(buildEstimatePackageChoice({
    choices: [first, second],
    sourceChoiceIds: [first.id, second.id],
    id: 'option-3',
    displayOrder: 3,
    title: 'Unnamed savings',
    discountPercentage: 5,
}).error, 'Name the package savings before creating the package.', 'A discount should require a customer-facing name');

assertEqual(buildEstimatePackageChoice({
    choices: [first, second, result.choice],
    sourceChoiceIds: [first.id, result.choice.id],
    id: 'option-4',
    displayOrder: 4,
    title: 'Overlapping work',
}).error, 'A selected package already includes one of the other selected options.', 'Nested packages should not double-count source work');

console.log('estimateOptionPackages regression passed');

function makeChoice(id: string, title: string, totalAmount: number, cost: number): EstimateChoice {
    return {
        id,
        kind: 'individual',
        title,
        shortSummary: `${title} scope`,
        homeownerExplanation: `${title} homeowner explanation`,
        keyBenefits: [`${title} benefit`],
        whyItDiffers: '',
        recommendedReason: null,
        productIds: [],
        scopeIds: [`${id}-scope`],
        warrantyIds: [],
        inclusionIds: [`${id}-included`],
        exclusionIds: [],
        pricingResult: {
            id: `${id}-pricing`,
            lineItems: [{
                id: 'shared-line-id',
                priceBookEntryId: `${id}-entry`,
                code: `${id}-code`,
                name: title,
                quantity: 1,
                unitAmount: totalAmount,
                totalAmount,
                cost,
                grossMargin: (totalAmount - cost) / totalAmount,
                required: true,
                source: 'base_installation',
            }],
            totalAmount,
            totalCost: cost,
            grossMargin: (totalAmount - cost) / totalAmount,
            minimumAllowedTotal: totalAmount * 0.8,
            recommendedTotal: totalAmount,
            maximumAllowedTotal: totalAmount * 1.2,
            priceBookVersion: `${id}-version`,
            priceBookSnapshot: [],
            warnings: [],
            missingPricingInputs: [],
            requiredManagementApproval: false,
        },
        recommended: false,
        displayOrder: Number(id.split('-')[1]),
        pricingSource: 'price_book',
    };
}
