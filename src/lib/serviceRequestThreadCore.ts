import type { ServiceRequestActivityEvent } from './serviceRequestActivity';

export type ServiceRequestThreadViewer = 'homeowner' | 'dispatch' | 'technician';

export function isServiceRequestThreadReadOnly(requestStatus?: string | null) {
    const status = readText(requestStatus).replace(/[\s-]+/g, '_');

    return ['cancelled', 'canceled', 'archived', 'void'].includes(status);
}

export function isServiceRequestThreadMessage(event: ServiceRequestActivityEvent) {
    const source = readText(event.metadata.source);
    const threadKind = readText(event.metadata.thread_kind);
    const type = readText(event.event_type);

    return source === 'service_request_communication_thread'
        || threadKind === 'customer_communication'
        || type === 'communication_message'
        || type === 'homeowner_note'
        || source === 'service_request_thread'
        || threadKind === 'job_message'
        || type === 'technician_message'
        || type === 'dispatch_message';
}

export function getServiceRequestThreadSender(event: ServiceRequestActivityEvent) {
    const sender = readText(event.metadata.sender_role);
    const eventType = readText(event.event_type);

    if (sender === 'homeowner' || eventType === 'homeowner_note') return 'Homeowner';
    if (sender === 'technician' || eventType === 'technician_message') return 'Technician';
    if (sender === 'dispatch' || eventType === 'dispatch_message') return 'Office / Dispatch';

    return 'Team member';
}

export function isServiceRequestThreadMessageFromViewer(
    event: ServiceRequestActivityEvent,
    viewer: ServiceRequestThreadViewer,
) {
    const sender = getServiceRequestThreadSender(event);

    if (viewer === 'homeowner') return sender === 'Homeowner';
    if (viewer === 'technician') return sender === 'Technician';

    return sender === 'Office / Dispatch';
}

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
