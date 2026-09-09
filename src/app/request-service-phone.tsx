import HomeHeader from '@/components/HomeHeader';
import ServiceRequestMediaPicker from '@/components/serviceRequests/ServiceRequestMediaPicker';
import ThemedButton from '@/components/theme/ThemedButton';
import ThemedCard from '@/components/theme/ThemedCard';
import { hasUnresolvedServiceRequestMedia, type ServiceRequestMediaDraft } from '@/lib/serviceRequestMedia';
import { loadServiceRequestPhoneHandoff, uploadServiceRequestPhoneMedia } from '@/lib/serviceRequestPhoneHandoff';
import { getHomeOSVisualFoundation } from '@/theme/homeos-visual-foundation';
import { useTheme } from '@/theme/useTheme';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

export default function RequestServicePhoneScreen() {
    const params = useLocalSearchParams<{ id?: string | string[]; token?: string | string[] }>();
    const id = firstParam(params.id);
    const token = firstParam(params.token);
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const [contextLabel, setContextLabel] = useState('Service request');
    const [media, setMedia] = useState<ServiceRequestMediaDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [complete, setComplete] = useState(false);
    const [valid, setValid] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        let current = true;
        async function load() {
            try {
                if (!id || !token) throw new Error('This phone link is incomplete.');
                const handoff = await loadServiceRequestPhoneHandoff(id, token);
                if (current) {
                    setContextLabel(handoff.context_label || 'Service request');
                    setValid(true);
                }
            } catch (error) {
                if (current) setMessage(error instanceof Error ? error.message : 'This phone link could not be opened.');
            } finally {
                if (current) setLoading(false);
            }
        }
        void load();
        return () => { current = false; };
    }, [id, token]);

    async function upload() {
        if (!media.length || uploading || !id || !token) return;
        setUploading(true);
        setMessage('Sending media to your service request...');
        try {
            for (const item of media) await uploadServiceRequestPhoneMedia({ id, token }, item);
            setComplete(true);
            setMessage('Your photos and videos are now on the service request. You can return to your other device.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'The media could not be sent.');
        } finally {
            setUploading(false);
        }
    }

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: foundation.spacing.comfortable, paddingBottom: scaleIcon(48), alignItems: 'center' }}>
            <View style={{ width: '100%', maxWidth: 720, gap: foundation.spacing.regular }}>
                <HomeHeader />
                <View style={{ gap: foundation.spacing.compact }}>
                    <Text style={[foundation.typography.label, { color: theme.colors.primary, textTransform: 'uppercase' }]}>HomeOS phone capture</Text>
                    <Text style={foundation.typography.destinationTitle}>{complete ? 'Media received' : 'Take photos on this phone'}</Text>
                    <Text style={foundation.typography.body}>{contextLabel}</Text>
                </View>
                {loading ? (
                    <ThemedCard style={{ alignItems: 'center', gap: foundation.spacing.compact }}>
                        <ActivityIndicator color={theme.colors.primary} />
                        <Text style={foundation.typography.body}>Opening the secure phone link...</Text>
                    </ThemedCard>
                ) : complete ? (
                    <ThemedCard style={{ gap: foundation.spacing.compact }}>
                        <Text style={foundation.typography.containerTitle}>All set</Text>
                        <Text style={foundation.typography.body}>{message}</Text>
                    </ThemedCard>
                ) : !valid ? (
                    <ThemedCard><Text style={[foundation.typography.body, { color: theme.colors.danger }]}>{message}</Text></ThemedCard>
                ) : (
                    <ThemedCard style={{ gap: foundation.spacing.regular }}>
                        <ServiceRequestMediaPicker items={media} disabled={uploading} onChange={setMedia} onMessage={setMessage} />
                        <ThemedButton
                            title={uploading ? 'Sending...' : 'Send to my service request'}
                            disabled={!media.length || uploading || hasUnresolvedServiceRequestMedia(media)}
                            onPress={() => void upload()}
                        />
                    </ThemedCard>
                )}
                {!!message && !complete && !loading ? (
                    <ThemedCard><Text style={foundation.typography.body}>{message}</Text></ThemedCard>
                ) : null}
            </View>
        </ScrollView>
    );
}

function firstParam(value?: string | string[]) {
    return String(Array.isArray(value) ? value[0] || '' : value || '').trim();
}
