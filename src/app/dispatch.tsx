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

export default function DispatchBoardScreen() {
    const { companyId } = useLocalSearchParams<{ companyId?: string | string[] }>();
    const { theme } = useTheme();
    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
    const [loading, setLoading] = useState(true);
    const [companyAccess, setCompanyAccess] = useState<CompanyAccess | null>(null);
    const [company, setCompany] = useState<CompanyBrand | null>(null);
    const [requests, setRequests] = useState<DispatchRequest[]>([]);
    const [message, setMessage] = useState('Loading Dispatch Board...');
    const [actionRequestId, setActionRequestId] = useState<string | null>(null);

    const newRequests = requests.filter((request) => normalizeStatus(request.status) === 'new');
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

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as any);
            return;
        }

        const access = await resolveDispatchCompanyAccess(user.id, requestedCompanyId);

        if (!access) {
            setLoading(false);
            setMessage(
                requestedCompanyId
                    ? 'Dispatch Board is available to company managers, admins, owners, and platform admins.'
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
            const normalized = normalizeStatus(error.message);
            setRequests([]);
            setMessage(
                normalized.includes('schema cache') || normalized.includes('function')
                    ? 'Service request intake is not installed yet. Review SQL 579 before enabling Dispatch Board requests.'
                    : `Could not load dispatch requests: ${error.message}`
            );
            return;
        }

        setRequests((data || []) as DispatchRequest[]);
        setMessage('');
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

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading requests...</Text>
                    </ThemedCard>
                ) : (
                    <>
                        <DispatchSection
                            title="New / Unassigned"
                            requests={newRequests}
                            actionRequestId={actionRequestId}
                            onAcknowledge={handleAcknowledge}
                        />
                        <DispatchSection
                            title="Acknowledged"
                            requests={acknowledgedRequests}
                            actionRequestId={actionRequestId}
                            onAcknowledge={handleAcknowledge}
                        />
                        <DispatchSection
                            title="Converted to Jobs"
                            requests={convertedRequests}
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
    actionRequestId,
    onAcknowledge,
}: {
    title: string;
    requests: DispatchRequest[];
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
                            acknowledging={actionRequestId === request.id}
                            onAcknowledge={onAcknowledge}
                        />
                    ))}
                </View>
            )}
        </View>
    );
}

function DispatchRequestCard({
    request,
    acknowledging,
    onAcknowledge,
}: {
    request: DispatchRequest;
    acknowledging: boolean;
    onAcknowledge: (request: DispatchRequest) => void;
}) {
    const { theme } = useTheme();
    const status = normalizeStatus(request.status);
    const address = [request.property_address, request.property_city, request.property_state, request.property_postal_code]
        .filter(Boolean)
        .join(', ');

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
    const platformQuery = await supabase
        .from('profiles')
        .select('role, is_platform_admin')
        .eq('id', userId)
        .maybeSingle();
    const profile = (platformQuery.data || {}) as { role?: string | null; is_platform_admin?: boolean | null };
    const isPlatformAdmin =
        String(profile.role || '').trim().toUpperCase() === 'SUPER_ADMIN' || profile.is_platform_admin === true;

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
        .eq('status', 'active')
        .in('role', ['owner', 'admin', 'manager'])
        .order('created_at', { ascending: true })
        .limit(1);

    if (requestedCompanyId) {
        query = query.eq('company_id', requestedCompanyId);
    }

    const { data } = await query;
    const access = ((data || []) as CompanyAccess[])[0] || null;

    return access;
}

function firstParam(value?: string | string[]) {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
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
