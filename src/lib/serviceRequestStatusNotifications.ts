export type HomeownerVisibleJobStatus =
    | 'appointment_scheduled'
    | 'technician_assigned'
    | 'technician_on_the_way'
    | 'technician_delayed'
    | 'technician_arriving_soon'
    | 'technician_arrived'
    | 'work_in_progress'
    | 'waiting_for_customer_approval'
    | 'work_completed';

export type HomeownerStatusTemplate = {
    status: HomeownerVisibleJobStatus;
    eventType: string;
    title: string;
    notifyHomeowner: boolean;
};

export type HomeownerStatusMessageInput = {
    status: string;
    technicianName?: string | null;
    etaRange?: string | null;
};

export type HomeownerAcknowledgedActivityInput = {
    serviceRequestId: string;
    requestDisplayCode?: string | null;
};

export type HomeownerAcknowledgedActivity = {
    eventType: 'request_acknowledged';
    title: 'Request Acknowledged';
    message: string;
    homeownerStatus: 'request_acknowledged';
    dedupeKey: string;
    notificationChannels: string[];
    metadata: Record<string, unknown>;
};

export type RecordServiceRequestVisitStatusInput = {
    companyId: string;
    serviceRequestId: string;
    scheduleSlotId: string;
    status: string;
    statusNote?: string | null;
    etaRange?: string | null;
    idempotencyKey?: string | null;
    metadata?: Record<string, unknown>;
};

export type ServiceRequestVisitStatusResult = {
    service_request_id: string;
    service_request_status: string;
    schedule_slot_id: string;
    schedule_slot_status: string;
    homeowner_event_id: string | null;
    homeowner_status: string | null;
    homeowner_message: string | null;
    notification_delivery_count: number;
};

export const HOMEOWNER_STATUS_NOTIFICATION_CHANNELS = ['in_app', 'push', 'sms', 'email'] as const;

const HOMEOWNER_STATUS_TEMPLATES: Record<string, HomeownerStatusTemplate> = {
    scheduled: {
        status: 'appointment_scheduled',
        eventType: 'appointment_scheduled',
        title: 'Appointment Scheduled',
        notifyHomeowner: true,
    },
    assigned: {
        status: 'technician_assigned',
        eventType: 'technician_assigned',
        title: 'Technician Assigned',
        notifyHomeowner: true,
    },
    dispatched: {
        status: 'technician_assigned',
        eventType: 'technician_assigned',
        title: 'Technician Assigned',
        notifyHomeowner: true,
    },
    on_my_way: {
        status: 'technician_on_the_way',
        eventType: 'technician_on_the_way',
        title: 'Technician On the Way',
        notifyHomeowner: true,
    },
    en_route: {
        status: 'technician_on_the_way',
        eventType: 'technician_on_the_way',
        title: 'Technician On the Way',
        notifyHomeowner: true,
    },
    running_late: {
        status: 'technician_delayed',
        eventType: 'technician_delayed',
        title: 'Technician Delayed',
        notifyHomeowner: true,
    },
    delayed: {
        status: 'technician_delayed',
        eventType: 'technician_delayed',
        title: 'Technician Delayed',
        notifyHomeowner: true,
    },
    arriving_soon: {
        status: 'technician_arriving_soon',
        eventType: 'technician_arriving_soon',
        title: 'Technician Arriving Soon',
        notifyHomeowner: true,
    },
    arrived: {
        status: 'technician_arrived',
        eventType: 'technician_arrived',
        title: 'Technician Arrived',
        notifyHomeowner: true,
    },
    in_progress: {
        status: 'work_in_progress',
        eventType: 'work_in_progress',
        title: 'Work In Progress',
        notifyHomeowner: true,
    },
    estimate_needed: {
        status: 'waiting_for_customer_approval',
        eventType: 'waiting_for_customer_approval',
        title: 'Waiting for Customer Approval',
        notifyHomeowner: true,
    },
    approval_needed: {
        status: 'waiting_for_customer_approval',
        eventType: 'waiting_for_customer_approval',
        title: 'Waiting for Customer Approval',
        notifyHomeowner: true,
    },
    completed: {
        status: 'work_completed',
        eventType: 'work_completed',
        title: 'Work Completed',
        notifyHomeowner: true,
    },
};

const INTERNAL_ONLY_STATUSES = new Set([
    'available',
    'break',
    'custom',
    'lunch',
    'office_review',
    'assistance_needed',
    'needs_assistance',
    'help_needed',
]);

export function getHomeownerStatusTemplate(status?: string | null) {
    const normalized = normalizeStatus(status);

    if (!normalized || INTERNAL_ONLY_STATUSES.has(normalized)) return null;

    return HOMEOWNER_STATUS_TEMPLATES[normalized] || null;
}

export function buildHomeownerStatusMessage(input: HomeownerStatusMessageInput) {
    const template = getHomeownerStatusTemplate(input.status);
    const technicianName = formatTechnicianName(input.technicianName);
    const etaRange = String(input.etaRange || '').trim();

    if (!template) return '';

    if (template.status === 'technician_on_the_way') {
        return etaRange
            ? `Your technician, ${technicianName}, is on the way and is expected to arrive in approximately ${etaRange}.`
            : `Your technician, ${technicianName}, is on the way.`;
    }

    if (template.status === 'technician_delayed') {
        return etaRange
            ? `Your technician has been temporarily delayed. We will update you when travel resumes. Estimated arrival: ${etaRange}.`
            : 'Your technician has been temporarily delayed. We will update you when travel resumes.';
    }

    if (template.status === 'technician_arriving_soon') {
        return `Your technician, ${technicianName}, is arriving soon.`;
    }

    if (template.status === 'technician_arrived') {
        return `Your technician, ${technicianName}, has arrived for your appointment.`;
    }

    if (template.status === 'work_in_progress') {
        return 'Work has started on your service request.';
    }

    if (template.status === 'waiting_for_customer_approval') {
        return 'Your technician has sent a recommendation that requires your approval.';
    }

    if (template.status === 'work_completed') {
        return 'Your service has been completed.';
    }

    if (template.status === 'technician_assigned') {
        return `Your technician, ${technicianName}, has been assigned.`;
    }

    return 'Your appointment has been scheduled.';
}

export function buildHomeownerAcknowledgedActivity(input: HomeownerAcknowledgedActivityInput): HomeownerAcknowledgedActivity {
    const serviceRequestId = input.serviceRequestId.trim();
    const displayCode = normalizeDisplayCode(input.requestDisplayCode);
    const requestReference = displayCode ? `Request ${displayCode}` : 'Your request';
    const message = `${requestReference} has been received. Dispatch is reviewing it and will update you when the next step is scheduled.`;

    return {
        eventType: 'request_acknowledged',
        title: 'Request Acknowledged',
        message,
        homeownerStatus: 'request_acknowledged',
        dedupeKey: `homeowner-acknowledged:${serviceRequestId}`,
        notificationChannels: [...HOMEOWNER_STATUS_NOTIFICATION_CHANNELS],
        metadata: {
            homeowner_status: 'request_acknowledged',
            homeowner_status_title: 'Request Acknowledged',
            request_display_code: displayCode || null,
            idempotency_key: `homeowner-acknowledged:${serviceRequestId}`,
        },
    };
}

export function createStatusTransitionIdempotencyKey(input: {
    scheduleSlotId: string;
    status: string;
    recipientUserId?: string | null;
    version?: string | null;
}) {
    const slotId = input.scheduleSlotId.trim();
    const status = normalizeStatus(input.status);
    const version = String(input.version || 'current').trim() || 'current';
    const recipient = String(input.recipientUserId || 'event').trim() || 'event';

    return `homeowner-status:${slotId}:${status}:${version}:${recipient}`;
}

export async function recordServiceRequestVisitStatus(
    input: RecordServiceRequestVisitStatusInput
): Promise<ServiceRequestVisitStatusResult> {
    const { supabase } = await import('./supabase');
    const companyId = input.companyId.trim();
    const serviceRequestId = input.serviceRequestId.trim();
    const scheduleSlotId = input.scheduleSlotId.trim();
    const status = normalizeStatus(input.status);

    if (!companyId || !serviceRequestId || !scheduleSlotId || !status) {
        throw new Error('Company, request, scheduled visit, and status are required.');
    }

    const { data, error } = await supabase.rpc('record_service_request_visit_status', {
        p_company_id: companyId,
        p_service_request_id: serviceRequestId,
        p_schedule_slot_id: scheduleSlotId,
        p_status: status,
        p_status_note: input.statusNote?.trim() || null,
        p_eta_range: input.etaRange?.trim() || null,
        p_idempotency_key: input.idempotencyKey?.trim() || null,
        p_metadata: input.metadata || {},
    });

    if (error) {
        throw new Error(error.message);
    }

    const result = normalizeVisitStatusResults(data)[0];

    if (!result) {
        throw new Error('Status transition did not return an updated scheduled visit.');
    }

    return result;
}

function normalizeVisitStatusResults(data: unknown): ServiceRequestVisitStatusResult[] {
    return (Array.isArray(data) ? data : data ? [data] : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                service_request_id: readString(record, 'service_request_id'),
                service_request_status: readString(record, 'service_request_status'),
                schedule_slot_id: readString(record, 'schedule_slot_id'),
                schedule_slot_status: readString(record, 'schedule_slot_status'),
                homeowner_event_id: readNullableString(record, 'homeowner_event_id'),
                homeowner_status: readNullableString(record, 'homeowner_status'),
                homeowner_message: readNullableString(record, 'homeowner_message'),
                notification_delivery_count: readNumber(record, 'notification_delivery_count'),
            };
        })
        .filter((row) => row.service_request_id && row.schedule_slot_id);
}

function formatTechnicianName(value?: string | null) {
    return String(value || '').trim() || 'your technician';
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeDisplayCode(value?: string | null) {
    return String(value || '').trim().toUpperCase();
}

function readString(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(record: Record<string, unknown>, key: string) {
    const value = readString(record, key);

    return value || null;
}

function readNumber(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
