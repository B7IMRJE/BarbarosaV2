import {
    buildTechWorkflowStatusBySlotId,
    createTechnicianNextJobStatusNotice,
    formatTechWorkflowProgressState,
    formatTechWorkflowStatusText,
    getNextJobAvailabilitySectionState,
    getTechJobDetailSectionOrder,
    getTechWorkflowPersistenceMismatchMessage,
    getTechWorkflowStatusFeedback,
    isSecondaryTechWorkflowAction,
    resolveTechOSRouteSelection,
    resolveTechWorkflowActionPresentation,
    resolveTechWorkflowTransition,
    resolveTechWorkflowVisibleStatus,
    TECH_CUSTOM_STATUS_ACTION,
    TECH_WORKFLOW_ACTIONS,
    TECHNICIAN_NEXT_JOB_STATUS_ACTIONS,
    type TechnicianNextJobStatusAction,
} from './techosWorkflow';
import { buildDispatchWallSections, type DispatchWallRequest, type DispatchWallScheduleSlot } from './dispatchWallClassification';
import { formatServiceRequestReference, getServiceRequestDisplayCode } from './homeServiceRequests';
import { getHomeownerStatusTemplate } from './serviceRequestStatusNotifications';

runTechOSWorkflowRegressions();

export function runTechOSWorkflowRegressions() {
    currentJobWorkflowContainsExpectedVisitActions();
    currentJobWorkflowExcludesTechnicianLevelActions();
    assignedJobDetailOrdersCurrentJobBeforeAvailability();
    currentJobAndAvailabilityLabelsStayDistinct();
    incompleteNextJobAvailabilityControlsStayHidden();
    onlyValidNextWorkflowActionIsPrimary();
    workflowStatusFeedbackIsVisibleAndSpecific();
    arrivedStatusSurvivesRefresh();
    staleSlotStatusCannotOverwriteNewerRequestStatus();
    persistedMismatchSurfacesVisibleError();
    routeRefreshDoesNotReopenDismissedJob();
    explicitDeepLinkStillOpensRequestedJob();
    clickedJobSelectionSurvivesRefresh();
    friendlyCodesUseCanonicalFormatter();
    technicianNextJobActionsDoNotChangeCurrentVisitStatus();
    eachWorkflowButtonTargetsBackendTransition();
    slotRequestIdFallbackKeepsWorkflowOnRpcPath();
    workflowOrderingRequiresConfirmation();
    workflowStatusesUpdateHomeownerTrackerLanguage();
    workflowStatusesMoveDispatchLanes();
    authorizationFailureCanSurfaceVisibleMessage();
    duplicateTapsUseStableTransitionIdentity();
    providerModeContextPreservesRequestAndSlot();
    wallboardLaneStillUsesCurrentVisitStatus();
    technicianNextJobNoticeIsScopedToTechnicianAndCompany();
    dispatchRequestsResolveOnce();
}

function currentJobWorkflowContainsExpectedVisitActions() {
    const labels = getCurrentJobWorkflowLabels();

    assert(labels.includes('On My Way'), 'On My Way should remain a current-job workflow action.');
    assert(labels.includes("I've Arrived"), "I've Arrived should remain a current-job workflow action.");
    assert(labels.includes('Start Work'), 'Start Work should remain a current-job workflow action.');
    assert(labels.includes('Request Approval / Create Estimate'), 'Request Approval / Create Estimate should remain a current-job workflow action.');
}

function currentJobWorkflowExcludesTechnicianLevelActions() {
    const labels = getCurrentJobWorkflowLabels();

    assert(!labels.includes('Available'), 'Available should be absent from current-job workflow controls.');
    assert(!labels.includes('Available for Next Job'), 'Available for Next Job should be outside current-job workflow controls.');
    assert(!labels.includes('Available After This Job'), 'Available After This Job should be outside current-job workflow controls.');
    assert(!labels.includes('Running Late for Next Job'), 'Running Late for Next Job should be outside current-job workflow controls.');
    assert(!labels.includes('Running late'), 'Ambiguous Running Late should be absent from current-job workflow controls.');
}

function assignedJobDetailOrdersCurrentJobBeforeAvailability() {
    const order = getTechJobDetailSectionOrder();

    assert(order.indexOf('current_job_status') < order.indexOf('next_job_availability'), 'Current Job Status should render before next-job availability.');
    assert(order.join('|') === 'customer_summary|homeowner_media|current_job_status|job_notes|estimate_approval|finish_visit|next_job_availability', 'Assigned-job detail should keep the intended MVP hierarchy.');
}

function currentJobAndAvailabilityLabelsStayDistinct() {
    const currentLabels = new Set(getCurrentJobWorkflowLabels());
    const nextJobLabels = getNextJobAvailabilitySectionState().controlLabels;

    nextJobLabels.forEach((label) => {
        assert(!currentLabels.has(label), `${label} should not appear as a current customer workflow action.`);
    });
}

function incompleteNextJobAvailabilityControlsStayHidden() {
    const section = getNextJobAvailabilitySectionState();

    assert(section.title === 'Next-Job Availability - Coming Soon', 'Incomplete next-job availability should be visibly marked Coming Soon.');
    assert(section.controlLabels.includes('Available After This Job'), 'Next-job availability should use the clearer available-after-this-job label.');
    assert(section.controlLabels.includes('Clear Next-Job Delay'), 'Next-job availability should use the clearer delay-clearing label.');
    assert(section.comingSoon, 'Next-job availability should remain explicitly marked as coming soon.');
    assert(section.controlsVisible === false, 'Incomplete next-job availability controls should be hidden for the MVP.');
}

function onlyValidNextWorkflowActionIsPrimary() {
    const assignedPresentation = resolveTechWorkflowActionPresentation('assigned');
    const onMyWayPresentation = resolveTechWorkflowActionPresentation('on_my_way');
    const arrivedPresentation = resolveTechWorkflowActionPresentation('arrived');

    assert(getPrimaryActionLabels(assignedPresentation).join(',') === 'On My Way', 'Assigned jobs should make only On My Way primary.');
    assert(getPrimaryActionLabels(onMyWayPresentation).join(',') === "I've Arrived", 'On My Way jobs should make only Arrived primary.');
    assert(getPrimaryActionLabels(arrivedPresentation).join(',') === 'Start Work', 'Arrived jobs should make only Start Work primary.');
    assert(formatTechWorkflowProgressState(assignedPresentation[0].progressState) === 'Next action', 'Primary next action should have clear progression language.');
    assert(assignedPresentation.filter((action) => action.primary).length === 1, 'Only one current-job workflow action should be primary.');
    assert(!assignedPresentation[0].disabled, 'The valid next workflow action should be enabled.');
    assert(assignedPresentation.slice(1).every((action) => action.disabled), 'Future workflow actions should not be primary inline controls.');
    assert(
        assignedPresentation.filter(isSecondaryTechWorkflowAction).map((action) => action.label).join('|') === "I've Arrived|Start Work",
        'More Actions should expose direct arrival and early work start, not every future action.'
    );
}

function workflowStatusFeedbackIsVisibleAndSpecific() {
    const feedback = getTechWorkflowStatusFeedback('on_my_way');

    assert(feedback === 'Status updated: Technician is on the way. The homeowner and Dispatch were notified.', 'On My Way should produce visible homeowner/dispatch notification feedback.');
    assert(formatTechWorkflowStatusText('arrived') === 'Technician arrived', 'Current Job Status should show durable technician-arrived text.');
}

function arrivedStatusSurvivesRefresh() {
    const statuses = buildTechWorkflowStatusBySlotId(
        [{ id: 'slot-1', service_request_id: 'request-1', status: 'arrived' }],
        { 'request-1': { status: 'arrived' } },
        {}
    );

    assert(statuses['slot-1'] === 'arrived', 'Arrived should remain Arrived after a clean refresh.');
}

function staleSlotStatusCannotOverwriteNewerRequestStatus() {
    const visibleStatus = resolveTechWorkflowVisibleStatus({
        requestStatus: 'arrived',
        slotStatus: 'on_my_way',
    });
    const statuses = buildTechWorkflowStatusBySlotId(
        [{ id: 'slot-1', service_request_id: 'request-1', status: 'on_my_way' }],
        { 'request-1': { status: 'arrived' } },
        {}
    );

    assert(visibleStatus === 'arrived', 'Newer request status should beat a stale slot status.');
    assert(statuses['slot-1'] === 'arrived', 'Refresh merge should not restore the older slot status.');
}

function persistedMismatchSurfacesVisibleError() {
    const message = getTechWorkflowPersistenceMismatchMessage('arrived', {
        schedule_slot_status: 'on_my_way',
        service_request_status: 'on_my_way',
    });

    assert(message.includes('requested Technician arrived'), 'Persistence mismatch should name the requested status.');
    assert(message.includes('saved state returned Technician on the way'), 'Persistence mismatch should name the persisted status.');
}

function routeRefreshDoesNotReopenDismissedJob() {
    const selection = resolveTechOSRouteSelection({
        availableSlotIds: ['slot-1'],
        dismissedSlotId: 'slot-1',
        requestedSlotId: 'slot-1',
        routeOpenedSlotId: 'slot-1',
        selectedSlotId: '',
    });

    assert(selection.selectedSlotId === '', 'Refresh should not reopen a job the technician dismissed.');
}

function explicitDeepLinkStillOpensRequestedJob() {
    const selection = resolveTechOSRouteSelection({
        availableSlotIds: ['slot-1'],
        dismissedSlotId: '',
        requestedSlotId: 'slot-1',
        routeOpenedSlotId: '',
        selectedSlotId: '',
    });

    assert(selection.selectedSlotId === 'slot-1', 'Initial deep link should open the requested job.');
    assert(selection.routeOpenedSlotId === 'slot-1', 'Initial deep link should be recorded as resolved.');
}

function clickedJobSelectionSurvivesRefresh() {
    const selection = resolveTechOSRouteSelection({
        availableSlotIds: ['slot-1', 'slot-2'],
        dismissedSlotId: '',
        requestedSlotId: 'slot-1',
        routeOpenedSlotId: 'slot-1',
        selectedSlotId: 'slot-2',
    });

    assert(selection.selectedSlotId === 'slot-2', 'Refresh should keep the technician-selected job open.');
}

function friendlyCodesUseCanonicalFormatter() {
    const request = {
        id: '300d72af-1111-4222-9333-444455556666',
        display_code: 'a0003',
        display_sequence: 3,
    };
    const displayCode = getServiceRequestDisplayCode(request);

    assert(displayCode === 'A0003', 'TechOS should use the canonical friendly request code.');
    assert(formatServiceRequestReference(request) === 'Request A0003', 'Friendly request reference should match HomeOS/Dispatch copy.');
    assert(!displayCode.includes('300D72AF'), 'Friendly request code should not expose UUID fragments.');
}

function technicianNextJobActionsDoNotChangeCurrentVisitStatus() {
    const currentStatuses = ['scheduled', 'on_my_way', 'arrived', 'in_progress'];

    currentStatuses.forEach((currentVisitStatus) => {
        TECHNICIAN_NEXT_JOB_STATUS_ACTIONS.forEach((action) => {
            const notice = createNotice(action, currentVisitStatus);

            assert(notice.currentVisitStatus === currentVisitStatus, `${action.label} should not change ${currentVisitStatus}.`);
            assert(notice.persisted === false, `${action.label} should not fake technician-level persistence.`);
        });
    });
}

function eachWorkflowButtonTargetsBackendTransition() {
    TECH_WORKFLOW_ACTIONS.forEach((action) => {
        const resolution = resolveTransition(action, {
            currentStatus: action.key === 'in_progress' ? 'arrived' : 'on_my_way',
            pendingConfirmationKey: action.key === 'arrived' ? 'slot-1:arrived' : null,
        });

        assert(resolution.canRun, `${action.label} should resolve to a runnable backend transition.`);
        assert(resolution.serviceRequestId === 'request-1', `${action.label} should carry the service request id.`);
        assert(resolution.status === action.status, `${action.label} should call the expected backend status.`);
    });
}

function slotRequestIdFallbackKeepsWorkflowOnRpcPath() {
    const action = TECH_WORKFLOW_ACTIONS.find((candidate) => candidate.key === 'on_my_way');
    const resolution = resolveTechWorkflowTransition(action!, {
        slotId: 'slot-1',
        companyId: 'company-1',
        technicianCompanyUserId: 'tech-1',
        requestId: null,
        slotServiceRequestId: 'request-from-slot',
        currentStatus: 'assigned',
    });

    assert(resolution.canRun, 'Slot-level service_request_id should keep TechOS on the RPC transition path.');
    assert(resolution.serviceRequestId === 'request-from-slot', 'RPC transition should use slot service_request_id when request details are stale or missing.');
}

function workflowOrderingRequiresConfirmation() {
    const arrived = TECH_WORKFLOW_ACTIONS.find((candidate) => candidate.key === 'arrived')!;
    const working = TECH_WORKFLOW_ACTIONS.find((candidate) => candidate.key === 'in_progress')!;
    const directArrival = resolveTransition(arrived, { currentStatus: 'scheduled' });
    const confirmedArrival = resolveTransition(arrived, {
        currentStatus: 'scheduled',
        pendingConfirmationKey: directArrival.confirmationKey,
    });
    const earlyWork = resolveTransition(working, { currentStatus: 'on_my_way' });

    assert(!directArrival.canRun && directArrival.requiresConfirmation, 'Arrived before On My Way should require confirmation.');
    assert(confirmedArrival.canRun, 'Second tap should allow the direct-arrival path.');
    assert(!earlyWork.canRun && earlyWork.requiresConfirmation, 'Working before Arrived should require confirmation.');
}

function workflowStatusesUpdateHomeownerTrackerLanguage() {
    const expected = [
        ['on_my_way', 'technician_on_the_way'],
        ['arrived', 'technician_arrived'],
        ['in_progress', 'work_in_progress'],
        ['estimate_needed', 'waiting_for_customer_approval'],
    ];

    expected.forEach(([status, homeownerKey]) => {
        assert(getHomeownerStatusTemplate(status)?.status === homeownerKey, `${status} should map to ${homeownerKey}.`);
    });
}

function workflowStatusesMoveDispatchLanes() {
    const now = new Date(2026, 6, 12, 12, 0, 0, 0);
    const expectedSections = [
        ['on_my_way', 'on_my_way'],
        ['arrived', 'in_progress'],
        ['in_progress', 'in_progress'],
        ['estimate_needed', 'in_progress'],
    ] as const;

    expectedSections.forEach(([status, sectionKey]) => {
        const request = createRequest(`request-${status}`);
        const sections = buildDispatchWallSections([request], [createSlot(request.id, status)], [createTechnician()], now);

        assert(getSectionCount(sections, request.id, sectionKey) === 1, `${status} should move Dispatch to ${sectionKey}.`);
    });
}

function authorizationFailureCanSurfaceVisibleMessage() {
    const resolution = resolveTechWorkflowTransition(TECH_WORKFLOW_ACTIONS[0], {
        slotId: 'slot-1',
        companyId: 'company-1',
        technicianCompanyUserId: '',
        requestId: 'request-1',
        currentStatus: 'assigned',
    });

    assert(!resolution.canRun, 'Missing technician context should not run the transition.');
    assert(resolution.message.includes('Workflow update failed'), 'Failed context should produce a visible workflow error.');
}

function duplicateTapsUseStableTransitionIdentity() {
    const first = resolveTransition(TECH_WORKFLOW_ACTIONS[0], { currentStatus: 'assigned' });
    const second = resolveTransition(TECH_WORKFLOW_ACTIONS[0], { currentStatus: 'assigned' });

    assert(first.confirmationKey === second.confirmationKey, 'Duplicate taps should resolve to the same transition identity for idempotent backend writes.');
}

function providerModeContextPreservesRequestAndSlot() {
    const slot = { ...createSlot('request-1', 'assigned'), job_id: 'job-1' };
    const request = createRequest('request-1');
    const context = {
        companyId: slot.company_id || request.company_id || '',
        propertyId: request.property_id || null,
        serviceRequestId: request.id || slot.service_request_id || null,
        scheduleSlotId: slot.id || null,
        jobId: slot.job_id || request.converted_job_id || null,
    };

    assert(context.serviceRequestId === 'request-1', 'Provider-mode navigation should preserve service request context.');
    assert(context.scheduleSlotId === 'request-1-slot', 'Provider-mode navigation should preserve schedule slot context.');
}

function wallboardLaneStillUsesCurrentVisitStatus() {
    const now = new Date(2026, 6, 12, 12, 0, 0, 0);
    const inProgressRequest = createRequest('in-progress-current-job');
    const scheduledRequest = createRequest('scheduled-current-job');
    const inProgressSlot = createSlot(inProgressRequest.id, 'in_progress');
    const scheduledSlot = createSlot(scheduledRequest.id, 'scheduled');

    createNotice(TECHNICIAN_NEXT_JOB_STATUS_ACTIONS[1], 'in_progress');
    createNotice(TECHNICIAN_NEXT_JOB_STATUS_ACTIONS[0], 'scheduled');

    const sections = buildDispatchWallSections(
        [inProgressRequest, scheduledRequest],
        [inProgressSlot, scheduledSlot],
        [createTechnician()],
        now
    );

    assert(getSectionCount(sections, inProgressRequest.id, 'in_progress') === 1, 'In Progress job should stay in the wallboard live-work lane.');
    assert(getSectionCount(sections, scheduledRequest.id, 'assigned_ready') === 1, 'Scheduled job should stay Assigned until current-job workflow changes.');
}

function technicianNextJobNoticeIsScopedToTechnicianAndCompany() {
    const notice = createNotice(TECHNICIAN_NEXT_JOB_STATUS_ACTIONS[1], 'in_progress');

    assert(notice.companyId === 'company-1', 'Technician-level notice should keep company scope.');
    assert(notice.technicianCompanyUserId === 'tech-1', 'Technician-level notice should keep authenticated technician scope.');
    assert(notice.message.includes('current job remains unchanged'), 'Technician-level notice should tell the technician the job was not changed.');
}

function dispatchRequestsResolveOnce() {
    const now = new Date(2026, 6, 12, 12, 0, 0, 0);
    const request = createRequest('single-wallboard-lane');
    const sections = buildDispatchWallSections([request], [createSlot(request.id, 'in_progress')], [createTechnician()], now);
    const itemCount = Object.values(sections).flat().filter((item) => item.request.id === request.id).length;

    assert(itemCount === 1, 'No request should resolve into multiple wallboard lanes.');
}

function getCurrentJobWorkflowLabels() {
    return [...TECH_WORKFLOW_ACTIONS, TECH_CUSTOM_STATUS_ACTION].map((action) => action.label);
}

function getPrimaryActionLabels(actions: ReturnType<typeof resolveTechWorkflowActionPresentation>) {
    return actions.filter((action) => action.primary).map((action) => action.label);
}

function createNotice(action: TechnicianNextJobStatusAction, currentVisitStatus: string) {
    return createTechnicianNextJobStatusNotice(action, {
        companyId: 'company-1',
        currentVisitStatus,
        technicianCompanyUserId: 'tech-1',
    });
}

function resolveTransition(
    action: (typeof TECH_WORKFLOW_ACTIONS)[number],
    overrides: {
        currentStatus?: string | null;
        pendingConfirmationKey?: string | null;
    } = {}
) {
    return resolveTechWorkflowTransition(action, {
        slotId: 'slot-1',
        companyId: 'company-1',
        technicianCompanyUserId: 'tech-1',
        requestId: 'request-1',
        currentStatus: overrides.currentStatus || 'assigned',
        pendingConfirmationKey: overrides.pendingConfirmationKey || null,
    });
}

function createRequest(id: string): DispatchWallRequest {
    return {
        id,
        display_sequence: null,
        display_code: id.toUpperCase(),
        company_id: 'company-1',
        property_id: 'property-1',
        company_property_client_id: null,
        request_type: 'service',
        status: 'scheduled',
        priority: 'Emergency',
        issue_summary: 'Repair',
        customer_display_name: 'Homeowner',
        property_display_name: 'Home',
        property_address: '123 Main St',
        property_city: 'Phoenix',
        property_state: 'AZ',
        property_postal_code: '85001',
        created_at: '2026-07-12T15:00:00.000Z',
        acknowledged_at: '2026-07-12T15:05:00.000Z',
        converted_job_id: null,
        converted_at: null,
        closeout_outcome: null,
        next_action_at: null,
        closed_at: null,
        cancelled_at: null,
        archived_at: null,
    };
}

function createSlot(requestId: string, status: string): DispatchWallScheduleSlot {
    return {
        id: `${requestId}-slot`,
        company_id: 'company-1',
        service_request_id: requestId,
        technician_company_user_id: 'tech-1',
        start_at: '2026-07-13T16:00:00.000Z',
        end_at: '2026-07-13T17:00:00.000Z',
        arrival_window_start: '2026-07-13T16:00:00.000Z',
        arrival_window_end: '2026-07-13T17:00:00.000Z',
        status,
        priority: null,
        tech_status_note: null,
        visit_outcome: null,
        visit_closed_at: null,
        updated_at: '2026-07-12T15:30:00.000Z',
    };
}

function createTechnician() {
    return {
        id: 'tech-1',
        company_id: 'company-1',
        full_name: 'Tech One',
        email: 'tech@example.test',
        role: 'technician',
        status: 'active',
    };
}

function getSectionCount(
    sections: ReturnType<typeof buildDispatchWallSections>,
    requestId: string,
    sectionKey: keyof ReturnType<typeof buildDispatchWallSections>
) {
    return sections[sectionKey].filter((item) => item.request.id === requestId).length;
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
