import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../../../components/HomeHeader';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type CompanyClient = {
    id: string;
    company_id: string;
    property_id: string;
    property_connection_id: string | null;
    display_name: string | null;
    status: string | null;
    source: string | null;
    first_requested_at: string | null;
    last_requested_at: string | null;
    connected_at: string | null;
    created_at: string | null;
};

type PropertyRecord = {
    id: string;
    name: string | null;
    address: string | null;
    address_line_1?: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    postal_code?: string | null;
};

type PreferredProvider = {
    property_id: string;
    company_id: string;
    status: string | null;
};

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

export default function CompanyClientsScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [clients, setClients] = useState<CompanyClient[]>([]);
    const [propertiesById, setPropertiesById] = useState<Record<string, PropertyRecord>>({});
    const [preferredByPropertyId, setPreferredByPropertyId] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadClients();
    }, [id]);

    const visibleClients = useMemo(
        () => clients.filter((client) => normalizeStatus(client.status) !== 'archived'),
        [clients]
    );

    async function loadClients() {
        const companyId = id ? String(id) : '';

        if (!companyId) {
            setMessage('Missing company id.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setMessage('');

        const hasCompanyAccess = await verifyCompanyAccess(companyId);
        if (!hasCompanyAccess) {
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('company_property_clients')
            .select(
                'id, company_id, property_id, property_connection_id, display_name, status, source, first_requested_at, last_requested_at, connected_at, created_at'
            )
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) {
            setLoading(false);
            setMessage(`Could not load company clients: ${error.message}`);
            return;
        }

        const loadedClients = (data || []) as CompanyClient[];
        setClients(loadedClients);
        await loadClientContext(companyId, loadedClients);
        setLoading(false);
    }

    async function verifyCompanyAccess(companyId: string) {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as any);
            return false;
        }

        const platformAdminCheck = await loadPlatformAdminStatus(user.id);
        if (platformAdminCheck.isPlatformAdmin) {
            return true;
        }

        const { data, error } = await supabase
            .from('company_users')
            .select('id')
            .eq('auth_user_id', user.id)
            .eq('company_id', companyId)
            .eq('status', 'active')
            .limit(1);

        if (error) {
            setMessage(`Could not verify company access: ${error.message}`);
            return false;
        }

        if (!data || data.length === 0) {
            setMessage('No active membership found for this company.');
            return false;
        }

        return true;
    }

    async function loadClientContext(companyId: string, loadedClients: CompanyClient[]) {
        const propertyIds = Array.from(new Set(loadedClients.map((client) => client.property_id).filter(Boolean)));

        if (propertyIds.length === 0) {
            setPropertiesById({});
            setPreferredByPropertyId({});
            return;
        }

        const [propertiesResult, preferredResult] = await Promise.all([
            supabase
                .from('properties')
                .select('id, name, address, address_line_1, city, state, zip, postal_code')
                .in('id', propertyIds),
            supabase
                .from('property_preferred_providers')
                .select('property_id, company_id, status')
                .eq('company_id', companyId)
                .in('property_id', propertyIds),
        ]);

        if (propertiesResult.error) {
            setMessage(`Clients loaded, but home profiles could not be loaded: ${propertiesResult.error.message}`);
            setPropertiesById({});
        } else {
            const nextPropertiesById = ((propertiesResult.data || []) as PropertyRecord[]).reduce<
                Record<string, PropertyRecord>
            >((accumulator, property) => {
                accumulator[property.id] = property;
                return accumulator;
            }, {});
            setPropertiesById(nextPropertiesById);
        }

        if (preferredResult.error) {
            setPreferredByPropertyId({});
            return;
        }

        const nextPreferredByPropertyId = ((preferredResult.data || []) as PreferredProvider[]).reduce<
            Record<string, string>
        >((accumulator, preferredProvider) => {
            if (normalizeStatus(preferredProvider.status) === 'active') {
                accumulator[preferredProvider.property_id] = preferredProvider.status || 'active';
            }
            return accumulator;
        }, {});

        setPreferredByPropertyId(nextPreferredByPropertyId);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
                <HomeHeader />

                <Text
                    onPress={() => router.push(`/super-admin/company/${id}` as any)}
                    style={[backTextStyle, { color: theme.colors.text }]}
                >
                    Back
                </Text>

                <Text style={[titleStyle, { color: theme.colors.text }]}>Company Clients</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Homes that selected this company as a service provider appear here with basic home profile details.
                </Text>

                <ThemedCard style={actionCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Private HomeOS Data</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Photos, documents, service history, quotes, and private item details are not shared from this
                        client list. Homeowners can grant deeper access later through service requests or access codes.
                    </Text>
                    <ThemedButton
                        title="Open Connections"
                        onPress={() => router.push(`/super-admin/company/${id}/connections` as any)}
                        variant="secondary"
                        style={{ marginTop: 16 }}
                    />
                </ThemedCard>

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading clients...</Text>
                    </ThemedCard>
                ) : visibleClients.length === 0 ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>No clients yet</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            Homeowners who choose this company as a provider will appear here.
                        </Text>
                    </ThemedCard>
                ) : (
                    <View style={sectionStyle}>
                        <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Clients</Text>
                        <View style={listStyle}>
                            {visibleClients.map((client) => (
                                <ClientCard
                                    key={client.id}
                                    client={client}
                                    property={propertiesById[client.property_id]}
                                    preferredStatus={preferredByPropertyId[client.property_id]}
                                />
                            ))}
                        </View>
                    </View>
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

function ClientCard({
    client,
    property,
    preferredStatus,
}: {
    client: CompanyClient;
    property?: PropertyRecord;
    preferredStatus?: string;
}) {
    const { theme } = useTheme();
    const displayName = client.display_name || property?.name || 'Home';
    const linkedAt = client.connected_at || client.first_requested_at || client.created_at;

    return (
        <ThemedCard>
            <Text style={[cardTitleStyle, { color: theme.colors.text }]}>{displayName}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Status: {formatStatus(client.status)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Provider: {preferredStatus ? 'Preferred' : 'Selected'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Source: {formatSource(client.source)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                {formatAddress(property) || 'Home profile details are not available yet.'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Linked: {formatDate(linkedAt)}
            </Text>
        </ThemedCard>
    );
}

async function loadPlatformAdminStatus(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role, is_platform_admin')
        .eq('id', userId)
        .limit(1);

    if (!primaryQuery.error) {
        return {
            isPlatformAdmin: isPlatformAdminProfile((primaryQuery.data || [])[0] as PlatformProfile | undefined),
        };
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    return {
        isPlatformAdmin: isPlatformAdminProfile((fallbackQuery.data || [])[0] as PlatformProfile | undefined),
    };
}

function isPlatformAdminProfile(profile?: PlatformProfile | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

function formatAddress(property?: PropertyRecord) {
    if (!property) return '';

    const street = property.address || property.address_line_1;
    const postalCode = property.zip || property.postal_code;

    return [street, property.city, property.state, postalCode].filter(Boolean).join(', ');
}

function formatStatus(status: string | null) {
    const normalized = normalizeStatus(status);

    if (normalized === 'active') return 'Active';
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'archived') return 'Archived';

    return normalized ? titleCase(normalized) : 'Unknown';
}

function formatSource(source: string | null) {
    const normalized = normalizeStatus(source);

    if (normalized === 'homeowner_provider_request') return 'Homeowner selected';
    if (normalized === 'connection_code') return 'Connection code';
    if (normalized === 'manual') return 'Manual';

    return normalized ? titleCase(normalized.replace(/_/g, ' ')) : 'Not specified';
}

function formatDate(value: string | null) {
    if (!value) return 'Not available';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Not available';
    }

    return date.toLocaleDateString();
}

function normalizeStatus(status: string | null) {
    return String(status || '').trim().toLowerCase();
}

function titleCase(value: string) {
    return value
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
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

const actionCardStyle = {
    marginBottom: 24,
};

const sectionStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
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
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    gap: 12,
};

const cardTitleStyle = {
    fontSize: 19,
    fontWeight: '900' as const,
    flexShrink: 1,
};

const metaTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 6,
};
