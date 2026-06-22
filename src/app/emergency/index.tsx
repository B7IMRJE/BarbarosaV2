import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
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
};

function formatDate(value?: string | null) {
    if (!value) return 'Unknown';
    return new Date(value).toLocaleString();
}

export default function EmergencyCenterScreen() {
    const { theme } = useTheme();
    const [emergencies, setEmergencies] = useState<EmergencyRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadEmergencies();
    }, []);

    async function loadEmergencies() {
        setLoading(true);
        setMessage('');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setEmergencies([]);
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const { data, error } = await supabase
            .from('home_emergencies')
            .select('id, emergency_type, area, description, status, created_at, photo_urls')
            .eq('property_id', activeProperty.propertyId)
            .order('created_at', { ascending: false });

        if (error) {
            setMessage(`Could not load emergencies: ${error.message}`);
            setEmergencies([]);
        } else {
            setEmergencies((data || []) as EmergencyRecord[]);
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
                    Report urgent home issues and keep homeowner notes, photos, and status in one place.
                </Text>

                <ThemedButton
                    title="Report Emergency"
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
                                            emergency.status === 'Resolved'
                                                ? theme.colors.status.good.background
                                                : theme.colors.status.activeEmergency.background,
                                        borderColor:
                                            emergency.status === 'Resolved'
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
                                        {emergency.status}
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
