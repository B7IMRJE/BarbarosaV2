export type EmergencyAssignmentRequest = {
    request_type?: string | null;
    priority?: string | null;
    issue_summary?: string | null;
};

export type EmergencyAssignmentSlot = {
    technician_company_user_id?: string | null;
    priority?: string | null;
    status?: string | null;
    technician_acknowledged_at?: string | null;
};

const PRE_ACCEPTANCE_STATUSES = new Set([
    '',
    'tentative',
    'scheduled',
    'assigned',
    'dispatched',
]);

export function isEmergencyAssignment(
    request?: EmergencyAssignmentRequest | null,
    slot?: EmergencyAssignmentSlot | null
) {
    const requestType = normalize(request?.request_type);
    const requestPriority = normalize(request?.priority);
    const slotPriority = normalize(slot?.priority);
    const summary = normalize(request?.issue_summary);

    return requestType === 'emergency' ||
        requestPriority === 'emergency' ||
        slotPriority === 'emergency' ||
        summary.includes('emergency');
}

export function isEmergencyAssignmentAwaitingTechnician(
    request?: EmergencyAssignmentRequest | null,
    slot?: EmergencyAssignmentSlot | null
) {
    if (!isEmergencyAssignment(request, slot)) return false;
    if (!normalize(slot?.technician_company_user_id)) return false;
    if (normalize(slot?.technician_acknowledged_at)) return false;

    // Operational states are historical evidence that a technician already
    // acted on a legacy assignment. The database migration records that
    // evidence so new assignments cannot reach these states without accepting.
    return PRE_ACCEPTANCE_STATUSES.has(normalize(slot?.status));
}

export function getEmergencyAssignmentAcceptanceLabel(
    request?: EmergencyAssignmentRequest | null,
    slot?: EmergencyAssignmentSlot | null
) {
    if (isEmergencyAssignmentAwaitingTechnician(request, slot)) {
        return 'Emergency · Awaiting Tech Acceptance';
    }

    if (isEmergencyAssignment(request, slot) && normalize(slot?.technician_acknowledged_at)) {
        return 'Emergency · Technician Accepted';
    }

    return '';
}

function normalize(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
