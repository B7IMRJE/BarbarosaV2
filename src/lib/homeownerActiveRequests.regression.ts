import {
    ACTIVE_REQUEST_INITIAL_EXPAND_MS,
    ACTIVE_REQUEST_UPDATE_EXPAND_MS,
    buildHomeownerActiveRequestTrackers,
    containsRawUuidLikeText,
    formatActiveRequestCompactLabel,
    formatActiveRequestExpandedTitle,
    getActiveRequestEtaStatusText,
    getActiveRequestTrackerAutoCollapseDelay,
    getActiveRequestTrackerAutoExpansionReason,
    getHomeownerFacingStatusLabel,
    getHomeownerFacingStatusKey,
    isActiveHomeownerServiceRequest,
    selectFeaturedHomeownerActiveRequest,
    shouldShowHomeownerActiveRequestStatus,
    type HomeownerActiveServiceRequest,
} from './homeownerActiveRequests';
import type { ServiceRequestActivityEvent } from './serviceRequestActivity';

runHomeownerActiveRequestRegressions();

export function runHomeownerActiveRequestRegressions() {
    trackerAppearsAfterRequestSubmission();
    trackerSurvivesRefreshFromAuthoritativeRows();
    trackerSurvivesLogoutLoginRestore();
    trackerAutoExpandsOnEveryVisibleStatusChange();
    trackerCollapsesAfterConfiguredTimeouts();
    trackerReopensAsExpandedRequestCard();
    onMyWayShowsTechnicianEtaAndFallback();
    rootShellKeepsTrackerVisibleAcrossHomeownerRoutes();
    multipleActiveRequestsShowCountAndSelectHighestPriority();
    terminalRequestsDisappear();
    noRawUuidOrInternalStatusIsDisplayed();
    unrelatedPropertyRequestsAreNotIncludedByCallerScope();
}

function trackerAppearsAfterRequestSubmission() {
    const trackers = buildHomeownerActiveRequestTrackers([
        request({ id: 'request-1', display_code: 'A002', request_type: 'emergency', status: 'new' }),
    ], {});

    assert(trackers.length === 1, 'Submitting an active emergency should produce an active tracker.');
    assert(trackers[0].referenceLabel === 'Request A002', 'Tracker should use the friendly request code.');
    assert(trackers[0].statusLabel === 'Request received', 'New request should read as Request received.');
    assert(trackers[0].isEmergency, 'Emergency tracker should preserve emergency priority.');
    assert(getActiveRequestTrackerAutoExpansionReason([], trackers) === 'initial', 'New active request should auto-expand the tracker.');
}

function trackerSurvivesRefreshFromAuthoritativeRows() {
    const refreshed = buildHomeownerActiveRequestTrackers([
        request({ id: 'request-1', display_code: 'A002', status: 'on_my_way', updated_at: '2026-07-15T18:00:00.000Z' }),
    ], {
        'request-1': [event('request-1', 'technician_on_the_way', '2026-07-15T18:02:00.000Z')],
    })[0];

    assert(refreshed.statusKey === 'on_my_way', 'Refresh should restore event-driven status.');
    assert(refreshed.sortTime > new Date('2026-07-15T18:00:00.000Z').getTime(), 'Latest event should drive recency.');
}

function trackerSurvivesLogoutLoginRestore() {
    const restoredAfterLogin = buildHomeownerActiveRequestTrackers([
        request({ id: 'request-1', display_code: 'A002', status: 'acknowledged' }),
    ], {
        'request-1': [event('request-1', 'request_acknowledged')],
    });

    assert(restoredAfterLogin.length === 1, 'Fresh login restore should rebuild the tracker from request rows and timeline events.');
    assert(restoredAfterLogin[0].statusLabel === 'Company acknowledged your request', 'Fresh login should restore acknowledged state.');
}

function trackerAutoExpandsOnEveryVisibleStatusChange() {
    const initial = buildHomeownerActiveRequestTrackers([
        request({ id: 'request-1', display_code: 'A002', status: 'new' }),
    ], {});
    const transitions = [
        ['request_acknowledged', 'acknowledged'],
        ['appointment_scheduled', 'scheduled'],
        ['technician_assigned', 'assigned'],
        ['technician_on_the_way', 'on_my_way'],
        ['technician_arriving_soon', 'arriving_soon'],
        ['technician_arrived', 'arrived'],
        ['work_in_progress', 'in_progress'],
        ['waiting_for_customer_approval', 'waiting_for_approval'],
        ['work_completed', 'completed'],
    ];
    let previousTrackers = initial;

    transitions.forEach(([eventType, expectedStatusKey], index) => {
        const nextTrackers = buildHomeownerActiveRequestTrackers([
            request({ id: 'request-1', display_code: 'A002', status: 'scheduled' }),
        ], {
            'request-1': [event('request-1', eventType, `2026-07-15T18:${String(index + 10).padStart(2, '0')}:00.000Z`)],
        });

        assert(getHomeownerFacingStatusKey('scheduled', eventType) === expectedStatusKey, `${eventType} should map to ${expectedStatusKey}.`);
        assert(
            getActiveRequestTrackerAutoExpansionReason(previousTrackers, nextTrackers) === 'status-change',
            `${eventType} should auto-expand the tracker.`
        );
        previousTrackers = nextTrackers;
    });
}

function trackerCollapsesAfterConfiguredTimeouts() {
    assert(getActiveRequestTrackerAutoCollapseDelay('initial') === ACTIVE_REQUEST_INITIAL_EXPAND_MS, 'Initial tracker expansion should collapse after 5 seconds.');
    assert(getActiveRequestTrackerAutoCollapseDelay('status-change') === ACTIVE_REQUEST_UPDATE_EXPAND_MS, 'Status updates should collapse after about 4 seconds.');
    assert(getActiveRequestTrackerAutoCollapseDelay('manual') === 0, 'Manual opens should not auto-collapse.');
    assert(getActiveRequestTrackerAutoCollapseDelay(null) === 0, 'No expansion reason should not schedule collapse.');
}

function trackerReopensAsExpandedRequestCard() {
    const tracker = buildHomeownerActiveRequestTrackers([
        request({ id: 'request-1', display_code: 'A005', request_type: 'regular', status: 'scheduled' }),
    ], {})[0];

    assert(formatActiveRequestCompactLabel(tracker) === 'A005', 'Collapsed chip should show the friendly request code.');
    assert(formatActiveRequestExpandedTitle(tracker) === 'Service Request A005', 'Expanded card should use the generic request title.');
    assert(getHomeownerFacingStatusLabel('scheduled') === 'Appointment scheduled', 'Expanded card should use customer status language.');
}

function onMyWayShowsTechnicianEtaAndFallback() {
    const trackerWithEta = buildHomeownerActiveRequestTrackers([
        request({ id: 'request-1', display_code: 'A002', status: 'scheduled' }),
    ], {
        'request-1': [event('request-1', 'technician_on_the_way', '2026-07-15T18:02:00.000Z', {
            eta_range: '20-30 minutes',
            technician_name: 'Michael',
        })],
    })[0];
    const trackerWithoutEta = buildHomeownerActiveRequestTrackers([
        request({ id: 'request-2', display_code: 'A003', status: 'on_my_way' }),
    ], {})[0];

    assert(trackerWithEta.statusLabel === 'Technician on the way', 'On My Way should use homeowner-safe status language.');
    assert(trackerWithEta.technicianName === 'Michael', 'On My Way should surface the assigned technician.');
    assert(getActiveRequestEtaStatusText(trackerWithEta) === '20-30 minutes', 'On My Way should reuse available ETA.');
    assert(getActiveRequestEtaStatusText(trackerWithoutEta) === 'Technician is on the way.', 'Missing ETA should use the on-the-way fallback.');
}

function rootShellKeepsTrackerVisibleAcrossHomeownerRoutes() {
    ['/', '/emergency', '/documents', '/system/plumbing', '/item/kitchen-sink', '/profile'].forEach((pathname) => {
        assert(shouldShowHomeownerActiveRequestStatus({ pathname }), `${pathname} should keep the tracker visible.`);
    });
    ['/auth/login', '/dispatch', '/techos', '/super-admin', '/schedule'].forEach((pathname) => {
        assert(!shouldShowHomeownerActiveRequestStatus({ pathname }), `${pathname} should not show the homeowner tracker.`);
    });
    assert(!shouldShowHomeownerActiveRequestStatus({ pathname: '/', providerModeActive: true }), 'Provider mode should not show the homeowner tracker.');
}

function multipleActiveRequestsShowCountAndSelectHighestPriority() {
    const trackers = buildHomeownerActiveRequestTrackers([
        request({ id: 'regular-request', display_code: 'A001', request_type: 'regular', status: 'on_my_way', updated_at: '2026-07-15T20:00:00.000Z' }),
        request({ id: 'approval-request', display_code: 'A003', request_type: 'regular', status: 'estimate_needed', updated_at: '2026-07-15T20:10:00.000Z' }),
        request({ id: 'emergency-request', display_code: 'A002', request_type: 'emergency', status: 'new', updated_at: '2026-07-15T19:00:00.000Z' }),
    ], {});
    const featured = selectFeaturedHomeownerActiveRequest(trackers);

    assert(trackers.every((tracker) => tracker.activeCountLabel === '3 active'), 'Multiple active requests should expose an active count.');
    assert(featured?.moreCountLabel === '+2 more', 'Featured chip should show the remaining active request count.');
    assert(featured?.request.id === 'emergency-request', 'Emergency request should be featured above routine status urgency.');
}

function terminalRequestsDisappear() {
    const trackers = buildHomeownerActiveRequestTrackers([
        request({ id: 'done', status: 'completed' }),
        request({ id: 'cancelled', status: 'cancelled' }),
        request({ id: 'active', display_code: 'A003', status: 'scheduled' }),
    ], {});

    assert(!isActiveHomeownerServiceRequest(request({ status: 'completed' })), 'Completed requests should not remain floating.');
    assert(!isActiveHomeownerServiceRequest(request({ status: 'cancelled' })), 'Cancelled requests should not remain floating.');
    assert(trackers.length === 1 && trackers[0].request.id === 'active', 'Only non-terminal requests should remain.');
}

function noRawUuidOrInternalStatusIsDisplayed() {
    const tracker = buildHomeownerActiveRequestTrackers([
        request({
            id: '300d72af-71f5-4f58-aa8d-4a1207e2d0cf',
            display_code: 'A002',
            status: 'estimate_needed',
        }),
    ], {})[0];

    assert(!containsRawUuidLikeText(tracker.referenceLabel), 'Tracker reference should not expose raw UUIDs.');
    assert(!containsRawUuidLikeText(formatActiveRequestCompactLabel(tracker)), 'Compact chip should not expose raw UUIDs.');
    assert(!containsRawUuidLikeText(formatActiveRequestExpandedTitle(tracker)), 'Expanded title should not expose raw UUIDs.');
    assert(tracker.statusLabel === 'Waiting for your approval', 'Internal estimate status should be customer language.');
}

function unrelatedPropertyRequestsAreNotIncludedByCallerScope() {
    const scopedRequests = [
        request({ id: 'owned', property_id: 'property-1', display_code: 'A002', status: 'new' }),
        request({ id: 'other', property_id: 'property-2', display_code: 'A003', status: 'new' }),
    ].filter((candidate) => candidate.property_id === 'property-1');
    const trackers = buildHomeownerActiveRequestTrackers(scopedRequests, {});

    assert(trackers.length === 1 && trackers[0].request.id === 'owned', 'Caller property scope should exclude unrelated homeowner requests.');
}

function request(overrides: Partial<HomeownerActiveServiceRequest> = {}): HomeownerActiveServiceRequest {
    return {
        id: 'request-1',
        display_sequence: null,
        display_code: 'A001',
        company_id: 'company-1',
        property_id: 'property-1',
        request_type: 'regular',
        status: 'new',
        priority: 'normal',
        issue_summary: 'Leak under sink',
        provider_name: 'Bravo Plumbing',
        schedule_slot_id: null,
        schedule_status: null,
        technician_name: null,
        arrival_window_start: null,
        arrival_window_end: null,
        eta_range: null,
        created_at: '2026-07-15T17:00:00.000Z',
        updated_at: '2026-07-15T17:00:00.000Z',
        converted_job_id: null,
        ...overrides,
    };
}

function event(
    requestId: string,
    eventType: string,
    createdAt = '2026-07-15T17:05:00.000Z',
    metadata: Record<string, unknown> = {}
): ServiceRequestActivityEvent {
    return {
        id: `${requestId}-${eventType}-${createdAt}`,
        service_request_id: requestId,
        company_id: 'company-1',
        property_id: 'property-1',
        event_type: eventType,
        message: `${eventType} message`,
        event_visibility: 'system_homeowner_update',
        audience: 'homeowner',
        schedule_slot_id: null,
        dedupe_key: null,
        metadata,
        notification_status: 'sent',
        notification_channels: ['in_app'],
        read_at: null,
        notification_delivery_status: null,
        created_at: createdAt,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
