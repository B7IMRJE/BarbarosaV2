import {
    getDispatchChatAlertLabel,
    getDispatchChatAttentionThread,
    getDispatchChatRequestLabel,
    normalizeDispatchChatInbox,
} from './dispatchChat';

runDispatchChatRegressions();

export function runDispatchChatRegressions() {
    unreadTechnicianMessageRaisesAssistanceAlert();
    latestUnreadThreadWinsAttention();
    friendlyRequestCodeIsUsed();
    databaseCountsNormalizeFromStrings();
}

function unreadTechnicianMessageRaisesAssistanceAlert() {
    const thread = threadRow({ unread_count: 1, latest_message: 'I need another set of hands.' });

    assert(getDispatchChatAlertLabel(thread) === 'Tech needs assistance', 'Unread technician text should raise the assistance alert.');
}

function latestUnreadThreadWinsAttention() {
    const attention = getDispatchChatAttentionThread([
        threadRow({ service_request_id: 'older', unread_count: 1, latest_message_at: '2026-08-03T12:00:00.000Z' }),
        threadRow({ service_request_id: 'newer', unread_count: 2, latest_message_at: '2026-08-03T12:01:00.000Z' }),
    ]);

    assert(attention?.service_request_id === 'newer', 'The thread with the most unread technician messages should get attention first.');
}

function friendlyRequestCodeIsUsed() {
    assert(getDispatchChatRequestLabel(threadRow({ display_code: 'a0042' })) === 'Request A0042', 'Chat should show the friendly request code.');
}

function databaseCountsNormalizeFromStrings() {
    const normalized = normalizeDispatchChatInbox([{
        ...threadRow(),
        unread_count: '3',
    }])[0];

    assert(normalized.unread_count === 3, 'Postgres bigint unread counts should normalize to numbers.');
}

function threadRow(overrides: Record<string, unknown> = {}) {
    return {
        service_request_id: 'request-1',
        display_code: 'A0001',
        issue_summary: 'No hot water',
        technician_name: 'Bob Tech 2',
        latest_message: 'Hi',
        latest_sender_role: 'technician',
        latest_message_at: '2026-08-03T12:00:00.000Z',
        unread_count: 0,
        ...overrides,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
