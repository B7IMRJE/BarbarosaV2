import {
    buildDispatchWallSections,
    type DispatchWallCompanyUser,
    type DispatchWallRequest,
    type DispatchWallScheduleSlot,
    type DispatchWallSectionKey,
    type DispatchWallSections,
} from './dispatchWallClassification';

const now = new Date(2026, 6, 12, 12, 0, 0, 0);
const activeSectionKeys: DispatchWallSectionKey[] = [
    'emergency',
    'emergency_leads',
    'running_late',
    'regular_leads',
    'unassigned',
    'assigned_ready',
    'on_my_way',
    'in_progress',
];

runDispatchWallClassificationRegressions();

export function runDispatchWallClassificationRegressions() {
    emergencyUnassignedRequestAppearsInEmergency();
    futureAssignedEmergencyMovesToAssignedReady();
    futureScheduledAssignedRequestStaysOutOfLivePanels();
    futureAssignedOnMyWayMovesForward();
    futureAssignedLiveWorkMovesForward();
    futureAssignedTechnicianRehydratesConsistently();
    currentDayOperationalStatesRemainUnchanged();
    completedEmergencyVisitFromYesterdayIsExcluded();
    completedEmergencyVisitFromTodayIsClosedToday();
    olderCompletedVisitDoesNotOverrideNewerOnMyWayVisit();
    terminalSelectedVisitDoesNotEnterActivePanels();
    classifiedRequestsDoNotDuplicateAcrossSections();
}

function emergencyUnassignedRequestAppearsInEmergency() {
    const request = createEmergencyScheduledRequest('a0008-unassigned');
    const sections = buildDispatchWallSections([request], [], [], now);
    const item = getSingleRequestItem(sections, request.id);

    assert(item.sectionKey === 'emergency', 'Unassigned emergency request should appear in Emergency.');
}

function futureAssignedEmergencyMovesToAssignedReady() {
    const request = createEmergencyScheduledRequest('a0008-future-assigned');
    const slot = createFutureAssignedSlot(request.id, { id: 'a0008-future-assigned-slot' });
    const sections = buildDispatchWallSections([request], [slot], [createTechnician('tech-2', 'tech 2')], now);
    const item = getSingleRequestItem(sections, request.id);

    assert(item.sectionKey === 'assigned_ready', 'Future assigned emergency request should appear in Assigned / Ready.');
    assert(item.statusLabel === 'Scheduled', 'Future assigned emergency status label should remain Scheduled.');
    assert(item.request.priority === 'Emergency', 'Assigned card should keep Emergency as a priority badge source.');
    assert(item.technician?.full_name === 'tech 2', 'Future assigned emergency should carry the assigned technician.');
    assertRequestNotInSections(
        sections,
        request.id,
        ['emergency', 'running_late', 'unassigned', 'on_my_way', 'in_progress'],
        'Future assigned emergency should not remain in active emergency or live-state panels.'
    );
}

function futureScheduledAssignedRequestStaysOutOfLivePanels() {
    [
        { status: 'scheduled', note: null },
        { status: 'assigned', note: null },
        { status: 'custom', note: 'confirm with office' },
    ].forEach(({ status, note }) => {
        const request = createEmergencyScheduledRequest(`future-${status}`);
        const slot = createFutureAssignedSlot(request.id, {
            id: `future-${status}-slot`,
            status,
            tech_status_note: note,
        });
        const sections = buildDispatchWallSections([request], [slot], [createTechnician('tech-2', 'tech 2')], now);
        const item = getSingleRequestItem(sections, request.id);

        assert(item.sectionKey === 'assigned_ready', `Future ${status} slot should stay assigned_ready until an explicit live state exists.`);
        assertRequestNotInSections(
            sections,
            request.id,
            ['emergency', 'running_late', 'unassigned', 'on_my_way', 'in_progress'],
            `Future ${status} slot should not enter emergency or live-state panels.`
        );
    });
}

function futureAssignedOnMyWayMovesForward() {
    const request = createEmergencyScheduledRequest('a0008-future-on-my-way');
    const slot = createFutureAssignedSlot(request.id, {
        id: 'a0008-future-on-my-way-slot',
        status: 'on_my_way',
    });
    const sections = buildDispatchWallSections([request], [slot], [createTechnician('tech-2', 'tech 2')], now);
    const item = getSingleRequestItem(sections, request.id);

    assert(item.sectionKey === 'on_my_way', 'Future On My Way request should move to the On My Way wallboard section.');
    assert(item.statusLabel === 'On My Way', 'Future On My Way request label should match the wallboard section.');
    assert(item.request.priority === 'Emergency', 'Future On My Way request should keep Emergency as priority badge source.');
    assert(item.technician?.full_name === 'tech 2', 'Future On My Way request should keep the assigned technician.');
    assertRequestNotInSections(
        sections,
        request.id,
        ['emergency', 'assigned_ready', 'unassigned', 'in_progress'],
        'Future On My Way request should leave earlier wallboard sections.'
    );
}

function futureAssignedLiveWorkMovesForward() {
    [
        { status: 'arrived', note: null, expectedLabel: 'Arrived' },
        { status: 'working', note: null, expectedLabel: 'Working' },
        { status: 'in_progress', note: null, expectedLabel: 'In Progress' },
        { status: 'assistance_needed', note: null, expectedLabel: 'Assistance Needed' },
        { status: 'custom', note: 'working', expectedLabel: 'Custom' },
    ].forEach(({ status, note, expectedLabel }) => {
        const request = createEmergencyScheduledRequest(`future-live-${status}`);
        const slot = createFutureAssignedSlot(request.id, {
            id: `future-live-${status}-slot`,
            status,
            tech_status_note: note,
        });
        const sections = buildDispatchWallSections([request], [slot], [createTechnician('tech-2', 'tech 2')], now);
        const item = getSingleRequestItem(sections, request.id);

        assert(item.sectionKey === 'in_progress', `Future ${status} slot should move to in_progress after an explicit live state.`);
        assert(item.statusLabel === expectedLabel, `Future ${status} label should come from the explicit operational state.`);
        assertRequestNotInSections(
            sections,
            request.id,
            ['emergency', 'assigned_ready', 'unassigned', 'on_my_way'],
            `Future ${status} slot should leave earlier wallboard sections.`
        );
    });
}

function futureAssignedTechnicianRehydratesConsistently() {
    const request = createEmergencyScheduledRequest('future-tech-rehydrate');
    const slot = createFutureAssignedSlot(request.id, { id: 'future-tech-rehydrate-slot' });
    const technician = createTechnician('tech-2', 'tech 2');
    const firstSections = buildDispatchWallSections([request], [slot], [technician], now);
    const reopenedSections = buildDispatchWallSections([request], [slot], [technician], now);
    const firstItem = getSingleRequestItem(firstSections, request.id);
    const reopenedItem = getSingleRequestItem(reopenedSections, request.id);

    assert(firstItem.technician?.id === 'tech-2', 'Future assigned technician should load on the first wallboard build.');
    assert(reopenedItem.technician?.id === 'tech-2', 'Future assigned technician should load after a refresh-shaped rebuild.');
    assert(reopenedItem.slot?.technician_company_user_id === reopenedItem.technician?.id, 'Card and detail data should identify the same technician from the selected slot.');
}

function currentDayOperationalStatesRemainUnchanged() {
    [
        { id: 'today-assigned', status: 'scheduled', hour: 15, expected: 'assigned_ready' as const },
        { id: 'today-on-my-way', status: 'on_my_way', hour: 15, expected: 'on_my_way' as const },
        { id: 'today-in-progress', status: 'arrived', hour: 15, expected: 'in_progress' as const },
        { id: 'today-running-late', status: 'scheduled', hour: 10, expected: 'running_late' as const },
    ].forEach(({ id, status, hour, expected }) => {
        const request = createEmergencyScheduledRequest(id);
        const slot = createSlot({
            id: `${id}-slot`,
            service_request_id: request.id,
            status,
            start_at: localIso(0, hour),
            end_at: localIso(0, hour + 1),
            arrival_window_start: localIso(0, hour),
            arrival_window_end: localIso(0, hour + 1),
            updated_at: localIso(0, 11),
        });
        const sections = buildDispatchWallSections([request], [slot], [createTechnician('tech-2', 'tech 2')], now);
        const item = getSingleRequestItem(sections, request.id);

        assert(item.sectionKey === expected, `${id} should remain classified as ${expected}.`);
    });
}

function completedEmergencyVisitFromYesterdayIsExcluded() {
    const request = createEmergencyScheduledRequest('completed-yesterday');
    const slot = createSlot({
        id: 'completed-yesterday-slot',
        service_request_id: request.id,
        status: 'scheduled',
        start_at: localIso(-1, 8),
        end_at: localIso(-1, 9),
        arrival_window_start: localIso(-1, 8),
        arrival_window_end: localIso(-1, 9),
        visit_outcome: 'completed_successfully',
        visit_closed_at: localIso(-1, 9),
        updated_at: localIso(-1, 9),
    });

    const sections = buildDispatchWallSections([request], [slot], [], now);

    assertRequestNotInAnySection(sections, request.id, 'Completed emergency visit from yesterday should be excluded.');
}

function completedEmergencyVisitFromTodayIsClosedToday() {
    const request = createEmergencyScheduledRequest('completed-today');
    const slot = createSlot({
        id: 'completed-today-slot',
        service_request_id: request.id,
        status: 'scheduled',
        start_at: localIso(0, 8),
        end_at: localIso(0, 9),
        arrival_window_start: localIso(0, 8),
        arrival_window_end: localIso(0, 9),
        visit_outcome: 'completed_successfully',
        visit_closed_at: localIso(0, 9),
        updated_at: localIso(0, 9),
    });

    const sections = buildDispatchWallSections([request], [slot], [], now);
    const item = getSingleRequestItem(sections, request.id);

    assert(item?.sectionKey === 'closed_today', 'Completed emergency visit from today should be closed_today.');
    assert(item.statusLabel === 'Completed', 'Terminal selected visit label should beat risk labels.');
    assertRequestNotInActiveSections(sections, request.id, 'Completed emergency visit from today should not enter active panels.');
}

function olderCompletedVisitDoesNotOverrideNewerOnMyWayVisit() {
    const request = createEmergencyScheduledRequest('newer-active');
    const completedSlot = createSlot({
        id: 'older-completed-slot',
        service_request_id: request.id,
        status: 'scheduled',
        start_at: localIso(-1, 8),
        end_at: localIso(-1, 9),
        arrival_window_start: localIso(-1, 8),
        arrival_window_end: localIso(-1, 9),
        visit_outcome: 'completed_successfully',
        visit_closed_at: localIso(-1, 9),
        updated_at: localIso(-1, 9),
    });
    const activeSlot = createSlot({
        id: 'newer-active-slot',
        service_request_id: request.id,
        status: 'on_my_way',
        start_at: localIso(0, 15),
        end_at: localIso(0, 16),
        arrival_window_start: localIso(0, 15),
        arrival_window_end: localIso(0, 16),
        updated_at: localIso(0, 11),
    });

    const sections = buildDispatchWallSections([request], [completedSlot, activeSlot], [], now);
    const item = getSingleRequestItem(sections, request.id);

    assert(item?.slot?.id === activeSlot.id, 'Newer active visit should remain the selected wallboard slot.');
    assert(item.sectionKey === 'on_my_way', 'Newer On My Way visit should control the operational classification.');
    assert(item.statusLabel === 'On My Way', 'Newer On My Way visit label should match the selected slot state.');
}

function terminalSelectedVisitDoesNotEnterActivePanels() {
    ['scheduled', 'running_late', 'on_my_way', 'arrived', 'custom'].forEach((status) => {
        const request = createEmergencyScheduledRequest(`terminal-${status}`);
        const slot = createSlot({
            id: `terminal-${status}-slot`,
            service_request_id: request.id,
            status,
            tech_status_note: status === 'custom' ? 'working' : null,
            start_at: localIso(0, 7),
            end_at: localIso(0, 8),
            arrival_window_start: localIso(0, 7),
            arrival_window_end: localIso(0, 8),
            visit_outcome: 'completed_successfully',
            visit_closed_at: localIso(0, 8),
            updated_at: localIso(0, 8),
        });

        const sections = buildDispatchWallSections([request], [slot], [], now);
        const item = getSingleRequestItem(sections, request.id);

        assert(item?.sectionKey === 'closed_today', `${status} terminal visit should be closed_today.`);
        assertRequestNotInActiveSections(sections, request.id, `${status} terminal visit should not enter active panels.`);
    });
}

function classifiedRequestsDoNotDuplicateAcrossSections() {
    const scheduledRequest = createEmergencyScheduledRequest('single-section-scheduled');
    const onMyWayRequest = createEmergencyScheduledRequest('single-section-on-my-way');
    const inProgressRequest = createEmergencyScheduledRequest('single-section-in-progress');
    const closedRequest = createEmergencyScheduledRequest('single-section-closed');
    const sections = buildDispatchWallSections(
        [scheduledRequest, onMyWayRequest, inProgressRequest, closedRequest],
        [
            createFutureAssignedSlot(scheduledRequest.id, { id: 'single-section-scheduled-slot' }),
            createFutureAssignedSlot(onMyWayRequest.id, { id: 'single-section-on-my-way-slot', status: 'on_my_way' }),
            createFutureAssignedSlot(inProgressRequest.id, { id: 'single-section-in-progress-slot', status: 'working' }),
            createSlot({
                id: 'single-section-closed-slot',
                service_request_id: closedRequest.id,
                status: 'on_my_way',
                start_at: localIso(0, 8),
                end_at: localIso(0, 9),
                arrival_window_start: localIso(0, 8),
                arrival_window_end: localIso(0, 9),
                visit_outcome: 'completed_successfully',
                visit_closed_at: localIso(0, 9),
                updated_at: localIso(0, 9),
            }),
        ],
        [createTechnician('tech-2', 'tech 2')],
        now
    );

    [scheduledRequest, onMyWayRequest, inProgressRequest, closedRequest].forEach((request) => {
        const items = getRequestItems(sections, request.id);

        assert(items.length === 1, `${request.id} should resolve into exactly one wallboard section.`);
    });
}

function createEmergencyScheduledRequest(id: string): DispatchWallRequest {
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
        issue_summary: 'Emergency repair',
        customer_display_name: 'Homeowner',
        property_display_name: 'Home',
        property_address: '123 Main St',
        property_city: 'Phoenix',
        property_state: 'AZ',
        property_postal_code: '85001',
        created_at: localIso(-2, 10),
        acknowledged_at: localIso(-2, 11),
        converted_job_id: null,
        converted_at: null,
        closeout_outcome: null,
        next_action_at: null,
        closed_at: null,
        cancelled_at: null,
        archived_at: null,
    };
}

function createSlot(overrides: Partial<DispatchWallScheduleSlot>): DispatchWallScheduleSlot {
    return {
        id: 'slot',
        company_id: 'company-1',
        service_request_id: null,
        technician_company_user_id: 'tech-1',
        start_at: null,
        end_at: null,
        arrival_window_start: null,
        arrival_window_end: null,
        status: 'scheduled',
        priority: null,
        tech_status_note: null,
        visit_outcome: null,
        visit_closed_at: null,
        updated_at: null,
        ...overrides,
    };
}

function createFutureAssignedSlot(
    requestId: string,
    overrides: Partial<DispatchWallScheduleSlot> = {}
): DispatchWallScheduleSlot {
    return createSlot({
        id: 'future-assigned-slot',
        service_request_id: requestId,
        technician_company_user_id: 'tech-2',
        status: 'scheduled',
        start_at: localIso(1, 8),
        end_at: localIso(1, 9),
        arrival_window_start: localIso(1, 8),
        arrival_window_end: localIso(1, 9),
        updated_at: localIso(0, 11),
        ...overrides,
    });
}

function createTechnician(id: string, fullName: string): DispatchWallCompanyUser {
    return {
        id,
        company_id: 'company-1',
        full_name: fullName,
        email: `${id}@example.test`,
        role: 'technician',
        status: 'active',
    };
}

function getSingleRequestItem(sections: DispatchWallSections, requestId: string) {
    const items = getRequestItems(sections, requestId);

    assert(items.length === 1, `Expected exactly one wallboard item for ${requestId}; found ${items.length}.`);

    return items[0];
}

function assertRequestNotInAnySection(sections: DispatchWallSections, requestId: string, message: string) {
    assert(getRequestItems(sections, requestId).length === 0, message);
}

function assertRequestNotInActiveSections(sections: DispatchWallSections, requestId: string, message: string) {
    const activeItems = activeSectionKeys.flatMap((sectionKey) => sections[sectionKey]).filter((item) => item.request.id === requestId);

    assert(activeItems.length === 0, message);
}

function assertRequestNotInSections(
    sections: DispatchWallSections,
    requestId: string,
    sectionKeys: DispatchWallSectionKey[],
    message: string
) {
    const sectionItems = sectionKeys.flatMap((sectionKey) => sections[sectionKey]).filter((item) => item.request.id === requestId);

    assert(sectionItems.length === 0, message);
}

function getRequestItems(sections: DispatchWallSections, requestId: string) {
    return Object.values(sections).flat().filter((item) => item.request.id === requestId);
}

function localIso(daysFromNow: number, hour: number) {
    const date = new Date(now);
    date.setDate(date.getDate() + daysFromNow);
    date.setHours(hour, 0, 0, 0);

    return date.toISOString();
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
