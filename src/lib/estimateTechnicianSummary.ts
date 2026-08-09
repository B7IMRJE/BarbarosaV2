export type DocumentedEstimateWorkItem = {
    name: string;
    code?: string | null;
};

export type DocumentedTechnicianSummaryInput = {
    technicianNotes?: string | null;
    workItems: DocumentedEstimateWorkItem[];
};

/**
 * Creates customer-facing wording from the technician's documented finding and
 * the already-selected scope. It deliberately does not introduce prices,
 * products, warranties, or work that the technician did not select.
 */
export function buildDocumentedTechnicianSummary(input: DocumentedTechnicianSummaryInput) {
    const notes = toSentence(input.technicianNotes || '');
    const workDescription = joinWorkItems(input.workItems);

    if (!notes && !workDescription) return '';

    if (isFlapperWork(input.workItems)) {
        return buildFlapperSummary(notes, workDescription);
    }

    const parts = [
        notes ? `The technician documented: ${notes}` : '',
        workDescription ? `To address this condition, this option includes ${workDescription}.` : '',
        workDescription ? 'The listed work will be completed and normal operation checked after the service.' : '',
    ].filter(Boolean);

    return parts.join(' ');
}

function buildFlapperSummary(notes: string, workDescription: string) {
    const normalizedNotes = notes.toLowerCase();
    const describesRunningToilet = normalizedNotes.includes('running') || normalizedNotes.includes('runs');
    const describesIncorrectFit = /incorrect|wrong|mis[-\s]?sized|not\s+(?:the\s+)?(?:right|correct)\s+(?:size|fit)/.test(normalizedNotes);
    const documentedCause = describesRunningToilet && describesIncorrectFit
        ? 'The toilet was running because the existing flapper was not the correct size or fit. An improper fit can prevent a complete seal and allow water to continue passing into the bowl.'
        : notes ? `The technician documented: ${notes}` : '';

    const scope = workDescription
        ? `This option includes ${workDescription}.`
        : '';

    return [
        documentedCause,
        scope,
        scope ? 'The flapper seal and toilet operation will be checked after the repair.' : '',
    ].filter(Boolean).join(' ');
}

function isFlapperWork(workItems: DocumentedEstimateWorkItem[]) {
    return workItems.some((item) => {
        const text = `${item.name || ''} ${item.code || ''}`.toLowerCase();

        return text.includes('flapper');
    });
}

function joinWorkItems(workItems: DocumentedEstimateWorkItem[]) {
    const names = [...new Set(workItems
        .map((item) => String(item.name || '').trim())
        .filter(Boolean))];

    if (names.length === 0) return '';
    if (names.length === 1) return names[0]!;
    if (names.length === 2) return `${names[0]} and ${names[1]}`;

    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function toSentence(value: string) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();

    if (!normalized) return '';

    const withCapital = normalized.charAt(0).toUpperCase() + normalized.slice(1);

    return /[.!?]$/.test(withCapital) ? withCapital : `${withCapital}.`;
}
