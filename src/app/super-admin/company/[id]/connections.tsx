import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type PropertyConnection = {
    id: string;
    property_id: string;
    company_id: string;
    status: string | null;
    can_view_documents: boolean | null;
    can_view_photos: boolean | null;
    can_view_service_history: boolean | null;
    can_view_quotes: boolean | null;
    created_at: string | null;
    expires_at: string | null;
};

type PropertyRecord = {
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
};

export default function CompanyConnectionsScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [connections, setConnections] = useState<PropertyConnection[]>([]);
    const [propertiesById, setPropertiesById] = useState<Record<string, PropertyRecord>>({});
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadConnections();
    }, [id]);

    const connectedProperties = useMemo(
        () => connections.filter((connection) => normalizeStatus(connection.status) === 'connected'),
        [connections]
    );
    const pendingRequests = useMemo(
        () => connections.filter((connection) => normalizeStatus(connection.status) === 'pending'),
        [connections]
    );

    async function loadConnections() {
        if (!id) {
            setMessage('Missing company id.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setMessage('');

        const { data, error } = await supabase
            .from('property_connections')
            .select(
                'id, property_id, company_id, status, can_view_documents, can_view_photos, can_view_service_history, can_view_quotes, created_at, expires_at'
            )
            .eq('company_id', String(id))
            .order('created_at', { ascending: false });

        if (error) {
            setLoading(false);
            setMessage(`Could not load company connections: ${error.message}`);
            return;
        }

        const loadedConnections = (data || []) as PropertyConnection[];
        setConnections(loadedConnections);
        await loadProperties(loadedConnections);
        setLoading(false);
    }

    async function loadProperties(loadedConnections: PropertyConnection[]) {
        const propertyIds = Array.from(
            new Set(loadedConnections.map((connection) => connection.property_id).filter(Boolean))
        );

        if (propertyIds.length === 0) {
            setPropertiesById({});
            return;
        }

        const { data } = await supabase
            .from('properties')
            .select('id, name, address, city, state, zip')
            .in('id', propertyIds);

        const nextPropertiesById = ((data || []) as PropertyRecord[]).reduce<Record<string, PropertyRecord>>(
            (accumulator, property) => {
                accumulator[property.id] = property;
                return accumulator;
            },
            {}
        );

        setPropertiesById(nextPropertiesById);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <Text
                    onPress={() => router.push(`/super-admin/company/${id}` as any)}
                    style={[backTextStyle, { color: theme.colors.text }]}
                >
                    Back
                </Text>

                <Text style={[titleStyle, { color: theme.colors.text }]}>Company Connections</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Review homeowner property connection requests for this company.
                </Text>

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading connections...</Text>
                    </ThemedCard>
                ) : connections.length === 0 ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Empty state</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            Connected properties and pending requests will appear here.
                        </Text>
                    </ThemedCard>
                ) : (
                    <>
                        <ConnectionSection
                            title="Connected Properties"
                            connections={connectedProperties}
                            propertiesById={propertiesById}
                            emptyText="No connected properties yet."
                        />

                        <ConnectionSection
                            title="Pending Requests"
                            connections={pendingRequests}
                            propertiesById={propertiesById}
                            emptyText="No pending requests."
                        />
                    </>
                )}

                {!!message && (
                    <ThemedCard style={{ marginTop: 16 }}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function ConnectionSection({
    title,
    connections,
    propertiesById,
    emptyText,
}: {
    title: string;
    connections: PropertyConnection[];
    propertiesById: Record<string, PropertyRecord>;
    emptyText: string;
}) {
    const { theme } = useTheme();

    return (
        <View style={sectionStyle}>
            <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>{title}</Text>
            <View style={listStyle}>
                {connections.length === 0 ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{emptyText}</Text>
                    </ThemedCard>
                ) : (
                    connections.map((connection) => {
                        const property = propertiesById[connection.property_id];

                        return (
                            <ThemedCard key={connection.id}>
                                <Text style={[cardTitleStyle, { color: theme.colors.text }]}>
                                    {property?.name || 'Property'}
                                </Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Status: {normalizeStatus(connection.status)}
                                </Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    {formatAddress(property) || `Property ID: ${connection.property_id}`}
                                </Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Photos: {connection.can_view_photos ? 'Shared' : 'Private'}
                                    {' | '}Documents: {connection.can_view_documents ? 'Shared' : 'Private'}
                                </Text>
                            </ThemedCard>
                        );
                    })
                )}
            </View>
        </View>
    );
}

function formatAddress(property?: PropertyRecord) {
    if (!property) return '';

    return [property.address, property.city, property.state, property.zip]
        .filter(Boolean)
        .join(', ');
}

function normalizeStatus(status: string | null) {
    return String(status || 'pending').trim().toLowerCase();
}

const backTextStyle = {
    marginTop: 20,
    marginBottom: 20,
    fontSize: 18,
    fontWeight: '900' as const,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    fontSize: 17,
    lineHeight: 24,
    marginTop: 8,
    marginBottom: 24,
};

const sectionStyle = {
    marginTop: 24,
};

const sectionHeadingStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 14,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const listStyle = {
    gap: 12,
};

const cardTitleStyle = {
    fontSize: 19,
    fontWeight: '900' as const,
};

const metaTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 6,
};
