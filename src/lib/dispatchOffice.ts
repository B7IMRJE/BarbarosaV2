export type DispatchOfficeSectionKey =
    | 'title_company'
    | 'primary_actions'
    | 'active_jobs'
    | 'needs_office_action'
    | 'closed_archived_search';

export type DispatchOfficeActionKey = 'open_activity_board' | 'open_schedule' | 'refresh';

export const DISPATCH_OFFICE_SECTION_ORDER: DispatchOfficeSectionKey[] = [
    'title_company',
    'primary_actions',
    'active_jobs',
    'needs_office_action',
    'closed_archived_search',
];

export const DISPATCH_OFFICE_PRIMARY_ACTIONS: Array<{ key: DispatchOfficeActionKey; label: string }> = [
    { key: 'open_activity_board', label: 'Open Activity Board' },
    { key: 'open_schedule', label: 'Open Schedule' },
    { key: 'refresh', label: 'Refresh' },
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

export function isDispatchOfficeWorkQueueGroup(group: string) {
    return ['needs_action', 'closed', 'archived'].includes(group);
}
