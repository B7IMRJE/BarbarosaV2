import { formatMoney, type EstimateChoice } from './estimateOptions';

export function applyEstimateChoicePriceAdjustment(
    choice: EstimateChoice,
    percentage: number
): EstimateChoice {
    const normalizedPercentage = normalizeEstimatePriceAdjustmentPercentage(percentage);

    if (normalizedPercentage === 0) return choice;

    const multiplier = 1 + normalizedPercentage / 100;
    const lineItems = choice.pricingResult.lineItems.map((line) => {
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
