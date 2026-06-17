import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type PropertyMembership = {
    property_id: string;
};

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

type CompanyRecord = {
    id: string;
    name: string | null;
};

type ConnectionAction = 'approve' | 'decline';

export default function ConnectionsScreen() {
    const { theme } = useTheme();
    const [connections, setConnections] = useState<PropertyConnection[]>([]);
    const [companiesById, setCompaniesById] = useState<Record<string, CompanyRecord>>({});
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [actionConnectionId, setActionConnectionId] = useState('');
    const [actionType, setActionType] = useState<ConnectionAction | ''>('');

    useEffect(() => {
        loadConnections();
    }, []);

    const connectedConnections = useMemo(
        () => connections.filter((connection) => normalizeStatus(connection.status) === 'connected'),
        [connections]
    );
    const pendingConnections = useMemo(
        () => connections.filter((connection) => normalizeStatus(connection.status) === 'pending'),
        [connections]
    );
    const revokedConnections = useMemo(
        () => connections.filter((connection) => normalizeStatus(connection.status) === 'revoked'),
        [connections]
    );
    const declinedConnections = useMemo(
        () => connections.filter((connection) => normalizeStatus(connection.status) === 'declined'),
        [connections]
    );

    async function loadConnections() {
        setLoading(true);
        setMessage('');

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setLoading(false);
            router.replace('/auth/login' as any);
            return;
        }

        const { data: memberships, error: membershipError } = await supabase
            .from('property_memberships')
            .select('property_id')
            .eq('user_id', user.id)
            .eq('status', 'active');

        if (membershipError) {
            setLoading(false);
            setMessage(`Could not load home memberships: ${membershipError.message}`);
            return;
        }

        const propertyIds = ((memberships || []) as PropertyMembership[])
            .map((membership) => membership.property_id)
            .filter(Boolean);

        if (propertyIds.length === 0) {
            setConnections([]);
            setCompaniesById({});
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('property_connections')
            .select(
                'id, property_id, company_id, status, can_view_documents, can_view_photos, can_view_service_history, can_view_quotes, created_at, expires_at'
            )
            .in('property_id', propertyIds)
            .order('created_at', { ascending: false });

        if (error) {
            setLoading(false);
            setMessage(`Could not load company connections: ${error.message}`);
            return;
        }

        const loadedConnections = (data || []) as PropertyConnection[];
        setConnections(loadedConnections);
        await loadCompanies(loadedConnections);
        setLoading(false);
    }

    async function loadCompanies(loadedConnections: PropertyConnection[]) {
        const companyIds = Array.from(
            new Set(loadedConnections.map((connection) => connection.company_id).filter(Boolean))
        );

        if (companyIds.length === 0) {
            setCompaniesById({});
            return;
        }

        const { data } = await supabase
            .from('companies')
            .select('id, name')
            .in('id', companyIds);

        const nextCompaniesById = ((data || []) as CompanyRecord[]).reduce<Record<string, CompanyRecord>>(
            (accumulator, company) => {
                accumulator[company.id] = company;
                return accumulator;
            },
            {}
        );

        setCompaniesById(nextCompaniesById);
    }

    async function handleConnectionDecision(connectionId: string, decision: ConnectionAction) {
        setActionConnectionId(connectionId);
        setActionType(decision);
        setMessage(decision === 'approve' ? 'Approving connection...' : 'Declining connection...');

        const { error } = await supabase.rpc(
            decision === 'approve' ? 'approve_connection' : 'decline_connection',
            {
                connection_id: connectionId,
            }
        );

        setActionConnectionId('');
        setActionType('');

        if (error) {
            setMessage(
                decision === 'approve'
                    ? `Could not approve connection: ${error.message}`
                    : `Could not decline connection: ${error.message}`
            );
            return;
        }

        setConnections((currentConnections) =>
            currentConnections.map((connection) =>
                connection.id === connectionId
                    ? { ...connection, status: decision === 'approve' ? 'connected' : 'declined' }
                    : connection
            )
        );

        setMessage(decision === 'approve' ? 'Connection approved.' : 'Connection declined.');
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={[backTextStyle, { color: theme.colors.text }]} onPress={() => router.back()}>
                    Back
                </Text>

                <Text style={[titleStyle, { color: theme.colors.text }]}>Connections</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Manage which companies are connected to your home records.
                </Text>

                <ThemedCard style={actionCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Generate Connection Code</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Create a time-limited code for a company. The code is generated on the server and shown once.
                    </Text>
                    <ThemedButton
                        title="Generate Code"
                        onPress={() => router.push('/connections/create-code' as any)}
                        variant="secondary"
                        style={{ marginTop: 16 }}
                    />
                </ThemedCard>

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading connections...</Text>
                    </ThemedCard>
                ) : connections.length === 0 ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>No Connections</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            Pending, connected, revoked, and declined connections will appear here.
                        </Text>
                    </ThemedCard>
                ) : (
                    <>
                        <ConnectionSection
                            title="Pending Requests"
                            connections={pendingConnections}
                            companiesById={companiesById}
                            emptyText="No pending requests."
                            showActions
                            actionConnectionId={actionConnectionId}
                            actionType={actionType}
                            onApprove={(connectionId) => handleConnectionDecision(connectionId, 'approve')}
                            onDecline={(connectionId) => handleConnectionDecision(connectionId, 'decline')}
                        />

                        <ConnectionSection
                            title="Connected Companies"
                            connections={connectedConnections}
                            companiesById={companiesById}
                            emptyText="No connected companies yet."
                        />

                        <ConnectionSection
                            title="Revoked Connections"
                            connections={revokedConnections}
                            companiesById={companiesById}
                            emptyText="No revoked connections."
                        />

                        <ConnectionSection
                            title="Declined Requests"
                            connections={declinedConnections}
                            companiesById={companiesById}
                            emptyText="No declined requests."
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
    companiesById,
    emptyText,
    showActions = false,
    actionConnectionId = '',
    actionType = '',
    onApprove,
    onDecline,
}: {
    title: string;
    connections: PropertyConnection[];
    companiesById: Record<string, CompanyRecord>;
    emptyText: string;
    showActions?: boolean;
    actionConnectionId?: string;
    actionType?: ConnectionAction | '';
    onApprove?: (connectionId: string) => void;
    onDecline?: (connectionId: string) => void;
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
                    connections.map((connection) => (
                        <ThemedCard key={connection.id}>
                            <Text style={[cardTitleStyle, { color: theme.colors.text }]}>
                                {companiesById[connection.company_id]?.name || 'Company'}
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Status: {normalizeStatus(connection.status)}
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Requested Date: {formatDateTime(connection.created_at)}
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                {showActions && normalizeStatus(connection.status) === 'pending'
                                    ? 'Requested Permissions'
                                    : 'Permissions'}
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                {formatPermissions(connection)}
                            </Text>

                            {showActions && normalizeStatus(connection.status) === 'pending' && (
                                <View style={actionRowStyle}>
                                    <ThemedButton
                                        title={
                                            actionConnectionId === connection.id && actionType === 'approve'
                                                ? 'Approving...'
                                                : 'Approve'
                                        }
                                        onPress={() => onApprove?.(connection.id)}
                                        disabled={actionConnectionId === connection.id}
                                        style={actionButtonStyle}
                                    />
                                    <ThemedButton
                                        title={
                                            actionConnectionId === connection.id && actionType === 'decline'
                                                ? 'Declining...'
                                                : 'Decline'
                                        }
                                        onPress={() => onDecline?.(connection.id)}
                                        disabled={actionConnectionId === connection.id}
                                        variant="danger"
                                        style={actionButtonStyle}
                                    />
                                </View>
                            )}
                        </ThemedCard>
                    ))
                )}
            </View>
        </View>
    );
}

function normalizeStatus(status: string | null) {
    return String(status || 'pending').trim().toLowerCase();
}

function formatPermissions(connection: PropertyConnection) {
    return [
        `Photos: ${connection.can_view_photos ? 'Shared' : 'Private'}`,
        `Documents: ${connection.can_view_documents ? 'Shared' : 'Private'}`,
        `Service History: ${connection.can_view_service_history ? 'Shared' : 'Private'}`,
        `Quotes: ${connection.can_view_quotes ? 'Shared' : 'Private'}`,
    ].join(' | ');
}

function formatDateTime(value: string | null) {
    if (!value) return 'Unknown';

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) return 'Unknown';

    return parsed.toLocaleString();
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

const actionRowStyle = {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 16,
};

const actionButtonStyle = {
    flex: 1,
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
