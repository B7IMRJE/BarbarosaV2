export type TechWorkflowActionKey = 'on_my_way' | 'arrived' | 'in_progress' | 'estimate_needed' | 'custom';

export type TechWorkflowAction = {
    key: TechWorkflowActionKey;
    label: string;
    status: string;
};

export type TechWorkflowTransitionContext = {
    slotId: string | null;
    companyId: string | null;
    technicianCompanyUserId: string | null;
    requestId?: string | null;
    slotServiceRequestId?: string | null;
    currentStatus?: string | null;
    pendingConfirmationKey?: string | null;
};

export type TechWorkflowTransitionResolution = {
    canRun: boolean;
    status: string;
    serviceRequestId: string | null;
    requiresConfirmation: boolean;
    confirmationKey: string;
    message: string;
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

export function resolveTechWorkflowTransition(
    action: TechWorkflowAction,
    context: TechWorkflowTransitionContext
): TechWorkflowTransitionResolution {
    const status = normalizeStatus(action.status);
    const slotId = String(context.slotId || '').trim();
    const companyId = String(context.companyId || '').trim();
    const technicianCompanyUserId = String(context.technicianCompanyUserId || '').trim();
    const serviceRequestId = String(context.requestId || context.slotServiceRequestId || '').trim() || null;
    const confirmationKey = `${slotId}:${status}`;

    if (!slotId || !companyId || !technicianCompanyUserId) {
        return {
            canRun: false,
            status,
            serviceRequestId,
            requiresConfirmation: false,
            confirmationKey,
            message: 'Workflow update failed: assigned job context is missing.',
        };
    }

    if (status !== 'custom' && !serviceRequestId) {
        return {
            canRun: false,
            status,
            serviceRequestId,
            requiresConfirmation: false,
            confirmationKey,
            message: 'Workflow update failed: this assigned job is missing its service request.',
        };
    }

    const confirmationMessage = getWorkflowOrderingConfirmationMessage(context.currentStatus, status);

    if (confirmationMessage && context.pendingConfirmationKey !== confirmationKey) {
        return {
            canRun: false,
            status,
            serviceRequestId,
            requiresConfirmation: true,
            confirmationKey,
            message: confirmationMessage,
        };
    }

    return {
        canRun: true,
        status,
        serviceRequestId,
        requiresConfirmation: Boolean(confirmationMessage),
        confirmationKey,
        message: '',
    };
}

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

function getWorkflowOrderingConfirmationMessage(currentStatus: string | null | undefined, nextStatus: string) {
    const current = normalizeStatus(currentStatus);

    if (nextStatus === 'arrived' && !['on_my_way', 'arriving_soon', 'arrived', 'in_progress', 'estimate_needed'].includes(current)) {
        return 'Tap Arrived again to confirm direct arrival without On my way.';
    }

    if (nextStatus === 'in_progress' && !['arrived', 'in_progress', 'estimate_needed'].includes(current)) {
        return 'Tap Started / In progress again to confirm work started before Arrived.';
    }

    return '';
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}
