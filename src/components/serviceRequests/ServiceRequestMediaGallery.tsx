import React, { useEffect, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, Text, View } from 'react-native';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';
import {
    loadServiceRequestAttachments,
    type ServiceRequestAttachment,
} from '../../lib/serviceRequestMedia';
import { useTheme } from '../../theme/useTheme';

type ServiceRequestMediaGalleryProps = {
    serviceRequestId?: string | null;
    title?: string;
    compact?: boolean;
};

export default function ServiceRequestMediaGallery({
    serviceRequestId,
    title = 'Photos and videos',
    compact,
}: ServiceRequestMediaGalleryProps) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [attachments, setAttachments] = useState<ServiceRequestAttachment[]>([]);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [viewerAttachment, setViewerAttachment] = useState<ServiceRequestAttachment | null>(null);

    useEffect(() => {
        void loadAttachments();
    }, [serviceRequestId]);

    async function loadAttachments() {
        const requestId = String(serviceRequestId || '').trim();

        if (!requestId) {
            setAttachments([]);
            setMessage('');
            return;
        }

        setLoading(true);
        setMessage('');

        try {
            setAttachments(await loadServiceRequestAttachments(requestId));
        } catch (error) {
            setAttachments([]);
            setMessage(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }

    async function openVideo(attachment: ServiceRequestAttachment) {
        if (!attachment.signedUrl) return;

        if (Platform.OS !== 'web') {
            await Linking.openURL(attachment.signedUrl);
        }
    }

    if (!serviceRequestId) return null;

    return (
        <ThemedCard style={{ marginTop: compact ? scaleIcon(10) : scaleIcon(14), marginBottom: compact ? scaleIcon(10) : scaleIcon(14) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: scaleIcon(10) }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.colors.text, fontSize: compact ? scaleFont(15) : scaleFont(20), fontWeight: '900' }}>
                        {title}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', marginTop: scaleIcon(3) }}>
                        {loading ? 'Loading media...' : `${attachments.length} saved attachment${attachments.length === 1 ? '' : 's'}`}
                    </Text>
                </View>
                <ThemedButton
                    title="Refresh"
                    variant="secondary"
                    onPress={loadAttachments}
                    style={{ paddingVertical: scaleIcon(8), paddingHorizontal: scaleIcon(10) }}
                    textStyle={{ fontSize: scaleFont(12) }}
                />
            </View>

            {!!message && (
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', lineHeight: scaleFont(17), marginTop: scaleIcon(8) }}>
                    {message}
                </Text>
            )}

            {!loading && attachments.length === 0 && !message && (
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', marginTop: scaleIcon(8) }}>
                    No request media saved yet.
                </Text>
            )}

            {attachments.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10), marginTop: scaleIcon(12) }}>
                    {attachments.map((attachment) => (
                        <Pressable
                            key={attachment.id}
                            accessibilityRole="button"
                            onPress={() => attachment.mediaType === 'photo' ? setViewerAttachment(attachment) : void openVideo(attachment)}
                            style={{
                                borderColor: theme.colors.border,
                                borderRadius: theme.radii.card,
                                borderWidth: 1,
                                overflow: 'hidden',
                                width: compact ? scaleIcon(150) : scaleIcon(178),
                                backgroundColor: theme.colors.surfaceAlt,
                            }}
                        >
                            <AttachmentPreview attachment={attachment} />
                            <View style={{ padding: scaleIcon(8) }}>
                                <Text style={{ color: theme.colors.text, fontSize: scaleFont(12), fontWeight: '900' }} numberOfLines={1}>
                                    {attachment.caption || attachment.fileName}
                                </Text>
                                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(11), fontWeight: '800', marginTop: scaleIcon(3) }} numberOfLines={2}>
                                    {formatMeta(attachment)}
                                </Text>
                            </View>
                        </Pressable>
                    ))}
                </View>
            )}

            <Modal visible={!!viewerAttachment} transparent animationType="fade" onRequestClose={() => setViewerAttachment(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.84)', alignItems: 'center', justifyContent: 'center', padding: scaleIcon(20) }}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Close media viewer"
                        onPress={() => setViewerAttachment(null)}
                        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                    />
                    {!!viewerAttachment?.signedUrl && (
                        <Image
                            source={{ uri: viewerAttachment.signedUrl }}
                            resizeMode="contain"
                            style={{ width: '100%', height: '82%', maxWidth: 1100 }}
                        />
                    )}
                    <ThemedButton
                        title="Close"
                        onPress={() => setViewerAttachment(null)}
                        style={{ marginTop: scaleIcon(16), paddingVertical: scaleIcon(10), paddingHorizontal: scaleIcon(18) }}
                        textStyle={{ fontSize: scaleFont(13) }}
                    />
                </View>
            </Modal>
        </ThemedCard>
    );
}

function AttachmentPreview({ attachment }: { attachment: ServiceRequestAttachment }) {
    const { scaleIcon, theme } = useTheme();
    const uri = attachment.signedUrl || '';

    if (attachment.mediaType === 'photo') {
        return (
            <Image
                source={{ uri }}
                style={{ width: '100%', height: scaleIcon(112), backgroundColor: theme.colors.surface }}
            />
        );
    }

    if (Platform.OS === 'web' && uri) {
        return (
            <View style={{ width: '100%', height: scaleIcon(112), backgroundColor: theme.colors.surface }}>
                {React.createElement('video', {
                    src: uri,
                    controls: true,
                    style: { width: '100%', height: '100%', objectFit: 'cover' },
                })}
            </View>
        );
    }

    return (
        <View style={{ height: scaleIcon(112), alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
            <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>Video</Text>
        </View>
    );
}

function formatMeta(attachment: ServiceRequestAttachment) {
    const parts = [
        attachment.mediaType === 'video' ? 'Video' : 'Photo',
        attachment.createdAt ? new Date(attachment.createdAt).toLocaleString() : '',
        attachment.uploaderName || attachment.uploaderRole || '',
    ].filter(Boolean);

    return parts.join(' / ');
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
}
