import {
    buildDispatchWallSections,
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
    completedEmergencyVisitFromYesterdayIsExcluded();
    completedEmergencyVisitFromTodayIsClosedToday();
    olderCompletedVisitDoesNotOverrideNewerActiveVisit();
    terminalSelectedVisitDoesNotEnterActivePanels();
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

function olderCompletedVisitDoesNotOverrideNewerActiveVisit() {
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
        status: 'scheduled',
        start_at: localIso(0, 15),
        end_at: localIso(0, 16),
        arrival_window_start: localIso(0, 15),
        arrival_window_end: localIso(0, 16),
        updated_at: localIso(0, 11),
    });

    const sections = buildDispatchWallSections([request], [completedSlot, activeSlot], [], now);
    const item = getSingleRequestItem(sections, request.id);

    assert(item?.slot?.id === activeSlot.id, 'Newer active visit should remain the selected wallboard slot.');
    assert(item.sectionKey === 'assigned_ready', 'Newer active visit should control the operational classification.');
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
