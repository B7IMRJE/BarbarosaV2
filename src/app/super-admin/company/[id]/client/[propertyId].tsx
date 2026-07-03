import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import AdminNavBar from '../../../../../components/AdminNavBar';
import ThemedButton from '../../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../../components/theme/ThemedCard';
import { loadCurrentCompanyPermissionAccess } from '../../../../../lib/companyPermissions';
import { supabase } from '../../../../../lib/supabase';
import { useTheme } from '../../../../../theme/useTheme';

type CompanyRecord = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
};

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

type PropertyConnection = {
    id: string;
    status: string | null;
    request_source: string | null;
    can_view_documents: boolean | null;
    can_view_photos: boolean | null;
    can_view_service_history: boolean | null;
    can_view_quotes: boolean | null;
    created_at: string | null;
    requested_at?: string | null;
};

type CustomerInvite = {
    invited_email: string | null;
    invited_phone: string | null;
    invited_name: string | null;
    status: string | null;
    accepted_at: string | null;
};

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

export default function CompanyClientDetailScreen() {
    const { theme } = useTheme();
    const { id, propertyId } = useLocalSearchParams<{ id: string; propertyId: string }>();
    const companyId = String(id || '');
    const clientPropertyId = String(propertyId || '');
    const clientsRoute = `/super-admin/company/${companyId}/clients` as Href;
    const [company, setCompany] = useState<CompanyRecord | null>(null);
    const [client, setClient] = useState<CompanyClient | null>(null);
    const [property, setProperty] = useState<PropertyRecord | null>(null);
    const [connection, setConnection] = useState<PropertyConnection | null>(null);
    const [invite, setInvite] = useState<CustomerInvite | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        void loadClientDetail();
    }, [companyId, clientPropertyId]);

    const companyName = getCompanyDisplayName(company);
    const homeName = client?.display_name || property?.name || 'Customer Home';
    const linkedAt = client?.connected_at || invite?.accepted_at || connection?.created_at || client?.created_at || null;
    const source = client?.source || connection?.request_source || null;
    const permissions = useMemo(
        () => [
            { label: 'Photos', shared: !!connection?.can_view_photos },
            { label: 'Documents', shared: !!connection?.can_view_documents },
            { label: 'Service History', shared: !!connection?.can_view_service_history },
            { label: 'Quotes', shared: !!connection?.can_view_quotes },
        ],
        [connection]
    );

    async function loadClientDetail() {
        if (!companyId || !clientPropertyId) {
            setMessage('Missing company or property id.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setMessage('');

        const hasAccess = await verifyClientDetailAccess(companyId);

        if (!hasAccess) {
            setLoading(false);
            return;
        }

        const [companyResult, clientResult, propertyResult] = await Promise.all([
            supabase
                .from('companies')
                .select('id, name, public_name, dba_name')
                .eq('id', companyId)
                .maybeSingle(),
            supabase
                .from('company_property_clients')
                .select('id, company_id, property_id, property_connection_id, display_name, status, source, first_requested_at, last_requested_at, connected_at, created_at')
                .eq('company_id', companyId)
                .eq('property_id', clientPropertyId)
                .maybeSingle(),
            supabase
                .from('properties')
                .select('id, name, address, address_line_1, city, state, zip, postal_code')
                .eq('id', clientPropertyId)
                .maybeSingle(),
        ]);

        if (companyResult.error) {
            setMessage(`Could not load company context: ${companyResult.error.message}`);
            setLoading(false);
            return;
        }

        if (clientResult.error) {
            setMessage(`Could not load client relationship: ${clientResult.error.message}`);
            setLoading(false);
            return;
        }

        if (!clientResult.data) {
            setMessage('This home is not an active client for this company.');
            setLoading(false);
            return;
        }

        if (propertyResult.error) {
            setMessage(`Client relationship loaded, but home basics could not be loaded: ${propertyResult.error.message}`);
        }

        const loadedClient = clientResult.data as CompanyClient;
        setCompany((companyResult.data || null) as CompanyRecord | null);
        setClient(loadedClient);
        setProperty((propertyResult.data || null) as PropertyRecord | null);
        await Promise.all([
            loadConnection(loadedClient),
            loadAcceptedInvite(),
        ]);
        setLoading(false);
    }

    async function verifyClientDetailAccess(targetCompanyId: string) {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as never);
            return false;
        }

        if (await isPlatformAdmin(user.id)) return true;

        const permissionLookup = await loadCurrentCompanyPermissionAccess('can_view_customers', {
            companyId: targetCompanyId,
        });

        if (permissionLookup.access) return true;

        setMessage(permissionLookup.error || 'You do not have customer access for this company.');
        return false;
    }

    async function loadConnection(loadedClient: CompanyClient) {
        const baseQuery = supabase
            .from('property_connections')
            .select('id, status, request_source, can_view_documents, can_view_photos, can_view_service_history, can_view_quotes, created_at, requested_at')
            .eq('company_id', companyId)
            .eq('property_id', clientPropertyId);
        const query = loadedClient.property_connection_id
            ? baseQuery.eq('id', loadedClient.property_connection_id)
            : baseQuery;
        const { data } = await query.order('created_at', { ascending: false }).limit(1);

        setConnection(((data || []) as PropertyConnection[])[0] || null);
    }

    async function loadAcceptedInvite() {
        const { data } = await supabase
            .from('company_customer_invitations')
            .select('invited_email, invited_phone, invited_name, status, accepted_at')
            .eq('company_id', companyId)
            .eq('accepted_property_id', clientPropertyId)
            .order('accepted_at', { ascending: false })
            .limit(1);

        setInvite(((data || []) as CustomerInvite[])[0] || null);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 920, minWidth: 0 }}>
                <AdminNavBar companyId={companyId} backFallback={clientsRoute} />

                <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>ManagementOS</Text>
                <Text style={[titleStyle, { color: theme.colors.text }]}>Customer Home</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    {companyName} / company-side client view
                </Text>

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading customer home...</Text>
                    </ThemedCard>
                ) : message && !client ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Unable to Open Client</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                        <ThemedButton
                            title="Back to Clients"
                            variant="secondary"
                            onPress={() => router.replace(clientsRoute)}
                            style={{ marginTop: 16 }}
                        />
                    </ThemedCard>
                ) : (
                    <>
                        {!!message && (
                            <ThemedCard style={messageCardStyle}>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                            </ThemedCard>
                        )}

                        <ThemedCard style={heroCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>{homeName}</Text>
                            <DetailRow label="Customer" value={invite?.invited_name || client?.display_name || 'Not specified'} />
                            <DetailRow label="Email" value={invite?.invited_email || 'Not shared'} />
                            <DetailRow label="Phone" value={invite?.invited_phone || 'Not shared'} />
                            <DetailRow label="Address" value={formatAddress(property) || 'Address not available'} />
                            <DetailRow label="Provider status" value={formatStatus(client?.status)} />
                            <DetailRow label="Source" value={formatSource(source)} />
                            <DetailRow label="Linked date" value={formatDate(linkedAt)} />
                        </ThemedCard>

                        <ThemedCard style={sectionCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Permissions Summary</Text>
                            <View style={permissionGridStyle}>
                                {permissions.map((permission) => (
                                    <View
                                        key={permission.label}
                                        style={[
                                            permissionPillStyle,
                                            {
                                                backgroundColor: permission.shared
                                                    ? theme.colors.status.good.background
                                                    : theme.colors.surfaceAlt,
                                                borderColor: permission.shared
                                                    ? theme.colors.status.good.border
                                                    : theme.colors.border,
                                            },
                                        ]}
                                    >
                                        <Text style={[permissionTextStyle, { color: theme.colors.text }]}>
                                            {permission.label}: {permission.shared ? 'Shared' : 'Private'}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </ThemedCard>

                        <View style={actionGridStyle}>
                            <ActionCard
                                title="Open Client HomeOS"
                                body="Open the customer's real HomeOS dashboard in provider mode with company tools."
                                onPress={() => router.push({
                                    pathname: '/',
                                    params: {
                                        providerMode: '1',
                                        companyId,
                                        propertyId: clientPropertyId,
                                        returnTo: `/super-admin/company/${companyId}/client/${clientPropertyId}`,
                                    },
                                } as never)}
                            />
                            <ActionCard
                                title="View Home Items"
                                body="Open safe HomeOS item basics for estimates and company service context."
                                onPress={() => router.push(`/super-admin/company/${companyId}/client/${clientPropertyId}/items` as never)}
                            />
                            <ActionCard
                                title="Request / Job History"
                                body={connection?.can_view_service_history ? 'Shared history can be opened here later.' : 'Private - request access.'}
                                locked={!connection?.can_view_service_history}
                            />
                            <ActionCard
                                title="Estimates / Proposals"
                                body={connection?.can_view_quotes ? 'Shared quotes and proposals can appear here later.' : 'Private - request access.'}
                                locked={!connection?.can_view_quotes}
                            />
                            <ActionCard title="Add Note" body="Company-side customer notes are coming soon." />
                            <ActionCard title="Service Access Request" body="Request deeper HomeOS access from the homeowner later." />
                            <ActionCard
                                title="Open Shared Documents"
                                body={connection?.can_view_documents ? 'Open documents shared with this company.' : 'Private - request access.'}
                                locked={!connection?.can_view_documents}
                                onPress={
                                    connection?.can_view_documents
                                        ? () => router.push(`/super-admin/property/${clientPropertyId}/documents` as never)
                                        : undefined
                                }
                            />
                            <ActionCard
                                title="Open Shared Photos"
                                body={connection?.can_view_photos ? 'Open photos shared with this company.' : 'Private - request access.'}
                                locked={!connection?.can_view_photos}
                                onPress={
                                    connection?.can_view_photos
                                        ? () => router.push(`/super-admin/property/${clientPropertyId}/photos` as never)
                                        : undefined
                                }
                            />
                        </View>

                        <ThemedButton
                            title="Back to Clients"
                            variant="secondary"
                            onPress={() => router.replace(clientsRoute)}
                            style={{ marginTop: 18 }}
                        />
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View style={[detailRowStyle, { borderColor: theme.colors.border }]}>
            <Text style={[detailLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[detailValueStyle, { color: theme.colors.text }]}>{value}</Text>
        </View>
    );
}

function ActionCard({
    title,
    body,
    locked = false,
    onPress,
}: {
    title: string;
    body: string;
    locked?: boolean;
    onPress?: () => void;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard onPress={onPress} style={actionCardStyle}>
            <Text style={[cardTitleStyle, { color: theme.colors.text }]}>{title}</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{body}</Text>
            <Text style={[metaTextStyle, { color: locked ? theme.colors.danger : theme.colors.mutedText }]}>
                {locked ? 'Locked' : onPress ? 'Open' : 'Placeholder'}
            </Text>
        </ThemedCard>
    );
}

async function isPlatformAdmin(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role, is_platform_admin')
        .eq('id', userId)
        .limit(1);

    if (!primaryQuery.error) {
        return isPlatformAdminProfile((primaryQuery.data || [])[0] as PlatformProfile | undefined);
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    return isPlatformAdminProfile((fallbackQuery.data || [])[0] as PlatformProfile | undefined);
}

function isPlatformAdminProfile(profile?: PlatformProfile | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

function getCompanyDisplayName(company?: CompanyRecord | null) {
    return company?.public_name?.trim() || company?.dba_name?.trim() || company?.name?.trim() || 'Company';
}

function formatAddress(property?: PropertyRecord | null) {
    if (!property) return '';

    const street = property.address || property.address_line_1;
    const postalCode = property.zip || property.postal_code;

    return [street, property.city, property.state, postalCode].filter(Boolean).join(', ');
}

function formatStatus(status?: string | null) {
    const normalized = normalizeText(status);

    return normalized ? titleCase(normalized.replace(/_/g, ' ')) : 'Unknown';
}

function formatSource(source?: string | null) {
    const normalized = normalizeText(source);

    if (normalized === 'company_customer_invite') return 'Customer invite';
    if (normalized === 'homeowner_provider_request') return 'Homeowner selected';
    if (normalized === 'connection_code') return 'Connection code';
    if (normalized === 'manual') return 'Manual';

    return normalized ? titleCase(normalized.replace(/_/g, ' ')) : 'Not specified';
}

function formatDate(value?: string | null) {
    if (!value) return 'Not available';

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function titleCase(value: string) {
    return value
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

const eyebrowStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    fontSize: 16,
    fontWeight: '800' as const,
    lineHeight: 23,
    marginTop: 8,
    marginBottom: 24,
};

const heroCardStyle = {
    marginBottom: 16,
};

const sectionCardStyle = {
    marginBottom: 16,
};

const messageCardStyle = {
    marginBottom: 16,
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

const metaTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    lineHeight: 19,
    marginTop: 8,
};

const detailRowStyle = {
    borderBottomWidth: 1,
    paddingVertical: 10,
};

const detailLabelStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    marginBottom: 2,
};

const detailValueStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
};

const permissionGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 10,
};

const permissionPillStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
};

const permissionTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const actionGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const actionCardStyle = {
    flexBasis: 250,
    flexGrow: 1,
    minHeight: 150,
};

const cardTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 8,
};
