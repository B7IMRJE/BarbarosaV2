export type DispatchOfficeSectionKey =
    | 'title_company'
    | 'primary_actions'
    | 'active_jobs'
    | 'needs_office_action'
    | 'closed_archived_search';

export type DispatchOfficeActionKey = 'open_activity_board' | 'open_schedule' | 'refresh' | 'work_queue';
export type DispatchOfficeActiveFilterKey = 'all' | 'scheduled' | 'on_my_way' | 'arrived' | 'in_progress' | 'approval_needed';

export const DISPATCH_OFFICE_SECTION_ORDER: DispatchOfficeSectionKey[] = [
    'title_company',
    'primary_actions',
    'active_jobs',
    'needs_office_action',
    'closed_archived_search',
];

export const DISPATCH_OFFICE_PRIMARY_ACTIONS: Array<{ key: DispatchOfficeActionKey; label: string }> = [
    { key: 'open_activity_board', label: 'Open Live Activity Board' },
    { key: 'open_schedule', label: 'Schedule' },
    { key: 'refresh', label: 'Refresh' },
    { key: 'work_queue', label: 'Work Queue' },
];

export const DISPATCH_OFFICE_ACTIVE_FILTERS: Array<{ key: DispatchOfficeActiveFilterKey; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'on_my_way', label: 'On My Way' },
    { key: 'arrived', label: 'Arrived' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'approval_needed', label: 'Approval Needed' },
];

export function getDispatchOfficeSectionOrder() {
    return [...DISPATCH_OFFICE_SECTION_ORDER];
}

export function getDispatchOfficePrimaryActionLabels() {
    return DISPATCH_OFFICE_PRIMARY_ACTIONS.map((action) => action.label);
}

export function getDispatchOfficePrimaryActionLabel(key: DispatchOfficeActionKey) {
    return DISPATCH_OFFICE_PRIMARY_ACTIONS.find((action) => action.key === key)?.label || '';
}

export function getDispatchOfficeActiveFilterLabels() {
    return DISPATCH_OFFICE_ACTIVE_FILTERS.map((filter) => filter.label);
}

export function getDispatchOfficeActiveCardColumns(width: number) {
    if (width <= 420) return 1;
    if (width <= 900) return 2;
    if (width <= 1280) return 3;

    return 4;
}

export function getDispatchOfficeActionTileColumns(width: number) {
    return width <= 520 ? 2 : 4;
}

export function getDispatchOfficeVisibleRequestCode(displayCode?: string | null, displaySequence?: number | null) {
    const normalizedCode = String(displayCode || '').trim().toUpperCase();

    if (normalizedCode && !isInternalRequestIdentifier(normalizedCode)) return normalizedCode;
    if (typeof displaySequence === 'number' && Number.isFinite(displaySequence)) {
        return `A${String(displaySequence).padStart(4, '0')}`;
    }

    return 'Request';
}

export function isDispatchOfficeClosedArchiveCollapsedByDefault() {
    return true;
}

export function isDispatchOfficeWorkQueueGroup(group: string) {
    return ['needs_action', 'closed', 'archived'].includes(group);
}

function isInternalRequestIdentifier(value: string) {
    return (
        /^[0-9a-f]{8,}$/i.test(value) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    );
}
