import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';
import {
    getServiceRequestThreadSender,
    loadServiceRequestThread,
    sendServiceRequestThreadMessage,
    type ServiceRequestThreadViewer,
} from '../../lib/serviceRequestThreads';
import type { ServiceRequestActivityEvent } from '../../lib/serviceRequestActivity';
import { supabase } from '../../lib/supabase';

export default function ServiceRequestThread({
    companyId,
    serviceRequestId,
    scheduleSlotId = null,
    viewer,
    title = 'Job messages',
}: {
    companyId: string;
    serviceRequestId: string;
    scheduleSlotId?: string | null;
    viewer: ServiceRequestThreadViewer;
    title?: string;
}) {
    const { theme } = useTheme();
    const [messages, setMessages] = useState<ServiceRequestActivityEvent[]>([]);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState('');

    async function refreshThread(showLoading = true) {
        if (showLoading) setLoading(true);
        setMessage('');

        try {
            const nextMessages = await loadServiceRequestThread({
                companyId,
                serviceRequestId,
                viewer,
            });
            setMessages(nextMessages);
        } catch (error) {
            setMessage(getThreadErrorMessage(error));
        } finally {
            if (showLoading) setLoading(false);
        }
    }

    useEffect(() => {
        let active = true;
        setLoading(true);
        setMessage('');

        void loadServiceRequestThread({ companyId, serviceRequestId, viewer })
            .then((nextMessages) => {
                if (active) setMessages(nextMessages);
            })
            .catch((error) => {
                if (active) setMessage(getThreadErrorMessage(error));
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [companyId, serviceRequestId, viewer]);

    useEffect(() => {
        const channel = supabase
            .channel(`service-request-thread:${viewer}:${serviceRequestId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'service_request_events',
                    filter: `service_request_id=eq.${serviceRequestId}`,
                },
                () => {
                    void loadServiceRequestThread({ companyId, serviceRequestId, viewer })
                        .then(setMessages)
                        .catch((error) => setMessage(getThreadErrorMessage(error)));
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [companyId, serviceRequestId, viewer]);

    async function sendMessage() {
        if (sending) return;

        setSending(true);
        setMessage('');

        try {
            const result = await sendServiceRequestThreadMessage({
                companyId,
                serviceRequestId,
                scheduleSlotId,
                sender: viewer,
                message: draft,
            });

            if (result.status !== 'recorded' || !result.event) {
                setMessage(result.message);
                return;
            }

            setDraft('');
            setMessages((current) => [...current, result.event!]);
        } catch (error) {
            setMessage(getThreadErrorMessage(error));
        } finally {
            setSending(false);
        }
    }

    const recipient = viewer === 'technician' ? 'Office / Dispatch' : 'Technician';

    return (
        <ThemedCard style={styles.card}>
            <View style={styles.headingRow}>
                <View style={styles.headingCopy}>
                    <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
                    <Text style={[styles.subtitle, { color: theme.colors.mutedText }]}>Private job conversation with {recipient}. New messages appear here automatically.</Text>
                </View>
                <ThemedButton
                    title="Refresh"
                    variant="secondary"
                    onPress={() => void refreshThread()}
                    style={styles.refreshButton}
                    textStyle={styles.refreshText}
                />
            </View>

            {loading ? (
                <ActivityIndicator color={theme.colors.primary} style={styles.loading} />
            ) : messages.length === 0 ? (
                <Text style={[styles.empty, { color: theme.colors.mutedText }]}>No messages yet. Start the conversation when the job needs attention.</Text>
            ) : (
                <View style={styles.messageList}>
                    {messages.map((item) => {
                        const sender = getServiceRequestThreadSender(item);
                        const sentByViewer = viewer === 'technician'
                            ? sender === 'Technician'
                            : sender === 'Office / Dispatch';

                        return (
                            <View
                                key={item.id}
                                style={[
                                    styles.bubble,
                                    {
                                        alignSelf: sentByViewer ? 'flex-end' : 'flex-start',
                                        backgroundColor: sentByViewer ? theme.colors.primary : theme.colors.surfaceAlt,
                                        borderColor: sentByViewer ? theme.colors.primary : theme.colors.border,
                                    },
                                ]}
                            >
                                <Text style={[styles.sender, { color: sentByViewer ? theme.colors.primaryText : theme.colors.text }]}>
                                    {sender}
                                </Text>
                                <Text style={[styles.body, { color: sentByViewer ? theme.colors.primaryText : theme.colors.text }]}>
                                    {item.message || 'Message unavailable.'}
                                </Text>
                                <Text style={[styles.time, { color: sentByViewer ? theme.colors.primaryText : theme.colors.mutedText }]}>
                                    {formatThreadTime(item.created_at)}
                                </Text>
                            </View>
                        );
                    })}
                </View>
            )}

            {!!message && <Text style={[styles.notice, { color: theme.colors.mutedText }]}>{message}</Text>}

            <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={`Message ${recipient}`}
                placeholderTextColor={theme.colors.mutedText}
                multiline
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
            />
            <ThemedButton
                title={sending ? 'Sending...' : `Send to ${recipient}`}
                disabled={sending || !draft.trim()}
                onPress={() => void sendMessage()}
                style={styles.sendButton}
            />
        </ThemedCard>
    );
}

function getThreadErrorMessage(error: unknown) {
    const raw = error instanceof Error ? error.message : 'Thread messages could not load.';
    const normalized = raw.toLowerCase();

    if (normalized.includes('get_technician_service_request_events') || normalized.includes('could not find the function')) {
        return 'Job messaging is ready in the app, but its production database update has not been installed yet.';
    }

    return raw;
}

function formatThreadTime(value: string | null) {
    if (!value) return 'Just now';

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? 'Just now' : date.toLocaleString();
}

const styles = {
    card: { gap: 12 },
    headingRow: { flexDirection: 'row' as const, gap: 12, alignItems: 'center' as const, justifyContent: 'space-between' as const },
    headingCopy: { flex: 1, minWidth: 0 },
    title: { fontSize: 18, fontWeight: '900' as const },
    subtitle: { fontSize: 13, lineHeight: 18, marginTop: 3 },
    refreshButton: { minHeight: 36, paddingHorizontal: 10 },
    refreshText: { fontSize: 12 },
    loading: { marginVertical: 14 },
    empty: { fontSize: 14, lineHeight: 20, paddingVertical: 4 },
    messageList: { gap: 8 },
    bubble: { borderRadius: 14, borderWidth: 1, maxWidth: '88%' as const, padding: 11 },
    sender: { fontSize: 12, fontWeight: '900' as const },
    body: { fontSize: 14, lineHeight: 20, marginTop: 4 },
    time: { fontSize: 11, marginTop: 7, opacity: 0.82 },
    notice: { fontSize: 13, lineHeight: 18 },
    input: { borderRadius: 13, borderWidth: 1, fontSize: 15, lineHeight: 20, minHeight: 82, padding: 12, textAlignVertical: 'top' as const },
    sendButton: { alignSelf: 'flex-start' as const, minWidth: 156 },
};
