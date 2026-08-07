import {
    canScheduleCrewRoleControlWorkflow,
    getCompanyScheduleCrewRoleLabel,
    getScheduleAssignedSlotIds,
    getScheduleCrewForSlot,
    getScheduleRoleForCompanyUsers,
    isOpenCompanyScheduleMeeting,
    normalizeCompanyScheduleOverview,
} from './companySchedule';

runCompanyScheduleRegressions();

export function runCompanyScheduleRegressions() {
    scheduleOverviewKeepsCrewRolesAndMeetingsSeparate();
    additionalCrewMembersReceiveTheSharedScheduleSlot();
    onlyTheLeadControlsCustomerWorkflow();
    crewRolesUseFieldFriendlyLabels();
    completedMeetingsLeaveTheOpenSchedule();
}

function scheduleOverviewKeepsCrewRolesAndMeetingsSeparate() {
    const overview = createOverview();

    assert(overview.slotAssignments.length === 3, 'All active crew assignment rows should normalize.');
    assert(overview.meetings.length === 1, 'Internal meetings should normalize independently from customer jobs.');
    assert(overview.meetings[0].attendees.length === 2, 'Every selected meeting attendee should remain visible.');
}

function additionalCrewMembersReceiveTheSharedScheduleSlot() {
    const overview = createOverview();
    const slotIds = getScheduleAssignedSlotIds(overview.slotAssignments, ['additional-tech']);

    assert(slotIds.join('|') === 'slot-1', 'An additional technician should receive the same scheduled job as the lead.');
    assert(
        getScheduleRoleForCompanyUsers(overview.slotAssignments, 'slot-1', ['additional-tech']) === 'technician',
        'The technician should see their own role on the shared job.'
    );
    assert(getScheduleCrewForSlot(overview.slotAssignments, 'slot-1')[0].role_on_schedule === 'lead', 'The lead should remain first in the crew list.');
}

function onlyTheLeadControlsCustomerWorkflow() {
    assert(canScheduleCrewRoleControlWorkflow('lead'), 'The lead should control the customer-facing job workflow.');
    ['technician', 'helper', 'observer'].forEach((role) => {
        assert(!canScheduleCrewRoleControlWorkflow(role), `${role} should not independently advance the shared customer workflow.`);
    });
}

function crewRolesUseFieldFriendlyLabels() {
    assert(getCompanyScheduleCrewRoleLabel('lead') === 'Lead technician', 'Lead labels should be explicit.');
    assert(getCompanyScheduleCrewRoleLabel('helper') === 'Helper', 'Helper should remain distinct from technician.');
    assert(getCompanyScheduleCrewRoleLabel('observer') === 'Observer', 'Observer should remain available as a non-working role.');
}

function completedMeetingsLeaveTheOpenSchedule() {
    assert(isOpenCompanyScheduleMeeting({ status: 'scheduled' }), 'Scheduled meetings should remain open.');
    assert(!isOpenCompanyScheduleMeeting({ status: 'completed' }), 'Completed meetings should leave the open schedule.');
}

function createOverview() {
    return normalizeCompanyScheduleOverview({
        slot_assignments: [
            assignment('lead-tech', 'lead'),
            assignment('additional-tech', 'technician'),
            assignment('helper-tech', 'helper'),
        ],
        meetings: [
            {
                id: 'meeting-1',
                company_id: 'company-1',
                title: 'Morning coordination',
                start_at: '2026-08-07T17:00:00.000Z',
                end_at: '2026-08-07T18:00:00.000Z',
                status: 'scheduled',
                attendees: [
                    { company_user_id: 'lead-tech', attendee_role: 'organizer', display_name: 'Lead Tech' },
                    { company_user_id: 'additional-tech', attendee_role: 'attendee', display_name: 'Second Tech' },
                ],
            },
        ],
    });
}

function assignment(companyUserId: string, role: string) {
    return {
        id: `assignment-${companyUserId}`,
        company_id: 'company-1',
        schedule_slot_id: 'slot-1',
        company_user_id: companyUserId,
        role_on_schedule: role,
        status: 'assigned',
        display_name: companyUserId,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
