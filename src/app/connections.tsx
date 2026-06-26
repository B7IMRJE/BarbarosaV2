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

type ConnectionAction = 'approve' | 'decline';

type ProviderConnectionRequestResult = {
    connection_id: string;
    preferred_provider_id: string;
    company_property_client_id: string;
    property_id: string;
    company_id: string;
    status: string;
};

const companyProfileSelect =
    'id, name, public_name, dba_name, logo_url, primary_color, secondary_color, accent_color, service_categories, homeos_rating, homeos_rating_count, combined_experience_years, license_number, phone, website, short_description';

export default function ConnectionsScreen() {
    const { theme } = useTheme();
    const [connections, setConnections] = useState<PropertyConnection[]>([]);
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
            setCompaniesById({});
            setProviderRequestPropertyId('');
            setProviderRequestUnavailableReason('Create your first home before requesting a provider connection.');
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
            setApprovedCompaniesError(`Could not load approved providers: ${error.message}`);
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
                    'Choose one active home before requesting a provider connection.'
            );
            return;
        }

        setProviderActionCompanyId(company.id);
        setMessage(`Requesting connection with ${providerName}...`);

        const { data, error } = await supabase.rpc('request_property_provider_connection', {
            p_property_id: providerRequestPropertyId,
            p_company_id: company.id,
        });

        setProviderActionCompanyId('');

        if (error) {
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

        await loadConnections();
        setMessage(
            status === 'connected'
                ? `${providerName} is already connected and is now your preferred provider.`
                : `Connection requested with ${providerName}. The provider relationship is now pending.`
        );
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

                <ApprovedServiceProvidersSection
                    companies={approvedCompanies}
                    loading={approvedCompaniesLoading}
                    error={approvedCompaniesError}
                    requestingCompanyId={providerActionCompanyId}
                    onRequestConnection={handleProviderSelection}
                />

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

function ApprovedServiceProvidersSection({
    companies,
    loading,
    error,
    requestingCompanyId,
    onRequestConnection,
}: {
    companies: CompanyRecord[];
    loading: boolean;
    error: string;
    requestingCompanyId: string;
    onRequestConnection: (company: CompanyRecord) => void | Promise<void>;
}) {
    const { theme } = useTheme();

    return (
        <View style={sectionStyle}>
            <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Approved Service Providers</Text>
            <View style={listStyle}>
                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            Loading approved providers...
                        </Text>
                    </ThemedCard>
                ) : error ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{error}</Text>
                    </ThemedCard>
                ) : companies.length === 0 ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            No approved service providers are available yet.
                        </Text>
                    </ThemedCard>
                ) : (
                    companies.map((company) => (
                        <ApprovedServiceProviderCard
                            key={company.id}
                            company={company}
                            requesting={requestingCompanyId === company.id}
                            onRequestConnection={onRequestConnection}
                        />
                    ))
                )}
            </View>
        </View>
    );
}

function ApprovedServiceProviderCard({
    company,
    requesting,
    onRequestConnection,
}: {
    company: CompanyRecord;
    requesting: boolean;
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
                title={requesting ? 'Requesting...' : 'Request Connection'}
                onPress={() => onRequestConnection(company)}
                disabled={requesting}
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
                        <CompanyConnectionCard
                            key={connection.id}
                            connection={connection}
                            company={companiesById[connection.company_id]}
                            showActions={showActions}
                            actionConnectionId={actionConnectionId}
                            actionType={actionType}
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
    onApprove,
    onDecline,
}: {
    connection: PropertyConnection;
    company?: CompanyRecord;
    showActions: boolean;
    actionConnectionId: string;
    actionType: ConnectionAction | '';
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
    const statusPalette =
        status === 'connected'
            ? {
                  backgroundColor: theme.colors.status.good.background,
                  borderColor: theme.colors.status.good.border,
              }
            : status === 'declined' || status === 'revoked'
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
                                {formatStatusLabel(status)}
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
                    Requested Date: {formatDateTime(connection.created_at)}
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
    const categories = (company?.service_categories || [])
        .map((category) => category.trim())
        .filter(Boolean);

    return categories.length > 0 ? categories : ['No categories listed'];
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
