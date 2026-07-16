import {
    recordServiceRequestEvent,
    type ServiceRequestEventAudience,
    type ServiceRequestEventVisibility,
    type ServiceRequestEventWriteResult,
} from './serviceRequestActivity';

export type ServiceNotificationChannel = 'in_app' | 'push' | 'email' | 'sms';

const HOMEOWNER_DELIVERY_CHANNELS: ServiceNotificationChannel[] = ['in_app', 'push', 'sms', 'email'];

export type QueueServiceNotificationInput = {
    companyId: string;
    serviceRequestId: string;
    eventType: string;
    message: string;
    audience: ServiceRequestEventAudience;
    eventVisibility?: ServiceRequestEventVisibility;
    scheduleSlotId?: string | null;
    dedupeKey?: string | null;
    channels?: ServiceNotificationChannel[];
    metadata?: Record<string, unknown>;
};

export async function queueServiceNotification(input: QueueServiceNotificationInput): Promise<ServiceRequestEventWriteResult> {
    const channels = input.channels && input.channels.length > 0 ? input.channels : ['in_app'];

    return recordServiceRequestEvent({
        companyId: input.companyId,
        serviceRequestId: input.serviceRequestId,
        eventType: input.eventType,
        message: input.message,
        audience: input.audience,
        eventVisibility: input.eventVisibility || (input.audience === 'homeowner' ? 'system_homeowner_update' : 'internal'),
        scheduleSlotId: input.scheduleSlotId,
        dedupeKey: input.dedupeKey,
        notificationChannels: channels,
        metadata: {
            notification_channels: channels,
            provider_status: 'pending_provider',
            ...input.metadata,
        },
    });
}

export async function queueHomeownerAssignmentNotification(input: {
    companyId: string;
    serviceRequestId: string;
    scheduleSlotId: string;
    companyName: string;
    technicianName: string;
    serviceDateLabel: string;
    arrivalWindowLabel: string;
    serviceAddressLabel: string;
    reassigned?: boolean;
}) {
    const message = input.reassigned
        ? `${input.companyName} updated your appointment. ${input.technicianName} is now assigned as your technician for ${input.serviceDateLabel}, ${input.arrivalWindowLabel}.`
        : `Your appointment with ${input.companyName} is scheduled for ${input.serviceDateLabel}, ${input.arrivalWindowLabel}. ${input.technicianName} has been assigned as your technician. We will notify you when they are on the way.`;

    return queueServiceNotification({
        companyId: input.companyId,
        serviceRequestId: input.serviceRequestId,
        scheduleSlotId: input.scheduleSlotId,
        eventType: input.reassigned ? 'technician_reassigned' : 'technician_assigned',
        message,
        audience: 'homeowner',
        eventVisibility: 'system_homeowner_update',
        dedupeKey: `${input.reassigned ? 'homeowner-reassigned' : 'homeowner-assigned'}:${input.scheduleSlotId}`,
        channels: HOMEOWNER_DELIVERY_CHANNELS,
        metadata: {
            company_name: input.companyName,
            technician_name: input.technicianName,
            service_date: input.serviceDateLabel,
            arrival_window: input.arrivalWindowLabel,
            service_address: input.serviceAddressLabel,
        },
    });
}

export async function queueTechnicianAssignmentNotification(input: {
    companyId: string;
    serviceRequestId: string;
    scheduleSlotId: string;
    customerName: string;
    serviceAddressLabel: string;
    serviceDateLabel: string;
    arrivalWindowLabel: string;
    estimatedDurationLabel: string;
    jobType: string;
    priority: string;
    notes?: string | null;
    removed?: boolean;
}) {
    const message = input.removed
        ? `Assignment removed: ${input.customerName} at ${input.serviceAddressLabel}.`
        : `New assignment: ${input.customerName} at ${input.serviceAddressLabel}. ${input.serviceDateLabel}, ${input.arrivalWindowLabel}. Priority: ${input.priority}.`;

    return queueServiceNotification({
        companyId: input.companyId,
        serviceRequestId: input.serviceRequestId,
        scheduleSlotId: input.scheduleSlotId,
        eventType: input.removed ? 'technician_assignment_removed' : 'technician_assignment_created',
        message,
        audience: 'technician',
        eventVisibility: 'internal',
        dedupeKey: `${input.removed ? 'tech-removed' : 'tech-assigned'}:${input.scheduleSlotId}`,
        channels: ['in_app'],
        metadata: {
            customer_name: input.customerName,
            service_address: input.serviceAddressLabel,
            service_date: input.serviceDateLabel,
            arrival_window: input.arrivalWindowLabel,
            estimated_duration: input.estimatedDurationLabel,
            job_type: input.jobType,
            priority: input.priority,
            notes: input.notes || null,
            techos_route: `/techos?companyId=${encodeURIComponent(input.companyId)}`,
        },
    });
}

export async function queueHomeownerDelayNotification(input: {
    companyId: string;
    serviceRequestId: string;
    scheduleSlotId: string;
    technicianName: string;
    arrivalWindowLabel: string;
    estimatedArrivalLabel?: string | null;
    estimatedDelayMinutes?: number | null;
}) {
    const estimatedArrival = input.estimatedArrivalLabel
        ? ` Estimated arrival: ${input.estimatedArrivalLabel}.`
        : '';
    const delay = input.estimatedDelayMinutes && input.estimatedDelayMinutes > 0
        ? ` Estimated delay: ${input.estimatedDelayMinutes} minutes.`
        : '';

    return queueServiceNotification({
        companyId: input.companyId,
        serviceRequestId: input.serviceRequestId,
        scheduleSlotId: input.scheduleSlotId,
        eventType: 'appointment_delayed',
        message: `${input.technicianName} is delayed for your appointment window (${input.arrivalWindowLabel}).${estimatedArrival}${delay}`,
        audience: 'homeowner',
        eventVisibility: 'system_homeowner_update',
        dedupeKey: `homeowner-delay:${input.scheduleSlotId}:${input.estimatedArrivalLabel || 'no-eta'}`,
        channels: HOMEOWNER_DELIVERY_CHANNELS,
        metadata: {
            technician_name: input.technicianName,
            arrival_window: input.arrivalWindowLabel,
            estimated_arrival: input.estimatedArrivalLabel || null,
            estimated_delay_minutes: input.estimatedDelayMinutes || null,
        },
    });
}

export async function queueHomeownerCompletionNotification(input: {
    companyId: string;
    serviceRequestId: string;
    scheduleSlotId: string;
    companyName: string;
    technicianName: string;
    completionDateLabel: string;
}) {
    return queueServiceNotification({
        companyId: input.companyId,
        serviceRequestId: input.serviceRequestId,
        scheduleSlotId: input.scheduleSlotId,
        eventType: 'work_completed_rating_requested',
        message: `Thank you for choosing ${input.companyName}. Your service with ${input.technicianName} has been completed. Your service summary, photos, and documents are available in HomeOS. If you have not rated your technician yet, please take a moment to share your experience.`,
        audience: 'homeowner',
        eventVisibility: 'system_homeowner_update',
        dedupeKey: `homeowner-completion:${input.scheduleSlotId}`,
        channels: HOMEOWNER_DELIVERY_CHANNELS,
        metadata: {
            company_name: input.companyName,
            technician_name: input.technicianName,
            completion_date: input.completionDateLabel,
            rating_requested: true,
        },
    });
}
