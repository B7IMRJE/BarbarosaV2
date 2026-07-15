import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ServiceRequestMediaGallery from '../components/serviceRequests/ServiceRequestMediaGallery';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import {
    canAccessDispatch,
    canAccessTechOS,
    isActiveCompanyStatus,
    isTechnicianCompanyRole,
    normalizeCompanyRole,
    normalizeCompanyStatus,
} from '../lib/companyPermissions';
import { clearPendingCompanyInviteState } from '../lib/companyInviteState';
import {
    loadEstimateDraft,
    saveEstimateDraftContext,
} from '../lib/estimateDraft';
import { inferEstimateCategoryFromDraft } from '../lib/estimateOptions';
import { resolveEstimateOptionSession } from '../lib/estimateSessions';
import { loadLoggedInUserCompanyAccess, type CompanyRouteAccessRow } from '../lib/onboarding';
import { recordHomeownerStatusUpdate, recordServiceRequestEvent } from '../lib/serviceRequestActivity';
import {
    closeServiceVisit,
    getServiceVisitOutcomeLabel,
    getTechnicianCloseoutOptions,
    type ServiceVisitOutcome,
} from '../lib/serviceVisitCloseout';
import { supabase } from '../lib/supabase';
import {
    createTechnicianNextJobStatusNotice,
    TECH_CUSTOM_STATUS_ACTION,
    TECH_WORKFLOW_ACTIONS,
    TECHNICIAN_NEXT_JOB_STATUS_ACTIONS,
    type TechnicianNextJobStatusAction,
    type TechWorkflowAction,
} from '../lib/techosWorkflow';
import {
    buildTechOSCurrentJobRoute,
    buildTechOSEstimateRoute,
    buildTechOSProviderHomeRoute,
    getTechOSEstimateActionLabel,
    hasTechOSClientHomeContext,
    resolveTechOSDashboardVariant,
    resolveTechOSJobDetailVariant,
    type TechOSClientJobContext,
    type TechOSDashboardVisualKey,
    type TechOSJobDetailVisualKey,
} from '../lib/techosClientAccess';
import {
    resolveTechOSTheme,
    techOSThemeOptions,
    type TechOSThemeId,
    type TechOSThemePalette,
} from '../lib/techosAppearance';
import {
    loadTechOSThemePreference,
    saveTechOSThemePreference,
} from '../lib/techosAppearancePreference';
import { useTheme } from '../theme/useTheme';

declare const __DEV__: boolean;

type CompanyUserAccess = {
    id: string;
    company_id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    status: string | null;
    created_at: string | null;
    permissions?: {
        can_view_techos?: boolean;
    } | null;
};

type CompanyUser = CompanyUserAccess & {
    auth_user_id: string | null;
};

type CompanyBrand = {
    id: string;
    name: string | null;
    status: string | null;
    public_name: string | null;
    dba_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    accent_color: string | null;
    service_categories: string[] | null;
    license_number: string | null;
    short_description: string | null;
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

type TechOSJob = {
    id: string;
    company_id: string | null;
    property_id: string | null;
    company_property_client_id?: string | null;
    title: string | null;
    status: string | null;
    job_source?: string | null;
    created_at: string | null;
    updated_at?: string | null;
    assignment_id?: string | null;
    assignment_status?: string | null;
    role_on_job?: string | null;
    assignment_count?: number | null;
};

type TechScheduleSlot = {
    id: string;
    company_id: string;
    job_id: string | null;
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
    created_at: string | null;
    updated_at: string | null;
};

type TechServiceRequest = {
    id: string;
    company_id: string;
    property_id: string | null;
    company_property_client_id: string | null;
    request_type: string | null;
    status: string | null;
    priority: string | null;
    issue_summary: string | null;
    created_at: string | null;
    converted_job_id: string | null;
    converted_at: string | null;
};

type TechAssignedScheduleJob = {
    slot: TechScheduleSlot;
    request: TechServiceRequest | null;
    property: PropertyRecord | null;
};

type TechCloseoutForm = {
    outcome: ServiceVisitOutcome | '';
    notes: string;
    homeownerNote: string;
    nextActionDate: string;
    notifyHomeowner: boolean;
};

type TechOSScheduleDiagnostics = {
    authUserId: string;
    authEmail: string;
    companyId: string;
    companyUserId: string;
    role: string | null;
    status: string | null;
    queryError: string;
    rawSlotCount: number;
    normalizedSlotCount: number;
    windowStart: string;
    windowEnd: string;
    lastLoadedAt: string;
};

type JobDateGroup = {
    key: string;
    label: string;
    jobs: TechOSJob[];
};

type CreateTechOSServiceJobResult = {
    job_id: string;
    company_id: string;
    property_id: string;
    title: string;
    status: string;
};

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

type TechOSMode = 'technician' | 'management-preview' | 'platform-preview';
type TechDashboardView = 'jobs' | 'schedule' | 'history' | 'estimates' | 'sales' | 'messages' | 'time-clock' | 'van-inventory';

const HOMEOS_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';
const TECHOS_ASSIGNMENT_REFRESH_MS = 30_000;

export default function TechOSScreen() {
    const { companyId, slotId } = useLocalSearchParams<{ companyId?: string | string[]; slotId?: string | string[] }>();
    const { width: viewportWidth } = useWindowDimensions();
    const { theme } = useTheme();
    const isPhoneLayout = viewportWidth <= 640;
    const pagePadding = isPhoneLayout ? 16 : 20;
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [membership, setMembership] = useState<CompanyUserAccess | null>(null);
    const [companyChoices, setCompanyChoices] = useState<CompanyUserAccess[]>([]);
    const [isPlatformAdminAccess, setIsPlatformAdminAccess] = useState(false);
    const [company, setCompany] = useState<CompanyBrand | null>(null);
    const [clients, setClients] = useState<CompanyClient[]>([]);
    const [propertiesById, setPropertiesById] = useState<Record<string, PropertyRecord>>({});
    const [jobs, setJobs] = useState<TechOSJob[]>([]);
    const [assignedScheduleSlots, setAssignedScheduleSlots] = useState<TechScheduleSlot[]>([]);
    const [serviceRequestsById, setServiceRequestsById] = useState<Record<string, TechServiceRequest>>({});
    const [activeCompanyId, setActiveCompanyId] = useState('');
    const [clientMessage, setClientMessage] = useState('');
    const [jobLoading, setJobLoading] = useState(false);
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [scheduleMessage, setScheduleMessage] = useState('');
    const [assignmentBanner, setAssignmentBanner] = useState('');
    const [creatingJobClientId, setCreatingJobClientId] = useState<string | null>(null);
    const [jobMessage, setJobMessage] = useState('');
    const [message, setMessage] = useState('Loading TechOS...');
    const [showAssignedClients, setShowAssignedClients] = useState(false);
    const [techOSMode, setTechOSMode] = useState<TechOSMode>('technician');
    const [dashboardView, setDashboardView] = useState<TechDashboardView>('jobs');
    const [activeTechnicians, setActiveTechnicians] = useState<CompanyUser[]>([]);
    const [expandedAssignmentJobs, setExpandedAssignmentJobs] = useState<Record<string, boolean>>({});
    const [selectedTechnicianByJob, setSelectedTechnicianByJob] = useState<Record<string, string>>({});
    const [assignmentMessageByJob, setAssignmentMessageByJob] = useState<Record<string, string>>({});
    const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
    const [authUserId, setAuthUserId] = useState('');
    const [authEmail, setAuthEmail] = useState('');
    const [signingOut, setSigningOut] = useState(false);
    const [selectedAssignedJobId, setSelectedAssignedJobId] = useState('');
    const [workflowStatusBySlotId, setWorkflowStatusBySlotId] = useState<Record<string, string>>({});
    const [workflowMessageBySlotId, setWorkflowMessageBySlotId] = useState<Record<string, string>>({});
    const [technicianStatusMessageBySlotId, setTechnicianStatusMessageBySlotId] = useState<Record<string, string>>({});
    const [customStatusNoteBySlotId, setCustomStatusNoteBySlotId] = useState<Record<string, string>>({});
    const [closeoutFormBySlotId, setCloseoutFormBySlotId] = useState<Record<string, TechCloseoutForm>>({});
    const [closingVisitSlotId, setClosingVisitSlotId] = useState('');
    const [timingEstimateBySlotId, setTimingEstimateBySlotId] = useState<Record<string, string>>({});
    const [timingPromptMessageBySlotId, setTimingPromptMessageBySlotId] = useState<Record<string, string>>({});
    const [timingPromptAnsweredBySlotId, setTimingPromptAnsweredBySlotId] = useState<Record<string, boolean>>({});
    const [updatingWorkflowSlotId, setUpdatingWorkflowSlotId] = useState('');
    const [estimateDraftCountByPropertyId, setEstimateDraftCountByPropertyId] = useState<Record<string, number>>({});
    const [techOSThemeId, setTechOSThemeId] = useState<TechOSThemeId>('professional');
    const [showAppearancePanel, setShowAppearancePanel] = useState(false);
    const [appearanceMessage, setAppearanceMessage] = useState('');
    const [scheduleDiagnostics, setScheduleDiagnostics] = useState<TechOSScheduleDiagnostics | null>(null);
    const knownAssignedSlotIdsRef = useRef<Set<string>>(new Set());

    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
    const requestedSlotId = useMemo(() => firstParam(slotId), [slotId]);
    const visibleClients = useMemo(
        () => clients.filter((client) => normalizeStatus(client.status) !== 'archived'),
        [clients]
    );
    const visibleJobs = useMemo(
        () =>
            jobs.filter((job) => {
                const normalizedStatus = normalizeStatus(job.status);
                return !['archived', 'deleted'].includes(normalizedStatus);
            }),
        [jobs]
    );
    const openJobs = useMemo(() => visibleJobs.filter((job) => isOpenJobStatus(job.status)), [visibleJobs]);
    const pausedJobs = useMemo(() => visibleJobs.filter((job) => isPausedJobStatus(job.status)), [visibleJobs]);
    const closedJobs = useMemo(() => visibleJobs.filter((job) => isClosedJobStatus(job.status)), [visibleJobs]);
    const groupedJobSections = useMemo(() => groupJobsByDate(visibleJobs), [visibleJobs]);
    const assignedScheduleJobs = useMemo(
        () => assignedScheduleSlots.map((slot) => {
            const request = slot.service_request_id ? serviceRequestsById[slot.service_request_id] || null : null;
            const property = request?.property_id ? propertiesById[request.property_id] || null : null;

            return { slot, request, property };
        }),
        [assignedScheduleSlots, propertiesById, serviceRequestsById]
    );
    const currentFutureAssignedScheduleJobs = useMemo(
        () => assignedScheduleJobs.filter((job) => isCurrentFutureActiveScheduleJob(job.slot)),
        [assignedScheduleJobs]
    );
    const todayAssignedScheduleJobs = useMemo(
        () => currentFutureAssignedScheduleJobs.filter((job) => isTodayDate(job.slot.start_at)),
        [currentFutureAssignedScheduleJobs]
    );
    const futureAssignedScheduleJobs = useMemo(
        () => currentFutureAssignedScheduleJobs.filter((job) => isFutureDate(job.slot.start_at)),
        [currentFutureAssignedScheduleJobs]
    );
    const historyScheduleJobs = useMemo(
        () => assignedScheduleJobs.filter((job) => !isActiveUpcomingScheduleJob(job.slot)),
        [assignedScheduleJobs]
    );
    const assignedOpenScheduleJobs = useMemo(
        () => currentFutureAssignedScheduleJobs.filter((job) => isOpenScheduleSlotStatus(job.slot.status)),
        [currentFutureAssignedScheduleJobs]
    );
    const assignedPausedScheduleJobs = useMemo(
        () => currentFutureAssignedScheduleJobs.filter((job) => isPausedJobStatus(job.slot.status)),
        [currentFutureAssignedScheduleJobs]
    );
    const assignedClosedScheduleJobs = useMemo(
        () => assignedScheduleJobs.filter((job) => isClosedJobStatus(job.slot.status)),
        [assignedScheduleJobs]
    );
    const calendarScheduleGroups = useMemo(
        () => groupAssignedScheduleJobsByDate(currentFutureAssignedScheduleJobs),
        [currentFutureAssignedScheduleJobs]
    );
    const selectedAssignedJob = useMemo(
        () => assignedScheduleJobs.find((job) => job.slot.id === selectedAssignedJobId) || null,
        [assignedScheduleJobs, selectedAssignedJobId]
    );
    const timingPromptJob = useMemo(
        () => findUpcomingTimingPromptJob(currentFutureAssignedScheduleJobs.filter((job) => !timingPromptAnsweredBySlotId[job.slot.id])),
        [currentFutureAssignedScheduleJobs, timingPromptAnsweredBySlotId]
    );
    const assignedEstimatePropertyIds = useMemo(
        () => Array.from(new Set(
            assignedScheduleJobs
                .map((job) => job.request?.property_id || '')
                .filter(Boolean)
        )).sort(),
        [assignedScheduleJobs]
    );
    const assignedEstimatePropertyKey = assignedEstimatePropertyIds.join('|');
    const techOSTheme = useMemo(() => resolveTechOSTheme(techOSThemeId), [techOSThemeId]);

    useEffect(() => {
        loadTechOSAccess();
    }, [requestedCompanyId]);

    useEffect(() => {
        if (!requestedSlotId) return;

        if (assignedScheduleJobs.some((job) => job.slot.id === requestedSlotId)) {
            setSelectedAssignedJobId(requestedSlotId);
        }
    }, [assignedScheduleJobs, requestedSlotId]);

    useEffect(() => {
        void loadAssignedEstimateDraftCounts();
    }, [activeCompanyId, assignedEstimatePropertyKey, authUserId]);

    useEffect(() => {
        void loadStoredTechOSTheme();
    }, [authUserId]);

    useEffect(() => {
        const technicianCompanyUserId = techOSMode === 'technician' ? membership?.id || '' : '';
        const companyIdForRefresh = activeCompanyId;

        if (!companyIdForRefresh || !technicianCompanyUserId) return;

        const refreshAssignedJobs = () => {
            void loadAssignedScheduleJobs(companyIdForRefresh, technicianCompanyUserId, {
                announceNewAssignments: true,
                subtle: true,
            });
        };
        const intervalId = setInterval(refreshAssignedJobs, TECHOS_ASSIGNMENT_REFRESH_MS);
        const channel = supabase
            .channel(`techos-assigned-jobs:${companyIdForRefresh}:${technicianCompanyUserId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'job_schedule_slots',
                    filter: `technician_company_user_id=eq.${technicianCompanyUserId}`,
                },
                refreshAssignedJobs
            )
            .subscribe();

        return () => {
            clearInterval(intervalId);
            void supabase.removeChannel(channel);
        };
    }, [activeCompanyId, membership?.id, techOSMode]);

    useEffect(() => {
        if (!assignmentBanner) return;

        const timer = setTimeout(() => {
            setAssignmentBanner('');
        }, 8000);

        return () => clearTimeout(timer);
    }, [assignmentBanner]);

    async function loadTechOSAccess() {
        setCheckingAccess(true);
        setMessage('Loading TechOS...');
        setMembership(null);
        setCompanyChoices([]);
        setIsPlatformAdminAccess(false);
        setCompany(null);
        setClients([]);
        setPropertiesById({});
        setJobs([]);
        setAssignedScheduleSlots([]);
        setServiceRequestsById({});
        setActiveCompanyId('');
        setClientMessage('');
        setScheduleMessage('');
        setAssignmentBanner('');
        setCreatingJobClientId(null);
        setJobMessage('');
        setTechOSMode('technician');
        setDashboardView('jobs');
        setActiveTechnicians([]);
        setExpandedAssignmentJobs({});
        setSelectedTechnicianByJob({});
        setAssignmentMessageByJob({});
        setAssigningJobId(null);
        setAuthUserId('');
        setAuthEmail('');
        setSelectedAssignedJobId('');
        setWorkflowStatusBySlotId({});
        setWorkflowMessageBySlotId({});
        setTechnicianStatusMessageBySlotId({});
        setTimingEstimateBySlotId({});
        setTimingPromptMessageBySlotId({});
        setTimingPromptAnsweredBySlotId({});
        setUpdatingWorkflowSlotId('');
        setEstimateDraftCountByPropertyId({});
        setScheduleDiagnostics(null);
        knownAssignedSlotIdsRef.current = new Set();

        let userId = '';
        let userEmail = '';

        try {
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError) {
                setCheckingAccess(false);
                setMessage(normalizeServiceErrorMessage(userError.message));
                return;
            }

            if (!user) {
                router.replace('/auth/login' as any);
                return;
            }

            userId = user.id;
            userEmail = user.email || '';
            setAuthUserId(userId);
            setAuthEmail(userEmail);
        } catch (error) {
            setCheckingAccess(false);
            setMessage(normalizeServiceErrorMessage(getErrorMessage(error)));
            return;
        }

        const platformAdminCheck = await loadPlatformAdminStatus(userId);

        const membershipResult = await loadLoggedInUserCompanyAccess(userId);

        if (membershipResult.error) {
            setCheckingAccess(false);
            setMessage(`Could not verify TechOS access: ${normalizeServiceErrorMessage(membershipResult.error.message)}`);
            return;
        }

        const activeTechOSMemberships = membershipResult.data
            .map(toCompanyUserAccess)
            .filter((companyUser) => isActiveStatus(companyUser.status) && canAccessTechOS(companyUser));
        let activeMembership = requestedCompanyId
            ? activeTechOSMemberships.find((companyUser) => companyUser.company_id === requestedCompanyId) || null
            : null;
        let selectedCompanyId = requestedCompanyId;

        if (!selectedCompanyId && activeTechOSMemberships.length === 1) {
            activeMembership = activeTechOSMemberships[0];
            selectedCompanyId = activeMembership.company_id;
            replaceTechOSCompanyRoute(selectedCompanyId);
        }

        if (!selectedCompanyId && activeTechOSMemberships.length > 1) {
            setCompanyChoices(activeTechOSMemberships);
            setCheckingAccess(false);
            setMessage('Choose a company to open TechOS.');
            return;
        }

        if (platformAdminCheck.isPlatformAdmin && selectedCompanyId) {
            setMembership(activeMembership);
            setIsPlatformAdminAccess(true);
            setTechOSMode('platform-preview');
            setActiveCompanyId(selectedCompanyId);
            await Promise.all([
                loadCompanyBrand(selectedCompanyId),
                loadCompanyClients(selectedCompanyId),
                loadActiveTechnicians(selectedCompanyId),
                loadCompanyJobs(selectedCompanyId, 'platform-preview'),
            ]);
            setCheckingAccess(false);
            setMessage('');
            return;
        }

        if (!activeMembership || !canAccessTechOS(activeMembership)) {
            setCheckingAccess(false);
            setMessage(
                platformAdminCheck.isPlatformAdmin
                    ? 'Choose a company before opening TechOS as a platform admin.'
                    : 'No company access found.'
            );
            return;
        }

        setMembership(activeMembership);
        const nextMode: TechOSMode = isTechnicianRole(activeMembership.role) ? 'technician' : 'management-preview';
        setTechOSMode(nextMode);
        setActiveCompanyId(activeMembership.company_id);
        logTechOSDebug('resolved technician profile', {
            auth_user_id: userId,
            auth_email: userEmail,
            company_user_id: activeMembership.id,
            company_id: activeMembership.company_id,
            role: activeMembership.role,
            status: activeMembership.status,
            mode: nextMode,
        });
        if (nextMode === 'technician') {
            await Promise.all([
                loadCompanyBrand(activeMembership.company_id),
                loadAssignedScheduleJobs(activeMembership.company_id, activeMembership.id, {
                    announceNewAssignments: false,
                    authEmail: userEmail,
                    authUserId: userId,
                    role: activeMembership.role,
                    status: activeMembership.status,
                }),
                loadAssignedTechnicianJobs(activeMembership.company_id),
            ]);
        } else {
            await Promise.all([
                loadCompanyBrand(activeMembership.company_id),
                loadCompanyClients(activeMembership.company_id),
                loadActiveTechnicians(activeMembership.company_id),
                loadCompanyJobs(activeMembership.company_id, 'management-preview'),
            ]);
        }
        setCheckingAccess(false);
        setMessage('');
    }

    async function loadAssignedScheduleJobs(
        companyIdToLoad: string,
        technicianCompanyUserId: string,
        options: {
            announceNewAssignments?: boolean;
            authEmail?: string;
            authUserId?: string;
            role?: string | null;
            status?: string | null;
            subtle?: boolean;
        } = {}
    ) {
        const diagnosticsContext = {
            authEmail: options.authEmail ?? authEmail,
            authUserId: options.authUserId ?? authUserId,
            companyId: companyIdToLoad,
            companyUserId: technicianCompanyUserId,
            role: options.role ?? membership?.role ?? null,
            status: options.status ?? membership?.status ?? null,
        };

        if (!companyIdToLoad || !technicianCompanyUserId) {
            setAssignedScheduleSlots([]);
            setServiceRequestsById({});
            setScheduleDiagnostics({
                ...diagnosticsContext,
                queryError: 'Missing company id or technician company user id.',
                rawSlotCount: 0,
                normalizedSlotCount: 0,
                windowStart: '',
                windowEnd: '',
                lastLoadedAt: new Date().toISOString(),
            });
            return;
        }

        if (!options.subtle) {
            setScheduleLoading(true);
        }

        const windowStart = getStartOfToday();
        const windowEnd = new Date();
        windowStart.setDate(windowStart.getDate() - 30);
        windowEnd.setDate(windowEnd.getDate() + 60);

        const { data, error } = await supabase
            .from('job_schedule_slots')
            .select('id, company_id, job_id, service_request_id, technician_company_user_id, start_at, end_at, arrival_window_start, arrival_window_end, status, estimated_duration_minutes, priority, notes, tech_status_note, visit_outcome, visit_closed_at, closeout_notes, homeowner_closeout_note, updated_at, created_at')
            .eq('company_id', companyIdToLoad)
            .eq('technician_company_user_id', technicianCompanyUserId)
            .gte('start_at', windowStart.toISOString())
            .lte('start_at', windowEnd.toISOString())
            .order('start_at', { ascending: true });

        logTechOSDebug('job_schedule_slots query result', {
            ...diagnosticsContext,
            error,
            row_count: Array.isArray(data) ? data.length : 0,
            window_start: windowStart.toISOString(),
            window_end: windowEnd.toISOString(),
        });

        if (error) {
            logTechOSDebug('job_schedule_slots query error', error);
            setAssignedScheduleSlots([]);
            setServiceRequestsById({});
            setScheduleDiagnostics({
                ...diagnosticsContext,
                queryError: error.message,
                rawSlotCount: 0,
                normalizedSlotCount: 0,
                windowStart: windowStart.toISOString(),
                windowEnd: windowEnd.toISOString(),
                lastLoadedAt: new Date().toISOString(),
            });
            setScheduleMessage(`Could not load assigned jobs: ${normalizeServiceErrorMessage(error.message)}`);
            setScheduleLoading(false);
            return;
        }

        const nextSlots = normalizeScheduleSlots(data);
        setScheduleDiagnostics({
            ...diagnosticsContext,
            queryError: '',
            rawSlotCount: Array.isArray(data) ? data.length : 0,
            normalizedSlotCount: nextSlots.length,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
            lastLoadedAt: new Date().toISOString(),
        });
        const previousSlotIds = knownAssignedSlotIdsRef.current;
        const nextSlotIds = new Set(nextSlots.map((slot) => slot.id));
        const hasNewSlot = options.announceNewAssignments &&
            previousSlotIds.size > 0 &&
            nextSlots.some((slot) => !previousSlotIds.has(slot.id) && isActiveScheduleSlot(slot.status));

        knownAssignedSlotIdsRef.current = nextSlotIds;
        setAssignedScheduleSlots(nextSlots);

        const serviceRequestsResult = await loadScheduleServiceRequests(companyIdToLoad, nextSlots);
        setServiceRequestsById(serviceRequestsResult.requestsById);
        setScheduleMessage(serviceRequestsResult.message);

        if (hasNewSlot) {
            setAssignmentBanner('New job assigned');
        }

        setScheduleLoading(false);
    }

    async function loadCompanyBrand(companyIdToLoad: string) {
        let data: unknown = null;
        let errorMessage = '';

        try {
            const result = await supabase
                .from('companies')
                .select(
                    'id, name, status, public_name, dba_name, logo_url, primary_color, secondary_color, accent_color, service_categories, license_number, short_description'
                )
                .eq('id', companyIdToLoad)
                .maybeSingle();
            data = result.data || null;
            errorMessage = result.error?.message || '';
        } catch (error) {
            errorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
        }

        if (errorMessage) {
            setMessage(`TechOS loaded, but company branding could not be loaded: ${normalizeServiceErrorMessage(errorMessage)}`);
            setCompany(null);
            return;
        }

        setCompany((data || null) as CompanyBrand | null);
    }

    async function loadCompanyClients(companyIdToLoad: string) {
        setClientMessage('');

        let data: unknown[] = [];
        let errorMessage = '';

        try {
            const result = await supabase
                .from('company_property_clients')
                .select(
                    'id, company_id, property_id, property_connection_id, display_name, status, source, first_requested_at, last_requested_at, connected_at, created_at'
                )
                .eq('company_id', companyIdToLoad)
                .order('created_at', { ascending: false });
            data = result.data || [];
            errorMessage = result.error?.message || '';
        } catch (error) {
            errorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
        }

        if (errorMessage) {
            setClients([]);
            setPropertiesById({});
            setClientMessage(`Could not load assigned clients: ${normalizeServiceErrorMessage(errorMessage)}`);
            return;
        }

        const loadedClients = (data || []) as CompanyClient[];
        setClients(loadedClients);
        await loadClientProperties(loadedClients);
    }

    async function loadClientProperties(loadedClients: CompanyClient[]) {
        const propertyIds = Array.from(new Set(loadedClients.map((client) => client.property_id).filter(Boolean)));

        if (propertyIds.length === 0) {
            setPropertiesById({});
            return;
        }

        let data: unknown[] = [];
        let errorMessage = '';

        try {
            const result = await supabase
                .from('properties')
                .select('id, name, address, address_line_1, city, state, zip, postal_code')
                .in('id', propertyIds);
            data = result.data || [];
            errorMessage = result.error?.message || '';
        } catch (error) {
            errorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
        }

        if (errorMessage) {
            setPropertiesById({});
            setClientMessage(`Clients loaded, but basic home details could not be loaded: ${normalizeServiceErrorMessage(errorMessage)}`);
            return;
        }

        const nextPropertiesById = ((data || []) as PropertyRecord[]).reduce<Record<string, PropertyRecord>>(
            (accumulator, property) => {
                accumulator[property.id] = property;
                return accumulator;
            },
            {}
        );

        setPropertiesById(nextPropertiesById);
    }

    async function loadAssignedTechnicianJobs(companyIdToLoad: string) {
        setJobLoading(true);

        try {
            const { data, error } = await supabase.rpc('get_my_techos_jobs');

            if (error) {
                throw new Error(error.message);
            }

            setJobs(((data || []) as TechOSJob[]).filter((job) => job.company_id === companyIdToLoad));
            setJobMessage('');
        } catch (error) {
            setJobs([]);
            const message = normalizeServiceErrorMessage(getErrorMessage(error));
            setJobMessage(
                message === HOMEOS_SERVICE_ERROR_MESSAGE
                    ? message
                    : 'Job assignment is not configured yet. Jobs will appear here after dispatch assigns them.'
            );
        } finally {
            setJobLoading(false);
        }
    }

    async function loadActiveTechnicians(companyIdToLoad: string) {
        const result = await loadCompanyMembers(companyIdToLoad);

        if (result.error) {
            setActiveTechnicians([]);
            setJobMessage(`Could not load technicians for assignment: ${result.error.message}`);
            return;
        }

        setActiveTechnicians(
            result.data.filter((member) => isActiveStatus(member.status) && isAssignableTechnicianRole(member.role))
        );
    }

    async function loadCompanyJobs(companyIdToLoad: string, mode: TechOSMode) {
        setJobLoading(true);

        try {
            const { data, error } = await supabase.rpc('get_company_techos_overview', {
                p_company_id: companyIdToLoad,
            });

            if (error) {
                throw new Error(error.message);
            }

            setJobs((data || []) as TechOSJob[]);
            setJobMessage(
                mode === 'technician'
                    ? ''
                    : 'This is Management Preview. Assign technicians here without making this an admin workload.'
            );
        } catch (error) {
            setJobs([]);
            setJobMessage(`Could not load company jobs preview: ${normalizeServiceErrorMessage(getErrorMessage(error))}`);
        } finally {
            setJobLoading(false);
        }
    }

    async function handleAssignTechnician(job: TechOSJob) {
        const selectedCompanyId = activeCompanyId || job.company_id || '';
        const selectedTechnicianId = selectedTechnicianByJob[job.id] || '';

        if (!selectedCompanyId || !job.id) {
            setAssignmentMessageByJob((current) => ({
                ...current,
                [job.id]: 'Could not assign this job because company or job context is missing.',
            }));
            return;
        }

        if (!selectedTechnicianId) {
            setAssignmentMessageByJob((current) => ({
                ...current,
                [job.id]: 'Choose a technician before assigning this job.',
            }));
            return;
        }

        const selectedTechnician = activeTechnicians.find((technician) => technician.id === selectedTechnicianId);
        setAssigningJobId(job.id);
        setAssignmentMessageByJob((current) => ({
            ...current,
            [job.id]: `Assigning ${getMemberDisplayName(selectedTechnician)}...`,
        }));

        let assignErrorMessage = '';

        try {
            const { error } = await supabase.rpc('assign_technician_to_job', {
                p_company_id: selectedCompanyId,
                p_job_id: job.id,
                p_technician_company_user_id: selectedTechnicianId,
                p_role_on_job: 'primary',
            });
            assignErrorMessage = error?.message || '';
        } catch (error) {
            assignErrorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
        }

        if (assignErrorMessage) {
            setAssignmentMessageByJob((current) => ({
                ...current,
                [job.id]: getFriendlyAssignmentMessage(assignErrorMessage),
            }));
            setAssigningJobId(null);
            return;
        }

        setAssignmentMessageByJob((current) => ({
            ...current,
            [job.id]: `${getMemberDisplayName(selectedTechnician)} assigned as primary technician.`,
        }));
        setExpandedAssignmentJobs((current) => ({ ...current, [job.id]: false }));
        setSelectedTechnicianByJob((current) => ({ ...current, [job.id]: '' }));
        await loadCompanyJobs(selectedCompanyId, techOSMode);
        setAssigningJobId(null);
    }

    async function handleStartServiceJob(client: CompanyClient, property?: PropertyRecord) {
        const clientName = client.display_name || property?.name || 'this client';
        const selectedCompanyId = activeCompanyId || client.company_id;

        if (!selectedCompanyId || !client.property_id) {
            const missingContextMessage = `Could not create a service job for ${clientName}: the company or home link is missing.`;
            setJobMessage(missingContextMessage);
            setMessage(missingContextMessage);
            return;
        }

        setCreatingJobClientId(client.id);
        setJobMessage(`Creating service job for ${clientName}...`);
        setMessage('');

        try {
            const { data, error } = await supabase.rpc('create_techos_service_job', {
                p_company_id: selectedCompanyId,
                p_property_id: client.property_id,
                p_company_property_client_id: client.id,
                p_title: 'Service Visit',
            });

            if (error) {
                throw error;
            }

            const createdJob = Array.isArray(data)
                ? (data[0] as CreateTechOSServiceJobResult | undefined)
                : (data as CreateTechOSServiceJobResult | null);
            const successMessage = createdJob?.job_id
                ? `Service job created for ${clientName}.`
                : `Service job created for ${clientName}. Refreshing jobs...`;

            setJobMessage(successMessage);
            setMessage(successMessage);
            await loadCompanyJobs(selectedCompanyId, techOSMode);
        } catch (error) {
            const errorMessage = `Could not create service job for ${clientName}: ${normalizeServiceErrorMessage(getErrorMessage(error))}`;
            setJobMessage(errorMessage);
            setMessage(errorMessage);
        } finally {
            setCreatingJobClientId(null);
        }
    }

    function handleOpenJob(job: TechOSJob) {
        const selectedCompanyId = activeCompanyId || job.company_id || '';

        router.push({
            pathname: '/techos/job/[jobId]',
            params: selectedCompanyId ? { jobId: job.id, companyId: selectedCompanyId } : { jobId: job.id },
        } as any);
    }

    function handleOpenAssignedJobDetails(job: TechAssignedScheduleJob) {
        setSelectedAssignedJobId(job.slot.id);
    }

    function handleCloseAssignedJobDetails() {
        setSelectedAssignedJobId('');
    }

    function updateTechCloseoutForm(slotId: string, updates: Partial<TechCloseoutForm>) {
        setCloseoutFormBySlotId((current) => ({
            ...current,
            [slotId]: {
                ...createDefaultTechCloseoutForm(),
                ...(current[slotId] || {}),
                ...updates,
            },
        }));
    }

    function handleOpenFullAssignedJob(job: TechAssignedScheduleJob) {
        if (!job.slot.job_id) return;

        router.push({
            pathname: '/techos/job/[jobId]',
            params: { jobId: job.slot.job_id, companyId: job.slot.company_id },
        } as any);
    }

    function handleOpenClientHomeOS(job: TechAssignedScheduleJob) {
        const context = getTechOSClientJobContext(job);

        if (!hasTechOSClientHomeContext(context)) return;

        router.push(buildTechOSProviderHomeRoute(context) as any);
    }

    async function handleOpenEstimateForAssignedJob(job: TechAssignedScheduleJob) {
        const context = getTechOSClientJobContext(job);

        if (context.propertyId && authUserId) {
            const nextDraftContext = {
                company_id: context.companyId,
                property_id: context.propertyId,
                customer_home_name: getAssignedJobLocation(job),
                service_request_id: context.serviceRequestId || null,
                job_id: context.jobId || null,
                schedule_slot_id: context.scheduleSlotId || null,
                technician_company_user_id: job.slot.technician_company_user_id || null,
                technician_name: membership?.full_name || authEmail || null,
                issue_summary: job.request?.issue_summary || job.slot.notes || null,
                source: 'techos' as const,
                updated_at: new Date().toISOString(),
            };
            const sessionResult = await resolveEstimateOptionSession({
                companyId: context.companyId,
                propertyId: context.propertyId,
                serviceRequestId: context.serviceRequestId || null,
                jobId: context.jobId || null,
                scheduleSlotId: context.scheduleSlotId || null,
                homeItemId: null,
                category: inferEstimateCategoryFromDraft([], nextDraftContext),
                source: 'techos',
            });

            if (!sessionResult.session) {
                setMessage(`Estimate session unavailable: ${sessionResult.error || 'Could not create estimate session.'}`);
                return;
            }

            await saveEstimateDraftContext({
                ...nextDraftContext,
                estimate_session_id: sessionResult.session.id,
            }, {
                userId: authUserId,
                companyId: context.companyId,
                propertyId: context.propertyId,
            });

            await loadAssignedEstimateDraftCounts();
        }

        router.push(buildTechOSEstimateRoute(context) as any);
    }

    function handleOpenEstimateWorkspace() {
        const selectedCompanyId = activeCompanyId || membership?.company_id || requestedCompanyId;

        if (!selectedCompanyId) return;

        router.push({
            pathname: '/estimate',
            params: {
                companyId: selectedCompanyId,
                mode: 'techos',
            },
        } as any);
    }

    async function loadAssignedEstimateDraftCounts() {
        if (!authUserId || !activeCompanyId || assignedEstimatePropertyIds.length === 0) {
            setEstimateDraftCountByPropertyId({});
            return;
        }

        const entries = await Promise.all(
            assignedEstimatePropertyIds.map(async (propertyId) => {
                const draftItems = await loadEstimateDraft({
                    userId: authUserId,
                    companyId: activeCompanyId,
                    propertyId,
                });

                return [propertyId, draftItems.length] as const;
            })
        );

        setEstimateDraftCountByPropertyId(Object.fromEntries(entries));
    }

    async function loadStoredTechOSTheme() {
        const nextThemeId = await loadTechOSThemePreference(authUserId);

        setTechOSThemeId(nextThemeId);
        setAppearanceMessage('');
    }

    async function handleSelectTechOSTheme(themeId: TechOSThemeId) {
        setTechOSThemeId(themeId);
        setAppearanceMessage(`${resolveTechOSTheme(themeId).label} selected.`);

        if (authUserId) {
            await saveTechOSThemePreference(authUserId, themeId);
        }
    }

    async function handleCloseServiceVisit(job: TechAssignedScheduleJob) {
        const slotId = job.slot.id;
        const form = closeoutFormBySlotId[slotId] || createDefaultTechCloseoutForm();
        const outcome = form.outcome;

        if (!job.request?.id) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: 'Close visit failed: this assigned job is missing its service request.',
            }));
            return;
        }

        if (!outcome) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: 'Choose a visit outcome before closing.',
            }));
            return;
        }

        const nextActionAt = parseCloseoutDate(form.nextActionDate)?.toISOString() || null;

        setClosingVisitSlotId(slotId);
        setWorkflowMessageBySlotId((current) => ({
            ...current,
            [slotId]: `Closing visit as ${getServiceVisitOutcomeLabel(outcome)}...`,
        }));

        try {
            const result = await closeServiceVisit({
                companyId: job.slot.company_id,
                serviceRequestId: job.request.id,
                scheduleSlotId: slotId,
                outcome,
                notes: form.notes,
                homeownerNote: form.homeownerNote,
                nextActionAt,
                notifyHomeowner: form.notifyHomeowner,
                metadata: {
                    techos_closeout: true,
                    technician_name: membership?.full_name || authEmail || null,
                },
            });

            setAssignedScheduleSlots((current) => current.map((slot) => (
                slot.id === slotId
                    ? {
                        ...slot,
                        status: result.schedule_slot_status,
                        visit_outcome: result.visit_outcome,
                        visit_closed_at: new Date().toISOString(),
                        closeout_notes: form.notes.trim() || null,
                        homeowner_closeout_note: form.homeownerNote.trim() || null,
                        tech_status_note: null,
                        updated_at: new Date().toISOString(),
                    }
                    : slot
            )));
            setServiceRequestsById((current) => ({
                ...current,
                [job.request!.id]: {
                    ...job.request!,
                    status: result.service_request_status,
                },
            }));
            setWorkflowStatusBySlotId((current) => ({
                ...current,
                [slotId]: result.schedule_slot_status,
            }));
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: `Visit closed: ${getServiceVisitOutcomeLabel(result.visit_outcome)}.`,
            }));

            if (activeCompanyId && membership?.id) {
                await loadAssignedScheduleJobs(activeCompanyId, membership.id, { subtle: true });
            }
        } catch (error) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: `Close visit failed: ${normalizeServiceErrorMessage(getErrorMessage(error))}`,
            }));
        } finally {
            setClosingVisitSlotId('');
        }
    }

    async function handleTechWorkflowAction(job: TechAssignedScheduleJob, action: TechWorkflowAction, statusNote?: string) {
        const slotId = job.slot.id;
        const normalizedStatus = normalizeStatus(action.status);
        const trimmedStatusNote = String(statusNote || '').trim();

        if (!slotId || !job.slot.company_id || !job.slot.technician_company_user_id) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId || 'missing']: 'Workflow update failed: assigned job context is missing.',
            }));
            return;
        }

        if (normalizedStatus === 'custom' && !trimmedStatusNote) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: 'Enter a custom status message.',
            }));
            return;
        }

        setUpdatingWorkflowSlotId(slotId);
        setWorkflowMessageBySlotId((current) => ({
            ...current,
            [slotId]: `Updating status to ${action.label}...`,
        }));

        try {
            const nextStatusNote = normalizedStatus === 'custom' ? trimmedStatusNote : null;
            const { data, error } = await supabase
                .from('job_schedule_slots')
                .update({ status: action.status, tech_status_note: nextStatusNote })
                .eq('id', slotId)
                .eq('company_id', job.slot.company_id)
                .eq('technician_company_user_id', job.slot.technician_company_user_id)
                .select('id, status, tech_status_note, updated_at')
                .maybeSingle();

            if (error) {
                throw new Error(error.message);
            }

            if (!data) {
                throw new Error('No assigned job was updated. Confirm this job is assigned to your technician profile.');
            }

            setAssignedScheduleSlots((current) => current.map((slot) => (
                slot.id === slotId
                    ? {
                        ...slot,
                        status: action.status,
                        tech_status_note: nextStatusNote,
                        updated_at: readStringField(data as Record<string, unknown>, 'updated_at') || new Date().toISOString(),
                    }
                    : slot
            )));
            setWorkflowStatusBySlotId((current) => ({
                ...current,
                [slotId]: action.status,
            }));
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: normalizedStatus === 'custom'
                    ? `Custom status updated: ${trimmedStatusNote}.`
                    : `Status updated: ${action.label}.`,
            }));
            if (job.request?.id) {
                const customerUpdateResult = await recordHomeownerStatusUpdate({
                    companyId: job.slot.company_id,
                    serviceRequestId: job.request.id,
                    scheduleSlotId: slotId,
                    status: action.status,
                    statusNote: nextStatusNote,
                    technicianName: membership?.full_name || authEmail || null,
                    metadata: {
                        techos_status: action.status,
                    },
                });

                if (customerUpdateResult.status === 'pending' && normalizeStatus(action.status) !== 'running_late') {
                    setWorkflowMessageBySlotId((current) => ({
                        ...current,
                        [slotId]: `${current[slotId] || `Status updated: ${action.label}.`} Homeowner timeline event is pending backend setup.`,
                    }));
                }
            }
        } catch (error) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: `Workflow update failed: ${normalizeServiceErrorMessage(getErrorMessage(error))}`,
            }));
        } finally {
            setUpdatingWorkflowSlotId('');
        }
    }

    function handleTechnicianNextJobStatusAction(
        job: TechAssignedScheduleJob,
        action: TechnicianNextJobStatusAction,
        currentVisitStatus: string
    ) {
        const notice = createTechnicianNextJobStatusNotice(action, {
            companyId: job.slot.company_id,
            currentVisitStatus,
            technicianCompanyUserId: job.slot.technician_company_user_id,
        });

        setTechnicianStatusMessageBySlotId((current) => ({
            ...current,
            [job.slot.id]: notice.message,
        }));
    }

    async function handleTimingPromptResponse(job: TechAssignedScheduleJob, response: string) {
        const slotId = job.slot.id;
        const estimatedRemainingText = timingEstimateBySlotId[slotId] || '';
        const estimatedRemainingMinutes = parsePositiveInteger(estimatedRemainingText);

        if (!job.request?.id) {
            setTimingPromptMessageBySlotId((current) => ({
                ...current,
                [slotId]: 'Timing response could not be saved because this assignment is missing its service request.',
            }));
            return;
        }

        setTimingPromptMessageBySlotId((current) => ({
            ...current,
            [slotId]: 'Saving timing response...',
        }));

        try {
            const result = await recordServiceRequestEvent({
                companyId: job.slot.company_id,
                serviceRequestId: job.request.id,
                eventType: 'technician_timing_response',
                message: `Technician timing response: ${response}.`,
                eventVisibility: 'internal',
                audience: 'dispatch',
                scheduleSlotId: slotId,
                dedupeKey: `timing-response:${slotId}`,
                metadata: {
                    response,
                    estimated_remaining_minutes: estimatedRemainingMinutes,
                    arrival_window_start: job.slot.arrival_window_start,
                    arrival_window_end: job.slot.arrival_window_end,
                    related_next_service_request_id: job.request.id,
                },
                notificationChannels: ['in_app'],
            });

            setTimingPromptMessageBySlotId((current) => ({
                ...current,
                [slotId]: result.status === 'recorded'
                    ? 'Timing response sent to Dispatch.'
                    : result.message,
            }));
            setTimingPromptAnsweredBySlotId((current) => ({
                ...current,
                [slotId]: true,
            }));
        } catch (error) {
            setTimingPromptMessageBySlotId((current) => ({
                ...current,
                [slotId]: `Timing response failed: ${getErrorMessage(error)}`,
            }));
        }
    }

    async function signOutFromTechOS() {
        if (signingOut) return;

        setSigningOut(true);
        clearPendingCompanyInviteState();
        await supabase.auth.signOut();
        router.replace('/auth/login' as any);
    }

    if (checkingAccess) {
        return <AccessMessage title="TechOS" message="Checking TechOS access..." onSignOut={signOutFromTechOS} signingOut={signingOut} />;
    }

    if (!membership && !isPlatformAdminAccess) {
        if (companyChoices.length > 1) {
            return (
                <CompanyPicker
                    choices={companyChoices}
                    message={message}
                    onSelectCompany={replaceTechOSCompanyRoute}
                    onSignOut={signOutFromTechOS}
                    signingOut={signingOut}
                />
            );
        }

        return <AccessMessage title="TechOS" message={message} onSignOut={signOutFromTechOS} signingOut={signingOut} />;
    }

    const companyName = company?.public_name || company?.name || 'Company';
    const primaryColor = company?.primary_color || theme.colors.primary;
    const secondaryColor = company?.secondary_color || theme.colors.primaryText;
    const logoUrl = company?.logo_url?.trim() || '';
    const canPreviewLogo = logoUrl.startsWith('http');
    const isTechnicianWorkspace = techOSMode === 'technician';
    const jobBoardTitle = isTechnicianWorkspace ? 'Assigned Jobs' : 'Company Jobs Preview';
    const jobBoardDescription = isTechnicianWorkspace
        ? 'Only jobs assigned to the signed-in technician belong here.'
        : 'Company-level jobs shown for setup and dispatch preview. This is not one technician workload.';
    const canOpenDispatch = isPlatformAdminAccess || canAccessDispatch(membership || undefined);
    const dispatchCompanyId = canOpenDispatch ? activeCompanyId || membership?.company_id || requestedCompanyId : '';
    const dashboardTodayCount = isTechnicianWorkspace ? todayAssignedScheduleJobs.length : 0;
    const dashboardFutureCount = isTechnicianWorkspace ? futureAssignedScheduleJobs.length : 0;
    const dashboardJobsCount = isTechnicianWorkspace ? currentFutureAssignedScheduleJobs.length : visibleJobs.length;
    const dashboardHistoryCount = isTechnicianWorkspace ? historyScheduleJobs.length : closedJobs.length;
    const dashboardOpenCount = isTechnicianWorkspace ? assignedOpenScheduleJobs.length : openJobs.length;
    const dashboardPausedCount = isTechnicianWorkspace ? assignedPausedScheduleJobs.length : pausedJobs.length;
    const dashboardClosedCount = isTechnicianWorkspace ? assignedClosedScheduleJobs.length : closedJobs.length;
    const technicianName = isPlatformAdminAccess
        ? 'Platform Admin'
        : membership?.full_name || authEmail || membership?.email || 'Technician';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: techOSTheme.screenBackgroundColor || theme.colors.background }}
            contentContainerStyle={{ padding: pagePadding, paddingBottom: 36, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 980, minWidth: 0 }}>
                <HomeHeader />
                <TechOSProfileHeader
                    canPreviewLogo={canPreviewLogo}
                    companyName={companyName}
                    email={authEmail || membership?.email || null}
                    logoUrl={logoUrl}
                    openJobCount={dashboardOpenCount}
                    primaryColor={primaryColor}
                    role={isPlatformAdminAccess ? 'Platform Admin' : membership?.role}
                    secondaryColor={secondaryColor}
                    status={isPlatformAdminAccess ? 'active' : membership?.status}
                    technicianName={technicianName}
                    todayCount={dashboardTodayCount}
                    upcomingJobCount={dashboardFutureCount}
                    onSignOut={signOutFromTechOS}
                    signingOut={signingOut}
                />

                <View style={techQuickActionRowStyle}>
                    {!!dispatchCompanyId && (
                        <ThemedButton
                            title="Open Dispatch"
                            variant="secondary"
                            onPress={() => router.push(`/dispatch?companyId=${encodeURIComponent(dispatchCompanyId)}` as any)}
                            style={techQuickActionButtonStyle}
                            textStyle={{ fontSize: 14 }}
                        />
                    )}
                    <ThemedButton
                        title={showAppearancePanel ? 'Hide Appearance' : 'Appearance'}
                        variant="secondary"
                        onPress={() => setShowAppearancePanel((current) => !current)}
                        style={techQuickActionButtonStyle}
                        textStyle={{ fontSize: 14 }}
                    />
                </View>

                {showAppearancePanel && (
                    <TechOSAppearancePanel
                        message={appearanceMessage}
                        selectedThemeId={techOSTheme.id}
                        onSelectTheme={(themeId) => {
                            void handleSelectTechOSTheme(themeId);
                        }}
                    />
                )}

                {!isTechnicianWorkspace && (
                    <ThemedCard style={messageCardStyle}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            This is not a technician login. Select or assign a technician from ManagementOS to preview their workload.
                        </Text>
                    </ThemedCard>
                )}

                {!!message && (
                    <ThemedCard style={messageCardStyle}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}

                {!!assignmentBanner && (
                    <ThemedCard style={assignmentBannerStyle}>
                        <Text style={[assignmentBannerTextStyle, { color: theme.colors.primary }]}>
                            {assignmentBanner}
                        </Text>
                    </ThemedCard>
                )}

                {isTechnicianWorkspace && timingPromptJob && (
                    <TechTimingPromptCard
                        estimatedRemainingMinutes={timingEstimateBySlotId[timingPromptJob.slot.id] || ''}
                        job={timingPromptJob}
                        message={timingPromptMessageBySlotId[timingPromptJob.slot.id] || ''}
                        onChangeEstimatedRemainingMinutes={(value) => {
                            setTimingEstimateBySlotId((current) => ({
                                ...current,
                                [timingPromptJob.slot.id]: value,
                            }));
                        }}
                        onRespond={(response) => handleTimingPromptResponse(timingPromptJob, response)}
                    />
                )}

                <TechOSDashboardCards
                    activeView={dashboardView}
                    historyCount={dashboardHistoryCount}
                    jobsCount={dashboardJobsCount}
                    onSelectView={(view) => {
                        setSelectedAssignedJobId('');
                        setDashboardView(view);
                    }}
                    scheduleCount={calendarScheduleGroups.length}
                    techOSTheme={techOSTheme}
                    todayCount={dashboardTodayCount}
                    upcomingCount={dashboardFutureCount}
                />

                {isTechnicianWorkspace ? (
                    <TechOSDashboardContent
                        activeJobs={currentFutureAssignedScheduleJobs}
                        activeView={dashboardView}
                        calendarGroups={calendarScheduleGroups}
                        futureJobs={futureAssignedScheduleJobs}
                        historyJobs={historyScheduleJobs}
                        jobStats={{
                            closed: dashboardClosedCount,
                            open: dashboardOpenCount,
                            paused: dashboardPausedCount,
                        }}
                        loading={scheduleLoading}
                        message={scheduleMessage}
                        scheduleDiagnostics={scheduleDiagnostics}
                        selectedJob={selectedAssignedJob}
                        activeCompanyId={activeCompanyId}
                        estimateDraftCountByPropertyId={estimateDraftCountByPropertyId}
                        techOSTheme={techOSTheme}
                        technicianStatusMessageBySlotId={technicianStatusMessageBySlotId}
                        todayJobs={todayAssignedScheduleJobs}
                        closeoutFormBySlotId={closeoutFormBySlotId}
                        closingVisitSlotId={closingVisitSlotId}
                        customStatusNoteBySlotId={customStatusNoteBySlotId}
                        onRefresh={() => {
                            if (activeCompanyId && membership?.id) {
                                void loadAssignedScheduleJobs(activeCompanyId, membership.id, {
                                    announceNewAssignments: false,
                                });
                            }
                        }}
                        onCloseDetails={handleCloseAssignedJobDetails}
                        onOpenClientHomeOS={handleOpenClientHomeOS}
                        onOpenEstimateForAssignedJob={(job) => {
                            void handleOpenEstimateForAssignedJob(job);
                        }}
                        onOpenEstimateWorkspace={handleOpenEstimateWorkspace}
                        onChangeCustomStatusNote={(slotId, note) => {
                            setCustomStatusNoteBySlotId((current) => ({
                                ...current,
                                [slotId]: note,
                            }));
                        }}
                        onChangeCloseoutForm={updateTechCloseoutForm}
                        onCloseServiceVisit={handleCloseServiceVisit}
                        onOpenDetails={handleOpenAssignedJobDetails}
                        onOpenFullJob={handleOpenFullAssignedJob}
                        onRunTechnicianNextJobStatusAction={handleTechnicianNextJobStatusAction}
                        onRunWorkflowAction={handleTechWorkflowAction}
                        updatingWorkflowSlotId={updatingWorkflowSlotId}
                        workflowMessageBySlotId={workflowMessageBySlotId}
                        workflowStatusBySlotId={workflowStatusBySlotId}
                    />
                ) : (
                    <>
                        <View style={summaryGridStyle}>
                            <SummaryCard
                                title="Active Jobs"
                                value={String(visibleJobs.length)}
                                note="Company jobs visible in preview."
                            />
                            <SummaryCard
                                title="Open Jobs"
                                value={String(openJobs.length)}
                                note="Ready or in progress."
                            />
                            <SummaryCard
                                title="Paused Jobs"
                                value={String(pausedJobs.length)}
                                note="Waiting, paused, or on hold."
                            />
                            <SummaryCard
                                title="Closed Jobs"
                                value={String(closedJobs.length)}
                                note="Completed, closed, or canceled."
                            />
                            <SummaryCard
                                title="Technicians"
                                value="--"
                                note="Technician assignment summary is not configured yet."
                            />
                            <SummaryCard
                                title="Unassigned Jobs"
                                value="--"
                                note="Use the job cards below to assign active technicians."
                            />
                            <SummaryCard
                                title="Dispatch Assignment"
                                value={String(activeTechnicians.length)}
                                note="Active technicians available for primary assignment."
                            />
                        </View>

                        <TechOSJobsBoard
                            activeTechnicians={activeTechnicians}
                            assigningJobId={assigningJobId}
                            clients={visibleClients}
                            canAssignTechnicians
                            groupedJobs={groupedJobSections}
                            jobs={visibleJobs}
                            loading={jobLoading}
                            message={jobMessage}
                            assignmentMessageByJob={assignmentMessageByJob}
                            expandedAssignmentJobs={expandedAssignmentJobs}
                            onOpenJob={handleOpenJob}
                            onAssignTechnician={handleAssignTechnician}
                            onSelectTechnician={(jobId, technicianId) =>
                                setSelectedTechnicianByJob((current) => ({ ...current, [jobId]: technicianId }))
                            }
                            onToggleAssignment={(jobId) =>
                                setExpandedAssignmentJobs((current) => ({ ...current, [jobId]: !current[jobId] }))
                            }
                            propertiesById={propertiesById}
                            selectedTechnicianByJob={selectedTechnicianByJob}
                            title={jobBoardTitle}
                            description={jobBoardDescription}
                            emptyMessage="Jobs will appear here after ManagementOS dispatch creates or assigns company service jobs."
                        />
                    </>
                )}

                {!isTechnicianWorkspace && (
                    <AssignedClientsCard
                        clients={visibleClients}
                        creatingJobClientId={creatingJobClientId}
                        expanded={showAssignedClients}
                        jobs={visibleJobs}
                        message={clientMessage}
                        onStartServiceJob={handleStartServiceJob}
                        onToggleExpanded={() => setShowAssignedClients((current) => !current)}
                        propertiesById={propertiesById}
                    />
                )}

                <View style={buttonRowStyle}>
                    <ThemedButton title="Refresh TechOS" onPress={loadTechOSAccess} style={buttonStyle} />
                </View>
            </View>
        </ScrollView>
    );
}

function TechTimingPromptCard({
    estimatedRemainingMinutes,
    job,
    message,
    onChangeEstimatedRemainingMinutes,
    onRespond,
}: {
    estimatedRemainingMinutes: string;
    job: TechAssignedScheduleJob;
    message: string;
    onChangeEstimatedRemainingMinutes: (value: string) => void;
    onRespond: (response: string) => void;
}) {
    const { theme } = useTheme();
    const responseOptions = [
        'Yes, on schedule',
        'Probably, but close',
        'Running late',
        'Need 30 more minutes',
        'Need 60 more minutes',
        'Not sure yet',
        'Cannot make it',
    ];

    return (
        <ThemedCard style={[timingPromptCardStyle, { borderColor: '#C4B5FD', backgroundColor: 'rgba(196, 181, 253, 0.14)' }]}>
            <Text style={[jobAssignmentTitleStyle, { color: theme.colors.text }]}>Next Job Timing</Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Your next arrival window begins at {formatTime(job.slot.arrival_window_start || job.slot.start_at)}. Will you make it on time?
            </Text>
            <TextInput
                value={estimatedRemainingMinutes}
                onChangeText={onChangeEstimatedRemainingMinutes}
                placeholder="Estimated time remaining on current job (minutes)"
                placeholderTextColor={theme.colors.mutedText}
                keyboardType="numeric"
                style={[
                    techCustomStatusInputStyle,
                    {
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        marginTop: 10,
                    },
                ]}
            />
            <View style={techWorkflowActionGridStyle}>
                {responseOptions.map((option) => (
                    <ThemedButton
                        key={option}
                        title={option}
                        variant="secondary"
                        onPress={() => onRespond(option)}
                        style={techWorkflowActionButtonStyle}
                        textStyle={techWorkflowActionButtonTextStyle}
                    />
                ))}
            </View>
            {!!message && (
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText, marginTop: 8 }]}>
                    {message}
                </Text>
            )}
        </ThemedCard>
    );
}

function TechOSProfileHeader({
    canPreviewLogo,
    companyName,
    email,
    logoUrl,
    openJobCount,
    primaryColor,
    role,
    secondaryColor,
    status,
    technicianName,
    todayCount,
    upcomingJobCount,
    onSignOut,
    signingOut,
}: {
    canPreviewLogo: boolean;
    companyName: string;
    email: string | null;
    logoUrl: string;
    openJobCount: number;
    primaryColor: string;
    role?: string | null;
    secondaryColor: string;
    status?: string | null;
    technicianName: string;
    todayCount: number;
    upcomingJobCount: number;
    onSignOut: () => void;
    signingOut: boolean;
}) {
    const { theme } = useTheme();
    const avatarColor = primaryColor || theme.colors.primary;
    const avatarTextColor = getReadableColor(avatarColor);

    return (
        <ThemedCard style={[techProfileHeaderStyle, { borderColor: primaryColor || theme.colors.border }]}>
            <View style={[techProfileAccentStyle, { backgroundColor: primaryColor || theme.colors.primary }]} />
            <View style={techProfileTopRowStyle}>
                <View style={[techAvatarStyle, { backgroundColor: avatarColor }]}>
                    <Text style={[techAvatarTextStyle, { color: avatarTextColor }]}>
                        {getInitials(technicianName || email || 'Tech')}
                    </Text>
                </View>

                <View style={techProfileMainStyle}>
                    <View style={techCompanyRowStyle}>
                        {canPreviewLogo ? (
                            <Image source={{ uri: logoUrl }} style={[techCompanyLogoStyle, { backgroundColor: secondaryColor }]} />
                        ) : (
                            <View style={[techCompanyLogoFallbackStyle, { backgroundColor: secondaryColor }]}>
                                <Text style={[techCompanyLogoFallbackTextStyle, { color: getReadableColor(secondaryColor) }]}>
                                    {companyName.slice(0, 1).toUpperCase()}
                                </Text>
                            </View>
                        )}
                        <Text style={[techCompanyNameStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                            {companyName}
                        </Text>
                    </View>
                    <Text style={[techProfileNameStyle, { color: theme.colors.text }]} numberOfLines={1}>
                        {technicianName}
                    </Text>
                    <Text style={[techProfileMetaStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                        {formatLabel(role)} · {formatStatus(status)} · {email || 'unknown email'}
                    </Text>
                </View>

                <ThemedButton
                    title={signingOut ? 'Signing Out...' : 'Sign Out'}
                    variant="secondary"
                    onPress={onSignOut}
                    style={techProfileSignOutButtonStyle}
                />
            </View>
            <View style={techProfileStatsRowStyle}>
                <View style={[techProfileStatStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[techProfileStatValueStyle, { color: theme.colors.text }]}>{todayCount}</Text>
                    <Text style={[techProfileStatLabelStyle, { color: theme.colors.mutedText }]}>Today's Jobs</Text>
                </View>
                <View style={[techProfileStatStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[techProfileStatValueStyle, { color: theme.colors.text }]}>{upcomingJobCount}</Text>
                    <Text style={[techProfileStatLabelStyle, { color: theme.colors.mutedText }]}>Upcoming Jobs</Text>
                </View>
                <View style={[techProfileStatStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[techProfileStatValueStyle, { color: theme.colors.text }]}>{openJobCount}</Text>
                    <Text style={[techProfileStatLabelStyle, { color: theme.colors.mutedText }]}>Open Jobs</Text>
                </View>
            </View>
        </ThemedCard>
    );
}

function TechOSAppearancePanel({
    message,
    selectedThemeId,
    onSelectTheme,
}: {
    message: string;
    selectedThemeId: TechOSThemeId;
    onSelectTheme: (themeId: TechOSThemeId) => void;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={techAppearancePanelStyle}>
            <Text style={[sectionTitleStyle, { color: theme.colors.text, marginBottom: 4 }]}>TechOS Appearance</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                Choose a technician display palette. This does not change the homeowner HomeOS theme.
            </Text>

            <View style={techAppearanceGridStyle}>
                {techOSThemeOptions.map((option) => {
                    const selected = option.id === selectedThemeId;

                    return (
                        <TouchableOpacity
                            key={option.id}
                            activeOpacity={0.84}
                            onPress={() => onSelectTheme(option.id)}
                            style={[
                                techAppearanceOptionStyle,
                                {
                                    backgroundColor: option.panelBackgroundColor,
                                    borderColor: selected ? option.activeBorderColor : option.panelBorderColor,
                                },
                                selected && techAppearanceOptionSelectedStyle,
                            ]}
                        >
                            <View style={[dashboardCardAccentStyle, { backgroundColor: option.activeBorderColor }]} />
                            <Text style={[jobTitleStyle, { color: option.textColor }]}>{option.label}</Text>
                            <Text style={[clientMetaTextStyle, { color: option.mutedTextColor }]}>{option.description}</Text>
                            <View style={techAppearanceSwatchRowStyle}>
                                {[
                                    option.dashboard.jobs.accentColor,
                                    option.dashboard.schedule.accentColor,
                                    option.dashboard.estimates.accentColor,
                                    option.dashboard.messages.accentColor,
                                    option.jobDetail.finish.accentColor,
                                ].map((color, index) => (
                                    <View
                                        key={`${option.id}-${color}-${index}`}
                                        style={[techAppearanceSwatchStyle, { backgroundColor: color, borderColor: option.panelBorderColor }]}
                                    />
                                ))}
                            </View>
                            <Text style={[jobNumberStyle, { color: option.mutedTextColor }]}>
                                {selected ? 'Selected' : 'Tap to select'}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {!!message && (
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText, marginTop: 10 }]}>{message}</Text>
            )}
        </ThemedCard>
    );
}

function AccessMessage({
    title,
    message,
    onSignOut,
    signingOut,
}: {
    title: string;
    message: string;
    onSignOut: () => void;
    signingOut: boolean;
}) {
    const { theme } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 720 }}>
                <HomeHeader />
                <ThemedCard>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>{title}</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    <ThemedButton
                        title="Back to Home"
                        variant="secondary"
                        onPress={() => router.push('/' as never)}
                        style={{ marginTop: 16 }}
                    />
                    <ThemedButton
                        title={signingOut ? 'Signing Out...' : 'Sign Out'}
                        variant="ghost"
                        onPress={onSignOut}
                        style={{ marginTop: 12 }}
                    />
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

function CompanyPicker({
    choices,
    message,
    onSelectCompany,
    onSignOut,
    signingOut,
}: {
    choices: CompanyUserAccess[];
    message: string;
    onSelectCompany: (companyId: string) => void;
    onSignOut: () => void;
    signingOut: boolean;
}) {
    const { theme } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 720 }}>
                <HomeHeader />
                <ThemedCard>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>TechOS</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        {message || 'Choose a company to open TechOS.'}
                    </Text>
                    <View style={technicianPickerStyle}>
                        {choices.map((choice) => (
                            <TouchableOpacity
                                key={choice.company_id}
                                onPress={() => onSelectCompany(choice.company_id)}
                                style={[
                                    technicianPickerRowStyle,
                                    {
                                        borderColor: theme.colors.border,
                                        backgroundColor: theme.colors.surface,
                                    },
                                ]}
                            >
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={[technicianPickerNameStyle, { color: theme.colors.text }]}>
                                        Company {shortId(choice.company_id)}
                                    </Text>
                                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                                        Role: {formatLabel(choice.role)} · Status: {formatStatus(choice.status)}
                                    </Text>
                                </View>
                                <Text style={[technicianPickerActionStyle, { color: theme.colors.primary }]}>
                                    Open
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <ThemedButton
                        title="Back to Home"
                        variant="secondary"
                        onPress={() => router.push('/' as never)}
                        style={{ marginTop: 16 }}
                    />
                    <ThemedButton
                        title={signingOut ? 'Signing Out...' : 'Sign Out'}
                        variant="ghost"
                        onPress={onSignOut}
                        style={{ marginTop: 12 }}
                    />
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

function SummaryCard({ title, value, note }: { title: string; value: string; note: string }) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={summaryCardStyle}>
            <Text style={[summaryValueStyle, { color: theme.colors.text }]}>{value}</Text>
            <Text style={[summaryTitleStyle, { color: theme.colors.text }]}>{title}</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{note}</Text>
        </ThemedCard>
    );
}

function TechOSDashboardCards({
    activeView,
    historyCount,
    jobsCount,
    onSelectView,
    scheduleCount,
    techOSTheme,
    todayCount,
    upcomingCount,
}: {
    activeView: TechDashboardView;
    historyCount: number;
    jobsCount: number;
    onSelectView: (view: TechDashboardView) => void;
    scheduleCount: number;
    techOSTheme: TechOSThemePalette;
    todayCount: number;
    upcomingCount: number;
}) {
    const cards: Array<{ key: TechDashboardView; title: string; value: string; note: string; priority?: boolean }> = [
        {
            key: 'jobs',
            title: 'Jobs',
            value: String(jobsCount),
            note: `${todayCount} today / ${upcomingCount} upcoming`,
            priority: true,
        },
        {
            key: 'schedule',
            title: 'Schedule',
            value: String(scheduleCount),
            note: scheduleCount === 1 ? 'scheduled day' : 'scheduled days',
            priority: true,
        },
        {
            key: 'history',
            title: 'History',
            value: String(historyCount),
            note: 'past work',
            priority: true,
        },
        {
            key: 'estimates',
            title: 'Estimates & Invoices',
            value: '0',
            note: 'coming into workflow',
            priority: true,
        },
        {
            key: 'sales',
            title: 'Sales',
            value: '$0',
            note: 'not connected yet',
        },
        {
            key: 'messages',
            title: 'Messages',
            value: '0',
            note: 'updates soon',
        },
        {
            key: 'time-clock',
            title: 'Time Clock',
            value: 'Soon',
            note: 'placeholder',
        },
        {
            key: 'van-inventory',
            title: 'Van Inventory',
            value: 'Soon',
            note: 'placeholder',
        },
    ];
    return (
        <View style={dashboardGridStyle}>
            {cards.map((card) => {
                const active = activeView === card.key;
                const variant = resolveTechOSDashboardVariant(card.key as TechOSDashboardVisualKey, techOSTheme.id);

                return (
                    <ThemedCard
                        key={card.key}
                        onPress={() => onSelectView(card.key)}
                        style={[
                            dashboardCardStyle,
                            {
                                backgroundColor: variant.backgroundColor,
                                borderColor: variant.borderColor,
                            },
                            card.priority && {
                                borderColor: active ? techOSTheme.activeBorderColor : variant.borderColor,
                            },
                            active && {
                                borderColor: techOSTheme.activeBorderColor,
                            },
                        ]}
                    >
                        <View style={[dashboardCardAccentStyle, { backgroundColor: variant.accentColor }]} />
                        <Text style={[dashboardCardValueStyle, { color: techOSTheme.textColor }]}>{card.value}</Text>
                        <Text style={[dashboardCardTitleStyle, { color: techOSTheme.textColor }]}>{card.title}</Text>
                        <Text style={[dashboardCardNoteStyle, { color: techOSTheme.mutedTextColor }]}>{card.note}</Text>
                    </ThemedCard>
                );
            })}
        </View>
    );
}

function TechOSDashboardContent({
    activeCompanyId,
    activeJobs,
    activeView,
    calendarGroups,
    estimateDraftCountByPropertyId,
    futureJobs,
    historyJobs,
    jobStats,
    loading,
    message,
    scheduleDiagnostics,
    selectedJob,
    techOSTheme,
    technicianStatusMessageBySlotId,
    todayJobs,
    closeoutFormBySlotId,
    closingVisitSlotId,
    customStatusNoteBySlotId,
    onRefresh,
    onCloseDetails,
    onChangeCloseoutForm,
    onChangeCustomStatusNote,
    onCloseServiceVisit,
    onOpenClientHomeOS,
    onOpenDetails,
    onOpenEstimateForAssignedJob,
    onOpenEstimateWorkspace,
    onOpenFullJob,
    onRunTechnicianNextJobStatusAction,
    onRunWorkflowAction,
    updatingWorkflowSlotId,
    workflowMessageBySlotId,
    workflowStatusBySlotId,
}: {
    activeCompanyId: string;
    activeJobs: TechAssignedScheduleJob[];
    activeView: TechDashboardView;
    calendarGroups: Array<{ key: string; label: string; jobs: TechAssignedScheduleJob[] }>;
    estimateDraftCountByPropertyId: Record<string, number>;
    futureJobs: TechAssignedScheduleJob[];
    historyJobs: TechAssignedScheduleJob[];
    jobStats: { closed: number; open: number; paused: number };
    loading: boolean;
    message: string;
    scheduleDiagnostics: TechOSScheduleDiagnostics | null;
    selectedJob: TechAssignedScheduleJob | null;
    techOSTheme: TechOSThemePalette;
    technicianStatusMessageBySlotId: Record<string, string>;
    todayJobs: TechAssignedScheduleJob[];
    closeoutFormBySlotId: Record<string, TechCloseoutForm>;
    closingVisitSlotId: string;
    customStatusNoteBySlotId: Record<string, string>;
    onRefresh: () => void;
    onCloseDetails: () => void;
    onChangeCloseoutForm: (slotId: string, updates: Partial<TechCloseoutForm>) => void;
    onChangeCustomStatusNote: (slotId: string, note: string) => void;
    onCloseServiceVisit: (job: TechAssignedScheduleJob) => void;
    onOpenClientHomeOS: (job: TechAssignedScheduleJob) => void;
    onOpenDetails: (job: TechAssignedScheduleJob) => void;
    onOpenEstimateForAssignedJob: (job: TechAssignedScheduleJob) => void;
    onOpenEstimateWorkspace: () => void;
    onOpenFullJob: (job: TechAssignedScheduleJob) => void;
    onRunTechnicianNextJobStatusAction: (job: TechAssignedScheduleJob, action: TechnicianNextJobStatusAction, currentVisitStatus: string) => void;
    onRunWorkflowAction: (job: TechAssignedScheduleJob, action: TechWorkflowAction, statusNote?: string) => void;
    updatingWorkflowSlotId: string;
    workflowMessageBySlotId: Record<string, string>;
    workflowStatusBySlotId: Record<string, string>;
}) {
    if (selectedJob) {
        return (
            <TechOSAssignedJobDetail
                backLabel={getAssignedJobDetailBackLabel(activeView)}
                closeoutForm={closeoutFormBySlotId[selectedJob.slot.id] || createDefaultTechCloseoutForm()}
                customStatusNote={customStatusNoteBySlotId[selectedJob.slot.id] ?? selectedJob.slot.tech_status_note ?? ''}
                job={selectedJob}
                estimateDraftCount={selectedJob.request?.property_id ? estimateDraftCountByPropertyId[selectedJob.request.property_id] || 0 : 0}
                message={workflowMessageBySlotId[selectedJob.slot.id] || ''}
                techOSTheme={techOSTheme}
                onBack={onCloseDetails}
                onChangeCloseoutForm={(updates) => onChangeCloseoutForm(selectedJob.slot.id, updates)}
                onChangeCustomStatusNote={(note) => onChangeCustomStatusNote(selectedJob.slot.id, note)}
                onCloseServiceVisit={() => onCloseServiceVisit(selectedJob)}
                onOpenClientHomeOS={() => onOpenClientHomeOS(selectedJob)}
                onOpenEstimate={() => onOpenEstimateForAssignedJob(selectedJob)}
                onOpenFullJob={onOpenFullJob}
                onRunTechnicianNextJobStatusAction={onRunTechnicianNextJobStatusAction}
                onRunWorkflowAction={onRunWorkflowAction}
                technicianStatusMessage={technicianStatusMessageBySlotId[selectedJob.slot.id] || ''}
                updating={updatingWorkflowSlotId === selectedJob.slot.id || closingVisitSlotId === selectedJob.slot.id}
                workflowStatus={workflowStatusBySlotId[selectedJob.slot.id] || selectedJob.slot.status || selectedJob.request?.status || 'scheduled'}
            />
        );
    }

    if (activeView === 'schedule') {
        return (
            <TechOSCalendarView
                groups={calendarGroups}
                loading={loading}
                message={message}
                onRefresh={onRefresh}
                onOpenDetails={onOpenDetails}
            />
        );
    }

    if (activeView === 'jobs') {
        return (
            <AssignedScheduleJobsSection
                emptyTitle="No active assigned jobs"
                emptyMessage="Jobs appear here when Dispatch assigns work to your technician profile."
                jobs={activeJobs}
                jobStats={jobStats}
                loading={loading}
                message={message}
                scheduleDiagnostics={scheduleDiagnostics}
                onRefresh={onRefresh}
                onOpenDetails={onOpenDetails}
                title="Assigned Jobs"
                todayJobs={todayJobs}
                futureJobs={futureJobs}
            />
        );
    }

    if (activeView === 'history') {
        return (
            <AssignedScheduleJobsSection
                emptyTitle="No job history yet"
                emptyMessage="Completed or past assigned work will collect here."
                jobs={historyJobs}
                jobStats={jobStats}
                loading={loading}
                message={message}
                onRefresh={onRefresh}
                onOpenDetails={onOpenDetails}
                title="History"
            />
        );
    }

    if (activeView === 'estimates') {
        return (
            <TechOSEstimateWorkspacePanel
                activeCompanyId={activeCompanyId}
                techOSTheme={techOSTheme}
                onOpenEstimateWorkspace={onOpenEstimateWorkspace}
            />
        );
    }

    if (activeView === 'sales') {
        return (
            <TechOSModulePlaceholder
                title="Sales"
                message="Sales totals and technician performance will appear here after invoice and closeout tracking are connected."
            />
        );
    }

    if (activeView === 'messages') {
        return (
            <TechOSModulePlaceholder
                title="Messages"
                message="Customer, office, and dispatch updates will appear here when the messaging thread is connected."
            />
        );
    }

    if (activeView === 'time-clock') {
        return (
            <TechOSModulePlaceholder
                title="Time Clock"
                message="Clock in, breaks, and clock out will live here in a later TechOS pass."
            />
        );
    }

    if (activeView === 'van-inventory') {
        return (
            <TechOSModulePlaceholder
                title="Van Inventory"
                message="Truck stock, parts used, and restock requests will live here once inventory is connected."
            />
        );
    }

    return (
        <AssignedScheduleJobsSection
            emptyTitle="No active assigned jobs"
            emptyMessage="Jobs appear here when Dispatch assigns work to your technician profile."
            jobs={activeJobs}
            jobStats={jobStats}
            loading={loading}
            message={message}
            scheduleDiagnostics={scheduleDiagnostics}
            onRefresh={onRefresh}
            onOpenDetails={onOpenDetails}
            title="Jobs"
            todayJobs={todayJobs}
            futureJobs={futureJobs}
        />
    );
}

function TechOSModulePlaceholder({ title, message }: { title: string; message: string }) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={assignedJobsSectionStyle}>
            <Text style={[sectionTitleStyle, { color: theme.colors.text, marginBottom: 4 }]}>{title}</Text>
            <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                <Text style={[clientNameStyle, { color: theme.colors.text }]}>Coming soon</Text>
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
            </View>
        </ThemedCard>
    );
}

function TechOSEstimateWorkspacePanel({
    activeCompanyId,
    techOSTheme,
    onOpenEstimateWorkspace,
}: {
    activeCompanyId: string;
    techOSTheme: TechOSThemePalette;
    onOpenEstimateWorkspace: () => void;
}) {
    const variant = resolveTechOSDashboardVariant('estimates', techOSTheme.id);

    return (
        <ThemedCard
            style={[
                assignedJobsSectionStyle,
                {
                    backgroundColor: variant.backgroundColor,
                    borderColor: variant.borderColor,
                },
            ]}
        >
            <View style={[techSectionAccentStyle, { backgroundColor: variant.accentColor }]} />
            <Text style={[sectionTitleStyle, { color: techOSTheme.textColor, marginBottom: 4 }]}>Estimates & Invoices</Text>
            <Text style={[bodyTextStyle, { color: techOSTheme.mutedTextColor }]}>
                Open the existing estimate draft workspace for the current company. Job-scoped estimates start from an assigned job detail.
            </Text>
            <ThemedButton
                title="Open Estimate / Quote Workspace"
                variant="secondary"
                disabled={!activeCompanyId}
                onPress={onOpenEstimateWorkspace}
                style={assignedJobActionButtonStyle}
            />
            {!activeCompanyId && (
                <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                    Company context is required before estimates can open.
                </Text>
            )}
        </ThemedCard>
    );
}

function getAssignedJobDetailBackLabel(view: TechDashboardView) {
    if (view === 'schedule') return 'Back to Schedule';
    if (view === 'history') return 'Back to History';

    return 'Back to Jobs';
}

function TechJobCounter({ label, value }: { label: string; value: number }) {
    const { theme } = useTheme();

    return (
        <View style={[techJobCounterStyle, { borderColor: theme.colors.border }]}>
            <Text style={[techJobCounterValueStyle, { color: theme.colors.text }]}>{value}</Text>
            <Text style={[techJobCounterLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
        </View>
    );
}

function AssignedScheduleJobsSection({
    emptyMessage,
    emptyTitle,
    futureJobs,
    jobs,
    jobStats,
    loading,
    message,
    scheduleDiagnostics,
    todayJobs,
    onRefresh,
    onOpenDetails,
    title,
}: {
    emptyMessage: string;
    emptyTitle: string;
    futureJobs?: TechAssignedScheduleJob[];
    jobs: TechAssignedScheduleJob[];
    jobStats?: { closed: number; open: number; paused: number };
    loading: boolean;
    message: string;
    scheduleDiagnostics?: TechOSScheduleDiagnostics | null;
    todayJobs?: TechAssignedScheduleJob[];
    onRefresh: () => void;
    onOpenDetails?: (job: TechAssignedScheduleJob) => void;
    title: string;
}) {
    const { theme } = useTheme();
    const shouldShowTodayAndFuture = Boolean(todayJobs || futureJobs);
    const groupedJobCount = (todayJobs?.length || 0) + (futureJobs?.length || 0);
    const visibleJobCount = shouldShowTodayAndFuture ? groupedJobCount : jobs.length;

    return (
        <ThemedCard style={assignedJobsSectionStyle}>
            <View style={assignedJobsHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text, marginBottom: 4 }]}>{title}</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        {visibleJobCount === 1 ? '1 assigned job' : `${visibleJobCount} assigned jobs`}
                    </Text>
                </View>
                <ThemedButton
                    title={loading ? 'Checking...' : 'Refresh'}
                    variant="secondary"
                    onPress={onRefresh}
                    disabled={loading}
                    style={refreshButtonStyle}
                />
            </View>

            {!!message && (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                </View>
            )}

            {!!jobStats && (
                <View style={techJobCounterRowStyle}>
                    <TechJobCounter label="Open Jobs" value={jobStats.open} />
                    <TechJobCounter label="Paused Jobs" value={jobStats.paused} />
                    <TechJobCounter label="Closed Jobs" value={jobStats.closed} />
                </View>
            )}

            {loading && visibleJobCount === 0 ? (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>Checking assigned jobs...</Text>
                </View>
            ) : visibleJobCount === 0 ? (
                <View>
                    <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                        <Text style={[clientNameStyle, { color: theme.colors.text }]}>{emptyTitle}</Text>
                        <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                            {emptyMessage}
                        </Text>
                    </View>
                    {isTechOSDevelopment() && !!scheduleDiagnostics && (
                        <TechOSScheduleDebugNote
                            diagnostics={scheduleDiagnostics}
                            todayCount={todayJobs?.length || 0}
                            upcomingCount={futureJobs?.length || 0}
                        />
                    )}
                </View>
            ) : shouldShowTodayAndFuture ? (
                <View style={calendarDayListStyle}>
                    {!!todayJobs?.length && (
                        <AssignedScheduleJobGroup
                            title="Today’s Jobs"
                            jobs={todayJobs}
                            onOpenDetails={onOpenDetails}
                        />
                    )}
                    {!!futureJobs?.length && (
                        <AssignedScheduleJobGroup
                            title="Upcoming Jobs"
                            jobs={futureJobs}
                            onOpenDetails={onOpenDetails}
                        />
                    )}
                </View>
            ) : (
                <View style={assignedJobGridStyle}>
                    {jobs.map((job) => (
                        <AssignedScheduleJobCard key={job.slot.id} job={job} onOpenDetails={onOpenDetails} />
                    ))}
                </View>
            )}
        </ThemedCard>
    );
}

function AssignedScheduleJobGroup({
    jobs,
    onOpenDetails,
    title,
}: {
    jobs: TechAssignedScheduleJob[];
    onOpenDetails?: (job: TechAssignedScheduleJob) => void;
    title: string;
}) {
    const { theme } = useTheme();

    return (
        <View style={[calendarDayBlockStyle, { borderColor: theme.colors.border }]}>
            <View style={calendarDayHeaderStyle}>
                <Text style={[calendarDayTitleStyle, { color: theme.colors.text }]}>{title}</Text>
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                    {jobs.length} job{jobs.length === 1 ? '' : 's'}
                </Text>
            </View>
            <View style={assignedJobGridStyle}>
                {jobs.map((job) => (
                    <AssignedScheduleJobCard key={job.slot.id} job={job} onOpenDetails={onOpenDetails} />
                ))}
            </View>
        </View>
    );
}

function TechOSScheduleDebugNote({
    diagnostics,
    todayCount,
    upcomingCount,
}: {
    diagnostics: TechOSScheduleDiagnostics;
    todayCount: number;
    upcomingCount: number;
}) {
    const { theme } = useTheme();
    const rows = [
        `auth_user=${shortId(diagnostics.authUserId)} email=${diagnostics.authEmail || 'unknown'}`,
        `company_id=${shortId(diagnostics.companyId)} company_user_id=${shortId(diagnostics.companyUserId)}`,
        `role=${formatLabel(diagnostics.role)} status=${formatStatus(diagnostics.status)}`,
        `query_error=${diagnostics.queryError || 'none'}`,
        `raw_slots=${diagnostics.rawSlotCount} normalized_slots=${diagnostics.normalizedSlotCount}`,
        `today_jobs=${todayCount} upcoming_jobs=${upcomingCount}`,
        `window=${formatDateTime(diagnostics.windowStart)} -> ${formatDateTime(diagnostics.windowEnd)}`,
    ];

    return (
        <View style={[techScheduleDebugNoteStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <Text style={[jobNumberStyle, { color: theme.colors.mutedText }]}>TechOS schedule debug</Text>
            {rows.map((row) => (
                <Text key={row} style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                    {row}
                </Text>
            ))}
        </View>
    );
}

function TechOSCalendarView({
    groups,
    loading,
    message,
    onRefresh,
    onOpenDetails,
}: {
    groups: Array<{ key: string; label: string; jobs: TechAssignedScheduleJob[] }>;
    loading: boolean;
    message: string;
    onRefresh: () => void;
    onOpenDetails: (job: TechAssignedScheduleJob) => void;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={assignedJobsSectionStyle}>
            <View style={assignedJobsHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text, marginBottom: 4 }]}>Schedule</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Today and upcoming work assigned to your technician profile.
                    </Text>
                </View>
                <ThemedButton
                    title={loading ? 'Checking...' : 'Refresh'}
                    variant="secondary"
                    onPress={onRefresh}
                    disabled={loading}
                    style={refreshButtonStyle}
                />
            </View>

            {!!message && (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                </View>
            )}

            {groups.length === 0 ? (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientNameStyle, { color: theme.colors.text }]}>No scheduled work yet</Text>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                        Scheduled jobs appear here when Dispatch assigns work to your technician profile.
                    </Text>
                </View>
            ) : (
                <View style={calendarDayListStyle}>
                    {groups.map((group) => (
                        <View key={group.key} style={[calendarDayBlockStyle, { borderColor: theme.colors.border }]}>
                            <View style={calendarDayHeaderStyle}>
                                <Text style={[calendarDayTitleStyle, { color: theme.colors.text }]}>{group.label}</Text>
                                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                                    {group.jobs.length} job{group.jobs.length === 1 ? '' : 's'}
                                </Text>
                            </View>
                            <View style={assignedJobGridStyle}>
                                {group.jobs.map((job) => (
                                    <AssignedScheduleJobCard key={job.slot.id} job={job} compact onOpenDetails={onOpenDetails} />
                                ))}
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </ThemedCard>
    );
}

function AssignedScheduleJobCard({
    compact = false,
    job,
    onOpenDetails,
}: {
    compact?: boolean;
    job: TechAssignedScheduleJob;
    onOpenDetails?: (job: TechAssignedScheduleJob) => void;
}) {
    const { theme } = useTheme();
    const title = getAssignedJobTitle(job);
    const location = getAssignedJobLocation(job);

    return (
        <View
            style={[
                assignedJobCardStyle,
                compact && assignedJobCardCompactStyle,
                {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                },
            ]}
        >
            <View style={assignedJobTopRowStyle}>
                <Text style={[jobNumberStyle, { color: theme.colors.mutedText }]}>Assigned Work</Text>
                <Text style={[jobStatusBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {formatTechOSStatusLabel(job.slot.status || job.request?.status || 'scheduled')}
                </Text>
            </View>
            <Text style={[jobTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                {title}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                {formatScheduleRange(job.slot)}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                {location}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                {job.request?.issue_summary || job.slot.notes || 'No description provided.'}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Arrival: {formatArrivalWindow(job.slot)}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Priority: {formatLabel(job.slot.priority || job.request?.priority || 'normal')}
            </Text>
            {!!job.slot.tech_status_note && (
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                    Tech note: {job.slot.tech_status_note}
                </Text>
            )}
            {!!onOpenDetails && (
                <ThemedButton
                    title="Open Details"
                    variant="secondary"
                    onPress={() => onOpenDetails(job)}
                    style={assignedJobActionButtonStyle}
                />
            )}
        </View>
    );
}

function TechOSAssignedJobDetail({
    backLabel,
    closeoutForm,
    customStatusNote,
    estimateDraftCount,
    job,
    message,
    techOSTheme,
    onBack,
    onChangeCloseoutForm,
    onChangeCustomStatusNote,
    onCloseServiceVisit,
    onOpenClientHomeOS,
    onOpenEstimate,
    onOpenFullJob,
    onRunTechnicianNextJobStatusAction,
    onRunWorkflowAction,
    technicianStatusMessage,
    updating,
    workflowStatus,
}: {
    backLabel: string;
    closeoutForm: TechCloseoutForm;
    customStatusNote: string;
    estimateDraftCount: number;
    job: TechAssignedScheduleJob;
    message: string;
    techOSTheme: TechOSThemePalette;
    onBack: () => void;
    onChangeCloseoutForm: (updates: Partial<TechCloseoutForm>) => void;
    onChangeCustomStatusNote: (note: string) => void;
    onCloseServiceVisit: () => void;
    onOpenClientHomeOS: () => void;
    onOpenEstimate: () => void;
    onOpenFullJob: (job: TechAssignedScheduleJob) => void;
    onRunTechnicianNextJobStatusAction: (job: TechAssignedScheduleJob, action: TechnicianNextJobStatusAction, currentVisitStatus: string) => void;
    onRunWorkflowAction: (job: TechAssignedScheduleJob, action: TechWorkflowAction, statusNote?: string) => void;
    technicianStatusMessage: string;
    updating: boolean;
    workflowStatus: string;
}) {
    const { theme } = useTheme();
    const title = getAssignedJobTitle(job);
    const location = getAssignedJobLocation(job);
    const trimmedCustomStatusNote = customStatusNote.trim();
    const clientContext = getTechOSClientJobContext(job);
    const canOpenClientHomeOS = hasTechOSClientHomeContext(clientContext);
    const estimateActionLabel = getTechOSEstimateActionLabel(estimateDraftCount);

    return (
        <View style={[techJobDetailStyle, { borderColor: techOSTheme.panelBorderColor, backgroundColor: techOSTheme.panelBackgroundColor }]}>
            <View style={techJobDetailHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[jobNumberStyle, { color: techOSTheme.mutedTextColor }]}>Job Details</Text>
                    <Text style={[jobTitleStyle, { color: techOSTheme.textColor, marginBottom: 4 }]} numberOfLines={2}>
                        {title}
                    </Text>
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>{formatScheduleRange(job.slot)}</Text>
                </View>
                <ThemedButton
                    title={backLabel}
                    variant="secondary"
                    onPress={onBack}
                    style={techJobDetailBackButtonStyle}
                />
            </View>

            <TechOSDetailSection
                title="Customer / Home Information"
                description="Client HomeOS opens in provider mode for this company and property."
                techOSTheme={techOSTheme}
                variantKey="customer"
            >
                <View style={techJobDetailInfoGridStyle}>
                    <TechJobDetailInfo label="Home / Request" value={location} techOSTheme={techOSTheme} />
                    <TechJobDetailInfo label="Arrival Window" value={formatArrivalWindow(job.slot)} techOSTheme={techOSTheme} />
                    <TechJobDetailInfo label="Status" value={formatTechOSStatusLabel(workflowStatus)} techOSTheme={techOSTheme} />
                    <TechJobDetailInfo label="Priority" value={formatLabel(job.slot.priority || job.request?.priority || 'normal')} techOSTheme={techOSTheme} />
                    {!!job.request?.property_id && (
                        <TechJobDetailInfo label="Property" value={shortId(job.request.property_id)} techOSTheme={techOSTheme} />
                    )}
                    {!!job.request?.id && (
                        <TechJobDetailInfo label="Request" value={shortId(job.request.id)} techOSTheme={techOSTheme} />
                    )}
                    {!!job.slot.tech_status_note && (
                        <TechJobDetailInfo label="Tech Status Note" value={job.slot.tech_status_note} techOSTheme={techOSTheme} />
                    )}
                    {!!job.slot.visit_outcome && (
                        <TechJobDetailInfo label="Visit Outcome" value={getServiceVisitOutcomeLabel(job.slot.visit_outcome)} techOSTheme={techOSTheme} />
                    )}
                </View>
                <View style={techWorkflowActionGridStyle}>
                    <ThemedButton
                        title="Open Client HomeOS"
                        variant="secondary"
                        disabled={!canOpenClientHomeOS}
                        onPress={onOpenClientHomeOS}
                        style={techWorkflowActionButtonStyle}
                        textStyle={techWorkflowActionButtonTextStyle}
                    />
                    {!!job.slot.job_id && (
                        <ThemedButton
                            title="Open Full Job"
                            variant="secondary"
                            onPress={() => onOpenFullJob(job)}
                            style={techWorkflowActionButtonStyle}
                            textStyle={techWorkflowActionButtonTextStyle}
                        />
                    )}
                </View>
                {!canOpenClientHomeOS && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                        Client HomeOS needs an assigned request with a property id.
                    </Text>
                )}
            </TechOSDetailSection>

            <TechOSDetailSection
                title="Request Summary"
                description="The homeowner or dispatch request context for this appointment."
                techOSTheme={techOSTheme}
                variantKey="request"
            >
                <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                    {job.request?.issue_summary || job.slot.notes || 'No request summary provided.'}
                </Text>
                <ServiceRequestMediaGallery
                    serviceRequestId={job.request?.id || job.slot.service_request_id}
                    title="Homeowner photos and videos"
                />
            </TechOSDetailSection>

            <TechOSDetailSection
                title="Technician Status / Next Job"
                description="These controls are technician-level signals. They do not change this customer's visit status."
                techOSTheme={techOSTheme}
                variantKey="status"
            >
                <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                    These controls are technician-level signals. They do not change this customer's visit status.
                </Text>
                <View style={techWorkflowActionGridStyle}>
                    {TECHNICIAN_NEXT_JOB_STATUS_ACTIONS.map((action) => (
                        <ThemedButton
                            key={action.key}
                            title={action.label}
                            variant="secondary"
                            disabled={updating}
                            onPress={() => onRunTechnicianNextJobStatusAction(job, action, workflowStatus)}
                            style={techWorkflowActionButtonStyle}
                            textStyle={techWorkflowActionButtonTextStyle}
                        />
                    ))}
                </View>
                {!!technicianStatusMessage && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                        {technicianStatusMessage}
                    </Text>
                )}
            </TechOSDetailSection>

            <TechOSDetailSection
                title="Technician Workflow"
                description="Current-visit status actions for this assigned appointment."
                techOSTheme={techOSTheme}
                variantKey="workflow"
            >
                <View style={techWorkflowActionGridStyle}>
                    {TECH_WORKFLOW_ACTIONS.map((action) => {
                        const active = normalizeStatus(workflowStatus) === normalizeStatus(action.status);

                        return (
                            <ThemedButton
                                key={action.key}
                                title={updating && !active ? 'Updating...' : action.label}
                                variant={active ? 'primary' : 'secondary'}
                                disabled={updating}
                                onPress={() => onRunWorkflowAction(job, action)}
                                style={techWorkflowActionButtonStyle}
                                textStyle={techWorkflowActionButtonTextStyle}
                            />
                        );
                    })}
                </View>
            </TechOSDetailSection>

            <TechOSDetailSection
                title="Job Status Note"
                description="Optional field note for dispatch and job coordination."
                techOSTheme={techOSTheme}
                variantKey="note"
            >
                <TextInput
                    value={customStatusNote}
                    onChangeText={onChangeCustomStatusNote}
                    placeholder="On my way to the store"
                    placeholderTextColor={techOSTheme.mutedTextColor}
                    multiline
                    style={[
                        techCustomStatusInputStyle,
                        {
                            borderColor: techOSTheme.panelBorderColor,
                            color: techOSTheme.textColor,
                        },
                    ]}
                />
                <ThemedButton
                    title="Set Custom Status"
                    variant="secondary"
                    disabled={updating || !trimmedCustomStatusNote}
                    onPress={() => onRunWorkflowAction(job, TECH_CUSTOM_STATUS_ACTION, trimmedCustomStatusNote)}
                    style={assignedJobActionButtonStyle}
                    textStyle={techWorkflowActionButtonTextStyle}
                />
            </TechOSDetailSection>

            <TechOSDetailSection
                title="Estimate / Quote Actions"
                description="Open the existing estimate draft for this company, property, and job context."
                techOSTheme={techOSTheme}
                variantKey="estimate"
            >
                <View style={techWorkflowActionGridStyle}>
                    <ThemedButton
                        title={estimateActionLabel}
                        variant="secondary"
                        disabled={!clientContext.companyId || !clientContext.propertyId}
                        onPress={onOpenEstimate}
                        style={techWorkflowActionButtonStyle}
                        textStyle={techWorkflowActionButtonTextStyle}
                    />
                    <ThemedButton
                        title="Open Client HomeOS"
                        variant="secondary"
                        disabled={!canOpenClientHomeOS}
                        onPress={onOpenClientHomeOS}
                        style={techWorkflowActionButtonStyle}
                        textStyle={techWorkflowActionButtonTextStyle}
                    />
                </View>
                <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                    {estimateDraftCount > 0
                        ? `${estimateDraftCount} item${estimateDraftCount === 1 ? '' : 's'} already in this draft.`
                        : 'No items have been added to this job estimate yet.'}
                </Text>
            </TechOSDetailSection>

            <TechOSDetailSection
                title="Finish Visit"
                description="Choose the real visit outcome. This closes the current appointment and moves the request to the right queue."
                techOSTheme={techOSTheme}
                variantKey="finish"
            >
                <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                    Choose the real visit outcome. This closes the current appointment and moves the request to the right queue.
                </Text>
                <View style={techWorkflowActionGridStyle}>
                    {getTechnicianCloseoutOptions().map((option) => (
                        <ThemedButton
                            key={option.outcome}
                            title={option.label}
                            variant={closeoutForm.outcome === option.outcome ? 'primary' : 'secondary'}
                            disabled={updating || !isActiveScheduleSlot(job.slot.status)}
                            onPress={() => onChangeCloseoutForm({
                                outcome: option.outcome,
                                notifyHomeowner: option.homeownerDefault,
                            })}
                            style={techWorkflowActionButtonStyle}
                            textStyle={techWorkflowActionButtonTextStyle}
                        />
                    ))}
                </View>
                {!!closeoutForm.outcome && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                        {getServiceVisitOutcomeLabel(closeoutForm.outcome)}
                    </Text>
                )}
                <TextInput
                    value={closeoutForm.notes}
                    onChangeText={(notes) => onChangeCloseoutForm({ notes })}
                    placeholder="Work performed, reason, parts, or next action"
                    placeholderTextColor={techOSTheme.mutedTextColor}
                    multiline
                    style={[
                        techCustomStatusInputStyle,
                        {
                            borderColor: techOSTheme.panelBorderColor,
                            color: techOSTheme.textColor,
                        },
                    ]}
                />
                <TextInput
                    value={closeoutForm.nextActionDate}
                    onChangeText={(nextActionDate) => onChangeCloseoutForm({ nextActionDate })}
                    placeholder="Next action date, optional YYYY-MM-DD"
                    placeholderTextColor={techOSTheme.mutedTextColor}
                    style={[
                        techCustomStatusInputStyle,
                        {
                            borderColor: techOSTheme.panelBorderColor,
                            color: techOSTheme.textColor,
                            minHeight: 46,
                        },
                    ]}
                />
                <TextInput
                    value={closeoutForm.homeownerNote}
                    onChangeText={(homeownerNote) => onChangeCloseoutForm({ homeownerNote })}
                    placeholder="Optional homeowner-safe update"
                    placeholderTextColor={techOSTheme.mutedTextColor}
                    multiline
                    style={[
                        techCustomStatusInputStyle,
                        {
                            borderColor: techOSTheme.panelBorderColor,
                            color: techOSTheme.textColor,
                        },
                    ]}
                />
                <View style={techWorkflowActionGridStyle}>
                    <ThemedButton
                        title={closeoutForm.notifyHomeowner ? 'Homeowner Update On' : 'Homeowner Update Off'}
                        variant={closeoutForm.notifyHomeowner ? 'primary' : 'secondary'}
                        disabled={updating}
                        onPress={() => onChangeCloseoutForm({ notifyHomeowner: !closeoutForm.notifyHomeowner })}
                        style={techWorkflowActionButtonStyle}
                        textStyle={techWorkflowActionButtonTextStyle}
                    />
                    <ThemedButton
                        title={updating ? 'Closing Visit...' : 'Close Visit'}
                        disabled={updating || !closeoutForm.outcome || !isActiveScheduleSlot(job.slot.status)}
                        onPress={onCloseServiceVisit}
                        style={techWorkflowActionButtonStyle}
                        textStyle={techWorkflowActionButtonTextStyle}
                    />
                </View>
                {!isActiveScheduleSlot(job.slot.status) && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                        This visit is already closed.
                    </Text>
                )}
            </TechOSDetailSection>

            {!!message && (
                <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>{message}</Text>
            )}
        </View>
    );
}

function TechJobDetailInfo({
    label,
    techOSTheme,
    value,
}: {
    label: string;
    techOSTheme: TechOSThemePalette;
    value: string;
}) {
    return (
        <View style={[techJobDetailInfoStyle, { borderColor: techOSTheme.panelBorderColor }]}>
            <Text style={[techJobDetailInfoLabelStyle, { color: techOSTheme.mutedTextColor }]}>{label}</Text>
            <Text style={[techJobDetailInfoValueStyle, { color: techOSTheme.textColor }]} numberOfLines={2}>{value}</Text>
        </View>
    );
}

function TechOSDetailSection({
    children,
    description,
    techOSTheme,
    title,
    variantKey,
}: {
    children: ReactNode;
    description: string;
    techOSTheme: TechOSThemePalette;
    title: string;
    variantKey: TechOSJobDetailVisualKey;
}) {
    const variant = resolveTechOSJobDetailVariant(variantKey, techOSTheme.id);

    return (
        <View
            style={[
                techJobDetailSectionStyle,
                {
                    backgroundColor: variant.backgroundColor,
                    borderColor: variant.borderColor,
                },
            ]}
        >
            <View style={[techSectionAccentStyle, { backgroundColor: variant.accentColor }]} />
            <Text style={[jobAssignmentTitleStyle, { color: techOSTheme.textColor }]}>{title}</Text>
            <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>{description}</Text>
            {children}
        </View>
    );
}

function TechOSJobsBoard({
    activeTechnicians,
    assigningJobId,
    assignmentMessageByJob,
    canAssignTechnicians,
    clients,
    description,
    emptyMessage,
    expandedAssignmentJobs,
    groupedJobs,
    jobs,
    loading,
    message,
    onAssignTechnician,
    onOpenJob,
    onSelectTechnician,
    onToggleAssignment,
    propertiesById,
    selectedTechnicianByJob,
    title,
}: {
    activeTechnicians: CompanyUser[];
    assigningJobId: string | null;
    assignmentMessageByJob: Record<string, string>;
    canAssignTechnicians: boolean;
    clients: CompanyClient[];
    description: string;
    emptyMessage: string;
    expandedAssignmentJobs: Record<string, boolean>;
    groupedJobs: JobDateGroup[];
    jobs: TechOSJob[];
    loading: boolean;
    message: string;
    onAssignTechnician: (job: TechOSJob) => void;
    onOpenJob: (job: TechOSJob) => void;
    onSelectTechnician: (jobId: string, technicianId: string) => void;
    onToggleAssignment: (jobId: string) => void;
    propertiesById: Record<string, PropertyRecord>;
    selectedTechnicianByJob: Record<string, string>;
    title: string;
}) {
    const { theme } = useTheme();
    const clientsById = clients.reduce<Record<string, CompanyClient>>((accumulator, client) => {
        accumulator[client.id] = client;
        return accumulator;
    }, {});

    return (
        <View style={jobBoardSectionStyle}>
            <View style={jobBoardHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text, marginBottom: 4 }]}>{title}</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        {description}
                    </Text>
                </View>
            </View>

            {!!message && (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                </View>
            )}

            {loading ? (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>Loading jobs...</Text>
                </View>
            ) : jobs.length === 0 ? (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientNameStyle, { color: theme.colors.text }]}>No service jobs yet</Text>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                        {emptyMessage}
                    </Text>
                </View>
            ) : (
                groupedJobs.map((group) => (
                    <View key={group.key} style={jobDateSectionStyle}>
                        <Text style={[jobDateHeadingStyle, { color: theme.colors.text }]}>{group.label}</Text>
                        <View style={jobCardGridStyle}>
                            {group.jobs.map((job) => {
                                const linkedClient = job.company_property_client_id
                                    ? clientsById[job.company_property_client_id]
                                    : undefined;
                                const property = job.property_id ? propertiesById[job.property_id] : undefined;

                                return (
                                    <TechOSJobCard
                                        activeTechnicians={activeTechnicians}
                                        assigning={assigningJobId === job.id}
                                        assignmentExpanded={!!expandedAssignmentJobs[job.id]}
                                        assignmentMessage={assignmentMessageByJob[job.id] || ''}
                                        canAssignTechnicians={canAssignTechnicians}
                                        key={job.id}
                                        client={linkedClient}
                                        job={job}
                                        onAssignTechnician={onAssignTechnician}
                                        onOpenJob={onOpenJob}
                                        onSelectTechnician={onSelectTechnician}
                                        onToggleAssignment={onToggleAssignment}
                                        property={property}
                                        selectedTechnicianId={selectedTechnicianByJob[job.id] || ''}
                                    />
                                );
                            })}
                        </View>
                    </View>
                ))
            )}
        </View>
    );
}

function TechOSJobCard({
    activeTechnicians,
    assigning,
    assignmentExpanded,
    assignmentMessage,
    canAssignTechnicians,
    client,
    job,
    onAssignTechnician,
    onOpenJob,
    onSelectTechnician,
    onToggleAssignment,
    property,
    selectedTechnicianId,
}: {
    activeTechnicians: CompanyUser[];
    assigning: boolean;
    assignmentExpanded: boolean;
    assignmentMessage: string;
    canAssignTechnicians: boolean;
    client?: CompanyClient;
    job: TechOSJob;
    onAssignTechnician: (job: TechOSJob) => void;
    onOpenJob: (job: TechOSJob) => void;
    onSelectTechnician: (jobId: string, technicianId: string) => void;
    onToggleAssignment: (jobId: string) => void;
    property?: PropertyRecord;
    selectedTechnicianId: string;
}) {
    const { theme } = useTheme();
    const displayName = client?.display_name || property?.name || 'Home';
    const selectedTechnician = activeTechnicians.find((technician) => technician.id === selectedTechnicianId);

    return (
        <ThemedCard style={jobCardStyle}>
            <View style={jobCardTopRowStyle}>
                <Text style={[jobNumberStyle, { color: theme.colors.mutedText }]}>#{shortJobId(job.id)}</Text>
                <Text style={[jobStatusBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {formatStatus(job.status)}
                </Text>
            </View>
            <Text numberOfLines={2} style={[jobTitleStyle, { color: theme.colors.text }]}>
                {job.title || 'Service Visit'}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>Date: {formatDate(job.created_at)}</Text>
            <Text numberOfLines={1} style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Client: {displayName}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>Source: {formatSource(job.job_source)}</Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Assignments: {typeof job.assignment_count === 'number' ? job.assignment_count : 0}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>Sale: Not tracked yet</Text>
            {canAssignTechnicians && (
                <View style={[jobAssignmentBoxStyle, { borderColor: theme.colors.border }]}>
                    <View style={jobAssignmentHeaderStyle}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[jobAssignmentTitleStyle, { color: theme.colors.text }]}>Assign Technician</Text>
                            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                                {selectedTechnician ? getMemberDisplayName(selectedTechnician) : 'Choose an active technician'}
                            </Text>
                        </View>
                        <ThemedButton
                            title={assignmentExpanded ? 'Hide' : 'Choose'}
                            variant="secondary"
                            onPress={() => onToggleAssignment(job.id)}
                            style={jobAssignmentToggleStyle}
                        />
                    </View>

                    {assignmentExpanded && (
                        <View style={technicianPickerStyle}>
                            {activeTechnicians.length === 0 ? (
                                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                                    No active technicians are available for this company.
                                </Text>
                            ) : (
                                activeTechnicians.map((technician) => {
                                    const selected = selectedTechnicianId === technician.id;

                                    return (
                                        <TouchableOpacity
                                            key={technician.id}
                                            onPress={() => onSelectTechnician(job.id, technician.id)}
                                            style={[
                                                technicianPickerRowStyle,
                                                {
                                                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                                                    backgroundColor: selected ? theme.colors.secondaryButton : 'transparent',
                                                },
                                            ]}
                                        >
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={[technicianPickerNameStyle, { color: theme.colors.text }]}>
                                                    {getMemberDisplayName(technician)}
                                                </Text>
                                                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                                                    {technician.email || shortId(technician.auth_user_id || technician.id)}
                                                </Text>
                                            </View>
                                            <Text style={[technicianPickerActionStyle, { color: theme.colors.primary }]}>
                                                {selected ? 'Selected' : 'Select'}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </View>
                    )}

                    <ThemedButton
                        title={assigning ? 'Assigning...' : 'Assign Technician'}
                        disabled={assigning || activeTechnicians.length === 0 || !selectedTechnicianId}
                        onPress={() => onAssignTechnician(job)}
                        style={clientActionButtonStyle}
                    />
                    {!!assignmentMessage && (
                        <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                            {assignmentMessage}
                        </Text>
                    )}
                </View>
            )}
            <ThemedButton
                title="Open Job"
                variant="secondary"
                onPress={() => onOpenJob(job)}
                style={clientActionButtonStyle}
            />
        </ThemedCard>
    );
}

function AssignedClientsCard({
    clients,
    creatingJobClientId,
    expanded,
    jobs,
    propertiesById,
    message,
    onStartServiceJob,
    onToggleExpanded,
}: {
    clients: CompanyClient[];
    creatingJobClientId: string | null;
    expanded: boolean;
    jobs: TechOSJob[];
    propertiesById: Record<string, PropertyRecord>;
    message: string;
    onStartServiceJob: (client: CompanyClient, property?: PropertyRecord) => void;
    onToggleExpanded: () => void;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={assignedClientsCardStyle}>
            <View style={clientSectionHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[workflowTitleStyle, { color: theme.colors.text }]}>Assigned Clients</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Secondary view with safe basic client and home profile details.
                    </Text>
                </View>
                <ThemedButton
                    title={expanded ? 'Hide Clients' : `Show Clients (${clients.length})`}
                    variant="secondary"
                    onPress={onToggleExpanded}
                    style={toggleButtonStyle}
                />
            </View>

            {!!message && (
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
            )}

            {!expanded ? (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                        Client list and test job creation are collapsed to keep the technician board focused on jobs.
                    </Text>
                </View>
            ) : clients.length === 0 ? (
                message ? null : (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientNameStyle, { color: theme.colors.text }]}>No assigned clients yet</Text>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                        Homes will appear here after a homeowner chooses this company as a provider.
                    </Text>
                </View>
                )
            ) : (
                <View style={clientListStyle}>
                    {clients.map((client) => (
                        <ClientRow
                            key={client.id}
                            client={client}
                            creating={creatingJobClientId === client.id}
                            disabled={creatingJobClientId !== null}
                            openJobCount={countOpenJobsForClient(jobs, client)}
                            property={propertiesById[client.property_id]}
                            onStartServiceJob={onStartServiceJob}
                        />
                    ))}
                </View>
            )}
        </ThemedCard>
    );
}

function ClientRow({
    client,
    creating,
    disabled,
    openJobCount,
    property,
    onStartServiceJob,
}: {
    client: CompanyClient;
    creating: boolean;
    disabled: boolean;
    openJobCount: number;
    property?: PropertyRecord;
    onStartServiceJob: (client: CompanyClient, property?: PropertyRecord) => void;
}) {
    const { theme } = useTheme();
    const displayName = client.display_name || property?.name || 'Home';
    const linkedAt = client.connected_at || client.first_requested_at || client.created_at;
    const address = formatAddress(property);

    return (
        <View style={[clientRowStyle, { borderColor: theme.colors.border }]}>
            <Text style={[clientNameStyle, { color: theme.colors.text }]}>{displayName}</Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Status: {formatStatus(client.status)}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                {address || 'Home profile details are not available yet.'}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Source: {formatSource(client.source)}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Linked: {formatDate(linkedAt)}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Open jobs: {openJobCount}
            </Text>
            <ThemedButton
                title={openJobCount > 0 ? 'Existing Job Open' : creating ? 'Creating Test Job...' : 'Create Test Job'}
                variant="secondary"
                disabled={disabled || openJobCount > 0}
                onPress={() => onStartServiceJob(client, property)}
                style={clientActionButtonStyle}
            />
            <Text style={[testActionNoteStyle, { color: theme.colors.mutedText }]}>
                Test/admin action until ManagementOS dispatch creates production jobs.
            </Text>
        </View>
    );
}

function isTechnicianRole(role?: string | null) {
    return isTechnicianCompanyRole(role);
}

function isAssignableTechnicianRole(role?: string | null) {
    return isTechnicianRole(role);
}

function isActiveStatus(status?: string | null) {
    return isActiveCompanyStatus(status);
}

async function loadCompanyMembers(companyId: string): Promise<{
    data: CompanyUser[];
    error: { message: string } | null;
}> {
    let rpcData: unknown = [];
    let rpcErrorMessage = '';

    try {
        const rpcResult = await supabase.rpc('get_company_users_for_management', {
            p_company_id: companyId,
        });
        rpcData = rpcResult.data || [];
        rpcErrorMessage = rpcResult.error?.message || '';
    } catch (error) {
        rpcErrorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
    }

    if (!rpcErrorMessage) {
        return {
            data: normalizeCompanyUsers(rpcData),
            error: null,
        };
    }

    let directData: unknown = [];
    let directErrorMessage = '';

    try {
        const directResult = await supabase
            .from('company_users')
            .select('id, company_id, auth_user_id, full_name, email, role, status, created_at')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });
        directData = directResult.data || [];
        directErrorMessage = directResult.error?.message || '';
    } catch (error) {
        directErrorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
    }

    if (directErrorMessage) {
        return {
            data: [],
            error: {
                message: `${normalizeServiceErrorMessage(directErrorMessage)}. Management RPC fallback also failed: ${normalizeServiceErrorMessage(rpcErrorMessage)}`,
            },
        };
    }

    return {
        data: normalizeCompanyUsers(directData),
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

async function loadScheduleServiceRequests(companyId: string, slots: TechScheduleSlot[]): Promise<{
    requestsById: Record<string, TechServiceRequest>;
    message: string;
}> {
    const requestIds = Array.from(new Set(slots.map((slot) => slot.service_request_id).filter(Boolean))) as string[];

    if (requestIds.length === 0) {
        return { requestsById: {}, message: '' };
    }

    const { data, error } = await supabase
        .from('service_requests')
        .select('id, company_id, property_id, company_property_client_id, request_type, status, priority, issue_summary, created_at, converted_job_id, converted_at')
        .eq('company_id', companyId)
        .in('id', requestIds);

    if (error) {
        return {
            requestsById: {},
            message: `Assigned jobs loaded, but request details could not load: ${normalizeServiceErrorMessage(error.message)}`,
        };
    }

    const requestsById = normalizeTechServiceRequests(data).reduce<Record<string, TechServiceRequest>>((accumulator, request) => {
        accumulator[request.id] = request;
        return accumulator;
    }, {});

    return { requestsById, message: '' };
}

function normalizeScheduleSlots(data: unknown): TechScheduleSlot[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                id: readStringField(record, 'id') || '',
                company_id: readStringField(record, 'company_id') || '',
                job_id: readStringField(record, 'job_id'),
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
                created_at: readStringField(record, 'created_at'),
                updated_at: readStringField(record, 'updated_at'),
            };
        })
        .filter((slot) => slot.id && slot.company_id && slot.technician_company_user_id);
}

function normalizeTechServiceRequests(data: unknown): TechServiceRequest[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                id: readStringField(record, 'id') || '',
                company_id: readStringField(record, 'company_id') || '',
                property_id: readStringField(record, 'property_id'),
                company_property_client_id: readStringField(record, 'company_property_client_id'),
                request_type: readStringField(record, 'request_type'),
                status: readStringField(record, 'status'),
                priority: readStringField(record, 'priority'),
                issue_summary: readStringField(record, 'issue_summary'),
                created_at: readStringField(record, 'created_at'),
                converted_job_id: readStringField(record, 'converted_job_id'),
                converted_at: readStringField(record, 'converted_at'),
            };
        })
        .filter((request) => request.id && request.company_id);
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function readNumberField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getMemberDisplayName(member?: CompanyUser | null) {
    if (!member) return 'Technician';

    return member.full_name || member.email || `Technician ${shortId(member.auth_user_id || member.id)}`;
}

function getFriendlyAssignmentMessage(message?: string | null) {
    if (message === HOMEOS_SERVICE_ERROR_MESSAGE || isFetchFailureMessage(message)) {
        return HOMEOS_SERVICE_ERROR_MESSAGE;
    }

    const normalized = normalizeStatus(message);

    if (normalized.includes('not authorized')) {
        return 'You are not authorized to assign technicians for this company.';
    }

    if (normalized.includes('not found')) {
        return 'That technician or job is no longer available for assignment.';
    }

    return message ? `Could not assign technician: ${message}` : 'Could not assign technician right now.';
}

function normalizeServiceErrorMessage(message?: string | null) {
    const cleanMessage = String(message || '').trim();

    if (!cleanMessage || isFetchFailureMessage(cleanMessage)) {
        return HOMEOS_SERVICE_ERROR_MESSAGE;
    }

    return cleanMessage;
}

function isFetchFailureMessage(message?: string | null) {
    const normalizedMessage = String(message || '').toLowerCase();

    return (
        normalizedMessage.includes('failed to fetch') ||
        normalizedMessage.includes('network request failed') ||
        normalizedMessage.includes('fetch failed') ||
        normalizedMessage.includes('load failed') ||
        normalizedMessage.includes('networkerror')
    );
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    return HOMEOS_SERVICE_ERROR_MESSAGE;
}

async function loadPlatformAdminStatus(userId: string) {
    const [profileResult, platformAdminResult] = await Promise.allSettled([
        supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .limit(1),
        supabase.rpc('homeos_is_platform_admin'),
    ]);

    const profileData = profileResult.status === 'fulfilled' && !profileResult.value.error
        ? profileResult.value.data || []
        : [];
    const isRpcPlatformAdmin = platformAdminResult.status === 'fulfilled' &&
        !platformAdminResult.value.error &&
        platformAdminResult.value.data === true;

    return {
        isPlatformAdmin: isRpcPlatformAdmin || isPlatformAdminProfile(profileData[0] as PlatformProfile | undefined),
    };
}

function isPlatformAdminProfile(profile?: PlatformProfile | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

function normalizeRole(role?: string | null) {
    return normalizeCompanyRole(role);
}

function formatLabel(value?: string | null) {
    return String(value || 'unknown')
        .trim()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function formatAddress(property?: PropertyRecord) {
    if (!property) return '';

    const street = property.address || property.address_line_1;
    const postalCode = property.zip || property.postal_code;

    return [street, property.city, property.state, postalCode].filter(Boolean).join(', ');
}

function formatStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    if (normalized === 'active') return 'Active';
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'archived') return 'Archived';

    return normalized ? formatLabel(normalized) : 'Unknown';
}

function formatTechOSStatusLabel(status?: string | null) {
    const normalized = normalizeStatus(status);
    const labels: Record<string, string> = {
        scheduled: 'Scheduled',
        on_my_way: 'On My Way',
        arrived: 'Arrived',
        in_progress: 'In Progress',
        estimate_needed: 'Estimate Needed',
        completed: 'Completed',
        closed: 'Closed',
        cancelled: 'Cancelled',
        canceled: 'Cancelled',
        archived: 'Archived',
        waiting_for_parts: 'Waiting for Parts',
        needs_follow_up: 'Needs Follow-Up',
        return_visit_required: 'Return Visit Required',
        on_hold: 'On Hold',
        customer_no_show: 'Customer No-Show',
        unable_to_complete: 'Unable to Complete',
        running_late: 'Running Late',
        available: 'Available',
        custom: 'Custom',
    };

    return labels[normalized] || formatStatus(status);
}

function formatSource(source?: string | null) {
    const normalized = normalizeStatus(source);

    if (normalized === 'homeowner_provider_request') return 'Homeowner selected';
    if (normalized === 'connection_code') return 'Connection code';
    if (normalized === 'techos_client') return 'TechOS client';
    if (normalized === 'manual') return 'Manual';

    return normalized ? formatLabel(normalized) : 'Not specified';
}

function formatDate(value?: string | null) {
    if (!value) return 'Not available';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Not available';
    }

    return date.toLocaleDateString();
}

function formatDateGroup(value?: string | null) {
    if (!value) return 'Unscheduled';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Unscheduled';
    }

    return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function groupJobsByDate(jobs: TechOSJob[]): JobDateGroup[] {
    const groups = jobs.reduce<Record<string, JobDateGroup>>((accumulator, job) => {
        const date = job.created_at ? new Date(job.created_at) : null;
        const key = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : 'unscheduled';

        if (!accumulator[key]) {
            accumulator[key] = {
                key,
                label: key === 'unscheduled' ? 'Unscheduled' : formatDateGroup(job.created_at),
                jobs: [],
            };
        }

        accumulator[key].jobs.push(job);
        return accumulator;
    }, {});

    return Object.values(groups).sort((first, second) => {
        if (first.key === 'unscheduled') return 1;
        if (second.key === 'unscheduled') return -1;
        return second.key.localeCompare(first.key);
    });
}

function groupAssignedScheduleJobsByDate(jobs: TechAssignedScheduleJob[]) {
    const groups = jobs.reduce<Record<string, { key: string; label: string; jobs: TechAssignedScheduleJob[] }>>((accumulator, job) => {
        const key = getDateKey(job.slot.start_at) || 'unscheduled';

        if (!accumulator[key]) {
            accumulator[key] = {
                key,
                label: key === 'unscheduled' ? 'Unscheduled' : formatDateGroup(job.slot.start_at),
                jobs: [],
            };
        }

        accumulator[key].jobs.push(job);
        return accumulator;
    }, {});

    return Object.values(groups).sort((first, second) => {
        if (first.key === 'unscheduled') return 1;
        if (second.key === 'unscheduled') return -1;
        return first.key.localeCompare(second.key);
    });
}

function isTodayDate(value?: string | null) {
    const key = getDateKey(value);

    return Boolean(key && key === getDateKey(new Date().toISOString()));
}

function isTechOSDevelopment() {
    return typeof __DEV__ !== 'undefined' && __DEV__;
}

function logTechOSDebug(label: string, payload: unknown) {
    if (!isTechOSDevelopment()) return;

    console.log(`[techos-debug] ${label}`, payload);
}

function isFutureDate(value?: string | null) {
    const key = getDateKey(value);
    const todayKey = getDateKey(new Date().toISOString());

    return Boolean(key && todayKey && key > todayKey);
}

function isCurrentFutureActiveScheduleJob(slot: TechScheduleSlot) {
    return isActiveScheduleSlot(slot.status) && (isTodayDate(slot.start_at) || isFutureDate(slot.start_at));
}

function isActiveUpcomingScheduleJob(slot: TechScheduleSlot) {
    if (!isActiveScheduleSlot(slot.status)) return false;

    const endMs = slot.end_at ? new Date(slot.end_at).getTime() : Number.NaN;
    const startMs = slot.start_at ? new Date(slot.start_at).getTime() : Number.NaN;
    const todayStartMs = getStartOfToday().getTime();

    if (Number.isFinite(endMs)) return endMs >= todayStartMs;
    if (Number.isFinite(startMs)) return startMs >= todayStartMs;

    return true;
}

function findUpcomingTimingPromptJob(jobs: TechAssignedScheduleJob[]) {
    const now = new Date();

    if (isBeforeTechnicianTimingPromptStart(now)) return null;

    const activeCurrentJob = jobs.find((job) => (
        isCurrentTechnicianActiveStatus(job.slot.status) &&
        isJobInProgressWindow(job.slot, now)
    ));

    if (!activeCurrentJob) return null;

    return jobs
        .filter((job) => (
            job.slot.id !== activeCurrentJob.slot.id &&
            isActiveScheduleSlot(job.slot.status) &&
            !isCurrentTechnicianStartedStatus(job.slot.status) &&
            isJobApproachingWithinHours(job.slot, now, 2)
        ))
        .sort((first, second) => getSortableTime(first.slot.arrival_window_start || first.slot.start_at) - getSortableTime(second.slot.arrival_window_start || second.slot.start_at))[0] || null;
}

function isBeforeTechnicianTimingPromptStart(now: Date) {
    return now.getHours() < 10;
}

function isCurrentTechnicianActiveStatus(status?: string | null) {
    return ['arrived', 'in_progress'].includes(normalizeStatus(status));
}

function isCurrentTechnicianStartedStatus(status?: string | null) {
    return ['on_my_way', 'arrived', 'in_progress', 'completed'].includes(normalizeStatus(status));
}

function isJobInProgressWindow(slot: TechScheduleSlot, now: Date) {
    const start = parseOptionalDate(slot.start_at);
    const end = parseOptionalDate(slot.end_at);

    if (start && start > now) return false;
    if (end && end < now && normalizeStatus(slot.status) !== 'in_progress') return false;

    return true;
}

function isJobApproachingWithinHours(slot: TechScheduleSlot, now: Date, hours: number) {
    const arrivalStart = parseOptionalDate(slot.arrival_window_start || slot.start_at);

    if (!arrivalStart || arrivalStart <= now) return false;

    return arrivalStart.getTime() - now.getTime() <= hours * 60 * 60 * 1000;
}

function isActiveScheduleSlot(status?: string | null) {
    const normalized = normalizeStatus(status);

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
    ].includes(normalized);
}

function createDefaultTechCloseoutForm(): TechCloseoutForm {
    return {
        outcome: '',
        notes: '',
        homeownerNote: '',
        nextActionDate: '',
        notifyHomeowner: false,
    };
}

function parseCloseoutDate(value: string) {
    const trimmed = value.trim();

    if (!trimmed) return null;

    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
        ? new Date(`${trimmed}T09:00:00`)
        : new Date(trimmed);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getAssignedJobTitle(job: TechAssignedScheduleJob) {
    const requestType = formatLabel(job.request?.request_type || 'Service Request');
    const summary = job.request?.issue_summary?.trim();

    return summary || requestType || 'Assigned service request';
}

function getAssignedJobLocation(job: TechAssignedScheduleJob) {
    if (job.property?.name) return job.property.name;
    const propertyAddress = formatAddress(job.property || undefined);
    if (propertyAddress) return propertyAddress;
    if (job.request?.property_id) return 'Customer home';
    if (job.slot.service_request_id) return 'Assigned request';

    return 'Assigned schedule slot';
}

function getTechOSClientJobContext(job: TechAssignedScheduleJob): TechOSClientJobContext {
    return {
        companyId: job.slot.company_id || job.request?.company_id || '',
        propertyId: job.request?.property_id || null,
        serviceRequestId: job.request?.id || job.slot.service_request_id || null,
        scheduleSlotId: job.slot.id || null,
        jobId: job.slot.job_id || job.request?.converted_job_id || null,
    };
}

function formatScheduleRange(slot: TechScheduleSlot) {
    const start = formatDateTime(slot.start_at);
    const end = formatTime(slot.end_at);

    if (start === 'Unscheduled') return start;
    if (!slot.end_at) return start;

    return `${start} - ${end}`;
}

function formatArrivalWindow(slot: TechScheduleSlot) {
    if (!slot.arrival_window_start || !slot.arrival_window_end) return 'Exact or not set';

    return `${formatTime(slot.arrival_window_start)} - ${formatTime(slot.arrival_window_end)}`;
}

function formatDateTime(value?: string | null) {
    if (!value) return 'Unscheduled';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unscheduled';

    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatTime(value?: string | null) {
    if (!value) return 'Not set';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not set';

    return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
}

function parseOptionalDate(value?: string | null) {
    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function getSortableTime(value?: string | null) {
    return parseOptionalDate(value)?.getTime() || 0;
}

function parsePositiveInteger(value: string) {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getDateKey(value?: string | null) {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function getStartOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}

function isOpenJobStatus(status?: string | null) {
    const normalized = normalizeStatus(status);
    return !isPausedJobStatus(normalized) && !isClosedJobStatus(normalized);
}

function isOpenScheduleSlotStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return [
        'tentative',
        'scheduled',
        'dispatched',
        'on_my_way',
        'arrived',
        'in_progress',
        'estimate_needed',
        'running_late',
        'available',
        'custom',
    ].includes(normalized);
}

function isPausedJobStatus(status?: string | null) {
    const normalized = normalizeStatus(status);
    return [
        'paused',
        'on_hold',
        'waiting',
        'waiting_on_customer',
        'blocked',
        'needs_follow_up',
        'return_visit_required',
        'waiting_for_parts',
        'customer_no_show',
        'missed_no_show',
        'unable_to_complete',
    ].includes(normalized);
}

function isClosedJobStatus(status?: string | null) {
    const normalized = normalizeStatus(status);
    return ['completed', 'complete', 'closed', 'done', 'cancelled', 'canceled', 'archived', 'void'].includes(normalized);
}

function countOpenJobsForClient(jobs: TechOSJob[], client: CompanyClient) {
    return jobs.filter((job) => {
        const sameClient = job.company_property_client_id && job.company_property_client_id === client.id;
        const sameProperty = job.property_id && job.property_id === client.property_id;
        return (sameClient || sameProperty) && isOpenJobStatus(job.status);
    }).length;
}

function shortJobId(id: string) {
    return String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase() || 'JOB';
}

function shortId(id: string) {
    return String(id || '').replace(/-/g, '').slice(0, 8) || 'unknown';
}

function normalizeStatus(status?: string | null) {
    return normalizeCompanyStatus(status);
}

function toCompanyUserAccess(access: CompanyRouteAccessRow): CompanyUserAccess {
    return {
        id: access.id || access.company_id,
        company_id: access.company_id,
        full_name: access.full_name,
        email: access.email,
        role: access.role,
        status: access.status,
        created_at: access.created_at,
        permissions: typeof access.can_view_techos === 'boolean'
            ? { can_view_techos: access.can_view_techos }
            : null,
    };
}

function firstParam(value?: string | string[]) {
    if (Array.isArray(value)) return value[0] || '';

    return value || '';
}

function replaceTechOSCompanyRoute(companyIdToOpen: string) {
    router.replace(`/techos?companyId=${encodeURIComponent(companyIdToOpen)}` as never);
}

function getInitials(value?: string | null) {
    const cleanValue = String(value || '').trim();
    const parts = cleanValue
        .split(/[\s@._-]+/)
        .filter(Boolean)
        .slice(0, 2);

    if (parts.length === 0) return 'T';

    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

function getReadableColor(color: string) {
    const normalized = color.replace('#', '');

    if (normalized.length !== 6) {
        return '#071B33';
    }

    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    return luma < 145 ? '#FFFFFF' : '#071B33';
}

const techProfileHeaderStyle = {
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden' as const,
    padding: 14,
    width: '100%' as const,
};

const techProfileAccentStyle = {
    borderRadius: 999,
    height: 4,
    marginBottom: 12,
    width: 72,
};

const techProfileTopRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    minWidth: 0,
};

const techAvatarStyle = {
    alignItems: 'center' as const,
    borderRadius: 24,
    height: 54,
    justifyContent: 'center' as const,
    width: 54,
};

const techAvatarTextStyle = {
    fontSize: 19,
    fontWeight: '900' as const,
};

const techProfileMainStyle = {
    flex: 1,
    minWidth: 180,
};

const techCompanyRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 3,
    minWidth: 0,
};

const techCompanyLogoStyle = {
    borderRadius: 8,
    height: 24,
    width: 24,
};

const techCompanyLogoFallbackStyle = {
    alignItems: 'center' as const,
    borderRadius: 8,
    height: 24,
    justifyContent: 'center' as const,
    width: 24,
};

const techCompanyLogoFallbackTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const techCompanyNameStyle = {
    flex: 1,
    fontSize: 12,
    fontWeight: '900' as const,
    minWidth: 0,
};

const techProfileNameStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
};

const techProfileMetaStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    marginTop: 3,
};

const techProfileSignOutButtonStyle = {
    flexBasis: 116,
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const techProfileStatsRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const techProfileStatStyle = {
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 116,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
};

const techProfileStatValueStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const techProfileStatLabelStyle = {
    fontSize: 11,
    fontWeight: '800' as const,
    marginTop: 2,
};

const techQuickActionRowStyle = {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 12,
};

const techQuickActionButtonStyle = {
    flexBasis: 170,
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
};

const techAppearancePanelStyle = {
    marginBottom: 16,
};

const techAppearanceGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 14,
};

const techAppearanceOptionStyle = {
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 220,
    flexGrow: 1,
    gap: 8,
    minWidth: 190,
    padding: 12,
};

const techAppearanceOptionSelectedStyle = {
    borderWidth: 2,
};

const techAppearanceSwatchRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 2,
};

const techAppearanceSwatchStyle = {
    borderRadius: 999,
    borderWidth: 1,
    height: 18,
    width: 18,
};

const messageCardStyle = {
    marginBottom: 18,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 10,
};

const summaryGridStyle = {
    width: '100%' as const,
    minWidth: 0,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 24,
};

const summaryCardStyle = {
    flex: 1,
    flexBasis: 220,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
};

const summaryValueStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const summaryTitleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    marginBottom: 8,
    marginTop: 4,
};

const assignmentBannerStyle = {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    paddingVertical: 14,
};

const assignmentBannerTextStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const timingPromptCardStyle = {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
};

const dashboardGridStyle = {
    width: '100%' as const,
    minWidth: 0,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 16,
};

const dashboardCardStyle = {
    flexBasis: 156,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minHeight: 112,
    minWidth: 0,
    padding: 13,
};

const dashboardCardAccentStyle = {
    borderRadius: 999,
    height: 4,
    marginBottom: 10,
    width: 44,
};

const dashboardCardValueStyle = {
    fontSize: 24,
    fontWeight: '900' as const,
};

const dashboardCardTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
    lineHeight: 19,
    marginTop: 5,
};

const dashboardCardNoteStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 16,
    marginTop: 6,
};

const assignedJobsSectionStyle = {
    marginBottom: 22,
};

const assignedJobsHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
};

const techJobCounterRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const techJobCounterStyle = {
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 110,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
};

const techJobCounterValueStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const techJobCounterLabelStyle = {
    fontSize: 11,
    fontWeight: '800' as const,
    marginTop: 2,
};

const refreshButtonStyle = {
    flexBasis: 130,
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '100%' as const,
};

const assignedJobGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 14,
    width: '100%' as const,
};

const assignedJobCardStyle = {
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: 250,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minHeight: 220,
    minWidth: 0,
    padding: 14,
};

const assignedJobCardCompactStyle = {
    flexBasis: 220,
    minHeight: 190,
};

const assignedJobActionButtonStyle = {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const techScheduleDebugNoteStyle = {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
};

const assignedJobTopRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
};

const techJobDetailStyle = {
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
};

const techSectionAccentStyle = {
    borderRadius: 999,
    height: 4,
    marginBottom: 10,
    width: 54,
};

const techJobDetailHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
};

const techJobDetailBackButtonStyle = {
    flexBasis: 132,
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '100%' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const techJobDetailInfoGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 12,
};

const techJobDetailInfoStyle = {
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 150,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    padding: 10,
};

const techJobDetailInfoLabelStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const techJobDetailInfoValueStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
    lineHeight: 19,
    marginTop: 3,
};

const techJobDetailSectionStyle = {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    marginTop: 12,
    padding: 12,
};

const techWorkflowActionGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 10,
};

const techWorkflowActionButtonStyle = {
    flexBasis: 150,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 11,
};

const techWorkflowActionButtonTextStyle = {
    fontSize: 12,
    lineHeight: 16,
};

const techCustomStatusInputStyle = {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 12,
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top' as const,
};

const calendarDayListStyle = {
    gap: 14,
    marginTop: 14,
};

const calendarDayBlockStyle = {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
};

const calendarDayHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    justifyContent: 'space-between' as const,
};

const calendarDayTitleStyle = {
    fontSize: 17,
    fontWeight: '900' as const,
};

const assignedClientsCardStyle = {
    maxWidth: '100%' as const,
    minWidth: 0,
    marginBottom: 16,
    width: '100%' as const,
};

const workflowTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const jobBoardSectionStyle = {
    marginBottom: 24,
    width: '100%' as const,
};

const jobBoardHeaderStyle = {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
    marginBottom: 12,
};

const jobDateSectionStyle = {
    marginBottom: 18,
};

const jobDateHeadingStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    marginBottom: 10,
};

const jobCardGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    width: '100%' as const,
};

const jobCardStyle = {
    flex: 1,
    flexBasis: 250,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minHeight: 230,
    minWidth: 0,
};

const jobCardTopRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
};

const jobNumberStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const jobStatusBadgeStyle = {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '900' as const,
    overflow: 'hidden' as const,
    paddingHorizontal: 9,
    paddingVertical: 5,
};

const jobTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    lineHeight: 24,
    marginBottom: 8,
};

const jobAssignmentBoxStyle = {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    padding: 10,
};

const jobAssignmentHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
    justifyContent: 'space-between' as const,
};

const jobAssignmentTitleStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
};

const jobAssignmentToggleStyle = {
    flexBasis: 94,
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '100%' as const,
};

const technicianPickerStyle = {
    gap: 8,
    marginTop: 10,
};

const technicianPickerRowStyle = {
    alignItems: 'center' as const,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 10,
    paddingVertical: 9,
};

const technicianPickerNameStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
};

const technicianPickerActionStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const clientSectionHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
};

const toggleButtonStyle = {
    flexBasis: 180,
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
};

const clientListStyle = {
    gap: 10,
    marginTop: 14,
};

const clientRowStyle = {
    maxWidth: '100%' as const,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
};

const emptyClientStateStyle = {
    maxWidth: '100%' as const,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
};

const clientNameStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};

const clientMetaTextStyle = {
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 19,
    marginTop: 5,
};

const clientActionButtonStyle = {
    marginTop: 12,
};

const testActionNoteStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 17,
    marginTop: 8,
};

const buttonRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 16,
};

const buttonStyle = {
    flexBasis: 180,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
};
