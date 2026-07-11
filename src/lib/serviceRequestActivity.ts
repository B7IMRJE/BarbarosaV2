import { supabase } from './supabase';

export type ServiceRequestEventVisibility = 'internal' | 'homeowner_visible' | 'system_homeowner_update';
export type ServiceRequestEventAudience = 'internal' | 'homeowner' | 'technician' | 'dispatch';

export type ServiceRequestActivityEvent = {
    id: string;
    service_request_id: string;
    company_id: string;
    property_id: string;
    event_type: string | null;
    message: string | null;
    event_visibility: ServiceRequestEventVisibility | string | null;
    audience: ServiceRequestEventAudience | string | null;
    schedule_slot_id: string | null;
    dedupe_key: string | null;
    metadata: Record<string, unknown>;
    notification_status: string | null;
    notification_channels: string[];
    created_at: string | null;
};

export type RecordServiceRequestEventInput = {
    companyId: string;
    serviceRequestId: string;
    eventType: string;
    message: string;
    eventVisibility?: ServiceRequestEventVisibility;
    audience?: ServiceRequestEventAudience;
    scheduleSlotId?: string | null;
    dedupeKey?: string | null;
    metadata?: Record<string, unknown>;
    notificationChannels?: string[];
};

export type ServiceRequestEventWriteResult = {
    status: 'recorded' | 'pending';
    event: ServiceRequestActivityEvent | null;
    message: string;
};

export type CustomerStatusUpdate = {
    eventType: string;
    message: string;
    shouldNotifyHomeowner: boolean;
};

const CUSTOMER_STATUS_UPDATES: Record<string, CustomerStatusUpdate> = {
    scheduled: {
        eventType: 'appointment_scheduled',
        message: 'Your appointment has been scheduled.',
        shouldNotifyHomeowner: true,
    },
    on_my_way: {
        eventType: 'technician_on_the_way',
        message: 'Your technician is on the way.',
        shouldNotifyHomeowner: true,
    },
    arrived: {
        eventType: 'technician_arrived',
        message: 'Your technician has arrived for your appointment.',
        shouldNotifyHomeowner: true,
    },
    in_progress: {
        eventType: 'work_in_progress',
        message: 'Work has started on your service request.',
        shouldNotifyHomeowner: true,
    },
    estimate_needed: {
        eventType: 'waiting_for_customer_approval',
        message: 'Your technician has sent a recommendation that requires your approval.',
        shouldNotifyHomeowner: true,
    },
    completed: {
        eventType: 'work_completed',
        message: 'Your service has been completed.',
        shouldNotifyHomeowner: true,
    },
    running_late: {
        eventType: 'appointment_delayed',
        message: 'Your technician is delayed at an earlier appointment. We will provide an updated arrival time shortly.',
        shouldNotifyHomeowner: false,
    },
    custom: {
        eventType: 'technician_update',
        message: 'Your technician has shared an update about your appointment.',
        shouldNotifyHomeowner: false,
    },
};

export function getCustomerStatusUpdate(status?: string | null, statusNote?: string | null): CustomerStatusUpdate | null {
    const normalized = normalizeStatus(status);

    if (!normalized) return null;

    if (normalized === 'custom') {
        return {
            ...CUSTOMER_STATUS_UPDATES.custom,
            message: professionalizeCustomerMessage(statusNote) || CUSTOMER_STATUS_UPDATES.custom.message,
        };
    }

    return CUSTOMER_STATUS_UPDATES[normalized] || null;
}

export async function loadHomeownerServiceRequestTimeline(serviceRequestId: string): Promise<ServiceRequestActivityEvent[]> {
    const requestId = serviceRequestId.trim();

    if (!requestId) return [];

    const { data, error } = await supabase.rpc('get_homeowner_service_request_events', {
        p_service_request_id: requestId,
    });

    if (error) {
        const normalized = normalizeStatus(error.message);

        if (isServiceRequestActivityBackendMissing(normalized)) {
            return [];
        }

        throw new Error(error.message);
    }

    return normalizeServiceRequestActivityEvents(data);
}

export async function recordServiceRequestEvent(input: RecordServiceRequestEventInput): Promise<ServiceRequestEventWriteResult> {
    const companyId = input.companyId.trim();
    const serviceRequestId = input.serviceRequestId.trim();
    const eventType = input.eventType.trim();
    const message = input.message.trim();

    if (!companyId || !serviceRequestId || !eventType || !message) {
        return {
            status: 'pending',
            event: null,
            message: 'Service request event was not recorded because required context is missing.',
        };
    }

    const { data, error } = await supabase.rpc('record_service_request_event', {
        p_company_id: companyId,
        p_service_request_id: serviceRequestId,
        p_event_type: eventType,
        p_message: message,
        p_event_visibility: input.eventVisibility || 'internal',
        p_audience: input.audience || 'internal',
        p_schedule_slot_id: input.scheduleSlotId || null,
        p_dedupe_key: input.dedupeKey || null,
        p_metadata: input.metadata || {},
        p_notification_channels: input.notificationChannels || [],
    });

    if (error) {
        const normalized = normalizeStatus(error.message);

        if (isServiceRequestActivityBackendMissing(normalized)) {
            return {
                status: 'pending',
                event: null,
                message: 'Service request event backend is not installed yet.',
            };
        }

        throw new Error(error.message);
    }

    const event = normalizeServiceRequestActivityEvents(data)[0] || null;

    return {
        status: 'recorded',
        event,
        message: 'Service request event recorded.',
    };
}

export async function recordHomeownerStatusUpdate(input: {
    companyId: string;
    serviceRequestId: string;
    scheduleSlotId: string;
    status: string;
    statusNote?: string | null;
    technicianName?: string | null;
    metadata?: Record<string, unknown>;
}) {
    const customerUpdate = getCustomerStatusUpdate(input.status, input.statusNote);

    if (!customerUpdate || !customerUpdate.shouldNotifyHomeowner) {
        return {
            status: 'pending' as const,
            event: null,
            message: 'No homeowner-visible update is needed for this status.',
        };
    }

    return recordServiceRequestEvent({
        companyId: input.companyId,
        serviceRequestId: input.serviceRequestId,
        eventType: customerUpdate.eventType,
        message: customerUpdate.message,
        eventVisibility: 'system_homeowner_update',
        audience: 'homeowner',
        scheduleSlotId: input.scheduleSlotId,
        dedupeKey: `homeowner-status:${input.scheduleSlotId}:${normalizeStatus(input.status)}`,
        metadata: {
            status: input.status,
            technician_name: input.technicianName || null,
            ...input.metadata,
        },
        notificationChannels: ['in_app'],
    });
}

export function normalizeServiceRequestActivityEvents(data: unknown): ServiceRequestActivityEvent[] {
    return (Array.isArray(data) ? data : data ? [data] : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                id: readStringField(record, 'id') || '',
                service_request_id: readStringField(record, 'service_request_id') || '',
                company_id: readStringField(record, 'company_id') || '',
                property_id: readStringField(record, 'property_id') || '',
                event_type: readStringField(record, 'event_type'),
                message: readStringField(record, 'message'),
                event_visibility: readStringField(record, 'event_visibility'),
                audience: readStringField(record, 'audience'),
                schedule_slot_id: readStringField(record, 'schedule_slot_id'),
                dedupe_key: readStringField(record, 'dedupe_key'),
                metadata: readRecordField(record, 'metadata'),
                notification_status: readStringField(record, 'notification_status'),
                notification_channels: readStringArrayField(record, 'notification_channels'),
                created_at: readStringField(record, 'created_at'),
            };
        })
        .filter((event) => event.id && event.service_request_id && event.company_id);
}

function professionalizeCustomerMessage(message?: string | null) {
    const trimmed = String(message || '').trim();
    const normalized = normalizeStatus(trimmed);

    if (!trimmed) return '';
    if (normalized.includes('need another technician')) {
        return 'An additional team member may be assisting with your service.';
    }
    if (normalized.includes('running late')) {
        return 'Your technician is delayed at an earlier appointment. We will provide an updated arrival time shortly.';
    }
    if (normalized.includes('parts') || normalized.includes('materials')) {
        return 'Your technician is coordinating parts for your service.';
    }

    return trimmed;
}

function isServiceRequestActivityBackendMissing(message: string) {
    return (
        message.includes('schema cache') ||
        message.includes('could not find the function') ||
        message.includes('record_service_request_event') ||
        message.includes('get_homeowner_service_request_events') ||
        message.includes('service_request_events') ||
        message.includes('does not exist')
    );
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function readRecordField(record: Record<string, unknown>, key: string): Record<string, unknown> {
    const value = record[key];

    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function readStringArrayField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
}
