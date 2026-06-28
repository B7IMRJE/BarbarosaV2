import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type CompanyAccess = {
    company_id: string;
    role: string | null;
    status: string | null;
};

type DispatchAuthDebug = {
    userId: string;
    email: string | null;
    accessRole: string | null;
    accessStatus: string | null;
    isPlatformAdmin: boolean;
    requestedCompanyId: string;
    selectedCompanyId: string;
};

type DispatchRequest = {
    id: string;
    company_id: string;
    property_id: string;
    company_property_client_id: string | null;
    request_type: string | null;
    status: string | null;
    priority: string | null;
    issue_summary: string | null;
    customer_display_name: string | null;
    property_display_name: string | null;
    property_address: string | null;
    property_city: string | null;
    property_state: string | null;
    property_postal_code: string | null;
    created_at: string | null;
    acknowledged_at: string | null;
    converted_job_id: string | null;
    converted_at: string | null;
};

type CompanyBrand = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
};

type ServiceRequestEvent = {
    id: string;
    service_request_id: string;
    company_id: string;
    property_id: string;
    event_type: string | null;
    message: string | null;
    created_at: string | null;
};

export default function DispatchBoardScreen() {
    const { companyId } = useLocalSearchParams<{ companyId?: string | string[] }>();
    const { theme } = useTheme();
    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
    const [loading, setLoading] = useState(true);
    const [companyAccess, setCompanyAccess] = useState<CompanyAccess | null>(null);
    const [company, setCompany] = useState<CompanyBrand | null>(null);
    const [requests, setRequests] = useState<DispatchRequest[]>([]);
    const [eventsByRequestId, setEventsByRequestId] = useState<Record<string, ServiceRequestEvent[]>>({});
    const [eventsMessage, setEventsMessage] = useState('');
    const [message, setMessage] = useState('Loading Dispatch Board...');
    const [rpcStatusMessage, setRpcStatusMessage] = useState('');
    const [authDebug, setAuthDebug] = useState<DispatchAuthDebug | null>(null);
    const [actionRequestId, setActionRequestId] = useState<string | null>(null);

    const newRequests = requests.filter((request) => isNewDispatchStatus(request.status));
    const acknowledgedRequests = requests.filter((request) => normalizeStatus(request.status) === 'acknowledged');
    const convertedRequests = requests.filter((request) => normalizeStatus(request.status) === 'converted_to_job');

    useEffect(() => {
        loadDispatchBoard();
    }, [requestedCompanyId]);

    async function loadDispatchBoard() {
        setLoading(true);
        setMessage('Loading Dispatch Board...');
        setCompanyAccess(null);
        setCompany(null);
        setRequests([]);
        setEventsByRequestId({});
        setEventsMessage('');
        setRpcStatusMessage('');
        setAuthDebug(null);

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
            setLoading(false);
            setMessage(`Could not load authenticated user: ${userError.message}`);
            return;
        }

        if (!user) {
            router.replace('/auth/login' as any);
            return;
        }

        let access: CompanyAccess | null = null;

        try {
            access = await resolveDispatchCompanyAccess(user.id, requestedCompanyId);
        } catch (error: any) {
            setLoading(false);
            setMessage(`Could not resolve dispatch access: ${error.message || 'Unknown error'}`);
            setAuthDebug({
                userId: user.id,
                email: user.email || null,
                accessRole: null,
                accessStatus: null,
                isPlatformAdmin: false,
                requestedCompanyId,
                selectedCompanyId: '',
            });
            return;
        }

        setAuthDebug({
            userId: user.id,
            email: user.email || null,
            accessRole: access?.role || null,
            accessStatus: access?.status || null,
            isPlatformAdmin: access?.role === 'platform_admin',
            requestedCompanyId,
            selectedCompanyId: access?.company_id || '',
        });

        if (!access) {
            setLoading(false);
            setMessage(
                requestedCompanyId
                    ? 'You do not have Dispatch access for this company.'
                    : 'Choose a company before opening the Dispatch Board as a platform admin.'
            );
            return;
        }

        setCompanyAccess(access);
        await Promise.all([
            loadCompany(access.company_id),
            loadDispatchRequests(access.company_id),
        ]);
        setLoading(false);
    }

    async function loadCompany(companyIdToLoad: string) {
        const { data } = await supabase
            .from('companies')
            .select('id, name, public_name, dba_name')
            .eq('id', companyIdToLoad)
            .maybeSingle();

        setCompany((data || null) as CompanyBrand | null);
    }

    async function loadDispatchRequests(companyIdToLoad: string) {
        const { data, error } = await supabase.rpc('get_company_dispatch_requests', {
            p_company_id: companyIdToLoad,
        });

        if (error) {
            setRequests([]);
            setRpcStatusMessage(`get_company_dispatch_requests RPC error: ${error.message}`);
            setMessage(`Could not load dispatch requests: ${error.message}`);
            return;
        }

        const loadedRequests = (data || []) as DispatchRequest[];
        setRequests(loadedRequests);
        setRpcStatusMessage(
            loadedRequests.length === 0
                ? 'No requests returned by dispatch RPC for this company.'
                : `Dispatch RPC returned ${loadedRequests.length} request${loadedRequests.length === 1 ? '' : 's'}.`
        );
        setMessage(loadedRequests.length === 0 ? 'No requests returned by dispatch RPC for this company.' : '');
        await loadRequestEvents(loadedRequests);
    }

    async function loadRequestEvents(loadedRequests: DispatchRequest[]) {
        if (loadedRequests.length === 0) {
            setEventsByRequestId({});
            setEventsMessage('');
            return;
        }

        const entries = await Promise.all(
            loadedRequests.map(async (request) => {
                const { data, error } = await supabase.rpc('get_service_request_events', {
                    p_service_request_id: request.id,
                });

                if (error) {
                    return {
                        requestId: request.id,
                        events: [] as ServiceRequestEvent[],
                        error,
                    };
                }

                return {
                    requestId: request.id,
                    events: (data || []) as ServiceRequestEvent[],
                    error: null,
                };
            })
        );

        const firstError = entries.find((entry) => entry.error)?.error;
        const normalized = normalizeStatus(firstError?.message);

        setEventsByRequestId(
            entries.reduce<Record<string, ServiceRequestEvent[]>>((accumulator, entry) => {
                accumulator[entry.requestId] = entry.events;
                return accumulator;
            }, {})
        );

        setEventsMessage(
            firstError
                ? normalized.includes('schema cache') || normalized.includes('function')
                    ? 'Request notes and update events are not installed yet. Review SQL 580 to enable them.'
                    : `Could not load request events: ${firstError.message}`
                : ''
        );
    }

    async function handleAcknowledge(request: DispatchRequest) {
        setActionRequestId(request.id);
        setMessage('Acknowledging service request...');

        const { error } = await supabase.rpc('acknowledge_service_request', {
            p_service_request_id: request.id,
        });

        if (error) {
            setActionRequestId(null);
            setMessage(`Could not acknowledge request: ${error.message}`);
            return;
        }

        await loadDispatchRequests(request.company_id);
        setActionRequestId(null);
    }

    const companyName = company?.public_name || company?.dba_name || company?.name || 'Company';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 44, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1120 }}>
                <HomeHeader />

                <ThemedCard style={{ marginBottom: 16 }}>
                    <Text style={[kickerStyle, { color: theme.colors.primary }]}>Service Desk</Text>
                    <Text style={[titleStyle, { color: theme.colors.text }]}>Dispatch Board</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        {companyName} receives homeowner service requests here before jobs are created or technicians are assigned.
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Selected company: {companyAccess?.company_id || requestedCompanyId || 'Not selected'}
                        {companyAccess?.role ? ` / Access: ${formatLabel(companyAccess.role)}` : ''}
                    </Text>
                    <DispatchDebugCard debug={authDebug} rpcStatusMessage={rpcStatusMessage} />
                    <View style={buttonRowStyle}>
                        <ThemedButton title="Refresh" onPress={loadDispatchBoard} style={buttonStyle} />
                        <ThemedButton title="Back Home" variant="secondary" onPress={() => router.push('/' as any)} style={buttonStyle} />
                    </View>
                </ThemedCard>

                {!!message && (
                    <ThemedCard style={{ marginBottom: 16 }}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}

                {!!eventsMessage && (
                    <ThemedCard style={{ marginBottom: 16 }}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{eventsMessage}</Text>
                    </ThemedCard>
                )}

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading requests...</Text>
                    </ThemedCard>
                ) : (
                    <>
                        <DispatchSection
                            title="New / Unassigned"
                            requests={newRequests}
                            eventsByRequestId={eventsByRequestId}
                            actionRequestId={actionRequestId}
                            onAcknowledge={handleAcknowledge}
                        />
                        <DispatchSection
                            title="Acknowledged"
                            requests={acknowledgedRequests}
                            eventsByRequestId={eventsByRequestId}
                            actionRequestId={actionRequestId}
                            onAcknowledge={handleAcknowledge}
                        />
                        <DispatchSection
                            title="Converted to Jobs"
                            requests={convertedRequests}
                            eventsByRequestId={eventsByRequestId}
                            actionRequestId={actionRequestId}
                            onAcknowledge={handleAcknowledge}
                        />
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function DispatchSection({
    title,
    requests,
    eventsByRequestId,
    actionRequestId,
    onAcknowledge,
}: {
    title: string;
    requests: DispatchRequest[];
    eventsByRequestId: Record<string, ServiceRequestEvent[]>;
    actionRequestId: string | null;
    onAcknowledge: (request: DispatchRequest) => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={{ marginBottom: 18 }}>
            <View style={sectionHeaderStyle}>
                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>{title}</Text>
                <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {requests.length}
                </Text>
            </View>

            {requests.length === 0 ? (
                <ThemedCard>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>No requests in this lane.</Text>
                </ThemedCard>
            ) : (
                <View style={requestGridStyle}>
                    {requests.map((request) => (
                        <DispatchRequestCard
                            key={request.id}
                            request={request}
                            events={eventsByRequestId[request.id] || []}
                            acknowledging={actionRequestId === request.id}
                            onAcknowledge={onAcknowledge}
                        />
                    ))}
                </View>
            )}
        </View>
    );
}

function DispatchDebugCard({
    debug,
    rpcStatusMessage,
}: {
    debug: DispatchAuthDebug | null;
    rpcStatusMessage: string;
}) {
    const { theme } = useTheme();

    return (
        <View
            style={{
                borderColor: theme.colors.border,
                borderRadius: theme.radii.card,
                borderWidth: 1,
                marginTop: 14,
                padding: 12,
            }}
        >
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                User: {debug?.email || 'Unknown'} / Auth ID: {debug?.userId ? shortId(debug.userId) : 'Unknown'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Requested company: {debug?.requestedCompanyId || 'None'} / Selected company: {debug?.selectedCompanyId || 'None'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Access role: {debug?.accessRole ? formatLabel(debug.accessRole) : 'Not resolved'} / Status:{' '}
                {debug?.accessStatus ? formatLabel(debug.accessStatus) : 'Unknown'}
                {debug?.isPlatformAdmin ? ' / Platform admin' : ''}
            </Text>
            {!!rpcStatusMessage && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    RPC: {rpcStatusMessage}
                </Text>
            )}
        </View>
    );
}

function DispatchRequestCard({
    request,
    events,
    acknowledging,
    onAcknowledge,
}: {
    request: DispatchRequest;
    events: ServiceRequestEvent[];
    acknowledging: boolean;
    onAcknowledge: (request: DispatchRequest) => void;
}) {
    const { theme } = useTheme();
    const status = normalizeStatus(request.status);
    const address = [request.property_address, request.property_city, request.property_state, request.property_postal_code]
        .filter(Boolean)
        .join(', ');
    const latestUpdateRequest = events.find((event) => normalizeStatus(event.event_type) === 'update_requested');
    const latestEvent = events[0];

    return (
        <ThemedCard style={requestCardStyle}>
            <View style={requestTopRowStyle}>
                <Text style={[requestTypeStyle, { color: theme.colors.primary }]}>{formatLabel(request.request_type)}</Text>
                <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {formatLabel(request.priority)}
                </Text>
            </View>

            <Text style={[requestTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                {request.issue_summary || 'Service request'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Customer: {request.customer_display_name || request.property_display_name || 'Homeowner'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                {address || 'Basic property details are not available.'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Created: {formatDate(request.created_at)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Company: {shortId(request.company_id)} / Status: {formatLabel(request.status)}
            </Text>
            {!!latestUpdateRequest && (
                <Text style={[eventNoticeStyle, { color: theme.colors.primary }]}>
                    Homeowner requested update: {formatDate(latestUpdateRequest.created_at)}
                </Text>
            )}
            {!!latestEvent && !latestUpdateRequest && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    Latest note: {formatLabel(latestEvent.event_type)} / {formatDate(latestEvent.created_at)}
                </Text>
            )}
            {request.converted_job_id ? (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    Job: {shortId(request.converted_job_id)}
                </Text>
            ) : status === 'new' ? (
                <ThemedButton
                    title={acknowledging ? 'Acknowledging...' : 'Acknowledge'}
                    disabled={acknowledging}
                    onPress={() => onAcknowledge(request)}
                    style={{ marginTop: 12, paddingVertical: 12, paddingHorizontal: 14 }}
                    textStyle={{ fontSize: 13 }}
                />
            ) : (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    Acknowledged: {formatDate(request.acknowledged_at)}
                </Text>
            )}
        </ThemedCard>
    );
}

async function resolveDispatchCompanyAccess(userId: string, requestedCompanyId: string) {
    const isPlatformAdmin = await loadDispatchPlatformAdminStatus(userId);

    if (isPlatformAdmin && requestedCompanyId) {
        return {
            company_id: requestedCompanyId,
            role: 'platform_admin',
            status: 'active',
        };
    }

    let query = supabase
        .from('company_users')
        .select('company_id, role, status')
        .eq('auth_user_id', userId)
        .order('created_at', { ascending: true })
        .limit(25);

    if (requestedCompanyId) {
        query = query.eq('company_id', requestedCompanyId);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(error.message);
    }

    const access =
        ((data || []) as CompanyAccess[]).find((companyUser) => {
            const role = normalizeStatus(companyUser.role);
            const status = normalizeStatus(companyUser.status);

            return (
                status === 'active' &&
                ['owner', 'admin', 'manager', 'office', 'dispatcher'].includes(role)
            );
        }) || null;

    return access;
}

async function loadDispatchPlatformAdminStatus(userId: string) {
    const rpcResult = await supabase.rpc('homeos_is_platform_admin');

    if (!rpcResult.error) {
        return rpcResult.data === true;
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

    if (fallbackQuery.error) {
        throw new Error(fallbackQuery.error.message);
    }

    return String(fallbackQuery.data?.role || '').trim().toUpperCase() === 'SUPER_ADMIN';
}

function firstParam(value?: string | string[]) {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function isNewDispatchStatus(value?: string | null) {
    const normalized = normalizeStatus(value);

    return !['acknowledged', 'converted_to_job', 'cancelled', 'canceled'].includes(normalized);
}

function formatLabel(value?: string | null) {
    return String(value || 'unknown')
        .trim()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function formatDate(value?: string | null) {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

function shortId(value: string) {
    return value.replace(/-/g, '').slice(0, 8).toUpperCase();
}

const kickerStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 6,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    marginBottom: 10,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const buttonRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 16,
};

const buttonStyle = {
    flexBasis: 160,
    flexGrow: 1,
    flexShrink: 1,
};

const sectionHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
};

const countBadgeStyle = {
    borderRadius: 999,
    overflow: 'hidden' as const,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '900' as const,
};

const requestGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const requestCardStyle = {
    flex: 1,
    flexBasis: 280,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
};

const requestTopRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
};

const requestTypeStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const requestTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    lineHeight: 24,
    marginBottom: 8,
};

const metaTextStyle = {
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 19,
    marginTop: 5,
};

const eventNoticeStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    lineHeight: 19,
    marginTop: 8,
};
