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

    return applyLinePriceAdjustments(choice, () => ({
        percentage: normalizedPercentage,
        dollarAmount: null,
        mode: normalizedPercentage < 0 ? 'discount' : 'markup',
    }));
}

export function applyEstimateChoiceLinePriceAdjustments(
    choice: EstimateChoice,
    adjustments: Record<string, EstimateLinePriceAdjustment>
): EstimateChoice {
    const normalizedAdjustments = Object.entries(adjustments).reduce<Record<string, EstimateLinePriceAdjustment>>((result, [lineId, adjustment]) => {
        const percentage = normalizeEstimatePriceAdjustmentPercentage(adjustment.percentage);
        const dollarAmount = normalizeEstimatePriceAdjustmentDollarAmount(adjustment.dollarAmount);

        if ((dollarAmount !== null && dollarAmount !== 0) || percentage !== 0) {
            result[lineId] = {
                ...adjustment,
                percentage,
                dollarAmount,
            };
        }

        return result;
    }, {});

    if (Object.keys(normalizedAdjustments).length === 0) return choice;

    return applyLinePriceAdjustments(choice, (lineId) => normalizedAdjustments[lineId] || null);
}

function applyLinePriceAdjustments(
    choice: EstimateChoice,
    adjustmentForLine: (lineId: string) => EstimateLinePriceAdjustment | null,
): EstimateChoice {
    let hasAdjustment = false;

    const lineItems = choice.pricingResult.lineItems.map((line) => {
        const adjustment = adjustmentForLine(line.id);

        if (!adjustment) return line;

        hasAdjustment = true;
        const dollarAmount = normalizeEstimatePriceAdjustmentDollarAmount(adjustment.dollarAmount);
        const percentage = normalizeEstimatePriceAdjustmentPercentage(adjustment.percentage);
        const totalAmount = dollarAmount !== null
            ? Math.max(0, roundCurrency(line.totalAmount + dollarAmount))
            : roundCurrency(line.totalAmount * (1 + percentage / 100));
        const unitAmount = line.quantity > 0
            ? roundCurrency(totalAmount / line.quantity)
            : totalAmount;

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

    const minimumAllowedTotal = choice.pricingResult.minimumAllowedTotal;
    const maximumAllowedTotal = choice.pricingResult.maximumAllowedTotal;
    const companyCatalogFloorApplies = (
        choice.pricingResult.priceBookVersion.startsWith('company-catalog') ||
        choice.pricingResult.priceBookVersion.includes(':product:')
    )
        && minimumAllowedTotal !== null;
    let adjustedLineItems = lineItems;
    let totalAmount = roundCurrency(adjustedLineItems.reduce((total, line) => total + line.totalAmount, 0));
    const floorWasApplied = companyCatalogFloorApplies && totalAmount < minimumAllowedTotal;
    if (floorWasApplied && adjustedLineItems.length) {
        const floorDelta = roundCurrency(minimumAllowedTotal! - totalAmount);
        adjustedLineItems = adjustedLineItems.map((line, index) => {
            if (index !== 0) return line;
            const lineTotal = roundCurrency(line.totalAmount + floorDelta);
            return {
                ...line,
                totalAmount: lineTotal,
                unitAmount: line.quantity > 0 ? roundCurrency(lineTotal / line.quantity) : lineTotal,
                grossMargin: lineTotal > 0 ? roundRatio((lineTotal - line.cost) / lineTotal) : null,
            };
        });
        totalAmount = minimumAllowedTotal!;
    }
    const belowMinimum = minimumAllowedTotal !== null && totalAmount < minimumAllowedTotal;
    const exceedsMaximum = maximumAllowedTotal !== null && totalAmount > maximumAllowedTotal;
    const adjustmentWarnings = [
        ...(belowMinimum
            ? [`Adjusted price is below the company minimum of ${formatMoney(minimumAllowedTotal)}.`]
            : []),
        ...(floorWasApplied
            ? [`Company catalog minimum of ${formatMoney(minimumAllowedTotal!)} applied.`]
            : []),
        ...(exceedsMaximum
            ? [`Adjusted price exceeds the company maximum of ${formatMoney(maximumAllowedTotal)}.`]
            : []),
    ];

    return {
        ...choice,
        pricingResult: {
            ...choice.pricingResult,
            lineItems: adjustedLineItems,
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

export function normalizeEstimatePriceAdjustmentDollarAmount(value: unknown) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;

    return roundCurrency(value);
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
