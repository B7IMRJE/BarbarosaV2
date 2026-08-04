import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import {
    DISPATCH_CHAT_REFRESH_MS,
    loadServiceRequestDispatchChatMessages,
    markServiceRequestDispatchChatRead,
    sendServiceRequestDispatchChatMessage,
    type DispatchChatMessage,
} from '../../lib/dispatchChat';
import { supabase } from '../../lib/supabase';
import type { TechOSThemePalette } from '../../lib/techosAppearance';

type TechnicianDispatchChatProps = {
    companyId: string;
    serviceRequestId: string;
    techOSTheme: TechOSThemePalette;
};

export default function TechnicianDispatchChat({
    companyId,
    serviceRequestId,
    techOSTheme,
}: TechnicianDispatchChatProps) {
    const [messages, setMessages] = useState<DispatchChatMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const messageListRef = useRef<ScrollView>(null);
    const normalizedCompanyId = companyId.trim();
    const normalizedRequestId = serviceRequestId.trim();
    const accent = techOSTheme.dashboard.messages.accentColor;

    const refreshMessages = useCallback(async () => {
        if (!normalizedCompanyId || !normalizedRequestId) return;

        try {
            const nextMessages = await loadServiceRequestDispatchChatMessages(
                normalizedCompanyId,
                normalizedRequestId
            );
            setMessages(nextMessages);
            await markServiceRequestDispatchChatRead(normalizedCompanyId, normalizedRequestId);
            setErrorMessage('');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Dispatch chat could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [normalizedCompanyId, normalizedRequestId]);

    useEffect(() => {
        setLoading(true);
        void refreshMessages();

        const channel = supabase
            .channel(`technician-dispatch-chat:${normalizedCompanyId}:${normalizedRequestId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'service_request_dispatch_messages',
                    filter: `service_request_id=eq.${normalizedRequestId}`,
                },
                () => void refreshMessages()
            )
            .subscribe();
        const intervalId = setInterval(() => void refreshMessages(), DISPATCH_CHAT_REFRESH_MS);

        return () => {
            clearInterval(intervalId);
            void supabase.removeChannel(channel);
        };
    }, [normalizedCompanyId, normalizedRequestId, refreshMessages]);

    useEffect(() => {
        const timeoutId = setTimeout(() => messageListRef.current?.scrollToEnd({ animated: true }), 80);

        return () => clearTimeout(timeoutId);
    }, [messages]);

    async function sendMessage(messageOverride?: string) {
        const message = String(messageOverride ?? draft).trim();

        if (!message || sending || !normalizedCompanyId || !normalizedRequestId) return;

        setSending(true);
        setErrorMessage('');

        try {
            const saved = await sendServiceRequestDispatchChatMessage({
                companyId: normalizedCompanyId,
                serviceRequestId: normalizedRequestId,
                message,
            });
            setMessages((current) => [...current.filter((item) => item.id !== saved.id), saved]);
            if (messageOverride === undefined) setDraft('');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Message could not be sent.');
        } finally {
            setSending(false);
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.introRow}>
                <Text style={[styles.intro, { color: techOSTheme.mutedTextColor }]}>Chat directly with Dispatch for this job.</Text>
                <Pressable
                    accessibilityRole="button"
                    disabled={sending}
                    onPress={() => void sendMessage('I need assistance with this job.')}
                    style={({ pressed }) => [
                        styles.assistanceButton,
                        { borderColor: accent, backgroundColor: techOSTheme.panelBackgroundColor },
                        sending ? styles.disabled : null,
                        pressed ? styles.pressed : null,
                    ]}
                >
                    <Text style={[styles.assistanceButtonText, { color: accent }]}>Request assistance</Text>
                </Pressable>
            </View>

            <ScrollView
                ref={messageListRef}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={[
                    styles.messageList,
                    {
                        borderColor: techOSTheme.panelBorderColor,
                        backgroundColor: techOSTheme.panelBackgroundColor,
                    },
                ]}
                contentContainerStyle={styles.messageListContent}
            >
                {loading ? (
                    <ActivityIndicator color={accent} />
                ) : messages.length === 0 ? (
                    <Text style={[styles.emptyText, { color: techOSTheme.mutedTextColor }]}>No messages yet. Say hi or ask Dispatch for help.</Text>
                ) : messages.map((message) => {
                    const fromTechnician = message.sender_role === 'technician';
                    return (
                        <View
                            key={message.id}
                            style={[styles.messageRow, fromTechnician ? styles.messageRowTechnician : null]}
                        >
                            <View
                                style={[
                                    styles.bubble,
                                    {
                                        backgroundColor: fromTechnician
                                            ? techOSTheme.dashboard.messages.backgroundColor
                                            : techOSTheme.panelBackgroundColor,
                                        borderColor: fromTechnician
                                            ? techOSTheme.dashboard.messages.borderColor
                                            : techOSTheme.panelBorderColor,
                                    },
                                ]}
                            >
                                <Text style={[styles.sender, { color: fromTechnician ? accent : techOSTheme.mutedTextColor }]}>
                                    {fromTechnician ? 'You' : 'Dispatch'}
                                </Text>
                                <Text selectable style={[styles.messageText, { color: techOSTheme.textColor }]}>
                                    {message.message}
                                </Text>
                            </View>
                        </View>
                    );
                })}
            </ScrollView>

            {!!errorMessage && (
                <Text style={styles.errorText}>{errorMessage}</Text>
            )}

            <View style={styles.composer}>
                <TextInput
                    accessibilityLabel="Message Dispatch"
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={() => void sendMessage()}
                    placeholder="Type a message to Dispatch"
                    placeholderTextColor={techOSTheme.mutedTextColor}
                    returnKeyType="send"
                    maxLength={2000}
                    style={[
                        styles.input,
                        {
                            borderColor: techOSTheme.panelBorderColor,
                            backgroundColor: techOSTheme.panelBackgroundColor,
                            color: techOSTheme.textColor,
                        },
                    ]}
                />
                <Pressable
                    accessibilityRole="button"
                    disabled={!draft.trim() || sending}
                    onPress={() => void sendMessage()}
                    style={({ pressed }) => [
                        styles.sendButton,
                        { backgroundColor: accent },
                        (!draft.trim() || sending) ? styles.disabled : null,
                        pressed ? styles.pressed : null,
                    ]}
                >
                    <Text style={styles.sendButtonText}>{sending ? 'Sending...' : 'Send'}</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 10,
    },
    introRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    intro: {
        flex: 1,
        minWidth: 190,
        fontSize: 13,
        lineHeight: 18,
    },
    assistanceButton: {
        minHeight: 38,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    assistanceButtonText: {
        fontSize: 12,
        fontWeight: '900',
    },
    messageList: {
        height: 220,
        borderWidth: 1,
        borderRadius: 14,
    },
    messageListContent: {
        padding: 11,
        gap: 8,
    },
    messageRow: {
        width: '100%',
        alignItems: 'flex-start',
    },
    messageRowTechnician: {
        alignItems: 'flex-end',
    },
    bubble: {
        maxWidth: '86%',
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 11,
        paddingVertical: 8,
    },
    sender: {
        fontSize: 10,
        fontWeight: '900',
        marginBottom: 2,
    },
    messageText: {
        fontSize: 14,
        lineHeight: 19,
    },
    emptyText: {
        paddingVertical: 32,
        textAlign: 'center',
        fontSize: 13,
    },
    composer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    input: {
        flex: 1,
        minWidth: 0,
        minHeight: 44,
        borderWidth: 1,
        borderRadius: 13,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 14,
    },
    sendButton: {
        minWidth: 78,
        height: 44,
        borderRadius: 13,
        paddingHorizontal: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '900',
    },
    errorText: {
        color: '#B42318',
        fontSize: 12,
        fontWeight: '700',
    },
    pressed: {
        opacity: 0.76,
    },
    disabled: {
        opacity: 0.46,
    },
});
