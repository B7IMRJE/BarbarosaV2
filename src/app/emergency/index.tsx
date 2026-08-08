import { router } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import {
    HOMEOWNER_ACTIVE_REQUEST_REFRESH_MS,
    loadActiveHomeownerRequestTrackers,
} from '../../lib/homeownerActiveRequests';
import { getHomeEmergencyDisplayStatus } from '../../lib/homeEmergencyStatus';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type EmergencyStatus = 'Reported' | 'Acknowledged' | 'In Progress' | 'Resolved';

type EmergencyRecord = {
    id: string;
    emergency_type: string;
    area: string;
    description: string;
    status: EmergencyStatus;
    created_at: string;
    photo_urls?: string[] | null;
    service_request_id?: string | null;
    service_request_status_key?: string | null;
};

function formatDate(value?: string | null) {
    if (!value) return 'Unknown';
    return new Date(value).toLocaleString();
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function getEmergencyCardStatus(emergency: EmergencyRecord) {
    return getHomeEmergencyDisplayStatus(emergency.status, emergency.service_request_status_key);
}

export default function EmergencyCenterScreen() {
    const { theme } = useTheme();
    const [emergencies, setEmergencies] = useState<EmergencyRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [activePropertyId, setActivePropertyId] = useState('');
    const loadEmergenciesEvent = useEffectEvent(loadEmergencies);

    useEffect(() => {
        void loadEmergenciesEvent();
    }, []);

    useEffect(() => {
        if (!activePropertyId) return;

        const refresh = () => {
            void loadEmergenciesEvent({ showLoading: false });
        };
        const channel = supabase
            .channel(`home-emergency-center-status:${activePropertyId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'service_request_events',
                    filter: `property_id=eq.${activePropertyId}`,
                },
                refresh
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'service_requests',
                    filter: `property_id=eq.${activePropertyId}`,
                },
                refresh
            )
            .subscribe();
        const intervalId = setInterval(refresh, HOMEOWNER_ACTIVE_REQUEST_REFRESH_MS);

        return () => {
            clearInterval(intervalId);
            void supabase.removeChannel(channel);
        };
    }, [activePropertyId]);

    async function loadEmergencies(options?: { showLoading?: boolean }) {
        if (options?.showLoading !== false) {
            setLoading(true);
        }
        setMessage('');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
            setActivePropertyId(activeProperty.propertyId);
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setEmergencies([]);
            setActivePropertyId('');
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        let queryResult: {
            data: unknown[] | null;
            error: { message: string } | null;
        } = await supabase
            .from('home_emergencies')
            .select('id, emergency_type, area, description, status, created_at, photo_urls, service_request_id')
            .eq('property_id', activeProperty.propertyId)
            .order('created_at', { ascending: false });

        if (queryResult.error && normalizeText(queryResult.error.message).includes('service_request_id')) {
            queryResult = await supabase
                .from('home_emergencies')
                .select('id, emergency_type, area, description, status, created_at, photo_urls')
                .eq('property_id', activeProperty.propertyId)
                .order('created_at', { ascending: false });
        }

        const { data, error } = queryResult;

        if (error) {
            setMessage(`Could not load emergencies: ${error.message}`);
            setEmergencies([]);
        } else {
            const emergencyRecords = (data || []) as EmergencyRecord[];
            let statusByServiceRequestId: Record<string, string> = {};

            try {
                const trackers = await loadActiveHomeownerRequestTrackers(activeProperty.propertyId);
                statusByServiceRequestId = trackers.reduce<Record<string, string>>((accumulator, tracker) => {
                    accumulator[tracker.request.id] = tracker.statusKey;
                    return accumulator;
                }, {});
            } catch {
                // The original HomeOS emergency status remains available if live Dispatch status cannot load.
            }

            setEmergencies(emergencyRecords.map((emergency) => ({
                ...emergency,
                service_request_status_key: emergency.service_request_id
                    ? statusByServiceRequestId[emergency.service_request_id] || null
                    : null,
            })));
        }

        setLoading(false);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900' }}>
                    Emergency Center
                </Text>

                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: 16,
                        lineHeight: 22,
                        marginTop: 8,
                        marginBottom: 20,
                    }}
                >
                    Document urgent home issues in HomeOS, then open an issue to send it to your provider’s Dispatch Board.
                </Text>

                <ThemedButton
                    title="Document Emergency"
                    onPress={() => router.push('/emergency/create' as any)}
                    style={{ marginBottom: 18 }}
                />

                {loading && (
                    <View style={{ padding: 24 }}>
                        <ActivityIndicator size="large" />
                    </View>
                )}

                {!!message && (
                    <ThemedCard style={{ marginBottom: 14 }}>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>
                            {message}
                        </Text>
                    </ThemedCard>
                )}

                {!loading && emergencies.length === 0 && !message && (
                    <ThemedCard>
                        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                            No emergencies reported
                        </Text>
                        <Text style={{ color: theme.colors.mutedText, marginTop: 8, lineHeight: 20 }}>
                            Use this center when something urgent needs to be documented.
                        </Text>
                    </ThemedCard>
                )}

                <View style={{ gap: 12 }}>
                    {emergencies.map((emergency) => (
                        <ThemedCard
                            key={emergency.id}
                            onPress={() => router.push(`/emergency/${emergency.id}` as any)}
                        >
                            <View
                                style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <View style={{ flex: 1, minWidth: 220 }}>
                                    <Text
                                        style={{
                                            color: theme.colors.text,
                                            fontSize: 20,
                                            fontWeight: '900',
                                        }}
                                    >
                                        {emergency.emergency_type}
                                    </Text>
                                    <Text
                                        style={{
                                            color: theme.colors.mutedText,
                                            marginTop: 6,
                                            fontWeight: '800',
                                        }}
                                    >
                                        {emergency.area} · {formatDate(emergency.created_at)}
                                    </Text>
                                    <Text
                                        style={{
                                            color: theme.colors.mutedText,
                                            marginTop: 6,
                                            fontWeight: '900',
                                        }}
                                    >
                                        {emergency.service_request_id ? 'Sent to Dispatch' : 'HomeOS only'}
                                    </Text>
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            color: theme.colors.mutedText,
                                            marginTop: 8,
                                            lineHeight: 20,
                                        }}
                                    >
                                        {emergency.description}
                                    </Text>
                                </View>

                                <View
                                    style={{
                                        backgroundColor:
                                            getEmergencyCardStatus(emergency) === 'Resolved'
                                                ? theme.colors.status.good.background
                                                : theme.colors.status.activeEmergency.background,
                                        borderColor:
                                            getEmergencyCardStatus(emergency) === 'Resolved'
                                                ? theme.colors.status.good.border
                                                : theme.colors.status.activeEmergency.border,
                                        borderWidth: 1,
                                        borderRadius: theme.radii.pill,
                                        paddingHorizontal: 12,
                                        paddingVertical: 8,
                                        alignSelf: 'flex-start',
                                    }}
                                >
                                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                                        {getEmergencyCardStatus(emergency)}
                                    </Text>
                                </View>
                            </View>
                        </ThemedCard>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
