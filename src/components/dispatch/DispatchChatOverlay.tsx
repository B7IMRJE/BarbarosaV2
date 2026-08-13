import DictationTextInput from '@/components/input/DictationTextInput';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import Animated, {
    cancelAnimation,
    FadeIn,
    FadeOut,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import {
    DISPATCH_CHAT_REFRESH_MS,
    getDispatchChatAlertLabel,
    getDispatchChatAttentionThread,
    getDispatchChatRequestLabel,
    getDispatchChatUnreadBadge,
    loadCompanyDispatchChatInbox,
    loadServiceRequestDispatchChatMessages,
    markServiceRequestDispatchChatRead,
    sendServiceRequestDispatchChatMessage,
    type DispatchChatInboxThread,
    type DispatchChatMessage,
} from '../../lib/dispatchChat';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type DispatchChatOverlayProps = {
    companyId?: string | null;
    bottomOffset?: number;
    wallMode?: boolean;
};

export default function DispatchChatOverlay({
    companyId,
    bottomOffset = 20,
    wallMode = false,
}: DispatchChatOverlayProps) {
    const { theme } = useTheme();
    const { width } = useWindowDimensions();
    const [threads, setThreads] = useState<DispatchChatInboxThread[]>([]);
    const [activeRequestId, setActiveRequestId] = useState('');
    const [messages, setMessages] = useState<DispatchChatMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [expanded, setExpanded] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sending, setSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [backendAvailable, setBackendAvailable] = useState(true);
    const messageListRef = useRef<ScrollView>(null);
    const alertOpacity = useSharedValue(1);
    const normalizedCompanyId = String(companyId || '').trim();
    const attentionThread = useMemo(() => getDispatchChatAttentionThread(threads), [threads]);
    const activeThread = useMemo(
        () => threads.find((thread) => thread.service_request_id === activeRequestId) || attentionThread,
        [activeRequestId, attentionThread, threads]
    );
    const unreadCount = useMemo(
        () => threads.reduce((total, thread) => total + thread.unread_count, 0),
        [threads]
    );
    const hasUnread = unreadCount > 0;
    const unreadBadge = getDispatchChatUnreadBadge(unreadCount);
    const panelWidth = Math.min(Math.max(width - 24, 292), wallMode ? 430 : 390);
    const alertStyle = useAnimatedStyle(() => ({ opacity: alertOpacity.value }));

    const refreshInbox = useCallback(async () => {
        if (!normalizedCompanyId || !backendAvailable) return;

        try {
            const nextThreads = await loadCompanyDispatchChatInbox(normalizedCompanyId);
            setThreads(nextThreads);
            setBackendAvailable(true);
        } catch {
            // Keep Dispatch usable before the accompanying migration is installed.
            setBackendAvailable(false);
            setThreads([]);
        }
    }, [backendAvailable, normalizedCompanyId]);

    const openThread = useCallback(async (thread: DispatchChatInboxThread) => {
        if (!normalizedCompanyId) return;

        setActiveRequestId(thread.service_request_id);
        setExpanded(true);
        setLoadingMessages(true);
        setErrorMessage('');

        try {
            const nextMessages = await loadServiceRequestDispatchChatMessages(
                normalizedCompanyId,
                thread.service_request_id
            );
            setMessages(nextMessages);
            await markServiceRequestDispatchChatRead(normalizedCompanyId, thread.service_request_id);
            setThreads((current) => current.map((candidate) => (
                candidate.service_request_id === thread.service_request_id
                    ? { ...candidate, unread_count: 0 }
                    : candidate
            )));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Dispatch chat could not be loaded.');
        } finally {
            setLoadingMessages(false);
        }
    }, [normalizedCompanyId]);

    const refreshOpenThread = useCallback(async () => {
        if (!normalizedCompanyId || !expanded || !activeRequestId) return;

        try {
            const nextMessages = await loadServiceRequestDispatchChatMessages(
                normalizedCompanyId,
                activeRequestId
            );
            setMessages(nextMessages);
            await markServiceRequestDispatchChatRead(normalizedCompanyId, activeRequestId);
            setThreads((current) => current.map((candidate) => (
                candidate.service_request_id === activeRequestId
                    ? { ...candidate, unread_count: 0 }
                    : candidate
            )));
        } catch {
            // The current messages remain visible while the next refresh retries.
        }
    }, [activeRequestId, expanded, normalizedCompanyId]);

    useEffect(() => {
        setThreads([]);
        setMessages([]);
        setActiveRequestId('');
        setExpanded(false);
        setBackendAvailable(true);
    }, [normalizedCompanyId]);

    useEffect(() => {
        if (!normalizedCompanyId || !backendAvailable) return;

        void refreshInbox();
        const refresh = () => {
            void refreshInbox();
            void refreshOpenThread();
        };
        const channel = supabase
            .channel(`dispatch-chat-inbox:${normalizedCompanyId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'service_request_dispatch_messages',
                    filter: `company_id=eq.${normalizedCompanyId}`,
                },
                refresh
            )
            .subscribe();
        const intervalId = setInterval(refresh, DISPATCH_CHAT_REFRESH_MS);

        return () => {
            clearInterval(intervalId);
            void supabase.removeChannel(channel);
        };
    }, [backendAvailable, normalizedCompanyId, refreshInbox, refreshOpenThread]);

    useEffect(() => {
        cancelAnimation(alertOpacity);
        alertOpacity.value = hasUnread
            ? withRepeat(withTiming(0.48, { duration: 700 }), -1, true)
            : withTiming(1, { duration: 160 });

        return () => cancelAnimation(alertOpacity);
    }, [alertOpacity, hasUnread]);

    useEffect(() => {
        if (!expanded) return;
        const timeoutId = setTimeout(() => messageListRef.current?.scrollToEnd({ animated: true }), 80);

        return () => clearTimeout(timeoutId);
    }, [expanded, messages]);

    async function sendMessage() {
        const message = draft.trim();

        if (!normalizedCompanyId || !activeThread || !message || sending) return;

        setSending(true);
        setErrorMessage('');

        try {
            const saved = await sendServiceRequestDispatchChatMessage({
                companyId: normalizedCompanyId,
                serviceRequestId: activeThread.service_request_id,
                message,
            });
            setMessages((current) => [...current.filter((item) => item.id !== saved.id), saved]);
            setDraft('');
            await refreshInbox();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Message could not be sent.');
        } finally {
            setSending(false);
        }
    }

    if (!normalizedCompanyId || !backendAvailable || threads.length === 0 || !attentionThread) return null;

    return (
        <View pointerEvents="box-none" style={[styles.overlay, { bottom: bottomOffset }]}>
            {expanded && activeThread ? (
                <Animated.View
                    entering={FadeIn.duration(180)}
                    exiting={FadeOut.duration(140)}
                    style={[
                        styles.panel,
                        {
                            width: panelWidth,
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                        },
                    ]}
                >
                    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
                        <View style={styles.headerCopy}>
                            <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>DISPATCH CHAT</Text>
                            <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
                                {activeThread.technician_name}
                            </Text>
                            <Text style={[styles.meta, { color: theme.colors.mutedText }]} numberOfLines={1}>
                                {getDispatchChatRequestLabel(activeThread)}
                            </Text>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Collapse Dispatch chat"
                            onPress={() => setExpanded(false)}
                            style={({ pressed }) => [
                                styles.closeButton,
                                { backgroundColor: theme.colors.secondaryButton },
                                pressed ? styles.pressed : null,
                            ]}
                        >
                            <Text style={[styles.closeButtonText, { color: theme.colors.secondaryButtonText }]}>—</Text>
                        </Pressable>
                    </View>

                    {threads.length > 1 ? (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.threadTabs}
                        >
                            {threads.map((thread) => {
                                const selected = thread.service_request_id === activeThread.service_request_id;
                                return (
                                    <Pressable
                                        key={thread.service_request_id}
                                        accessibilityRole="button"
                                        onPress={() => void openThread(thread)}
                                        style={[
                                            styles.threadTab,
                                            {
                                                backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt,
                                                borderColor: selected ? theme.colors.primary : theme.colors.border,
                                            },
                                        ]}
                                    >
                                        <Text
                                            numberOfLines={1}
                                            style={{
                                                color: selected ? theme.colors.primaryText : theme.colors.text,
                                                fontSize: 12,
                                                fontWeight: '800',
                                            }}
                                        >
                                            {thread.technician_name}{thread.unread_count > 0 ? ` (${thread.unread_count})` : ''}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    ) : null}

                    <ScrollView
                        ref={messageListRef}
                        style={styles.messageList}
                        contentContainerStyle={styles.messageListContent}
                        keyboardShouldPersistTaps="handled"
                    >
                        {loadingMessages ? (
                            <ActivityIndicator color={theme.colors.primary} />
                        ) : messages.length === 0 ? (
                            <Text style={[styles.emptyText, { color: theme.colors.mutedText }]}>No messages yet.</Text>
                        ) : messages.map((message) => {
                            const fromDispatch = message.sender_role === 'dispatch';
                            return (
                                <View
                                    key={message.id}
                                    style={[styles.messageRow, fromDispatch ? styles.messageRowDispatch : null]}
                                >
                                    <View
                                        style={[
                                            styles.bubble,
                                            {
                                                backgroundColor: fromDispatch ? theme.colors.primary : theme.colors.surfaceAlt,
                                                borderColor: fromDispatch ? theme.colors.primary : theme.colors.border,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.sender,
                                                { color: fromDispatch ? theme.colors.primaryText : theme.colors.mutedText },
                                            ]}
                                        >
                                            {fromDispatch ? 'Dispatch' : message.sender_name}
                                        </Text>
                                        <Text
                                            selectable
                                            style={[
                                                styles.messageText,
                                                { color: fromDispatch ? theme.colors.primaryText : theme.colors.text },
                                            ]}
                                        >
                                            {message.message}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </ScrollView>

                    {!!errorMessage && (
                        <Text style={[styles.errorText, { color: theme.colors.danger }]}>{errorMessage}</Text>
                    )}
                    <View style={[styles.composer, { borderTopColor: theme.colors.border }]}>
                        <DictationTextInput
                            accessibilityLabel="Message technician"
                            value={draft}
                            onChangeText={setDraft}
                            onSubmitEditing={() => void sendMessage()}
                            placeholder="Message technician"
                            placeholderTextColor={theme.colors.mutedText}
                            returnKeyType="send"
                            maxLength={2000}
                            style={[
                                styles.input,
                                {
                                    color: theme.colors.text,
                                    backgroundColor: theme.colors.surfaceAlt,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                        />
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Send message"
                            disabled={!draft.trim() || sending}
                            onPress={() => void sendMessage()}
                            style={({ pressed }) => [
                                styles.sendButton,
                                { backgroundColor: theme.colors.primary },
                                (!draft.trim() || sending) ? styles.disabled : null,
                                pressed ? styles.pressed : null,
                            ]}
                        >
                            <Text style={[styles.sendButtonText, { color: theme.colors.primaryText }]}>
                                {sending ? '...' : 'Send'}
                            </Text>
                        </Pressable>
                    </View>
                </Animated.View>
            ) : (
                <Animated.View style={alertStyle}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={hasUnread
                            ? `${getDispatchChatAlertLabel(attentionThread)}. ${unreadCount} unread. Latest from ${attentionThread.technician_name}.`
                            : 'Open Dispatch chat'}
                        onPress={() => void openThread(attentionThread)}
                        style={({ pressed }) => [
                            styles.launcher,
                            {
                                backgroundColor: hasUnread
                                    ? theme.colors.status.needsAttention.background
                                    : theme.colors.surface,
                                borderColor: hasUnread
                                    ? theme.colors.status.needsAttention.border
                                    : theme.colors.border,
                            },
                            pressed ? styles.pressed : null,
                        ]}
                    >
                        <View style={[styles.chatGlyph, { borderColor: theme.colors.primary }]}>
                            <View style={[styles.chatGlyphTail, { borderColor: theme.colors.primary }]} />
                            <View style={styles.chatGlyphDots}>
                                <View style={[styles.chatGlyphDot, { backgroundColor: theme.colors.primary }]} />
                                <View style={[styles.chatGlyphDot, { backgroundColor: theme.colors.primary }]} />
                                <View style={[styles.chatGlyphDot, { backgroundColor: theme.colors.primary }]} />
                            </View>
                        </View>
                        {hasUnread && (
                            <View style={[styles.unreadBadge, { backgroundColor: theme.colors.danger }]}>
                                <Text style={styles.unreadBadgeText}>{unreadBadge}</Text>
                            </View>
                        )}
                    </Pressable>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        right: 12,
        zIndex: 1000,
        elevation: 18,
        alignItems: 'flex-end',
    },
    launcher: {
        width: 56,
        height: 56,
        borderWidth: 2,
        borderRadius: 18,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 18px rgba(0, 0, 0, 0.22)',
    },
    chatGlyph: {
        width: 29,
        height: 22,
        borderWidth: 2,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chatGlyphTail: {
        position: 'absolute',
        right: 3,
        bottom: -5,
        width: 8,
        height: 8,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        transform: [{ rotate: '28deg' }],
    },
    chatGlyphDots: {
        flexDirection: 'row',
        gap: 3,
    },
    chatGlyphDot: {
        width: 3,
        height: 3,
        borderRadius: 999,
    },
    unreadBadge: {
        position: 'absolute',
        top: -7,
        right: -7,
        minWidth: 22,
        height: 22,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    unreadBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '900',
        fontVariant: ['tabular-nums'],
    },
    panel: {
        maxWidth: '100%',
        height: 430,
        maxHeight: '80%',
        overflow: 'hidden',
        borderWidth: 1,
        borderRadius: 20,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 22,
        elevation: 20,
    },
    header: {
        paddingHorizontal: 15,
        paddingVertical: 12,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerCopy: {
        flex: 1,
        minWidth: 0,
    },
    eyebrow: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.2,
    },
    title: {
        fontSize: 17,
        fontWeight: '900',
    },
    meta: {
        fontSize: 11,
        fontWeight: '600',
    },
    closeButton: {
        width: 38,
        height: 34,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeButtonText: {
        fontSize: 20,
        fontWeight: '900',
        marginTop: -7,
    },
    threadTabs: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        gap: 7,
    },
    threadTab: {
        maxWidth: 150,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 7,
    },
    messageList: {
        flex: 1,
    },
    messageListContent: {
        padding: 12,
        gap: 9,
    },
    messageRow: {
        width: '100%',
        alignItems: 'flex-start',
    },
    messageRowDispatch: {
        alignItems: 'flex-end',
    },
    bubble: {
        maxWidth: '84%',
        borderWidth: 1,
        borderRadius: 15,
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
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 28,
    },
    errorText: {
        fontSize: 11,
        fontWeight: '700',
        paddingHorizontal: 12,
        paddingBottom: 4,
    },
    composer: {
        borderTopWidth: 1,
        padding: 10,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    input: {
        flex: 1,
        minWidth: 0,
        minHeight: 42,
        borderWidth: 1,
        borderRadius: 13,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 14,
    },
    sendButton: {
        minWidth: 65,
        height: 42,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    sendButtonText: {
        fontSize: 13,
        fontWeight: '900',
    },
    pressed: {
        opacity: 0.76,
    },
    disabled: {
        opacity: 0.45,
    },
});
