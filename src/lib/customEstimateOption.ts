import type { EstimateChoice } from './estimateOptions';

export const CUSTOM_ESTIMATE_PRICING_SOURCE = 'technician_custom' as const;

export type CustomEstimateOptionDraft = {
    name: string;
    workScope: string;
    customerSummary: string;
    price: string;
};

export type CustomEstimateChoice = EstimateChoice & {
    pricingSource: typeof CUSTOM_ESTIMATE_PRICING_SOURCE;
};

export function buildCustomEstimateChoice(input: {
    id: string;
    displayOrder: number;
    draft: CustomEstimateOptionDraft;
}): { choice: CustomEstimateChoice | null; error: string | null } {
    const name = normalizeRequiredText(input.draft.name);
    const workScope = normalizeRequiredText(input.draft.workScope);
    const customerSummary = normalizeRequiredText(input.draft.customerSummary);
    const price = parseCustomEstimatePrice(input.draft.price);

    if (!name) return { choice: null, error: 'Give this custom option a clear name.' };
    if (!workScope) return { choice: null, error: 'Describe the work that will be performed.' };
    if (!customerSummary) return { choice: null, error: 'Add the customer-facing summary.' };
    if (price === null || price <= 0) return { choice: null, error: 'Enter an exact customer price greater than $0.' };

    const lineId = `custom-line-${input.id}`;
    const choice: CustomEstimateChoice = {
        id: input.id,
        kind: 'individual',
        title: name,
        shortSummary: workScope,
        homeownerExplanation: customerSummary,
        keyBenefits: ['Technician-defined scope', 'Exact quoted price'],
        whyItDiffers: 'This is a technician-created custom scope with an explicitly entered price.',
        recommendedReason: null,
        productIds: [],
        scopeIds: ['custom-technician-scope'],
        warrantyIds: [],
        inclusionIds: ['custom-technician-scope'],
        exclusionIds: [],
        pricingResult: {
            id: `custom-pricing-${input.id}`,
            lineItems: [{
                id: lineId,
                priceBookEntryId: '',
                code: 'CUSTOM_MANUAL',
                name,
                quantity: 1,
                unitAmount: price,
                totalAmount: price,
                cost: 0,
                grossMargin: null,
                required: true,
                source: 'base_installation',
            }],
            totalAmount: price,
            totalCost: 0,
            grossMargin: null,
            minimumAllowedTotal: null,
            recommendedTotal: price,
            maximumAllowedTotal: null,
            priceBookVersion: 'technician-custom-v1',
            priceBookSnapshot: [],
            warnings: ['This custom option uses the exact technician-entered selling price.'],
            missingPricingInputs: [],
            requiredManagementApproval: false,
        },
        recommended: false,
        displayOrder: input.displayOrder,
        priceAdjustmentPercentage: 0,
        priceAdjustmentLabel: null,
        linePriceAdjustments: {},
        customerSelections: [`Work to be performed: ${workScope}`],
        pricingSource: CUSTOM_ESTIMATE_PRICING_SOURCE,
    };

    return { choice, error: null };
}

export function isCustomEstimateChoice(choice: Pick<EstimateChoice, 'pricingResult'> & { pricingSource?: string }) {
    return choice.pricingSource === CUSTOM_ESTIMATE_PRICING_SOURCE &&
        choice.pricingResult.priceBookSnapshot.length === 0 &&
        choice.pricingResult.lineItems.length === 1 &&
        choice.pricingResult.lineItems[0]?.code === 'CUSTOM_MANUAL';
}

export function synchronizeCustomEstimateChoiceCopy<T extends EstimateChoice>(choice: T): T {
    if (!isCustomEstimateChoice(choice)) return choice;

    const name = normalizeRequiredText(choice.title) || 'Custom Work';
    const workScope = normalizeRequiredText(choice.shortSummary);
    const line = choice.pricingResult.lineItems[0];

    return {
        ...choice,
        title: name,
        shortSummary: workScope,
        customerSelections: workScope ? [`Work to be performed: ${workScope}`] : [],
        pricingResult: {
            ...choice.pricingResult,
            lineItems: line ? [{ ...line, name }] : [],
        },
    };
}

function parseCustomEstimatePrice(value: string) {
    const normalized = value.replace(/[$,\s]/g, '');

    if (!normalized || !/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;

    const amount = Number(normalized);

    return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function normalizeRequiredText(value: string) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}
