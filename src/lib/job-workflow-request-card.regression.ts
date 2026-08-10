import { normalizeJobWorkflowRequestCard } from './job-workflow-request-card';

runJobWorkflowRequestCardRegressions();

export function runJobWorkflowRequestCardRegressions() {
    customerRequestFieldsRemainAvailableToTheWorkflowCard();
    unrelatedOrMalformedRowsAreRejected();
}

function customerRequestFieldsRemainAvailableToTheWorkflowCard() {
    const request = normalizeJobWorkflowRequestCard({
        id: 'request-1',
        company_id: 'company-1',
        property_id: 'property-1',
        display_code: 'a0042',
        display_sequence: '42',
        request_type: 'emergency',
        status: 'assigned',
        priority: 'emergency',
        issue_summary: 'Water is spreading under the kitchen cabinets.',
        created_at: '2026-08-10T12:00:00.000Z',
    });

    assert(request?.display_code === 'A0042', 'The homeowner request reference should remain visible.');
    assert(request?.display_sequence === 42, 'The numeric fallback request reference should remain available.');
    assert(Boolean(request?.issue_summary?.includes('kitchen cabinets')), 'The original customer description should remain visible.');
    assert(request?.priority === 'emergency', 'The original request priority should remain visible.');
}

function unrelatedOrMalformedRowsAreRejected() {
    assert(normalizeJobWorkflowRequestCard(null) === null, 'Missing request data should not create a false job card.');
    assert(
        normalizeJobWorkflowRequestCard({ id: 'request-1' }) === null,
        'A request without company ownership should not create a job card.'
    );
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Job workflow request card regression failed: ${message}`);
    }
}
