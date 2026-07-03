import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
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
    request_source: string | null;
    can_view_documents: boolean | null;
    can_view_photos: boolean | null;
    can_view_service_history: boolean | null;
    can_view_quotes: boolean | null;
    created_at: string | null;
    expires_at: string | null;
};

type PreferredProviderRow = {
    id: string | null;
    property_id: string;
    company_id: string;
    property_connection_id: string | null;
    status: string | null;
    source: string | null;
    selected_at: string | null;
};

type CompanyRecord = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    accent_color: string | null;
    service_categories: string[] | null;
    homeos_rating: number | null;
    homeos_rating_count: number | null;
    combined_experience_years: number | null;
    license_number: string | null;
    phone: string | null;
    website: string | null;
    short_description: string | null;
};

type CompanyCategoryOption = {
    key: string;
    label: string;
    inferred: boolean;
};

type ConnectionAction = 'approve' | 'decline';

type ProviderConnectionRequestResult = {
    connection_id: string;
    preferred_provider_id: string;
    company_property_client_id: string;
    property_id: string;
    company_id: string;
    status: string;
};

type RelationshipHistorySection = {
    title: string;
    connections: PropertyConnection[];
    emptyText: string;
    showActions?: boolean;
};

type LoadConnectionsOptions = {
    preserveMessage?: boolean;
};

const companyProfileSelect =
    'id, name, public_name, dba_name, logo_url, primary_color, secondary_color, accent_color, service_categories, homeos_rating, homeos_rating_count, combined_experience_years, license_number, phone, website, short_description';

export default function ConnectionsScreen() {
    const { theme } = useTheme();
    const [connections, setConnections] = useState<PropertyConnection[]>([]);
    const [preferredProviders, setPreferredProviders] = useState<PreferredProviderRow[]>([]);
    const [companiesById, setCompaniesById] = useState<Record<string, CompanyRecord>>({});
    const [approvedCompanies, setApprovedCompanies] = useState<CompanyRecord[]>([]);
    const [approvedCompaniesLoading, setApprovedCompaniesLoading] = useState(true);
    const [approvedCompaniesError, setApprovedCompaniesError] = useState('');
    const [providerRequestPropertyId, setProviderRequestPropertyId] = useState('');
    const [providerRequestUnavailableReason, setProviderRequestUnavailableReason] = useState('');
    const [providerActionCompanyId, setProviderActionCompanyId] = useState('');
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [actionConnectionId, setActionConnectionId] = useState('');
    const [actionType, setActionType] = useState<ConnectionAction | ''>('');

    useEffect(() => {
        loadConnections();
    }, []);

    const allCompaniesById = useMemo(() => {
        return approvedCompanies.reduce<Record<string, CompanyRecord>>(
            (accumulator, company) => {
                accumulator[company.id] = company;
                return accumulator;
            },
            { ...companiesById }
        );
    }, [approvedCompanies, companiesById]);
    const currentProviderCompanyIds = useMemo(() => {
        const activePreferredProviderIds = preferredProviders
            .filter((provider) => normalizeStatus(provider.status) === 'active')
            .map((provider) => provider.company_id);
        const fallbackProviderIds = connections
            .filter((connection) => isChosenProviderConnection(connection))
            .map((connection) => connection.company_id);

        return Array.from(new Set([...activePreferredProviderIds, ...fallbackProviderIds]));
    }, [connections, preferredProviders]);
    const currentProviderConnections = useMemo(() => {
        const existingConnectionKeys = new Set<string>();
        const preferredProviderConnections = preferredProviders
            .filter((provider) => normalizeStatus(provider.status) === 'active')
            .map((provider) => {
                const matchingConnection = connections.find(
                    (connection) =>
                        connection.company_id === provider.company_id &&
                        connection.property_id === provider.property_id
                );

                if (matchingConnection) {
                    existingConnectionKeys.add(matchingConnection.id);
                    return {
                        ...matchingConnection,
                        status: 'connected',
                        created_at: provider.selected_at || matchingConnection.created_at,
                    };
                }

                return preferredProviderToConnection(provider);
            });
        const fallbackConnections = connections.filter(
            (connection) => isChosenProviderConnection(connection) && !existingConnectionKeys.has(connection.id)
        );

        return [...preferredProviderConnections, ...fallbackConnections];
    }, [connections, preferredProviders]);
    const selectedProviderCategoryKeys = useMemo(() => {
        const keys = currentProviderCompanyIds.flatMap((companyId) =>
            getCompanyCategoryKeys(allCompaniesById[companyId])
        );

        return Array.from(new Set(keys));
    }, [allCompaniesById, currentProviderCompanyIds]);
    const selectedProviderCategoryLabels = useMemo(() => {
        return selectedProviderCategoryKeys.map((categoryKey) => formatProviderCategoryLabel(categoryKey));
    }, [selectedProviderCategoryKeys]);
    const availableProviderFilterResult = useMemo(() => {
        return approvedCompanies.reduce<{
            companies: CompanyRecord[];
            categoryHiddenCount: number;
        }>(
            (result, company) => {
                if (currentProviderCompanyIds.includes(company.id)) {
                    return result;
                }

                const companyCategoryKeys = getCompanyCategoryKeys(company);

                if (
                    selectedProviderCategoryKeys.length > 0 &&
                    companyCategoryKeys.length > 0 &&
                    hasCategoryOverlap(companyCategoryKeys, selectedProviderCategoryKeys)
                ) {
                    result.categoryHiddenCount += 1;
                    return result;
                }

                result.companies.push(company);
                return result;
            },
            { companies: [], categoryHiddenCount: 0 }
        );
    }, [approvedCompanies, currentProviderCompanyIds, selectedProviderCategoryKeys]);
    const availableProviderCompanies = availableProviderFilterResult.companies;
    const hiddenAvailableProviderCount = availableProviderFilterResult.categoryHiddenCount;
    const connectedConnections = useMemo(
        () =>
            connections.filter(
                (connection) =>
                    normalizeStatus(connection.status) === 'connected' &&
                    !currentProviderCompanyIds.includes(connection.company_id)
            ),
        [connections, currentProviderCompanyIds]
    );
    const pendingConnections = useMemo(
        () =>
            connections.filter(
                (connection) =>
                    normalizeStatus(connection.status) === 'pending' &&
                    !currentProviderCompanyIds.includes(connection.company_id)
            ),
        [connections, currentProviderCompanyIds]
    );
    const providerStatusByCompanyId = useMemo(() => {
        return currentProviderCompanyIds.reduce<Record<string, string>>((statuses, companyId) => {
            statuses[companyId] = 'preferred';
            return statuses;
        }, {});
    }, [currentProviderCompanyIds]);
    const revokedConnections = useMemo(
        () => connections.filter((connection) => normalizeStatus(connection.status) === 'revoked'),
        [connections]
    );
    const declinedConnections = useMemo(
        () => connections.filter((connection) => normalizeStatus(connection.status) === 'declined'),
        [connections]
    );

    async function loadConnections(options: LoadConnectionsOptions = {}) {
        setLoading(true);

        if (!options.preserveMessage) {
            setMessage('');
        }

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setLoading(false);
            setApprovedCompaniesLoading(false);
            setProviderRequestPropertyId('');
            setProviderRequestUnavailableReason('');
            router.replace('/auth/login' as any);
            return;
        }

        await loadApprovedCompanies();

        const { data: memberships, error: membershipError } = await supabase
            .from('property_memberships')
            .select('property_id')
            .eq('user_id', user.id)
            .eq('status', 'active');

        if (membershipError) {
            setLoading(false);
            setProviderRequestPropertyId('');
            setProviderRequestUnavailableReason('');
            setMessage(`Could not load home memberships: ${membershipError.message}`);
            return;
        }

        const propertyIds = ((memberships || []) as PropertyMembership[])
            .map((membership) => membership.property_id)
            .filter(Boolean);

        if (propertyIds.length === 0) {
            setConnections([]);
            setPreferredProviders([]);
            setCompaniesById({});
            setProviderRequestPropertyId('');
            setProviderRequestUnavailableReason('Create your first home before choosing a provider.');
            setLoading(false);
            return;
        }

        if (propertyIds.length === 1) {
            setProviderRequestPropertyId(propertyIds[0]);
            setProviderRequestUnavailableReason('');
        } else {
            setProviderRequestPropertyId('');
            setProviderRequestUnavailableReason(
                'Provider requests need one active home. Multi-home provider selection is not implemented yet.'
            );
        }

        const { data, error } = await supabase
            .from('property_connections')
            .select(
                'id, property_id, company_id, status, request_source, can_view_documents, can_view_photos, can_view_service_history, can_view_quotes, created_at, expires_at'
            )
            .in('property_id', propertyIds)
            .order('created_at', { ascending: false });

        if (error) {
            setLoading(false);
            setMessage(`Could not load company connections: ${error.message}`);
            return;
        }

        const loadedConnections = (data || []) as PropertyConnection[];
        const { data: preferredData, error: preferredError } = await supabase
            .from('property_preferred_providers')
            .select('id, property_id, company_id, property_connection_id, status, source, selected_at')
            .in('property_id', propertyIds)
            .eq('status', 'active')
            .order('selected_at', { ascending: false });

        const loadedPreferredProviders = preferredError
            ? []
            : ((preferredData || []) as PreferredProviderRow[]);

        if (preferredError) {
            setMessage(`Could not load current providers: ${preferredError.message}`);
        }

        setConnections(loadedConnections);
        setPreferredProviders(loadedPreferredProviders);
        await loadCompanies(loadedConnections, loadedPreferredProviders);
        setLoading(false);
    }

    async function loadCompanies(
        loadedConnections: PropertyConnection[],
        loadedPreferredProviders: PreferredProviderRow[] = []
    ) {
        const companyIds = Array.from(
            new Set(
                [
                    ...loadedConnections.map((connection) => connection.company_id),
                    ...loadedPreferredProviders.map((provider) => provider.company_id),
                ].filter(Boolean)
            )
        );

        if (companyIds.length === 0) {
            setCompaniesById({});
            return;
        }

        const { data, error } = await supabase
            .from('companies')
            .select(companyProfileSelect)
            .in('id', companyIds);

        if (error) {
            setCompaniesById({});
            setMessage(`Could not load company profiles: ${error.message}`);
            return;
        }

        const nextCompaniesById = ((data || []) as CompanyRecord[]).reduce<Record<string, CompanyRecord>>(
            (accumulator, company) => {
                accumulator[company.id] = company;
                return accumulator;
            },
            {}
        );

        setCompaniesById(nextCompaniesById);
    }

    async function loadApprovedCompanies() {
        setApprovedCompaniesLoading(true);
        setApprovedCompaniesError('');

        const { data, error } = await supabase
            .from('companies')
            .select(companyProfileSelect)
            .in('status', ['ACTIVE', 'active'])
            .order('public_name', { ascending: true, nullsFirst: false })
            .order('name', { ascending: true });

        setApprovedCompaniesLoading(false);

        if (error) {
            setApprovedCompanies([]);
            setApprovedCompaniesError(`Could not load available providers: ${error.message}`);
            return;
        }

        setApprovedCompanies((data || []) as CompanyRecord[]);
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

    async function handleProviderSelection(company: CompanyRecord) {
        const providerName = getCompanyDisplayName(company);

        if (!providerRequestPropertyId) {
            setMessage(
                providerRequestUnavailableReason ||
                    'Choose one active home before choosing a provider.'
            );
            return;
        }

        setProviderActionCompanyId(company.id);
        setMessage(`Choosing ${providerName}...`);

        const { data, error } = await supabase.rpc('request_property_provider_connection', {
            p_property_id: providerRequestPropertyId,
            p_company_id: company.id,
        });

        if (error) {
            setProviderActionCompanyId('');

            if (isMissingProviderRequestRpc(error)) {
                setMessage(
                    'Provider selection storage is ready in the review SQL, but the database RPC has not been applied yet. Michael needs to apply 000_Project_Docs/570_Property_Provider_Connection_Request.sql before this button can save the request.'
                );
                return;
            }

            setMessage(`Could not request connection with ${providerName}: ${error.message}`);
            return;
        }

        const result = firstRow<ProviderConnectionRequestResult>(data);
        const status = normalizeStatus(result?.status || 'pending');

        mergeProviderRequestResult(result, company, status);
        mergePreferredProviderResult(result, company);
        await loadConnections({ preserveMessage: true });
        mergeProviderRequestResult(result, company, status);
        mergePreferredProviderResult(result, company);
        setProviderActionCompanyId('');

        setMessage(
            status === 'connected'
                ? `${providerName} is now your preferred provider.`
                : `${providerName} was chosen as your provider.`
        );
    }

    function mergeProviderRequestResult(
        result: ProviderConnectionRequestResult | null,
        company: CompanyRecord,
        status: string
    ) {
        if (!result?.connection_id) return;

        const nextConnection: PropertyConnection = {
            id: result.connection_id,
            property_id: result.property_id || providerRequestPropertyId,
            company_id: result.company_id || company.id,
            status,
            request_source: 'homeowner_provider_request',
            can_view_documents: false,
            can_view_photos: false,
            can_view_service_history: false,
            can_view_quotes: false,
            created_at: new Date().toISOString(),
            expires_at: null,
        };

        setConnections((currentConnections) => {
            const existingConnection = currentConnections.find(
                (connection) =>
                    connection.id === nextConnection.id ||
                    (connection.property_id === nextConnection.property_id &&
                        connection.company_id === nextConnection.company_id)
            );

            if (!existingConnection) {
                return [nextConnection, ...currentConnections];
            }

            return currentConnections.map((connection) =>
                connection.id === existingConnection.id
                    ? {
                          ...connection,
                          id: nextConnection.id,
                          property_id: nextConnection.property_id,
                          company_id: nextConnection.company_id,
                          status: nextConnection.status,
                          request_source: nextConnection.request_source,
                          created_at: connection.created_at || nextConnection.created_at,
                          expires_at: connection.expires_at ?? nextConnection.expires_at,
                      }
                    : connection
            );
        });

        setCompaniesById((currentCompanies) => ({
            ...currentCompanies,
            [company.id]: company,
        }));
    }

    function mergePreferredProviderResult(
        result: ProviderConnectionRequestResult | null,
        company: CompanyRecord
    ) {
        const propertyId = result?.property_id || providerRequestPropertyId;

        if (!propertyId) return;

        const selectedCompanyId = result?.company_id || company.id;
        const selectedCategoryKeys = getCompanyCategoryKeys(company);
        const nextProvider: PreferredProviderRow = {
            id: result?.preferred_provider_id || `local-${propertyId}-${selectedCompanyId}`,
            property_id: propertyId,
            company_id: selectedCompanyId,
            property_connection_id: result?.connection_id || null,
            status: 'active',
            source: 'homeowner_provider_request',
            selected_at: new Date().toISOString(),
        };

        setPreferredProviders((currentProviders) => {
            const filteredProviders = currentProviders.filter((provider) => {
                if (provider.property_id !== propertyId) return true;
                if (provider.company_id === selectedCompanyId) return false;

                const providerCompany =
                    companiesById[provider.company_id] ||
                    approvedCompanies.find((approvedCompany) => approvedCompany.id === provider.company_id);

                if (selectedCategoryKeys.length === 0) return true;

                return !hasCategoryOverlap(getCompanyCategoryKeys(providerCompany), selectedCategoryKeys);
            });

            return [nextProvider, ...filteredProviders];
        });
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
                    <View style={sectionStyle}>
                        <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Current Providers</Text>
                        <ThemedCard>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                Loading current providers...
                            </Text>
                        </ThemedCard>
                    </View>
                ) : (
                    <ConnectionSection
                        title="Current Providers"
                        connections={currentProviderConnections}
                        companiesById={allCompaniesById}
                        emptyText="No current providers selected yet."
                        statusLabelOverride="Preferred"
                        dateLabelOverride="Selected Date"
                    />
                )}

                <AvailableProvidersSection
                    companies={availableProviderCompanies}
                    loading={approvedCompaniesLoading}
                    error={approvedCompaniesError}
                    hiddenProviderCount={hiddenAvailableProviderCount}
                    selectedCategoryLabels={selectedProviderCategoryLabels}
                    requestingCompanyId={providerActionCompanyId}
                    providerStatusByCompanyId={providerStatusByCompanyId}
                    onRequestConnection={handleProviderSelection}
                />

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading connections...</Text>
                    </ThemedCard>
                ) : (
                    <RelationshipHistoryGrid
                        sections={[
                            {
                                title: 'Pending Requests',
                                connections: pendingConnections,
                                emptyText: 'No pending requests.',
                                showActions: true,
                            },
                            {
                                title: 'Connected Companies',
                                connections: connectedConnections,
                                emptyText: 'No connected companies yet.',
                            },
                            {
                                title: 'Revoked Connections',
                                connections: revokedConnections,
                                emptyText: 'No revoked connections.',
                            },
                            {
                                title: 'Declined Requests',
                                connections: declinedConnections,
                                emptyText: 'No declined requests.',
                            },
                        ]}
                        companiesById={allCompaniesById}
                        actionConnectionId={actionConnectionId}
                        actionType={actionType}
                        onApprove={(connectionId) => handleConnectionDecision(connectionId, 'approve')}
                        onDecline={(connectionId) => handleConnectionDecision(connectionId, 'decline')}
                    />
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

function AvailableProvidersSection({
    companies,
    loading,
    error,
    hiddenProviderCount,
    selectedCategoryLabels,
    requestingCompanyId,
    providerStatusByCompanyId,
    onRequestConnection,
}: {
    companies: CompanyRecord[];
    loading: boolean;
    error: string;
    hiddenProviderCount: number;
    selectedCategoryLabels: string[];
    requestingCompanyId: string;
    providerStatusByCompanyId: Record<string, string>;
    onRequestConnection: (company: CompanyRecord) => void | Promise<void>;
}) {
    const { theme } = useTheme();

    return (
        <View style={sectionStyle}>
            <View style={sectionTitleRowStyle}>
                <Text style={[sectionHeadingStyle, { color: theme.colors.text, marginBottom: 0 }]}>
                    Available Providers
                </Text>
                {hiddenProviderCount > 0 && (
                    <View
                        style={[
                            countBadgeStyle,
                            {
                                backgroundColor: theme.colors.surfaceAlt,
                                borderColor: theme.colors.border,
                            },
                        ]}
                    >
                        <Text style={[countBadgeTextStyle, { color: theme.colors.mutedText }]}>
                            {hiddenProviderCount} hidden by category
                        </Text>
                    </View>
                )}
            </View>
            <View style={listStyle}>
                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            Loading available providers...
                        </Text>
                    </ThemedCard>
                ) : error ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{error}</Text>
                    </ThemedCard>
                ) : companies.length === 0 ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            {hiddenProviderCount > 0
                                ? formatAvailableProviderEmptyText(selectedCategoryLabels)
                                : 'No available providers are listed yet.'}
                        </Text>
                    </ThemedCard>
                ) : (
                    companies.map((company) => (
                        <ApprovedServiceProviderCard
                            key={company.id}
                            company={company}
                            requesting={requestingCompanyId === company.id}
                            providerStatus={providerStatusByCompanyId[company.id] || ''}
                            onRequestConnection={onRequestConnection}
                        />
                    ))
                )}
            </View>
        </View>
    );
}

function RelationshipHistoryGrid({
    sections,
    companiesById,
    actionConnectionId,
    actionType,
    onApprove,
    onDecline,
}: {
    sections: RelationshipHistorySection[];
    companiesById: Record<string, CompanyRecord>;
    actionConnectionId: string;
    actionType: ConnectionAction | '';
    onApprove: (connectionId: string) => void;
    onDecline: (connectionId: string) => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={sectionStyle}>
            <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Connection History</Text>
            <View style={historyGridStyle}>
                {sections.map((section) => (
                    <ThemedCard key={section.title} style={historyCardStyle}>
                        <View style={historyCardHeaderStyle}>
                            <Text style={[historyCardTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                                {section.title}
                            </Text>
                            <View
                                style={[
                                    countBadgeStyle,
                                    {
                                        backgroundColor: theme.colors.surfaceAlt,
                                        borderColor: theme.colors.border,
                                    },
                                ]}
                            >
                                <Text style={[countBadgeTextStyle, { color: theme.colors.text }]}>
                                    {section.connections.length}
                                </Text>
                            </View>
                        </View>

                        {section.connections.length === 0 ? (
                            <Text style={[compactEmptyTextStyle, { color: theme.colors.mutedText }]}>
                                {section.emptyText}
                            </Text>
                        ) : (
                            <View style={compactConnectionListStyle}>
                                {section.connections.slice(0, 3).map((connection) => (
                                    <CompactConnectionRow
                                        key={connection.id}
                                        connection={connection}
                                        company={companiesById[connection.company_id]}
                                        showActions={!!section.showActions}
                                        actionConnectionId={actionConnectionId}
                                        actionType={actionType}
                                        onApprove={onApprove}
                                        onDecline={onDecline}
                                    />
                                ))}
                                {section.connections.length > 3 && (
                                    <Text style={[compactMoreTextStyle, { color: theme.colors.mutedText }]}>
                                        +{section.connections.length - 3} more
                                    </Text>
                                )}
                            </View>
                        )}
                    </ThemedCard>
                ))}
            </View>
        </View>
    );
}

function CompactConnectionRow({
    connection,
    company,
    showActions,
    actionConnectionId,
    actionType,
    onApprove,
    onDecline,
}: {
    connection: PropertyConnection;
    company?: CompanyRecord;
    showActions: boolean;
    actionConnectionId: string;
    actionType: ConnectionAction | '';
    onApprove: (connectionId: string) => void;
    onDecline: (connectionId: string) => void;
}) {
    const { theme } = useTheme();
    const status = normalizeStatus(connection.status);
    const displayName = getCompanyDisplayName(company);
    const showPendingActions = showActions && status === 'pending';

    return (
        <View style={[compactConnectionRowStyle, { borderColor: theme.colors.border }]}>
            <View style={compactConnectionHeaderStyle}>
                <Text style={[compactCompanyNameStyle, { color: theme.colors.text }]} numberOfLines={2}>
                    {displayName}
                </Text>
                <View
                    style={[
                        compactStatusBadgeStyle,
                        {
                            backgroundColor:
                                status === 'connected'
                                    ? theme.colors.status.good.background
                                    : status === 'declined' || status === 'revoked'
                                      ? theme.colors.dangerBackground
                                      : theme.colors.status.notInspected.background,
                            borderColor:
                                status === 'connected'
                                    ? theme.colors.status.good.border
                                    : status === 'declined' || status === 'revoked'
                                      ? theme.colors.danger
                                      : theme.colors.status.notInspected.border,
                        },
                    ]}
                >
                    <Text style={[compactStatusTextStyle, { color: theme.colors.text }]}>
                        {formatStatusLabel(status)}
                    </Text>
                </View>
            </View>
            <Text style={[compactDateTextStyle, { color: theme.colors.mutedText }]}>
                {formatDateTime(connection.created_at)}
            </Text>

            {showPendingActions && (
                <View style={compactActionRowStyle}>
                    <ThemedButton
                        title={actionConnectionId === connection.id && actionType === 'approve' ? '...' : 'Approve'}
                        onPress={() => onApprove(connection.id)}
                        disabled={actionConnectionId === connection.id}
                        style={compactActionButtonStyle}
                        textStyle={compactActionButtonTextStyle}
                    />
                    <ThemedButton
                        title={actionConnectionId === connection.id && actionType === 'decline' ? '...' : 'Decline'}
                        onPress={() => onDecline(connection.id)}
                        disabled={actionConnectionId === connection.id}
                        variant="danger"
                        style={compactActionButtonStyle}
                        textStyle={compactActionButtonTextStyle}
                    />
                </View>
            )}
        </View>
    );
}

function ApprovedServiceProviderCard({
    company,
    requesting,
    providerStatus,
    onRequestConnection,
}: {
    company: CompanyRecord;
    requesting: boolean;
    providerStatus: string;
    onRequestConnection: (company: CompanyRecord) => void | Promise<void>;
}) {
    const { theme } = useTheme();
    const [logoFailed, setLogoFailed] = useState(false);
    const displayName = getCompanyDisplayName(company);
    const dbaName = getCompanyDbaName(company, displayName);
    const categories = getCompanyCategories(company);
    const logoUrl = company.logo_url?.trim() || '';
    const primaryColor = safeColor(company.primary_color, theme.colors.primary);
    const secondaryColor = safeColor(company.secondary_color, theme.colors.primaryText);
    const accentColor = safeColor(company.accent_color, theme.colors.link);
    const providerAlreadyPreferred = providerStatus === 'preferred';
    const providerButtonDisabled = requesting || providerAlreadyPreferred;
    const requestButtonTitle = requesting
        ? 'Choosing...'
        : providerAlreadyPreferred
          ? 'Preferred'
          : 'Choose Provider';

    useEffect(() => {
        setLogoFailed(false);
    }, [logoUrl]);

    return (
        <ThemedCard style={[companyCardStyle, { borderColor: accentColor }]}>
            <View style={companyHeaderStyle}>
                {logoUrl && !logoFailed ? (
                    <Image
                        source={{ uri: logoUrl }}
                        onError={() => setLogoFailed(true)}
                        style={[
                            logoStyle,
                            {
                                backgroundColor: theme.colors.surfaceAlt,
                                borderColor: theme.colors.border,
                            },
                        ]}
                        resizeMode="cover"
                    />
                ) : (
                    <View
                        style={[
                            logoStyle,
                            {
                                backgroundColor: primaryColor,
                                borderColor: accentColor,
                            },
                        ]}
                    >
                        <Text style={[logoInitialStyle, { color: secondaryColor }]}>
                            {getFallbackInitial(displayName)}
                        </Text>
                    </View>
                )}

                <View style={companyContentStyle}>
                    <Text numberOfLines={2} style={[cardTitleStyle, { color: theme.colors.text }]}>
                        {displayName}
                    </Text>
                    <Text numberOfLines={1} style={[dbaTextStyle, { color: accentColor }]}>
                        DBA: {dbaName}
                    </Text>

                    <Text numberOfLines={3} style={[descriptionTextStyle, { color: theme.colors.mutedText }]}>
                        {company.short_description || 'No company description added yet.'}
                    </Text>

                    <View style={categoryRowStyle}>
                        {categories.slice(0, 5).map((category, index) => (
                            <View
                                key={`${company.id}-${category}-${index}`}
                                style={[
                                    categoryPillStyle,
                                    {
                                        backgroundColor: theme.colors.surfaceAlt,
                                        borderColor: theme.colors.border,
                                    },
                                ]}
                            >
                                <Text style={[categoryTextStyle, { color: accentColor }]}>{category}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            <View style={statRowStyle}>
                <CompanyStat label="Rating" value={formatRating(company.homeos_rating)} />
                <CompanyStat label="Ratings" value={formatRatingCount(company.homeos_rating_count)} />
                <CompanyStat
                    label="Experience"
                    value={formatExperienceYears(company.combined_experience_years)}
                />
                <CompanyStat label="License" value={formatLicenseNumber(company.license_number)} />
            </View>

            {(company.phone || company.website) && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    {[company.phone, company.website].filter(Boolean).join(' | ')}
                </Text>
            )}

            <ThemedButton
                title={requestButtonTitle}
                onPress={() => onRequestConnection(company)}
                disabled={providerButtonDisabled}
                variant="secondary"
                style={{ marginTop: 16 }}
            />
        </ThemedCard>
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
    statusLabelOverride = '',
    dateLabelOverride = 'Requested Date',
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
    statusLabelOverride?: string;
    dateLabelOverride?: string;
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
                        <CompanyConnectionCard
                            key={connection.id}
                            connection={connection}
                            company={companiesById[connection.company_id]}
                            showActions={showActions}
                            actionConnectionId={actionConnectionId}
                            actionType={actionType}
                            statusLabelOverride={statusLabelOverride}
                            dateLabelOverride={dateLabelOverride}
                            onApprove={onApprove}
                            onDecline={onDecline}
                        />
                    ))
                )}
            </View>
        </View>
    );
}

function CompanyConnectionCard({
    connection,
    company,
    showActions,
    actionConnectionId,
    actionType,
    statusLabelOverride,
    dateLabelOverride,
    onApprove,
    onDecline,
}: {
    connection: PropertyConnection;
    company?: CompanyRecord;
    showActions: boolean;
    actionConnectionId: string;
    actionType: ConnectionAction | '';
    statusLabelOverride: string;
    dateLabelOverride: string;
    onApprove?: (connectionId: string) => void;
    onDecline?: (connectionId: string) => void;
}) {
    const { theme } = useTheme();
    const [logoFailed, setLogoFailed] = useState(false);
    const status = normalizeStatus(connection.status);
    const displayName = getCompanyDisplayName(company);
    const dbaName = getCompanyDbaName(company, displayName);
    const categories = getCompanyCategories(company);
    const logoUrl = company?.logo_url?.trim() || '';
    const primaryColor = safeColor(company?.primary_color, theme.colors.primary);
    const secondaryColor = safeColor(company?.secondary_color, theme.colors.primaryText);
    const accentColor = safeColor(company?.accent_color, theme.colors.link);
    const showPendingActions = showActions && status === 'pending';
    const statusLabel = statusLabelOverride || formatStatusLabel(status);
    const statusForPalette = statusLabelOverride ? 'connected' : status;
    const statusPalette =
        statusForPalette === 'connected'
            ? {
                  backgroundColor: theme.colors.status.good.background,
                  borderColor: theme.colors.status.good.border,
              }
            : statusForPalette === 'declined' || statusForPalette === 'revoked'
              ? {
                    backgroundColor: theme.colors.dangerBackground,
                    borderColor: theme.colors.danger,
                }
              : {
                    backgroundColor: theme.colors.status.notInspected.background,
                    borderColor: theme.colors.status.notInspected.border,
                };

    useEffect(() => {
        setLogoFailed(false);
    }, [logoUrl]);

    return (
        <ThemedCard style={[companyCardStyle, { borderColor: accentColor }]}>
            <View style={companyHeaderStyle}>
                {logoUrl && !logoFailed ? (
                    <Image
                        source={{ uri: logoUrl }}
                        onError={() => setLogoFailed(true)}
                        style={[
                            logoStyle,
                            {
                                backgroundColor: theme.colors.surfaceAlt,
                                borderColor: theme.colors.border,
                            },
                        ]}
                        resizeMode="cover"
                    />
                ) : (
                    <View
                        style={[
                            logoStyle,
                            {
                                backgroundColor: primaryColor,
                                borderColor: accentColor,
                            },
                        ]}
                    >
                        <Text style={[logoInitialStyle, { color: secondaryColor }]}>
                            {getFallbackInitial(displayName)}
                        </Text>
                    </View>
                )}

                <View style={companyContentStyle}>
                    <View style={companyTitleRowStyle}>
                        <View style={companyNameBlockStyle}>
                            <Text numberOfLines={2} style={[cardTitleStyle, { color: theme.colors.text }]}>
                                {displayName}
                            </Text>
                            <Text numberOfLines={1} style={[dbaTextStyle, { color: accentColor }]}>
                                DBA: {dbaName}
                            </Text>
                        </View>

                        <View style={[statusBadgeStyle, statusPalette]}>
                            <Text style={[statusBadgeTextStyle, { color: theme.colors.text }]}>
                                {statusLabel}
                            </Text>
                        </View>
                    </View>

                    <Text numberOfLines={3} style={[descriptionTextStyle, { color: theme.colors.mutedText }]}>
                        {company?.short_description || 'No company description added yet.'}
                    </Text>

                    <View style={categoryRowStyle}>
                        {categories.slice(0, 5).map((category, index) => (
                            <View
                                key={`${category}-${index}`}
                                style={[
                                    categoryPillStyle,
                                    {
                                        backgroundColor: theme.colors.surfaceAlt,
                                        borderColor: theme.colors.border,
                                    },
                                ]}
                            >
                                <Text style={[categoryTextStyle, { color: accentColor }]}>{category}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            <View style={statRowStyle}>
                <CompanyStat label="Rating" value={formatRating(company?.homeos_rating)} />
                <CompanyStat label="Ratings" value={formatRatingCount(company?.homeos_rating_count)} />
                <CompanyStat
                    label="Experience"
                    value={formatExperienceYears(company?.combined_experience_years)}
                />
                <CompanyStat label="License" value={formatLicenseNumber(company?.license_number)} />
            </View>

            {(company?.phone || company?.website) && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    {[company.phone, company.website].filter(Boolean).join(' | ')}
                </Text>
            )}

            <View style={detailBlockStyle}>
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    {dateLabelOverride}: {formatDateTime(connection.created_at)}
                </Text>
                <Text style={[permissionLabelStyle, { color: theme.colors.text }]}>
                    {showPendingActions ? 'Requested Permissions' : 'Permissions'}
                </Text>
                <View style={permissionRowStyle}>
                    {formatPermissionItems(connection).map((permission) => (
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
                                {permission.label}: {permission.value}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>

            {showPendingActions && (
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
    );
}

function CompanyStat({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View
            style={[
                statPillStyle,
                {
                    backgroundColor: theme.colors.surfaceAlt,
                    borderColor: theme.colors.border,
                },
            ]}
        >
            <Text style={[statLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[statValueStyle, { color: theme.colors.text }]}>{value}</Text>
        </View>
    );
}

function normalizeStatus(status: string | null) {
    return String(status || 'pending').trim().toLowerCase();
}

function normalizeRequestSource(source: string | null) {
    return String(source || '').trim().toLowerCase();
}

function isChosenProviderConnection(connection: PropertyConnection) {
    const source = normalizeRequestSource(connection.request_source);
    const status = normalizeStatus(connection.status);

    return (
        source === 'homeowner_provider_request' &&
        status !== 'revoked' &&
        status !== 'expired' &&
        status !== 'declined'
    );
}

function preferredProviderToConnection(provider: PreferredProviderRow): PropertyConnection {
    return {
        id: provider.property_connection_id || `preferred-${provider.property_id}-${provider.company_id}`,
        property_id: provider.property_id,
        company_id: provider.company_id,
        status: 'connected',
        request_source: provider.source || 'preferred_provider',
        can_view_documents: false,
        can_view_photos: false,
        can_view_service_history: false,
        can_view_quotes: false,
        created_at: provider.selected_at,
        expires_at: null,
    };
}

function formatPermissionItems(connection: PropertyConnection) {
    return [
        {
            label: 'Photos',
            value: connection.can_view_photos ? 'Shared' : 'Private',
            shared: !!connection.can_view_photos,
        },
        {
            label: 'Documents',
            value: connection.can_view_documents ? 'Shared' : 'Private',
            shared: !!connection.can_view_documents,
        },
        {
            label: 'Service History',
            value: connection.can_view_service_history ? 'Shared' : 'Private',
            shared: !!connection.can_view_service_history,
        },
        {
            label: 'Quotes',
            value: connection.can_view_quotes ? 'Shared' : 'Private',
            shared: !!connection.can_view_quotes,
        },
    ];
}

function firstRow<T>(data: unknown): T | null {
    if (Array.isArray(data)) return (data[0] as T | undefined) || null;
    return (data as T | null) || null;
}

function isMissingProviderRequestRpc(error: {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
}) {
    const code = String(error.code || '').trim().toUpperCase();
    const text = [error.message, error.details, error.hint]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

    return (
        code === 'PGRST202' ||
        code === '42883' ||
        text.includes('request_property_provider_connection') ||
        text.includes('could not find the function')
    );
}

function getCompanyDisplayName(company?: CompanyRecord) {
    return company?.public_name?.trim() || company?.name?.trim() || 'Company';
}

function getCompanyDbaName(company: CompanyRecord | undefined, displayName: string) {
    return company?.dba_name?.trim() || company?.name?.trim() || displayName;
}

function getCompanyCategories(company?: CompanyRecord) {
    const categories = getCompanyCategoryOptions(company).map((category) => category.label);

    return categories.length > 0 ? categories : ['No categories listed'];
}

function getCompanyCategoryKeys(company?: CompanyRecord) {
    const keys = getCompanyCategoryOptions(company).map((category) => category.key);

    return Array.from(new Set(keys));
}

function getCompanyCategoryOptions(company?: CompanyRecord) {
    const categoriesByKey = new Map<string, CompanyCategoryOption>();

    (company?.service_categories || []).forEach((category) => {
        const label = category.trim();

        if (!label) return;

        const categoryKeys = inferProviderCategoryKeysFromText(label);
        const keys = categoryKeys.length > 0 ? categoryKeys : [slugifyProviderCategory(label)];

        keys.forEach((categoryKey) => {
            addCompanyCategoryOption(categoriesByKey, {
                key: categoryKey,
                label,
                inferred: false,
            });
        });
    });

    inferProviderCategoryKeysFromText(getCompanyCategoryInferenceText(company)).forEach((categoryKey) => {
        addCompanyCategoryOption(categoriesByKey, {
            key: categoryKey,
            label: formatProviderCategoryLabel(categoryKey),
            inferred: true,
        });
    });

    return Array.from(categoriesByKey.values());
}

function addCompanyCategoryOption(
    categoriesByKey: Map<string, CompanyCategoryOption>,
    category: CompanyCategoryOption
) {
    const existingCategory = categoriesByKey.get(category.key);

    if (existingCategory && !existingCategory.inferred) return;

    categoriesByKey.set(category.key, category);
}

function getCompanyCategoryInferenceText(company?: CompanyRecord) {
    return [
        company?.public_name,
        company?.name,
        company?.dba_name,
        company?.short_description,
        company?.website,
    ]
        .map((value) => value?.trim() || '')
        .filter(Boolean)
        .join(' ');
}

function inferProviderCategoryKeysFromText(value: string) {
    const compactText = normalizeProviderCategoryText(value);
    const categoryKeys: string[] = [];

    if (!compactText) return [];

    if (
        compactText.includes('plumb') ||
        compactText.includes('plumber') ||
        compactText.includes('water heater') ||
        compactText.includes('waterheater') ||
        compactText.includes('tankless') ||
        compactText.includes('drain') ||
        compactText.includes('sewer') ||
        compactText.includes('repipe') ||
        compactText.includes('slab leak') ||
        compactText.includes('leak') ||
        compactText.includes('gas line') ||
        compactText.includes('gasline') ||
        compactText.includes('water line') ||
        compactText.includes('waterline') ||
        compactText.includes('water treatment') ||
        compactText.includes('water quality')
    ) {
        categoryKeys.push('plumbing');
    }

    if (/\b(hvac|heating|cooling|air conditioning|air conditioner|furnace)\b/.test(compactText)) {
        categoryKeys.push('hvac');
    }

    if (/\b(electric|electrical|outlet|breaker|panel)\b/.test(compactText)) {
        categoryKeys.push('electrical');
    }

    if (/\b(roof|roofing|gutter)\b/.test(compactText)) {
        categoryKeys.push('roofing');
    }

    if (/\b(paint|painting|drywall)\b/.test(compactText)) {
        categoryKeys.push('painting');
    }

    if (/\b(siding|stucco|exterior)\b/.test(compactText)) {
        categoryKeys.push('exterior');
    }

    return Array.from(new Set(categoryKeys));
}

function normalizeProviderCategoryText(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function slugifyProviderCategory(value: string) {
    return normalizeProviderCategoryText(value).replace(/\s+/g, '-');
}

function formatProviderCategoryLabel(categoryKey: string) {
    const labels: Record<string, string> = {
        plumbing: 'Plumbing',
        hvac: 'HVAC',
        electrical: 'Electrical',
        roofing: 'Roofing',
        painting: 'Painting',
        exterior: 'Exterior',
    };

    if (labels[categoryKey]) return labels[categoryKey];

    return categoryKey
        .split('-')
        .filter(Boolean)
        .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatAvailableProviderEmptyText(selectedCategoryLabels: string[]) {
    if (selectedCategoryLabels.length === 0) return 'No other provider categories available right now.';

    if (selectedCategoryLabels.length === 1) {
        return `You already have a ${selectedCategoryLabels[0]} provider selected.`;
    }

    return `You already have providers selected for ${selectedCategoryLabels.join(', ')}.`;
}

function hasCategoryOverlap(firstCategoryKeys: string[], secondCategoryKeys: string[]) {
    if (firstCategoryKeys.length === 0 || secondCategoryKeys.length === 0) return false;

    return firstCategoryKeys.some((categoryKey) => secondCategoryKeys.includes(categoryKey));
}

function getFallbackInitial(displayName: string) {
    return displayName.trim().slice(0, 1).toUpperCase() || '?';
}

function safeColor(value: string | null | undefined, fallback: string) {
    const color = value?.trim() || '';

    return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : fallback;
}

function formatStatusLabel(status: string) {
    const labels: Record<string, string> = {
        connected: 'Connected',
        pending: 'Pending',
        revoked: 'Revoked',
        declined: 'Declined',
    };

    return labels[status] || status.slice(0, 1).toUpperCase() + status.slice(1);
}

function formatRating(value: number | null | undefined) {
    const rating = Number(value || 0);

    if (!Number.isFinite(rating) || rating <= 0) return 'Not rated';

    return `${rating.toFixed(1)} stars`;
}

function formatRatingCount(value: number | null | undefined) {
    const ratingCount = Math.max(0, Math.round(Number(value || 0)));

    return `${ratingCount} ${ratingCount === 1 ? 'rating' : 'ratings'}`;
}

function formatExperienceYears(value: number | null | undefined) {
    const years = Math.max(0, Math.round(Number(value || 0)));

    if (years === 0) return 'Not listed';

    return `${years} ${years === 1 ? 'year' : 'years'} combined`;
}

function formatLicenseNumber(value: string | null | undefined) {
    return value?.trim() || 'Not listed';
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

const sectionTitleRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 14,
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

const historyGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const historyCardStyle = {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 150,
    maxWidth: 430,
};

const historyCardHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
};

const historyCardTitleStyle = {
    flex: 1,
    fontSize: 15,
    fontWeight: '900' as const,
    lineHeight: 20,
};

const countBadgeStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
};

const countBadgeTextStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
};

const compactEmptyTextStyle = {
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 18,
    marginTop: 12,
};

const compactConnectionListStyle = {
    gap: 8,
    marginTop: 12,
};

const compactConnectionRowStyle = {
    borderTopWidth: 1,
    paddingTop: 9,
};

const compactConnectionHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
};

const compactCompanyNameStyle = {
    flex: 1,
    fontSize: 13,
    fontWeight: '900' as const,
    lineHeight: 18,
};

const compactStatusBadgeStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
};

const compactStatusTextStyle = {
    fontSize: 10,
    fontWeight: '900' as const,
};

const compactDateTextStyle = {
    fontSize: 11,
    fontWeight: '800' as const,
    lineHeight: 16,
    marginTop: 4,
};

const compactActionRowStyle = {
    flexDirection: 'row' as const,
    gap: 6,
    marginTop: 8,
};

const compactActionButtonStyle = {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
};

const compactActionButtonTextStyle = {
    fontSize: 11,
};

const compactMoreTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    marginTop: 2,
};

const companyCardStyle = {
    borderWidth: 2,
};

const companyHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 14,
};

const companyContentStyle = {
    flex: 1,
    minWidth: 0,
};

const companyTitleRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
};

const companyNameBlockStyle = {
    flex: 1,
    minWidth: 180,
};

const logoStyle = {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const logoInitialStyle = {
    fontSize: 27,
    fontWeight: '900' as const,
};

const statusBadgeStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
};

const statusBadgeTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
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

const dbaTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginTop: 4,
};

const descriptionTextStyle = {
    fontSize: 14,
    fontWeight: '700' as const,
    lineHeight: 20,
    marginTop: 8,
};

const categoryRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const categoryPillStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
};

const categoryTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const statRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 16,
};

const statPillStyle = {
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const statLabelStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const statValueStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginTop: 3,
};

const detailBlockStyle = {
    marginTop: 14,
};

const permissionLabelStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
    marginTop: 12,
};

const permissionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 8,
};

const permissionPillStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
};

const permissionTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const metaTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 6,
};
