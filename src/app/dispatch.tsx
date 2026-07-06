import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, Text, TextInput, useWindowDimensions, View, type ViewStyle } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import {
    calculateCompanyLeadCounts,
    getCompanyDispatchRequests,
    isAssignedOrScheduledStatus,
    isCompletedStatus,
    isEmergencyDispatchRequest,
    isInProgressStatus,
    isNewLeadStatus,
    LEAD_ALERT_REFRESH_MS,
    type CompanyDispatchRequest,
    type CompanyLeadCounts,
} from '../lib/companyLeadAlerts';
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

type DispatchRequest = CompanyDispatchRequest;

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

type ScheduleSlot = {
    id: string;
    company_id: string;
    service_request_id: string | null;
    technician_company_user_id: string;
    start_at: string | null;
    end_at: string | null;
    status: string | null;
};

type CompanyUser = {
    id: string;
    company_id: string;
    auth_user_id: string | null;
    full_name: string | null;
    email: string | null;
    role: string | null;
    status: string | null;
    created_at: string | null;
};

type ScheduleRequestForm = {
    technicianCompanyUserId: string;
    technicianSearch: string;
    date: string;
    calendarMonth: string;
    startTime: string;
    durationMinutes: string;
    arrivalWindowStart: string;
    arrivalWindowEnd: string;
    notes: string;
    cancelReason: string;
    archiveReason: string;
};

type DispatchBoardView = 'activity' | 'schedule';

function createDefaultScheduleForm(): ScheduleRequestForm {
    const start = getNextScheduleStart();

    return {
        technicianCompanyUserId: '',
        technicianSearch: '',
        date: formatDateInput(start),
        calendarMonth: formatMonthInput(start),
        startTime: formatTimeInput(start),
        durationMinutes: '60',
        arrivalWindowStart: '',
        arrivalWindowEnd: '',
        notes: '',
        cancelReason: '',
        archiveReason: '',
    };
}

export default function DispatchBoardScreen() {
    const { companyId } = useLocalSearchParams<{ companyId?: string | string[] }>();
    const { width: viewportWidth } = useWindowDimensions();
    const { theme } = useTheme();
    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
    const [loading, setLoading] = useState(true);
    const [companyAccess, setCompanyAccess] = useState<CompanyAccess | null>(null);
    const [company, setCompany] = useState<CompanyBrand | null>(null);
    const [requests, setRequests] = useState<DispatchRequest[]>([]);
    const [leadCounts, setLeadCounts] = useState<CompanyLeadCounts | null>(null);
    const [leadCountError, setLeadCountError] = useState('');
    const [eventsByRequestId, setEventsByRequestId] = useState<Record<string, ServiceRequestEvent[]>>({});
    const [eventsMessage, setEventsMessage] = useState('');
    const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
    const [scheduleSlotsMessage, setScheduleSlotsMessage] = useState('');
    const [message, setMessage] = useState('Loading Dispatch Board...');
    const [rpcStatusMessage, setRpcStatusMessage] = useState('');
    const [authDebug, setAuthDebug] = useState<DispatchAuthDebug | null>(null);
    const [actionRequestId, setActionRequestId] = useState<string | null>(null);
    const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
    const [activeTechnicians, setActiveTechnicians] = useState<CompanyUser[]>([]);
    const [scheduleFormByRequestId, setScheduleFormByRequestId] = useState<Record<string, ScheduleRequestForm>>({});
    const [requestActionMessageById, setRequestActionMessageById] = useState<Record<string, string>>({});
    const [activeBoardView, setActiveBoardView] = useState<DispatchBoardView>('activity');
    const dispatchRefreshInFlight = useRef(false);

    const newRequests = requests.filter((request) => isNewLeadStatus(request.status));
    const assignedScheduledRequests = requests.filter((request) => isAssignedOrScheduledStatus(request.status));
    const inProgressRequests = requests.filter((request) => isInProgressStatus(request.status));
    const completedRequests = requests.filter((request) => isCompletedStatus(request.status));
    const cancelledRequests = requests.filter((request) => ['cancelled', 'canceled', 'archived'].includes(normalizeStatus(request.status)));
    const cardBasis = viewportWidth <= 700 ? '100%' : '31.8%';

    useEffect(() => {
        loadDispatchBoard();
    }, [requestedCompanyId]);

    useEffect(() => {
        const companyIdToRefresh = companyAccess?.company_id;

        if (!companyIdToRefresh) return;

        async function refreshDispatchBoardQuietly() {
            if (!companyIdToRefresh || dispatchRefreshInFlight.current) return;

            dispatchRefreshInFlight.current = true;

            try {
                await Promise.all([
                    loadDispatchRequests(companyIdToRefresh),
                    loadActiveTechnicians(companyIdToRefresh),
                    loadScheduleSlots(companyIdToRefresh),
                ]);
            } finally {
                dispatchRefreshInFlight.current = false;
            }
        }

        const intervalId = setInterval(() => {
            void refreshDispatchBoardQuietly();
        }, LEAD_ALERT_REFRESH_MS);

        const appStateSubscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                void refreshDispatchBoardQuietly();
            }
        });

        const focusTarget = globalThis as {
            addEventListener?: (type: 'focus', listener: () => void) => void;
            removeEventListener?: (type: 'focus', listener: () => void) => void;
        };
        const handleFocus = () => {
            void refreshDispatchBoardQuietly();
        };

        focusTarget.addEventListener?.('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            appStateSubscription.remove();
            focusTarget.removeEventListener?.('focus', handleFocus);
        };
    }, [companyAccess?.company_id]);

    async function loadDispatchBoard() {
        setLoading(true);
        setMessage('Loading Dispatch Board...');
        setCompanyAccess(null);
        setCompany(null);
        setRequests([]);
        setLeadCounts(null);
        setLeadCountError('');
        setEventsByRequestId({});
        setEventsMessage('');
        setScheduleSlots([]);
        setScheduleSlotsMessage('');
        setRpcStatusMessage('');
        setAuthDebug(null);
        setActiveTechnicians([]);
        setScheduleFormByRequestId({});
        setRequestActionMessageById({});

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
            loadActiveTechnicians(access.company_id),
            loadDispatchRequests(access.company_id),
            loadScheduleSlots(access.company_id),
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
        try {
            const loadedRequests = await getCompanyDispatchRequests(companyIdToLoad);

            setRequests(loadedRequests);
            setLeadCounts(calculateCompanyLeadCounts(loadedRequests));
            setLeadCountError('');
            setRpcStatusMessage(
                loadedRequests.length === 0
                    ? 'No requests returned by dispatch RPC for this company.'
                    : `Dispatch RPC returned ${loadedRequests.length} request${loadedRequests.length === 1 ? '' : 's'}.`
            );
            setMessage(loadedRequests.length === 0 ? 'No requests returned by dispatch RPC for this company.' : '');
            await loadRequestEvents(loadedRequests);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setRequests([]);
            setLeadCounts(null);
            setLeadCountError('Lead count unavailable.');
            setRpcStatusMessage(`get_company_dispatch_requests RPC error: ${errorMessage}`);
            setMessage(`Could not load dispatch requests: ${errorMessage}`);
            return;
        }
    }

    async function loadActiveTechnicians(companyIdToLoad: string) {
        const result = await loadCompanyMembers(companyIdToLoad);

        if (result.error) {
            setActiveTechnicians([]);
            setMessage(`Could not load active technicians: ${result.error.message}`);
            return;
        }

        setActiveTechnicians(
            result.data.filter((member) => isActiveStatus(member.status) && isTechnicianRole(member.role))
        );
    }

    async function loadScheduleSlots(companyIdToLoad: string) {
        const windowStart = new Date();
        const windowEnd = new Date();
        windowStart.setDate(windowStart.getDate() - 30);
        windowEnd.setDate(windowEnd.getDate() + 30);

        const { data, error } = await supabase
            .from('job_schedule_slots')
            .select('id, company_id, service_request_id, technician_company_user_id, start_at, end_at, status')
            .eq('company_id', companyIdToLoad)
            .gte('start_at', windowStart.toISOString())
            .lte('start_at', windowEnd.toISOString())
            .order('start_at', { ascending: true });

        if (error) {
            setScheduleSlots([]);
            setScheduleSlotsMessage(`Schedule conflict check unavailable: ${error.message}`);
            return;
        }

        setScheduleSlots(normalizeScheduleSlots(data));
        setScheduleSlotsMessage('');
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

    function updateScheduleForm(requestId: string, updates: Partial<ScheduleRequestForm>) {
        setScheduleFormByRequestId((current) => ({
            ...current,
            [requestId]: {
                ...createDefaultScheduleForm(),
                ...(current[requestId] || {}),
                ...updates,
            },
        }));
    }

    async function handleScheduleRequest(request: DispatchRequest) {
        const form = scheduleFormByRequestId[request.id] || createDefaultScheduleForm();
        const duration = Number.parseInt(form.durationMinutes, 10);
        const startAt = parseLocalDateTime(form.date, form.startTime);

        if (!form.technicianCompanyUserId) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Pick a technician.' }));
            return;
        }

        if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Pick a date.' }));
            return;
        }

        if (!form.startTime || !/^\d{2}:\d{2}$/.test(form.startTime)) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Pick a start time.' }));
            return;
        }

        if (!startAt) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Pick a date and start time.' }));
            return;
        }

        if (!Number.isFinite(duration) || duration <= 0) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Enter a valid estimated duration.' }));
            return;
        }

        const endAt = new Date(startAt.getTime() + duration * 60 * 1000);
        const arrivalStart = parseOptionalLocalDateTime(form.date, form.arrivalWindowStart) || startAt;
        const arrivalEnd = parseOptionalLocalDateTime(form.date, form.arrivalWindowEnd) || endAt;
        const selectedTechnician = activeTechnicians.find((technician) => technician.id === form.technicianCompanyUserId) || null;

        try {
            const freshTechnicianSlots = await loadTechnicianScheduleSlots({
                companyId: request.company_id,
                technicianCompanyUserId: form.technicianCompanyUserId,
                startAt,
                endAt,
            });
            const conflict = findScheduleConflict(
                mergeScheduleSlots(scheduleSlots, freshTechnicianSlots),
                form.technicianCompanyUserId,
                startAt,
                endAt
            );

            if (conflict) {
                setRequestActionMessageById((current) => ({
                    ...current,
                    [request.id]: `Schedule conflict: ${selectedTechnician ? getMemberDisplayName(selectedTechnician) : 'This technician'} is already booked from ${formatScheduleConflictRange(conflict)}.`,
                }));
                return;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            if (isScheduleBackendMissingMessage(normalizeStatus(errorMessage))) {
                setRequestActionMessageById((current) => ({
                    ...current,
                    [request.id]: 'Tech assignment backend not connected yet.',
                }));
                return;
            }

            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: `Could not check schedule conflicts: ${errorMessage}`,
            }));
            return;
        }

        setActionRequestId(request.id);
        setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Scheduling request...' }));

        const { error } = await supabase.rpc('schedule_service_request_slot', {
            p_company_id: request.company_id,
            p_service_request_id: request.id,
            p_technician_company_user_id: form.technicianCompanyUserId,
            p_start_at: startAt.toISOString(),
            p_end_at: endAt.toISOString(),
            p_arrival_window_start: arrivalStart?.toISOString() || null,
            p_arrival_window_end: arrivalEnd?.toISOString() || null,
            p_estimated_duration_minutes: duration,
            p_priority: request.priority || 'normal',
            p_notes: form.notes.trim() || null,
        });

        setActionRequestId(null);

        if (error) {
            const normalized = normalizeStatus(error.message);
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: isMissingAssignmentBackendMessage(normalized)
                    ? 'Tech assignment backend not connected yet.'
                    : normalized.includes('scheduled work during this time')
                    ? 'This technician already has a scheduled job during that time.'
                    : `Could not schedule request: ${error.message}`,
            }));
            return;
        }

        setRequestActionMessageById((current) => ({
            ...current,
            [request.id]: `Scheduled for ${formatDateTime(startAt.toISOString())}.`,
        }));
        await Promise.all([
            loadDispatchRequests(request.company_id),
            loadScheduleSlots(request.company_id),
        ]);
    }

    async function handleCancelRequest(request: DispatchRequest) {
        const form = scheduleFormByRequestId[request.id] || createDefaultScheduleForm();
        const confirmed = await confirmRequestAction('Cancel this request?');

        if (!confirmed) return;

        setActionRequestId(request.id);
        setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Cancelling request...' }));

        try {
            await updateRequestClosedStatus({
                requestId: request.id,
                status: 'cancelled',
                reason: form.cancelReason.trim(),
            });
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Request cancelled.' }));
            await loadDispatchRequests(request.company_id);
        } catch (error) {
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: `Could not cancel request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }));
        } finally {
            setActionRequestId(null);
        }
    }

    async function handleArchiveRequest(request: DispatchRequest) {
        const form = scheduleFormByRequestId[request.id] || createDefaultScheduleForm();
        const confirmed = await confirmRequestAction('Archive this request?');

        if (!confirmed) return;

        setActionRequestId(request.id);
        setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Archiving request...' }));

        try {
            await updateRequestClosedStatus({
                requestId: request.id,
                status: 'archived',
                reason: form.archiveReason.trim(),
            });
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Request archived.' }));
            await loadDispatchRequests(request.company_id);
        } catch (error) {
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: `Could not archive request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }));
        } finally {
            setActionRequestId(null);
        }
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
                    <Text style={[titleStyle, { color: theme.colors.text }]}>Dispatch / Activity Board</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        {companyName} receives homeowner service requests here before jobs are created or technicians are assigned.
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Selected company: {companyAccess?.company_id || requestedCompanyId || 'Not selected'}
                        {companyAccess?.role ? ` / Access: ${formatLabel(companyAccess.role)}` : ''}
                    </Text>
                    <LeadCountSummary counts={leadCounts} error={leadCountError} loading={loading} />
                    <DispatchDebugCard debug={authDebug} rpcStatusMessage={rpcStatusMessage} />
                    <View style={buttonRowStyle}>
                        <ThemedButton title="Refresh" onPress={loadDispatchBoard} style={buttonStyle} />
                        <ThemedButton title="Back Home" variant="secondary" onPress={() => router.push('/' as any)} style={buttonStyle} />
                    </View>
                    <View style={buttonRowStyle}>
                        <ThemedButton
                            title="Activity Board"
                            variant={activeBoardView === 'activity' ? 'primary' : 'secondary'}
                            onPress={() => setActiveBoardView('activity')}
                            style={buttonStyle}
                        />
                        <ThemedButton
                            title="Schedule Board"
                            variant={activeBoardView === 'schedule' ? 'primary' : 'secondary'}
                            onPress={() => setActiveBoardView('schedule')}
                            style={buttonStyle}
                        />
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

                {!!scheduleSlotsMessage && (
                    <ThemedCard style={{ marginBottom: 16 }}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{scheduleSlotsMessage}</Text>
                    </ThemedCard>
                )}

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading requests...</Text>
                    </ThemedCard>
                ) : activeBoardView === 'schedule' ? (
                    <ActivityScheduleFoundation
                        requests={requests}
                        scheduleSlots={scheduleSlots}
                        activeTechnicians={activeTechnicians}
                        cardBasis={cardBasis}
                    />
                ) : (
                    <>
                        <DispatchSection
                            title="New / Unassigned"
                            requests={newRequests}
                            totalRequests={requests.length}
                            eventsByRequestId={eventsByRequestId}
                            actionRequestId={actionRequestId}
                            expandedRequestId={expandedRequestId}
                            cardBasis={cardBasis}
                            onToggleRequest={setExpandedRequestId}
                            onAcknowledge={handleAcknowledge}
                            activeTechnicians={activeTechnicians}
                            scheduleFormByRequestId={scheduleFormByRequestId}
                            requestActionMessageById={requestActionMessageById}
                            onUpdateScheduleForm={updateScheduleForm}
                            onScheduleRequest={handleScheduleRequest}
                            onCancelRequest={handleCancelRequest}
                            onArchiveRequest={handleArchiveRequest}
                        />
                        <DispatchSection
                            title="Assigned / Scheduled"
                            requests={assignedScheduledRequests}
                            totalRequests={requests.length}
                            eventsByRequestId={eventsByRequestId}
                            actionRequestId={actionRequestId}
                            expandedRequestId={expandedRequestId}
                            cardBasis={cardBasis}
                            onToggleRequest={setExpandedRequestId}
                            onAcknowledge={handleAcknowledge}
                            activeTechnicians={activeTechnicians}
                            scheduleFormByRequestId={scheduleFormByRequestId}
                            requestActionMessageById={requestActionMessageById}
                            onUpdateScheduleForm={updateScheduleForm}
                            onScheduleRequest={handleScheduleRequest}
                            onCancelRequest={handleCancelRequest}
                            onArchiveRequest={handleArchiveRequest}
                        />
                        <DispatchSection
                            title="In Progress"
                            requests={inProgressRequests}
                            totalRequests={requests.length}
                            eventsByRequestId={eventsByRequestId}
                            actionRequestId={actionRequestId}
                            expandedRequestId={expandedRequestId}
                            cardBasis={cardBasis}
                            onToggleRequest={setExpandedRequestId}
                            onAcknowledge={handleAcknowledge}
                            activeTechnicians={activeTechnicians}
                            scheduleFormByRequestId={scheduleFormByRequestId}
                            requestActionMessageById={requestActionMessageById}
                            onUpdateScheduleForm={updateScheduleForm}
                            onScheduleRequest={handleScheduleRequest}
                            onCancelRequest={handleCancelRequest}
                            onArchiveRequest={handleArchiveRequest}
                        />
                        <DispatchSection
                            title="Completed"
                            requests={completedRequests}
                            totalRequests={requests.length}
                            eventsByRequestId={eventsByRequestId}
                            actionRequestId={actionRequestId}
                            expandedRequestId={expandedRequestId}
                            cardBasis={cardBasis}
                            onToggleRequest={setExpandedRequestId}
                            onAcknowledge={handleAcknowledge}
                            activeTechnicians={activeTechnicians}
                            scheduleFormByRequestId={scheduleFormByRequestId}
                            requestActionMessageById={requestActionMessageById}
                            onUpdateScheduleForm={updateScheduleForm}
                            onScheduleRequest={handleScheduleRequest}
                            onCancelRequest={handleCancelRequest}
                            onArchiveRequest={handleArchiveRequest}
                        />
                        <DispatchSection
                            title="Cancelled / Archived"
                            requests={cancelledRequests}
                            totalRequests={requests.length}
                            eventsByRequestId={eventsByRequestId}
                            actionRequestId={actionRequestId}
                            expandedRequestId={expandedRequestId}
                            cardBasis={cardBasis}
                            onToggleRequest={setExpandedRequestId}
                            onAcknowledge={handleAcknowledge}
                            activeTechnicians={activeTechnicians}
                            scheduleFormByRequestId={scheduleFormByRequestId}
                            requestActionMessageById={requestActionMessageById}
                            onUpdateScheduleForm={updateScheduleForm}
                            onScheduleRequest={handleScheduleRequest}
                            onCancelRequest={handleCancelRequest}
                            onArchiveRequest={handleArchiveRequest}
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
    totalRequests,
    eventsByRequestId,
    actionRequestId,
    expandedRequestId,
    cardBasis,
    onToggleRequest,
    onAcknowledge,
    activeTechnicians,
    scheduleFormByRequestId,
    requestActionMessageById,
    onUpdateScheduleForm,
    onScheduleRequest,
    onCancelRequest,
    onArchiveRequest,
}: {
    title: string;
    requests: DispatchRequest[];
    totalRequests: number;
    eventsByRequestId: Record<string, ServiceRequestEvent[]>;
    actionRequestId: string | null;
    expandedRequestId: string | null;
    cardBasis: ViewStyle['flexBasis'];
    onToggleRequest: (requestId: string | null) => void;
    onAcknowledge: (request: DispatchRequest) => void;
    activeTechnicians: CompanyUser[];
    scheduleFormByRequestId: Record<string, ScheduleRequestForm>;
    requestActionMessageById: Record<string, string>;
    onUpdateScheduleForm: (requestId: string, updates: Partial<ScheduleRequestForm>) => void;
    onScheduleRequest: (request: DispatchRequest) => void;
    onCancelRequest: (request: DispatchRequest) => void;
    onArchiveRequest: (request: DispatchRequest) => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={{ marginBottom: 18 }}>
            <View style={sectionHeaderStyle}>
                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>{title}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                        {requests.length}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Showing {requests.length} of {totalRequests}
                    </Text>
                </View>
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
                            expanded={expandedRequestId === request.id}
                            cardBasis={cardBasis}
                            onToggle={() => {
                                const nextRequestId = expandedRequestId === request.id ? null : request.id;

                                if (nextRequestId && !scheduleFormByRequestId[request.id]) {
                                    onUpdateScheduleForm(request.id, {});
                                }

                                onToggleRequest(nextRequestId);
                            }}
                            onAcknowledge={onAcknowledge}
                            activeTechnicians={activeTechnicians}
                            scheduleForm={scheduleFormByRequestId[request.id] || createDefaultScheduleForm()}
                            actionMessage={requestActionMessageById[request.id] || ''}
                            onUpdateScheduleForm={(updates) => onUpdateScheduleForm(request.id, updates)}
                            onScheduleRequest={() => onScheduleRequest(request)}
                            onCancelRequest={() => onCancelRequest(request)}
                            onArchiveRequest={() => onArchiveRequest(request)}
                        />
                    ))}
                </View>
            )}
        </View>
    );
}

function LeadCountSummary({
    counts,
    error,
    loading,
}: {
    counts: CompanyLeadCounts | null;
    error: string;
    loading: boolean;
}) {
    const { theme } = useTheme();

    if (error) {
        return (
            <View style={leadSummaryRowStyle}>
                <Text style={[leadSummaryPillStyle, { color: theme.colors.danger, backgroundColor: theme.colors.dangerBackground }]}>
                    {error}
                </Text>
            </View>
        );
    }

    if (!counts) {
        if (!loading) return null;

        return (
            <View style={leadSummaryRowStyle}>
                <Text style={[leadSummaryPillStyle, { color: theme.colors.mutedText, backgroundColor: theme.colors.surfaceAlt }]}>
                    Checking leads...
                </Text>
            </View>
        );
    }

    if (counts.newLeads === 0) {
        return (
            <View style={leadSummaryRowStyle}>
                <Text style={[leadSummaryPillStyle, { color: theme.colors.mutedText, backgroundColor: theme.colors.surfaceAlt }]}>
                    No new leads.
                </Text>
            </View>
        );
    }

    return (
        <View style={leadSummaryRowStyle}>
            <Text style={[leadSummaryPillStyle, { color: theme.colors.primaryText, backgroundColor: theme.colors.primary }]}>
                New Leads: {counts.newLeads}
            </Text>
            {counts.emergencyLeads > 0 && (
                <Text style={[leadSummaryPillStyle, { color: theme.colors.danger, backgroundColor: theme.colors.dangerBackground }]}>
                    Emergency Leads: {counts.emergencyLeads}
                </Text>
            )}
        </View>
    );
}

function ActivityScheduleFoundation({
    requests,
    scheduleSlots,
    activeTechnicians,
    cardBasis,
}: {
    requests: DispatchRequest[];
    scheduleSlots: ScheduleSlot[];
    activeTechnicians: CompanyUser[];
    cardBasis: ViewStyle['flexBasis'];
}) {
    const { theme } = useTheme();
    const todaySlots = scheduleSlots.filter((slot) => isToday(slot.start_at));
    const weekSlots = scheduleSlots.filter((slot) => isThisWeek(slot.start_at));
    const requestsById = useMemo(
        () => requests.reduce<Record<string, DispatchRequest>>((accumulator, request) => {
            accumulator[request.id] = request;
            return accumulator;
        }, {}),
        [requests]
    );
    const activeTechnicianIds = new Set(activeTechnicians.map((technician) => technician.id));
    const unknownTechnicianSlots = scheduleSlots.filter((slot) => !activeTechnicianIds.has(slot.technician_company_user_id));

    // Schedule design intent: after assigning a tech, the job appears here; every technician gets a visible row; blocks stay color-coded and glass-style by status or technician.
    return (
        <View style={{ marginBottom: 18 }}>
            <View style={sectionHeaderStyle}>
                <View>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Activity / Schedule</Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Today / This Week / technician schedule foundation
                    </Text>
                </View>
                <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {scheduleSlots.length}
                </Text>
            </View>

            <View style={scheduleSummaryGridStyle}>
                <ThemedCard style={[scheduleSummaryCardStyle, { flexBasis: cardBasis }]}>
                    <Text style={[requestTypeStyle, { color: theme.colors.primary }]}>Today</Text>
                    <Text style={[requestTitleStyle, { color: theme.colors.text }]}>
                        {todaySlots.length} scheduled
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Scheduled blocks will land here after dispatch assigns time and technician context.
                    </Text>
                </ThemedCard>
                <ThemedCard style={[scheduleSummaryCardStyle, { flexBasis: cardBasis }]}>
                    <Text style={[requestTypeStyle, { color: theme.colors.primary }]}>This Week</Text>
                    <Text style={[requestTitleStyle, { color: theme.colors.text }]}>
                        {weekSlots.length} scheduled
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Every technician schedule should be visible here as assignment data grows.
                    </Text>
                </ThemedCard>
            </View>

            {scheduleSlots.length === 0 ? (
                <ThemedCard>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>No scheduled work yet.</Text>
                </ThemedCard>
            ) : (
                <View style={scheduleLaneListStyle}>
                    {activeTechnicians.slice(0, 8).map((technician) => (
                        <ScheduleTechLane
                            key={technician.id}
                            title={getMemberDisplayName(technician)}
                            subtitle={technician.email || 'Technician'}
                            slots={scheduleSlots.filter((slot) => slot.technician_company_user_id === technician.id)}
                            requestsById={requestsById}
                        />
                    ))}
                    {unknownTechnicianSlots.length > 0 && (
                        <ScheduleTechLane
                            title="Unassigned / Unknown Tech"
                            subtitle="Schedule rows without a matching active technician."
                            slots={unknownTechnicianSlots}
                            requestsById={requestsById}
                        />
                    )}
                </View>
            )}
        </View>
    );
}

function ScheduleTechLane({
    title,
    subtitle,
    slots,
    requestsById,
}: {
    title: string;
    subtitle: string;
    slots: ScheduleSlot[];
    requestsById: Record<string, DispatchRequest>;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={scheduleLaneCardStyle}>
            <View style={sectionHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[requestTitleStyle, { color: theme.colors.text }]} numberOfLines={1}>
                        {title}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{subtitle}</Text>
                </View>
                <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {slots.length}
                </Text>
            </View>

            {slots.length === 0 ? (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>No scheduled work yet.</Text>
            ) : (
                <View style={scheduleBlockRowStyle}>
                    {slots.map((slot) => {
                        const request = slot.service_request_id ? requestsById[slot.service_request_id] || null : null;

                        return (
                            <View
                                key={slot.id}
                                style={[
                                    scheduleGlassBlockStyle,
                                    {
                                        backgroundColor: getScheduleBlockBackground(request),
                                        borderColor: getScheduleBlockBorder(request),
                                    },
                                ]}
                            >
                                <Text style={[requestTypeStyle, { color: theme.colors.text }]}>
                                    {request ? formatCallType(request) : 'Scheduled Work'}
                                </Text>
                                <Text style={[metaTextStyle, { color: theme.colors.text }]} numberOfLines={1}>
                                    {request?.customer_display_name || request?.property_display_name || `Request ${shortId(slot.service_request_id || slot.id)}`}
                                </Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                                    {formatTime(slot.start_at)} - {formatTime(slot.end_at)} / {formatLabel(slot.status || request?.status || 'scheduled')}
                                </Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                                    {request?.issue_summary || 'No description provided.'}
                                </Text>
                            </View>
                        );
                    })}
                </View>
            )}
        </ThemedCard>
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
    expanded,
    cardBasis,
    onToggle,
    onAcknowledge,
    activeTechnicians,
    scheduleForm,
    actionMessage,
    onUpdateScheduleForm,
    onScheduleRequest,
    onCancelRequest,
    onArchiveRequest,
}: {
    request: DispatchRequest;
    events: ServiceRequestEvent[];
    acknowledging: boolean;
    expanded: boolean;
    cardBasis: ViewStyle['flexBasis'];
    onToggle: () => void;
    onAcknowledge: (request: DispatchRequest) => void;
    activeTechnicians: CompanyUser[];
    scheduleForm: ScheduleRequestForm;
    actionMessage: string;
    onUpdateScheduleForm: (updates: Partial<ScheduleRequestForm>) => void;
    onScheduleRequest: () => void;
    onCancelRequest: () => void;
    onArchiveRequest: () => void;
}) {
    const { theme } = useTheme();
    const status = normalizeStatus(request.status);
    const latestUpdateRequest = events.find((event) => normalizeStatus(event.event_type) === 'update_requested');
    const displayName = request.customer_display_name || request.property_display_name || 'Homeowner';
    const selectedTechnician = activeTechnicians.find((technician) => technician.id === scheduleForm.technicianCompanyUserId) || null;
    const technicianSearch = normalizeStatus(scheduleForm.technicianSearch);
    const visibleTechnicians = activeTechnicians.filter((technician) => {
        if (!technicianSearch) return true;

        return normalizeStatus(`${getMemberDisplayName(technician)} ${technician.email || ''} ${technician.role || ''}`).includes(technicianSearch);
    });
    const scheduledPreview = getSchedulePreview(scheduleForm);
    const selectedDateLabel = formatSelectedScheduleDate(scheduleForm.date);
    const selectedStartLabel = formatSelectedScheduleTime(scheduleForm.startTime);

    return (
        <ThemedCard onPress={expanded ? undefined : onToggle} style={[requestCardStyle, { flexBasis: cardBasis }]}>
            <View style={requestTopRowStyle}>
                <Text style={[requestTypeStyle, { color: theme.colors.primary }]}>{formatCallType(request)}</Text>
                <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {formatLabel(request.priority)}
                </Text>
            </View>

            <Text style={[requestTitleStyle, { color: theme.colors.text }]} numberOfLines={1}>
                {displayName}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                {request.issue_summary || 'No description provided.'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Request #{shortId(request.id)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Status: {formatLabel(request.status)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Created: {formatDateTime(request.created_at)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Priority: {formatLabel(request.priority)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Assigned tech: {selectedTechnician ? getMemberDisplayName(selectedTechnician) : 'Not assigned'}
            </Text>
            <View style={compactActionRowStyle}>
                <ThemedButton
                    title="Open Customer"
                    variant="secondary"
                    onPress={() => router.push(`/super-admin/company/${request.company_id}/client/${request.property_id}` as any)}
                    style={compactActionButtonStyle}
                    textStyle={{ fontSize: 12 }}
                />
                <ThemedButton
                    title="Open Client HomeOS"
                    variant="secondary"
                    onPress={() => router.push(`/super-admin/company/${request.company_id}/client/${request.property_id}/homeos` as any)}
                    style={compactActionButtonStyle}
                    textStyle={{ fontSize: 12 }}
                />
            </View>
            {!!latestUpdateRequest && (
                <Text style={[eventNoticeStyle, { color: theme.colors.primary }]}>
                    Homeowner requested update
                </Text>
            )}

            {expanded && (
                <View style={expandedDetailStyle}>
                    <ThemedButton
                        title="Collapse"
                        variant="ghost"
                        onPress={onToggle}
                        style={{ alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12 }}
                        textStyle={{ fontSize: 12 }}
                    />
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={3}>
                        {request.issue_summary || 'No summary available.'}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Property: {request.property_display_name || 'Not available'}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Events: {events.length}
                    </Text>
                    {events.slice(0, 3).map((event) => (
                        <Text key={event.id} style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                            {formatLabel(event.event_type)}: {event.message || 'No message.'}
                        </Text>
                    ))}
                    <Text style={[requestTypeStyle, { color: theme.colors.text, marginTop: 12 }]}>
                        Schedule / Assign
                    </Text>
                    <View style={[schedulerPanelStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Technician: {selectedTechnician ? getMemberDisplayName(selectedTechnician) : 'Not selected'}
                        </Text>
                        {!!selectedTechnician && (
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Selected technician ID: {shortId(selectedTechnician.id)}
                            </Text>
                        )}
                        <TextInput
                            value={scheduleForm.technicianSearch}
                            onChangeText={(technicianSearchText) => onUpdateScheduleForm({ technicianSearch: technicianSearchText })}
                            placeholder="Search technicians"
                            placeholderTextColor={theme.colors.mutedText}
                            style={[scheduleTextInputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                        />
                        {activeTechnicians.length === 0 ? (
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                No active technicians found for this company.
                            </Text>
                        ) : visibleTechnicians.length === 0 ? (
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                No technicians match that search.
                            </Text>
                        ) : (
                            <View style={technicianPickerStyle}>
                                {visibleTechnicians.slice(0, 6).map((technician) => {
                                    const selected = scheduleForm.technicianCompanyUserId === technician.id;

                                    return (
                                        <ThemedButton
                                            key={technician.id}
                                            title={`${getMemberDisplayName(technician)}${technician.email ? ` / ${technician.email}` : ''}`}
                                            variant={selected ? 'primary' : 'secondary'}
                                            onPress={() => onUpdateScheduleForm({ technicianCompanyUserId: technician.id })}
                                            style={technicianButtonStyle}
                                            textStyle={{ fontSize: 12 }}
                                        />
                                    );
                                })}
                            </View>
                        )}
                    </View>
                    <MiniScheduleCalendar
                        selectedDate={scheduleForm.date}
                        calendarMonth={scheduleForm.calendarMonth}
                        onSelectDate={(date) => onUpdateScheduleForm({ date, calendarMonth: monthInputFromDateText(date) })}
                        onChangeMonth={(calendarMonth) => onUpdateScheduleForm({ calendarMonth })}
                    />
                    <View style={compactActionRowStyle}>
                        <ThemedButton
                            title="Today"
                            variant={isDateOffsetSelected(scheduleForm.date, 0) ? 'primary' : 'secondary'}
                            onPress={() => {
                                const date = dateTextForOffset(0);
                                onUpdateScheduleForm({ date, calendarMonth: monthInputFromDateText(date) });
                            }}
                            style={compactActionButtonStyle}
                            textStyle={{ fontSize: 12 }}
                        />
                        <ThemedButton
                            title="Tomorrow"
                            variant={isDateOffsetSelected(scheduleForm.date, 1) ? 'primary' : 'secondary'}
                            onPress={() => {
                                const date = dateTextForOffset(1);
                                onUpdateScheduleForm({ date, calendarMonth: monthInputFromDateText(date) });
                            }}
                            style={compactActionButtonStyle}
                            textStyle={{ fontSize: 12 }}
                        />
                        <ThemedButton
                            title="+2 Days"
                            variant={isDateOffsetSelected(scheduleForm.date, 2) ? 'primary' : 'secondary'}
                            onPress={() => {
                                const date = dateTextForOffset(2);
                                onUpdateScheduleForm({ date, calendarMonth: monthInputFromDateText(date) });
                            }}
                            style={compactActionButtonStyle}
                            textStyle={{ fontSize: 12 }}
                        />
                    </View>
                    <Text style={[requestTypeStyle, { color: theme.colors.text, marginTop: 12 }]}>
                        Start Time
                    </Text>
                    <View style={compactActionRowStyle}>
                        {[
                            ['8:00 AM', '08:00'],
                            ['9:00 AM', '09:00'],
                            ['10:00 AM', '10:00'],
                            ['11:00 AM', '11:00'],
                            ['12:00 PM', '12:00'],
                            ['1:00 PM', '13:00'],
                            ['2:00 PM', '14:00'],
                            ['3:00 PM', '15:00'],
                            ['4:00 PM', '16:00'],
                            ['5:00 PM', '17:00'],
                        ].map(([label, startTime]) => (
                            <ThemedButton
                                key={startTime}
                                title={label}
                                variant={scheduleForm.startTime === startTime ? 'primary' : 'secondary'}
                                onPress={() => onUpdateScheduleForm({ startTime })}
                                style={compactActionButtonStyle}
                                textStyle={{ fontSize: 12 }}
                            />
                        ))}
                    </View>
                    <Text style={[requestTypeStyle, { color: theme.colors.text, marginTop: 12 }]}>
                        Estimated Duration
                    </Text>
                    <View style={compactActionRowStyle}>
                        {['30', '60', '90', '120'].map((durationMinutes) => (
                            <ThemedButton
                                key={durationMinutes}
                                title={`${durationMinutes} min`}
                                variant={scheduleForm.durationMinutes === durationMinutes ? 'primary' : 'secondary'}
                                onPress={() => onUpdateScheduleForm({ durationMinutes })}
                                style={compactActionButtonStyle}
                                textStyle={{ fontSize: 12 }}
                            />
                        ))}
                    </View>
                    <View style={scheduleFieldGridStyle}>
                        <ScheduleInput
                            label="Notes"
                            value={scheduleForm.notes}
                            placeholder="Optional"
                            onChangeText={(notes) => onUpdateScheduleForm({ notes })}
                        />
                    </View>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Technician: {selectedTechnician ? getMemberDisplayName(selectedTechnician) : 'Pick a technician.'} / Date: {selectedDateLabel} / Start: {selectedStartLabel} / Duration: {scheduleForm.durationMinutes || '60'} min
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Scheduled window: {scheduledPreview}
                    </Text>
                    <View style={compactActionRowStyle}>
                        {!request.converted_job_id && status === 'new' && (
                            <ThemedButton
                                title={acknowledging ? 'Acknowledging...' : 'Acknowledge'}
                                disabled={acknowledging}
                                onPress={() => onAcknowledge(request)}
                                style={compactActionButtonStyle}
                                textStyle={{ fontSize: 12 }}
                            />
                        )}
                        <ThemedButton
                            title={acknowledging ? 'Assigning...' : 'Assign Tech / Schedule'}
                            disabled={acknowledging || activeTechnicians.length === 0}
                            onPress={onScheduleRequest}
                            style={compactActionButtonStyle}
                            textStyle={{ fontSize: 12 }}
                        />
                        <ThemedButton
                            title="Respond / Note Soon"
                            disabled
                            variant="secondary"
                            style={compactActionButtonStyle}
                            textStyle={{ fontSize: 12 }}
                        />
                        <ThemedButton
                            title="Convert Soon"
                            disabled
                            variant="secondary"
                            style={compactActionButtonStyle}
                            textStyle={{ fontSize: 12 }}
                        />
                    </View>
                    <View style={scheduleFieldGridStyle}>
                        <ScheduleInput
                            label="Cancel Reason"
                            value={scheduleForm.cancelReason}
                            placeholder="Optional"
                            onChangeText={(cancelReason) => onUpdateScheduleForm({ cancelReason })}
                        />
                    </View>
                    <View style={compactActionRowStyle}>
                        <ThemedButton
                            title="Cancel Request"
                            variant="secondary"
                            disabled={acknowledging}
                            onPress={onCancelRequest}
                            style={compactActionButtonStyle}
                            textStyle={{ fontSize: 12 }}
                        />
                    </View>
                    <View style={[secondaryActionPanelStyle, { borderColor: theme.colors.border }]}>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Archive hides old or unanswered requests from the active lead list.
                        </Text>
                        <ScheduleInput
                            label="Archive Reason"
                            value={scheduleForm.archiveReason}
                            placeholder="Optional"
                            onChangeText={(archiveReason) => onUpdateScheduleForm({ archiveReason })}
                        />
                        <ThemedButton
                            title="Archive Request"
                            variant="secondary"
                            disabled={acknowledging}
                            onPress={onArchiveRequest}
                            style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 10 }}
                            textStyle={{ fontSize: 12 }}
                        />
                    </View>
                    {!!actionMessage && (
                        <Text style={[eventNoticeStyle, { color: theme.colors.primary }]}>
                            {actionMessage}
                        </Text>
                    )}
                </View>
            )}
        </ThemedCard>
    );
}

function ScheduleInput({
    label,
    value,
    placeholder,
    onChangeText,
}: {
    label: string;
    value: string;
    placeholder: string;
    onChangeText: (value: string) => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={scheduleInputWrapStyle}>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.mutedText}
                style={{
                    ...scheduleTextInputStyle,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                }}
            />
        </View>
    );
}

function MiniScheduleCalendar({
    selectedDate,
    calendarMonth,
    onSelectDate,
    onChangeMonth,
}: {
    selectedDate: string;
    calendarMonth: string;
    onSelectDate: (date: string) => void;
    onChangeMonth: (month: string) => void;
}) {
    const { theme } = useTheme();
    const monthDate = parseMonthInput(calendarMonth) || parseDateInput(selectedDate) || new Date();
    const days = getCalendarDays(monthDate);
    const todayText = formatDateInput(new Date());
    const monthTitle = monthDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

    return (
        <View style={[calendarPanelStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
            <View style={calendarHeaderStyle}>
                <ThemedButton
                    title="Previous"
                    variant="secondary"
                    onPress={() => onChangeMonth(formatMonthInput(addMonths(monthDate, -1)))}
                    style={calendarNavButtonStyle}
                    textStyle={{ fontSize: 12 }}
                />
                <Text style={[requestTypeStyle, { color: theme.colors.text, textAlign: 'center', flexGrow: 1 }]}>
                    {monthTitle}
                </Text>
                <ThemedButton
                    title="Next"
                    variant="secondary"
                    onPress={() => onChangeMonth(formatMonthInput(addMonths(monthDate, 1)))}
                    style={calendarNavButtonStyle}
                    textStyle={{ fontSize: 12 }}
                />
            </View>
            <View style={calendarGridStyle}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <Text key={day} style={[calendarWeekdayStyle, { color: theme.colors.mutedText }]}>
                        {day}
                    </Text>
                ))}
                {days.map((day) => {
                    const selected = day.dateText === selectedDate;
                    const isToday = day.dateText === todayText;

                    return (
                        <Text
                            key={day.dateText}
                            onPress={() => onSelectDate(day.dateText)}
                            style={[
                                calendarDayStyle,
                                {
                                    backgroundColor: selected
                                        ? theme.colors.primary
                                        : isToday
                                            ? theme.colors.secondaryButton
                                            : 'transparent',
                                    borderColor: isToday || selected ? theme.colors.primary : theme.colors.border,
                                    color: selected
                                        ? theme.colors.primaryText
                                        : day.inCurrentMonth
                                            ? theme.colors.text
                                            : theme.colors.mutedText,
                                },
                            ]}
                        >
                            {day.label}
                        </Text>
                    );
                })}
            </View>
        </View>
    );
}

async function loadTechnicianScheduleSlots({
    companyId,
    technicianCompanyUserId,
    startAt,
    endAt,
}: {
    companyId: string;
    technicianCompanyUserId: string;
    startAt: Date;
    endAt: Date;
}) {
    const { data, error } = await supabase
        .from('job_schedule_slots')
        .select('id, company_id, service_request_id, technician_company_user_id, start_at, end_at, status')
        .eq('company_id', companyId)
        .eq('technician_company_user_id', technicianCompanyUserId)
        .lt('start_at', endAt.toISOString())
        .gt('end_at', startAt.toISOString())
        .order('start_at', { ascending: true });

    if (error) {
        throw new Error(error.message);
    }

    return normalizeScheduleSlots(data);
}

function normalizeScheduleSlots(data: unknown): ScheduleSlot[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                id: readStringField(record, 'id') || '',
                company_id: readStringField(record, 'company_id') || '',
                service_request_id: readStringField(record, 'service_request_id'),
                technician_company_user_id: readStringField(record, 'technician_company_user_id') || '',
                start_at: readStringField(record, 'start_at'),
                end_at: readStringField(record, 'end_at'),
                status: readStringField(record, 'status'),
            };
        })
        .filter((slot) => slot.id && slot.company_id && slot.technician_company_user_id);
}

function mergeScheduleSlots(currentSlots: ScheduleSlot[], freshSlots: ScheduleSlot[]) {
    const byId = new Map<string, ScheduleSlot>();

    [...currentSlots, ...freshSlots].forEach((slot) => {
        byId.set(slot.id, slot);
    });

    return Array.from(byId.values());
}

function findScheduleConflict(
    slots: ScheduleSlot[],
    technicianCompanyUserId: string,
    newStart: Date,
    newEnd: Date
) {
    return slots.find((slot) => (
        slot.technician_company_user_id === technicianCompanyUserId &&
        isActiveScheduleSlot(slot) &&
        hasScheduleSlotOverlap(slot, newStart, newEnd)
    )) || null;
}

function hasScheduleSlotOverlap(slot: ScheduleSlot, newStart: Date, newEnd: Date) {
    if (!slot.start_at || !slot.end_at) return false;

    const existingStart = new Date(slot.start_at);
    const existingEnd = new Date(slot.end_at);

    if (Number.isNaN(existingStart.getTime()) || Number.isNaN(existingEnd.getTime())) return false;

    return newStart < existingEnd && newEnd > existingStart;
}

function isActiveScheduleSlot(slot: ScheduleSlot) {
    return !['cancelled', 'canceled', 'completed', 'archived'].includes(normalizeStatus(slot.status));
}

function formatScheduleConflictRange(slot: ScheduleSlot) {
    return `${formatDateTime(slot.start_at)} to ${formatTime(slot.end_at)}`;
}

async function updateRequestClosedStatus({
    requestId,
    status,
    reason,
}: {
    requestId: string;
    status: 'archived' | 'cancelled';
    reason: string;
}) {
    const rpcName = status === 'archived' ? 'archive_service_request' : 'cancel_service_request';
    const { error } = await supabase.rpc(rpcName, {
        p_service_request_id: requestId,
        p_reason: reason || null,
    });

    if (!error) return;

    if (!isRequestCloseBackendMissingMessage(error.message)) {
        throw new Error(error.message);
    }

    const { error: updateError } = await supabase
        .from('service_requests')
        .update({
            status,
            updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

    if (updateError) {
        throw new Error(`${error.message}; direct status update failed: ${updateError.message}`);
    }
}

function confirmRequestAction(message: string) {
    const confirmLike = (globalThis as { confirm?: (message: string) => boolean }).confirm;

    if (typeof confirmLike === 'function') {
        return Promise.resolve(confirmLike(message));
    }

    return new Promise<boolean>((resolve) => {
        Alert.alert('Confirm Request Action', message, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Confirm', style: 'destructive', onPress: () => resolve(true) },
        ]);
    });
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

async function loadCompanyMembers(companyId: string): Promise<{
    data: CompanyUser[];
    error: { message: string } | null;
}> {
    const rpcResult = await supabase.rpc('get_company_users_for_management', {
        p_company_id: companyId,
    });

    if (!rpcResult.error) {
        return {
            data: normalizeCompanyUsers(rpcResult.data),
            error: null,
        };
    }

    const directResult = await supabase
        .from('company_users')
        .select('id, company_id, auth_user_id, full_name, email, role, status, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

    if (directResult.error) {
        return {
            data: [],
            error: {
                message: `${directResult.error.message}. Management RPC fallback also failed: ${rpcResult.error.message}`,
            },
        };
    }

    return {
        data: normalizeCompanyUsers(directResult.data),
        error: null,
    };
}

function normalizeCompanyUsers(data: unknown): CompanyUser[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                id: readStringField(record, 'id') || '',
                company_id: readStringField(record, 'company_id') || '',
                auth_user_id: readStringField(record, 'auth_user_id'),
                full_name: readStringField(record, 'full_name'),
                email: readStringField(record, 'email'),
                role: readStringField(record, 'role') || 'unknown',
                status: readStringField(record, 'status') || 'unknown',
                created_at: readStringField(record, 'created_at'),
            };
        })
        .filter((member) => member.id && member.company_id);
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function firstParam(value?: string | string[]) {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function isActiveStatus(status?: string | null) {
    return normalizeStatus(status) === 'active';
}

function isTechnicianRole(role?: string | null) {
    const normalized = normalizeStatus(role);

    return normalized === 'technician' || normalized === 'tech';
}

function getMemberDisplayName(member: CompanyUser) {
    return member.full_name || member.email || `Tech ${shortId(member.auth_user_id || member.id)}`;
}

function parseLocalDateTime(dateText: string, timeText: string) {
    const date = dateText.trim();
    const time = timeText.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        return null;
    }

    const parsed = new Date(`${date}T${time}:00`);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateInput(dateText: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;

    const parsed = new Date(`${dateText}T00:00:00`);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMonthInput(monthText: string) {
    if (!/^\d{4}-\d{2}$/.test(monthText)) return null;

    const parsed = new Date(`${monthText}-01T00:00:00`);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalLocalDateTime(dateText: string, timeText: string) {
    return timeText.trim() ? parseLocalDateTime(dateText, timeText) : null;
}

function getNextScheduleStart() {
    const start = new Date();
    const minutes = start.getMinutes();
    const roundedMinutes = minutes === 0 ? 0 : minutes <= 30 ? 30 : 60;

    start.setSeconds(0, 0);

    if (start.getHours() < 8) {
        start.setHours(8, 0, 0, 0);
        return start;
    }

    if (roundedMinutes === 60) {
        start.setHours(start.getHours() + 1, 0, 0, 0);
    } else {
        start.setMinutes(roundedMinutes, 0, 0);
    }

    if (start.getHours() >= 18) {
        start.setDate(start.getDate() + 1);
        start.setHours(8, 0, 0, 0);
    }

    return start;
}

function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function formatMonthInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
}

function monthInputFromDateText(dateText: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? dateText.slice(0, 7) : formatMonthInput(new Date());
}

function formatTimeInput(date: Date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function addMonths(date: Date, months: number) {
    const next = new Date(date);
    next.setDate(1);
    next.setMonth(next.getMonth() + months);

    return next;
}

function dateTextForOffset(daysFromToday: number) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromToday);

    return formatDateInput(date);
}

function isDateOffsetSelected(selectedDate: string, daysFromToday: number) {
    return selectedDate === dateTextForOffset(daysFromToday);
}

function getCalendarDays(monthDate: Date) {
    const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);

        return {
            dateText: formatDateInput(date),
            inCurrentMonth: date.getMonth() === monthDate.getMonth(),
            label: String(date.getDate()),
        };
    });
}

function getSchedulePreview(form: ScheduleRequestForm) {
    const duration = Number.parseInt(form.durationMinutes, 10);
    const start = parseLocalDateTime(form.date, form.startTime);

    if (!start || !Number.isFinite(duration) || duration <= 0) {
        return 'Pick a date and start time.';
    }

    const end = new Date(start.getTime() + duration * 60 * 1000);

    return `${formatScheduleWindowDate(start)} - ${formatTime(end.toISOString())}`;
}

function formatSelectedScheduleDate(dateText: string) {
    const date = parseDateInput(dateText);

    return date ? date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pick a date';
}

function formatSelectedScheduleTime(timeText: string) {
    const date = parseLocalDateTime(formatDateInput(new Date()), timeText);

    return date ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Pick a start time';
}

function formatScheduleWindowDate(date: Date) {
    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatCallType(request: DispatchRequest) {
    const type = normalizeStatus(request.request_type);
    const priority = normalizeStatus(request.priority);

    if (type === 'emergency' || priority === 'emergency') return 'Emergency';
    if (type === 'maintenance') return 'Maintenance';
    if (type === 'regular') return 'Service Call';
    return formatLabel(request.request_type || 'Other');
}

function isMissingAssignmentBackendMessage(message: string) {
    return (
        message.includes('schema cache') ||
        message.includes('could not find the function') ||
        message.includes('function public.schedule_service_request_slot') ||
        message.includes('job_schedule_slots') ||
        message.includes('schedule_service_request_slot') ||
        message.includes('does not exist')
    );
}

function isScheduleBackendMissingMessage(message: string) {
    return isMissingAssignmentBackendMessage(message);
}

function isRequestCloseBackendMissingMessage(message: string) {
    const normalized = normalizeStatus(message);

    return (
        normalized.includes('schema cache') ||
        normalized.includes('could not find the function') ||
        normalized.includes('function public.archive_service_request') ||
        normalized.includes('function public.cancel_service_request') ||
        normalized.includes('archive_service_request') ||
        normalized.includes('cancel_service_request') ||
        normalized.includes('does not exist')
    );
}

function getScheduleBlockBackground(request: DispatchRequest | null) {
    if (request && isEmergencyDispatchRequest(request)) return 'rgba(220, 38, 38, 0.13)';
    if (request && isInProgressStatus(request.status)) return 'rgba(245, 158, 11, 0.14)';
    if (request && isCompletedStatus(request.status)) return 'rgba(4, 120, 87, 0.13)';

    return 'rgba(11, 95, 255, 0.12)';
}

function getScheduleBlockBorder(request: DispatchRequest | null) {
    if (request && isEmergencyDispatchRequest(request)) return 'rgba(220, 38, 38, 0.32)';
    if (request && isInProgressStatus(request.status)) return 'rgba(245, 158, 11, 0.34)';
    if (request && isCompletedStatus(request.status)) return 'rgba(4, 120, 87, 0.32)';

    return 'rgba(11, 95, 255, 0.28)';
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

function isToday(value?: string | null) {
    if (!value) return false;

    const date = new Date(value);
    const today = new Date();

    return (
        !Number.isNaN(date.getTime()) &&
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
    );
}

function isThisWeek(value?: string | null) {
    if (!value) return false;

    const date = new Date(value);
    const today = new Date();

    if (Number.isNaN(date.getTime())) return false;

    const startOfWeek = new Date(today);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return date >= startOfWeek && date < endOfWeek;
}

function formatDateTime(value?: string | null) {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function formatTime(value?: string | null) {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

const leadSummaryRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const leadSummaryPillStyle = {
    borderRadius: 999,
    overflow: 'hidden' as const,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: '900' as const,
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
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: '100%' as const,
    minHeight: 178,
    minWidth: 0,
};

const scheduleSummaryGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 14,
};

const scheduleSummaryCardStyle = {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
};

const scheduleLaneListStyle = {
    gap: 12,
};

const scheduleLaneCardStyle = {
    marginBottom: 0,
};

const scheduleBlockRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 10,
};

const scheduleGlassBlockStyle = {
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 220,
    flexGrow: 1,
    minHeight: 112,
    padding: 12,
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

const expandedDetailStyle = {
    borderTopWidth: 1,
    borderTopColor: '#D6DEE8',
    marginTop: 12,
    paddingTop: 10,
};

const compactActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 10,
};

const compactActionButtonStyle = {
    flexGrow: 1,
    flexBasis: 130,
    paddingHorizontal: 10,
    paddingVertical: 10,
};

const technicianPickerStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 8,
};

const technicianButtonStyle = {
    flexGrow: 1,
    flexBasis: 190,
    paddingHorizontal: 10,
    paddingVertical: 9,
};

const schedulerPanelStyle = {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    padding: 10,
};

const calendarPanelStyle = {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
};

const calendarHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
};

const calendarNavButtonStyle = {
    flexBasis: 92,
    flexGrow: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
};

const calendarGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 4,
};

const calendarWeekdayStyle = {
    flexBasis: '13.4%' as const,
    flexGrow: 1,
    fontSize: 11,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
};

const calendarDayStyle = {
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: '13.4%' as const,
    flexGrow: 1,
    fontSize: 12,
    fontWeight: '900' as const,
    lineHeight: 28,
    minHeight: 30,
    overflow: 'hidden' as const,
    textAlign: 'center' as const,
};

const secondaryActionPanelStyle = {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
};

const scheduleFieldGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 8,
};

const scheduleInputWrapStyle = {
    flexGrow: 1,
    flexBasis: 120,
    minWidth: 100,
};

const scheduleTextInputStyle = {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 13,
    fontWeight: '800' as const,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 9,
};
