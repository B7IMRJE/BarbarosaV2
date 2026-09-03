import {
    normalizeServiceRequestActivityEvents,
    type ServiceRequestActivityEvent,
} from './serviceRequestActivity';
import { supabase } from './supabase';
import {
    isServiceRequestThreadMessage,
    type ServiceRequestThreadViewer,
} from './serviceRequestThreadCore';
export {
    getServiceRequestThreadSender,
    isServiceRequestThreadMessage,
    isServiceRequestThreadMessageFromViewer,
    isServiceRequestThreadReadOnly,
    type ServiceRequestThreadViewer,
} from './serviceRequestThreadCore';

export async function loadServiceRequestThread(input: {
    companyId: string;
    serviceRequestId: string;
    viewer: ServiceRequestThreadViewer;
}): Promise<ServiceRequestActivityEvent[]> {
    const companyId = input.companyId.trim();
    const serviceRequestId = input.serviceRequestId.trim();

    if (!companyId || !serviceRequestId) return [];

    const { data, error } = await supabase.rpc('get_service_request_communication_thread', {
        p_company_id: companyId,
        p_service_request_id: serviceRequestId,
    });

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
}): Promise<ServiceRequestActivityEvent> {
    const message = input.message.trim();

    if (!message) {
        throw new Error('Write a message before sending it.');
    }

    if (message.length > 2000) {
        throw new Error('Message must be 2,000 characters or fewer.');
    }

    const { data, error } = await supabase.rpc('send_service_request_communication_message', {
        p_company_id: input.companyId.trim(),
        p_service_request_id: input.serviceRequestId.trim(),
        p_message: message,
        p_schedule_slot_id: input.scheduleSlotId?.trim() || null,
    });

    if (error) throw new Error(error.message);

    const saved = normalizeServiceRequestActivityEvents(data)[0];

    if (!saved) throw new Error('The message was sent but could not be read.');

    return saved;
}

function timestamp(value: string | null) {
    const milliseconds = value ? new Date(value).getTime() : 0;

    return Number.isFinite(milliseconds) ? milliseconds : 0;
}
