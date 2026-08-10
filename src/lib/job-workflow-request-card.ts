export type JobWorkflowRequestCard = {
    id: string;
    company_id: string;
    property_id: string | null;
    display_code: string | null;
    display_sequence: number | null;
    request_type: string | null;
    status: string | null;
    priority: string | null;
    issue_summary: string | null;
    created_at: string | null;
};

export function normalizeJobWorkflowRequestCard(data: unknown): JobWorkflowRequestCard | null {
    const record = data && typeof data === 'object' ? data as Record<string, unknown> : null;

    if (!record) return null;

    const id = readRequestCardText(record.id);
    const companyId = readRequestCardText(record.company_id);

    if (!id || !companyId) return null;

    return {
        id,
        company_id: companyId,
        property_id: readRequestCardText(record.property_id) || null,
        display_code: readRequestCardText(record.display_code)?.toUpperCase() || null,
        display_sequence: readRequestCardNumber(record.display_sequence),
        request_type: readRequestCardText(record.request_type) || null,
        status: readRequestCardText(record.status) || null,
        priority: readRequestCardText(record.priority) || null,
        issue_summary: readRequestCardText(record.issue_summary) || null,
        created_at: readRequestCardText(record.created_at) || null,
    };
}

function readRequestCardText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readRequestCardNumber(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}
