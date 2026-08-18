const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstimateSessionSource = 'techos' | 'provider_mode' | 'management' | 'homeos';

export type EstimateOptionSessionInput = {
    sessionId?: string | null;
    companyId: string;
    propertyId?: string | null;
    serviceRequestId?: string | null;
    jobId?: string | null;
    scheduleSlotId?: string | null;
    homeItemId?: string | null;
    category: string;
    source: EstimateSessionSource;
};

export type EstimateSessionContext = {
    companyId: string;
    propertyId?: string | null;
    serviceRequestId?: string | null;
    jobId?: string | null;
    scheduleSlotId?: string | null;
    homeItemId?: string | null;
    source: EstimateSessionSource;
};

export function isValidEstimateSessionId(value?: string | null) {
    return UUID_PATTERN.test(String(value || '').trim());
}

export function isDraftableEstimateSessionStatus(status?: string | null) {
    return ['draft', 'technician_review'].includes(normalizeText(status));
}

export function normalizeEstimateSessionSource(value?: string | null): EstimateSessionSource {
    const normalized = normalizeText(value);

    return ['techos', 'provider_mode', 'management', 'homeos'].includes(normalized)
        ? normalized as EstimateSessionSource
        : 'techos';
}

export function buildEstimateSessionRpcParams(input: EstimateOptionSessionInput) {
    return {
        p_session_id: isValidEstimateSessionId(input.sessionId) ? input.sessionId : null,
        p_company_id: normalizeUuid(input.companyId),
        p_property_id: normalizeUuid(input.propertyId),
        p_service_request_id: normalizeUuid(input.serviceRequestId),
        p_job_id: normalizeUuid(input.jobId),
        p_schedule_slot_id: normalizeUuid(input.scheduleSlotId),
        p_home_item_id: normalizeUuid(input.homeItemId),
        p_category: String(input.category || '').trim() || 'faucet_replacement',
        p_source: normalizeEstimateSessionSource(input.source),
    };
}

export function buildEstimateSessionResolutionKey(input: EstimateOptionSessionInput) {
    const params = buildEstimateSessionRpcParams(input);

    return [
        params.p_session_id,
        params.p_company_id,
        params.p_property_id,
        params.p_service_request_id,
        params.p_job_id,
        params.p_schedule_slot_id,
        params.p_home_item_id,
        params.p_category,
        params.p_source,
    ].map((value) => String(value || '')).join('|');
}

export function doesEstimateSessionMatchRequestedContext(
    session: EstimateSessionContext,
    input: EstimateOptionSessionInput
) {
    const requested = buildEstimateSessionRpcParams(input);
    const resolved = buildEstimateSessionRpcParams({
        ...session,
        category: input.category,
    });

    return requested.p_company_id === resolved.p_company_id
        && requested.p_property_id === resolved.p_property_id
        && requested.p_service_request_id === resolved.p_service_request_id
        && requested.p_job_id === resolved.p_job_id
        && requested.p_schedule_slot_id === resolved.p_schedule_slot_id
        && requested.p_home_item_id === resolved.p_home_item_id
        && requested.p_source === resolved.p_source;
}

export function shouldRetryEstimateSessionWithoutCandidate(message?: string | null) {
    const normalized = normalizeText(message);

    return normalized.includes('estimate session not found');
}

export function buildDraftEstimateOptionsRequest<TInput extends Record<string, unknown>>(
    sessionId: string,
    input: TInput
) {
    const {
        company_id: _companyId,
        companyId: _companyIdCamel,
        property_id: _propertyId,
        propertyId: _propertyIdCamel,
        service_request_id: _serviceRequestId,
        serviceRequestId: _serviceRequestIdCamel,
        job_id: _jobId,
        jobId: _jobIdCamel,
        schedule_slot_id: _scheduleSlotId,
        scheduleSlotId: _scheduleSlotIdCamel,
        home_item_id: _homeItemId,
        homeItemId: _homeItemIdCamel,
        ...draftingInput
    } = input;

    return {
        ...draftingInput,
        session_id: sessionId,
    };
}

function normalizeUuid(value?: string | null) {
    const text = String(value || '').trim();

    return UUID_PATTERN.test(text) ? text : null;
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
