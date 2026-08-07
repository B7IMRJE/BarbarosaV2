export function formatEstimateQuoteHistoryStatus(status: string, acceptedAt?: string | null) {
    if (acceptedAt) return 'Accepted / Sold';

    const labels: Record<string, string> = {
        draft: 'Draft',
        technician_review: 'Technician Review',
        presentation_ready: 'Ready to Present',
        presented: 'Presented',
    };

    return labels[status.trim().toLowerCase()] || 'Quote';
}

export function formatEstimateQuoteTotalRange(input: {
    lowestTotal: number | null;
    highestTotal: number | null;
    selectedTotal: number | null;
}) {
    if (input.selectedTotal !== null) return formatMoney(input.selectedTotal);
    if (input.lowestTotal === null || input.highestTotal === null) return 'No priced options yet';
    if (input.lowestTotal === input.highestTotal) return formatMoney(input.lowestTotal);

    return `${formatMoney(input.lowestTotal)} – ${formatMoney(input.highestTotal)}`;
}

export function isEstimateQuoteSelected(
    quote: { selectedSourceChoiceIds: string[] },
    choiceId: string
) {
    return quote.selectedSourceChoiceIds.includes(choiceId);
}

function formatMoney(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(value);
}
