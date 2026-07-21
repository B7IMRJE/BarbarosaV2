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

export type TechWorkflowVisibleStatusInput = {
    optimisticStatus?: string | null;
    requestStatus?: string | null;
    slotStatus?: string | null;
};

export type TechWorkflowStatusSlot = {
    id: string;
    service_request_id?: string | null;
    status?: string | null;
};

export type TechWorkflowStatusRequest = {
    status?: string | null;
};

export type TechWorkflowPersistenceResult = {
    schedule_slot_status?: string | null;
    service_request_status?: string | null;
};

export type TechOSRouteSelectionInput = {
    availableSlotIds: string[];
    dismissedSlotId: string;
    requestedSlotId: string;
    routeOpenedSlotId: string;
    selectedSlotId: string;
};

export type TechOSRouteSelectionResult = {
    dismissedSlotId: string;
    routeOpenedSlotId: string;
    selectedSlotId: string;
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

export type TechWorkflowProgressState = 'completed' | 'current' | 'next' | 'future';

export type TechWorkflowActionPresentation = TechWorkflowAction & {
    disabled: boolean;
    primary: boolean;
    progressState: TechWorkflowProgressState;
};

export type TechJobDetailSectionKey =
    | 'customer_summary'
    | 'homeowner_media'
    | 'current_job_status'
    | 'job_notes'
    | 'estimate_approval'
    | 'finish_visit'
    | 'next_job_availability';

export type NextJobAvailabilitySectionState = {
    comingSoon: boolean;
    controlsVisible: boolean;
    description: string;
    title: string;
    controlLabels: string[];
};

export const TECH_WORKFLOW_ACTIONS: TechWorkflowAction[] = [
    { key: 'on_my_way', label: 'On My Way', status: 'on_my_way' },
    { key: 'arrived', label: "I've Arrived", status: 'arrived' },
    { key: 'in_progress', label: 'Start Work', status: 'in_progress' },
    { key: 'estimate_needed', label: 'Request Approval / Create Estimate', status: 'estimate_needed' },
];

export const TECH_CUSTOM_STATUS_ACTION: TechWorkflowAction = { key: 'custom', label: 'Set custom message', status: 'custom' };

export const TECHNICIAN_NEXT_JOB_STATUS_ACTIONS: TechnicianNextJobStatusAction[] = [
    { key: 'available_for_next_job', label: 'Available After This Job' },
    { key: 'running_late_for_next_job', label: 'Running Late for Next Job' },
    { key: 'clear_next_job_delay', label: 'Clear Next-Job Delay' },
];

const TECH_JOB_DETAIL_SECTION_ORDER: TechJobDetailSectionKey[] = [
    'customer_summary',
    'homeowner_media',
    'current_job_status',
    'job_notes',
    'estimate_approval',
    'finish_visit',
    'next_job_availability',
];

export function getTechJobDetailSectionOrder() {
    return [...TECH_JOB_DETAIL_SECTION_ORDER];
}

export function getNextJobAvailabilitySectionState(): NextJobAvailabilitySectionState {
    return {
        comingSoon: true,
        controlsVisible: false,
        title: 'Next-Job Availability - Coming Soon',
        description: "This does not change the current customer's job status. It only tells Dispatch whether you can take another assignment afterward.",
        controlLabels: TECHNICIAN_NEXT_JOB_STATUS_ACTIONS.map((action) => action.label),
    };
}

export function resolveTechWorkflowActionPresentation(currentStatus?: string | null): TechWorkflowActionPresentation[] {
    const currentIndex = getTechWorkflowCurrentIndex(currentStatus);
    const isTerminal = isTerminalWorkflowStatus(currentStatus);
    const nextIndex = isTerminal || currentIndex >= TECH_WORKFLOW_ACTIONS.length - 1
        ? -1
        : Math.max(0, currentIndex + 1);

    return TECH_WORKFLOW_ACTIONS.map((action, index) => {
        const progressState = resolveWorkflowProgressState(index, currentIndex, nextIndex, isTerminal);

        return {
            ...action,
            disabled: progressState !== 'next',
            primary: progressState === 'next',
            progressState,
        };
    });
}

export function formatTechWorkflowProgressState(state: TechWorkflowProgressState) {
    const labels: Record<TechWorkflowProgressState, string> = {
        completed: 'Completed',
        current: 'Current',
        next: 'Next action',
        future: 'Future',
    };

    return labels[state];
}

export function isSecondaryTechWorkflowAction(action: TechWorkflowActionPresentation) {
    return action.progressState === 'future' && ['arrived', 'in_progress'].includes(action.key);
}

export function resolveTechWorkflowVisibleStatus({
    optimisticStatus,
    requestStatus,
    slotStatus,
}: TechWorkflowVisibleStatusInput) {
    return chooseMostAdvancedWorkflowStatus([
        optimisticStatus,
        requestStatus,
        slotStatus,
    ]);
}

export function buildTechWorkflowStatusBySlotId(
    slots: TechWorkflowStatusSlot[],
    requestsById: Record<string, TechWorkflowStatusRequest | null | undefined>,
    currentStatusBySlotId: Record<string, string> = {}
) {
    return slots.reduce<Record<string, string>>((statuses, slot) => {
        const request = slot.service_request_id ? requestsById[slot.service_request_id] : null;

        statuses[slot.id] = resolveTechWorkflowVisibleStatus({
            optimisticStatus: currentStatusBySlotId[slot.id],
            requestStatus: request?.status,
            slotStatus: slot.status,
        });

        return statuses;
    }, {});
}

export function getTechWorkflowPersistenceMismatchMessage(
    requestedStatus: string,
    result: TechWorkflowPersistenceResult
) {
    const requested = normalizeStatus(requestedStatus);
    const persisted = resolveTechWorkflowVisibleStatus({
        requestStatus: result.service_request_status,
        slotStatus: result.schedule_slot_status,
    });

    if (!requested || requested === 'custom' || !persisted || normalizeStatus(persisted) === requested) {
        return '';
    }

    return `Status update needs review: requested ${formatTechWorkflowStatusText(requested)}, but the saved state returned ${formatTechWorkflowStatusText(persisted)}. Refresh and try again.`;
}

export function formatTechWorkflowStatusText(status?: string | null) {
    const normalized = normalizeStatus(status);
    const labels: Record<string, string> = {
        acknowledged: 'Request acknowledged',
        assigned: 'Technician assigned',
        scheduled: 'Appointment scheduled',
        dispatched: 'Technician assigned',
        on_my_way: 'Technician on the way',
        arriving_soon: 'Technician arriving soon',
        arrived: 'Technician arrived',
        in_progress: 'Work in progress',
        estimate_needed: 'Waiting for approval',
        waiting_for_customer_approval: 'Waiting for approval',
        completed: 'Work completed',
        closed: 'Work completed',
        cancelled: 'Request cancelled',
        canceled: 'Request cancelled',
        archived: 'Archived',
    };

    return labels[normalized] || formatWorkflowFallbackLabel(status);
}

export function resolveTechOSRouteSelection(input: TechOSRouteSelectionInput): TechOSRouteSelectionResult {
    const availableSlotIds = new Set(input.availableSlotIds.filter(Boolean));
    const requestedSlotId = String(input.requestedSlotId || '').trim();

    if (!requestedSlotId || !availableSlotIds.has(requestedSlotId)) {
        return {
            dismissedSlotId: input.dismissedSlotId,
            routeOpenedSlotId: input.routeOpenedSlotId,
            selectedSlotId: input.selectedSlotId,
        };
    }

    const routeChanged = input.routeOpenedSlotId !== requestedSlotId;
    const dismissedCurrentRoute = input.dismissedSlotId === requestedSlotId && !routeChanged;

    if (dismissedCurrentRoute) {
        return {
            dismissedSlotId: input.dismissedSlotId,
            routeOpenedSlotId: input.routeOpenedSlotId,
            selectedSlotId: input.selectedSlotId,
        };
    }

    if (routeChanged || !input.routeOpenedSlotId) {
        return {
            dismissedSlotId: '',
            routeOpenedSlotId: requestedSlotId,
            selectedSlotId: requestedSlotId,
        };
    }

    return {
        dismissedSlotId: input.dismissedSlotId,
        routeOpenedSlotId: input.routeOpenedSlotId,
        selectedSlotId: input.selectedSlotId,
    };
}

export function getTechWorkflowStatusFeedback(status?: string | null) {
    const normalized = normalizeStatus(status);
    const messages: Record<string, string> = {
        on_my_way: 'Status updated: Technician is on the way. The homeowner and Dispatch were notified.',
        arrived: 'Status updated: Technician has arrived. The homeowner and Dispatch were notified.',
        in_progress: 'Status updated: Work has started. The homeowner and Dispatch were notified.',
        estimate_needed: 'Status updated: Approval is needed. Dispatch was marked Needs Attention. Next, open Estimate / Quote Actions to build the estimate.',
    };

    return messages[normalized] || 'Status updated. The homeowner and Dispatch were notified.';
}

export function getTechWorkflowNextStepMessage(status?: string | null) {
    const normalized = normalizeStatus(status);

    if (['estimate_needed', 'approval_needed', 'waiting_for_approval', 'waiting_for_customer_approval'].includes(normalized)) {
        return 'Next step: open Estimate / Quote Actions below to create the customer estimate. Dispatch has a Needs Attention marker while this is waiting.';
    }

    return '';
}

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
        return "Tap I've Arrived again to confirm direct arrival without On My Way.";
    }

    if (nextStatus === 'in_progress' && !['arrived', 'in_progress', 'estimate_needed'].includes(current)) {
        return "Tap Start Work again to confirm work started before I've Arrived.";
    }

    return '';
}

function getTechWorkflowCurrentIndex(currentStatus?: string | null) {
    const current = normalizeStatus(currentStatus);

    if (['on_my_way', 'arriving_soon'].includes(current)) return 0;
    if (current === 'arrived') return 1;
    if (['in_progress', 'work_started', 'working'].includes(current)) return 2;
    if (['estimate_needed', 'approval_needed', 'waiting_for_approval', 'waiting_for_customer_approval'].includes(current)) return 3;
    if (isTerminalWorkflowStatus(current)) return TECH_WORKFLOW_ACTIONS.length;

    return -1;
}

function resolveWorkflowProgressState(
    actionIndex: number,
    currentIndex: number,
    nextIndex: number,
    isTerminal: boolean
): TechWorkflowProgressState {
    if (isTerminal) return 'completed';
    if (actionIndex < currentIndex) return 'completed';
    if (actionIndex === currentIndex) return 'current';
    if (actionIndex === nextIndex) return 'next';

    return 'future';
}

function isTerminalWorkflowStatus(status?: string | null) {
    return ['completed', 'closed', 'cancelled', 'canceled', 'archived'].includes(normalizeStatus(status));
}

function chooseMostAdvancedWorkflowStatus(statuses: Array<string | null | undefined>) {
    return statuses
        .map((status, index) => ({
            index,
            normalized: normalizeStatus(status),
            status: String(status || '').trim(),
        }))
        .filter((entry) => entry.normalized)
        .sort((first, second) => (
            getWorkflowStatusRank(second.normalized) - getWorkflowStatusRank(first.normalized) ||
            first.index - second.index
        ))[0]?.normalized || '';
}

function getWorkflowStatusRank(status?: string | null) {
    const normalized = normalizeStatus(status);
    const ranks: Record<string, number> = {
        new: 0,
        open: 0,
        reported: 0,
        acknowledged: 1,
        assigned: 2,
        scheduled: 2,
        dispatched: 2,
        on_my_way: 3,
        en_route: 3,
        arriving_soon: 4,
        arrived: 5,
        in_progress: 6,
        working: 6,
        work_started: 6,
        estimate_needed: 7,
        approval_needed: 7,
        waiting_for_customer_approval: 7,
        waiting_for_approval: 7,
        completed: 8,
        closed: 8,
        cancelled: 9,
        canceled: 9,
        archived: 10,
    };

    return ranks[normalized] ?? 0;
}

function formatWorkflowFallbackLabel(status?: string | null) {
    const text = String(status || '').trim();

    if (!text) return 'Status unavailable';

    return text
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}
