import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Linking,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import HomeHeader from '../../components/HomeHeader';
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
    user_id: string;
    property_id: string;
    system: string | null;
    area: string | null;
    item_id: string | null;
    title: string;
    description: string | null;
    service_date: string | null;
    next_service_date: string | null;
    photo_urls: string[] | null;
    document_urls: string[] | null;
    created_at: string;
    updated_at: string | null;
};

type HomeItem = {
    id: string;
    name: string;
};

function formatDate(value?: string | null) {
    if (!value) return 'Not set';
    return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function normalizeUrls(value: string[] | null) {
    return Array.isArray(value) ? value : [];
}

export default function MaintenanceDetailScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [record, setRecord] = useState<MaintenanceRecord | null>(null);
    const [item, setItem] = useState<HomeItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadRecord();
    }, [id]);

    async function loadRecord() {
        setLoading(true);
        setMessage('');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setRecord(null);
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
            .select('*')
            .eq('id', String(id))
            .eq('property_id', activeProperty.propertyId)
            .maybeSingle();

        if (error) {
            setMessage(`Could not load maintenance record: ${error.message}`);
            setRecord(null);
            setLoading(false);
            return;
        }

        if (!data) {
            setMessage('Maintenance record not found.');
            setRecord(null);
            setLoading(false);
            return;
        }

        const nextRecord = data as MaintenanceRecord;
        setRecord(nextRecord);

        if (nextRecord.item_id) {
            const { data: itemData } = await supabase
                .from('home_items')
                .select('id, name')
                .eq('id', nextRecord.item_id)
                .eq('property_id', activeProperty.propertyId)
                .maybeSingle();

            setItem((itemData as HomeItem | null) || null);
        }

        setLoading(false);
    }

    if (loading) {
        return (
            <View
                style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.background,
                }}
            >
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (!record) {
        return (
            <ScrollView
                style={{ flex: 1, backgroundColor: theme.colors.background }}
                contentContainerStyle={{ padding: 20, alignItems: 'center' }}
            >
                <View style={{ width: '100%', maxWidth: 900 }}>
                    <HomeHeader />
                    <ThemedCard>
                        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                            Maintenance record unavailable
                        </Text>
                        <Text style={{ color: theme.colors.mutedText, marginTop: 8 }}>
                            {message || 'This record could not be loaded.'}
                        </Text>
                    </ThemedCard>
                </View>
            </ScrollView>
        );
    }

    const photos = normalizeUrls(record.photo_urls);
    const documents = normalizeUrls(record.document_urls);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900' }}>
                    {record.title}
                </Text>
                <Text style={{ color: theme.colors.mutedText, marginTop: 8, marginBottom: 18, lineHeight: 22 }}>
                    Maintenance history for this home.
                </Text>

                <ThemedCard style={{ marginBottom: 14 }}>
                    <DetailRow label="System" value={record.system || 'Unknown'} />
                    <DetailRow label="Area" value={record.area || 'Unknown'} />
                    <DetailRow label="Item" value={item?.name || (record.item_id ? 'Linked item' : 'None')} />
                    <DetailRow label="Service Date" value={formatDate(record.service_date)} />
                    <DetailRow label="Next Service Date" value={formatDate(record.next_service_date)} />

                    <Text style={{ color: theme.colors.mutedText, fontWeight: '900', marginTop: 16 }}>
                        Description
                    </Text>
                    <Text style={{ color: theme.colors.text, lineHeight: 22, marginTop: 6 }}>
                        {record.description || 'No description provided.'}
                    </Text>
                </ThemedCard>

                <ThemedCard style={{ marginBottom: 14 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Photos
                    </Text>
                    {photos.length === 0 ? (
                        <Text style={{ color: theme.colors.mutedText, marginTop: 8 }}>
                            No photos attached.
                        </Text>
                    ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                            {photos.map((photoUrl) => (
                                <Image
                                    key={photoUrl}
                                    source={{ uri: photoUrl }}
                                    style={{
                                        width: 110,
                                        height: 110,
                                        borderRadius: 14,
                                        backgroundColor: theme.colors.surfaceAlt,
                                    }}
                                />
                            ))}
                        </View>
                    )}
                </ThemedCard>

                <ThemedCard>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Documents
                    </Text>
                    {documents.length === 0 ? (
                        <Text style={{ color: theme.colors.mutedText, marginTop: 8 }}>
                            No documents attached.
                        </Text>
                    ) : (
                        <View style={{ gap: 10, marginTop: 12 }}>
                            {documents.map((documentUrl, index) => (
                                <TouchableOpacity
                                    key={documentUrl}
                                    onPress={() => Linking.openURL(documentUrl)}
                                    style={{
                                        backgroundColor: theme.colors.surfaceAlt,
                                        borderRadius: 14,
                                        padding: 14,
                                    }}
                                >
                                    <Text style={{ color: theme.colors.link, fontWeight: '900' }}>
                                        Open Document {index + 1}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View style={{ marginBottom: 12 }}>
            <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>
                {label}
            </Text>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 }}>
                {value}
            </Text>
        </View>
    );
}
