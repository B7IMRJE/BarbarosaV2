export type TechWorkflowActionKey = 'on_my_way' | 'arrived' | 'in_progress' | 'estimate_needed' | 'custom';

export type TechWorkflowAction = {
    key: TechWorkflowActionKey;
    label: string;
    status: string;
};

export type TechnicianNextJobStatusActionKey = 'available_for_next_job' | 'running_late_for_next_job' | 'clear_next_job_delay';

export type TechnicianNextJobStatusAction = {
    key: TechnicianNextJobStatusActionKey;
    label: string;
};

export type TechnicianNextJobStatusScope = {
    companyId: string;
    currentVisitStatus: string | null;
    technicianCompanyUserId: string;
};

export const TECH_WORKFLOW_ACTIONS: TechWorkflowAction[] = [
    { key: 'on_my_way', label: 'On my way', status: 'on_my_way' },
    { key: 'arrived', label: 'Arrived', status: 'arrived' },
    { key: 'in_progress', label: 'Started / In progress', status: 'in_progress' },
    { key: 'estimate_needed', label: 'Need approval / estimate needed', status: 'estimate_needed' },
];

export const TECH_CUSTOM_STATUS_ACTION: TechWorkflowAction = { key: 'custom', label: 'Set custom message', status: 'custom' };

export const TECHNICIAN_NEXT_JOB_STATUS_ACTIONS: TechnicianNextJobStatusAction[] = [
    { key: 'available_for_next_job', label: 'Available for Next Job' },
    { key: 'running_late_for_next_job', label: 'Running Late for Next Job' },
    { key: 'clear_next_job_delay', label: 'Clear Delay' },
];

export function getCurrentVisitStatusAfterTechnicianNextJobAction(
    currentVisitStatus: string | null,
    _action: TechnicianNextJobStatusAction
) {
    return currentVisitStatus;
}

export function createTechnicianNextJobStatusNotice(
    action: TechnicianNextJobStatusAction,
    scope: TechnicianNextJobStatusScope
) {
    return {
        companyId: scope.companyId,
        technicianCompanyUserId: scope.technicianCompanyUserId,
        currentVisitStatus: getCurrentVisitStatusAfterTechnicianNextJobAction(scope.currentVisitStatus, action),
        persisted: false,
        message: `${action.label} is a technician-level signal. Persistent technician availability and next-job delay storage is not connected yet, so the current job remains unchanged.`,
    };
}
