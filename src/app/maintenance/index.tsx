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

type MaintenanceRecord = {
    id: string;
    system: string | null;
    area: string | null;
    title: string;
    description: string | null;
    service_date: string | null;
    next_service_date: string | null;
    created_at: string;
};

function formatDate(value?: string | null) {
    if (!value) return 'Not set';
    return new Date(`${value}T00:00:00`).toLocaleDateString();
}

export default function MaintenanceCenterScreen() {
    const { theme } = useTheme();
    const [records, setRecords] = useState<MaintenanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadRecords();
    }, []);

    async function loadRecords() {
        setLoading(true);
        setMessage('');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setRecords([]);
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const { data, error } = await supabase
            .from('maintenance_records')
            .select('id, system, area, title, description, service_date, next_service_date, created_at')
            .eq('property_id', activeProperty.propertyId)
            .order('service_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (error) {
            setMessage(`Could not load maintenance records: ${error.message}`);
            setRecords([]);
        } else {
            setRecords((data || []) as MaintenanceRecord[]);
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
                    Maintenance Center
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
                    Track homeowner maintenance history, photos, documents, and future service dates.
                </Text>

                <ThemedButton
                    title="Add Maintenance Record"
                    onPress={() => router.push('/maintenance/create' as any)}
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

                {!loading && records.length === 0 && !message && (
                    <ThemedCard>
                        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                            No maintenance records yet
                        </Text>
                        <Text style={{ color: theme.colors.mutedText, marginTop: 8, lineHeight: 20 }}>
                            Add service visits, filter changes, repairs, inspections, and warranty documents here.
                        </Text>
                    </ThemedCard>
                )}

                <View style={{ gap: 12 }}>
                    {records.map((record) => (
                        <ThemedCard
                            key={record.id}
                            onPress={() => router.push(`/maintenance/${record.id}` as any)}
                        >
                            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                                {record.title}
                            </Text>
                            <Text
                                style={{
                                    color: theme.colors.mutedText,
                                    marginTop: 6,
                                    fontWeight: '800',
                                }}
                            >
                                {record.system || 'Unknown system'} · {record.area || 'Unknown area'}
                            </Text>
                            <Text style={{ color: theme.colors.mutedText, marginTop: 8 }}>
                                Service: {formatDate(record.service_date)}
                                {record.next_service_date ? ` · Next: ${formatDate(record.next_service_date)}` : ''}
                            </Text>
                            {!!record.description && (
                                <Text
                                    numberOfLines={2}
                                    style={{
                                        color: theme.colors.mutedText,
                                        marginTop: 8,
                                        lineHeight: 20,
                                    }}
                                >
                                    {record.description}
                                </Text>
                            )}
                        </ThemedCard>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
