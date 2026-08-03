import {
    normalizeServiceRequestActivityEvents,
    recordServiceRequestEvent,
    type ServiceRequestActivityEvent,
    type ServiceRequestEventWriteResult,
} from './serviceRequestActivity';
import { supabase } from './supabase';

export type ServiceRequestThreadViewer = 'dispatch' | 'technician';

export async function loadServiceRequestThread(input: {
    companyId: string;
    serviceRequestId: string;
    viewer: ServiceRequestThreadViewer;
}): Promise<ServiceRequestActivityEvent[]> {
    const companyId = input.companyId.trim();
    const serviceRequestId = input.serviceRequestId.trim();

    if (!companyId || !serviceRequestId) return [];

    const { data, error } = await supabase.rpc(
        input.viewer === 'technician'
            ? 'get_technician_service_request_events'
            : 'get_service_request_events',
        {
            p_company_id: companyId,
            p_service_request_id: serviceRequestId,
        }
    );

    if (error) {
        throw new Error(error.message);
    }

    return normalizeServiceRequestActivityEvents(data)
        .filter(isServiceRequestThreadMessage)
        .sort((first, second) => timestamp(first.created_at) - timestamp(second.created_at));
}

export async function sendServiceRequestThreadMessage(input: {
    companyId: string;
    serviceRequestId: string;
    scheduleSlotId: string | null;
    sender: ServiceRequestThreadViewer;
    message: string;
}): Promise<ServiceRequestEventWriteResult> {
    const message = input.message.trim();

    if (!message) {
        throw new Error('Write a message before sending it.');
    }

    return recordServiceRequestEvent({
        companyId: input.companyId,
        serviceRequestId: input.serviceRequestId,
        scheduleSlotId: input.scheduleSlotId,
        eventType: `${input.sender}_message`,
        message,
        eventVisibility: 'internal',
        audience: input.sender === 'technician' ? 'dispatch' : 'technician',
        notificationChannels: ['in_app'],
        metadata: {
            source: 'service_request_thread',
            thread_kind: 'job_message',
            sender_role: input.sender,
        },
    });
}

export function isServiceRequestThreadMessage(event: ServiceRequestActivityEvent) {
    const source = readText(event.metadata.source);
    const threadKind = readText(event.metadata.thread_kind);
    const type = readText(event.event_type);

    return source === 'service_request_thread'
        || threadKind === 'job_message'
        || type === 'technician_message'
        || type === 'dispatch_message';
}

export function getServiceRequestThreadSender(event: ServiceRequestActivityEvent) {
    const sender = readText(event.metadata.sender_role);
    const eventType = readText(event.event_type);

    if (sender === 'technician' || eventType === 'technician_message') return 'Technician';
    if (sender === 'dispatch' || eventType === 'dispatch_message') return 'Office / Dispatch';

    return 'Team member';
}

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function timestamp(value: string | null) {
    const milliseconds = value ? new Date(value).getTime() : 0;

    return Number.isFinite(milliseconds) ? milliseconds : 0;
}
