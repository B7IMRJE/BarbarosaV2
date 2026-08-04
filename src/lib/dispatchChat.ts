import { supabase } from './supabase';

export const DISPATCH_CHAT_REFRESH_MS = 5_000;

export type DispatchChatMessage = {
    id: string;
    company_id: string;
    service_request_id: string;
    property_id: string;
    schedule_slot_id: string | null;
    sender_user_id: string;
    sender_company_user_id: string | null;
    sender_role: 'dispatch' | 'technician' | string;
    sender_name: string;
    message: string;
    created_at: string;
};

export type DispatchChatInboxThread = {
    service_request_id: string;
    display_code: string | null;
    issue_summary: string | null;
    technician_name: string;
    latest_message: string;
    latest_sender_role: string;
    latest_message_at: string;
    unread_count: number;
};

export async function loadCompanyDispatchChatInbox(companyId: string) {
    const normalizedCompanyId = companyId.trim();

    if (!normalizedCompanyId) return [];

    const { data, error } = await supabase.rpc('get_company_dispatch_chat_inbox', {
        p_company_id: normalizedCompanyId,
    });

    if (error) throw new Error(error.message);

    return normalizeDispatchChatInbox(data);
}

export async function loadServiceRequestDispatchChatMessages(companyId: string, serviceRequestId: string) {
    const normalizedCompanyId = companyId.trim();
    const normalizedRequestId = serviceRequestId.trim();

    if (!normalizedCompanyId || !normalizedRequestId) return [];

    const { data, error } = await supabase.rpc('get_service_request_dispatch_chat_messages', {
        p_company_id: normalizedCompanyId,
        p_service_request_id: normalizedRequestId,
    });

    if (error) throw new Error(error.message);

    return normalizeDispatchChatMessages(data);
}

export async function sendServiceRequestDispatchChatMessage(input: {
    companyId: string;
    serviceRequestId: string;
    message: string;
}) {
    const companyId = input.companyId.trim();
    const serviceRequestId = input.serviceRequestId.trim();
    const message = input.message.trim();

    if (!companyId || !serviceRequestId) {
        throw new Error('Company and service request are required.');
    }

    if (!message) throw new Error('Enter a message first.');
    if (message.length > 2000) throw new Error('Message must be 2000 characters or fewer.');

    const { data, error } = await supabase.rpc('send_service_request_dispatch_chat_message', {
        p_company_id: companyId,
        p_service_request_id: serviceRequestId,
        p_message: message,
    });

    if (error) throw new Error(error.message);

    const saved = normalizeDispatchChatMessages(data)[0];

    if (!saved) throw new Error('Dispatch chat did not return the sent message.');

    return saved;
}

export async function markServiceRequestDispatchChatRead(companyId: string, serviceRequestId: string) {
    const normalizedCompanyId = companyId.trim();
    const normalizedRequestId = serviceRequestId.trim();

    if (!normalizedCompanyId || !normalizedRequestId) return;

    const { error } = await supabase.rpc('mark_service_request_dispatch_chat_read', {
        p_company_id: normalizedCompanyId,
        p_service_request_id: normalizedRequestId,
    });

    if (error) throw new Error(error.message);
}

export function getDispatchChatAttentionThread(threads: DispatchChatInboxThread[]) {
    return [...threads].sort((first, second) => {
        if (first.unread_count !== second.unread_count) {
            return second.unread_count - first.unread_count;
        }

        return getTime(second.latest_message_at) - getTime(first.latest_message_at);
    })[0] || null;
}

export function getDispatchChatAlertLabel(thread?: DispatchChatInboxThread | null) {
    return thread && thread.unread_count > 0 ? 'Tech needs assistance' : 'Dispatch chat';
}

export function getDispatchChatRequestLabel(thread?: DispatchChatInboxThread | null) {
    if (!thread) return 'Service request';

    return thread.display_code?.trim()
        ? `Request ${thread.display_code.trim().toUpperCase()}`
        : 'Service request';
}

export function normalizeDispatchChatInbox(data: unknown): DispatchChatInboxThread[] {
    return asRows(data)
        .map((row) => ({
            service_request_id: readString(row.service_request_id),
            display_code: readOptionalString(row.display_code),
            issue_summary: readOptionalString(row.issue_summary),
            technician_name: readOptionalString(row.technician_name) || 'Technician',
            latest_message: readString(row.latest_message),
            latest_sender_role: readString(row.latest_sender_role),
            latest_message_at: readString(row.latest_message_at),
            unread_count: readNumber(row.unread_count),
        }))
        .filter((thread) => thread.service_request_id && thread.latest_message && thread.latest_message_at);
}

export function normalizeDispatchChatMessages(data: unknown): DispatchChatMessage[] {
    return asRows(data)
        .map((row) => ({
            id: readString(row.id),
            company_id: readString(row.company_id),
            service_request_id: readString(row.service_request_id),
            property_id: readString(row.property_id),
            schedule_slot_id: readOptionalString(row.schedule_slot_id),
            sender_user_id: readString(row.sender_user_id),
            sender_company_user_id: readOptionalString(row.sender_company_user_id),
            sender_role: readString(row.sender_role),
            sender_name: readOptionalString(row.sender_name) || 'Team member',
            message: readString(row.message),
            created_at: readString(row.created_at),
        }))
        .filter((message) => message.id && message.company_id && message.service_request_id && message.message);
}

function asRows(data: unknown): Array<Record<string, unknown>> {
    const rows = Array.isArray(data) ? data : data ? [data] : [];

    return rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'));
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function readNumber(value: unknown) {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
}

function getTime(value?: string | null) {
    const time = value ? Date.parse(value) : 0;

    return Number.isFinite(time) ? time : 0;
}
