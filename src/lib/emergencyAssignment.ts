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
    emergency_acceptance_compatibility?: string | null;
    visit_closed_at?: string | null;
    visit_outcome?: string | null;
};

const CLOSED_STATUSES = new Set([
    'completed', 'complete', 'done', 'closed', 'cancelled', 'canceled', 'archived', 'void',
]);

export function hasLegacyEmergencyCompatibility(slot?: EmergencyAssignmentSlot | null) {
    return normalize(slot?.emergency_acceptance_compatibility) === 'existing_lead_activity';
}

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
    if (hasLegacyEmergencyCompatibility(slot)) return false;
    if (normalize(slot?.visit_closed_at) || normalize(slot?.visit_outcome)) return false;

    // A request-derived UI status alone is NOT evidence of lead acceptance.
    // Use the persisted compatibility decision shared with the database guard.
    return !CLOSED_STATUSES.has(normalize(slot?.status));
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

    if (isEmergencyAssignment(request, slot) && hasLegacyEmergencyCompatibility(slot)) {
        return 'Emergency · Legacy Assignment (no acceptance recorded)';
    }

    return '';
}

function normalize(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
