import {
    getDispatchOfficeActionTileColumns,
    getDispatchOfficeActiveCardColumns,
    getDispatchOfficeActiveFilterLabels,
    getDispatchOfficePrimaryActionLabels,
    getDispatchOfficeSectionOrder,
    getDispatchOfficeVisibleRequestCode,
    isDispatchOfficeClosedArchiveCollapsedByDefault,
    isDispatchOfficeWorkQueueGroup,
} from './dispatchOffice';

runDispatchOfficeRegressions();

export function runDispatchOfficeRegressions() {
    officePageKeepsCompactPrimaryActions();
    officePageHierarchySeparatesActiveAndOfficeAction();
    activeJobFiltersExposeCountsWithoutLongLanes();
    compactCardsUseResponsiveColumns();
    closedArchiveSearchStartsCollapsed();
    workQueueExcludesActiveJobs();
    visibleRequestCodesNeverFallbackToInternalIds();
}

function officePageKeepsCompactPrimaryActions() {
    const labels = getDispatchOfficePrimaryActionLabels();

    assert(labels.join('|') === 'Open Live Activity Board|Schedule|Refresh|Work Queue', 'Office page should expose compact primary action tiles.');
}

function officePageHierarchySeparatesActiveAndOfficeAction() {
    const order = getDispatchOfficeSectionOrder();

    assert(order.join('|') === 'title_company|primary_actions|active_jobs|needs_office_action|closed_archived_search', 'Office page should keep the intended summary hierarchy.');
    assert(order.indexOf('active_jobs') < order.indexOf('needs_office_action'), 'Active Jobs should come before office follow-up.');
    assert(order.indexOf('needs_office_action') < order.indexOf('closed_archived_search'), 'Closed and archived search should sit below office action.');
    assert(!(order as string[]).includes('dispatch_activity_board'), 'Office page should link to the Activity Board instead of embedding another wallboard.');
}

function activeJobFiltersExposeCountsWithoutLongLanes() {
    const labels = getDispatchOfficeActiveFilterLabels();

    assert(labels.join('|') === 'All|Scheduled|On My Way|Arrived|In Progress|Approval Needed', 'Active Jobs should expose compact filter chips.');
}

function compactCardsUseResponsiveColumns() {
    assert(getDispatchOfficeActionTileColumns(390) === 2, 'Phone action tiles should render in two columns.');
    assert(getDispatchOfficeActionTileColumns(900) === 4, 'Tablet and desktop action tiles should render in four columns.');
    assert(getDispatchOfficeActiveCardColumns(390) === 1, 'Phone job cards should avoid horizontal overflow.');
    assert(getDispatchOfficeActiveCardColumns(760) === 2, 'Tablet job cards should form a compact grid.');
    assert(getDispatchOfficeActiveCardColumns(1120) === 3, 'Desktop job cards should use a dense grid.');
}

function closedArchiveSearchStartsCollapsed() {
    assert(isDispatchOfficeClosedArchiveCollapsedByDefault(), 'Closed and archived records should be collapsed by default.');
}

function workQueueExcludesActiveJobs() {
    assert(isDispatchOfficeWorkQueueGroup('needs_action'), 'Needs action belongs in Work Queue.');
    assert(isDispatchOfficeWorkQueueGroup('closed'), 'Closed records belong in Work Queue.');
    assert(isDispatchOfficeWorkQueueGroup('archived'), 'Archived records belong in Work Queue.');
    assert(!isDispatchOfficeWorkQueueGroup('active'), 'Active jobs should not be duplicated in Work Queue.');
}

function visibleRequestCodesNeverFallbackToInternalIds() {
    assert(getDispatchOfficeVisibleRequestCode('A002', null) === 'A002', 'Friendly request codes should display as-is.');
    assert(getDispatchOfficeVisibleRequestCode('300D72AF', 2) === 'A0002', 'Internal short hex IDs should fall back to friendly sequence codes.');
    assert(getDispatchOfficeVisibleRequestCode('550e8400-e29b-41d4-a716-446655440000', null) === 'Request', 'UUIDs should not be displayed in office cards.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
