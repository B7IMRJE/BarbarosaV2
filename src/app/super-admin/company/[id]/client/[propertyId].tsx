import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import AdminNavBar from '../../../../../components/AdminNavBar';
import ThemedButton from '../../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../../components/theme/ThemedCard';
import { verifyCustomerWorkspaceAccess } from '../../../../../lib/customerWorkspaceAccess';
import {
    loadCompanyDispatchRequestsForProperty,
    type CompanyDispatchServiceRequest,
} from '../../../../../lib/homeServiceRequests';
import {
    addProviderStagedWork,
    loadProviderStagedWorkWithStatus,
    providerStagedWorkTypeLabel,
    type ProviderStagedWorkEntry,
} from '../../../../../lib/providerStagedWork';
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

type CompanyEmergencyIntake = {
    id: string;
    source: 'service_request' | 'provider_staged_work';
    sourceLabel: string;
    title: string;
    description: string;
    status: string | null;
    created_at: string | null;
    requestId: string | null;
    emergencyId: string | null;
};

export default function CompanyClientDetailScreen() {
    const { theme } = useTheme();
    const { id, propertyId } = useLocalSearchParams<{ id: string; propertyId: string }>();
    const companyId = String(id || '');
    const clientPropertyId = String(propertyId || '');
    const clientsRoute = `/super-admin/company/${companyId}/clients` as Href;
    const clientRoute = `/super-admin/company/${companyId}/client/${clientPropertyId}`;
    const [company, setCompany] = useState<CompanyRecord | null>(null);
    const [client, setClient] = useState<CompanyClient | null>(null);
    const [property, setProperty] = useState<PropertyRecord | null>(null);
    const [connection, setConnection] = useState<PropertyConnection | null>(null);
    const [invite, setInvite] = useState<CustomerInvite | null>(null);
    const [stagedEntries, setStagedEntries] = useState<ProviderStagedWorkEntry[]>([]);
    const [stagingStatusMessage, setStagingStatusMessage] = useState('');
    const [emergencyIntakes, setEmergencyIntakes] = useState<CompanyEmergencyIntake[]>([]);
    const [emergencyIntakeMessage, setEmergencyIntakeMessage] = useState('');
    const [showNoteForm, setShowNoteForm] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [savingAction, setSavingAction] = useState('');
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
        setEmergencyIntakes([]);
        setEmergencyIntakeMessage('');
        setStagedEntries([]);
        setStagingStatusMessage('');

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
            loadCustomerStagedEntries(),
            loadCompanyEmergencyIntakes(),
        ]);
        setLoading(false);
    }

    async function verifyClientDetailAccess(targetCompanyId: string) {
        const access = await verifyCustomerWorkspaceAccess(targetCompanyId);

        if (!access.userId) {
            router.replace('/auth/login' as never);
            return false;
        }

        if (access.allowed) return true;

        setMessage(access.error || 'You do not have customer access for this company.');
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

    async function loadCustomerStagedEntries() {
        try {
            const result = await loadProviderStagedWorkWithStatus({
                companyId,
                propertyId: clientPropertyId,
            });

            setStagedEntries(result.entries.filter(isCustomerWorkspaceEntry));
            setStagingStatusMessage(result.backendStatus.message);
        } catch (error) {
            setStagedEntries([]);
            setStagingStatusMessage(`Provider staging unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async function loadCompanyEmergencyIntakes() {
        const [dispatchResult, stagedResult] = await Promise.allSettled([
            loadCompanyDispatchRequestsForProperty({
                companyId,
                propertyId: clientPropertyId,
            }),
            loadProviderStagedWorkWithStatus({
                companyId,
                propertyId: clientPropertyId,
            }),
        ]);
        const nextIntakes: CompanyEmergencyIntake[] = [];
        const statusMessages: string[] = [];

        if (dispatchResult.status === 'fulfilled') {
            nextIntakes.push(
                ...dispatchResult.value
                    .filter(isEmergencyDispatchRequest)
                    .map(mapDispatchRequestToEmergencyIntake)
            );
        } else {
            statusMessages.push(`Dispatch requests unavailable: ${getErrorMessage(dispatchResult.reason)}`);
        }

        if (stagedResult.status === 'fulfilled') {
            nextIntakes.push(
                ...stagedResult.value.entries
                    .filter(isCompanyVisibleHomeOsEmergencyStagedEntry)
                    .map(mapStagedEntryToEmergencyIntake)
            );

            if (stagedResult.value.backendStatus.status !== 'connected') {
                statusMessages.push('Provider emergency staging is not connected.');
            }
        } else {
            statusMessages.push(`Provider emergency staging unavailable: ${getErrorMessage(stagedResult.reason)}`);
        }

        setEmergencyIntakes(sortEmergencyIntakes(nextIntakes).slice(0, 8));
        setEmergencyIntakeMessage(statusMessages.join(' '));
    }

    function openEstimateDraft() {
        router.push({
            pathname: '/estimate',
            params: {
                providerMode: '1',
                companyId,
                propertyId: clientPropertyId,
                returnTo: clientRoute,
            },
        } as never);
    }

    async function saveCustomerNote() {
        const cleanNote = noteText.trim();

        if (!cleanNote) {
            setMessage('Add a note before saving.');
            return;
        }

        await saveCustomerStagedEntry({
            type: 'note',
            actionKey: 'note',
            successMessage: 'Company note saved for this customer.',
            payload: {
                source: 'customer_detail_note',
                visibility: 'company_only',
                note: cleanNote,
                details: cleanNote,
                customer_home_name: homeName,
            },
        });

        setNoteText('');
        setShowNoteForm(false);
    }

    async function requestJobHistoryAccess() {
        await saveCustomerStagedEntry({
            type: 'client_update_mark',
            actionKey: 'history',
            successMessage: 'Job/history access request logged. Homeowner approval workflow comes next.',
            payload: {
                source: 'request_job_history_access',
                visibility: 'company_only',
                requested_access: ['service_history'],
                message: 'Company requested service and job history access.',
            },
        });
    }

    async function requestServiceAccess() {
        await saveCustomerStagedEntry({
            type: 'client_update_mark',
            actionKey: 'access',
            successMessage: 'Service access request logged for this client.',
            payload: {
                source: 'service_access_request',
                visibility: 'company_only',
                requested_access: ['photos', 'documents', 'service_history', 'quotes'],
                message: 'Company requested expanded service access.',
            },
        });
    }

    async function saveCustomerStagedEntry({
        type,
        actionKey,
        successMessage,
        payload,
    }: {
        type: 'note' | 'client_update_mark';
        actionKey: string;
        successMessage: string;
        payload: Record<string, string | string[]>;
    }) {
        setSavingAction(actionKey);
        setMessage('');

        try {
            const access = await verifyCustomerWorkspaceAccess(companyId);

            if (!access.allowed || !access.userId) {
                setMessage(access.error || 'You do not have customer access for this company.');
                return;
            }

            await addProviderStagedWork({
                type,
                company_id: companyId,
                property_id: clientPropertyId,
                item_id: null,
                item_slug: null,
                item_name: homeName,
                system: 'Customer Home',
                location: formatAddress(property) || null,
                category: type === 'note' ? 'Customer Note' : 'Access Request',
                created_by: access.userId,
                payload: {
                    ...payload,
                    company_id: companyId,
                    property_id: clientPropertyId,
                },
                status: 'draft',
            });

            await loadCustomerStagedEntries();
            setMessage(successMessage);
        } catch (error) {
            setMessage(`Could not save customer workspace action: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSavingAction('');
        }
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
                                body={connection?.can_view_service_history ? 'Shared history workflow can open here later.' : 'Log a service history access request for homeowner approval.'}
                                onPress={requestJobHistoryAccess}
                            />
                            <ActionCard
                                title="Estimates / Proposals"
                                body="Open this company’s provider estimate draft for this customer."
                                onPress={openEstimateDraft}
                            />
                            <ActionCard
                                title="Add Note"
                                body="Save a company-side customer note. It will not change the homeowner’s HomeOS."
                                onPress={() => setShowNoteForm((current) => !current)}
                            />
                            <ActionCard
                                title="Service Access Request"
                                body="Log an access request for photos, documents, history, and quotes."
                                onPress={requestServiceAccess}
                            />
                            <ActionCard
                                title="Open Shared Documents"
                                body={connection?.can_view_documents ? 'Open documents shared with this company plus staged document intents.' : 'Open staged documents and request access to private homeowner documents.'}
                                onPress={() => router.push(`/super-admin/company/${companyId}/client/${clientPropertyId}/documents` as never)}
                            />
                            <ActionCard
                                title="Open Shared Photos"
                                body={connection?.can_view_photos ? 'Open photos shared with this company plus provider staged photos.' : 'Open provider staged photos and request access to private homeowner photos.'}
                                onPress={() => router.push(`/super-admin/company/${companyId}/client/${clientPropertyId}/photos` as never)}
                            />
                        </View>

                        {showNoteForm && (
                            <ThemedCard style={sectionCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Add Company Note</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    This note is company-side only. It is not written to the homeowner’s permanent HomeOS.
                                </Text>
                                <TextInput
                                    value={noteText}
                                    onChangeText={setNoteText}
                                    placeholder="Add customer context, call notes, or follow-up details..."
                                    multiline
                                    style={[
                                        noteInputStyle,
                                        {
                                            borderColor: theme.colors.border,
                                            color: theme.colors.text,
                                            backgroundColor: theme.colors.surfaceAlt,
                                        },
                                    ]}
                                    placeholderTextColor={theme.colors.mutedText}
                                />
                                <View style={noteButtonRowStyle}>
                                    <ThemedButton
                                        title={savingAction === 'note' ? 'Saving...' : 'Save Note'}
                                        disabled={savingAction === 'note'}
                                        onPress={saveCustomerNote}
                                        style={smallButtonStyle}
                                        textStyle={smallButtonTextStyle}
                                    />
                                    <ThemedButton
                                        title="Cancel"
                                        variant="secondary"
                                        onPress={() => {
                                            setShowNoteForm(false);
                                            setNoteText('');
                                        }}
                                        style={smallButtonStyle}
                                        textStyle={smallButtonTextStyle}
                                    />
                                </View>
                            </ThemedCard>
                        )}

                        <ThemedCard style={sectionCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Emergency Requests</Text>
                            {!!emergencyIntakeMessage && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{emergencyIntakeMessage}</Text>
                            )}
                            {emergencyIntakes.length === 0 ? (
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    No HomeOS emergency requests are visible for this customer yet.
                                </Text>
                            ) : (
                                <View style={stagedListStyle}>
                                    {emergencyIntakes.map((intake) => (
                                        <View key={`${intake.source}-${intake.id}`} style={[stagedEntryStyle, { borderColor: theme.colors.border }]}>
                                            <Text style={[stagedEntryTitleStyle, { color: theme.colors.text }]}>
                                                {intake.title}
                                            </Text>
                                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                                {intake.description}
                                            </Text>
                                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                                Emergency / {formatStatus(intake.status)} / {intake.sourceLabel} / {formatDateTime(intake.created_at)}
                                            </Text>
                                            <View style={noteButtonRowStyle}>
                                                {intake.requestId && (
                                                    <ThemedButton
                                                        title="Open Request"
                                                        variant="secondary"
                                                        onPress={() => router.push({
                                                            pathname: '/dispatch',
                                                            params: { companyId },
                                                        } as never)}
                                                        style={smallButtonStyle}
                                                        textStyle={smallButtonTextStyle}
                                                    />
                                                )}
                                                <ThemedButton
                                                    title="Open HomeOS Emergency"
                                                    variant="secondary"
                                                    onPress={() => router.push(`/super-admin/company/${companyId}/client/${clientPropertyId}/homeos` as never)}
                                                    style={smallButtonStyle}
                                                    textStyle={smallButtonTextStyle}
                                                />
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ThemedCard>

                        <ThemedCard style={sectionCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Customer Notes & Requests</Text>
                            {!!stagingStatusMessage && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{stagingStatusMessage}</Text>
                            )}
                            {stagedEntries.length === 0 ? (
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    No company-side customer notes or access requests yet.
                                </Text>
                            ) : (
                                <View style={stagedListStyle}>
                                    {stagedEntries.slice(0, 6).map((entry) => (
                                        <View key={entry.id} style={[stagedEntryStyle, { borderColor: theme.colors.border }]}>
                                            <Text style={[stagedEntryTitleStyle, { color: theme.colors.text }]}>
                                                {customerWorkspaceEntryLabel(entry)}
                                            </Text>
                                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                                {customerWorkspaceEntrySummary(entry)}
                                            </Text>
                                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                                {providerStagedWorkTypeLabel(entry.type)} / {entry.source === 'provider_staging' ? 'Saved to provider staging' : 'Local staged entry'} / {formatDateTime(entry.created_at)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ThemedCard>

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

function getCompanyDisplayName(company?: CompanyRecord | null) {
    return company?.public_name?.trim() || company?.dba_name?.trim() || company?.name?.trim() || 'Company';
}

function isCustomerWorkspaceEntry(entry: ProviderStagedWorkEntry) {
    const source = payloadString(entry, 'source');

    return (
        source === 'customer_detail_note' ||
        source === 'request_job_history_access' ||
        source === 'service_access_request'
    );
}

function customerWorkspaceEntryLabel(entry: ProviderStagedWorkEntry) {
    const source = payloadString(entry, 'source');

    if (source === 'customer_detail_note') return 'Company Note';
    if (source === 'request_job_history_access') return 'Job/History Access Request';
    if (source === 'service_access_request') return 'Service Access Request';

    return providerStagedWorkTypeLabel(entry.type);
}

function customerWorkspaceEntrySummary(entry: ProviderStagedWorkEntry) {
    const source = payloadString(entry, 'source');

    if (source === 'customer_detail_note') {
        return payloadString(entry, 'note') || payloadString(entry, 'details') || 'Company-side note saved.';
    }

    if (source === 'request_job_history_access') {
        return 'Job/history access request logged. Homeowner approval workflow comes next.';
    }

    if (source === 'service_access_request') {
        const requestedAccess = entry.payload.requested_access;
        const accessText = Array.isArray(requestedAccess)
            ? requestedAccess.filter((value): value is string => typeof value === 'string').join(', ')
            : '';

        return accessText
            ? `Requested access: ${accessText}. Homeowner approval workflow comes next.`
            : 'Service access request logged for this client.';
    }

    return 'Company-side staged update.';
}

function isEmergencyDispatchRequest(request: CompanyDispatchServiceRequest) {
    const requestType = normalizeText(request.request_type);
    const priority = normalizeText(request.priority);
    const summary = normalizeText(request.issue_summary);

    return requestType === 'emergency' || priority === 'emergency' || summary.includes('emergency');
}

function mapDispatchRequestToEmergencyIntake(request: CompanyDispatchServiceRequest): CompanyEmergencyIntake {
    return {
        id: request.id,
        source: 'service_request',
        sourceLabel: 'Dispatch Request',
        title: 'Emergency Request',
        description: request.issue_summary || 'No emergency description provided.',
        status: request.status,
        created_at: request.created_at,
        requestId: request.id,
        emergencyId: null,
    };
}

function isCompanyVisibleHomeOsEmergencyStagedEntry(entry: ProviderStagedWorkEntry) {
    if (entry.source !== 'provider_staging') return false;

    const source = payloadString(entry, 'source');
    const system = normalizeText(entry.system);
    const itemName = normalizeText(entry.item_name);
    const category = normalizeText(entry.category);

    return (
        source === 'homeos_emergency_create' ||
        system === 'emergency' ||
        itemName === 'homeos emergency' ||
        category.includes('emergency')
    );
}

function mapStagedEntryToEmergencyIntake(entry: ProviderStagedWorkEntry): CompanyEmergencyIntake {
    return {
        id: entry.id,
        source: 'provider_staged_work',
        sourceLabel: 'Provider Staging',
        title: payloadString(entry, 'emergency_type') || entry.category || 'Emergency Request',
        description: payloadString(entry, 'description') || payloadString(entry, 'details') || 'Emergency staged for company review.',
        status: entry.status,
        created_at: entry.created_at,
        requestId: null,
        emergencyId: payloadString(entry, 'emergency_id') || null,
    };
}

function sortEmergencyIntakes(entries: CompanyEmergencyIntake[]) {
    const seen = new Set<string>();

    return entries
        .filter((entry) => {
            const key = entry.requestId
                ? `request:${entry.requestId}`
                : entry.emergencyId
                    ? `emergency:${entry.emergencyId}`
                    : `${entry.source}:${entry.id}`;

            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((left, right) => getTimeValue(right.created_at) - getTimeValue(left.created_at));
}

function payloadString(entry: ProviderStagedWorkEntry, key: string) {
    const value = entry.payload[key];

    return typeof value === 'string' ? value.trim() : '';
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error';
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

function formatDateTime(value?: string | null) {
    if (!value) return 'Not available';

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getTimeValue(value?: string | null) {
    if (!value) return 0;

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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

const noteInputStyle = {
    borderWidth: 1,
    borderRadius: 14,
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 21,
    marginTop: 14,
    minHeight: 110,
    padding: 14,
    textAlignVertical: 'top' as const,
};

const noteButtonRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 12,
};

const smallButtonStyle = {
    paddingHorizontal: 14,
    paddingVertical: 11,
};

const smallButtonTextStyle = {
    fontSize: 13,
};

const stagedListStyle = {
    gap: 10,
    marginTop: 12,
};

const stagedEntryStyle = {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
};

const stagedEntryTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const cardTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 8,
};
