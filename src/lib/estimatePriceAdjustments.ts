import {
    formatMoney,
    type EstimateChoice,
    type EstimateLinePriceAdjustment,
    type EstimatePricingResult,
} from './estimateOptions';

export function restoreCompatibleEstimateChoiceBasePricing(
    choice: EstimateChoice & { basePricingResult?: EstimatePricingResult },
): EstimateChoice {
    const basePricingResult = choice.basePricingResult;

    if (!basePricingResult || !haveMatchingPriceBookScope(choice.pricingResult, basePricingResult)) {
        return choice;
    }

    return {
        ...choice,
        pricingResult: basePricingResult,
    };
}

export function applyEstimateChoicePriceAdjustment(
    choice: EstimateChoice,
    percentage: number
): EstimateChoice {
    const normalizedPercentage = normalizeEstimatePriceAdjustmentPercentage(percentage);

    if (normalizedPercentage === 0) return choice;

    return applyLinePriceAdjustments(choice, () => normalizedPercentage);
}

export function applyEstimateChoiceLinePriceAdjustments(
    choice: EstimateChoice,
    adjustments: Record<string, EstimateLinePriceAdjustment>
): EstimateChoice {
    const normalizedAdjustments = Object.entries(adjustments).reduce<Record<string, number>>((result, [lineId, adjustment]) => {
        const percentage = normalizeEstimatePriceAdjustmentPercentage(adjustment.percentage);

        if (percentage !== 0) result[lineId] = percentage;

        return result;
    }, {});

    if (Object.keys(normalizedAdjustments).length === 0) return choice;

    return applyLinePriceAdjustments(choice, (lineId) => normalizedAdjustments[lineId] || 0);
}

function applyLinePriceAdjustments(
    choice: EstimateChoice,
    percentageForLine: (lineId: string) => number,
): EstimateChoice {
    let hasAdjustment = false;

    const lineItems = choice.pricingResult.lineItems.map((line) => {
        const percentage = percentageForLine(line.id);

        if (percentage === 0) return line;

        hasAdjustment = true;
        const multiplier = 1 + percentage / 100;
        const unitAmount = roundCurrency(line.unitAmount * multiplier);
        const totalAmount = roundCurrency(line.totalAmount * multiplier);

        return {
            ...line,
            unitAmount,
            totalAmount,
            grossMargin: totalAmount > 0
                ? roundRatio((totalAmount - line.cost) / totalAmount)
                : null,
        };
    });

    if (!hasAdjustment) return choice;

    const totalAmount = roundCurrency(lineItems.reduce((total, line) => total + line.totalAmount, 0));
    const minimumAllowedTotal = choice.pricingResult.minimumAllowedTotal;
    const maximumAllowedTotal = choice.pricingResult.maximumAllowedTotal;
    const belowMinimum = minimumAllowedTotal !== null && totalAmount < minimumAllowedTotal;
    const exceedsMaximum = maximumAllowedTotal !== null && totalAmount > maximumAllowedTotal;
    const adjustmentWarnings = [
        ...(belowMinimum
            ? [`Adjusted price is below the company minimum of ${formatMoney(minimumAllowedTotal)}.`]
            : []),
        ...(exceedsMaximum
            ? [`Adjusted price exceeds the company maximum of ${formatMoney(maximumAllowedTotal)}.`]
            : []),
    ];

    return {
        ...choice,
        pricingResult: {
            ...choice.pricingResult,
            lineItems,
            totalAmount,
            grossMargin: totalAmount > 0
                ? roundRatio((totalAmount - choice.pricingResult.totalCost) / totalAmount)
                : null,
            requiredManagementApproval: choice.pricingResult.requiredManagementApproval || belowMinimum || exceedsMaximum,
            warnings: [...choice.pricingResult.warnings, ...adjustmentWarnings],
        },
    };
}

export function normalizeEstimatePriceAdjustmentPercentage(value: number) {
    if (!Number.isFinite(value)) return 0;

    return Math.min(500, Math.max(-100, Math.round(value * 100) / 100));
}

export function formatEstimatePriceAdjustmentPercentage(value: number) {
    const normalized = normalizeEstimatePriceAdjustmentPercentage(value);
    const prefix = normalized > 0 ? '+' : '';

    return `${prefix}${normalized.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    })}%`;
}

function roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number) {
    return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function haveMatchingPriceBookScope(first: EstimatePricingResult, second: EstimatePricingResult) {
    const firstEntryIds = first.lineItems.map((line) => line.priceBookEntryId).sort();
    const secondEntryIds = second.lineItems.map((line) => line.priceBookEntryId).sort();

    return firstEntryIds.length === secondEntryIds.length &&
        firstEntryIds.every((entryId, index) => entryId === secondEntryIds[index]);
}
