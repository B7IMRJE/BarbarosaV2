import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View, type ViewStyle } from 'react-native';
import AdminNavBar from '../components/AdminNavBar';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import { logCompanyAuditEvent, safeAuditRecord } from '../lib/companyAuditLogs';
import {
    calculateCompanyLeadCounts,
    getCompanyDispatchRequests,
    isCompletedStatus,
    isEmergencyDispatchRequest,
    isInProgressStatus,
    LEAD_ALERT_REFRESH_MS,
    type CompanyDispatchRequest,
    type CompanyLeadCounts,
} from '../lib/companyLeadAlerts';
import { canAccessDispatch, normalizeCompanyRole } from '../lib/companyPermissions';
import { calculateDispatchRisk, type DispatchRiskResult } from '../lib/dispatchRisk';
import { loadLoggedInUserCompanyAccess, type CompanyRouteAccessRow } from '../lib/onboarding';
import {
    queueHomeownerAssignmentNotification,
    queueHomeownerDelayNotification,
    queueTechnicianAssignmentNotification,
} from '../lib/serviceNotifications';
import {
    closeServiceVisit,
    getServiceVisitOutcomeLabel,
    SERVICE_VISIT_CLOSEOUT_OPTIONS,
    type ServiceVisitOutcome,
} from '../lib/serviceVisitCloseout';
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

type DispatchCompanyAccessResult = {
    access: CompanyAccess | null;
    choices: CompanyAccess[];
    deniedAccess: CompanyAccess | null;
    isPlatformAdmin: boolean;
};

type DispatchRequest = CompanyDispatchRequest & {
    closeout_outcome?: string | null;
    closeout_notes?: string | null;
    homeowner_closeout_note?: string | null;
    next_action_at?: string | null;
    closed_at?: string | null;
    cancelled_at?: string | null;
    cancel_reason?: string | null;
    archived_at?: string | null;
    archive_reason?: string | null;
    closeout_metadata?: Record<string, unknown>;
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
    event_visibility: string | null;
    audience: string | null;
    schedule_slot_id: string | null;
    dedupe_key: string | null;
    metadata: Record<string, unknown>;
    notification_status: string | null;
    created_at: string | null;
};

type ScheduleSlot = {
    id: string;
    company_id: string;
    service_request_id: string | null;
    technician_company_user_id: string;
    start_at: string | null;
    end_at: string | null;
    arrival_window_start: string | null;
    arrival_window_end: string | null;
    status: string | null;
    estimated_duration_minutes: number | null;
    priority: string | null;
    notes: string | null;
    tech_status_note: string | null;
    visit_outcome: string | null;
    visit_closed_at: string | null;
    closeout_notes: string | null;
    homeowner_closeout_note: string | null;
    closeout_metadata: Record<string, unknown>;
    updated_at: string | null;
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
    durationMode: DurationMode;
    durationMinutes: string;
    arrivalWindowMode: ArrivalWindowMode;
    arrivalWindowHours: string;
    notes: string;
    cancelReason: string;
    archiveReason: string;
    closeoutOutcome: ServiceVisitOutcome | '';
    closeoutNotes: string;
    closeoutHomeownerNote: string;
    closeoutNextActionDate: string;
    closeoutNotifyHomeowner: boolean;
    closeoutPartsDescription: string;
    closeoutOrderReference: string;
};

type DispatchBoardView = 'activity' | 'schedule';
type DispatchLaneGroup = 'active' | 'needs_action' | 'closed' | 'archived';
type WorkQueueCategory = Exclude<DispatchLaneGroup, 'active'>;
type WorkQueueSort = 'next_action' | 'newest' | 'oldest' | 'customer' | 'address' | 'status';
type DispatchLaneKey =
    | 'unassigned'
    | 'assigned'
    | 'on_my_way'
    | 'arrived'
    | 'working'
    | 'waiting'
    | 'needs_follow_up'
    | 'return_visit'
    | 'waiting_for_parts'
    | 'on_hold'
    | 'missed_no_show'
    | 'unable_to_complete'
    | 'completed'
    | 'cancelled'
    | 'archived';
type DispatchLane = {
    key: DispatchLaneKey;
    title: string;
    group: DispatchLaneGroup;
    requests: DispatchRequest[];
};
type DispatchAttentionItem = {
    request: DispatchRequest;
    slot: ScheduleSlot;
    risk: DispatchRiskResult;
};
type WorkQueueRecord = {
    request: DispatchRequest;
    slot: ScheduleSlot | null;
    requestSlots: ScheduleSlot[];
    laneKey: DispatchLaneKey;
    category: WorkQueueCategory;
    technician: CompanyUser | null;
};
type DurationMode = '30' | '60' | '90' | '120' | 'custom';
type ArrivalWindowMode = '0' | '1' | '2' | '3' | 'custom';

const DISPATCH_LANE_DEFINITIONS: Array<{ key: DispatchLaneKey; title: string; group: DispatchLaneGroup }> = [
    { key: 'unassigned', title: 'Unassigned', group: 'active' },
    { key: 'assigned', title: 'Assigned / Scheduled', group: 'active' },
    { key: 'on_my_way', title: 'On My Way', group: 'active' },
    { key: 'arrived', title: 'Arrived', group: 'active' },
    { key: 'working', title: 'Working', group: 'active' },
    { key: 'waiting', title: 'Waiting / Assistance Needed', group: 'active' },
    { key: 'needs_follow_up', title: 'Needs Follow-Up', group: 'needs_action' },
    { key: 'return_visit', title: 'Return Visit', group: 'needs_action' },
    { key: 'waiting_for_parts', title: 'Waiting for Parts', group: 'needs_action' },
    { key: 'on_hold', title: 'On Hold', group: 'needs_action' },
    { key: 'missed_no_show', title: 'Missed / No-Show', group: 'needs_action' },
    { key: 'unable_to_complete', title: 'Unable to Complete', group: 'needs_action' },
    { key: 'completed', title: 'Completed', group: 'closed' },
    { key: 'cancelled', title: 'Cancelled', group: 'closed' },
    { key: 'archived', title: 'Archived', group: 'archived' },
];

const WORK_QUEUE_CATEGORIES: Array<{ key: WorkQueueCategory; label: string }> = [
    { key: 'needs_action', label: 'Needs Action' },
    { key: 'closed', label: 'Closed' },
    { key: 'archived', label: 'Archived' },
];

const WORK_QUEUE_SORT_OPTIONS: Array<{ key: WorkQueueSort; label: string }> = [
    { key: 'next_action', label: 'Next Action Due' },
    { key: 'newest', label: 'Newest' },
    { key: 'oldest', label: 'Oldest' },
    { key: 'customer', label: 'Customer' },
    { key: 'address', label: 'Address' },
    { key: 'status', label: 'Status' },
];

const QUICK_DURATION_OPTIONS: Array<{ label: string; value: Exclude<DurationMode, 'custom'> }> = [
    { label: '30 min', value: '30' },
    { label: '60 min', value: '60' },
    { label: '90 min', value: '90' },
    { label: '120 min', value: '120' },
];

const ARRIVAL_WINDOW_OPTIONS: Array<{ label: string; value: Exclude<ArrivalWindowMode, 'custom'> }> = [
    { label: 'Exact', value: '0' },
    { label: '1 hr', value: '1' },
    { label: '2 hr', value: '2' },
    { label: '3 hr', value: '3' },
];

function createDefaultScheduleForm(): ScheduleRequestForm {
    const start = getNextScheduleStart();

    return {
        technicianCompanyUserId: '',
        technicianSearch: '',
        date: formatDateInput(start),
        calendarMonth: formatMonthInput(start),
        startTime: formatTimeInput(start),
        durationMode: '60',
        durationMinutes: '60',
        arrivalWindowMode: '0',
        arrivalWindowHours: '0',
        notes: '',
        cancelReason: '',
        archiveReason: '',
        closeoutOutcome: '',
        closeoutNotes: '',
        closeoutHomeownerNote: '',
        closeoutNextActionDate: '',
        closeoutNotifyHomeowner: false,
        closeoutPartsDescription: '',
        closeoutOrderReference: '',
    };
}

function createScheduleFormFromSlot(slot: ScheduleSlot | null): ScheduleRequestForm {
    const defaultForm = createDefaultScheduleForm();

    if (!slot) return defaultForm;

    const start = parseIsoDate(slot.start_at);
    const durationMinutes = getScheduleSlotDurationMinutes(slot);
    const durationMode = getDurationModeFromMinutes(durationMinutes);
    const arrivalWindowHours = getScheduleSlotArrivalWindowHours(slot);
    const arrivalWindowMode = getArrivalWindowModeFromHours(arrivalWindowHours);

    return {
        ...defaultForm,
        technicianCompanyUserId: slot.technician_company_user_id,
        date: start ? formatDateInput(start) : defaultForm.date,
        calendarMonth: start ? formatMonthInput(start) : defaultForm.calendarMonth,
        startTime: start ? formatTimeInput(start) : defaultForm.startTime,
        durationMode,
        durationMinutes: durationMinutes ? String(durationMinutes) : defaultForm.durationMinutes,
        arrivalWindowMode,
        arrivalWindowHours: arrivalWindowHours === null ? defaultForm.arrivalWindowHours : String(arrivalWindowHours),
    };
}

function getDurationModeFromMinutes(durationMinutes: number | null): DurationMode {
    if (durationMinutes === 30 || durationMinutes === 60 || durationMinutes === 90 || durationMinutes === 120) {
        return String(durationMinutes) as DurationMode;
    }

    return durationMinutes ? 'custom' : '60';
}

function getArrivalWindowModeFromHours(arrivalWindowHours: number | null): ArrivalWindowMode {
    if (arrivalWindowHours === 0 || arrivalWindowHours === 1 || arrivalWindowHours === 2 || arrivalWindowHours === 3) {
        return String(arrivalWindowHours) as ArrivalWindowMode;
    }

    return arrivalWindowHours === null ? '0' : 'custom';
}

export default function DispatchBoardScreen() {
    const { companyId } = useLocalSearchParams<{ companyId?: string | string[] }>();
    const { width: viewportWidth } = useWindowDimensions();
    const { theme } = useTheme();
    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
    const [loading, setLoading] = useState(true);
    const [companyAccess, setCompanyAccess] = useState<CompanyAccess | null>(null);
    const [companyChoices, setCompanyChoices] = useState<CompanyAccess[]>([]);
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
    const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
    const [activeTechnicians, setActiveTechnicians] = useState<CompanyUser[]>([]);
    const [scheduleFormByRequestId, setScheduleFormByRequestId] = useState<Record<string, ScheduleRequestForm>>({});
    const [requestActionMessageById, setRequestActionMessageById] = useState<Record<string, string>>({});
    const [activeBoardView, setActiveBoardView] = useState<DispatchBoardView>('activity');
    const [workQueueCategory, setWorkQueueCategory] = useState<WorkQueueCategory>('needs_action');
    const [workQueueStatusFilter, setWorkQueueStatusFilter] = useState<DispatchLaneKey | 'all'>('all');
    const [workQueueSearch, setWorkQueueSearch] = useState('');
    const [workQueueSort, setWorkQueueSort] = useState<WorkQueueSort>('next_action');
    const [workQueueFiltersOpen, setWorkQueueFiltersOpen] = useState(false);
    const [workQueueLimit, setWorkQueueLimit] = useState(5);
    const dispatchRefreshInFlight = useRef(false);
    const requestsRef = useRef<DispatchRequest[]>([]);

    const dispatchLanes = useMemo(() => buildDispatchLanes(requests, scheduleSlots), [requests, scheduleSlots]);
    const activeDispatchLanes = useMemo(() => dispatchLanes.filter((lane) => lane.group === 'active'), [dispatchLanes]);
    const activeDispatchCount = useMemo(() => activeDispatchLanes.reduce((count, lane) => count + lane.requests.length, 0), [activeDispatchLanes]);
    const attentionItems = useMemo(() => buildDispatchAttentionItems(requests, scheduleSlots), [requests, scheduleSlots]);
    const selectedDetailRequest = useMemo(
        () => requests.find((request) => request.id === expandedRequestId) || null,
        [expandedRequestId, requests]
    );
    const laneBasis: ViewStyle['flexBasis'] = viewportWidth <= 700 ? '100%' : viewportWidth <= 1100 ? '48%' : '31.8%';

    useEffect(() => {
        loadDispatchBoard();
    }, [requestedCompanyId]);

    useEffect(() => {
        requestsRef.current = requests;
    }, [requests]);

    useEffect(() => {
        if (!expandedRequestId || typeof window === 'undefined') return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                collapseExpandedRequest();
            }
        };
        const handlePopState = () => {
            collapseExpandedRequest();
        };

        window.history.pushState(
            {
                ...(typeof window.history.state === 'object' && window.history.state ? window.history.state : {}),
                dispatchDetailRequestId: expandedRequestId,
            },
            '',
            window.location.href
        );
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [expandedRequestId]);

    useEffect(() => {
        const companyIdToRefresh = companyAccess?.company_id;

        if (!companyIdToRefresh) return;

        async function refreshDispatchBoardQuietly() {
            if (!companyIdToRefresh || dispatchRefreshInFlight.current) return;

            dispatchRefreshInFlight.current = true;

            try {
                const [loadedRequests] = await Promise.all([
                    loadDispatchRequests(companyIdToRefresh),
                    loadActiveTechnicians(companyIdToRefresh),
                ]);
                await loadScheduleSlots(companyIdToRefresh, loadedRequests);
            } finally {
                dispatchRefreshInFlight.current = false;
            }
        }

        const intervalId = setInterval(() => {
            void refreshDispatchBoardQuietly();
        }, LEAD_ALERT_REFRESH_MS);
        const scheduleChannel = supabase
            .channel(`dispatch-job-schedule-slots:${companyIdToRefresh}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'job_schedule_slots',
                    filter: `company_id=eq.${companyIdToRefresh}`,
                },
                () => {
                    void refreshDispatchBoardQuietly();
                }
            )
            .subscribe();

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
            void supabase.removeChannel(scheduleChannel);
            appStateSubscription.remove();
            focusTarget.removeEventListener?.('focus', handleFocus);
        };
    }, [companyAccess?.company_id]);

    async function loadDispatchBoard() {
        setLoading(true);
        setMessage('Loading Dispatch Board...');
        setCompanyAccess(null);
        setCompanyChoices([]);
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
        setCompanyUsers([]);
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

        let accessResult: DispatchCompanyAccessResult;

        try {
            accessResult = await resolveDispatchCompanyAccess(user.id, requestedCompanyId);
        } catch (error) {
            setLoading(false);
            setMessage(`Could not resolve dispatch access: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

        const access = accessResult.access;

        setAuthDebug({
            userId: user.id,
            email: user.email || null,
            accessRole: access?.role || null,
            accessStatus: access?.status || null,
            isPlatformAdmin: accessResult.isPlatformAdmin,
            requestedCompanyId,
            selectedCompanyId: access?.company_id || '',
        });

        if (!access) {
            if (accessResult.deniedAccess) {
                setLoading(false);
                setMessage(getDispatchAccessDeniedMessage(accessResult.deniedAccess.role));
                return;
            }

            if (!requestedCompanyId && accessResult.choices.length > 1) {
                setCompanyChoices(accessResult.choices);
                setLoading(false);
                setMessage('Choose a company to open Dispatch.');
                return;
            }

            setLoading(false);
            setMessage('No company access found.');
            return;
        }

        if (!requestedCompanyId && accessResult.choices.length === 1) {
            replaceDispatchCompanyRoute(access.company_id);
        }

        setCompanyAccess(access);
        await Promise.all([
            loadCompany(access.company_id),
            loadActiveTechnicians(access.company_id),
        ]);
        const loadedRequests = await loadDispatchRequests(access.company_id);
        await loadScheduleSlots(access.company_id, loadedRequests);
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

    async function loadDispatchRequests(companyIdToLoad: string): Promise<DispatchRequest[]> {
        try {
            const loadedRequests = await loadDispatchRequestsWithCloseoutFields(companyIdToLoad);

            requestsRef.current = loadedRequests;
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
            return loadedRequests;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setLeadCountError('Lead count unavailable.');
            setRpcStatusMessage(`get_company_dispatch_requests RPC error: ${errorMessage}`);
            setMessage(`Could not load dispatch requests: ${errorMessage}`);
            return requestsRef.current;
        }
    }

    async function loadActiveTechnicians(companyIdToLoad: string) {
        const result = await loadCompanyMembers(companyIdToLoad);

        if (result.error) {
            setActiveTechnicians([]);
            setMessage(`Could not load active technicians: ${result.error.message}`);
            return;
        }

        setCompanyUsers(result.data);
        setActiveTechnicians(result.data.filter((member) => isActiveStatus(member.status) && isTechnicianRole(member.role)));
    }

    async function loadScheduleSlots(companyIdToLoad: string, requestScope: DispatchRequest[] = requests) {
        const windowStart = new Date();
        const windowEnd = new Date();
        windowStart.setDate(windowStart.getDate() - 30);
        windowEnd.setDate(windowEnd.getDate() + 60);

        const windowResult = await supabase
            .from('job_schedule_slots')
            .select('id, company_id, service_request_id, technician_company_user_id, start_at, end_at, arrival_window_start, arrival_window_end, status, estimated_duration_minutes, priority, notes, tech_status_note, visit_outcome, visit_closed_at, closeout_notes, homeowner_closeout_note, closeout_metadata, updated_at')
            .eq('company_id', companyIdToLoad)
            .gte('start_at', windowStart.toISOString())
            .lte('start_at', windowEnd.toISOString())
            .order('start_at', { ascending: true });
        const requestIds = Array.from(new Set(requestScope.map((request) => request.id).filter(Boolean)));
        const requestResult = requestIds.length > 0
            ? await supabase
                .from('job_schedule_slots')
                .select('id, company_id, service_request_id, technician_company_user_id, start_at, end_at, arrival_window_start, arrival_window_end, status, estimated_duration_minutes, priority, notes, tech_status_note, visit_outcome, visit_closed_at, closeout_notes, homeowner_closeout_note, closeout_metadata, updated_at')
                .eq('company_id', companyIdToLoad)
                .in('service_request_id', requestIds)
                .order('start_at', { ascending: true })
            : { data: [], error: null };

        if (windowResult.error && requestResult.error) {
            setScheduleSlotsMessage(`Schedule assignments unavailable: ${windowResult.error.message}; ${requestResult.error.message}`);
            return;
        }

        const windowSlots = normalizeScheduleSlots(windowResult.data);
        const requestSlots = normalizeScheduleSlots(requestResult.data);
        setScheduleSlots(sortScheduleSlots(mergeScheduleSlots(windowSlots, requestSlots)));
        setScheduleSlotsMessage(
            windowResult.error || requestResult.error
                ? `Some schedule assignments could not load: ${windowResult.error?.message || requestResult.error?.message || 'unknown error'}`
                : ''
        );
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
                    p_company_id: request.company_id,
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
                    events: normalizeServiceRequestEvents(data, request.company_id),
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
            p_company_id: request.company_id,
            p_service_request_id: request.id,
        });

        if (error) {
            setActionRequestId(null);
            setMessage(`Could not acknowledge request: ${error.message}`);
            return;
        }

        await recordCompanyAuditEvent({
            companyId: request.company_id,
            action: 'dispatch_request_acknowledged',
            targetType: 'service_request',
            targetId: request.id,
            targetLabel: getRequestAuditLabel(request),
            beforeData: requestToAuditRecord(request),
            afterData: safeAuditRecord({
                status: 'acknowledged',
            }),
        });
        const loadedRequests = await loadDispatchRequests(request.company_id);
        await loadScheduleSlots(request.company_id, loadedRequests);
        setActionRequestId(null);
        setMessage('Request acknowledged.');
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

    function toggleExpandedRequest(requestId: string) {
        setScheduleFormByRequestId((current) => (
            current[requestId]
                ? current
                : {
                    ...current,
                    [requestId]: createDefaultScheduleForm(),
                }
        ));
        setExpandedRequestId((current) => (current === requestId ? null : requestId));
    }

    function collapseExpandedRequest() {
        const requestIdToFocus = expandedRequestId;
        setExpandedRequestId(null);

        if (requestIdToFocus && typeof document !== 'undefined' && typeof window !== 'undefined') {
            window.requestAnimationFrame(() => {
                document.getElementById(`dispatch-work-queue-row-${requestIdToFocus}`)?.focus();
            });
        }
    }

    function openDispatchWallBoard() {
        const companyIdForWall = companyAccess?.company_id || requestedCompanyId;

        if (!companyIdForWall) {
            setMessage('Choose a company before opening the Activity Board.');
            return;
        }

        const wallboardPath = `/dispatch-wall?companyId=${encodeURIComponent(companyIdForWall)}`;

        if (Platform.OS === 'web') {
            const windowLike = globalThis as {
                open?: (url?: string, target?: string, features?: string) => Window | null;
            };

            const openedWindow = windowLike.open?.(wallboardPath, '_blank', 'noopener,noreferrer');

            if (openedWindow) return;
        }

        router.push(wallboardPath as any);
    }

    async function handleScheduleRequest(request: DispatchRequest) {
        const form = scheduleFormByRequestId[request.id] || createDefaultScheduleForm();
        const duration = getScheduleDurationMinutes(form);
        const arrivalWindowHours = getArrivalWindowHours(form);
        const startAt = parseLocalDateTime(form.date, form.startTime);
        const activeCompanyId = companyAccess?.company_id || '';

        if (!activeCompanyId) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Active company is missing. Refresh Dispatch and try again.' }));
            return;
        }

        if (!request.id) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Selected request is missing. Refresh Dispatch and try again.' }));
            return;
        }

        if (!request.company_id || request.company_id !== activeCompanyId) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Selected request does not match the active company. Refresh Dispatch and try again.' }));
            return;
        }

        if (activeTechnicians.length === 0) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'No active technicians found for this company.' }));
            return;
        }

        if (!form.technicianCompanyUserId) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Select a technician before scheduling.' }));
            return;
        }

        const selectedTechnician = activeTechnicians.find((technician) => technician.id === form.technicianCompanyUserId) || null;
        const previousScheduleSlot = getCurrentRequestScheduleSlot(
            scheduleSlots.filter((slot) => slot.company_id === activeCompanyId && slot.service_request_id === request.id),
            request
        );
        const previousTechnician = previousScheduleSlot && previousScheduleSlot.technician_company_user_id !== form.technicianCompanyUserId
            ? findCompanyUserById(companyUsers, previousScheduleSlot.technician_company_user_id)
            : null;

        if (!selectedTechnician) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Selected technician is not active for this company. Choose another technician.' }));
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

        if (!duration || duration <= 0) {
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: form.durationMode === 'custom'
                    ? 'Enter a custom duration.'
                    : 'Enter a valid estimated duration.',
            }));
            return;
        }

        if (arrivalWindowHours === null || arrivalWindowHours < 0) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Enter a custom arrival window.' }));
            return;
        }

        const endAt = new Date(startAt.getTime() + duration * 60 * 1000);
        const arrivalStart = startAt;
        const arrivalEnd = new Date(startAt.getTime() + arrivalWindowHours * 60 * 60 * 1000);

        setActionRequestId(request.id);
        setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Checking schedule conflicts...' }));

        try {
            const freshTechnicianSlots = await loadTechnicianScheduleSlots({
                companyId: activeCompanyId,
                technicianCompanyUserId: form.technicianCompanyUserId,
                startAt,
                endAt,
            });
            const conflict = findScheduleConflict(
                mergeScheduleSlots(scheduleSlots, freshTechnicianSlots),
                activeCompanyId,
                form.technicianCompanyUserId,
                startAt,
                endAt
            );

            if (conflict) {
                setRequestActionMessageById((current) => ({
                    ...current,
                    [request.id]: conflict.service_request_id === request.id
                        ? `This request is already scheduled with ${selectedTechnician ? getMemberDisplayName(selectedTechnician) : 'this technician'} from ${formatScheduleConflictRange(conflict)}.`
                        : formatScheduleConflictMessage(conflict, selectedTechnician),
                }));
                await loadScheduleSlots(activeCompanyId, requests);
                setActionRequestId(null);
                return;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            if (isScheduleBackendMissingMessage(normalizeStatus(errorMessage))) {
                setRequestActionMessageById((current) => ({
                    ...current,
                    [request.id]: `Tech assignment backend not connected yet: ${errorMessage}`,
                }));
                setActionRequestId(null);
                return;
            }

            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: `Could not check schedule conflicts: ${errorMessage}`,
            }));
            setActionRequestId(null);
            return;
        }

        setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Scheduling request...' }));

        let scheduleErrorMessage = '';
        let scheduledSlot: ScheduleSlot | null = null;

        try {
            const { data, error } = await supabase.rpc('schedule_service_request_slot', {
                p_company_id: activeCompanyId,
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

            scheduleErrorMessage = error?.message || '';
            scheduledSlot = normalizeScheduleSlots(data)[0] || null;
        } catch (error) {
            scheduleErrorMessage = error instanceof Error ? error.message : 'Unknown error';
        }

        setActionRequestId(null);

        if (scheduleErrorMessage) {
            const normalized = normalizeStatus(scheduleErrorMessage);
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: isMissingAssignmentBackendMessage(normalized)
                    ? `Tech assignment backend not connected yet: ${scheduleErrorMessage}`
                    : normalized.includes('scheduled work during this time')
                    ? 'This technician already has a scheduled job during that time.'
                    : `Could not schedule request: ${scheduleErrorMessage}`,
            }));
            return;
        }

        setRequestActionMessageById((current) => ({
            ...current,
            [request.id]: `Scheduled for ${formatDateTime(startAt.toISOString())}.`,
        }));
        if (scheduledSlot) {
            const notificationDetail = await queueAssignmentNotifications({
                request,
                companyName,
                selectedTechnician,
                scheduledSlot,
                previousScheduleSlot,
                previousTechnician,
            });

            if (notificationDetail) {
                setRequestActionMessageById((current) => ({
                    ...current,
                    [request.id]: `Scheduled for ${formatDateTime(startAt.toISOString())}. ${notificationDetail}`,
                }));
            }
        }
        await recordCompanyAuditEvent({
            companyId: activeCompanyId,
            action: 'dispatch_request_scheduled',
            targetType: 'service_request',
            targetId: request.id,
            targetLabel: getRequestAuditLabel(request),
            beforeData: requestToAuditRecord(request),
            afterData: safeAuditRecord({
                status: 'scheduled',
                technician_company_user_id: form.technicianCompanyUserId,
                technician_name: getMemberDisplayName(selectedTechnician),
                start_at: startAt.toISOString(),
                end_at: endAt.toISOString(),
                arrival_window_start: arrivalStart.toISOString(),
                arrival_window_end: arrivalEnd.toISOString(),
                estimated_duration_minutes: duration,
                priority: request.priority || 'normal',
            }),
            metadata: safeAuditRecord({
                notes_present: Boolean(form.notes.trim()),
                arrival_window_hours: arrivalWindowHours,
            }),
        });
        const loadedRequests = await loadDispatchRequests(activeCompanyId);
        await loadScheduleSlots(activeCompanyId, loadedRequests);
    }

    async function handleCancelRequest(request: DispatchRequest) {
        const form = scheduleFormByRequestId[request.id] || createDefaultScheduleForm();
        const confirmed = await confirmRequestAction('Cancel this request?');

        if (!confirmed) return;

        setActionRequestId(request.id);
        setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Cancelling request...' }));

        try {
            const currentScheduleSlot = getCurrentRequestScheduleSlot(
                scheduleSlots.filter((slot) => slot.company_id === request.company_id && slot.service_request_id === request.id),
                request
            );

            if (currentScheduleSlot) {
                await closeServiceVisit({
                    companyId: request.company_id,
                    serviceRequestId: request.id,
                    scheduleSlotId: currentScheduleSlot.id,
                    outcome: 'cancelled',
                    notes: form.cancelReason.trim(),
                    homeownerNote: '',
                    notifyHomeowner: true,
                    metadata: { dispatch_cancel_action: true },
                });
            } else {
                await updateRequestClosedStatus({
                    requestId: request.id,
                    companyId: request.company_id,
                    status: 'cancelled',
                    reason: form.cancelReason.trim(),
                });
            }
            await recordCompanyAuditEvent({
                companyId: request.company_id,
                action: 'dispatch_request_cancelled',
                targetType: 'service_request',
                targetId: request.id,
                targetLabel: getRequestAuditLabel(request),
                beforeData: requestToAuditRecord(request),
                afterData: safeAuditRecord({
                    status: 'cancelled',
                }),
                metadata: safeAuditRecord({
                    reason: form.cancelReason.trim() || null,
                }),
            });
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Request cancelled.' }));
            const loadedRequests = await loadDispatchRequests(request.company_id);
            await loadScheduleSlots(request.company_id, loadedRequests);
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
                companyId: request.company_id,
                status: 'archived',
                reason: form.archiveReason.trim(),
            });
            await recordCompanyAuditEvent({
                companyId: request.company_id,
                action: 'dispatch_request_archived',
                targetType: 'service_request',
                targetId: request.id,
                targetLabel: getRequestAuditLabel(request),
                beforeData: requestToAuditRecord(request),
                afterData: safeAuditRecord({
                    status: 'archived',
                }),
                metadata: safeAuditRecord({
                    reason: form.archiveReason.trim() || null,
                }),
            });
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Request archived.' }));
            const loadedRequests = await loadDispatchRequests(request.company_id);
            await loadScheduleSlots(request.company_id, loadedRequests);
        } catch (error) {
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: `Could not archive request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }));
        } finally {
            setActionRequestId(null);
        }
    }

    async function handleRestoreRequest(request: DispatchRequest) {
        const confirmed = await confirmRequestAction('Restore this archived request?');

        if (!confirmed) return;

        setActionRequestId(request.id);
        setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Restoring request...' }));

        try {
            const { error } = await supabase.rpc('restore_service_request', {
                p_company_id: request.company_id,
                p_service_request_id: request.id,
                p_status: 'acknowledged',
            });

            if (error) {
                throw new Error(error.message);
            }

            await recordCompanyAuditEvent({
                companyId: request.company_id,
                action: 'dispatch_request_restored',
                targetType: 'service_request',
                targetId: request.id,
                targetLabel: getRequestAuditLabel(request),
                beforeData: requestToAuditRecord(request),
                afterData: safeAuditRecord({
                    status: 'acknowledged',
                }),
            });
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Request restored.' }));
            const loadedRequests = await loadDispatchRequests(request.company_id);
            await loadScheduleSlots(request.company_id, loadedRequests);
        } catch (error) {
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: `Could not restore request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }));
        } finally {
            setActionRequestId(null);
        }
    }

    async function handleCloseVisit(request: DispatchRequest) {
        const form = scheduleFormByRequestId[request.id] || createDefaultScheduleForm();
        const requestScheduleSlots = scheduleSlots.filter((slot) => (
            slot.company_id === request.company_id &&
            slot.service_request_id === request.id
        ));
        const currentScheduleSlot = getCurrentRequestScheduleSlot(requestScheduleSlots, request);
        const outcome = form.closeoutOutcome;

        if (!currentScheduleSlot) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'No scheduled visit was found to close.' }));
            return;
        }

        if (!outcome) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Choose a visit outcome before closing.' }));
            return;
        }

        const nextActionAt = parseCloseoutDate(form.closeoutNextActionDate)?.toISOString() || null;
        const outcomeOption = SERVICE_VISIT_CLOSEOUT_OPTIONS.find((option) => option.outcome === outcome) || null;

        setActionRequestId(request.id);
        setRequestActionMessageById((current) => ({
            ...current,
            [request.id]: `Closing visit as ${getServiceVisitOutcomeLabel(outcome)}...`,
        }));

        try {
            const result = await closeServiceVisit({
                companyId: request.company_id,
                serviceRequestId: request.id,
                scheduleSlotId: currentScheduleSlot.id,
                outcome,
                notes: form.closeoutNotes || form.notes,
                homeownerNote: form.closeoutHomeownerNote,
                nextActionAt,
                notifyHomeowner: form.closeoutNotifyHomeowner || Boolean(outcomeOption?.homeownerDefault),
                metadata: {
                    parts_description: form.closeoutPartsDescription.trim() || null,
                    order_reference: form.closeoutOrderReference.trim() || null,
                    dispatch_closeout: true,
                },
            });

            await recordCompanyAuditEvent({
                companyId: request.company_id,
                action: 'dispatch_visit_closed',
                targetType: 'service_request',
                targetId: request.id,
                targetLabel: getRequestAuditLabel(request),
                beforeData: requestToAuditRecord(request),
                afterData: safeAuditRecord({
                    status: result.service_request_status,
                    schedule_slot_id: result.schedule_slot_id,
                    schedule_slot_status: result.schedule_slot_status,
                    visit_outcome: result.visit_outcome,
                }),
                metadata: safeAuditRecord({
                    notes_present: Boolean(form.closeoutNotes.trim()),
                    next_action_at: nextActionAt,
                    homeowner_event_recorded: result.homeowner_event_recorded,
                }),
            });
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: `Visit closed: ${getServiceVisitOutcomeLabel(result.visit_outcome)}.`,
            }));
            const loadedRequests = await loadDispatchRequests(request.company_id);
            await loadScheduleSlots(request.company_id, loadedRequests);
        } catch (error) {
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: `Close visit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }));
        } finally {
            setActionRequestId(null);
        }
    }

    async function handleNotifyHomeownerDelay(request: DispatchRequest) {
        const requestScheduleSlots = scheduleSlots.filter((slot) => (
            slot.company_id === request.company_id &&
            slot.service_request_id === request.id
        ));
        const currentScheduleSlot = getCurrentRequestScheduleSlot(requestScheduleSlots, request);
        const risk = calculateRequestDispatchRisk(request, currentScheduleSlot, scheduleSlots);

        if (!currentScheduleSlot) {
            setRequestActionMessageById((current) => ({ ...current, [request.id]: 'No scheduled assignment was found for this request.' }));
            return;
        }

        if (risk.state !== 'RUNNING_LATE') {
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: 'Homeowner was not notified. At Risk is an internal Dispatch warning until a delay is confirmed.',
            }));
            return;
        }

        const assignedTechnician = findCompanyUserById(companyUsers, currentScheduleSlot.technician_company_user_id);

        setActionRequestId(request.id);
        setRequestActionMessageById((current) => ({ ...current, [request.id]: 'Sending homeowner delay update...' }));

        try {
            const result = await queueHomeownerDelayNotification({
                companyId: request.company_id,
                serviceRequestId: request.id,
                scheduleSlotId: currentScheduleSlot.id,
                technicianName: assignedTechnician ? getMemberDisplayName(assignedTechnician) : 'Your technician',
                arrivalWindowLabel: formatSlotArrivalWindow(currentScheduleSlot),
                estimatedArrivalLabel: risk.estimatedArrivalAt ? formatDateTime(risk.estimatedArrivalAt) : null,
                estimatedDelayMinutes: risk.estimatedDelayMinutes,
            });

            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: result.status === 'recorded'
                    ? 'Homeowner delay update added to the job timeline.'
                    : result.message,
            }));
        } catch (error) {
            setRequestActionMessageById((current) => ({
                ...current,
                [request.id]: `Homeowner delay update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }));
        } finally {
            setActionRequestId(null);
        }
    }

    const companyName = company?.public_name || company?.dba_name || company?.name || 'Company';
    const dispatchCompanyId = companyAccess?.company_id || requestedCompanyId;
    const dispatchBackFallback = dispatchCompanyId
        ? (`/super-admin/company/${dispatchCompanyId}` as Href)
        : ('/super-admin' as Href);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: viewportWidth <= 760 ? 12 : 20, paddingBottom: viewportWidth <= 760 ? 112 : 64, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1120 }}>
                <HomeHeader />
                <AdminNavBar companyId={dispatchCompanyId} backFallback={dispatchBackFallback} />

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
                        <ThemedButton title="Activity Board" variant="secondary" onPress={openDispatchWallBoard} style={buttonStyle} />
                    </View>
                    <View style={buttonRowStyle}>
                        <ThemedButton
                            title="Work Queue"
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

                {!loading && companyChoices.length > 1 ? (
                    <DispatchCompanyPicker
                        choices={companyChoices}
                        onSelectCompany={(companyIdToOpen) => replaceDispatchCompanyRoute(companyIdToOpen)}
                    />
                ) : null}

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading requests...</Text>
                    </ThemedCard>
                ) : companyChoices.length > 1 ? null : activeBoardView === 'schedule' ? (
                    <ActivityScheduleFoundation
                        requests={requests}
                        scheduleSlots={scheduleSlots}
                        activeTechnicians={activeTechnicians}
                        cardBasis={laneBasis}
                    />
                ) : (
                    requests.length === 0 ? (
                        <ThemedCard>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>No active service requests.</Text>
                        </ThemedCard>
                    ) : (
                        <>
                            <View style={dispatchQueueGroupStyle}>
                                <View style={sectionHeaderStyle}>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[activeOperationsTitleStyle, { color: theme.colors.text }]}>Active Operations</Text>
                                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                            Current operational work only. Post-visit records are in Work Queue below.
                                        </Text>
                                    </View>
                                    <View style={activeOperationsHeaderBadgesStyle}>
                                        {attentionItems.length > 0 ? (
                                            <Text style={[countBadgeStyle, { color: '#4C1D95', backgroundColor: 'rgba(124, 58, 237, 0.18)' }]}>
                                                Needs Attention {attentionItems.length}
                                            </Text>
                                        ) : null}
                                        <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                                            {activeDispatchCount}
                                        </Text>
                                    </View>
                                </View>
                                {activeDispatchCount === 0 ? (
                                    <ActiveOperationsEmptySummary lanes={activeDispatchLanes} />
                                ) : (
                                    <View style={dispatchWallStyle}>
                                        {activeDispatchLanes
                                            .filter((lane) => lane.requests.length > 0)
                                            .map((lane) => (
                                                <DispatchSection
                                                    key={lane.key}
                                                    title={lane.title}
                                                    requests={lane.requests}
                                                    eventsByRequestId={eventsByRequestId}
                                                    scheduleSlots={scheduleSlots}
                                                    actionRequestId={actionRequestId}
                                                    laneBasis={laneBasis}
                                                    onToggleRequest={toggleExpandedRequest}
                                                    onCollapseRequest={collapseExpandedRequest}
                                                    onAcknowledge={handleAcknowledge}
                                                    companyUsers={companyUsers}
                                                    activeTechnicians={activeTechnicians}
                                                    scheduleFormByRequestId={scheduleFormByRequestId}
                                                    requestActionMessageById={requestActionMessageById}
                                                    onUpdateScheduleForm={updateScheduleForm}
                                                    onScheduleRequest={handleScheduleRequest}
                                                    onCloseVisit={handleCloseVisit}
                                                    onCancelRequest={handleCancelRequest}
                                                    onArchiveRequest={handleArchiveRequest}
                                                    onRestoreRequest={handleRestoreRequest}
                                                    onNotifyHomeownerDelay={handleNotifyHomeownerDelay}
                                                />
                                            ))}
                                    </View>
                                )}
                            </View>
                            <DispatchWorkQueue
                                requests={requests}
                                scheduleSlots={scheduleSlots}
                                companyUsers={companyUsers}
                                viewportWidth={viewportWidth}
                                category={workQueueCategory}
                                statusFilter={workQueueStatusFilter}
                                search={workQueueSearch}
                                sort={workQueueSort}
                                filtersOpen={workQueueFiltersOpen}
                                limit={workQueueLimit}
                                onSelectCategory={(nextCategory) => {
                                    setWorkQueueCategory(nextCategory);
                                    setWorkQueueStatusFilter('all');
                                    setWorkQueueSort(getDefaultWorkQueueSort(nextCategory));
                                    setWorkQueueLimit(5);
                                }}
                                onSelectStatusFilter={(nextStatus) => {
                                    setWorkQueueStatusFilter(nextStatus);
                                    setWorkQueueLimit(5);
                                }}
                                onChangeSearch={(nextSearch) => {
                                    setWorkQueueSearch(nextSearch);
                                    setWorkQueueLimit(5);
                                }}
                                onChangeSort={setWorkQueueSort}
                                onToggleFilters={() => setWorkQueueFiltersOpen((current) => !current)}
                                onShowMore={() => setWorkQueueLimit((current) => current + 5)}
                                onViewAll={(total) => setWorkQueueLimit(total)}
                                onOpenRequest={toggleExpandedRequest}
                                selectedRequestId={expandedRequestId}
                            />
                            <DispatchRequestDetailDrawer
                                request={selectedDetailRequest}
                                events={selectedDetailRequest ? eventsByRequestId[selectedDetailRequest.id] || [] : []}
                                scheduleSlots={selectedDetailRequest
                                    ? scheduleSlots.filter((slot) => slot.company_id === selectedDetailRequest.company_id && slot.service_request_id === selectedDetailRequest.id)
                                    : []}
                                allScheduleSlots={scheduleSlots}
                                actionRequestId={actionRequestId}
                                companyUsers={companyUsers}
                                activeTechnicians={activeTechnicians}
                                scheduleForm={selectedDetailRequest
                                    ? scheduleFormByRequestId[selectedDetailRequest.id] || createScheduleFormFromSlot(getCurrentRequestScheduleSlot(
                                        scheduleSlots.filter((slot) => slot.company_id === selectedDetailRequest.company_id && slot.service_request_id === selectedDetailRequest.id),
                                        selectedDetailRequest
                                    ))
                                    : createDefaultScheduleForm()}
                                actionMessage={selectedDetailRequest ? requestActionMessageById[selectedDetailRequest.id] || '' : ''}
                                viewportWidth={viewportWidth}
                                onClose={collapseExpandedRequest}
                                onAcknowledge={handleAcknowledge}
                                onUpdateScheduleForm={(updates) => {
                                    if (selectedDetailRequest) updateScheduleForm(selectedDetailRequest.id, updates);
                                }}
                                onScheduleRequest={() => {
                                    if (selectedDetailRequest) handleScheduleRequest(selectedDetailRequest);
                                }}
                                onCloseVisit={() => {
                                    if (selectedDetailRequest) handleCloseVisit(selectedDetailRequest);
                                }}
                                onCancelRequest={() => {
                                    if (selectedDetailRequest) handleCancelRequest(selectedDetailRequest);
                                }}
                                onArchiveRequest={() => {
                                    if (selectedDetailRequest) handleArchiveRequest(selectedDetailRequest);
                                }}
                                onRestoreRequest={() => {
                                    if (selectedDetailRequest) handleRestoreRequest(selectedDetailRequest);
                                }}
                                onNotifyHomeownerDelay={() => {
                                    if (selectedDetailRequest) handleNotifyHomeownerDelay(selectedDetailRequest);
                                }}
                            />
                        </>
                    )
                )}
            </View>
        </ScrollView>
    );
}

function DispatchNeedsAttentionPanel({
    items,
    companyUsers,
    onNotifyHomeownerDelay,
}: {
    items: DispatchAttentionItem[];
    companyUsers: CompanyUser[];
    onNotifyHomeownerDelay: (request: DispatchRequest) => void;
}) {
    const { theme } = useTheme();

    if (items.length === 0) return null;

    return (
        <ThemedCard style={[needsAttentionPanelStyle, { borderColor: '#C4B5FD', backgroundColor: 'rgba(196, 181, 253, 0.12)' }]}>
            <View style={sectionHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Needs Attention</Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Internal timing warnings. Homeowners are notified only after Dispatch confirms a delay.
                    </Text>
                </View>
                <Text style={[countBadgeStyle, { color: '#4C1D95', backgroundColor: 'rgba(124, 58, 237, 0.18)' }]}>
                    {items.length}
                </Text>
            </View>
            <View style={attentionItemListStyle}>
                {items.map((item) => {
                    const technician = findCompanyUserById(companyUsers, item.slot.technician_company_user_id);

                    return (
                        <View key={`${item.request.id}:${item.slot.id}`} style={[attentionItemStyle, { borderColor: getRiskBorderColor(item.risk.state, theme.colors.border) }]}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={[requestTypeStyle, { color: getRiskTextColor(item.risk.state, theme.colors.text) }]}>
                                    {item.risk.label} / {item.request.customer_display_name || item.request.property_display_name || 'Customer'}
                                </Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                                    {item.risk.reason}
                                </Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                                    Tech: {technician ? getMemberDisplayName(technician) : 'Not available'} / Window: {formatSlotArrivalWindow(item.slot)}
                                </Text>
                            </View>
                            <ThemedButton
                                title={item.risk.state === 'RUNNING_LATE' ? 'Notify Homeowner' : 'Watch'}
                                variant={item.risk.state === 'RUNNING_LATE' ? 'primary' : 'secondary'}
                                disabled={item.risk.state !== 'RUNNING_LATE'}
                                onPress={() => onNotifyHomeownerDelay(item.request)}
                                style={{ paddingHorizontal: 12, paddingVertical: 10 }}
                                textStyle={{ fontSize: 12 }}
                            />
                        </View>
                    );
                })}
            </View>
        </ThemedCard>
    );
}

function ActiveOperationsEmptySummary({ lanes }: { lanes: DispatchLane[] }) {
    const { theme } = useTheme();

    return (
        <View style={[activeOperationsEmptySummaryStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
            <Text style={[bodyTextStyle, { color: theme.colors.text, fontWeight: '900' }]}>No active jobs right now.</Text>
            <View style={activeOperationsCountPillRowStyle}>
                {lanes.map((lane) => (
                    <Text
                        key={lane.key}
                        style={[
                            activeOperationsCountPillStyle,
                            { color: theme.colors.mutedText, backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                        ]}
                    >
                        {lane.title} {lane.requests.length}
                    </Text>
                ))}
            </View>
        </View>
    );
}

function DispatchSection({
    title,
    requests,
    eventsByRequestId,
    scheduleSlots,
    actionRequestId,
    laneBasis,
    onToggleRequest,
    onCollapseRequest,
    onAcknowledge,
    companyUsers,
    activeTechnicians,
    scheduleFormByRequestId,
    requestActionMessageById,
    onUpdateScheduleForm,
    onScheduleRequest,
    onCloseVisit,
    onCancelRequest,
    onArchiveRequest,
    onRestoreRequest,
    onNotifyHomeownerDelay,
}: {
    title: string;
    requests: DispatchRequest[];
    eventsByRequestId: Record<string, ServiceRequestEvent[]>;
    scheduleSlots: ScheduleSlot[];
    actionRequestId: string | null;
    laneBasis: ViewStyle['flexBasis'];
    onToggleRequest: (requestId: string) => void;
    onCollapseRequest: () => void;
    onAcknowledge: (request: DispatchRequest) => void;
    companyUsers: CompanyUser[];
    activeTechnicians: CompanyUser[];
    scheduleFormByRequestId: Record<string, ScheduleRequestForm>;
    requestActionMessageById: Record<string, string>;
    onUpdateScheduleForm: (requestId: string, updates: Partial<ScheduleRequestForm>) => void;
    onScheduleRequest: (request: DispatchRequest) => void;
    onCloseVisit: (request: DispatchRequest) => void;
    onCancelRequest: (request: DispatchRequest) => void;
    onArchiveRequest: (request: DispatchRequest) => void;
    onRestoreRequest: (request: DispatchRequest) => void;
    onNotifyHomeownerDelay: (request: DispatchRequest) => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={[dispatchLaneStyle, { flexBasis: laneBasis }]}>
            <View style={sectionHeaderStyle}>
                <Text style={[activeLaneTitleStyle, { color: theme.colors.text }]}>{title}</Text>
                <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {requests.length}
                </Text>
            </View>

            {requests.length === 0 ? (
                <View style={[compactEmptyLaneStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{title} 0</Text>
                </View>
            ) : (
                <View style={requestGridStyle}>
                    {requests.map((request) => {
                        const requestScheduleSlots = scheduleSlots.filter((slot) => (
                            slot.company_id === request.company_id &&
                            slot.service_request_id === request.id
                        ));
                        const currentScheduleSlot = getCurrentRequestScheduleSlot(requestScheduleSlots, request);

                        return (
                            <DispatchRequestCard
                                key={request.id}
                                request={request}
                                events={eventsByRequestId[request.id] || []}
                                scheduleSlots={requestScheduleSlots}
                                allScheduleSlots={scheduleSlots}
                                acknowledging={actionRequestId === request.id}
                                expanded={false}
                                cardBasis="100%"
                                expandedCardBasis="100%"
                                onToggle={() => onToggleRequest(request.id)}
                                onCollapse={onCollapseRequest}
                                onAcknowledge={onAcknowledge}
                                companyUsers={companyUsers}
                                activeTechnicians={activeTechnicians}
                                scheduleForm={scheduleFormByRequestId[request.id] || createScheduleFormFromSlot(currentScheduleSlot)}
                                actionMessage={requestActionMessageById[request.id] || ''}
                                onUpdateScheduleForm={(updates) => onUpdateScheduleForm(request.id, updates)}
                                onScheduleRequest={() => onScheduleRequest(request)}
                                onCloseVisit={() => onCloseVisit(request)}
                                onCancelRequest={() => onCancelRequest(request)}
                                onArchiveRequest={() => onArchiveRequest(request)}
                                onRestoreRequest={() => onRestoreRequest(request)}
                                onNotifyHomeownerDelay={() => onNotifyHomeownerDelay(request)}
                            />
                        );
                    })}
                </View>
            )}
        </View>
    );
}

function DispatchWorkQueue({
    requests,
    scheduleSlots,
    companyUsers,
    viewportWidth,
    category,
    statusFilter,
    search,
    sort,
    filtersOpen,
    limit,
    onSelectCategory,
    onSelectStatusFilter,
    onChangeSearch,
    onChangeSort,
    onToggleFilters,
    onShowMore,
    onViewAll,
    onOpenRequest,
    selectedRequestId,
}: {
    requests: DispatchRequest[];
    scheduleSlots: ScheduleSlot[];
    companyUsers: CompanyUser[];
    viewportWidth: number;
    category: WorkQueueCategory;
    statusFilter: DispatchLaneKey | 'all';
    search: string;
    sort: WorkQueueSort;
    filtersOpen: boolean;
    limit: number;
    onSelectCategory: (category: WorkQueueCategory) => void;
    onSelectStatusFilter: (status: DispatchLaneKey | 'all') => void;
    onChangeSearch: (search: string) => void;
    onChangeSort: (sort: WorkQueueSort) => void;
    onToggleFilters: () => void;
    onShowMore: () => void;
    onViewAll: (total: number) => void;
    onOpenRequest: (requestId: string) => void;
    selectedRequestId: string | null;
}) {
    const { theme } = useTheme();
    const records = useMemo(
        () => buildWorkQueueRecords(requests, scheduleSlots, companyUsers),
        [requests, scheduleSlots, companyUsers]
    );
    const categoryCounts = useMemo(() => getWorkQueueCategoryCounts(records), [records]);
    const relevantStatuses = getWorkQueueStatusOptions(category);
    const statusCounts = useMemo(() => getWorkQueueStatusCounts(records, category), [records, category]);
    const filteredRecords = useMemo(
        () => filterAndSortWorkQueueRecords(records, category, statusFilter, search, sort),
        [records, category, statusFilter, search, sort]
    );
    const visibleRecords = filteredRecords.slice(0, limit);
    const sortLabel = WORK_QUEUE_SORT_OPTIONS.find((option) => option.key === sort)?.label || 'Sort';
    const searchTrimmed = search.trim();

    return (
        <ThemedCard style={workQueueCardStyle}>
            <View style={sectionHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Work Queue</Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Post-visit action, closed, and archived records in one searchable list.
                    </Text>
                </View>
                <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {records.length} total records
                </Text>
            </View>

            <View style={workQueueControlRowStyle}>
                <TextInput
                    value={search}
                    onChangeText={onChangeSearch}
                    placeholder="Search job code, customer, address, ZIP, or technician"
                    placeholderTextColor={theme.colors.mutedText}
                    style={[
                        workQueueSearchInputStyle,
                        viewportWidth <= 760 ? workQueueSearchInputMobileStyle : null,
                        {
                            borderColor: theme.colors.border,
                            color: theme.colors.text,
                            backgroundColor: theme.colors.surface,
                        },
                    ]}
                />
                <ThemedButton
                    title={filtersOpen ? 'Hide Filters' : 'Filters'}
                    variant={filtersOpen ? 'primary' : 'secondary'}
                    onPress={onToggleFilters}
                    style={workQueueControlButtonStyle}
                    textStyle={{ fontSize: 12 }}
                />
                <ThemedButton
                    title={`Sort: ${sortLabel}`}
                    variant="secondary"
                    onPress={() => onChangeSort(getNextWorkQueueSort(sort))}
                    style={workQueueSortButtonStyle}
                    textStyle={{ fontSize: 12 }}
                />
            </View>

            <View style={workQueueCategoryRowStyle}>
                {WORK_QUEUE_CATEGORIES.map((item) => (
                    <ThemedButton
                        key={item.key}
                        title={`${item.label} ${categoryCounts[item.key] || 0}`}
                        variant={category === item.key ? 'primary' : 'secondary'}
                        onPress={() => onSelectCategory(item.key)}
                        style={workQueueCategoryButtonStyle}
                        textStyle={{ fontSize: 12 }}
                    />
                ))}
            </View>

            {filtersOpen && (
                <View style={[workQueueFilterTrayStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                    <ThemedButton
                        title={`All ${categoryCounts[category] || 0}`}
                        variant={statusFilter === 'all' ? 'primary' : 'secondary'}
                        onPress={() => onSelectStatusFilter('all')}
                        style={workQueueFilterButtonStyle}
                        textStyle={{ fontSize: 12 }}
                    />
                    {relevantStatuses.map((status) => (
                        <ThemedButton
                            key={status}
                            title={`${getDispatchLaneTitle(status)} ${statusCounts[status] || 0}`}
                            variant={statusFilter === status ? 'primary' : 'secondary'}
                            onPress={() => onSelectStatusFilter(status)}
                            style={workQueueFilterButtonStyle}
                            textStyle={{ fontSize: 12 }}
                        />
                    ))}
                </View>
            )}

            <View style={workQueueResultSummaryStyle}>
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    Showing {visibleRecords.length} of {filteredRecords.length}
                    {searchTrimmed ? ` for "${searchTrimmed}"` : ''}
                </Text>
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    Total records: {records.length}
                </Text>
            </View>

            {filteredRecords.length === 0 ? (
                <View style={[workQueueEmptyStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        No work queue records match this view.
                    </Text>
                </View>
            ) : (
                <View style={workQueueListStyle}>
                    {visibleRecords.map((record) => (
                        <WorkQueueRow
                            key={`${record.request.id}:${record.laneKey}`}
                            record={record}
                            selected={record.request.id === selectedRequestId}
                            onOpen={() => onOpenRequest(record.request.id)}
                        />
                    ))}
                </View>
            )}

            {filteredRecords.length > visibleRecords.length && (
                <View style={compactActionRowStyle}>
                    <ThemedButton
                        title="Show More"
                        variant="secondary"
                        onPress={onShowMore}
                        style={compactActionButtonStyle}
                        textStyle={{ fontSize: 12 }}
                    />
                    <ThemedButton
                        title="View All"
                        variant="secondary"
                        onPress={() => onViewAll(filteredRecords.length)}
                        style={compactActionButtonStyle}
                        textStyle={{ fontSize: 12 }}
                    />
                </View>
            )}
        </ThemedCard>
    );
}

function WorkQueueRow({ record, selected, onOpen }: { record: WorkQueueRecord; selected: boolean; onOpen: () => void }) {
    const { theme } = useTheme();
    const identifier = getWorkQueueIdentifier(record.request);
    const address = abbreviateAddress(record.request);
    const title = record.request.customer_display_name || record.request.property_display_name || 'Homeowner';
    const statusLabel = getDispatchLaneTitle(record.laneKey);
    const detailLine = getWorkQueueDetailLine(record);
    const technician = record.technician ? getMemberDisplayName(record.technician) : '';

    return (
        <View
            style={[
                workQueueRowPressableStyle,
                workQueueRowStyle,
                {
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected ? theme.colors.background : theme.colors.surface,
                },
            ]}
        >
            <Pressable
                nativeID={`dispatch-work-queue-row-${record.request.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Toggle job details for ${identifier}`}
                onPress={onOpen}
                style={workQueueRowMainPressableStyle}
            >
                <View style={workQueuePrimaryLineStyle}>
                    <Text
                        style={[
                            workQueueDisplayCodeBadgeStyle,
                            {
                                color: theme.colors.primary,
                                backgroundColor: theme.colors.background,
                                borderColor: theme.colors.border,
                            },
                        ]}
                        numberOfLines={1}
                    >
                        {identifier}
                    </Text>
                    <Text style={[requestTypeStyle, { color: theme.colors.text, flex: 1, minWidth: 0 }]} numberOfLines={1}>
                        {address}
                    </Text>
                </View>
                <Text style={[requestTitleStyle, { color: theme.colors.text, marginBottom: 0 }]} numberOfLines={1}>
                    {title} · {statusLabel}
                </Text>
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                    {detailLine}
                    {technician ? ` · ${technician}` : ''}
                </Text>
            </Pressable>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Toggle job details for ${identifier}`}
                onPress={onOpen}
                style={({ pressed }) => [
                    workQueueExpandButtonStyle,
                    {
                        borderColor: theme.colors.border,
                        backgroundColor: pressed ? theme.colors.secondaryButton : theme.colors.background,
                    },
                ]}
            >
                <Text style={[workQueueOpenButtonTextStyle, { color: theme.colors.primary }]}>Open ›</Text>
            </Pressable>
        </View>
    );
}

function DispatchRequestDetailDrawer({
    request,
    events,
    scheduleSlots,
    allScheduleSlots,
    actionRequestId,
    companyUsers,
    activeTechnicians,
    scheduleForm,
    actionMessage,
    viewportWidth,
    onClose,
    onAcknowledge,
    onUpdateScheduleForm,
    onScheduleRequest,
    onCloseVisit,
    onCancelRequest,
    onArchiveRequest,
    onRestoreRequest,
    onNotifyHomeownerDelay,
}: {
    request: DispatchRequest | null;
    events: ServiceRequestEvent[];
    scheduleSlots: ScheduleSlot[];
    allScheduleSlots: ScheduleSlot[];
    actionRequestId: string | null;
    companyUsers: CompanyUser[];
    activeTechnicians: CompanyUser[];
    scheduleForm: ScheduleRequestForm;
    actionMessage: string;
    viewportWidth: number;
    onClose: () => void;
    onAcknowledge: (request: DispatchRequest) => void;
    onUpdateScheduleForm: (updates: Partial<ScheduleRequestForm>) => void;
    onScheduleRequest: () => void;
    onCloseVisit: () => void;
    onCancelRequest: () => void;
    onArchiveRequest: () => void;
    onRestoreRequest: () => void;
    onNotifyHomeownerDelay: () => void;
}) {
    const { theme } = useTheme();
    const detailBodyRef = useRef<ScrollView | null>(null);
    const requestId = request?.id || null;

    useEffect(() => {
        if (!requestId) return;

        const resetScroll = () => {
            detailBodyRef.current?.scrollTo({ y: 0, animated: false });
        };

        resetScroll();
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(resetScroll);
        } else {
            setTimeout(resetScroll, 0);
        }
    }, [requestId]);

    if (!request) return null;

    const isNarrow = viewportWidth <= 760;
    const identifier = getWorkQueueIdentifier(request);
    const title = request.customer_display_name || request.property_display_name || request.issue_summary || 'Job details';

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={detailDrawerBackdropStyle}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close job details backdrop"
                    onPress={onClose}
                    style={detailDrawerBackdropPressableStyle}
                />
                <View
                    style={[
                        detailDrawerPanelStyle,
                        isNarrow ? detailDrawerPanelMobileStyle : null,
                        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                    ]}
                >
                    <View style={[detailDrawerHeaderStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                        {isNarrow ? (
                            <>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Close job details"
                                    onPress={onClose}
                                    style={({ pressed }) => [
                                        detailDrawerCloseButtonStyle,
                                        {
                                            borderColor: theme.colors.border,
                                            backgroundColor: pressed ? theme.colors.text : theme.colors.primary,
                                        },
                                    ]}
                                >
                                    <Text style={[detailDrawerCloseButtonTextStyle, { color: theme.colors.primaryText }]}>
                                        ← Close
                                    </Text>
                                </Pressable>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={[requestTypeStyle, { color: theme.colors.primary }]} numberOfLines={1}>
                                        {identifier}
                                    </Text>
                                    <Text style={[requestTitleStyle, { color: theme.colors.text, marginBottom: 0 }]} numberOfLines={1}>
                                        {title}
                                    </Text>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={[requestTypeStyle, { color: theme.colors.primary }]} numberOfLines={1}>
                                        Job Details · {identifier}
                                    </Text>
                                    <Text style={[requestTitleStyle, { color: theme.colors.text, marginBottom: 0 }]} numberOfLines={1}>
                                        {title}
                                    </Text>
                                </View>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Close job details"
                                    onPress={onClose}
                                    style={({ pressed }) => [
                                        detailDrawerCloseButtonStyle,
                                        {
                                            borderColor: theme.colors.border,
                                            backgroundColor: pressed ? theme.colors.text : theme.colors.primary,
                                        },
                                    ]}
                                >
                                    <Text style={[detailDrawerCloseButtonTextStyle, { color: theme.colors.primaryText }]}>
                                        ✕ Close
                                    </Text>
                                </Pressable>
                            </>
                        )}
                    </View>
                    <ScrollView
                        key={`dispatch-detail-body-${request.id}`}
                        ref={detailBodyRef}
                        showsVerticalScrollIndicator={false}
                        style={detailDrawerScrollStyle}
                        contentContainerStyle={detailDrawerScrollContentStyle}
                    >
                        <DispatchRequestCard
                            request={request}
                            events={events}
                            scheduleSlots={scheduleSlots}
                            allScheduleSlots={allScheduleSlots}
                            acknowledging={actionRequestId === request.id}
                            expanded
                            cardBasis="100%"
                            expandedCardBasis="100%"
                            onToggle={onClose}
                            onCollapse={onClose}
                            onAcknowledge={onAcknowledge}
                            companyUsers={companyUsers}
                            activeTechnicians={activeTechnicians}
                            scheduleForm={scheduleForm}
                            actionMessage={actionMessage}
                            onUpdateScheduleForm={onUpdateScheduleForm}
                            onScheduleRequest={onScheduleRequest}
                            onCloseVisit={onCloseVisit}
                            onCancelRequest={onCancelRequest}
                            onArchiveRequest={onArchiveRequest}
                            onRestoreRequest={onRestoreRequest}
                            onNotifyHomeownerDelay={onNotifyHomeownerDelay}
                        />
                    </ScrollView>
                </View>
            </View>
        </Modal>
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
                                    {formatTime(slot.start_at)} - {formatTime(slot.end_at)} / {formatTechOSStatusLabel(slot.status || request?.status || 'scheduled')}
                                </Text>
                                {!!slot.tech_status_note && (
                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                                        {slot.tech_status_note}
                                    </Text>
                                )}
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

function DispatchCompanyPicker({
    choices,
    onSelectCompany,
}: {
    choices: CompanyAccess[];
    onSelectCompany: (companyId: string) => void;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={{ marginBottom: 16 }}>
            <Text style={[requestTitleStyle, { color: theme.colors.text }]}>Choose Company</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                Select the company whose Dispatch board you want to open.
            </Text>
            <View style={buttonRowStyle}>
                {choices.map((choice) => (
                    <ThemedButton
                        key={choice.company_id}
                        title={`Company ${shortId(choice.company_id)} / ${formatLabel(choice.role || 'staff')}`}
                        variant="secondary"
                        onPress={() => onSelectCompany(choice.company_id)}
                        style={buttonStyle}
                    />
                ))}
            </View>
        </ThemedCard>
    );
}

function DispatchRequestCard({
    request,
    events,
    scheduleSlots,
    allScheduleSlots,
    acknowledging,
    expanded,
    cardBasis,
    expandedCardBasis,
    onToggle,
    onCollapse,
    onAcknowledge,
    companyUsers,
    activeTechnicians,
    scheduleForm,
    actionMessage,
    onUpdateScheduleForm,
    onScheduleRequest,
    onCloseVisit,
    onCancelRequest,
    onArchiveRequest,
    onRestoreRequest,
    onNotifyHomeownerDelay,
}: {
    request: DispatchRequest;
    events: ServiceRequestEvent[];
    scheduleSlots: ScheduleSlot[];
    allScheduleSlots: ScheduleSlot[];
    acknowledging: boolean;
    expanded: boolean;
    cardBasis: ViewStyle['flexBasis'];
    expandedCardBasis: ViewStyle['flexBasis'];
    onToggle: () => void;
    onCollapse: () => void;
    onAcknowledge: (request: DispatchRequest) => void;
    companyUsers: CompanyUser[];
    activeTechnicians: CompanyUser[];
    scheduleForm: ScheduleRequestForm;
    actionMessage: string;
    onUpdateScheduleForm: (updates: Partial<ScheduleRequestForm>) => void;
    onScheduleRequest: () => void;
    onCloseVisit: () => void;
    onCancelRequest: () => void;
    onArchiveRequest: () => void;
    onRestoreRequest: () => void;
    onNotifyHomeownerDelay: () => void;
}) {
    const { theme } = useTheme();
    const status = normalizeStatus(request.status);
    const latestUpdateRequest = events.find((event) => normalizeStatus(event.event_type) === 'update_requested');
    const latestTimingResponse = events.find((event) => normalizeStatus(event.event_type) === 'technician_timing_response');
    const displayName = request.customer_display_name || request.property_display_name || 'Homeowner';
    const selectedTechnician = activeTechnicians.find((technician) => technician.id === scheduleForm.technicianCompanyUserId) || null;
    const currentScheduleSlot = getCurrentRequestScheduleSlot(scheduleSlots, request);
    const assignedTechnician = currentScheduleSlot
        ? companyUsers.find((member) => member.id === currentScheduleSlot.technician_company_user_id) ||
            activeTechnicians.find((technician) => technician.id === currentScheduleSlot.technician_company_user_id) ||
            null
        : selectedTechnician;
    const assignedTechnicianLabel = assignedTechnician
        ? getMemberDisplayName(assignedTechnician)
        : currentScheduleSlot
        ? `Company user ${shortId(currentScheduleSlot.technician_company_user_id)}`
        : 'Not assigned';
    const technicianSearch = normalizeStatus(scheduleForm.technicianSearch);
    const visibleTechnicians = activeTechnicians.filter((technician) => {
        if (!technicianSearch) return true;

        return normalizeStatus(`${getMemberDisplayName(technician)} ${technician.email || ''} ${technician.role || ''}`).includes(technicianSearch);
    });
    const durationMinutes = getScheduleDurationMinutes(scheduleForm);
    const arrivalWindowHours = getArrivalWindowHours(scheduleForm);
    const arrivalWindowPreview = getArrivalWindowPreview(scheduleForm);
    const selectedDateLabel = formatSelectedScheduleDate(scheduleForm.date);
    const selectedStartLabel = formatSelectedScheduleTime(scheduleForm.startTime);
    const risk = calculateRequestDispatchRisk(request, currentScheduleSlot, allScheduleSlots);
    const attentionReason = getCompactAttentionReason(request, currentScheduleSlot, risk);
    const operationalStatusLabel = formatRequestOperationalStatus(request, currentScheduleSlot);
    const priorityLabel = formatLabel(request.priority || request.request_type || 'Normal');
    const statusBadgeLabel = risk.state !== 'ON_TIME' ? risk.label : operationalStatusLabel;
    const issueLine = request.issue_summary || 'No description provided.';
    const scheduleLine = `${formatSlotArrivalWindow(currentScheduleSlot)} · ${assignedTechnicianLabel}`;

    return (
        <ThemedCard
            style={[
                requestCardStyle,
                {
                    flexBasis: expanded ? expandedCardBasis : cardBasis,
                    flexGrow: expanded ? 1 : 0,
                    borderColor: getRiskBorderColor(risk.state, theme.colors.border),
                    borderWidth: risk.state === 'ON_TIME' ? 1 : 2,
                    backgroundColor: getRiskBackgroundColor(risk.state, theme.colors.surface),
                },
            ]}
        >
            <View style={compactActiveRowTopStyle}>
                <View style={compactActiveBadgeRowStyle}>
                    <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                        {priorityLabel}
                    </Text>
                    <Text
                        style={[
                            riskBadgeStyle,
                            {
                                color: risk.state !== 'ON_TIME'
                                    ? getRiskTextColor(risk.state, theme.colors.text)
                                    : theme.colors.secondaryButtonText,
                                backgroundColor: risk.state !== 'ON_TIME'
                                    ? getRiskBadgeBackground(risk.state, theme.colors.secondaryButton)
                                    : theme.colors.secondaryButton,
                            },
                        ]}
                    >
                        {statusBadgeLabel}
                    </Text>
                </View>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={expanded ? 'Collapse request details' : 'Open request details'}
                    onPress={expanded ? onCollapse : onToggle}
                    style={({ pressed }) => [
                        compactExpandButtonStyle,
                        compactActivePressableButtonStyle,
                        {
                            borderColor: theme.colors.border,
                            backgroundColor: pressed ? theme.colors.secondaryButton : theme.colors.surface,
                        },
                    ]}
                >
                    <Text style={[compactActiveButtonTextStyle, { color: theme.colors.secondaryButtonText }]}>
                        {expanded ? 'Collapse' : 'Open'}
                    </Text>
                </Pressable>
            </View>

            <Text style={[compactActiveCustomerLineStyle, { color: theme.colors.text }]} numberOfLines={1}>
                {displayName} · {abbreviateAddress(request)}
            </Text>
            <Text style={[compactActiveMetaLineStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                {issueLine} · {scheduleLine}
            </Text>
            {(!!attentionReason || risk.state === 'RUNNING_LATE') && (
                <View style={compactAttentionRowStyle}>
                {!!attentionReason && (
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText, flex: 1 }]} numberOfLines={1}>
                        {attentionReason}
                    </Text>
                )}
                    {risk.state === 'RUNNING_LATE' ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Notify homeowner"
                            disabled={acknowledging}
                            onPress={onNotifyHomeownerDelay}
                            style={({ pressed }) => [
                                compactNotifyButtonStyle,
                                compactActivePressableButtonStyle,
                                {
                                    borderColor: theme.colors.primary,
                                    backgroundColor: pressed ? theme.colors.text : theme.colors.primary,
                                    opacity: acknowledging ? 0.55 : 1,
                                },
                            ]}
                        >
                            <Text style={[compactActiveButtonTextStyle, { color: theme.colors.primaryText }]}>
                                Notify Homeowner
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            )}
            {expanded && !!latestUpdateRequest && (
                <Text style={[eventNoticeStyle, { color: theme.colors.primary }]}>
                    Homeowner requested update
                </Text>
            )}

            {expanded && (
                <View style={expandedDetailStyle}>
                    <ThemedButton
                        title="Collapse"
                        variant="ghost"
                        onPress={onCollapse}
                        style={{ alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12 }}
                        textStyle={{ fontSize: 12 }}
                    />
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={3}>
                        {request.issue_summary || 'No summary available.'}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Job code: {getWorkQueueIdentifier(request)}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Status: {formatLabel(request.status)}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Created: {formatDateTime(request.created_at)}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Property: {formatPropertyAddress(request)}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Scheduled: {formatScheduleStart(currentScheduleSlot)}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Arrival window: {formatSlotArrivalWindow(currentScheduleSlot)}
                    </Text>
                    {!!currentScheduleSlot && (
                        <View style={[techStatusPanelStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                            <View style={requestTopRowStyle}>
                                <Text style={[requestTypeStyle, { color: theme.colors.text }]}>
                                    {isActiveDispatchRequestForRisk(request, currentScheduleSlot) ? 'TechOS Status' : 'Visit Status'}
                                </Text>
                                <Text style={[countBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                                    {isActiveDispatchRequestForRisk(request, currentScheduleSlot)
                                        ? formatTechOSStatusLabel(currentScheduleSlot.status)
                                        : formatRequestOperationalStatus(request, currentScheduleSlot)}
                                </Text>
                            </View>
                            {!!currentScheduleSlot.visit_outcome && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                                    Visit outcome: {getServiceVisitOutcomeLabel(currentScheduleSlot.visit_outcome)}
                                </Text>
                            )}
                            {!!currentScheduleSlot.tech_status_note && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                                    {currentScheduleSlot.tech_status_note}
                                </Text>
                            )}
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Updated: {formatDateTime(currentScheduleSlot.updated_at)}
                            </Text>
                        </View>
                    )}
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
                    {risk.state !== 'ON_TIME' && (
                        <View style={[secondaryActionPanelStyle, { borderColor: getRiskBorderColor(risk.state, theme.colors.border) }]}>
                            <Text style={[requestTypeStyle, { color: getRiskTextColor(risk.state, theme.colors.text) }]}>
                                Delay Risk: {risk.label}
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{risk.reason}</Text>
                            {!!risk.estimatedArrivalAt && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Estimated arrival: {formatDateTime(risk.estimatedArrivalAt)}
                                </Text>
                            )}
                            {risk.estimatedDelayMinutes !== null && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Estimated delay: {risk.estimatedDelayMinutes} min
                                </Text>
                            )}
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Suggested: {risk.suggestedActions.join(' / ')}
                            </Text>
                            {!!latestTimingResponse && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Tech timing: {formatTimingResponse(latestTimingResponse)}
                                </Text>
                            )}
                            <ThemedButton
                                title={risk.state === 'RUNNING_LATE' ? 'Notify Homeowner' : 'Notify after confirmed delay'}
                                variant={risk.state === 'RUNNING_LATE' ? 'primary' : 'secondary'}
                                disabled={acknowledging || risk.state !== 'RUNNING_LATE'}
                                onPress={onNotifyHomeownerDelay}
                                style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 10 }}
                                textStyle={{ fontSize: 12 }}
                            />
                        </View>
                    )}
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
                    <View style={scheduleFormRowsStyle}>
                        <View style={[schedulerPanelStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                            <View style={schedulePanelHeaderStyle}>
                                <Text style={[requestTypeStyle, { color: theme.colors.text }]}>Technician</Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    {selectedTechnician ? getMemberDisplayName(selectedTechnician) : 'No technician selected'}
                                </Text>
                            </View>
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

                        <View style={[schedulerPanelStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                            <View style={schedulePanelHeaderStyle}>
                                <Text style={[requestTypeStyle, { color: theme.colors.text }]}>Date + Start Time</Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    {selectedDateLabel} / {selectedStartLabel}
                                </Text>
                            </View>
                            <View style={scheduleFieldGridStyle}>
                                <ScheduleInput
                                    label="Date"
                                    value={scheduleForm.date}
                                    placeholder="YYYY-MM-DD"
                                    onChangeText={(date) => onUpdateScheduleForm({ date, calendarMonth: monthInputFromDateText(date) })}
                                />
                                <View style={scheduleInputWrapStyle}>
                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>Quick Dates</Text>
                                    <View style={compactActionRowStyle}>
                                        <ThemedButton
                                            title="Today"
                                            variant={isDateOffsetSelected(scheduleForm.date, 0) ? 'primary' : 'secondary'}
                                            onPress={() => {
                                                const date = dateTextForOffset(0);
                                                onUpdateScheduleForm({ date, calendarMonth: monthInputFromDateText(date) });
                                            }}
                                            style={quickScheduleButtonStyle}
                                            textStyle={{ fontSize: 12 }}
                                        />
                                        <ThemedButton
                                            title="Tomorrow"
                                            variant={isDateOffsetSelected(scheduleForm.date, 1) ? 'primary' : 'secondary'}
                                            onPress={() => {
                                                const date = dateTextForOffset(1);
                                                onUpdateScheduleForm({ date, calendarMonth: monthInputFromDateText(date) });
                                            }}
                                            style={quickScheduleButtonStyle}
                                            textStyle={{ fontSize: 12 }}
                                        />
                                        <ThemedButton
                                            title="+2 Days"
                                            variant={isDateOffsetSelected(scheduleForm.date, 2) ? 'primary' : 'secondary'}
                                            onPress={() => {
                                                const date = dateTextForOffset(2);
                                                onUpdateScheduleForm({ date, calendarMonth: monthInputFromDateText(date) });
                                            }}
                                            style={quickScheduleButtonStyle}
                                            textStyle={{ fontSize: 12 }}
                                        />
                                    </View>
                                </View>
                            </View>
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
                                        style={quickScheduleButtonStyle}
                                        textStyle={{ fontSize: 12 }}
                                    />
                                ))}
                            </View>
                        </View>

                        <View style={scheduleTwoColumnRowStyle}>
                            <View style={[schedulerPanelStyle, scheduleHalfPanelStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                                <View style={schedulePanelHeaderStyle}>
                                    <Text style={[requestTypeStyle, { color: theme.colors.text }]}>Duration</Text>
                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                        {formatDurationSummary(durationMinutes)}
                                    </Text>
                                </View>
                                <View style={compactActionRowStyle}>
                                    {QUICK_DURATION_OPTIONS.map((option) => (
                                        <ThemedButton
                                            key={option.value}
                                            title={option.label}
                                            variant={scheduleForm.durationMode === option.value ? 'primary' : 'secondary'}
                                            onPress={() => onUpdateScheduleForm({ durationMode: option.value, durationMinutes: option.value })}
                                            style={quickScheduleButtonStyle}
                                            textStyle={{ fontSize: 12 }}
                                        />
                                    ))}
                                    <ThemedButton
                                        title="Custom"
                                        variant={scheduleForm.durationMode === 'custom' ? 'primary' : 'secondary'}
                                        onPress={() => onUpdateScheduleForm({
                                            durationMode: 'custom',
                                            durationMinutes: scheduleForm.durationMode === 'custom' ? scheduleForm.durationMinutes : '',
                                        })}
                                        style={quickScheduleButtonStyle}
                                        textStyle={{ fontSize: 12 }}
                                    />
                                </View>
                                <ScheduleInput
                                    label="Custom Duration (min)"
                                    value={scheduleForm.durationMode === 'custom' ? scheduleForm.durationMinutes : ''}
                                    placeholder="Minutes"
                                    onChangeText={(durationMinutesText) => onUpdateScheduleForm({ durationMode: 'custom', durationMinutes: durationMinutesText })}
                                />
                            </View>

                            <View style={[schedulerPanelStyle, scheduleHalfPanelStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                                <View style={schedulePanelHeaderStyle}>
                                    <Text style={[requestTypeStyle, { color: theme.colors.text }]}>Arrival Window</Text>
                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                        {formatArrivalWindowSummary(arrivalWindowHours)}
                                    </Text>
                                </View>
                                <View style={compactActionRowStyle}>
                                    {ARRIVAL_WINDOW_OPTIONS.map((option) => (
                                        <ThemedButton
                                            key={option.value}
                                            title={option.label}
                                            variant={scheduleForm.arrivalWindowMode === option.value ? 'primary' : 'secondary'}
                                            onPress={() => onUpdateScheduleForm({ arrivalWindowMode: option.value, arrivalWindowHours: option.value })}
                                            style={quickScheduleButtonStyle}
                                            textStyle={{ fontSize: 12 }}
                                        />
                                    ))}
                                    <ThemedButton
                                        title="Custom"
                                        variant={scheduleForm.arrivalWindowMode === 'custom' ? 'primary' : 'secondary'}
                                        onPress={() => onUpdateScheduleForm({
                                            arrivalWindowMode: 'custom',
                                            arrivalWindowHours: scheduleForm.arrivalWindowMode === 'custom' ? scheduleForm.arrivalWindowHours : '',
                                        })}
                                        style={quickScheduleButtonStyle}
                                        textStyle={{ fontSize: 12 }}
                                    />
                                </View>
                                <ScheduleInput
                                    label="Custom Arrival Window (hr)"
                                    value={scheduleForm.arrivalWindowMode === 'custom' ? scheduleForm.arrivalWindowHours : ''}
                                    placeholder="Hours"
                                    onChangeText={(arrivalWindowHoursText) => onUpdateScheduleForm({ arrivalWindowMode: 'custom', arrivalWindowHours: arrivalWindowHoursText })}
                                />
                            </View>
                        </View>

                        <View style={[schedulerPanelStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                            <View style={scheduleFieldGridStyle}>
                                <ScheduleInput
                                    label="Notes"
                                    value={scheduleForm.notes}
                                    placeholder="Optional"
                                    onChangeText={(notes) => onUpdateScheduleForm({ notes })}
                                />
                            </View>
                        </View>
                    </View>
                    <View style={[scheduleSummaryPanelStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Scheduled start: {selectedDateLabel} at {selectedStartLabel}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Estimated duration: {formatDurationSummary(durationMinutes)}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Arrival window: {formatArrivalWindowSummary(arrivalWindowHours)}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Window: {arrivalWindowPreview}
                        </Text>
                    </View>
                    {!!actionMessage && (
                        <Text style={[eventNoticeStyle, { color: theme.colors.primary }]}>
                            {actionMessage}
                        </Text>
                    )}
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
                            title={acknowledging ? 'Scheduling...' : 'Assign Tech / Schedule'}
                            disabled={acknowledging}
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
                    <View style={[secondaryActionPanelStyle, { borderColor: theme.colors.border }]}>
                        <Text style={[requestTypeStyle, { color: theme.colors.text }]}>Close Visit / Finish Visit</Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Choose how this scheduled visit ended. The request will move to the right active, needs-action, or closed queue.
                        </Text>
                        <View style={compactActionRowStyle}>
                            {SERVICE_VISIT_CLOSEOUT_OPTIONS.map((option) => (
                                <ThemedButton
                                    key={option.outcome}
                                    title={option.label}
                                    variant={scheduleForm.closeoutOutcome === option.outcome ? 'primary' : 'secondary'}
                                    disabled={acknowledging}
                                    onPress={() => onUpdateScheduleForm({
                                        closeoutOutcome: option.outcome,
                                        closeoutNotifyHomeowner: option.homeownerDefault,
                                    })}
                                    style={closeoutOutcomeButtonStyle}
                                    textStyle={{ fontSize: 11 }}
                                />
                            ))}
                        </View>
                        {!!scheduleForm.closeoutOutcome && (
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                {SERVICE_VISIT_CLOSEOUT_OPTIONS.find((option) => option.outcome === scheduleForm.closeoutOutcome)?.description}
                            </Text>
                        )}
                        <View style={scheduleFieldGridStyle}>
                            <ScheduleInput
                                label={getCloseoutNotesLabel(scheduleForm.closeoutOutcome)}
                                value={scheduleForm.closeoutNotes}
                                placeholder="Internal close-out notes"
                                onChangeText={(closeoutNotes) => onUpdateScheduleForm({ closeoutNotes })}
                            />
                            <ScheduleInput
                                label="Next Action Date"
                                value={scheduleForm.closeoutNextActionDate}
                                placeholder="YYYY-MM-DD when needed"
                                onChangeText={(closeoutNextActionDate) => onUpdateScheduleForm({ closeoutNextActionDate })}
                            />
                            {scheduleForm.closeoutOutcome === 'waiting_for_parts' && (
                                <>
                                    <ScheduleInput
                                        label="Parts / Materials"
                                        value={scheduleForm.closeoutPartsDescription}
                                        placeholder="Part, quantity, vendor note"
                                        onChangeText={(closeoutPartsDescription) => onUpdateScheduleForm({ closeoutPartsDescription })}
                                    />
                                    <ScheduleInput
                                        label="Order / Reference"
                                        value={scheduleForm.closeoutOrderReference}
                                        placeholder="Optional order number"
                                        onChangeText={(closeoutOrderReference) => onUpdateScheduleForm({ closeoutOrderReference })}
                                    />
                                </>
                            )}
                            <ScheduleInput
                                label="Homeowner Message"
                                value={scheduleForm.closeoutHomeownerNote}
                                placeholder="Optional customer-safe note"
                                onChangeText={(closeoutHomeownerNote) => onUpdateScheduleForm({ closeoutHomeownerNote })}
                            />
                        </View>
                        <View style={compactActionRowStyle}>
                            <ThemedButton
                                title={scheduleForm.closeoutNotifyHomeowner ? 'Homeowner Update On' : 'Homeowner Update Off'}
                                variant={scheduleForm.closeoutNotifyHomeowner ? 'primary' : 'secondary'}
                                disabled={acknowledging}
                                onPress={() => onUpdateScheduleForm({ closeoutNotifyHomeowner: !scheduleForm.closeoutNotifyHomeowner })}
                                style={compactActionButtonStyle}
                                textStyle={{ fontSize: 12 }}
                            />
                            <ThemedButton
                                title={acknowledging ? 'Closing Visit...' : 'Close Visit'}
                                disabled={acknowledging || !scheduleForm.closeoutOutcome}
                                onPress={onCloseVisit}
                                style={compactActionButtonStyle}
                                textStyle={{ fontSize: 12 }}
                            />
                        </View>
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
                            disabled={acknowledging || isArchivedDispatchStatus(request.status)}
                            onPress={onArchiveRequest}
                            style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 10 }}
                            textStyle={{ fontSize: 12 }}
                        />
                        {isArchivedDispatchStatus(request.status) && (
                            <ThemedButton
                                title="Restore Request"
                                variant="secondary"
                                disabled={acknowledging}
                                onPress={onRestoreRequest}
                                style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 10 }}
                                textStyle={{ fontSize: 12 }}
                            />
                        )}
                    </View>
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
        .select('id, company_id, service_request_id, technician_company_user_id, start_at, end_at, arrival_window_start, arrival_window_end, status, priority, tech_status_note, visit_outcome, visit_closed_at, closeout_notes, homeowner_closeout_note, closeout_metadata, updated_at')
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
                arrival_window_start: readStringField(record, 'arrival_window_start'),
                arrival_window_end: readStringField(record, 'arrival_window_end'),
                status: readStringField(record, 'status'),
                estimated_duration_minutes: readNumberField(record, 'estimated_duration_minutes'),
                priority: readStringField(record, 'priority'),
                notes: readStringField(record, 'notes'),
                tech_status_note: readStringField(record, 'tech_status_note'),
                visit_outcome: readStringField(record, 'visit_outcome'),
                visit_closed_at: readStringField(record, 'visit_closed_at'),
                closeout_notes: readStringField(record, 'closeout_notes'),
                homeowner_closeout_note: readStringField(record, 'homeowner_closeout_note'),
                closeout_metadata: readRecordField(record, 'closeout_metadata'),
                updated_at: readStringField(record, 'updated_at'),
            };
        })
        .filter((slot) => slot.id && slot.company_id && slot.technician_company_user_id);
}

function normalizeServiceRequestEvents(data: unknown, companyId: string): ServiceRequestEvent[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                id: readStringField(record, 'id') || '',
                service_request_id: readStringField(record, 'service_request_id') || '',
                company_id: readStringField(record, 'company_id') || companyId,
                property_id: readStringField(record, 'property_id') || '',
                event_type: readStringField(record, 'event_type'),
                message: readStringField(record, 'message'),
                event_visibility: readStringField(record, 'event_visibility'),
                audience: readStringField(record, 'audience'),
                schedule_slot_id: readStringField(record, 'schedule_slot_id'),
                dedupe_key: readStringField(record, 'dedupe_key'),
                metadata: readRecordField(record, 'metadata'),
                notification_status: readStringField(record, 'notification_status'),
                created_at: readStringField(record, 'created_at'),
            };
        })
        .filter((event) => event.id && event.service_request_id && event.company_id === companyId);
}

function mergeScheduleSlots(currentSlots: ScheduleSlot[], freshSlots: ScheduleSlot[]) {
    const byId = new Map<string, ScheduleSlot>();

    [...currentSlots, ...freshSlots].forEach((slot) => {
        byId.set(slot.id, slot);
    });

    return Array.from(byId.values());
}

function sortScheduleSlots(slots: ScheduleSlot[]) {
    return [...slots].sort((first, second) => {
        const firstStart = getSortableTime(first.start_at);
        const secondStart = getSortableTime(second.start_at);

        if (firstStart !== secondStart) return firstStart - secondStart;

        return getSortableTime(second.updated_at) - getSortableTime(first.updated_at);
    });
}

function findScheduleConflict(
    slots: ScheduleSlot[],
    companyId: string,
    technicianCompanyUserId: string,
    newStart: Date,
    newEnd: Date
) {
    return slots.find((slot) => (
        slot.company_id === companyId &&
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
    return ![
        'cancelled',
        'canceled',
        'completed',
        'complete',
        'closed',
        'done',
        'archived',
        'void',
        'waiting_for_parts',
        'needs_follow_up',
        'return_visit_required',
        'on_hold',
        'customer_no_show',
        'missed_no_show',
        'unable_to_complete',
    ].includes(normalizeStatus(slot.status));
}

function formatScheduleConflictRange(slot: ScheduleSlot) {
    return `${formatDateTime(slot.start_at)} to ${formatTime(slot.end_at)}`;
}

function formatScheduleConflictMessage(slot: ScheduleSlot, technician: CompanyUser | null) {
    const technicianName = technician ? getMemberDisplayName(technician) : 'This technician';
    const requestLabel = slot.service_request_id ? ' Existing scheduled request.' : '';

    return `Schedule conflict: ${technicianName} is already booked from ${formatScheduleConflictRange(slot)}.${requestLabel} Status: ${formatTechOSStatusLabel(slot.status)}.`;
}

async function updateRequestClosedStatus({
    requestId,
    companyId,
    status,
    reason,
}: {
    requestId: string;
    companyId: string;
    status: 'archived' | 'cancelled';
    reason: string;
}) {
    const rpcName = status === 'archived' ? 'archive_service_request' : 'cancel_service_request';
    const { error } = await supabase.rpc(rpcName, {
        p_company_id: companyId,
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
        .eq('id', requestId)
        .eq('company_id', companyId);

    if (updateError) {
        throw new Error(`${error.message}; direct status update failed: ${updateError.message}`);
    }
}

async function loadDispatchRequestsWithCloseoutFields(companyId: string): Promise<DispatchRequest[]> {
    const baseRequests = await getCompanyDispatchRequests(companyId);
    const requestIds = baseRequests.map((request) => request.id).filter(Boolean);

    if (requestIds.length === 0) return baseRequests;

    const { data, error } = await supabase
        .from('service_requests')
        .select('id, closeout_outcome, closeout_notes, homeowner_closeout_note, next_action_at, closed_at, cancelled_at, cancel_reason, archived_at, archive_reason, closeout_metadata')
        .eq('company_id', companyId)
        .in('id', requestIds);

    if (error) {
        return baseRequests;
    }

    const closeoutById = new Map<string, Partial<DispatchRequest>>();
    (Array.isArray(data) ? data : []).forEach((row) => {
        const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
        const id = readStringField(record, 'id');

        if (!id) return;

        closeoutById.set(id, {
            closeout_outcome: readStringField(record, 'closeout_outcome'),
            closeout_notes: readStringField(record, 'closeout_notes'),
            homeowner_closeout_note: readStringField(record, 'homeowner_closeout_note'),
            next_action_at: readStringField(record, 'next_action_at'),
            closed_at: readStringField(record, 'closed_at'),
            cancelled_at: readStringField(record, 'cancelled_at'),
            cancel_reason: readStringField(record, 'cancel_reason'),
            archived_at: readStringField(record, 'archived_at'),
            archive_reason: readStringField(record, 'archive_reason'),
            closeout_metadata: readRecordField(record, 'closeout_metadata'),
        });
    });

    return baseRequests.map((request) => ({
        ...request,
        ...(closeoutById.get(request.id) || {}),
    }));
}

async function recordCompanyAuditEvent(input: Parameters<typeof logCompanyAuditEvent>[0]) {
    try {
        await logCompanyAuditEvent(input);
    } catch {
        // Dispatch action already completed; do not hide that result behind an audit write issue.
    }
}

async function queueAssignmentNotifications({
    request,
    companyName,
    selectedTechnician,
    scheduledSlot,
    previousScheduleSlot,
    previousTechnician,
}: {
    request: DispatchRequest;
    companyName: string;
    selectedTechnician: CompanyUser | null;
    scheduledSlot: ScheduleSlot;
    previousScheduleSlot: ScheduleSlot | null;
    previousTechnician: CompanyUser | null;
}) {
    const technicianName = selectedTechnician ? getMemberDisplayName(selectedTechnician) : 'Your technician';
    const isReassignment = Boolean(previousScheduleSlot && previousTechnician);
    const notificationTasks = [
        queueHomeownerAssignmentNotification({
            companyId: request.company_id,
            serviceRequestId: request.id,
            scheduleSlotId: scheduledSlot.id,
            companyName,
            technicianName,
            serviceDateLabel: formatScheduleDateLabel(scheduledSlot.start_at),
            arrivalWindowLabel: formatSlotArrivalWindow(scheduledSlot),
            serviceAddressLabel: formatPropertyAddress(request),
            reassigned: isReassignment,
        }),
        queueTechnicianAssignmentNotification({
            companyId: request.company_id,
            serviceRequestId: request.id,
            scheduleSlotId: scheduledSlot.id,
            customerName: request.customer_display_name || request.property_display_name || 'Customer',
            serviceAddressLabel: formatPropertyAddress(request),
            serviceDateLabel: formatScheduleDateLabel(scheduledSlot.start_at),
            arrivalWindowLabel: formatSlotArrivalWindow(scheduledSlot),
            estimatedDurationLabel: formatDurationSummary(scheduledSlot.estimated_duration_minutes),
            jobType: formatCallType(request),
            priority: formatLabel(request.priority),
            notes: scheduledSlot.notes,
        }),
    ];

    if (previousScheduleSlot && previousTechnician) {
        notificationTasks.push(queueTechnicianAssignmentNotification({
            companyId: request.company_id,
            serviceRequestId: request.id,
            scheduleSlotId: previousScheduleSlot.id,
            customerName: request.customer_display_name || request.property_display_name || 'Customer',
            serviceAddressLabel: formatPropertyAddress(request),
            serviceDateLabel: formatScheduleDateLabel(previousScheduleSlot.start_at),
            arrivalWindowLabel: formatSlotArrivalWindow(previousScheduleSlot),
            estimatedDurationLabel: formatDurationSummary(previousScheduleSlot.estimated_duration_minutes),
            jobType: formatCallType(request),
            priority: formatLabel(request.priority),
            notes: previousScheduleSlot.notes,
            removed: true,
        }));
    }

    const results = await Promise.all(notificationTasks);
    const pending = results.filter((result) => result.status !== 'recorded');

    return pending.length > 0
        ? 'Notification event backend is pending; assignment is still saved.'
        : 'Homeowner and technician assignment events recorded.';
}

function getRequestAuditLabel(request: DispatchRequest) {
    return `${formatCallType(request)} ${getWorkQueueIdentifier(request)}`;
}

function requestToAuditRecord(request: DispatchRequest) {
    return safeAuditRecord({
        company_id: request.company_id,
        property_id: request.property_id,
        company_property_client_id: request.company_property_client_id,
        request_type: request.request_type,
        status: request.status,
        priority: request.priority,
        created_at: request.created_at,
        acknowledged_at: request.acknowledged_at,
        converted_job_id: request.converted_job_id,
        converted_at: request.converted_at,
    });
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

async function resolveDispatchCompanyAccess(
    userId: string,
    requestedCompanyId: string
): Promise<DispatchCompanyAccessResult> {
    const isPlatformAdmin = await loadDispatchPlatformAdminStatus(userId);
    const selectedCompanyId = requestedCompanyId.trim();

    if (isPlatformAdmin && selectedCompanyId) {
        return {
            access: {
                company_id: selectedCompanyId,
                role: 'platform_admin',
                status: 'active',
            },
            choices: [],
            deniedAccess: null,
            isPlatformAdmin,
        };
    }

    const accessResult = await loadLoggedInUserCompanyAccess(userId);

    if (accessResult.error) {
        throw new Error(accessResult.error.message);
    }

    const choices = getActiveDispatchCompanyChoices(accessResult.data);
    const deniedAccess = getDeniedDispatchCompanyAccess(accessResult.data, selectedCompanyId);
    const access = selectedCompanyId
        ? choices.find((choice) => choice.company_id === selectedCompanyId) || null
        : choices.length === 1
            ? choices[0]
            : null;

    return {
        access,
        choices,
        deniedAccess,
        isPlatformAdmin,
    };
}

function getActiveDispatchCompanyChoices(rows: CompanyRouteAccessRow[]) {
    const byCompanyId = new Map<string, CompanyAccess>();

    rows.forEach((row) => {
        if (!row.company_id || !isActiveStatus(row.status) || !canAccessDispatch(row) || byCompanyId.has(row.company_id)) {
            return;
        }

        byCompanyId.set(row.company_id, toDispatchCompanyAccess(row));
    });

    return Array.from(byCompanyId.values());
}

function getDeniedDispatchCompanyAccess(rows: CompanyRouteAccessRow[], selectedCompanyId: string) {
    const activeRows = rows
        .filter((row) => row.company_id && isActiveStatus(row.status) && !canAccessDispatch(row))
        .map(toDispatchCompanyAccess);

    if (selectedCompanyId) {
        return activeRows.find((row) => row.company_id === selectedCompanyId) || null;
    }

    return activeRows[0] || null;
}

function toDispatchCompanyAccess(row: CompanyRouteAccessRow): CompanyAccess {
    return {
        company_id: row.company_id,
        role: row.role,
        status: row.status,
    };
}

function getDispatchAccessDeniedMessage(role?: string | null) {
    const normalizedRole = normalizeCompanyRole(role);

    if (normalizedRole === 'technician') {
        return 'Your account is active as Technician. Dispatch requires office, supervisor, manager, admin, or owner access.';
    }

    return `Your account is active as ${formatLabel(normalizedRole || role || 'staff')}. Dispatch requires office, supervisor, manager, admin, or owner access.`;
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

function readNumberField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function readRecordField(record: Record<string, unknown>, key: string): Record<string, unknown> {
    const value = record[key];

    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function readMetadataString(metadata: Record<string, unknown>, key: string) {
    const value = metadata[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string) {
    const value = metadata[key];

    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function firstParam(value?: string | string[]) {
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
}

function replaceDispatchCompanyRoute(companyIdToOpen: string) {
    router.replace(`/dispatch?companyId=${encodeURIComponent(companyIdToOpen)}` as never);
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

function findCompanyUserById(companyUsers: CompanyUser[], companyUserId?: string | null) {
    if (!companyUserId) return null;

    return companyUsers.find((member) => member.id === companyUserId) || null;
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

function parseIsoDate(value?: string | null) {
    if (!value) return null;

    const parsed = new Date(value);

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

function getScheduleDurationMinutes(form: ScheduleRequestForm) {
    const rawDuration = form.durationMode === 'custom' ? form.durationMinutes : form.durationMode;
    const duration = Number.parseInt(rawDuration, 10);

    return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function getScheduleSlotDurationMinutes(slot: ScheduleSlot) {
    const start = parseIsoDate(slot.start_at);
    const end = parseIsoDate(slot.end_at);

    if (!start || !end || end <= start) return null;

    return Math.round((end.getTime() - start.getTime()) / 60_000);
}

function getArrivalWindowHours(form: ScheduleRequestForm) {
    const rawHours = form.arrivalWindowMode === 'custom' ? form.arrivalWindowHours : form.arrivalWindowMode;
    const hours = Number.parseFloat(rawHours);

    return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function getScheduleSlotArrivalWindowHours(slot: ScheduleSlot) {
    const start = parseIsoDate(slot.arrival_window_start || slot.start_at);
    const end = parseIsoDate(slot.arrival_window_end || slot.arrival_window_start || slot.start_at);

    if (!start || !end || end < start) return null;

    return Number(((end.getTime() - start.getTime()) / 3_600_000).toFixed(2));
}

function getArrivalWindowPreview(form: ScheduleRequestForm) {
    const start = parseLocalDateTime(form.date, form.startTime);
    const arrivalWindowHours = getArrivalWindowHours(form);

    if (!start || arrivalWindowHours === null) {
        return 'Pick a start time and arrival window.';
    }

    const arrivalEnd = new Date(start.getTime() + arrivalWindowHours * 60 * 60 * 1000);

    return `${formatTime(start.toISOString())} - ${formatTime(arrivalEnd.toISOString())}`;
}

function formatDurationSummary(durationMinutes: number | null) {
    if (!durationMinutes) return 'Not set';
    if (durationMinutes < 60) return `${durationMinutes} min`;

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function formatArrivalWindowSummary(hours: number | null) {
    if (hours === null) return 'Not set';
    if (hours === 0) return '0 hr / exact time';
    if (hours === 1) return '1 hr';

    return `${hours} hr`;
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

function formatRequestOperationalStatus(request: DispatchRequest, slot: ScheduleSlot | null) {
    if (slot?.visit_outcome) return getServiceVisitOutcomeLabel(slot.visit_outcome);
    if (isNeedsFollowUpStatus(request.status)) return 'Needs Follow-Up';
    if (isReturnVisitStatus(request.status)) return 'Return Visit';
    if (isWaitingForPartsStatus(request.status)) return 'Waiting for Parts';
    if (isOnHoldStatus(request.status)) return 'On Hold';
    if (isMissedNoShowStatus(request.status)) return 'Missed / No-Show';
    if (isUnableToCompleteStatus(request.status)) return 'Unable to Complete';
    if (isCancelledDispatchStatus(request.status)) return 'Cancelled';
    if (isArchivedDispatchStatus(request.status)) return 'Archived';
    if (isCompletedDispatchStatus(request.status)) return 'Completed';
    if (slot?.status) return formatTechOSStatusLabel(slot.status);

    return formatLabel(request.status || 'Unassigned');
}

function getCompactAttentionReason(
    request: DispatchRequest,
    slot: ScheduleSlot | null,
    risk: DispatchRiskResult
) {
    if (risk.state !== 'ON_TIME') return risk.reason;
    if (slot?.tech_status_note) return slot.tech_status_note;
    if (slot?.visit_outcome) return getServiceVisitOutcomeLabel(slot.visit_outcome);
    if (isClosedOrInactiveDispatchStatus(request.status)) return formatRequestOperationalStatus(request, slot);

    return '';
}

function getCloseoutNotesLabel(outcome: ServiceVisitOutcome | '') {
    if (outcome === 'completed_successfully') return 'Work Performed / Completion Notes';
    if (outcome === 'follow_up_required') return 'Follow-Up Reason / Notes';
    if (outcome === 'return_visit_required') return 'Return Visit Reason';
    if (outcome === 'waiting_for_parts') return 'Parts Status / Internal Notes';
    if (outcome === 'paused_on_hold') return 'On-Hold Reason';
    if (outcome === 'customer_no_show') return 'Contact Attempts / Access Notes';
    if (outcome === 'cancelled') return 'Cancellation Reason';
    if (outcome === 'unable_to_complete') return 'Unable to Complete Reason';
    if (outcome === 'duplicate_or_void') return 'Void / Duplicate Reason';

    return 'Close-Out Notes';
}

function parseCloseoutDate(value: string) {
    const trimmed = value.trim();

    if (!trimmed) return null;

    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
        ? new Date(`${trimmed}T09:00:00`)
        : new Date(trimmed);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function formatPropertyAddress(request: DispatchRequest) {
    const addressParts = [
        request.property_address,
        request.property_city,
        request.property_state,
        request.property_postal_code,
    ]
        .map((part) => String(part || '').trim())
        .filter(Boolean);

    return addressParts.length > 0 ? addressParts.join(', ') : request.property_display_name || 'Address not available';
}

function formatScheduleStart(slot: ScheduleSlot | null) {
    return slot?.start_at ? formatDateTime(slot.start_at) : 'Not scheduled';
}

function formatScheduleDateLabel(value?: string | null) {
    if (!value) return 'a scheduled date';

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? 'a scheduled date'
        : date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatSlotArrivalWindow(slot: ScheduleSlot | null) {
    if (!slot) return 'Not set';

    const windowStart = slot.arrival_window_start || slot.start_at;
    const windowEnd = slot.arrival_window_end || slot.arrival_window_start || slot.start_at;

    if (!windowStart || !windowEnd) return 'Not set';

    return `${formatTime(windowStart)} - ${formatTime(windowEnd)}`;
}

function formatTimingResponse(event: ServiceRequestEvent) {
    const response = readMetadataString(event.metadata, 'response') || event.message || 'Timing response received.';
    const remaining = readMetadataNumber(event.metadata, 'estimated_remaining_minutes');

    return remaining !== null ? `${response} / ${remaining} min remaining` : response;
}

function buildDispatchLanes(requests: DispatchRequest[], scheduleSlots: ScheduleSlot[]): DispatchLane[] {
    const lanes = DISPATCH_LANE_DEFINITIONS.map((definition) => ({
        ...definition,
        requests: [] as DispatchRequest[],
    }));
    const lanesByKey = {} as Record<DispatchLaneKey, DispatchLane>;
    lanes.forEach((lane) => {
        lanesByKey[lane.key] = lane;
    });

    requests.forEach((request) => {
        const requestSlots = scheduleSlots.filter((slot) => (
            slot.company_id === request.company_id &&
            slot.service_request_id === request.id
        ));
        const currentSlot = getCurrentRequestScheduleSlot(requestSlots, request);
        lanesByKey[getDispatchLaneKey(request, currentSlot)].requests.push(request);
    });

    lanes.forEach((lane) => {
        lane.requests.sort((first, second) => compareDispatchLaneRequests(first, second, scheduleSlots));
    });

    return lanes;
}

function buildDispatchAttentionItems(requests: DispatchRequest[], scheduleSlots: ScheduleSlot[]): DispatchAttentionItem[] {
    return requests
        .map((request) => {
            const requestSlots = scheduleSlots.filter((slot) => (
                slot.company_id === request.company_id &&
                slot.service_request_id === request.id
            ));
            const currentSlot = getCurrentRequestScheduleSlot(requestSlots, request);

            if (!isActiveDispatchRequestForRisk(request, currentSlot)) return null;
            if (!currentSlot) return null;

            const risk = calculateRequestDispatchRisk(request, currentSlot, scheduleSlots);

            return risk.state === 'ON_TIME'
                ? null
                : {
                    request,
                    slot: currentSlot,
                    risk,
                };
        })
        .filter((item): item is DispatchAttentionItem => Boolean(item))
        .sort((first, second) => {
            if (first.risk.state !== second.risk.state) {
                return first.risk.state === 'RUNNING_LATE' ? -1 : 1;
            }

            return getSortableTime(first.slot.start_at) - getSortableTime(second.slot.start_at);
        });
}

function buildWorkQueueRecords(
    requests: DispatchRequest[],
    scheduleSlots: ScheduleSlot[],
    companyUsers: CompanyUser[]
): WorkQueueRecord[] {
    return requests
        .map((request) => {
            const requestSlots = scheduleSlots.filter((slot) => (
                slot.company_id === request.company_id &&
                slot.service_request_id === request.id
            ));
            const currentSlot = getCurrentRequestScheduleSlot(requestSlots, request);
            const laneKey = getDispatchLaneKey(request, currentSlot);
            const category = getWorkQueueCategoryForLaneKey(laneKey);

            if (!category) return null;

            const technician = currentSlot
                ? findCompanyUserById(companyUsers, currentSlot.technician_company_user_id)
                : null;

            return {
                request,
                slot: currentSlot,
                requestSlots,
                laneKey,
                category,
                technician,
            };
        })
        .filter((record): record is WorkQueueRecord => Boolean(record));
}

function getWorkQueueCategoryForLaneKey(laneKey: DispatchLaneKey): WorkQueueCategory | null {
    const definition = DISPATCH_LANE_DEFINITIONS.find((lane) => lane.key === laneKey);

    return definition && definition.group !== 'active' ? definition.group : null;
}

function getWorkQueueCategoryCounts(records: WorkQueueRecord[]) {
    return WORK_QUEUE_CATEGORIES.reduce<Record<WorkQueueCategory, number>>((counts, category) => {
        counts[category.key] = records.filter((record) => record.category === category.key).length;
        return counts;
    }, {
        needs_action: 0,
        closed: 0,
        archived: 0,
    });
}

function getWorkQueueStatusCounts(records: WorkQueueRecord[], category: WorkQueueCategory) {
    return records
        .filter((record) => record.category === category)
        .reduce<Partial<Record<DispatchLaneKey, number>>>((counts, record) => {
            counts[record.laneKey] = (counts[record.laneKey] || 0) + 1;
            return counts;
        }, {});
}

function getWorkQueueStatusOptions(category: WorkQueueCategory): DispatchLaneKey[] {
    return DISPATCH_LANE_DEFINITIONS
        .filter((lane) => lane.group === category)
        .map((lane) => lane.key);
}

function filterAndSortWorkQueueRecords(
    records: WorkQueueRecord[],
    category: WorkQueueCategory,
    statusFilter: DispatchLaneKey | 'all',
    search: string,
    sort: WorkQueueSort
) {
    const query = normalizeStatus(search);

    return records
        .filter((record) => record.category === category)
        .filter((record) => statusFilter === 'all' || record.laneKey === statusFilter)
        .filter((record) => !query || getWorkQueueSearchText(record).includes(query))
        .sort((first, second) => compareWorkQueueRecords(first, second, sort));
}

function compareWorkQueueRecords(first: WorkQueueRecord, second: WorkQueueRecord, sort: WorkQueueSort) {
    if (sort === 'oldest') {
        return getWorkQueueNewestTime(first) - getWorkQueueNewestTime(second);
    }

    if (sort === 'customer') {
        return getWorkQueueCustomerLabel(first.request).localeCompare(getWorkQueueCustomerLabel(second.request));
    }

    if (sort === 'address') {
        return abbreviateAddress(first.request).localeCompare(abbreviateAddress(second.request));
    }

    if (sort === 'status') {
        return getDispatchLaneTitle(first.laneKey).localeCompare(getDispatchLaneTitle(second.laneKey));
    }

    if (sort === 'next_action') {
        return getWorkQueueNextActionTime(first) - getWorkQueueNextActionTime(second);
    }

    return getWorkQueueNewestTime(second) - getWorkQueueNewestTime(first);
}

function getWorkQueueSearchText(record: WorkQueueRecord) {
    return normalizeStatus([
        normalizeDisplayCode(record.request.display_code),
        getServiceRequestDisplayCode(record.request),
        record.request.id,
        shortId(record.request.id),
        getWorkQueueIdentifier(record.request),
        record.request.customer_display_name,
        record.request.property_display_name,
        record.request.property_address,
        record.request.property_city,
        record.request.property_postal_code,
        record.technician ? getMemberDisplayName(record.technician) : '',
        record.technician?.email,
    ].filter(Boolean).join(' '));
}

function getWorkQueueNextActionTime(record: WorkQueueRecord) {
    const explicitNextAction = getSortableTime(record.request.next_action_at);
    const nextActiveSlot = findNextActiveScheduleSlot(record.requestSlots);

    if (explicitNextAction) return explicitNextAction;
    if (nextActiveSlot) return getSortableTime(nextActiveSlot.start_at) || Number.MAX_SAFE_INTEGER;

    const newest = getWorkQueueNewestTime(record);
    return newest || Number.MAX_SAFE_INTEGER;
}

function getWorkQueueNewestTime(record: WorkQueueRecord) {
    return (
        getSortableTime(record.request.archived_at) ||
        getSortableTime(record.request.closed_at) ||
        getSortableTime(record.request.cancelled_at) ||
        getSortableTime(record.slot?.visit_closed_at) ||
        getSortableTime(record.slot?.updated_at) ||
        getSortableTime(record.request.created_at)
    );
}

function getDefaultWorkQueueSort(category: WorkQueueCategory): WorkQueueSort {
    return category === 'needs_action' ? 'next_action' : 'newest';
}

function getNextWorkQueueSort(current: WorkQueueSort): WorkQueueSort {
    const currentIndex = WORK_QUEUE_SORT_OPTIONS.findIndex((option) => option.key === current);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % WORK_QUEUE_SORT_OPTIONS.length : 0;

    return WORK_QUEUE_SORT_OPTIONS[nextIndex].key;
}

function getDispatchLaneTitle(laneKey: DispatchLaneKey) {
    return DISPATCH_LANE_DEFINITIONS.find((lane) => lane.key === laneKey)?.title || formatLabel(laneKey);
}

function getWorkQueueIdentifier(request: DispatchRequest) {
    return getServiceRequestDisplayCode(request);
}

function getServiceRequestDisplayCode(request: DispatchRequest) {
    return normalizeDisplayCode(request.display_code) || shortId(request.id);
}

function normalizeDisplayCode(value?: string | null) {
    return String(value || '').trim().toUpperCase();
}

function getWorkQueueCustomerLabel(request: DispatchRequest) {
    return request.customer_display_name || request.property_display_name || 'Homeowner';
}

function abbreviateAddress(request: DispatchRequest) {
    const street = String(request.property_address || '').trim();

    if (street) return street;
    return request.property_display_name || 'Address not available';
}

function getWorkQueueDetailLine(record: WorkQueueRecord) {
    const nextActionDate = record.request.next_action_at;
    const slot = record.slot;
    const nextActiveSlot = findNextActiveScheduleSlot(record.requestSlots);

    if (record.laneKey === 'needs_follow_up') {
        return nextActionDate
            ? `Follow up due ${formatDateTime(nextActionDate)}`
            : 'Follow-up needed';
    }

    if (record.laneKey === 'return_visit') {
        return nextActiveSlot
            ? `Return scheduled ${formatScheduleStart(nextActiveSlot)} · ${formatSlotArrivalWindow(nextActiveSlot)}`
            : 'Return visit not scheduled';
    }

    if (record.laneKey === 'waiting_for_parts') {
        const part = readMetadataString(slot?.closeout_metadata || record.request.closeout_metadata || {}, 'parts_description');
        const expected = nextActionDate ? ` · expected ${formatDate(nextActionDate)}` : '';

        return `${part || 'Parts status pending'}${expected}`;
    }

    if (record.laneKey === 'on_hold') {
        return nextActionDate
            ? `Resume ${formatDate(nextActionDate)}`
            : 'On hold until Dispatch resumes';
    }

    if (record.laneKey === 'missed_no_show') {
        return nextActionDate
            ? `Reschedule follow-up ${formatDate(nextActionDate)}`
            : 'Reschedule required';
    }

    if (record.laneKey === 'unable_to_complete') {
        return nextActionDate
            ? `Next action ${formatDate(nextActionDate)}`
            : 'Next action required';
    }

    if (record.laneKey === 'completed') {
        return `Completed ${formatDateTime(record.request.closed_at || slot?.visit_closed_at || slot?.updated_at || record.request.created_at)}`;
    }

    if (record.laneKey === 'cancelled') {
        return `Cancelled ${formatDateTime(record.request.cancelled_at || record.request.closed_at || slot?.visit_closed_at || record.request.created_at)}`;
    }

    if (record.laneKey === 'archived') {
        const priorOutcome = record.request.closeout_outcome || slot?.visit_outcome;
        const priorLabel = priorOutcome ? getServiceVisitOutcomeLabel(priorOutcome) : 'Prior outcome not set';

        return `${priorLabel} · archived ${formatDateTime(record.request.archived_at || slot?.updated_at || record.request.created_at)}`;
    }

    return formatRequestOperationalStatus(record.request, slot);
}

function findNextActiveScheduleSlot(slots: ScheduleSlot[]) {
    return sortScheduleSlots(slots.filter((slot) => isActiveScheduleSlot(slot) && isCurrentOrFutureScheduleSlot(slot)))[0] || null;
}

function calculateRequestDispatchRisk(
    request: DispatchRequest,
    slot: ScheduleSlot | null,
    scheduleSlots: ScheduleSlot[]
): DispatchRiskResult {
    if (!isActiveDispatchRequestForRisk(request, slot)) {
        return {
            state: 'ON_TIME',
            label: 'No Active Risk',
            reason: 'Request is closed or waiting in a non-active action queue.',
            latestDepartureAt: null,
            estimatedArrivalAt: null,
            estimatedDelayMinutes: null,
            needsReassignment: false,
            suggestedActions: [],
        };
    }

    return calculateDispatchRisk(
        slot ? { ...slot, request_status: getRiskRequestStatus(request, slot) } : null,
        scheduleSlots
    );
}

function getDispatchLaneKey(request: DispatchRequest, slot: ScheduleSlot | null): DispatchLaneKey {
    const requestStatus = normalizeStatus(request.status);
    const slotStatus = normalizeStatus(slot?.status || request.status);

    if (isArchivedDispatchStatus(requestStatus) || isArchivedDispatchStatus(slotStatus)) {
        return 'archived';
    }

    if (isCancelledDispatchStatus(requestStatus) || isCancelledDispatchStatus(slotStatus)) {
        return 'cancelled';
    }

    if (isCompletedDispatchStatus(requestStatus) || isCompletedDispatchStatus(slotStatus)) {
        return 'completed';
    }

    if (!slot?.technician_company_user_id) {
        if (isNeedsFollowUpStatus(requestStatus)) {
            return 'needs_follow_up';
        }

        if (isReturnVisitStatus(requestStatus)) {
            return 'return_visit';
        }

        if (isWaitingForPartsStatus(requestStatus)) {
            return 'waiting_for_parts';
        }

        if (isOnHoldStatus(requestStatus)) {
            return 'on_hold';
        }

        if (isMissedNoShowStatus(requestStatus)) {
            return 'missed_no_show';
        }

        if (isUnableToCompleteStatus(requestStatus)) {
            return 'unable_to_complete';
        }

        return 'unassigned';
    }

    if (!isActiveScheduleSlot(slot)) {
        if (isNeedsFollowUpStatus(requestStatus)) {
            return 'needs_follow_up';
        }

        if (isReturnVisitStatus(requestStatus)) {
            return 'return_visit';
        }

        if (isWaitingForPartsStatus(requestStatus)) {
            return 'waiting_for_parts';
        }

        if (isOnHoldStatus(requestStatus)) {
            return 'on_hold';
        }

        if (isMissedNoShowStatus(requestStatus)) {
            return 'missed_no_show';
        }

        if (isUnableToCompleteStatus(requestStatus)) {
            return 'unable_to_complete';
        }
    }

    if (['on_my_way', 'en_route', 'dispatched'].includes(slotStatus)) {
        return 'on_my_way';
    }

    if (['arrived', 'onsite', 'on_site'].includes(slotStatus)) {
        return 'arrived';
    }

    if (isWorkingScheduleStatus(slotStatus)) {
        return 'working';
    }

    if (isWaitingScheduleStatus(slotStatus)) {
        return 'waiting';
    }

    return 'assigned';
}

function compareDispatchLaneRequests(first: DispatchRequest, second: DispatchRequest, scheduleSlots: ScheduleSlot[]) {
    const firstSlot = getCurrentRequestScheduleSlot(
        scheduleSlots.filter((slot) => slot.company_id === first.company_id && slot.service_request_id === first.id),
        first
    );
    const secondSlot = getCurrentRequestScheduleSlot(
        scheduleSlots.filter((slot) => slot.company_id === second.company_id && slot.service_request_id === second.id),
        second
    );
    const firstTime = getSortableTime(firstSlot?.start_at) || getSortableTime(first.created_at);
    const secondTime = getSortableTime(secondSlot?.start_at) || getSortableTime(second.created_at);

    if (firstTime && secondTime && firstTime !== secondTime) {
        return firstTime - secondTime;
    }

    return getSortableTime(second.created_at) - getSortableTime(first.created_at);
}

function isCompletedDispatchStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return isCompletedStatus(normalized);
}

function isCancelledDispatchStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return ['cancelled', 'canceled'].includes(normalized);
}

function isArchivedDispatchStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return ['archived', 'void', 'duplicate_or_void'].includes(normalized);
}

function isNeedsFollowUpStatus(status?: string | null) {
    return normalizeStatus(status) === 'needs_follow_up';
}

function isReturnVisitStatus(status?: string | null) {
    return normalizeStatus(status) === 'return_visit_required';
}

function isWaitingForPartsStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return ['waiting_for_parts', 'parts_needed', 'waiting_on_parts'].includes(normalized);
}

function isOnHoldStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return ['on_hold', 'paused', 'paused_on_hold'].includes(normalized);
}

function isMissedNoShowStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return ['customer_no_show', 'missed_no_show', 'no_show'].includes(normalized);
}

function isUnableToCompleteStatus(status?: string | null) {
    return normalizeStatus(status) === 'unable_to_complete';
}

function isClosedOrInactiveDispatchStatus(status?: string | null) {
    return (
        isCompletedDispatchStatus(status) ||
        isCancelledDispatchStatus(status) ||
        isArchivedDispatchStatus(status) ||
        isNeedsFollowUpStatus(status) ||
        isReturnVisitStatus(status) ||
        isWaitingForPartsStatus(status) ||
        isOnHoldStatus(status) ||
        isMissedNoShowStatus(status) ||
        isUnableToCompleteStatus(status)
    );
}

function isActiveDispatchRequestForRisk(request: DispatchRequest, slot: ScheduleSlot | null) {
    if (isTerminalDispatchStatus(request.status)) return false;
    if (!slot || !isActiveScheduleSlot(slot)) return false;

    return true;
}

function isTerminalDispatchStatus(status?: string | null) {
    return (
        isCompletedDispatchStatus(status) ||
        isCancelledDispatchStatus(status) ||
        isArchivedDispatchStatus(status)
    );
}

function getRiskRequestStatus(request: DispatchRequest, slot: ScheduleSlot | null) {
    return slot && isActiveScheduleSlot(slot) && !isTerminalDispatchStatus(request.status)
        ? null
        : request.status;
}

function isWorkingScheduleStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return ['working', 'in_progress', 'in-progress', 'active', 'started', 'start_work'].includes(normalized);
}

function isWaitingScheduleStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return [
        'estimate_needed',
        'approval_needed',
        'needs_approval',
        'waiting',
        'waiting_on_customer',
        'waiting_on_parts',
        'parts_needed',
        'need_parts',
        'assistance_needed',
        'needs_assistance',
        'help_needed',
        'needs_help',
        'blocked',
        'on_hold',
        'paused',
        'running_late',
        'custom',
    ].includes(normalized);
}

function getCurrentRequestScheduleSlot(slots: ScheduleSlot[], request: DispatchRequest) {
    if (slots.length === 0) return null;
    const activeSlots = slots.filter(isActiveScheduleSlot);
    const currentFutureSlots = activeSlots.filter(isCurrentOrFutureScheduleSlot);
    const latestSlot = [...slots].sort((first, second) => {
        const firstUpdated = getSortableTime(first.updated_at) || getSortableTime(first.start_at);
        const secondUpdated = getSortableTime(second.updated_at) || getSortableTime(second.start_at);

        return secondUpdated - firstUpdated;
    })[0] || null;

    if (currentFutureSlots.length > 0) {
        return sortScheduleSlots(currentFutureSlots)[0] || null;
    }

    if (isCompletedDispatchStatus(request.status)) {
        return latestSlot;
    }

    return activeSlots.length > 0
        ? [...activeSlots].sort((first, second) => {
            const firstUpdated = getSortableTime(first.updated_at) || getSortableTime(first.start_at);
            const secondUpdated = getSortableTime(second.updated_at) || getSortableTime(second.start_at);

            return secondUpdated - firstUpdated;
        })[0] || null
        : latestSlot;
}

function isCurrentOrFutureScheduleSlot(slot: ScheduleSlot) {
    const endTime = getSortableTime(slot.end_at);
    const startTime = getSortableTime(slot.start_at);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartTime = todayStart.getTime();

    if (endTime) return endTime >= todayStartTime;
    if (startTime) return startTime >= todayStartTime;

    return true;
}

function getSortableTime(value?: string | null) {
    if (!value) return 0;

    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function formatTechOSStatusLabel(status?: string | null) {
    const normalized = normalizeStatus(status);
    const labels: Record<string, string> = {
        scheduled: 'Scheduled',
        on_my_way: 'On My Way',
        arrived: 'Arrived',
        working: 'Working',
        in_progress: 'In Progress',
        estimate_needed: 'Estimate Needed',
        approval_needed: 'Approval Needed',
        assistance_needed: 'Assistance Needed',
        parts_needed: 'Parts Needed',
        waiting_for_parts: 'Waiting for Parts',
        needs_follow_up: 'Needs Follow-Up',
        return_visit_required: 'Return Visit Required',
        on_hold: 'On Hold',
        paused_on_hold: 'On Hold',
        customer_no_show: 'Customer No-Show',
        missed_no_show: 'Missed / No-Show',
        unable_to_complete: 'Unable to Complete',
        completed: 'Completed',
        closed: 'Closed',
        cancelled: 'Cancelled',
        canceled: 'Cancelled',
        archived: 'Archived',
        running_late: 'Running Late',
        available: 'Available',
        custom: 'Custom',
    };

    return labels[normalized] || formatLabel(status);
}

function getRiskBorderColor(state: DispatchRiskResult['state'], fallback: string) {
    if (state === 'RUNNING_LATE') return '#7C3AED';
    if (state === 'AT_RISK') return '#C4B5FD';

    return fallback;
}

function getRiskBackgroundColor(state: DispatchRiskResult['state'], fallback: string) {
    if (state === 'RUNNING_LATE') return 'rgba(124, 58, 237, 0.12)';
    if (state === 'AT_RISK') return 'rgba(196, 181, 253, 0.16)';

    return fallback;
}

function getRiskBadgeBackground(state: DispatchRiskResult['state'], fallback: string) {
    if (state === 'RUNNING_LATE') return 'rgba(124, 58, 237, 0.22)';
    if (state === 'AT_RISK') return 'rgba(196, 181, 253, 0.32)';

    return fallback;
}

function getRiskTextColor(state: DispatchRiskResult['state'], fallback: string) {
    if (state === 'RUNNING_LATE') return '#4C1D95';
    if (state === 'AT_RISK') return '#5B21B6';

    return fallback;
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

const activeOperationsTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const activeLaneTitleStyle = {
    fontSize: 15,
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

const riskBadgeStyle = {
    borderRadius: 999,
    overflow: 'hidden' as const,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '900' as const,
};

const dispatchWallStyle = {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const dispatchQueueGroupStyle = {
    marginBottom: 12,
};

const dispatchLaneStyle = {
    flexGrow: 1,
    flexShrink: 1,
    marginBottom: 10,
    maxWidth: '100%' as const,
    minWidth: 0,
};

const activeOperationsHeaderBadgesStyle = {
    alignItems: 'flex-end' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    justifyContent: 'flex-end' as const,
};

const activeOperationsEmptySummaryStyle = {
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginBottom: 10,
    padding: 12,
};

const activeOperationsCountPillRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
};

const activeOperationsCountPillStyle = {
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden' as const,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '900' as const,
};

const compactEmptyLaneStyle = {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
};

const needsAttentionPanelStyle = {
    borderWidth: 1,
    marginBottom: 16,
};

const attentionItemListStyle = {
    gap: 10,
};

const attentionItemStyle = {
    alignItems: 'center' as const,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    padding: 10,
};

const requestGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
};

const workQueueCardStyle = {
    marginBottom: 18,
};

const workQueueControlRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 10,
};

const workQueueSearchInputStyle = {
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: 320,
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800' as const,
    minWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const workQueueSearchInputMobileStyle = {
    flexBasis: '100%' as const,
    width: '100%' as const,
};

const workQueueControlButtonStyle = {
    flexBasis: 110,
    flexGrow: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
};

const workQueueSortButtonStyle = {
    flexBasis: 190,
    flexGrow: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
};

const workQueueCategoryRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 10,
};

const workQueueCategoryButtonStyle = {
    flexBasis: 140,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
};

const workQueueFilterTrayStyle = {
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 10,
    padding: 10,
};

const workQueueFilterButtonStyle = {
    flexBasis: 130,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
};

const workQueueResultSummaryStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
    marginTop: 8,
};

const workQueueListStyle = {
    gap: 8,
    marginTop: 10,
};

const workQueueRowStyle = {
    alignItems: 'center' as const,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 10,
    minHeight: 78,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const workQueueRowPressableStyle = {
    borderRadius: 18,
    maxWidth: '100%' as const,
    minWidth: 0,
};

const workQueueRowMainPressableStyle = {
    flex: 1,
    minWidth: 0,
};

const workQueuePrimaryLineStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    minWidth: 0,
};

const workQueueDisplayCodeBadgeStyle = {
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
    overflow: 'hidden' as const,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '900' as const,
};

const workQueueExpandButtonStyle = {
    alignItems: 'center' as const,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center' as const,
    minHeight: 42,
    minWidth: 72,
    paddingHorizontal: 12,
};

const workQueueOpenButtonTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const workQueueEmptyStyle = {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    padding: 14,
};

const detailDrawerBackdropStyle = {
    alignItems: 'flex-end' as const,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    flex: 1,
    justifyContent: 'center' as const,
    padding: Platform.OS === 'web' ? 16 : 12,
    position: Platform.OS === 'web' ? ('fixed' as ViewStyle['position']) : ('absolute' as const),
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    zIndex: 1000,
};

const detailDrawerBackdropPressableStyle = {
    bottom: 0,
    left: 0,
    position: 'absolute' as const,
    right: 0,
    top: 0,
    zIndex: 1000,
};

const detailDrawerPanelStyle = {
    borderRadius: 18,
    borderWidth: 1,
    elevation: 14,
    height: Platform.OS === 'web' ? ('calc(100vh - 32px)' as ViewStyle['height']) : ('100%' as const),
    maxHeight: Platform.OS === 'web' ? ('calc(100vh - 32px)' as ViewStyle['maxHeight']) : ('100%' as const),
    maxWidth: 680,
    minWidth: 420,
    overflow: 'hidden' as const,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 26,
    width: '42%' as const,
    zIndex: 1001,
};

const detailDrawerPanelMobileStyle = {
    borderRadius: Platform.OS === 'web' ? 14 : 0,
    height: Platform.OS === 'web' ? ('calc(100vh - 24px)' as ViewStyle['height']) : ('100%' as const),
    maxHeight: Platform.OS === 'web' ? ('calc(100vh - 24px)' as ViewStyle['maxHeight']) : ('100%' as const),
    maxWidth: '100%' as const,
    minWidth: 0,
    width: '100%' as const,
};

const detailDrawerHeaderStyle = {
    alignItems: 'center' as const,
    borderBottomWidth: 1,
    elevation: 8,
    flexDirection: 'row' as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    zIndex: 1002,
};

const detailDrawerCloseButtonStyle = {
    alignItems: 'center' as const,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center' as const,
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 16,
    paddingVertical: 10,
};

const detailDrawerCloseButtonTextStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
};

const detailDrawerScrollStyle = {
    flex: 1,
};

const detailDrawerScrollContentStyle = {
    padding: 12,
    paddingBottom: 96,
};

const requestCardStyle = {
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: '100%' as const,
    minHeight: 96,
    minWidth: 0,
    padding: 10,
};

const compactActiveRowTopStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
    marginBottom: 6,
};

const compactActiveBadgeRowStyle = {
    alignItems: 'center' as const,
    flex: 1,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    minWidth: 0,
};

const compactActiveCustomerLineStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
    lineHeight: 18,
};

const compactActiveMetaLineStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 16,
    marginTop: 2,
};

const compactAttentionRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 6,
};

const compactCardHeaderActionsStyle = {
    alignItems: 'flex-end' as const,
    gap: 6,
};

const compactExpandButtonStyle = {
    paddingHorizontal: 10,
    paddingVertical: 6,
};

const compactNotifyButtonStyle = {
    flexGrow: 0,
    paddingHorizontal: 10,
    paddingVertical: 7,
};

const compactActivePressableButtonStyle = {
    alignItems: 'center' as const,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center' as const,
    minHeight: 34,
};

const compactActiveButtonTextStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
};

const compactMetaGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 6,
};

const techStatusPanelStyle = {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
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

const closeoutOutcomeButtonStyle = {
    flexBasis: 150,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
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

const scheduleFormRowsStyle = {
    gap: 10,
};

const schedulerPanelStyle = {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    padding: 10,
};

const schedulePanelHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
};

const scheduleTwoColumnRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const scheduleHalfPanelStyle = {
    flexBasis: 300,
    flexGrow: 1,
    minWidth: 260,
};

const quickScheduleButtonStyle = {
    flexBasis: 92,
    flexGrow: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
};

const scheduleSummaryPanelStyle = {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
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
