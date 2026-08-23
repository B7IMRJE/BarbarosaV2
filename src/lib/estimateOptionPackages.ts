import { applyEstimateChoicePriceAdjustment } from './estimatePriceAdjustments';
import type {
    EstimateChoice,
    EstimatePricingResult,
    EstimatePricingSnapshotEntry,
} from './estimateOptions';

export type EstimatePackageBuildResult = {
    choice: (EstimateChoice & { basePricingResult: EstimatePricingResult }) | null;
    error: string | null;
};

export function buildEstimatePackageChoice(input: {
    choices: EstimateChoice[];
    sourceChoiceIds: string[];
    id: string;
    displayOrder: number;
    title: string;
    discountPercentage?: number;
    discountLabel?: string;
}): EstimatePackageBuildResult {
    const sourceIds = uniqueText(input.sourceChoiceIds);
    const sources = sourceIds
        .map((sourceId) => input.choices.find((choice) => choice.id === sourceId))
        .filter((choice): choice is EstimateChoice => Boolean(choice));
    const title = input.title.trim();
    const discountPercentage = normalizeDiscountPercentage(input.discountPercentage);
    const discountLabel = String(input.discountLabel || '').trim();

    if (sources.length < 2) {
        return { choice: null, error: 'Select at least two options to build a package.' };
    }

    if (sources.length !== sourceIds.length) {
        return { choice: null, error: 'One or more selected options are no longer available.' };
    }

    const flattenedSourceIds = sources.flatMap((choice) =>
        choice.packageSourceChoiceIds?.length ? choice.packageSourceChoiceIds : [choice.id]
    );

    if (uniqueText(flattenedSourceIds).length !== flattenedSourceIds.length) {
        return { choice: null, error: 'A selected package already includes one of the other selected options.' };
    }

    if (!title) {
        return { choice: null, error: 'Enter a package name.' };
    }

    if (discountPercentage > 0 && !discountLabel) {
        return { choice: null, error: 'Name the package savings before creating the package.' };
    }

    const basePricingResult = combinePricingResults(input.id, sources);
    const sourceTitles = sources.map((choice) => choice.title);
    const baseChoice: EstimateChoice = {
        id: input.id,
        kind: 'package',
        title,
        shortSummary: `Includes ${formatJoinedList(sourceTitles)} in one package.`,
        homeownerExplanation: `This package combines ${formatJoinedList(sourceTitles)} so the selected work can be approved together.`,
        keyBenefits: uniqueText([
            'One combined package',
            ...sources.flatMap((choice) => choice.keyBenefits),
        ]),
        whyItDiffers: `Combines ${sources.length} existing quote options without changing the originals.`,
        recommendedReason: null,
        productIds: uniqueText(sources.flatMap((choice) => choice.productIds)),
        scopeIds: uniqueText(sources.flatMap((choice) => choice.scopeIds)),
        warrantyIds: uniqueText(sources.flatMap((choice) => choice.warrantyIds)),
        inclusionIds: uniqueText(sources.flatMap((choice) => choice.inclusionIds)),
        exclusionIds: uniqueText(sources.flatMap((choice) => choice.exclusionIds)),
        pricingResult: basePricingResult,
        recommended: false,
        displayOrder: input.displayOrder,
        priceAdjustmentPercentage: discountPercentage > 0 ? -discountPercentage : 0,
        priceAdjustmentLabel: discountPercentage > 0 ? discountLabel : null,
        linePriceAdjustments: {},
        customerSelections: uniqueText(sources.flatMap((choice) => choice.customerSelections || [])),
        presentationSections: sources.flatMap((choice) => choice.presentationSections || []),
        pricingSource: sources.every((choice) => choice.pricingSource === 'technician_custom')
            ? 'technician_custom'
            : 'price_book',
        packageSourceChoiceIds: flattenedSourceIds,
    };
    const choice = discountPercentage > 0
        ? applyEstimateChoicePriceAdjustment(baseChoice, -discountPercentage)
        : baseChoice;

    return {
        choice: {
            ...choice,
            basePricingResult,
        },
        error: null,
    };
}

export function estimatePackagePreviewTotal(
    choices: EstimateChoice[],
    sourceChoiceIds: string[],
    discountPercentage?: number,
) {
    const sourceIds = new Set(sourceChoiceIds);
    const subtotal = roundCurrency(choices
        .filter((choice) => sourceIds.has(choice.id))
        .reduce((total, choice) => total + choice.pricingResult.totalAmount, 0));
    const discount = normalizeDiscountPercentage(discountPercentage);

    return {
        subtotal,
        total: roundCurrency(subtotal * (1 - discount / 100)),
    };
}

function combinePricingResults(id: string, sources: EstimateChoice[]): EstimatePricingResult {
    const lineItems = sources.flatMap((choice) => choice.pricingResult.lineItems.map((line) => ({
        ...line,
        id: `${choice.id}:${line.id}`,
    })));
    const totalAmount = roundCurrency(lineItems.reduce((total, line) => total + line.totalAmount, 0));
    const totalCost = roundCurrency(lineItems.reduce((total, line) => total + line.cost, 0));
    const minimumAllowedTotal = sumOptionalAmounts(sources.map((choice) => choice.pricingResult.minimumAllowedTotal));
    const maximumAllowedTotal = sumOptionalAmounts(sources.map((choice) => choice.pricingResult.maximumAllowedTotal));

    return {
        id: `${id}-pricing`,
        lineItems,
        totalAmount,
        totalCost,
        grossMargin: totalAmount > 0 ? roundRatio((totalAmount - totalCost) / totalAmount) : null,
        minimumAllowedTotal,
        recommendedTotal: totalAmount,
        maximumAllowedTotal,
        priceBookVersion: `package-composer:${uniqueText(sources.map((choice) => choice.pricingResult.priceBookVersion)).join('|')}`,
        priceBookSnapshot: uniqueSnapshots(sources.flatMap((choice) => choice.pricingResult.priceBookSnapshot)),
        warnings: uniqueText(sources.flatMap((choice) => choice.pricingResult.warnings)),
        missingPricingInputs: uniqueText(sources.flatMap((choice) => choice.pricingResult.missingPricingInputs)),
        requiredManagementApproval: sources.some((choice) => choice.pricingResult.requiredManagementApproval),
    };
}

function normalizeDiscountPercentage(value: number | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;

    return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

function sumOptionalAmounts(values: (number | null)[]) {
    if (values.some((value) => value === null)) return null;

    return roundCurrency(values.reduce<number>((total, value) => total + (value || 0), 0));
}

function uniqueSnapshots(entries: EstimatePricingSnapshotEntry[]) {
    const seen = new Set<string>();

    return entries.filter((entry) => {
        const key = `${entry.priceBookEntryId}:${entry.code}:${entry.version || ''}`;

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function uniqueText(values: string[]) {
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function formatJoinedList(values: string[]) {
    if (values.length <= 1) return values[0] || 'the selected work';
    if (values.length === 2) return `${values[0]} and ${values[1]}`;

    return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number) {
    return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}
