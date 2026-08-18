import {
    buildDraftEstimateOptionsRequest,
    buildEstimateSessionResolutionKey,
    buildEstimateSessionRpcParams,
    doesEstimateSessionMatchRequestedContext,
    isDraftableEstimateSessionStatus,
    isValidEstimateSessionId,
    shouldRetryEstimateSessionWithoutCandidate,
} from './estimateSessionContract';

export function runEstimateSessionRegressions() {
    missingSessionIdIsRejectedByContract();
    clientSuppliedAuthorizationFieldsAreRemovedFromDraftRequest();
    crossCompanyOverrideCannotReplaceStoredSessionCompany();
    serviceRequestRepipeSessionWorksWithoutItemId();
    itemBasedSessionPreservesProviderContext();
    equivalentResolutionContextsShareOneSessionKey();
    staleRouteSessionsRetryWithoutWeakeningAuthorization();
    staleCrossContextSessionsCannotReceiveEvidence();
    archivedAndClosedSessionsAreNotDraftable();
}

function missingSessionIdIsRejectedByContract() {
    assert(!isValidEstimateSessionId(''), 'Blank session id must be invalid.');
    assert(!isValidEstimateSessionId('not-a-session'), 'Malformed session id must be invalid.');
    assert(isValidEstimateSessionId(SESSION_ID), 'Persisted UUID session id should be valid.');
}

function clientSuppliedAuthorizationFieldsAreRemovedFromDraftRequest() {
    const request = buildDraftEstimateOptionsRequest(SESSION_ID, {
        company_id: 'attacker-company',
        property_id: 'attacker-property',
        service_request_id: 'attacker-request',
        job_id: 'attacker-job',
        schedule_slot_id: 'attacker-slot',
        home_item_id: 'attacker-item',
        answered_questions: { access: 'basement' },
    });

    assert(request.session_id === SESSION_ID, 'AI draft request must carry the persisted session id.');
    assert(!('company_id' in request), 'AI draft request must not trust client company_id.');
    assert(!('property_id' in request), 'AI draft request must not trust client property_id.');
    assert(!('service_request_id' in request), 'AI draft request must not trust client service_request_id.');
    assert(!('job_id' in request), 'AI draft request must not trust client job_id.');
    assert(!('schedule_slot_id' in request), 'AI draft request must not trust client schedule_slot_id.');
    assert(!('home_item_id' in request), 'AI draft request must not trust client home_item_id.');
}

function crossCompanyOverrideCannotReplaceStoredSessionCompany() {
    const request = buildDraftEstimateOptionsRequest(SESSION_ID, {
        companyId: 'other-company',
        propertyId: 'other-property',
        serviceRequestId: 'other-request',
        session_notes: 'Keep only drafting inputs.',
    });

    assert(request.session_id === SESSION_ID, 'Session id remains the sole authorization boundary.');
    assert(!('companyId' in request), 'Camel-case company override must be removed too.');
    assert(!('propertyId' in request), 'Camel-case property override must be removed too.');
    assert(!('serviceRequestId' in request), 'Camel-case request override must be removed too.');
    assert(request.session_notes === 'Keep only drafting inputs.', 'Non-authorization drafting input should remain.');
}

function serviceRequestRepipeSessionWorksWithoutItemId() {
    const params = buildEstimateSessionRpcParams({
        companyId: COMPANY_ID,
        propertyId: PROPERTY_ID,
        serviceRequestId: REQUEST_ID,
        jobId: JOB_ID,
        scheduleSlotId: SLOT_ID,
        homeItemId: null,
        category: 'whole_home_repipe',
        source: 'techos',
    });

    assert(params.p_company_id === COMPANY_ID, 'Service-request session should keep company id for RPC validation.');
    assert(params.p_property_id === PROPERTY_ID, 'Service-request session should keep property id for RPC validation.');
    assert(params.p_service_request_id === REQUEST_ID, 'Service-request session should keep request id.');
    assert(params.p_home_item_id === null, 'Repipe request sessions should not require a HomeOS item.');
    assert(params.p_category === 'whole_home_repipe', 'Repipe workflow type should be stored on the session.');
}

function itemBasedSessionPreservesProviderContext() {
    const params = buildEstimateSessionRpcParams({
        companyId: COMPANY_ID,
        propertyId: PROPERTY_ID,
        serviceRequestId: REQUEST_ID,
        jobId: JOB_ID,
        scheduleSlotId: SLOT_ID,
        homeItemId: ITEM_ID,
        category: 'faucet_replacement',
        source: 'provider_mode',
    });

    assert(params.p_home_item_id === ITEM_ID, 'Item-based sessions should preserve the HomeOS item id.');
    assert(params.p_source === 'provider_mode', 'Provider item sessions should preserve provider mode source.');
    assert(params.p_schedule_slot_id === SLOT_ID, 'Provider item sessions should preserve assigned visit context.');
}

function archivedAndClosedSessionsAreNotDraftable() {
    assert(isDraftableEstimateSessionStatus('draft'), 'Draft sessions should allow drafting.');
    assert(isDraftableEstimateSessionStatus('technician_review'), 'Technician-review sessions should allow AI copy iteration.');
    assert(!isDraftableEstimateSessionStatus('presentation_ready'), 'Presentation-ready sessions should not allow new AI generation.');
    assert(!isDraftableEstimateSessionStatus('presented'), 'Presented sessions should not allow new AI generation.');
    assert(!isDraftableEstimateSessionStatus('archived'), 'Archived sessions should not allow new AI generation.');
}

function equivalentResolutionContextsShareOneSessionKey() {
    const input = {
        sessionId: SESSION_ID,
        companyId: COMPANY_ID,
        propertyId: PROPERTY_ID,
        serviceRequestId: REQUEST_ID,
        jobId: JOB_ID,
        scheduleSlotId: SLOT_ID,
        homeItemId: ITEM_ID,
        category: 'valve_replacement',
        source: 'techos' as const,
    };
    const first = buildEstimateSessionResolutionKey(input);
    const second = buildEstimateSessionResolutionKey({ ...input });
    const anotherJob = buildEstimateSessionResolutionKey({ ...input, jobId: '88888888-8888-4888-8888-888888888888' });

    assert(first === second, 'Parallel photo and evidence actions in one authorized context must share a single-flight session resolution.');
    assert(first !== anotherJob, 'Different job contexts must never share an estimate session resolution.');
}

function staleRouteSessionsRetryWithoutWeakeningAuthorization() {
    assert(shouldRetryEstimateSessionWithoutCandidate('Estimate session not found.'),
        'A stale route session id should recover through the same authorized company/property/job context.');
    assert(!shouldRetryEstimateSessionWithoutCandidate('Not authorized to use this estimate session.'),
        'Authorization failures must never retry by discarding the server security boundary.');
    assert(!shouldRetryEstimateSessionWithoutCandidate('Estimate session is closed for AI drafting.'),
        'Closed sessions must not be silently replaced with a new draft.');
}

function staleCrossContextSessionsCannotReceiveEvidence() {
    const requested = {
        sessionId: SESSION_ID,
        companyId: COMPANY_ID,
        propertyId: PROPERTY_ID,
        serviceRequestId: REQUEST_ID,
        jobId: JOB_ID,
        scheduleSlotId: SLOT_ID,
        homeItemId: ITEM_ID,
        category: 'valve_replacement',
        source: 'techos' as const,
    };

    assert(doesEstimateSessionMatchRequestedContext({
        companyId: COMPANY_ID,
        propertyId: PROPERTY_ID,
        serviceRequestId: REQUEST_ID,
        jobId: JOB_ID,
        scheduleSlotId: SLOT_ID,
        homeItemId: ITEM_ID,
        source: 'techos',
    }, requested), 'The current job and HomeOS item may reuse its resolved session.');

    assert(!doesEstimateSessionMatchRequestedContext({
        companyId: COMPANY_ID,
        propertyId: PROPERTY_ID,
        serviceRequestId: REQUEST_ID,
        jobId: '88888888-8888-4888-8888-888888888888',
        scheduleSlotId: SLOT_ID,
        homeItemId: ITEM_ID,
        source: 'techos',
    }, requested), 'A stale route session from another job must never receive captured evidence.');
}

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const PROPERTY_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const JOB_ID = '55555555-5555-4555-8555-555555555555';
const SLOT_ID = '66666666-6666-4666-8666-666666666666';
const ITEM_ID = '77777777-7777-4777-8777-777777777777';

runEstimateSessionRegressions();

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
