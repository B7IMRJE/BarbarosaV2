import {
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

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
