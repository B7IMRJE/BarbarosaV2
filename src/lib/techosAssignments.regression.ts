import {
    collapseTechOSAssignmentSlots,
    filterTechOSAssignmentSlots,
    isLiveTechOSAssignmentStatus,
    normalizeTechOSAssignmentCompanyUserIds,
    resolveTechOSAssignmentCompanyUserIds,
} from './techosAssignments';

runTechOSAssignmentRegressions();

export function runTechOSAssignmentRegressions() {
    duplicateSameAccountTechnicianRowsLoadTogether();
    primaryTechnicianIdentityStaysFirstAndDeduped();
    unrelatedTechnicianRowsStayHidden();
    assignmentSlotsFilterToVisibleTechnicianIdentities();
    liveWorkflowStatusesStayVisibleAsActiveAssignments();
    duplicateScheduleSlotsForOneRequestCollapseToCurrentVisit();
    differentRequestsRemainSeparateAfterSlotCollapse();
    olderClosedVisitCannotDuplicateNewerActiveVisit();
}

function duplicateSameAccountTechnicianRowsLoadTogether() {
    const ids = resolveTechOSAssignmentCompanyUserIds({
        companyId: 'company-1',
        primaryCompanyUserId: 'tech-current',
        eligibleCompanyUsers: [
            { id: 'tech-alias', company_id: 'company-1' },
            { id: 'tech-current', company_id: 'company-1' },
            { id: 'tech-other-company', company_id: 'company-2' },
        ],
    });

    assert(
        ids.join('|') === 'tech-current|tech-alias',
        'TechOS should query every same-account technician row for the active company.'
    );
}

function primaryTechnicianIdentityStaysFirstAndDeduped() {
    const ids = normalizeTechOSAssignmentCompanyUserIds([
        'tech-current',
        'tech-alias',
        'tech-current',
        '',
        null,
    ]);

    assert(ids.join('|') === 'tech-current|tech-alias', 'Technician id filters should be stable and deduped.');
}

function unrelatedTechnicianRowsStayHidden() {
    const ids = resolveTechOSAssignmentCompanyUserIds({
        companyId: 'company-1',
        primaryCompanyUserId: 'tech-current',
        eligibleCompanyUsers: [
            { id: 'tech-current', company_id: 'company-1' },
            { id: 'other-company-tech', company_id: 'company-2' },
        ],
    });

    assert(!ids.includes('other-company-tech'), 'TechOS should not include company-user ids from another company.');
}

function assignmentSlotsFilterToVisibleTechnicianIdentities() {
    const slots = filterTechOSAssignmentSlots(
        [
            { id: 'slot-current', company_id: 'company-1', technician_company_user_id: 'tech-current' },
            { id: 'slot-alias', company_id: 'company-1', technician_company_user_id: 'tech-alias' },
            { id: 'slot-other-tech', company_id: 'company-1', technician_company_user_id: 'other-tech' },
            { id: 'slot-other-company', company_id: 'company-2', technician_company_user_id: 'tech-current' },
        ],
        'company-1',
        ['tech-current', 'tech-alias']
    );

    assert(
        slots.map((slot) => slot.id).join('|') === 'slot-current|slot-alias',
        'TechOS should show assignments for the visible technician ids and exclude unrelated rows.'
    );
}

function liveWorkflowStatusesStayVisibleAsActiveAssignments() {
    ['on_my_way', 'arrived', 'in_progress', 'estimate_needed'].forEach((status) => {
        assert(isLiveTechOSAssignmentStatus(status), `${status} should remain visible as active TechOS work.`);
    });

    ['scheduled', 'completed', 'cancelled'].forEach((status) => {
        assert(!isLiveTechOSAssignmentStatus(status), `${status} should not be treated as a live visit status.`);
    });
}

function duplicateScheduleSlotsForOneRequestCollapseToCurrentVisit() {
    const slots = collapseTechOSAssignmentSlots([
        {
            id: 'older-scheduled-slot',
            company_id: 'company-1',
            technician_company_user_id: 'tech-current',
            service_request_id: 'request-1',
            status: 'scheduled',
            start_at: '2026-07-17T15:00:00.000Z',
            updated_at: '2026-07-17T14:00:00.000Z',
        },
        {
            id: 'current-arrived-slot',
            company_id: 'company-1',
            technician_company_user_id: 'tech-alias',
            service_request_id: 'request-1',
            status: 'arrived',
            start_at: '2026-07-17T15:00:00.000Z',
            updated_at: '2026-07-20T23:40:00.000Z',
        },
    ]);

    assert(slots.length === 1, 'TechOS should show one card per assigned service request.');
    assert(slots[0].id === 'current-arrived-slot', 'TechOS should keep the current live visit when duplicate request slots exist.');
}

function differentRequestsRemainSeparateAfterSlotCollapse() {
    const slots = collapseTechOSAssignmentSlots([
        {
            id: 'slot-a',
            company_id: 'company-1',
            technician_company_user_id: 'tech-current',
            service_request_id: 'request-a',
            status: 'on_my_way',
        },
        {
            id: 'slot-b',
            company_id: 'company-1',
            technician_company_user_id: 'tech-current',
            service_request_id: 'request-b',
            status: 'arrived',
        },
    ]);

    assert(slots.map((slot) => slot.id).join('|') === 'slot-a|slot-b', 'Distinct service requests should remain distinct jobs.');
}

function olderClosedVisitCannotDuplicateNewerActiveVisit() {
    const slots = collapseTechOSAssignmentSlots([
        {
            id: 'older-completed-slot',
            company_id: 'company-1',
            technician_company_user_id: 'tech-current',
            service_request_id: 'request-1',
            status: 'completed',
            visit_closed_at: '2026-07-17T18:00:00.000Z',
            updated_at: '2026-07-17T18:00:00.000Z',
        },
        {
            id: 'newer-active-slot',
            company_id: 'company-1',
            technician_company_user_id: 'tech-current',
            service_request_id: 'request-1',
            status: 'scheduled',
            start_at: '2026-07-20T18:00:00.000Z',
            updated_at: '2026-07-20T15:00:00.000Z',
        },
    ]);

    assert(slots.length === 1, 'Closed and active visits for one request should not create duplicate TechOS cards.');
    assert(slots[0].id === 'newer-active-slot', 'TechOS should keep the active visit instead of an older closed visit.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
