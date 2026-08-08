export function getHomeEmergencyDisplayStatus(
    emergencyStatus?: string | null,
    linkedRequestStatusKey?: string | null
) {
    const normalizedEmergencyStatus = normalizeText(emergencyStatus);
    const normalizedRequestStatus = normalizeText(linkedRequestStatusKey);

    if (normalizedEmergencyStatus === 'resolved' || normalizedRequestStatus === 'completed') {
        return 'Resolved';
    }

    if (normalizedRequestStatus === 'cancelled') return 'Cancelled';
    if (normalizedRequestStatus === 'acknowledged') return 'Acknowledged';
    if (['assigned', 'scheduled'].includes(normalizedRequestStatus)) return 'Scheduled';
    if ([
        'arrived',
        'arriving_soon',
        'delayed',
        'in_progress',
        'on_my_way',
        'waiting_for_approval',
    ].includes(normalizedRequestStatus)) {
        return 'In Progress';
    }

    if (normalizedEmergencyStatus === 'acknowledged') return 'Acknowledged';
    if (normalizedEmergencyStatus === 'in progress' || normalizedEmergencyStatus === 'in_progress') {
        return 'In Progress';
    }

    return emergencyStatus?.trim() || 'Reported';
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
