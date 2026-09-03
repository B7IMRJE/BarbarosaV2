import {
    getServiceRequestThreadSender,
    isServiceRequestThreadMessage,
    isServiceRequestThreadMessageFromViewer,
    isServiceRequestThreadReadOnly,
} from './serviceRequestThreadCore';
import type { ServiceRequestActivityEvent } from './serviceRequestActivity';

runServiceRequestThreadRegressions();

export function runServiceRequestThreadRegressions() {
    recognizesCustomerCommunicationMessages();
    preservesLegacyHomeownerNotes();
    calculatesMessageOwnershipForEveryViewer();
    ignoresUnrelatedTimelineUpdates();
    keepsCompletedServiceThreadsOpenForFollowUp();
}

function recognizesCustomerCommunicationMessages() {
    const event = eventRow({
        event_type: 'communication_message',
        metadata: {
            source: 'service_request_communication_thread',
            thread_kind: 'customer_communication',
            sender_role: 'dispatch',
        },
    });

    assert(isServiceRequestThreadMessage(event), 'Customer communication events must appear in the thread.');
    assert(getServiceRequestThreadSender(event) === 'Office / Dispatch', 'Dispatch messages need the correct sender label.');
}

function preservesLegacyHomeownerNotes() {
    const event = eventRow({ event_type: 'homeowner_note' });

    assert(isServiceRequestThreadMessage(event), 'Existing homeowner notes must remain visible after the thread upgrade.');
    assert(getServiceRequestThreadSender(event) === 'Homeowner', 'Existing homeowner notes must be attributed to the homeowner.');
}

function calculatesMessageOwnershipForEveryViewer() {
    const homeownerMessage = eventRow({ metadata: { sender_role: 'homeowner' } });
    const technicianMessage = eventRow({ metadata: { sender_role: 'technician' } });
    const dispatchMessage = eventRow({ metadata: { sender_role: 'dispatch' } });

    assert(isServiceRequestThreadMessageFromViewer(homeownerMessage, 'homeowner'), 'Homeowners must own their bubbles.');
    assert(isServiceRequestThreadMessageFromViewer(technicianMessage, 'technician'), 'Technicians must own their bubbles.');
    assert(isServiceRequestThreadMessageFromViewer(dispatchMessage, 'dispatch'), 'Dispatch must own its bubbles.');
    assert(!isServiceRequestThreadMessageFromViewer(dispatchMessage, 'homeowner'), 'Office messages must not render as homeowner messages.');
}

function ignoresUnrelatedTimelineUpdates() {
    assert(!isServiceRequestThreadMessage(eventRow({ event_type: 'appointment_scheduled' })), 'Status updates belong in the appointment timeline, not the conversation.');
}

function keepsCompletedServiceThreadsOpenForFollowUp() {
    assert(!isServiceRequestThreadReadOnly('completed'), 'Completed service requests must remain available for follow-up communication.');
    assert(isServiceRequestThreadReadOnly('cancelled'), 'Cancelled service requests must be read-only.');
}

function eventRow(overrides: Partial<ServiceRequestActivityEvent> = {}): ServiceRequestActivityEvent {
    return {
        id: 'event-1',
        service_request_id: 'request-1',
        company_id: 'company-1',
        property_id: 'property-1',
        event_type: 'communication_message',
        message: 'Hello',
        event_visibility: 'homeowner_visible',
        audience: 'homeowner',
        schedule_slot_id: null,
        dedupe_key: null,
        metadata: {},
        notification_status: 'pending',
        notification_channels: ['in_app'],
        read_at: null,
        notification_delivery_status: null,
        created_at: '2026-09-02T12:00:00.000Z',
        ...overrides,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`Service request thread regression failed: ${message}`);
}
