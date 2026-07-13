import {
    createTechnicianNextJobStatusNotice,
    TECH_CUSTOM_STATUS_ACTION,
    TECH_WORKFLOW_ACTIONS,
    TECHNICIAN_NEXT_JOB_STATUS_ACTIONS,
    type TechnicianNextJobStatusAction,
} from './techosWorkflow';
import { buildDispatchWallSections, type DispatchWallRequest, type DispatchWallScheduleSlot } from './dispatchWallClassification';

runTechOSWorkflowRegressions();

export function runTechOSWorkflowRegressions() {
    currentJobWorkflowContainsExpectedVisitActions();
    currentJobWorkflowExcludesTechnicianLevelActions();
    technicianNextJobActionsDoNotChangeCurrentVisitStatus();
    wallboardLaneStillUsesCurrentVisitStatus();
    technicianNextJobNoticeIsScopedToTechnicianAndCompany();
    dispatchRequestsResolveOnce();
}

function currentJobWorkflowContainsExpectedVisitActions() {
    const labels = getCurrentJobWorkflowLabels();

    assert(labels.includes('On my way'), 'On My Way should remain a current-job workflow action.');
    assert(labels.includes('Arrived'), 'Arrived should remain a current-job workflow action.');
    assert(labels.includes('Started / In progress'), 'Started / In Progress should remain a current-job workflow action.');
    assert(labels.includes('Need approval / estimate needed'), 'Need Approval / Estimate Needed should remain a current-job workflow action.');
}

function currentJobWorkflowExcludesTechnicianLevelActions() {
    const labels = getCurrentJobWorkflowLabels();

    assert(!labels.includes('Available'), 'Available should be absent from current-job workflow controls.');
    assert(!labels.includes('Available for Next Job'), 'Available for Next Job should be outside current-job workflow controls.');
    assert(!labels.includes('Running Late for Next Job'), 'Running Late for Next Job should be outside current-job workflow controls.');
    assert(!labels.includes('Running late'), 'Ambiguous Running Late should be absent from current-job workflow controls.');
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

function createNotice(action: TechnicianNextJobStatusAction, currentVisitStatus: string) {
    return createTechnicianNextJobStatusNotice(action, {
        companyId: 'company-1',
        currentVisitStatus,
        technicianCompanyUserId: 'tech-1',
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
