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
    const maximumAllowedTotal = choice.pricingResult.maximumAllowedTotal;
    const exceedsMaximum = maximumAllowedTotal !== null && totalAmount > maximumAllowedTotal;

    return {
        ...choice,
        pricingResult: {
            ...choice.pricingResult,
            lineItems,
            totalAmount,
            grossMargin: totalAmount > 0
                ? roundRatio((totalAmount - choice.pricingResult.totalCost) / totalAmount)
                : null,
            requiredManagementApproval: choice.pricingResult.requiredManagementApproval || exceedsMaximum,
            warnings: exceedsMaximum
                ? [
                    ...choice.pricingResult.warnings,
                    `Adjusted price exceeds the company maximum of ${formatMoney(maximumAllowedTotal)}.`,
                ]
                : choice.pricingResult.warnings,
        },
    };
}

export function normalizeEstimatePriceAdjustmentPercentage(value: number) {
    if (!Number.isFinite(value)) return 0;

    return Math.min(500, Math.max(0, Math.round(value * 100) / 100));
}

export function formatEstimatePriceAdjustmentPercentage(value: number) {
    return `${normalizeEstimatePriceAdjustmentPercentage(value).toLocaleString(undefined, {
        maximumFractionDigits: 2,
    })}%`;
}

function roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number) {
    return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}
