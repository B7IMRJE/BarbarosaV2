import {
    getDispatchOfficePrimaryActionLabels,
    getDispatchOfficeSectionOrder,
    isDispatchOfficeWorkQueueGroup,
} from './dispatchOffice';

runDispatchOfficeRegressions();

export function runDispatchOfficeRegressions() {
    officePageKeepsActivityBoardPrimaryAction();
    officePageHierarchyDoesNotDuplicateWallboard();
    workQueueExcludesActiveJobs();
}

function officePageKeepsActivityBoardPrimaryAction() {
    const labels = getDispatchOfficePrimaryActionLabels();

    assert(labels.join('|') === 'Open Activity Board|Open Schedule|Refresh', 'Office page should expose the requested primary actions.');
}

function officePageHierarchyDoesNotDuplicateWallboard() {
    const order = getDispatchOfficeSectionOrder();

    assert(order.join('|') === 'title_company|primary_actions|active_jobs|needs_office_action|closed_archived_search', 'Office page should keep the intended summary hierarchy.');
    assert(order.indexOf('active_jobs') < order.indexOf('needs_office_action'), 'Active Jobs should come before office follow-up.');
    assert(!(order as string[]).includes('dispatch_activity_board'), 'Office page should link to the Activity Board instead of embedding another wallboard.');
}

function workQueueExcludesActiveJobs() {
    assert(isDispatchOfficeWorkQueueGroup('needs_action'), 'Needs action belongs in Work Queue.');
    assert(isDispatchOfficeWorkQueueGroup('closed'), 'Closed records belong in Work Queue.');
    assert(isDispatchOfficeWorkQueueGroup('archived'), 'Archived records belong in Work Queue.');
    assert(!isDispatchOfficeWorkQueueGroup('active'), 'Active jobs should not be duplicated in Work Queue.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
