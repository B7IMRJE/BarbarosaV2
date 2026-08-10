import DictationTextInput from '@/components/input/DictationTextInput';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import TechnicianDispatchChat from '../../components/dispatch/TechnicianDispatchChat';
import HomeHeader from '../../components/HomeHeader';
import ServiceRequestMediaGallery from '../../components/serviceRequests/ServiceRequestMediaGallery';
import SignaturePad, { isDrawnSignature } from '../../components/signature-pad';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import GlassCard from '../../components/glass/GlassCard';
import {
    canAccessDispatch,
    canAccessTechOS,
    isActiveCompanyStatus,
    isTechnicianCompanyRole,
    normalizeCompanyStatus,
} from '../../lib/companyPermissions';
import { clearPendingCompanyInviteState } from '../../lib/companyInviteState';
import { getCompanyDisplayName } from '../../lib/companyDisplayName';
import { CompanyGlassDepthProvider } from '../../theme/glass-depth';
import {
    loadEstimateDraft,
    saveEstimateDraftContext,
} from '../../lib/estimateDraft';
import { inferEstimateCategoryFromDraft } from '../../lib/estimateOptions';
import { resolveEstimateOptionSession } from '../../lib/estimateSessions';
import {
    formatServiceRequestReference,
    getServiceRequestDisplayCode,
} from '../../lib/homeServiceRequests';
import { completeJobWorkflowFromTechOS } from '../../lib/jobWorkflow';
import { loadLoggedInUserCompanyAccess, type CompanyRouteAccessRow } from '../../lib/onboarding';
import {
    recordHomeownerTechnicianNoteUpdate,
    recordServiceRequestEvent,
} from '../../lib/serviceRequestActivity';
import {
    createStatusTransitionIdempotencyKey,
    recordServiceRequestVisitStatus,
} from '../../lib/serviceRequestStatusNotifications';
import {
    closeServiceVisit,
    getServiceVisitOutcomeLabel,
    getTechnicianCloseoutOptions,
    type ServiceVisitOutcome,
} from '../../lib/serviceVisitCloseout';
import { supabase } from '../../lib/supabase';
import { runTechnicianClockIn } from '../../lib/technician-clock-in';
import {
    formatTechnicianClock,
    formatTechnicianHours,
    getTechnicianOvertimeWarningState,
    REGULAR_SHIFT_SECONDS,
    getTechnicianShiftHourSummary,
} from '../../lib/technician-time-summary';
import {
    getSoldJobNextAction,
    loadSoldJobForScheduleSlot,
    loadSoldJobForServiceRequest,
    loadSoldJobsForTechnician,
    type SoldJobRecord,
} from '../../lib/soldJobs';
import {
    loadTechnicianTimeEntries,
    manageTechnicianTimeEntry,
    registerTechnicianDevice,
    requestClockInCorrection,
    requestClockOutCorrection,
    requestTimeApproval,
    setTechnicianClock,
    type TechnicianTimeEntry,
} from '../../lib/technicianTimeClock';
import {
    buildTechWorkflowStatusBySlotId,
    createTechnicianNextJobStatusNotice,
    formatTechWorkflowProgressState,
    formatTechWorkflowStatusText,
    getTechWorkflowPersistenceMismatchMessage,
    getTechWorkflowNextStepMessage,
    getNextJobAvailabilitySectionState,
    getTechWorkflowStatusFeedback,
    isTechOSWorksiteStage,
    isSecondaryTechWorkflowAction,
    resolveTechOSRouteSelection,
    resolveTechWorkflowVisibleStatus,
    resolveTechWorkflowActionPresentation,
    resolveTechWorkflowTransition,
    TECH_CUSTOM_STATUS_ACTION,
    TECH_JOB_STATUS_NOTE_PRESETS,
    TECHNICIAN_NEXT_JOB_STATUS_ACTIONS,
    type TechnicianNextJobStatusAction,
    type TechWorkflowAction,
    type TechWorkflowActionPresentation,
} from '../../lib/techosWorkflow';
import {
    buildTechOSEstimateRoute,
    buildTechOSProviderHomeRoute,
    getTechOSEstimateActionLabel,
    hasTechOSClientHomeContext,
    type TechOSClientJobContext,
    type TechOSDashboardVisualKey,
    type TechOSJobDetailVisualKey,
} from '../../lib/techosClientAccess';
import {
    TECHOS_JOB_WORKSPACE_SECTIONS,
    toggleTechOSJobWorkspaceSection,
    type TechOSJobWorkspaceSectionKey,
} from '../../lib/techosJobWorkspace';
import {
    resolveCompanyTechOSTheme,
    type TechOSThemePalette,
} from '../../lib/techosAppearance';
import {
    collapseTechOSAssignmentSlots,
    filterTechOSAssignmentSlots,
    getJobAssignmentRoleLabel,
    isOpenTechOSAssignmentStatus,
    isTechOSVisitCloseable,
    normalizeTechOSAssignmentCompanyUserIds,
    resolveDefaultJobAssignmentRole,
    resolveTechOSAssignmentCompanyUserIds,
    type JobAssignmentRole,
} from '../../lib/techosAssignments';
import {
    canScheduleCrewRoleControlWorkflow,
    getCompanyScheduleCrewRoleLabel,
    getScheduleAssignedSlotIds,
    getScheduleCrewForSlot,
    getScheduleRoleForCompanyUsers,
    normalizeCompanyScheduleOverview,
    type CompanyScheduleMeeting,
    type CompanyScheduleSlotAssignment,
} from '../../lib/companySchedule';
import { getTechnicianAssignmentDisplayName } from '../../lib/technicianDisplay';
import { useTheme } from '../../theme/useTheme';
import TechOSMessageThreadsPanel from './TechOSMessageThreadsPanel';

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
    glass_depth: number | null;
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
    crew_role?: string | null;
    crew?: CompanyScheduleSlotAssignment[];
};

type TechServiceRequest = {
    id: string;
    company_id: string;
    property_id: string | null;
    company_property_client_id: string | null;
    display_code: string | null;
    display_sequence: number | null;
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
    companyUserIds: string[];
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

type TechOSAccessMode = 'choosing' | 'working' | 'off_clock' | 'companion';

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
type TechOSTimeClockStep = 'overview' | 'lunch' | 'overtime' | 'clock-out' | 'correction' | 'day-submit' | 'history';

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
    const [technicianCompanyUserIds, setTechnicianCompanyUserIds] = useState<string[]>([]);
    const [company, setCompany] = useState<CompanyBrand | null>(null);
    const [clients, setClients] = useState<CompanyClient[]>([]);
    const [propertiesById, setPropertiesById] = useState<Record<string, PropertyRecord>>({});
    const [jobs, setJobs] = useState<TechOSJob[]>([]);
    const [assignedScheduleSlots, setAssignedScheduleSlots] = useState<TechScheduleSlot[]>([]);
    const [assignedScheduleMeetings, setAssignedScheduleMeetings] = useState<CompanyScheduleMeeting[]>([]);
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
    const [timeClockInitialStep, setTimeClockInitialStep] = useState<TechOSTimeClockStep>('overview');
    const [dashboardContentScrollRequest, setDashboardContentScrollRequest] = useState(0);
    const [activeTechnicians, setActiveTechnicians] = useState<CompanyUser[]>([]);
    const [expandedAssignmentJobs, setExpandedAssignmentJobs] = useState<Record<string, boolean>>({});
    const [selectedTechnicianByJob, setSelectedTechnicianByJob] = useState<Record<string, string>>({});
    const [selectedAssignmentRoleByJob, setSelectedAssignmentRoleByJob] = useState<Record<string, JobAssignmentRole>>({});
    const [assignmentMessageByJob, setAssignmentMessageByJob] = useState<Record<string, string>>({});
    const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
    const [authUserId, setAuthUserId] = useState('');
    const [authEmail, setAuthEmail] = useState('');
    const [signingOut, setSigningOut] = useState(false);
    const [accessMode, setAccessMode] = useState<TechOSAccessMode>('choosing');
    const [accessModeLoading, setAccessModeLoading] = useState(false);
    const [accessModeMessage, setAccessModeMessage] = useState('');
    const [technicianTimeEntries, setTechnicianTimeEntries] = useState<TechnicianTimeEntry[]>([]);
    const [technicianTimeEntriesLoaded, setTechnicianTimeEntriesLoaded] = useState(false);
    const [technicianTimeNow, setTechnicianTimeNow] = useState(() => Date.now());
    const [selectedAssignedJobId, setSelectedAssignedJobId] = useState('');
    const [dismissedAssignedJobId, setDismissedAssignedJobId] = useState('');
    const [routeOpenedAssignedJobId, setRouteOpenedAssignedJobId] = useState('');
    const [workflowStatusBySlotId, setWorkflowStatusBySlotId] = useState<Record<string, string>>({});
    const [workflowMessageBySlotId, setWorkflowMessageBySlotId] = useState<Record<string, string>>({});
    const [technicianStatusMessageBySlotId, setTechnicianStatusMessageBySlotId] = useState<Record<string, string>>({});
    const [customStatusNoteBySlotId, setCustomStatusNoteBySlotId] = useState<Record<string, string>>({});
    const [pendingWorkflowConfirmationBySlotId, setPendingWorkflowConfirmationBySlotId] = useState<Record<string, string>>({});
    const [closeoutFormBySlotId, setCloseoutFormBySlotId] = useState<Record<string, TechCloseoutForm>>({});
    const [closingVisitSlotId, setClosingVisitSlotId] = useState('');
    const [timingEstimateBySlotId, setTimingEstimateBySlotId] = useState<Record<string, string>>({});
    const [timingPromptMessageBySlotId, setTimingPromptMessageBySlotId] = useState<Record<string, string>>({});
    const [timingPromptAnsweredBySlotId, setTimingPromptAnsweredBySlotId] = useState<Record<string, boolean>>({});
    const [updatingWorkflowSlotId, setUpdatingWorkflowSlotId] = useState('');
    const [estimateDraftCountByPropertyId, setEstimateDraftCountByPropertyId] = useState<Record<string, number>>({});
    const [scheduleDiagnostics, setScheduleDiagnostics] = useState<TechOSScheduleDiagnostics | null>(null);
    const knownAssignedSlotIdsRef = useRef<Set<string>>(new Set());
    const workflowStatusBySlotIdRef = useRef<Record<string, string>>({});
    const technicianScrollRef = useRef<ScrollView>(null);
    const dashboardContentOffsetRef = useRef(0);

    useEffect(() => {
        if (dashboardContentScrollRequest === 0) return;

        const frame = requestAnimationFrame(() => {
            technicianScrollRef.current?.scrollTo({
                animated: true,
                y: Math.max(0, dashboardContentOffsetRef.current - 12),
            });
        });

        return () => cancelAnimationFrame(frame);
    }, [dashboardContentScrollRequest]);

    function openDashboardView(view: TechDashboardView) {
        setSelectedAssignedJobId('');
        if (view === 'time-clock') setTimeClockInitialStep('overview');
        setDashboardView(view);
        setDashboardContentScrollRequest((current) => current + 1);
    }

    function openTimeClock(step: TechOSTimeClockStep = 'overview') {
        setSelectedAssignedJobId('');
        setTimeClockInitialStep(step);
        setDashboardView('time-clock');
        technicianScrollRef.current?.scrollTo({ animated: true, y: 0 });
    }

    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
    const requestedSlotId = useMemo(() => firstParam(slotId), [slotId]);
    const assignedTechnicianCompanyUserIds = useMemo(
        () => techOSMode === 'technician'
            ? normalizeTechOSAssignmentCompanyUserIds([
                membership?.id,
                ...technicianCompanyUserIds,
            ])
            : [],
        [membership?.id, technicianCompanyUserIds, techOSMode]
    );
    const primaryTechnicianCompanyUserId = assignedTechnicianCompanyUserIds[0] || '';
    const handleTechnicianTimeEntriesChange = useCallback((entries: TechnicianTimeEntry[]) => {
        setTechnicianTimeEntries(entries);
        setTechnicianTimeEntriesLoaded(true);
        setTechnicianTimeNow(Date.now());
    }, []);
    const openTechnicianTimeEntry = technicianTimeEntries.find((entry) => !entry.clockedOutAt) || null;
    const summaryTechnicianTimeEntry = openTechnicianTimeEntry || technicianTimeEntries[0] || null;
    const technicianHourSummary = summaryTechnicianTimeEntry
        ? getTechnicianShiftHourSummary(summaryTechnicianTimeEntry, technicianTimeNow)
        : { regularSeconds: 0, overtimeSeconds: 0, workedSeconds: 0 };
    const technicianOvertimeWarningState = openTechnicianTimeEntry
        ? getTechnicianOvertimeWarningState(technicianHourSummary.workedSeconds)
        : 'none';
    const technicianMealRecorded = !!openTechnicianTimeEntry
        && (openTechnicianTimeEntry.breakMinutes >= 30 || !!openTechnicianTimeEntry.breakStartedAt);
    const openTechnicianTimeEntryId = openTechnicianTimeEntry?.id || '';
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
        () => assignedScheduleJobs.filter((job) => !isCurrentFutureActiveScheduleJob(job.slot)),
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
    const loadAssignedEstimateDraftCounts = useCallback(async () => {
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
    }, [activeCompanyId, assignedEstimatePropertyIds, authUserId]);
    const techOSTheme = useMemo(() => resolveCompanyTechOSTheme({
        primaryColor: company?.primary_color,
        secondaryColor: company?.secondary_color,
        accentColor: company?.accent_color,
        glassDepth: company?.glass_depth,
    }), [company?.accent_color, company?.glass_depth, company?.primary_color, company?.secondary_color]);
    const loadTechOSAccessEvent = useEffectEvent(loadTechOSAccess);
    const loadAssignedScheduleJobsEvent = useEffectEvent(loadAssignedScheduleJobs);

    useEffect(() => {
        void loadTechOSAccessEvent();
    }, [requestedCompanyId]);

    useEffect(() => {
        workflowStatusBySlotIdRef.current = workflowStatusBySlotId;
    }, [workflowStatusBySlotId]);

    useEffect(() => {
        const nextSelection = resolveTechOSRouteSelection({
            availableSlotIds: assignedScheduleJobs.map((job) => job.slot.id),
            dismissedSlotId: dismissedAssignedJobId,
            requestedSlotId,
            routeOpenedSlotId: routeOpenedAssignedJobId,
            selectedSlotId: selectedAssignedJobId,
        });

        if (nextSelection.selectedSlotId !== selectedAssignedJobId) {
            setSelectedAssignedJobId(nextSelection.selectedSlotId);
        }
        if (nextSelection.dismissedSlotId !== dismissedAssignedJobId) {
            setDismissedAssignedJobId(nextSelection.dismissedSlotId);
        }
        if (nextSelection.routeOpenedSlotId !== routeOpenedAssignedJobId) {
            setRouteOpenedAssignedJobId(nextSelection.routeOpenedSlotId);
        }
    }, [assignedScheduleJobs, dismissedAssignedJobId, requestedSlotId, routeOpenedAssignedJobId, selectedAssignedJobId]);

    useEffect(() => {
        void loadAssignedEstimateDraftCounts();
    }, [loadAssignedEstimateDraftCounts]);

    useEffect(() => {
        if (!primaryTechnicianCompanyUserId || !isTechnicianCompanyRole(membership?.role)) {
            setTechnicianTimeEntries([]);
            setTechnicianTimeEntriesLoaded(false);
            return;
        }
        let active = true;
        setAccessModeLoading(true);
        setTechnicianTimeEntriesLoaded(false);
        void loadTechnicianTimeEntries(primaryTechnicianCompanyUserId)
            .then((entries) => {
                if (!active) return;
                handleTechnicianTimeEntriesChange(entries);
                setAccessMode(entries.some((entry) => !entry.clockedOutAt) ? 'working' : 'choosing');
                setAccessModeMessage('');
            })
            .catch((error) => {
                if (!active) return;
                setTechnicianTimeEntries([]);
                setTechnicianTimeEntriesLoaded(true);
                setAccessModeMessage(`Time status could not load: ${getErrorMessage(error)}`);
            })
            .finally(() => {
                if (active) setAccessModeLoading(false);
            });
        return () => {
            active = false;
        };
    }, [handleTechnicianTimeEntriesChange, membership?.role, primaryTechnicianCompanyUserId]);

    useEffect(() => {
        if (!openTechnicianTimeEntryId) return;
        const timer = setInterval(() => setTechnicianTimeNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [openTechnicianTimeEntryId]);

    async function startWorkFromAccessGate() {
        const technicianId = assignedTechnicianCompanyUserIds[0] || '';
        if (!technicianId || accessModeLoading) return;
        setAccessModeLoading(true);
        setAccessModeMessage('Clocking in and opening TechOS...');
        try {
            const result = await runTechnicianClockIn({
                clockIn: () => setTechnicianClock(technicianId, 'clock_in'),
                registerDevice: () => registerTechnicianDevice(
                    technicianId,
                    getOrCreateTechOSDeviceKey(),
                    'primary_phone',
                    'Primary TechOS phone'
                ),
            });
            setAccessMode('working');
            setDashboardView('jobs');
            setAccessModeMessage('');
            setTechnicianTimeEntries([]);
            setTechnicianTimeEntriesLoaded(false);
            void loadTechnicianTimeEntries(technicianId)
                .then(handleTechnicianTimeEntriesChange)
                .catch((error) => {
                    setTechnicianTimeEntriesLoaded(true);
                    logTechOSDebug('Clock-in succeeded while the time summary refresh was unavailable.', {
                        error: getErrorMessage(error),
                        technician_company_user_id: technicianId,
                    });
                });
            if (result.deviceRegistrationError) {
                logTechOSDebug('Clock-in succeeded while primary device registration was unavailable.', {
                    error: getErrorMessage(result.deviceRegistrationError),
                    technician_company_user_id: technicianId,
                });
            }
        } catch (error) {
            setAccessModeMessage(`Could not clock in: ${normalizeServiceErrorMessage(getErrorMessage(error))}`);
        } finally {
            setAccessModeLoading(false);
        }
    }

    async function startCompanionMode() {
        const technicianId = assignedTechnicianCompanyUserIds[0] || '';
        if (!technicianId || accessModeLoading) return;
        setAccessModeLoading(true);
        setAccessModeMessage('Registering companion tablet...');
        try {
            await registerTechnicianDevice(
                technicianId,
                getOrCreateTechOSDeviceKey(),
                'companion_tablet',
                'Homeowner presentation tablet'
            );
            setAccessMode('companion');
            setAccessModeMessage('');
        } catch (error) {
            setAccessModeMessage(`Companion tablet could not register: ${getErrorMessage(error)}`);
        } finally {
            setAccessModeLoading(false);
        }
    }

    useEffect(() => {
        const nextTechnicianCompanyUserIds = assignedTechnicianCompanyUserIds;
        const companyIdForRefresh = activeCompanyId;

        if (!companyIdForRefresh || nextTechnicianCompanyUserIds.length === 0) return;

        const refreshAssignedJobs = () => {
            void loadAssignedScheduleJobsEvent(companyIdForRefresh, nextTechnicianCompanyUserIds, {
                announceNewAssignments: true,
                subtle: true,
            });
        };
        const intervalId = setInterval(refreshAssignedJobs, TECHOS_ASSIGNMENT_REFRESH_MS);
        const channels = nextTechnicianCompanyUserIds.map((technicianCompanyUserId) => (
            supabase
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
                .subscribe()
        ));

        return () => {
            clearInterval(intervalId);
            channels.forEach((channel) => {
                void supabase.removeChannel(channel);
            });
        };
    }, [activeCompanyId, assignedTechnicianCompanyUserIds]);

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
        setTechnicianCompanyUserIds([]);
        setCompany(null);
        setClients([]);
        setPropertiesById({});
        setJobs([]);
        setAssignedScheduleSlots([]);
        setAssignedScheduleMeetings([]);
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
        setTechnicianTimeEntries([]);
        setTechnicianTimeEntriesLoaded(false);
        setSelectedAssignedJobId('');
        setDismissedAssignedJobId('');
        setRouteOpenedAssignedJobId('');
        setWorkflowStatusBySlotId({});
        workflowStatusBySlotIdRef.current = {};
        setWorkflowMessageBySlotId({});
        setPendingWorkflowConfirmationBySlotId({});
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
            const availableCompanyIds = Array.from(new Set(activeTechOSMemberships.map((companyUser) => companyUser.company_id)));

            if (availableCompanyIds.length === 1) {
                activeMembership = activeTechOSMemberships[0];
                selectedCompanyId = activeMembership.company_id;
                replaceTechOSCompanyRoute(selectedCompanyId);
            } else {
                setCompanyChoices(activeTechOSMemberships);
                setCheckingAccess(false);
                setMessage('Choose a company to open TechOS.');
                return;
            }
        }

        if (platformAdminCheck.isPlatformAdmin && selectedCompanyId) {
            setMembership(activeMembership);
            setIsPlatformAdminAccess(true);
            setTechOSMode('platform-preview');
            setTechnicianCompanyUserIds([]);
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
        const nextTechnicianCompanyUserIds = nextMode === 'technician'
            ? resolveTechOSAssignmentCompanyUserIds({
                companyId: activeMembership.company_id,
                eligibleCompanyUsers: activeTechOSMemberships,
                primaryCompanyUserId: activeMembership.id,
            })
            : [];
        setTechnicianCompanyUserIds(nextTechnicianCompanyUserIds);
        logTechOSDebug('resolved technician profile', {
            auth_user_id: userId,
            auth_email: userEmail,
            company_user_id: activeMembership.id,
            company_user_ids: nextTechnicianCompanyUserIds,
            company_id: activeMembership.company_id,
            role: activeMembership.role,
            status: activeMembership.status,
            mode: nextMode,
        });
        if (nextMode === 'technician') {
            await Promise.all([
                loadCompanyBrand(activeMembership.company_id),
                loadAssignedScheduleJobs(activeMembership.company_id, nextTechnicianCompanyUserIds, {
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
        technicianCompanyUserIdInput: string | string[],
        options: {
            announceNewAssignments?: boolean;
            authEmail?: string;
            authUserId?: string;
            role?: string | null;
            status?: string | null;
            subtle?: boolean;
        } = {}
    ) {
        const technicianCompanyUserIds = normalizeTechOSAssignmentCompanyUserIds(
            Array.isArray(technicianCompanyUserIdInput)
                ? technicianCompanyUserIdInput
                : [technicianCompanyUserIdInput]
        );
        const primaryTechnicianCompanyUserId = technicianCompanyUserIds[0] || '';
        const diagnosticsContext = {
            authEmail: options.authEmail ?? authEmail,
            authUserId: options.authUserId ?? authUserId,
            companyId: companyIdToLoad,
            companyUserId: primaryTechnicianCompanyUserId,
            companyUserIds: technicianCompanyUserIds,
            role: options.role ?? membership?.role ?? null,
            status: options.status ?? membership?.status ?? null,
        };

        if (!companyIdToLoad || technicianCompanyUserIds.length === 0) {
            setAssignedScheduleSlots([]);
            setAssignedScheduleMeetings([]);
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

        const overviewResult = await supabase.rpc('get_company_schedule_overview', {
            p_company_id: companyIdToLoad,
            p_start_at: windowStart.toISOString(),
            p_end_at: windowEnd.toISOString(),
        });
        const scheduleOverview = overviewResult.error
            ? { slotAssignments: [] as CompanyScheduleSlotAssignment[], meetings: [] as CompanyScheduleMeeting[] }
            : normalizeCompanyScheduleOverview(overviewResult.data);
        const crewAssignedSlotIds = getScheduleAssignedSlotIds(
            scheduleOverview.slotAssignments,
            technicianCompanyUserIds
        );

        const slotQuery = supabase
            .from('job_schedule_slots')
            .select('id, company_id, job_id, service_request_id, technician_company_user_id, start_at, end_at, arrival_window_start, arrival_window_end, status, estimated_duration_minutes, priority, notes, tech_status_note, visit_outcome, visit_closed_at, closeout_notes, homeowner_closeout_note, updated_at, created_at')
            .eq('company_id', companyIdToLoad)
            .gte('start_at', windowStart.toISOString())
            .lte('start_at', windowEnd.toISOString());

        const filteredSlotQuery = technicianCompanyUserIds.length === 1
            ? slotQuery.eq('technician_company_user_id', technicianCompanyUserIds[0])
            : slotQuery.in('technician_company_user_id', technicianCompanyUserIds);

        const { data, error } = await filteredSlotQuery
            .order('start_at', { ascending: true });
        const additionalSlotIds = crewAssignedSlotIds.filter((slotId) => !(
            Array.isArray(data) && data.some((row) => (
                row && typeof row === 'object' && String((row as { id?: unknown }).id || '') === slotId
            ))
        ));
        const additionalResult = additionalSlotIds.length > 0
            ? await supabase
                .from('job_schedule_slots')
                .select('id, company_id, job_id, service_request_id, technician_company_user_id, start_at, end_at, arrival_window_start, arrival_window_end, status, estimated_duration_minutes, priority, notes, tech_status_note, visit_outcome, visit_closed_at, closeout_notes, homeowner_closeout_note, updated_at, created_at')
                .eq('company_id', companyIdToLoad)
                .in('id', additionalSlotIds)
                .order('start_at', { ascending: true })
            : { data: [], error: null };

        logTechOSDebug('job_schedule_slots query result', {
            ...diagnosticsContext,
            error,
            row_count: (Array.isArray(data) ? data.length : 0) + (Array.isArray(additionalResult.data) ? additionalResult.data.length : 0),
            crew_overview_error: overviewResult.error?.message || '',
            additional_slot_error: additionalResult.error?.message || '',
            window_start: windowStart.toISOString(),
            window_end: windowEnd.toISOString(),
        });

        if (error) {
            logTechOSDebug('job_schedule_slots query error', error);
            setAssignedScheduleSlots([]);
            setAssignedScheduleMeetings(scheduleOverview.meetings);
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

        const primarySlots = filterTechOSAssignmentSlots(
            normalizeScheduleSlots(data),
            companyIdToLoad,
            technicianCompanyUserIds
        );
        const additionalSlots = normalizeScheduleSlots(additionalResult.data)
            .filter((slot) => crewAssignedSlotIds.includes(slot.id));
        const slotById = [...primarySlots, ...additionalSlots].reduce<Record<string, TechScheduleSlot>>((current, slot) => {
            current[slot.id] = slot;
            return current;
        }, {});
        const nextSlots = collapseTechOSAssignmentSlots(Object.values(slotById)).map((slot) => ({
            ...slot,
            crew: getScheduleCrewForSlot(scheduleOverview.slotAssignments, slot.id),
            crew_role: getScheduleRoleForCompanyUsers(
                scheduleOverview.slotAssignments,
                slot.id,
                technicianCompanyUserIds
            ) || (technicianCompanyUserIds.includes(slot.technician_company_user_id) ? 'lead' : null),
        }));
        setScheduleDiagnostics({
            ...diagnosticsContext,
            queryError: '',
            rawSlotCount: (Array.isArray(data) ? data.length : 0) + (Array.isArray(additionalResult.data) ? additionalResult.data.length : 0),
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

        const serviceRequestsResult = await loadScheduleServiceRequests(companyIdToLoad, nextSlots);
        const nextWorkflowStatusBySlotId = buildTechWorkflowStatusBySlotId(
            nextSlots,
            serviceRequestsResult.requestsById,
            workflowStatusBySlotIdRef.current
        );
        const mergedSlots = nextSlots.map((slot) => ({
            ...slot,
            status: nextWorkflowStatusBySlotId[slot.id] || slot.status,
        }));

        workflowStatusBySlotIdRef.current = {
            ...workflowStatusBySlotIdRef.current,
            ...nextWorkflowStatusBySlotId,
        };
        setWorkflowStatusBySlotId((current) => ({
            ...current,
            ...nextWorkflowStatusBySlotId,
        }));
        setAssignedScheduleSlots(mergedSlots);
        setAssignedScheduleMeetings(scheduleOverview.meetings);
        setServiceRequestsById(serviceRequestsResult.requestsById);
        setScheduleMessage(
            serviceRequestsResult.message ||
            overviewResult.error
                ? serviceRequestsResult.message || 'Jobs loaded. Team meetings and crew roles will appear after the schedule upgrade is installed.'
                : additionalResult.error
                    ? `Some crew assignments could not load: ${additionalResult.error.message}`
                    : ''
        );

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
                    'id, name, status, public_name, dba_name, logo_url, primary_color, secondary_color, accent_color, glass_depth, service_categories, license_number, short_description'
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
        const selectedRole = selectedAssignmentRoleByJob[job.id] || resolveDefaultJobAssignmentRole({
            activeAssignmentCount: job.assignment_count,
        });

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
            [job.id]: `Assigning ${getTechnicianAssignmentDisplayName(selectedTechnician)} as ${getJobAssignmentRoleLabel(selectedRole).toLowerCase()}...`,
        }));

        let assignErrorMessage = '';

        try {
            const { error } = await supabase.rpc('assign_technician_to_job', {
                p_company_id: selectedCompanyId,
                p_job_id: job.id,
                p_technician_company_user_id: selectedTechnicianId,
                p_role_on_job: selectedRole,
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
            [job.id]: selectedRole === 'primary'
                ? `${getTechnicianAssignmentDisplayName(selectedTechnician)} is now the lead technician.`
                : `${getTechnicianAssignmentDisplayName(selectedTechnician)} was added to this job.`,
        }));
        setSelectedTechnicianByJob((current) => ({ ...current, [job.id]: '' }));
        setSelectedAssignmentRoleByJob((current) => ({ ...current, [job.id]: 'helper' }));
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
        setDismissedAssignedJobId('');
        setSelectedAssignedJobId(job.slot.id);
        setDashboardContentScrollRequest((current) => current + 1);
    }

    function handleCloseAssignedJobDetails() {
        setDismissedAssignedJobId(selectedAssignedJobId);
        setSelectedAssignedJobId('');
        setDashboardContentScrollRequest((current) => current + 1);
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

    async function handleCompleteAssignedMeeting(meeting: CompanyScheduleMeeting) {
        setScheduleMessage(`Completing ${meeting.title}...`);
        const { error } = await supabase.rpc('complete_company_schedule_meeting', {
            p_company_id: meeting.company_id,
            p_meeting_id: meeting.id,
        });

        if (error) {
            setScheduleMessage(`Could not complete meeting: ${normalizeServiceErrorMessage(error.message)}`);
            return;
        }

        if (activeCompanyId && assignedTechnicianCompanyUserIds.length > 0) {
            await loadAssignedScheduleJobs(activeCompanyId, assignedTechnicianCompanyUserIds, { subtle: true });
        }
        setScheduleMessage('Meeting completed.');
    }

    async function handleCloseServiceVisit(job: TechAssignedScheduleJob, outcomeOverride?: ServiceVisitOutcome) {
        const slotId = job.slot.id;
        const form = closeoutFormBySlotId[slotId] || createDefaultTechCloseoutForm();
        const outcome = outcomeOverride || form.outcome;

        if (!canScheduleCrewRoleControlWorkflow(job.slot.crew_role)) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: 'Only the lead technician can close this shared job. Your crew assignment remains on your schedule.',
            }));
            return;
        }

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
            let soldWorkflowRequiringApproval: SoldJobRecord | null = null;

            if (outcome === 'completed_successfully') {
                const soldWorkflow = await loadSoldJobForScheduleSlot(slotId)
                    || (job.request?.id ? await loadSoldJobForServiceRequest(job.request.id) : null);
                if (soldWorkflow && !['customer_completed', 'invoice_sent', 'collection_pending', 'closed'].includes(soldWorkflow.status)) {
                    if (soldWorkflow.status !== 'work_complete') {
                        await completeJobWorkflowFromTechOS(soldWorkflow.id, slotId);
                    }
                    soldWorkflowRequiringApproval = soldWorkflow;
                }
            }

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
            workflowStatusBySlotIdRef.current = {
                ...workflowStatusBySlotIdRef.current,
                [slotId]: result.schedule_slot_status,
            };
            setWorkflowStatusBySlotId((current) => ({
                ...current,
                [slotId]: result.schedule_slot_status,
            }));
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: `Visit closed: ${getServiceVisitOutcomeLabel(result.visit_outcome)}.`,
            }));

            if (activeCompanyId && assignedTechnicianCompanyUserIds.length > 0) {
                await loadAssignedScheduleJobs(activeCompanyId, assignedTechnicianCompanyUserIds, { subtle: true });
            }

            if (soldWorkflowRequiringApproval) {
                router.push({
                    pathname: '/job-workflow',
                    params: {
                        estimateSessionId: soldWorkflowRequiringApproval.estimateSessionId,
                        completion: '1',
                        source: 'techos',
                        returnTo: `/techos?companyId=${encodeURIComponent(job.slot.company_id)}`,
                    },
                } as any);
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
        const currentWorkflowStatus = workflowStatusBySlotId[slotId] || job.slot.status || job.request?.status || '';

        if (!canScheduleCrewRoleControlWorkflow(job.slot.crew_role)) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: 'Only the lead technician changes the shared customer workflow. You can still open the job, view the crew, and complete your assigned work.',
            }));
            return;
        }
        const transition = resolveTechWorkflowTransition(action, {
            slotId,
            companyId: job.slot.company_id,
            technicianCompanyUserId: job.slot.technician_company_user_id,
            requestId: job.request?.id || null,
            slotServiceRequestId: job.slot.service_request_id,
            currentStatus: currentWorkflowStatus,
            pendingConfirmationKey: pendingWorkflowConfirmationBySlotId[slotId] || null,
        });

        if (!transition.canRun) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId || 'missing']: transition.message,
            }));
            if (transition.requiresConfirmation && slotId) {
                setPendingWorkflowConfirmationBySlotId((current) => ({
                    ...current,
                    [slotId]: transition.confirmationKey,
                }));
            }
            return;
        }

        if (normalizedStatus === 'custom' && !trimmedStatusNote) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: 'Enter a custom status message.',
            }));
            return;
        }

        setPendingWorkflowConfirmationBySlotId((current) => {
            const next = { ...current };

            delete next[slotId];

            return next;
        });
        setUpdatingWorkflowSlotId(slotId);
        setWorkflowMessageBySlotId((current) => ({
            ...current,
            [slotId]: `Updating status to ${action.label}...`,
        }));

        try {
            const requestWorkflowStatus = String(job.request?.status || '').trim();
            const isRepairingLegacyCustomStatus = normalizedStatus === 'custom'
                && normalizeStatus(currentWorkflowStatus) === 'custom';
            const preservedWorkflowStatus = isRepairingLegacyCustomStatus
                ? (requestWorkflowStatus && normalizeStatus(requestWorkflowStatus) !== 'custom'
                    ? requestWorkflowStatus
                    : 'in_progress')
                : currentWorkflowStatus;
            const existingNextJobMarker = String(job.slot.tech_status_note || '')
                .match(/Next job: (?:Available after this job|Running late)/i)?.[0] || '';
            const cleanStatusNote = trimmedStatusNote
                .replace(/(?:\s*·\s*)?Next job: (?:Available after this job|Running late)/gi, '')
                .trim();
            const nextStatusNote = normalizedStatus === 'custom'
                ? [cleanStatusNote, existingNextJobMarker].filter(Boolean).join(' · ')
                : null;
            let updatedAt = new Date().toISOString();
            const serviceRequestId = transition.serviceRequestId;
            let persistedWorkflowStatus = normalizedStatus === 'custom' ? preservedWorkflowStatus : action.status;
            let persistenceMismatchMessage = '';

            if (normalizedStatus !== 'custom') {
                workflowStatusBySlotIdRef.current = {
                    ...workflowStatusBySlotIdRef.current,
                    [slotId]: action.status,
                };
                setWorkflowStatusBySlotId((current) => ({
                    ...current,
                    [slotId]: action.status,
                }));
                setAssignedScheduleSlots((current) => current.map((slot) => (
                    slot.id === slotId
                        ? {
                            ...slot,
                            status: action.status,
                            tech_status_note: nextStatusNote,
                            updated_at: updatedAt,
                        }
                        : slot
                )));
            }

            if (serviceRequestId && normalizedStatus !== 'custom') {
                const result = await recordServiceRequestVisitStatus({
                    companyId: job.slot.company_id,
                    serviceRequestId,
                    scheduleSlotId: slotId,
                    status: action.status,
                    statusNote: nextStatusNote,
                    idempotencyKey: createStatusTransitionIdempotencyKey({
                        scheduleSlotId: slotId,
                        status: action.status,
                    }),
                    metadata: {
                        source: 'techos',
                        technician_company_user_id: job.slot.technician_company_user_id,
                    },
                });

                updatedAt = new Date().toISOString();
                persistedWorkflowStatus = resolveTechWorkflowVisibleStatus({
                    requestStatus: result.service_request_status,
                    slotStatus: result.schedule_slot_status,
                }) || action.status;
                persistenceMismatchMessage = getTechWorkflowPersistenceMismatchMessage(action.status, result);
                setServiceRequestsById((current) => ({
                    ...current,
                    ...(current[serviceRequestId] || job.request ? {
                        [serviceRequestId]: {
                            ...(current[serviceRequestId] || job.request!),
                            id: serviceRequestId,
                            company_id: job.slot.company_id,
                            status: result.service_request_status,
                        },
                    } : {}),
                }));
            } else {
                const customStatusUpdate = isRepairingLegacyCustomStatus
                    ? { status: preservedWorkflowStatus, tech_status_note: nextStatusNote }
                    : { tech_status_note: nextStatusNote };
                const { data, error } = await supabase
                    .from('job_schedule_slots')
                    .update(customStatusUpdate)
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

                updatedAt = readStringField(data as Record<string, unknown>, 'updated_at') || updatedAt;
                persistedWorkflowStatus = readStringField(data as Record<string, unknown>, 'status') || preservedWorkflowStatus;
            }

            setAssignedScheduleSlots((current) => current.map((slot) => (
                slot.id === slotId
                    ? {
                        ...slot,
                        status: persistedWorkflowStatus,
                        tech_status_note: nextStatusNote,
                        updated_at: updatedAt,
                    }
                    : slot
            )));
            workflowStatusBySlotIdRef.current = {
                ...workflowStatusBySlotIdRef.current,
                [slotId]: persistedWorkflowStatus,
            };
            setWorkflowStatusBySlotId((current) => ({
                ...current,
                [slotId]: persistedWorkflowStatus,
            }));
            let homeownerTimelineMessage = '';

            if (normalizedStatus === 'custom' && serviceRequestId && cleanStatusNote) {
                try {
                    const homeownerUpdate = await recordHomeownerTechnicianNoteUpdate({
                        companyId: job.slot.company_id,
                        serviceRequestId,
                        scheduleSlotId: slotId,
                        statusNote: cleanStatusNote,
                        technicianName,
                        eventVersion: updatedAt,
                    });

                    homeownerTimelineMessage = homeownerUpdate.status === 'recorded'
                        ? ' The homeowner timeline was updated.'
                        : ' The note was saved, but the homeowner timeline update is pending.';
                } catch {
                    homeownerTimelineMessage = ' The note was saved, but the homeowner timeline could not be updated.';
                }
            }
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: normalizedStatus === 'custom'
                    ? `Job status note updated: ${trimmedStatusNote}.${homeownerTimelineMessage}`
                    : persistenceMismatchMessage || getTechWorkflowStatusFeedback(persistedWorkflowStatus),
            }));
            if (!transition.serviceRequestId) {
                setWorkflowMessageBySlotId((current) => ({
                    ...current,
                    [slotId]: `${current[slotId] || getTechWorkflowStatusFeedback(persistedWorkflowStatus)} This assignment is not linked to a homeowner request yet.`,
                }));
            }

            if (activeCompanyId && assignedTechnicianCompanyUserIds.length > 0) {
                await loadAssignedScheduleJobs(activeCompanyId, assignedTechnicianCompanyUserIds, { subtle: true });
            }
        } catch (error) {
            workflowStatusBySlotIdRef.current = {
                ...workflowStatusBySlotIdRef.current,
                [slotId]: currentWorkflowStatus,
            };
            setWorkflowStatusBySlotId((current) => ({
                ...current,
                [slotId]: currentWorkflowStatus,
            }));
            setAssignedScheduleSlots((current) => current.map((slot) => (
                slot.id === slotId
                    ? {
                        ...slot,
                        status: currentWorkflowStatus,
                    }
                    : slot
            )));
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: `Workflow update failed: ${normalizeServiceErrorMessage(getErrorMessage(error))}`,
            }));
        } finally {
            setUpdatingWorkflowSlotId('');
        }
    }

    async function handleTechnicianNextJobStatusAction(
        job: TechAssignedScheduleJob,
        action: TechnicianNextJobStatusAction,
        currentVisitStatus: string
    ) {
        const notice = createTechnicianNextJobStatusNotice(action, {
            companyId: job.slot.company_id,
            currentVisitStatus,
            technicianCompanyUserId: job.slot.technician_company_user_id,
        });

        const marker = action.key === 'available_for_next_job'
            ? 'Next job: Available after this job'
            : action.key === 'running_late_for_next_job'
                ? 'Next job: Running late'
                : '';
        const currentNote = String(job.slot.tech_status_note || '')
            .replace(/(?:\s*·\s*)?Next job: (?:Available after this job|Running late)/gi, '')
            .trim();
        const nextNote = [currentNote, marker].filter(Boolean).join(' · ') || null;
        const currentWorkflowStatus = workflowStatusBySlotId[job.slot.id] || job.slot.status || job.request?.status || '';
        const requestWorkflowStatus = String(job.request?.status || '').trim();
        const isRepairingLegacyCustomStatus = normalizeStatus(currentWorkflowStatus) === 'custom';
        const preservedWorkflowStatus = isRepairingLegacyCustomStatus
            ? (requestWorkflowStatus && normalizeStatus(requestWorkflowStatus) !== 'custom'
                ? requestWorkflowStatus
                : 'in_progress')
            : currentWorkflowStatus;

        setTechnicianStatusMessageBySlotId((current) => ({ ...current, [job.slot.id]: 'Saving next-job status...' }));

        const { error } = await supabase
            .from('job_schedule_slots')
            .update(isRepairingLegacyCustomStatus
                ? { status: preservedWorkflowStatus, tech_status_note: nextNote }
                : { tech_status_note: nextNote })
            .eq('id', job.slot.id)
            .eq('company_id', job.slot.company_id)
            .eq('technician_company_user_id', job.slot.technician_company_user_id);

        if (error) {
            setTechnicianStatusMessageBySlotId((current) => ({
                ...current,
                [job.slot.id]: `Next-job status failed: ${normalizeServiceErrorMessage(error.message)}`,
            }));
            return;
        }

        setTechnicianStatusMessageBySlotId((current) => ({ ...current, [job.slot.id]: notice.message }));
        if (activeCompanyId && assignedTechnicianCompanyUserIds.length > 0) {
            await loadAssignedScheduleJobs(activeCompanyId, assignedTechnicianCompanyUserIds, { subtle: true });
        }
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

    const companyName = getCompanyDisplayName(company);
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
    const isTimeClockFocused = isTechnicianWorkspace && dashboardView === 'time-clock' && !selectedAssignedJob;
    const overtimeRemainingSeconds = Math.max(0, REGULAR_SHIFT_SECONDS - technicianHourSummary.workedSeconds);

    if (isTechnicianWorkspace && accessMode !== 'working') {
        return (
            <TechOSAccessGate
                accessMode={accessMode}
                loading={accessModeLoading}
                message={accessModeMessage}
                nextJobs={currentFutureAssignedScheduleJobs}
                onClockIn={() => {
                    void startWorkFromAccessGate();
                }}
                onReturnToChoice={() => setAccessMode('choosing')}
                onUseCompanion={() => {
                    void startCompanionMode();
                }}
                onViewOffClock={() => setAccessMode('off_clock')}
                technicianCompanyUserId={assignedTechnicianCompanyUserIds[0] || ''}
                technicianName={technicianName}
            />
        );
    }

    return (
        <CompanyGlassDepthProvider value={company?.glass_depth}>
        <View style={{ flex: 1, backgroundColor: techOSTheme.screenBackgroundColor || theme.colors.background }}>
        <ScrollView
            ref={technicianScrollRef}
            style={{ flex: 1, backgroundColor: techOSTheme.screenBackgroundColor || theme.colors.background }}
            contentContainerStyle={{ padding: pagePadding, paddingBottom: 36, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 980, minWidth: 0 }}>
                <HomeHeader />
                {!selectedAssignedJob && !isTimeClockFocused && <TechOSProfileHeader
                    canPreviewLogo={canPreviewLogo}
                    companyName={companyName}
                    email={authEmail || membership?.email || null}
                    logoUrl={logoUrl}
                    openJobCount={dashboardOpenCount}
                    primaryColor={primaryColor}
                    role={isPlatformAdminAccess ? 'Platform Admin' : membership?.role}
                    secondaryColor={secondaryColor}
                    status={isPlatformAdminAccess ? 'active' : membership?.status}
                    techOSTheme={techOSTheme}
                    technicianName={technicianName}
                    technicianHourSummary={technicianHourSummary}
                    technicianTimeEntriesLoaded={technicianTimeEntriesLoaded}
                    technicianTimeEntryState={openTechnicianTimeEntry ? 'current' : summaryTechnicianTimeEntry ? 'latest' : 'none'}
                    todayCount={dashboardTodayCount}
                    upcomingJobCount={dashboardFutureCount}
                    showTechnicianHours={isTechnicianWorkspace}
                    onSignOut={signOutFromTechOS}
                    onOpenTimeClock={() => openTimeClock('overview')}
                    onOpenClockOut={() => openTimeClock('clock-out')}
                    signingOut={signingOut}
                />}

                {!!dispatchCompanyId && !selectedAssignedJob && !isTimeClockFocused && (
                    <View style={techQuickActionRowStyle}>
                        <ThemedButton
                            title="Open Dispatch"
                            variant="secondary"
                            onPress={() => router.push(`/dispatch?companyId=${encodeURIComponent(dispatchCompanyId)}` as any)}
                            style={techQuickActionButtonStyle}
                            textStyle={{ fontSize: 14 }}
                        />
                    </View>
                )}

                {!isTechnicianWorkspace && !selectedAssignedJob && !isTimeClockFocused && (
                    <ThemedCard style={messageCardStyle}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            This is not a technician login. Select or assign a technician from ManagementOS to preview their workload.
                        </Text>
                    </ThemedCard>
                )}

                {!!message && !selectedAssignedJob && !isTimeClockFocused && (
                    <ThemedCard style={messageCardStyle}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}

                {!!assignmentBanner && !selectedAssignedJob && !isTimeClockFocused && (
                    <ThemedCard style={assignmentBannerStyle}>
                        <Text style={[assignmentBannerTextStyle, { color: theme.colors.primary }]}>
                            {assignmentBanner}
                        </Text>
                    </ThemedCard>
                )}

                {isTechnicianWorkspace && !selectedAssignedJob && !isTimeClockFocused && timingPromptJob && (
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

                {!selectedAssignedJob && !isTimeClockFocused && (
                    <TechOSDashboardCards
                        activeView={dashboardView}
                        historyCount={dashboardHistoryCount}
                        jobsCount={dashboardJobsCount}
                        onSelectView={openDashboardView}
                        scheduleCount={calendarScheduleGroups.length}
                        techOSTheme={techOSTheme}
                        todayCount={dashboardTodayCount}
                        upcomingCount={dashboardFutureCount}
                    />
                )}

                <View
                    onLayout={(event) => {
                        dashboardContentOffsetRef.current = event.nativeEvent.layout.y;
                    }}
                >
                    {isTechnicianWorkspace ? (
                    <TechOSDashboardContent
                        activeJobs={currentFutureAssignedScheduleJobs}
                        activeView={dashboardView}
                        calendarGroups={calendarScheduleGroups}
                        meetings={assignedScheduleMeetings}
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
                            if (activeCompanyId && assignedTechnicianCompanyUserIds.length > 0) {
                                void loadAssignedScheduleJobs(activeCompanyId, assignedTechnicianCompanyUserIds, {
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
                        onCompleteMeeting={(meeting) => {
                            void handleCompleteAssignedMeeting(meeting);
                        }}
                        onRunTechnicianNextJobStatusAction={handleTechnicianNextJobStatusAction}
                        onRunWorkflowAction={handleTechWorkflowAction}
                        onTimeEntriesChange={handleTechnicianTimeEntriesChange}
                        onCloseTimeClock={() => openDashboardView('jobs')}
                        timeClockInitialStep={timeClockInitialStep}
                        updatingWorkflowSlotId={updatingWorkflowSlotId}
                        workflowMessageBySlotId={workflowMessageBySlotId}
                        workflowStatusBySlotId={workflowStatusBySlotId}
                        technicianCompanyUserId={assignedTechnicianCompanyUserIds[0] || ''}
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
                            onSelectAssignmentRole={(jobId, role) =>
                                setSelectedAssignmentRoleByJob((current) => ({ ...current, [jobId]: role }))
                            }
                            onToggleAssignment={(jobId) =>
                                setExpandedAssignmentJobs((current) => ({ ...current, [jobId]: !current[jobId] }))
                            }
                            propertiesById={propertiesById}
                            selectedAssignmentRoleByJob={selectedAssignmentRoleByJob}
                            selectedTechnicianByJob={selectedTechnicianByJob}
                            title={jobBoardTitle}
                            description={jobBoardDescription}
                            emptyMessage="Jobs will appear here after ManagementOS dispatch creates or assigns company service jobs."
                        />
                    </>
                    )}
                </View>

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

                {isTechnicianWorkspace && !selectedAssignedJob && !isTimeClockFocused && (
                    <GlassCard
                        tone="steel"
                        style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: 8,
                            marginTop: 18,
                            padding: 8,
                        }}
                    >
                        {([
                            ['jobs', 'briefcase-outline', 'Jobs'],
                            ['schedule', 'calendar-clock-outline', 'Schedule'],
                            ['history', 'history', 'History'],
                            ['estimates', 'file-document-edit-outline', 'Estimates'],
                            ['messages', 'message-text-outline', 'Messages'],
                            ['van-inventory', 'truck-outline', 'Van'],
                        ] as const).map(([view, icon, label]) => {
                            const active = dashboardView === view;
                            return (
                                <TouchableOpacity
                                    key={view}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Open ${label}`}
                                    onPress={() => openDashboardView(view)}
                                    style={{
                                        alignItems: 'center',
                                        backgroundColor: active
                                            ? techOSTheme.dashboard[view as TechOSDashboardVisualKey].backgroundColor
                                            : 'rgba(3, 24, 42, 0.5)',
                                        borderColor: active
                                            ? techOSTheme.activeBorderColor
                                            : techOSTheme.panelBorderColor,
                                        borderRadius: 13,
                                        borderWidth: 1,
                                        flexBasis: isPhoneLayout ? 68 : 92,
                                        flexGrow: 1,
                                        gap: 3,
                                        justifyContent: 'center',
                                        minHeight: 54,
                                        paddingHorizontal: 8,
                                        paddingVertical: 7,
                                    }}
                                >
                                    <MaterialCommunityIcons
                                        name={icon}
                                        color={active ? techOSTheme.textColor : techOSTheme.mutedTextColor}
                                        size={19}
                                    />
                                    <Text
                                        numberOfLines={1}
                                        style={{
                                            color: active ? techOSTheme.textColor : techOSTheme.mutedTextColor,
                                            fontSize: 11,
                                            fontWeight: '900',
                                        }}
                                    >
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </GlassCard>
                )}

                {!selectedAssignedJob && !isTimeClockFocused && (
                    <View style={buttonRowStyle}>
                        <ThemedButton title="Refresh TechOS" onPress={loadTechOSAccess} style={buttonStyle} />
                    </View>
                )}
            </View>
        </ScrollView>
        {isTechnicianWorkspace
            && !isTimeClockFocused
            && !!openTechnicianTimeEntry
            && technicianOvertimeWarningState !== 'none' && (
            <View
                pointerEvents="box-none"
                style={techOvertimeFloatingLayerStyle}
            >
                <ThemedCard style={techOvertimeFloatingCardStyle}>
                    <Text style={[techMealWarningTitleStyle, { color: techOSTheme.textColor }]}>Shift check</Text>
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                        {technicianMealRecorded
                            ? technicianOvertimeWarningState === 'overtime'
                                ? 'Your eight regular hours are complete. Overtime needs Dispatch approval.'
                                : `Overtime begins in ${formatTechnicianHours(overtimeRemainingSeconds)}. Lunch is recorded.`
                            : technicianOvertimeWarningState === 'overtime'
                                ? 'Have you taken your 30-minute lunch? Eight worked hours are complete and overtime needs approval.'
                                : `Have you taken your 30-minute lunch? Overtime begins in ${formatTechnicianHours(overtimeRemainingSeconds)}.`}
                    </Text>
                    <ThemedButton
                        title="Review Time"
                        variant="primary"
                        onPress={() => openTimeClock('lunch')}
                        style={techOvertimeFloatingButtonStyle}
                    />
                </ThemedCard>
            </View>
        )}
        </View>
        </CompanyGlassDepthProvider>
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
        <ThemedCard style={[timingPromptCardStyle, { borderColor: '#E4A84E', backgroundColor: 'rgba(151, 91, 19, 0.58)' }]}>
            <Text style={[jobAssignmentTitleStyle, { color: theme.colors.text }]}>Next Job Timing</Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Your next arrival window begins at {formatTime(job.slot.arrival_window_start || job.slot.start_at)}. Will you make it on time?
            </Text>
            <DictationTextInput
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
    techOSTheme,
    technicianName,
    technicianHourSummary,
    technicianTimeEntriesLoaded,
    technicianTimeEntryState,
    todayCount,
    upcomingJobCount,
    showTechnicianHours,
    onOpenClockOut,
    onOpenTimeClock,
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
    techOSTheme: TechOSThemePalette;
    technicianName: string;
    technicianHourSummary: { regularSeconds: number; overtimeSeconds: number; workedSeconds: number };
    technicianTimeEntriesLoaded: boolean;
    technicianTimeEntryState: 'current' | 'latest' | 'none';
    todayCount: number;
    upcomingJobCount: number;
    showTechnicianHours: boolean;
    onOpenClockOut: () => void;
    onOpenTimeClock: () => void;
    onSignOut: () => void;
    signingOut: boolean;
}) {
    const avatarColor = primaryColor || techOSTheme.activeBorderColor;
    const avatarTextColor = getReadableColor(avatarColor);

    return (
        <ThemedCard
            style={[
                techProfileHeaderStyle,
                {
                    backgroundColor: techOSTheme.panelBackgroundColor,
                    borderColor: techOSTheme.activeBorderColor,
                },
            ]}
        >
            <View style={[techProfileAccentStyle, { backgroundColor: techOSTheme.activeBorderColor }]} />
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
                        <Text style={[techCompanyNameStyle, { color: techOSTheme.mutedTextColor }]} numberOfLines={1}>
                            {companyName}
                        </Text>
                    </View>
                    <Text style={[techProfileNameStyle, { color: techOSTheme.textColor }]} numberOfLines={1}>
                        {technicianName}
                    </Text>
                    <Text style={[techProfileMetaStyle, { color: techOSTheme.mutedTextColor }]} numberOfLines={1}>
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
            {showTechnicianHours && (
                <View style={techProfileHoursSectionStyle}>
                    <Text selectable style={[techProfileHoursHeadingStyle, { color: techOSTheme.mutedTextColor }]}>
                        {technicianTimeEntryState === 'current'
                            ? 'CURRENT SHIFT HOURS'
                            : technicianTimeEntryState === 'latest'
                                ? 'LATEST SHIFT HOURS'
                                : 'SHIFT HOURS'}
                    </Text>
                    <View style={techProfileHoursRowStyle}>
                        {[
                            { label: 'Regular', seconds: technicianHourSummary.regularSeconds },
                            { label: 'Overtime', seconds: technicianHourSummary.overtimeSeconds },
                            { label: 'Total', seconds: technicianHourSummary.workedSeconds },
                        ].map((item) => (
                            <TouchableOpacity
                                key={item.label}
                                accessibilityRole="button"
                                accessibilityLabel={`Open time clock. ${item.label} ${formatTechnicianClock(item.seconds)}`}
                                onPress={onOpenTimeClock}
                                style={[
                                    techProfileHourStyle,
                                    {
                                        borderColor: item.label === 'Overtime' && item.seconds > 0
                                            ? techOSTheme.activeBorderColor
                                            : techOSTheme.panelBorderColor,
                                    },
                                ]}
                            >
                                <Text
                                    selectable
                                    style={[
                                        techProfileHourValueStyle,
                                        {
                                            color: item.label === 'Overtime' && item.seconds > 0
                                                ? techOSTheme.activeBorderColor
                                                : techOSTheme.textColor,
                                        },
                                    ]}
                                >
                                    {technicianTimeEntriesLoaded ? formatTechnicianClock(item.seconds) : '—'}
                                </Text>
                                <Text selectable style={[techProfileHourLabelStyle, { color: techOSTheme.mutedTextColor }]}>
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {technicianTimeEntryState === 'current' && (
                        <ThemedButton
                            title="Clock Out"
                            variant="primary"
                            onPress={onOpenClockOut}
                            style={techProfileClockOutButtonStyle}
                        />
                    )}
                </View>
            )}
            <View style={techProfileStatsRowStyle}>
                <View style={[techProfileStatStyle, { borderColor: techOSTheme.panelBorderColor }]}>
                    <Text style={[techProfileStatValueStyle, { color: techOSTheme.textColor }]}>{todayCount}</Text>
                    <Text style={[techProfileStatLabelStyle, { color: techOSTheme.mutedTextColor }]}>Today’s Jobs</Text>
                </View>
                <View style={[techProfileStatStyle, { borderColor: techOSTheme.panelBorderColor }]}>
                    <Text style={[techProfileStatValueStyle, { color: techOSTheme.textColor }]}>{upcomingJobCount}</Text>
                    <Text style={[techProfileStatLabelStyle, { color: techOSTheme.mutedTextColor }]}>Upcoming Jobs</Text>
                </View>
                <View style={[techProfileStatStyle, { borderColor: techOSTheme.panelBorderColor }]}>
                    <Text style={[techProfileStatValueStyle, { color: techOSTheme.textColor }]}>{openJobCount}</Text>
                    <Text style={[techProfileStatLabelStyle, { color: techOSTheme.mutedTextColor }]}>Open Jobs</Text>
                </View>
            </View>
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

function TechOSAccessGate({
    accessMode,
    loading,
    message,
    nextJobs,
    onClockIn,
    onReturnToChoice,
    onUseCompanion,
    onViewOffClock,
    technicianCompanyUserId,
    technicianName,
}: {
    accessMode: TechOSAccessMode;
    loading: boolean;
    message: string;
    nextJobs: TechAssignedScheduleJob[];
    onClockIn: () => void;
    onReturnToChoice: () => void;
    onUseCompanion: () => void;
    onViewOffClock: () => void;
    technicianCompanyUserId: string;
    technicianName: string;
}) {
    const { theme } = useTheme();
    const nextJob = nextJobs[0] || null;
    const [correctionOpen, setCorrectionOpen] = useState(false);
    const [correctionTime, setCorrectionTime] = useState('08:00');
    const [correctionReason, setCorrectionReason] = useState('');
    const [correctionMessage, setCorrectionMessage] = useState('');
    const [correctionSubmitting, setCorrectionSubmitting] = useState(false);

    async function submitCorrection() {
        const [hours, minutes] = correctionTime.split(':').map(Number);
        const requested = new Date();
        requested.setHours(hours, minutes, 0, 0);
        setCorrectionSubmitting(true);
        setCorrectionMessage('Capturing location and sending request...');
        try {
            const location = await captureBrowserClockLocation();
            await requestClockInCorrection({
                technicianCompanyUserId,
                requestedClockInAt: requested.toISOString(),
                reason: correctionReason,
                latitude: location?.latitude,
                longitude: location?.longitude,
                accuracyMeters: location?.accuracy,
            });
            setCorrectionOpen(false);
            setCorrectionMessage('Sent to Dispatch for approval. Your recorded time has not changed.');
        } catch (error) {
            setCorrectionMessage(`Request failed: ${getErrorMessage(error)}`);
        } finally {
            setCorrectionSubmitting(false);
        }
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 18, alignItems: 'center', minHeight: '100%' }}
        >
            <View style={{ width: '100%', maxWidth: 620 }}>
                <HomeHeader />
                <ThemedCard style={techAccessGateCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                        {accessMode === 'off_clock'
                            ? 'Viewing Off the Clock'
                            : accessMode === 'companion'
                                ? 'Companion Presentation Tablet'
                                : `Welcome, ${technicianName}`}
                    </Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        {accessMode === 'off_clock'
                            ? 'Schedule information is read-only. Clock in before taking photos, changing job status, creating estimates, recording purchases, or completing work.'
                            : accessMode === 'companion'
                                ? 'This tablet is limited to homeowner-facing options, approvals, signatures, documents, and before/after photos. The technician controls the job from the registered phone.'
                            : 'Choose how you are entering TechOS. Working actions remain locked until you clock in.'}
                    </Text>
                    {!!message && <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>}

                    {(accessMode === 'off_clock' || accessMode === 'companion') && (
                        <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                            <Text style={[clientNameStyle, { color: theme.colors.text }]}>Next job</Text>
                            {nextJob ? (
                                <>
                                    <Text style={[summaryValueStyle, { color: theme.colors.text }]}>
                                        {getTechOSAssignedJobCode(nextJob)}
                                    </Text>
                                    <Text style={[clientNameStyle, { color: theme.colors.text }]}>{getAssignedJobTitle(nextJob)}</Text>
                                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                                        {formatScheduleRange(nextJob.slot)}
                                    </Text>
                                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                                        {getAssignedJobLocation(nextJob)}
                                    </Text>
                                    {accessMode === 'companion' && (
                                        <ThemedButton
                                            title="Open Homeowner Presentation"
                                            variant="primary"
                                            onPress={() => {
                                                void loadSoldJobForScheduleSlot(nextJob.slot.id).then((record) => {
                                                    if (record) {
                                                        router.push({
                                                            pathname: '/job-workflow',
                                                            params: { estimateSessionId: record.estimateSessionId, presentation: '1' },
                                                        } as any);
                                                    } else {
                                                        setCorrectionMessage('This job does not have a homeowner presentation ready yet.');
                                                    }
                                                });
                                            }}
                                            style={assignedJobActionButtonStyle}
                                        />
                                    )}
                                </>
                            ) : (
                                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>No upcoming assigned job.</Text>
                            )}
                        </View>
                    )}

                    {accessMode !== 'companion' && (
                        <ThemedButton
                            title={loading ? 'Starting Work...' : 'Clock In & Start Work'}
                            variant="primary"
                            disabled={loading}
                            onPress={onClockIn}
                            style={assignedJobActionButtonStyle}
                        />
                    )}
                    {accessMode === 'choosing' ? (
                        <>
                            <ThemedButton
                                title="View Off the Clock"
                                variant="secondary"
                                disabled={loading}
                                onPress={onViewOffClock}
                                style={assignedJobActionButtonStyle}
                            />
                            <ThemedButton
                                title={correctionOpen ? 'Cancel Forgotten Clock-In' : 'Forgot to Clock In?'}
                                variant="secondary"
                                disabled={loading}
                                onPress={() => setCorrectionOpen((current) => !current)}
                                style={assignedJobActionButtonStyle}
                            />
                            <ThemedButton
                                title="Use as Companion iPad"
                                variant="secondary"
                                disabled={loading}
                                onPress={onUseCompanion}
                                style={assignedJobActionButtonStyle}
                            />
                        </>
                    ) : (
                        <ThemedButton
                            title="Back"
                            variant="secondary"
                            disabled={loading}
                            onPress={onReturnToChoice}
                            style={assignedJobActionButtonStyle}
                        />
                    )}
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                        TechOS never clocks you in automatically.
                    </Text>
                    {correctionOpen && (
                        <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                            <Text style={[clientNameStyle, { color: theme.colors.text }]}>Forgotten clock-in request</Text>
                            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                                Enter today’s missed time. It cannot be earlier than 8:00 AM and will require Dispatch approval.
                            </Text>
                            <DictationTextInput
                                value={correctionTime}
                                onChangeText={setCorrectionTime}
                                placeholder="08:00"
                                placeholderTextColor={theme.colors.mutedText}
                                style={[techCompactInputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                            />
                            <DictationTextInput
                                value={correctionReason}
                                onChangeText={setCorrectionReason}
                                placeholder="Why was the clock-in missed?"
                                placeholderTextColor={theme.colors.mutedText}
                                multiline
                                style={[techCustomStatusInputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                            />
                            <ThemedButton
                                title={correctionSubmitting ? 'Sending...' : 'Send to Dispatch'}
                                variant="primary"
                                disabled={correctionSubmitting || !technicianCompanyUserId || !/^(0[89]|1\d|2[0-3]):[0-5]\d$/.test(correctionTime) || correctionReason.trim().length < 4}
                                onPress={() => {
                                    void submitCorrection();
                                }}
                                style={assignedJobActionButtonStyle}
                            />
                        </View>
                    )}
                    {!!correctionMessage && (
                        <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{correctionMessage}</Text>
                    )}
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
    const cards: { key: TechDashboardView; title: string; value: string; note: string; priority?: boolean }[] = [
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
            value: 'Live',
            note: 'sold jobs connected',
        },
        {
            key: 'messages',
            title: 'Messages',
            value: '0',
            note: 'updates soon',
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
                const variant = techOSTheme.dashboard[card.key as TechOSDashboardVisualKey];

                return (
                    <ThemedCard
                        key={card.key}
                        onPress={() => onSelectView(card.key)}
                        style={[
                            dashboardCardStyle,
                            {
                                backgroundColor: variant.backgroundColor,
                                borderColor: variant.borderColor,
                                borderBottomWidth: Math.max(1, Math.round(8 * (techOSTheme.glassDepth || 70) / 100)),
                                boxShadow: `0 ${Math.max(1, Math.round(10 * (techOSTheme.glassDepth || 70) / 100))}px ${Math.max(2, Math.round(20 * (techOSTheme.glassDepth || 70) / 100))}px rgba(7, 27, 51, ${0.05 + 0.2 * (techOSTheme.glassDepth || 70) / 100}), inset 0 1px 0 rgba(255, 255, 255, 0.94)`,
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
    meetings,
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
    onCompleteMeeting,
    onRunTechnicianNextJobStatusAction,
    onRunWorkflowAction,
    onTimeEntriesChange,
    onCloseTimeClock,
    timeClockInitialStep,
    updatingWorkflowSlotId,
    workflowMessageBySlotId,
    workflowStatusBySlotId,
    technicianCompanyUserId,
}: {
    activeCompanyId: string;
    activeJobs: TechAssignedScheduleJob[];
    activeView: TechDashboardView;
    calendarGroups: { key: string; label: string; jobs: TechAssignedScheduleJob[] }[];
    estimateDraftCountByPropertyId: Record<string, number>;
    futureJobs: TechAssignedScheduleJob[];
    historyJobs: TechAssignedScheduleJob[];
    jobStats: { closed: number; open: number; paused: number };
    loading: boolean;
    meetings: CompanyScheduleMeeting[];
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
    onCloseServiceVisit: (job: TechAssignedScheduleJob, outcomeOverride?: ServiceVisitOutcome) => void;
    onOpenClientHomeOS: (job: TechAssignedScheduleJob) => void;
    onOpenDetails: (job: TechAssignedScheduleJob) => void;
    onOpenEstimateForAssignedJob: (job: TechAssignedScheduleJob) => void;
    onOpenEstimateWorkspace: () => void;
    onCompleteMeeting: (meeting: CompanyScheduleMeeting) => void;
    onRunTechnicianNextJobStatusAction: (job: TechAssignedScheduleJob, action: TechnicianNextJobStatusAction, currentVisitStatus: string) => void;
    onRunWorkflowAction: (job: TechAssignedScheduleJob, action: TechWorkflowAction, statusNote?: string) => void;
    onTimeEntriesChange: (entries: TechnicianTimeEntry[]) => void;
    onCloseTimeClock: () => void;
    timeClockInitialStep: TechOSTimeClockStep;
    updatingWorkflowSlotId: string;
    workflowMessageBySlotId: Record<string, string>;
    workflowStatusBySlotId: Record<string, string>;
    technicianCompanyUserId: string;
}) {
    if (selectedJob) {
        return (
            <TechOSAssignedJobDetail
                key={selectedJob.slot.id}
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
                onCloseServiceVisit={(outcomeOverride) => onCloseServiceVisit(selectedJob, outcomeOverride)}
                onOpenClientHomeOS={() => onOpenClientHomeOS(selectedJob)}
                onOpenEstimate={() => onOpenEstimateForAssignedJob(selectedJob)}
                onRunWorkflowAction={onRunWorkflowAction}
                onRunTechnicianNextJobStatusAction={(action) => onRunTechnicianNextJobStatusAction(selectedJob, action, resolveTechWorkflowVisibleStatus({
                    optimisticStatus: workflowStatusBySlotId[selectedJob.slot.id],
                    requestStatus: selectedJob.request?.status,
                    slotStatus: selectedJob.slot.status,
                }) || 'scheduled')}
                technicianStatusMessage={technicianStatusMessageBySlotId[selectedJob.slot.id] || ''}
                updating={updatingWorkflowSlotId === selectedJob.slot.id || closingVisitSlotId === selectedJob.slot.id}
                workflowStatus={resolveTechWorkflowVisibleStatus({
                    optimisticStatus: workflowStatusBySlotId[selectedJob.slot.id],
                    requestStatus: selectedJob.request?.status,
                    slotStatus: selectedJob.slot.status,
                }) || 'scheduled'}
            />
        );
    }

    if (activeView === 'schedule') {
        return (
            <TechOSCalendarView
                groups={calendarGroups}
                loading={loading}
                meetings={meetings}
                message={message}
                onCompleteMeeting={onCompleteMeeting}
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
            <TechOSSalesPanel
                activeCompanyId={activeCompanyId}
                technicianCompanyUserId={technicianCompanyUserId}
            />
        );
    }

    if (activeView === 'messages') {
        return (
            <TechOSMessageThreadsPanel
                jobs={[...activeJobs, ...historyJobs]}
            />
        );
    }

    if (activeView === 'time-clock') {
        return (
            <TechOSTimeClockPanel
                initialStep={timeClockInitialStep}
                onBack={onCloseTimeClock}
                onEntriesChange={onTimeEntriesChange}
                technicianCompanyUserId={technicianCompanyUserId}
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

function TechOSSalesPanel({
    activeCompanyId,
    technicianCompanyUserId,
}: {
    activeCompanyId: string;
    technicianCompanyUserId: string;
}) {
    const { theme } = useTheme();
    const [records, setRecords] = useState<SoldJobRecord[]>([]);
    const [salesMessage, setSalesMessage] = useState('Loading sold jobs...');

    useEffect(() => {
        if (!activeCompanyId || !technicianCompanyUserId) {
            setRecords([]);
            setSalesMessage('A technician profile is required to load sales.');
            return;
        }

        let active = true;
        void loadSoldJobsForTechnician(activeCompanyId, technicianCompanyUserId)
            .then((nextRecords) => {
                if (!active) return;
                setRecords(nextRecords);
                setSalesMessage(nextRecords.length === 0 ? 'No sold jobs yet.' : '');
            })
            .catch((error) => {
                if (active) setSalesMessage(`Sold jobs could not load: ${getErrorMessage(error)}`);
            });

        return () => {
            active = false;
        };
    }, [activeCompanyId, technicianCompanyUserId]);

    const soldTotal = records.reduce((total, record) => total + record.selectedTotal, 0);

    return (
        <ThemedCard style={assignedJobsSectionStyle}>
            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Sales</Text>
            <Text style={[summaryValueStyle, { color: '#36D994' }]}>{formatTechOSMoney(soldTotal)}</Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                {records.length} sold job{records.length === 1 ? '' : 's'} assigned to this technician
            </Text>
            {!!salesMessage && <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{salesMessage}</Text>}
            <View style={assignedJobGridStyle}>
                {records.map((record) => (
                    <View key={record.id} style={[assignedJobCardStyle, { borderColor: '#2CA875', backgroundColor: theme.colors.surface }]}>
                        <Text style={[jobStatusBadgeStyle, { color: '#073523', backgroundColor: '#8CF0C1' }]}>JOB SOLD</Text>
                        <Text style={[summaryValueStyle, { color: theme.colors.text }]}>{formatTechOSMoney(record.selectedTotal)}</Text>
                        <Text style={[jobTitleStyle, { color: theme.colors.text }]}>
                            {record.homeownerName || 'Homeowner'}
                        </Text>
                        <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                            Sold {formatTechOSDateTime(record.soldAt)}
                        </Text>
                        {record.selectedOptions.map((option) => (
                            <View key={option.id} style={{ gap: 3 }}>
                                <Text style={[clientNameStyle, { color: theme.colors.text }]}>{option.title}</Text>
                                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                                    {option.homeownerExplanation}
                                </Text>
                            </View>
                        ))}
                        <Text style={[clientMetaTextStyle, { color: theme.colors.primary, fontWeight: '800' }]}>
                            Next: {getSoldJobNextAction(record)}
                        </Text>
                    </View>
                ))}
            </View>
        </ThemedCard>
    );
}

function TechOSSoldJobRecord({
    scheduleSlotId,
    techOSTheme,
}: {
    scheduleSlotId: string;
    techOSTheme: TechOSThemePalette;
}) {
    const [record, setRecord] = useState<SoldJobRecord | null>(null);
    const [recordMessage, setRecordMessage] = useState('');

    useEffect(() => {
        let active = true;
        void loadSoldJobForScheduleSlot(scheduleSlotId)
            .then((nextRecord) => {
                if (active) setRecord(nextRecord);
            })
            .catch((error) => {
                if (active) setRecordMessage(`Sold job record could not load: ${getErrorMessage(error)}`);
            });
        return () => {
            active = false;
        };
    }, [scheduleSlotId]);

    if (!record && !recordMessage) return null;

    return (
        <TechOSDetailSection
            title="Sold Job Record"
            description="Persistent approved scope, selling price, and next action for this technician."
            techOSTheme={techOSTheme}
            variantKey="estimate"
        >
            {!!recordMessage && <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>{recordMessage}</Text>}
            {!!record && (
                <>
                    <View style={techJobDetailInfoGridStyle}>
                        <TechJobDetailInfo label="Status" value="Job Sold" techOSTheme={techOSTheme} />
                        <TechJobDetailInfo label="Sold Total" value={formatTechOSMoney(record.selectedTotal)} techOSTheme={techOSTheme} />
                        <TechJobDetailInfo label="Approved By" value={record.homeownerName || 'Homeowner'} techOSTheme={techOSTheme} />
                        <TechJobDetailInfo label="Sold At" value={formatTechOSDateTime(record.soldAt)} techOSTheme={techOSTheme} />
                    </View>
                    {record.selectedOptions.map((option) => (
                        <View key={option.id} style={[emptyClientStateStyle, { borderColor: techOSTheme.panelBorderColor }]}>
                            <Text style={[clientNameStyle, { color: techOSTheme.textColor }]}>{option.title}</Text>
                            <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                                {formatTechOSMoney(option.pricingResult.totalAmount)} · {option.homeownerExplanation}
                            </Text>
                            {option.pricingResult.lineItems.map((line) => (
                                <Text key={`${option.id}-${line.id}`} style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                                    • {line.name} × {line.quantity}
                                </Text>
                            ))}
                        </View>
                    ))}
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.textColor, fontWeight: '800' }]}>
                        Next action: {getSoldJobNextAction(record)}
                    </Text>
                    <ThemedButton
                        title={record.status === 'work_complete' ? 'Open Homeowner Completion Signature' : 'Open Sold Job Workflow'}
                        variant="primary"
                        onPress={() => router.push({
                            pathname: '/job-workflow',
                            params: {
                                estimateSessionId: record.estimateSessionId,
                                completion: record.status === 'work_complete' ? '1' : '0',
                                source: 'techos',
                                returnTo: `/techos?companyId=${encodeURIComponent(record.companyId)}`,
                            },
                        } as any)}
                        style={assignedJobActionButtonStyle}
                    />
                </>
            )}
        </TechOSDetailSection>
    );
}

function TechOSTimeClockPanel({
    initialStep,
    onBack,
    onEntriesChange,
    technicianCompanyUserId,
}: {
    initialStep: TechOSTimeClockStep;
    onBack: () => void;
    onEntriesChange: (entries: TechnicianTimeEntry[]) => void;
    technicianCompanyUserId: string;
}) {
    const { theme } = useTheme();
    const [activeStep, setActiveStep] = useState<TechOSTimeClockStep>(initialStep);
    const [entries, setEntries] = useState<TechnicianTimeEntry[]>([]);
    const [clockMessage, setClockMessage] = useState('Loading time clock...');
    const [updatingClock, setUpdatingClock] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [correctionMode, setCorrectionMode] = useState<'clock_in' | 'clock_out'>('clock_in');
    const [correctionTime, setCorrectionTime] = useState('08:00');
    const [correctionReason, setCorrectionReason] = useState('');
    const [dayNotes, setDayNotes] = useState('');
    const [injuryReported, setInjuryReported] = useState(false);
    const [injuryDetails, setInjuryDetails] = useState('');
    const [daySignature, setDaySignature] = useState('');

    useEffect(() => {
        setActiveStep(initialStep);
    }, [initialStep]);

    const refreshClock = useCallback(async () => {
        if (!technicianCompanyUserId) {
            setEntries([]);
            onEntriesChange([]);
            setClockMessage('A technician profile is required.');
            return;
        }
        try {
            const nextEntries = await loadTechnicianTimeEntries(technicianCompanyUserId);
            setEntries(nextEntries);
            onEntriesChange(nextEntries);
            setClockMessage('');
        } catch (error) {
            setClockMessage(`Time clock could not load: ${getErrorMessage(error)}`);
        }
    }, [onEntriesChange, technicianCompanyUserId]);

    useEffect(() => {
        void refreshClock();
    }, [refreshClock]);

    const openEntry = entries.find((entry) => !entry.clockedOutAt) || null;
    const latestEntry = entries[0] || null;
    const activeBreak = !!openEntry?.breakStartedAt && !openEntry.breakEndedAt;
    const activeRestBreak = !!openEntry?.restBreakStartedAt;
    const summaryEntry = openEntry || latestEntry;
    const hourSummary = summaryEntry
        ? getTechnicianShiftHourSummary(summaryEntry, now)
        : { regularSeconds: 0, overtimeSeconds: 0, workedSeconds: 0 };
    const mealRecorded = !!openEntry && (openEntry.breakMinutes >= 30 || !!openEntry.breakStartedAt);
    const workedSeconds = openEntry ? hourSummary.workedSeconds : 0;
    const overtimeWarningState = openEntry ? getTechnicianOvertimeWarningState(workedSeconds) : 'none';
    const overtimeApproaching = overtimeWarningState === 'approaching';
    const overtimeActive = overtimeWarningState === 'overtime';
    const overtimeRemainingSeconds = Math.max(0, REGULAR_SHIFT_SECONDS - workedSeconds);
    const openEntryId = openEntry?.id || '';

    useEffect(() => {
        if (!openEntryId) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [openEntryId]);

    async function toggleClock() {
        if (!technicianCompanyUserId || updatingClock) return;
        const wasClockedIn = !!openEntry;
        setUpdatingClock(true);
        setClockMessage(wasClockedIn ? 'Clocking out...' : 'Clocking in...');
        try {
            await setTechnicianClock(technicianCompanyUserId, wasClockedIn ? 'clock_out' : 'clock_in');
            await refreshClock();
            setClockMessage(wasClockedIn ? 'Clocked out. Review and submit your workday.' : 'Clocked in.');
            setActiveStep(wasClockedIn ? 'day-submit' : 'overview');
        } catch (error) {
            setClockMessage(`Time clock update failed: ${getErrorMessage(error)}`);
        } finally {
            setUpdatingClock(false);
        }
    }

    async function runTimeEntryAction(
        action: 'start_break' | 'end_break' | 'add_30_minute_break' | 'start_rest_break' | 'end_rest_break',
        nextStep?: TechOSTimeClockStep
    ) {
        if (!technicianCompanyUserId || updatingClock) return;
        setUpdatingClock(true);
        setClockMessage('Updating lunch break...');
        try {
            await manageTechnicianTimeEntry(technicianCompanyUserId, action);
            await refreshClock();
            setClockMessage(
                action === 'start_break' ? 'Lunch started.'
                    : action === 'end_break' ? 'Lunch ended.'
                        : action === 'start_rest_break' ? 'Rest break started.'
                            : action === 'end_rest_break' ? 'Rest break ended.'
                                : 'Your previously taken 30-minute lunch was recorded.'
            );
            if (nextStep) setActiveStep(nextStep);
        } catch (error) {
            setClockMessage(`Lunch update failed: ${getErrorMessage(error)}`);
        } finally {
            setUpdatingClock(false);
        }
    }

    async function submitForgottenClockIn() {
        const [hourText, minuteText] = correctionTime.split(':');
        const requested = new Date();
        requested.setHours(Number(hourText), Number(minuteText), 0, 0);
        setUpdatingClock(true);
        setClockMessage('Capturing location and sending clock-in correction for approval...');
        try {
            const location = await captureBrowserClockLocation();
            if (correctionMode === 'clock_out') {
                await requestClockOutCorrection({
                    technicianCompanyUserId,
                    requestedClockOutAt: requested.toISOString(),
                    reason: correctionReason,
                    latitude: location?.latitude,
                    longitude: location?.longitude,
                    accuracyMeters: location?.accuracy,
                });
            } else {
                await requestClockInCorrection({
                    technicianCompanyUserId,
                    requestedClockInAt: requested.toISOString(),
                    reason: correctionReason,
                    latitude: location?.latitude,
                    longitude: location?.longitude,
                    accuracyMeters: location?.accuracy,
                });
            }
            setCorrectionReason('');
            setClockMessage('Correction sent to Dispatch. Your time will not change unless it is approved.');
            setActiveStep('overview');
        } catch (error) {
            setClockMessage(`Correction request failed: ${getErrorMessage(error)}`);
        } finally {
            setUpdatingClock(false);
        }
    }

    async function submitDay() {
        if (!latestEntry || updatingClock) return;
        setUpdatingClock(true);
        setClockMessage('Submitting signed workday...');
        try {
            await manageTechnicianTimeEntry(technicianCompanyUserId, 'submit_day', {
                notes: dayNotes,
                injury_reported: injuryReported,
                injury_details: injuryDetails,
                signature: daySignature,
            });
            await refreshClock();
            setClockMessage('Workday signed and submitted.');
            setActiveStep('overview');
        } catch (error) {
            setClockMessage(`Workday submission failed: ${getErrorMessage(error)}`);
        } finally {
            setUpdatingClock(false);
        }
    }

    async function requestOvertimeApproval() {
        if (!technicianCompanyUserId || updatingClock) return;
        setUpdatingClock(true);
        setClockMessage('Sending overtime request to Dispatch...');
        try {
            await requestTimeApproval(technicianCompanyUserId, 'overtime');
            setClockMessage('Overtime approval request sent to Dispatch.');
            setActiveStep('overview');
        } catch (error) {
            setClockMessage(`Overtime request failed: ${getErrorMessage(error)}`);
        } finally {
            setUpdatingClock(false);
        }
    }

    const stepTitle: Record<TechOSTimeClockStep, string> = {
        overview: 'Time Clock',
        lunch: 'Lunch Check',
        overtime: 'Overtime Review',
        'clock-out': 'Clock Out',
        correction: 'Time Correction',
        'day-submit': 'Submit Workday',
        history: 'Time Clock History',
    };

    function renderHourSummary() {
        return (
            <>
                <View style={techHourSummaryGridStyle}>
                    {[
                        { label: 'REGULAR', seconds: hourSummary.regularSeconds },
                        { label: 'OVERTIME', seconds: hourSummary.overtimeSeconds },
                        { label: 'TOTAL', seconds: hourSummary.workedSeconds },
                    ].map((item) => (
                        <View
                            key={item.label}
                            style={[
                                techHourSummaryCardStyle,
                                {
                                    backgroundColor: theme.colors.background,
                                    borderColor: item.label === 'OVERTIME' && item.seconds > 0
                                        ? '#55A7E8'
                                        : theme.colors.border,
                                },
                            ]}
                        >
                            <Text selectable style={[techHourSummaryLabelStyle, { color: theme.colors.mutedText }]}>
                                {item.label}
                            </Text>
                            <Text
                                selectable
                                style={[
                                    techHourSummaryValueStyle,
                                    { color: item.label === 'OVERTIME' && item.seconds > 0 ? '#55A7E8' : theme.colors.text },
                                ]}
                            >
                                {formatTechnicianClock(item.seconds)}
                            </Text>
                        </View>
                    ))}
                </View>
                <Text selectable style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                    {summaryEntry
                        ? `${openEntry ? 'Current' : 'Latest'} shift · recorded lunch is excluded from worked time`
                        : 'No shift recorded yet'}
                </Text>
            </>
        );
    }

    function renderOverview() {
        return (
            <>
                <Text style={[summaryValueStyle, { color: openEntry ? '#36D994' : theme.colors.text }]}>
                    {openEntry ? 'Clocked In' : 'Clocked Out'}
                </Text>
                {renderHourSummary()}
                {!!openEntry && (
                    <View
                        style={[
                            techRunningClockStyle,
                            {
                                backgroundColor: overtimeActive ? '#123E68' : overtimeApproaching ? '#7A4A00' : '#DFF8EA',
                                borderColor: overtimeActive ? '#55A7E8' : overtimeApproaching ? '#FFD166' : '#79D5A5',
                            },
                        ]}
                    >
                        <Text style={[techClockElapsedStyle, { color: overtimeWarningState === 'none' ? '#123E2C' : '#FFFFFF' }]}>
                            {formatTechnicianClock(hourSummary.workedSeconds)}
                        </Text>
                        <Text style={[clientMetaTextStyle, { color: overtimeWarningState === 'none' ? '#315C4A' : '#FFFFFF' }]}>
                            Worked time since {formatTechOSDateTime(openEntry.clockedInAt)}
                        </Text>
                    </View>
                )}
                {overtimeWarningState !== 'none' && (
                    <View style={[techMealWarningStyle, { backgroundColor: '#7A4A00', borderColor: '#FFD166' }]}>
                        <Text style={techMealWarningTitleStyle}>
                            {overtimeActive
                                ? 'Eight regular hours reached'
                                : `Overtime begins in ${formatTechnicianHours(overtimeRemainingSeconds)}`}
                        </Text>
                        <Text style={techMealWarningBodyStyle}>
                            {mealRecorded
                                ? 'Lunch is recorded. Review your time and request Dispatch approval before overtime.'
                                : 'Have you taken your 30-minute lunch? Review it before requesting overtime approval.'}
                        </Text>
                    </View>
                )}
                {!!openEntry && (
                    <View style={{ gap: 10 }}>
                        <ThemedButton
                            title={activeBreak ? 'Lunch in Progress — Open Lunch' : 'Review Lunch & Breaks'}
                            variant="secondary"
                            onPress={() => setActiveStep('lunch')}
                            style={assignedJobActionButtonStyle}
                        />
                        {overtimeWarningState !== 'none' && (
                            <ThemedButton
                                title="Review Overtime Approval"
                                variant="secondary"
                                onPress={() => setActiveStep('overtime')}
                                style={assignedJobActionButtonStyle}
                            />
                        )}
                        <ThemedButton
                            title="Clock Out"
                            variant="primary"
                            onPress={() => setActiveStep('clock-out')}
                            style={assignedJobActionButtonStyle}
                        />
                    </View>
                )}
                {!openEntry && (
                    <View style={{ gap: 10 }}>
                        {!!latestEntry?.clockedOutAt && !latestEntry.submittedAt && (
                            <ThemedButton
                                title="Review and Submit Workday"
                                variant="primary"
                                onPress={() => setActiveStep('day-submit')}
                                style={assignedJobActionButtonStyle}
                            />
                        )}
                        <ThemedButton
                            title={updatingClock ? 'Clocking In...' : 'Clock In'}
                            variant="primary"
                            disabled={!technicianCompanyUserId || updatingClock}
                            onPress={toggleClock}
                            style={assignedJobActionButtonStyle}
                        />
                        <View style={techWorkflowActionGridStyle}>
                            <ThemedButton
                                title="Forgot to Clock In?"
                                variant="secondary"
                                onPress={() => {
                                    setCorrectionMode('clock_in');
                                    setActiveStep('correction');
                                }}
                                style={techWorkflowActionButtonStyle}
                            />
                            <ThemedButton
                                title="Forgot to Clock Out?"
                                variant="secondary"
                                disabled={!latestEntry}
                                onPress={() => {
                                    setCorrectionMode('clock_out');
                                    setActiveStep('correction');
                                }}
                                style={techWorkflowActionButtonStyle}
                            />
                        </View>
                    </View>
                )}
                <ThemedButton
                    title="View Time History"
                    variant="secondary"
                    onPress={() => setActiveStep('history')}
                    style={assignedJobActionButtonStyle}
                />
            </>
        );
    }

    function renderLunchStep() {
        return (
            <>
                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Have you taken your 30-minute lunch?</Text>
                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                    Record only the lunch you actually took. Lunch time is excluded from worked hours.
                    {' '}If you already took lunch without using the clock, record those 30 minutes after clocking out and before submitting the day.
                </Text>
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientNameStyle, { color: theme.colors.text }]}>Current lunch record</Text>
                    <Text style={[summaryValueStyle, { color: theme.colors.text }]}>
                        {activeBreak ? 'In progress' : `${openEntry?.breakMinutes || latestEntry?.breakMinutes || 0} min`}
                    </Text>
                </View>
                {!!openEntry && (
                    <View style={{ gap: 10 }}>
                        <ThemedButton
                            title={activeBreak ? 'End Lunch Now' : 'Start Lunch Now'}
                            variant="primary"
                            disabled={updatingClock || (!activeBreak && openEntry.breakMinutes >= 30)}
                            onPress={() => runTimeEntryAction(activeBreak ? 'end_break' : 'start_break', 'overview')}
                            style={assignedJobActionButtonStyle}
                        />
                        <ThemedButton
                            title={activeRestBreak ? 'End Rest Break' : 'Take a 10-Minute Rest Break'}
                            variant="secondary"
                            disabled={updatingClock || activeBreak}
                            onPress={() => runTimeEntryAction(activeRestBreak ? 'end_rest_break' : 'start_rest_break', 'overview')}
                            style={assignedJobActionButtonStyle}
                        />
                        {overtimeWarningState !== 'none' && (
                            <ThemedButton
                                title="Continue to Overtime Review"
                                variant="secondary"
                                onPress={() => setActiveStep('overtime')}
                                style={assignedJobActionButtonStyle}
                            />
                        )}
                    </View>
                )}
                {!!latestEntry?.clockedOutAt && latestEntry.breakMinutes < 30 && (
                    <ThemedButton
                        title="I Already Took 30 Minutes — Record It"
                        variant="primary"
                        disabled={updatingClock}
                        onPress={() => runTimeEntryAction('add_30_minute_break', 'day-submit')}
                        style={assignedJobActionButtonStyle}
                    />
                )}
            </>
        );
    }

    function renderOvertimeStep() {
        return (
            <>
                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Review time before overtime</Text>
                {renderHourSummary()}
                <View style={[techMealWarningStyle, { backgroundColor: '#7A4A00', borderColor: '#FFD166' }]}>
                    <Text style={techMealWarningTitleStyle}>
                        {overtimeActive ? 'Overtime has started' : `Overtime begins in ${formatTechnicianHours(overtimeRemainingSeconds)}`}
                    </Text>
                    <Text style={techMealWarningBodyStyle}>
                        {mealRecorded
                            ? 'Your lunch is recorded. Request approval from Dispatch before continuing into overtime.'
                            : 'No 30-minute lunch is recorded. Take lunch now if it is still due. If you already took it without using the clock, record it after clock-out and before submitting the day.'}
                    </Text>
                </View>
                {!mealRecorded && (
                    <ThemedButton
                        title="Review Lunch First"
                        variant="secondary"
                        onPress={() => setActiveStep('lunch')}
                        style={assignedJobActionButtonStyle}
                    />
                )}
                <ThemedButton
                    title={updatingClock ? 'Sending Request...' : 'Request Overtime Approval'}
                    variant="primary"
                    disabled={updatingClock || !openEntry}
                    onPress={requestOvertimeApproval}
                    style={assignedJobActionButtonStyle}
                />
                <ThemedButton
                    title="Clock Out Instead"
                    variant="secondary"
                    onPress={() => setActiveStep('clock-out')}
                    style={assignedJobActionButtonStyle}
                />
            </>
        );
    }

    function renderClockOutStep() {
        return (
            <>
                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Ready to clock out?</Text>
                {renderHourSummary()}
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientNameStyle, { color: theme.colors.text }]}>Lunch record</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        {activeBreak
                            ? 'Lunch is still in progress. End it before clocking out.'
                            : `${openEntry?.breakMinutes || 0} minutes recorded`}
                    </Text>
                </View>
                {!mealRecorded && !activeBreak && (
                    <ThemedButton
                        title="Take Lunch Before Clocking Out"
                        variant="secondary"
                        onPress={() => setActiveStep('lunch')}
                        style={assignedJobActionButtonStyle}
                    />
                )}
                <ThemedButton
                    title={updatingClock ? 'Clocking Out...' : 'Clock Out Now'}
                    variant="primary"
                    disabled={!openEntry || activeBreak || updatingClock}
                    onPress={toggleClock}
                    style={assignedJobActionButtonStyle}
                />
                <ThemedButton
                    title="Keep Working"
                    variant="secondary"
                    onPress={() => setActiveStep('overview')}
                    style={assignedJobActionButtonStyle}
                />
            </>
        );
    }

    function renderCorrectionStep() {
        return (
            <>
                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Request a corrected {correctionMode === 'clock_out' ? 'clock-out' : 'clock-in'}</Text>
                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                    This sends a request to Dispatch. Your time does not change until it is approved.
                </Text>
                <DictationTextInput
                    value={correctionTime}
                    onChangeText={setCorrectionTime}
                    placeholder="08:00"
                    placeholderTextColor={theme.colors.mutedText}
                    style={[techCompactInputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                />
                <DictationTextInput
                    value={correctionReason}
                    onChangeText={setCorrectionReason}
                    placeholder={`Why was the clock-${correctionMode === 'clock_out' ? 'out' : 'in'} missed?`}
                    placeholderTextColor={theme.colors.mutedText}
                    multiline
                    style={[techCustomStatusInputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                />
                <ThemedButton
                    title="Send to Dispatch for Approval"
                    variant="primary"
                    disabled={updatingClock || !/^(0[89]|1\d|2[0-3]):[0-5]\d$/.test(correctionTime) || correctionReason.trim().length < 4}
                    onPress={submitForgottenClockIn}
                    style={assignedJobActionButtonStyle}
                />
            </>
        );
    }

    function renderDaySubmitStep() {
        if (!latestEntry?.clockedOutAt) {
            return (
                <>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Clock out before signing and submitting today.</Text>
                    <ThemedButton title="Return to Time Clock" variant="primary" onPress={() => setActiveStep('overview')} style={assignedJobActionButtonStyle} />
                </>
            );
        }

        if (latestEntry.submittedAt) {
            return (
                <>
                    <Text style={[summaryValueStyle, { color: '#36D994' }]}>Submitted</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Today’s signed workday has been submitted.</Text>
                    <ThemedButton title="Done" variant="primary" onPress={onBack} style={assignedJobActionButtonStyle} />
                </>
            );
        }

        return (
            <>
                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Sign and submit today</Text>
                {latestEntry.breakMinutes < 30 && (
                    <ThemedButton
                        title="Review Missing Lunch"
                        variant="secondary"
                        disabled={updatingClock}
                        onPress={() => setActiveStep('lunch')}
                        style={assignedJobActionButtonStyle}
                    />
                )}
                <DictationTextInput
                    value={dayNotes}
                    onChangeText={setDayNotes}
                    placeholder="Corrections, changes, or notes about today"
                    placeholderTextColor={theme.colors.mutedText}
                    multiline
                    style={[techCustomStatusInputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                />
                <ThemedButton
                    title={injuryReported ? 'Injury Reported: Yes' : 'Any injury today? No'}
                    variant={injuryReported ? 'danger' : 'secondary'}
                    onPress={() => setInjuryReported((current) => !current)}
                    style={assignedJobActionButtonStyle}
                />
                {injuryReported && (
                    <DictationTextInput
                        value={injuryDetails}
                        onChangeText={setInjuryDetails}
                        placeholder="Describe the injury and immediate action taken"
                        placeholderTextColor={theme.colors.mutedText}
                        multiline
                        style={[techCustomStatusInputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                )}
                <SignaturePad label="Technician daily signature" value={daySignature} onChange={setDaySignature} />
                <ThemedButton
                    title="Sign and Submit Workday"
                    variant="primary"
                    disabled={updatingClock || !isDrawnSignature(daySignature) || (injuryReported && injuryDetails.trim().length < 4)}
                    onPress={submitDay}
                    style={assignedJobActionButtonStyle}
                />
            </>
        );
    }

    function renderHistoryStep() {
        return entries.length === 0 ? (
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>No time clock history yet.</Text>
        ) : (
            <View style={{ gap: 10 }}>
                {entries.map((entry) => (
                    <View key={entry.id} style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                        <Text style={[clientMetaTextStyle, { color: theme.colors.text }]}>
                            {formatTechOSDateTime(entry.clockedInAt)} → {entry.clockedOutAt ? formatTechOSDateTime(entry.clockedOutAt) : 'In progress'}
                        </Text>
                        <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                            {formatTimeEntryDuration(entry, now)} · Lunch {entry.breakMinutes}m · Rest breaks {entry.restBreakMinutes}m
                        </Text>
                        {entry.mealExceptionReported && (
                            <Text style={[clientMetaTextStyle, { color: '#FF8A80' }]}>Meal exception requires office review</Text>
                        )}
                        {!!entry.submittedAt && (
                            <Text style={[clientMetaTextStyle, { color: '#36D994' }]}>Signed and submitted</Text>
                        )}
                    </View>
                ))}
            </View>
        );
    }

    const activeContent = activeStep === 'overview' ? renderOverview()
        : activeStep === 'lunch' ? renderLunchStep()
            : activeStep === 'overtime' ? renderOvertimeStep()
                : activeStep === 'clock-out' ? renderClockOutStep()
                    : activeStep === 'correction' ? renderCorrectionStep()
                        : activeStep === 'day-submit' ? renderDaySubmitStep()
                            : renderHistoryStep();

    return (
        <ThemedCard style={assignedJobsSectionStyle}>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
                <ThemedButton
                    title={activeStep === 'overview' ? 'Back to TechOS' : 'Back'}
                    variant="secondary"
                    onPress={activeStep === 'overview' ? onBack : () => setActiveStep('overview')}
                    style={{ flexGrow: 0, minWidth: 110 }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>TIMEKEEPING</Text>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text, marginBottom: 0 }]}>{stepTitle[activeStep]}</Text>
                </View>
            </View>
            {!!clockMessage && <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{clockMessage}</Text>}
            {activeContent}
        </ThemedCard>
    );
}

async function captureBrowserClockLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

    return new Promise<{ latitude: number; longitude: number; accuracy: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
            }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    });
}

function getOrCreateTechOSDeviceKey() {
    const storageKey = 'techos-device-key-v1';
    if (typeof window !== 'undefined') {
        const existing = window.localStorage.getItem(storageKey);
        if (existing) return existing;
        const created = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`;
        window.localStorage.setItem(storageKey, created);
        return created;
    }
    return `${Date.now()}-${Math.random()}-${Math.random()}`;
}

function formatTechOSMoney(value: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatTechOSDateTime(value: string | null) {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatTimeEntryDuration(entry: TechnicianTimeEntry, now = Date.now()) {
    const start = new Date(entry.clockedInAt).getTime();
    const end = entry.clockedOutAt ? new Date(entry.clockedOutAt).getTime() : now;
    const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s${entry.clockedOutAt ? '' : ' so far'}`;
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
    const variant = techOSTheme.dashboard.estimates;

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
    const groupedJobIds = new Set([
        ...(todayJobs || []),
        ...(futureJobs || []),
    ].map((job) => job.slot.id));
    const activeUngroupedJobs = shouldShowTodayAndFuture
        ? jobs.filter((job) => !groupedJobIds.has(job.slot.id))
        : [];
    const groupedJobCount = (todayJobs?.length || 0) + (futureJobs?.length || 0) + activeUngroupedJobs.length;
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
                    {!!activeUngroupedJobs.length && (
                        <AssignedScheduleJobGroup
                            title="Active Jobs"
                            jobs={activeUngroupedJobs}
                            onOpenDetails={onOpenDetails}
                        />
                    )}
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
        `company_user_ids=${diagnostics.companyUserIds.map(shortId).join(',') || 'none'}`,
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
    meetings,
    message,
    onCompleteMeeting,
    onRefresh,
    onOpenDetails,
}: {
    groups: { key: string; label: string; jobs: TechAssignedScheduleJob[] }[];
    loading: boolean;
    meetings: CompanyScheduleMeeting[];
    message: string;
    onCompleteMeeting: (meeting: CompanyScheduleMeeting) => void;
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
                        Customer jobs and team meetings assigned to your technician profile.
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

            {meetings.length > 0 && (
                <View style={[calendarDayBlockStyle, { borderColor: theme.colors.border, marginBottom: 12 }]}>
                    <View style={calendarDayHeaderStyle}>
                        <Text style={[calendarDayTitleStyle, { color: theme.colors.text }]}>Team Meetings</Text>
                        <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                            {meetings.length} meeting{meetings.length === 1 ? '' : 's'}
                        </Text>
                    </View>
                    <View style={assignedJobGridStyle}>
                        {meetings.map((meeting) => (
                            <TechOSMeetingCard
                                key={meeting.id}
                                meeting={meeting}
                                onComplete={() => onCompleteMeeting(meeting)}
                            />
                        ))}
                    </View>
                </View>
            )}

            {groups.length === 0 && meetings.length === 0 ? (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientNameStyle, { color: theme.colors.text }]}>No scheduled items yet</Text>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                        Jobs and meetings appear here when the office adds you to the schedule.
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

function TechOSMeetingCard({
    meeting,
    onComplete,
}: {
    meeting: CompanyScheduleMeeting;
    onComplete: () => void;
}) {
    const { theme } = useTheme();
    const completed = normalizeStatus(meeting.status) === 'completed';

    return (
        <View style={[assignedJobCardStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={assignedJobTopRowStyle}>
                <Text style={[jobNumberStyle, { color: theme.colors.primary }]}>TEAM MEETING</Text>
                <Text style={[jobStatusBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {completed ? 'Completed' : 'Scheduled'}
                </Text>
            </View>
            <Text style={[jobTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>{meeting.title}</Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                {formatDateTime(meeting.start_at)} - {formatTime(meeting.end_at)}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.text }]} numberOfLines={2}>
                With {meeting.attendees.map((attendee) => attendee.display_name).join(', ')}
            </Text>
            {!!meeting.notes && (
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={3}>{meeting.notes}</Text>
            )}
            {!completed && (
                <ThemedButton
                    title="Mark Meeting Complete"
                    variant="secondary"
                    onPress={onComplete}
                    style={assignedJobActionButtonStyle}
                />
            )}
        </View>
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
    const visibleStatus = getAssignedJobVisibleWorkflowStatus(job);
    const codeLabel = getTechOSAssignedJobHeaderLabel(job);

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
                <Text style={[jobNumberStyle, { color: theme.colors.mutedText }]}>{codeLabel}</Text>
                <Text style={[jobStatusBadgeStyle, { color: theme.colors.secondaryButtonText, backgroundColor: theme.colors.secondaryButton }]}>
                    {formatTechWorkflowStatusText(visibleStatus)}
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
            {!!job.slot.crew_role && (
                <Text style={[clientMetaTextStyle, { color: theme.colors.primary }]}>
                    Your role: {getCompanyScheduleCrewRoleLabel(job.slot.crew_role)}
                    {job.slot.crew && job.slot.crew.length > 1 ? ` · Crew of ${job.slot.crew.length}` : ''}
                </Text>
            )}
            {!!job.slot.tech_status_note && (
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                    Tech note: {job.slot.tech_status_note}
                </Text>
            )}
            {!!onOpenDetails && (
                <ThemedButton
                    title="Open Job"
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
    onRunWorkflowAction,
    onRunTechnicianNextJobStatusAction,
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
    onCloseServiceVisit: (outcomeOverride?: ServiceVisitOutcome) => void;
    onOpenClientHomeOS: () => void;
    onOpenEstimate: () => void;
    onRunWorkflowAction: (job: TechAssignedScheduleJob, action: TechWorkflowAction, statusNote?: string) => void;
    onRunTechnicianNextJobStatusAction: (action: TechnicianNextJobStatusAction) => void;
    technicianStatusMessage: string;
    updating: boolean;
    workflowStatus: string;
}) {
    const title = getAssignedJobTitle(job);
    const location = getAssignedJobLocation(job);
    const requestReference = getTechOSAssignedJobRequestReference(job);
    const headerLabel = getTechOSAssignedJobHeaderLabel(job);
    const trimmedCustomStatusNote = customStatusNote.trim();
    const clientContext = getTechOSClientJobContext(job);
    const canOpenClientHomeOS = hasTechOSClientHomeContext(clientContext);
    const estimateActionLabel = getTechOSEstimateActionLabel(estimateDraftCount);
    const [openSectionKey, setOpenSectionKey] = useState<TechOSJobWorkspaceSectionKey | null>(null);
    const [preArrivalJobCardOpen, setPreArrivalJobCardOpen] = useState(false);
    const [showMoreWorkflowActions, setShowMoreWorkflowActions] = useState(false);
    const [nextActionPickerOpen, setNextActionPickerOpen] = useState(false);
    const [statusNotePickerOpen, setStatusNotePickerOpen] = useState(false);
    const [selectedStatusNotePreset, setSelectedStatusNotePreset] = useState('custom');
    const workflowActionPresentation = resolveTechWorkflowActionPresentation(workflowStatus);
    const primaryWorkflowActions = workflowActionPresentation.filter((action) => action.primary);
    const travelWorkflowAction = primaryWorkflowActions.find((action) => ['on_my_way', 'arrived'].includes(action.key));
    const startWorkAction = primaryWorkflowActions.find((action) => action.key === 'in_progress');
    const moreWorkflowActions = workflowActionPresentation.filter(isSecondaryTechWorkflowAction);
    const noPrimaryWorkflowActionMessage = getTechWorkflowNextStepMessage(workflowStatus) ||
        'There is no next workflow action for the current status.';
    const nextJobAvailability = getNextJobAvailabilitySectionState();
    const canControlWorkflow = canScheduleCrewRoleControlWorkflow(job.slot.crew_role);
    const visitCloseable = canControlWorkflow && isTechOSVisitCloseable(job.slot);
    const chatServiceRequestId = String(job.request?.id || job.slot.service_request_id || '').trim();

    if (!isTechOSWorksiteStage(workflowStatus)) {
        return (
            <View style={[techJobDetailStyle, { borderColor: techOSTheme.panelBorderColor, backgroundColor: techOSTheme.panelBackgroundColor }]}>
                <View style={techJobDetailHeaderStyle}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[jobNumberStyle, { color: techOSTheme.mutedTextColor }]}>{headerLabel}</Text>
                        <Text style={[jobTitleStyle, { color: techOSTheme.textColor, marginBottom: 4 }]} numberOfLines={2}>
                            {title}
                        </Text>
                        <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>{location}</Text>
                    </View>
                    <ThemedButton
                        title={backLabel}
                        variant="secondary"
                        onPress={onBack}
                        style={techJobDetailBackButtonStyle}
                    />
                </View>

                <View style={[techJobWorkspaceIntroStyle, { borderColor: techOSTheme.panelBorderColor }]}>
                    <Text style={[jobAssignmentTitleStyle, { color: techOSTheme.textColor }]}>Travel to Job</Text>
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>Update Dispatch and the homeowner while you travel. The worksite tools open after you arrive.</Text>
                    <Text style={[techJobWorkspaceCurrentStatusStyle, { color: techOSTheme.textColor }]}>Current: {formatTechWorkflowStatusText(workflowStatus)}</Text>
                </View>

                <ThemedButton
                    title={preArrivalJobCardOpen ? 'Hide Job Card' : 'View Job Card'}
                    variant="secondary"
                    onPress={() => setPreArrivalJobCardOpen((current) => !current)}
                    style={assignedJobActionButtonStyle}
                />

                {preArrivalJobCardOpen && (
                    <TechOSDetailSection
                        title="Customer Request"
                        description="The original information, photos, and videos the homeowner sent with this job."
                        techOSTheme={techOSTheme}
                        variantKey="request"
                        onClose={() => setPreArrivalJobCardOpen(false)}
                    >
                        <View style={techJobDetailInfoGridStyle}>
                            <TechJobDetailInfo label="Home / Request" value={location} techOSTheme={techOSTheme} />
                            <TechJobDetailInfo label="Request" value={requestReference} techOSTheme={techOSTheme} />
                            <TechJobDetailInfo label="Request Type" value={formatLabel(job.request?.request_type || 'service request')} techOSTheme={techOSTheme} />
                            <TechJobDetailInfo label="Priority" value={formatLabel(job.slot.priority || job.request?.priority || 'normal')} techOSTheme={techOSTheme} />
                            <TechJobDetailInfo label="Submitted" value={formatDateTime(job.request?.created_at)} techOSTheme={techOSTheme} />
                        </View>
                        <Text style={[clientMetaTextStyle, { color: techOSTheme.textColor, marginTop: 10 }]}>
                            {job.request?.issue_summary || job.slot.notes || 'No request description was provided.'}
                        </Text>
                        {!!chatServiceRequestId ? (
                            <ServiceRequestMediaGallery
                                serviceRequestId={chatServiceRequestId}
                                title="Homeowner photos and videos"
                            />
                        ) : (
                            <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor, marginTop: 10 }]}>No customer request media is linked to this job.</Text>
                        )}
                    </TechOSDetailSection>
                )}

                <TechOSDetailSection
                    title="Travel Status"
                    description="Use the next step below. Arrival opens the job worksite for notes, photos, estimates, and the rest of the visit."
                    techOSTheme={techOSTheme}
                    variantKey="workflow"
                >
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>Arrival window: {formatArrivalWindow(job.slot)}</Text>
                    {!canControlWorkflow && (
                        <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor, marginTop: 8 }]}>Only the lead technician can change the customer-facing travel status for this shared job.</Text>
                    )}
                    {!!message && (
                        <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor, marginTop: 8 }]}>{message}</Text>
                    )}
                    <View style={techWorkflowActionGridStyle}>
                        {travelWorkflowAction ? (
                            <ThemedButton
                                title={updating ? 'Updating...' : travelWorkflowAction.label}
                                variant="primary"
                                disabled={updating || !canControlWorkflow}
                                onPress={() => onRunWorkflowAction(job, travelWorkflowAction)}
                                style={techWorkflowActionButtonStyle}
                                textStyle={techWorkflowActionButtonTextStyle}
                            />
                        ) : (
                            <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>{noPrimaryWorkflowActionMessage}</Text>
                        )}
                        <ThemedButton
                            title={updating ? 'Updating...' : 'Running Late'}
                            variant="secondary"
                            disabled={updating || !canControlWorkflow}
                            onPress={() => onRunWorkflowAction(job, TECH_CUSTOM_STATUS_ACTION, 'Running late. Dispatch has been notified.')}
                            style={techWorkflowActionButtonStyle}
                            textStyle={techWorkflowActionButtonTextStyle}
                        />
                    </View>
                </TechOSDetailSection>
            </View>
        );
    }

    return (
        <View style={[techJobDetailStyle, { borderColor: techOSTheme.panelBorderColor, backgroundColor: techOSTheme.panelBackgroundColor }]}>
            <View style={techJobDetailHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[jobNumberStyle, { color: techOSTheme.mutedTextColor }]}>{headerLabel}</Text>
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

            <View style={[techJobWorkspaceIntroStyle, { borderColor: techOSTheme.panelBorderColor }]}>
                <Text style={[jobAssignmentTitleStyle, { color: techOSTheme.textColor }]}>Job Worksite</Text>
                <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>You have arrived. Use these tools for the worksite code, notes, photos, estimates, and closeout.</Text>
                <Text style={[techJobWorkspaceCurrentStatusStyle, { color: techOSTheme.textColor }]}>Current: {formatTechWorkflowStatusText(workflowStatus)}</Text>
                {!!startWorkAction && (
                    <ThemedButton
                        title={updating ? 'Starting Job...' : 'Start Job'}
                        variant="primary"
                        disabled={updating || !canControlWorkflow}
                        onPress={() => onRunWorkflowAction(job, startWorkAction)}
                        style={[assignedJobActionButtonStyle, { marginTop: 10 }]}
                        textStyle={techWorkflowActionButtonTextStyle}
                    />
                )}
                {!!job.slot.crew_role && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor, marginTop: 4 }]}>
                        Your role: {getCompanyScheduleCrewRoleLabel(job.slot.crew_role)}
                        {!canControlWorkflow ? ' · The lead controls customer-facing status and closeout.' : ''}
                    </Text>
                )}
            </View>

            <View style={techJobWorkspaceGridStyle}>
                {TECHOS_JOB_WORKSPACE_SECTIONS.map((section) => {
                    const active = openSectionKey === section.key;
                    const disabled = section.key === 'messages' && !chatServiceRequestId;

                    return (
                        <TechOSJobWorkspaceCard
                            key={section.key}
                            active={active}
                            description={section.description}
                            disabled={disabled}
                            icon={section.icon}
                            onPress={() => {
                                setOpenSectionKey((current) => toggleTechOSJobWorkspaceSection(current, section.key));
                            }}
                            status={getTechOSJobWorkspaceSectionStatus({
                                chatAvailable: Boolean(chatServiceRequestId),
                                estimateDraftCount,
                                job,
                                sectionKey: section.key,
                                visitCloseable,
                                workflowStatus,
                            })}
                            techOSTheme={techOSTheme}
                            title={section.title}
                            variantKey={section.variantKey}
                        />
                    );
                })}
            </View>

            {!openSectionKey && (
                <Text style={[techJobWorkspaceHintStyle, { color: techOSTheme.mutedTextColor }]}>Select a job tool above. Only the section you choose will open.</Text>
            )}

            {openSectionKey === 'summary' && <TechOSDetailSection
                title="Customer and Appointment Summary"
                description="Customer, timing, and request context for this appointment."
                techOSTheme={techOSTheme}
                variantKey="customer"
                onClose={() => setOpenSectionKey(null)}
            >
                <View style={techJobDetailInfoGridStyle}>
                    <TechJobDetailInfo label="Home / Request" value={location} techOSTheme={techOSTheme} />
                    <TechJobDetailInfo label="Arrival Window" value={formatArrivalWindow(job.slot)} techOSTheme={techOSTheme} />
                    <TechJobDetailInfo label="Request" value={requestReference} techOSTheme={techOSTheme} />
                    <TechJobDetailInfo label="Status" value={formatTechWorkflowStatusText(workflowStatus)} techOSTheme={techOSTheme} />
                    <TechJobDetailInfo label="Priority" value={formatLabel(job.slot.priority || job.request?.priority || 'normal')} techOSTheme={techOSTheme} />
                    {!!job.slot.crew_role && (
                        <TechJobDetailInfo label="Your Crew Role" value={getCompanyScheduleCrewRoleLabel(job.slot.crew_role)} techOSTheme={techOSTheme} />
                    )}
                    {!!job.slot.tech_status_note && (
                        <TechJobDetailInfo label="Tech Status Note" value={job.slot.tech_status_note} techOSTheme={techOSTheme} />
                    )}
                    {!!job.slot.visit_outcome && (
                        <TechJobDetailInfo label="Visit Outcome" value={getServiceVisitOutcomeLabel(job.slot.visit_outcome)} techOSTheme={techOSTheme} />
                    )}
                </View>
                <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor, marginTop: 10 }]}>
                    {job.request?.issue_summary || job.slot.notes || 'No request summary provided.'}
                </Text>
                {!!job.slot.crew?.length && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor, marginTop: 8 }]}>
                        Crew: {job.slot.crew.map((assignment) => `${assignment.display_name} (${getCompanyScheduleCrewRoleLabel(assignment.role_on_schedule)})`).join(', ')}
                    </Text>
                )}
                <View style={techWorkflowActionGridStyle}>
                    <ThemedButton
                        title="Open Client HomeOS"
                        variant="secondary"
                        disabled={!canOpenClientHomeOS}
                        onPress={onOpenClientHomeOS}
                        style={techWorkflowActionButtonStyle}
                        textStyle={techWorkflowActionButtonTextStyle}
                    />
                </View>
                {!canOpenClientHomeOS && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                        Client HomeOS needs an assigned request with a property id.
                    </Text>
                )}
            </TechOSDetailSection>}

            {openSectionKey === 'messages' && !!chatServiceRequestId && (
                <TechOSDetailSection
                    title="Message Dispatch"
                    description="Send a quick job message or ask Dispatch for assistance."
                    techOSTheme={techOSTheme}
                    variantKey="note"
                    onClose={() => setOpenSectionKey(null)}
                >
                    <TechnicianDispatchChat
                        companyId={job.slot.company_id}
                        serviceRequestId={chatServiceRequestId}
                        techOSTheme={techOSTheme}
                    />
                </TechOSDetailSection>
            )}

            {openSectionKey === 'media' && <TechOSDetailSection
                title="Homeowner Photos and Videos"
                description="Media uploaded with this customer request."
                techOSTheme={techOSTheme}
                variantKey="request"
                onClose={() => setOpenSectionKey(null)}
            >
                <ServiceRequestMediaGallery
                    serviceRequestId={job.request?.id || job.slot.service_request_id}
                    title="Homeowner photos and videos"
                />
            </TechOSDetailSection>}

            {openSectionKey === 'workflow' && <TechOSDetailSection
                title="Current Job Status"
                description="Update what is happening at this customer's job. These updates are visible to Dispatch and the homeowner."
                techOSTheme={techOSTheme}
                variantKey="workflow"
                onClose={() => setOpenSectionKey(null)}
            >
                <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                    Current status: {formatTechWorkflowStatusText(workflowStatus)}
                </Text>
                {!canControlWorkflow && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor, marginTop: 8 }]}>
                        This is a shared job. Only the lead technician can change the customer-facing workflow.
                    </Text>
                )}
                {!!message && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor, marginTop: 8 }]}>{message}</Text>
                )}
                <View style={techWorkflowProgressGridStyle}>
                    {workflowActionPresentation.map((action) => (
                        <TechWorkflowProgressStep
                            key={action.key}
                            action={action}
                            techOSTheme={techOSTheme}
                        />
                    ))}
                </View>
                <View style={techWorkflowActionGridStyle}>
                    {primaryWorkflowActions.map((action) => (
                        <ThemedButton
                            key={action.key}
                            title={updating ? 'Updating...' : action.label}
                            variant="primary"
                            disabled={updating || !canControlWorkflow}
                            onPress={() => onRunWorkflowAction(job, action)}
                            style={techWorkflowActionButtonStyle}
                            textStyle={techWorkflowActionButtonTextStyle}
                        />
                    ))}
                    {primaryWorkflowActions.length === 0 && (
                        <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                            {noPrimaryWorkflowActionMessage}
                        </Text>
                    )}
                </View>
                {moreWorkflowActions.length > 0 && (
                    <>
                        <ThemedButton
                            title={showMoreWorkflowActions ? 'Hide More Actions' : 'More Actions'}
                            variant="secondary"
                            disabled={updating}
                            onPress={() => setShowMoreWorkflowActions((current) => !current)}
                            style={assignedJobActionButtonStyle}
                            textStyle={techWorkflowActionButtonTextStyle}
                        />
                        {showMoreWorkflowActions && (
                            <View style={techWorkflowActionGridStyle}>
                                {moreWorkflowActions.map((action) => (
                                    <ThemedButton
                                        key={action.key}
                                        title={action.label}
                                        variant="secondary"
                                        disabled={updating || !canControlWorkflow}
                                        onPress={() => onRunWorkflowAction(job, action)}
                                        style={techWorkflowActionButtonStyle}
                                        textStyle={techWorkflowActionButtonTextStyle}
                                    />
                                ))}
                            </View>
                        )}
                    </>
                )}
            </TechOSDetailSection>}

            {openSectionKey === 'note' && <TechOSDetailSection
                title="Job Status Note"
                description="Optional field note for dispatch and job coordination."
                techOSTheme={techOSTheme}
                variantKey="note"
                onClose={() => setOpenSectionKey(null)}
            >
                <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={() => setStatusNotePickerOpen((current) => !current)}
                    style={[techStatusDropdownStyle, { borderColor: techOSTheme.panelBorderColor }]}
                >
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.textColor }]}>
                        {TECH_JOB_STATUS_NOTE_PRESETS.find((preset) => preset.key === selectedStatusNotePreset)?.label || 'Choose status note'} ▾
                    </Text>
                </TouchableOpacity>
                {statusNotePickerOpen && (
                    <View style={[techStatusDropdownMenuStyle, { borderColor: techOSTheme.panelBorderColor, backgroundColor: techOSTheme.panelBackgroundColor }]}>
                        {TECH_JOB_STATUS_NOTE_PRESETS.map((preset) => (
                            <TouchableOpacity
                                key={preset.key}
                                onPress={() => {
                                    setSelectedStatusNotePreset(preset.key);
                                    if (preset.message) onChangeCustomStatusNote(preset.message);
                                    if (preset.key === 'custom') onChangeCustomStatusNote('');
                                    setStatusNotePickerOpen(false);
                                }}
                                style={techStatusDropdownRowStyle}
                            >
                                <Text style={[clientMetaTextStyle, { color: techOSTheme.textColor }]}>{preset.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
                {selectedStatusNotePreset === 'custom' && (
                    <DictationTextInput
                        value={customStatusNote}
                        onChangeText={onChangeCustomStatusNote}
                        placeholder="Type a custom job status note"
                        placeholderTextColor={techOSTheme.mutedTextColor}
                        multiline
                        style={[techCustomStatusInputStyle, { borderColor: techOSTheme.panelBorderColor, color: techOSTheme.textColor }]}
                    />
                )}
                <ThemedButton
                    title="Save Job Status Note"
                    variant="secondary"
                    disabled={updating || !canControlWorkflow || !trimmedCustomStatusNote}
                    onPress={() => onRunWorkflowAction(job, TECH_CUSTOM_STATUS_ACTION, trimmedCustomStatusNote)}
                    style={assignedJobActionButtonStyle}
                    textStyle={techWorkflowActionButtonTextStyle}
                />
            </TechOSDetailSection>}

            {openSectionKey === 'estimate' && <>
            <TechOSDetailSection
                title="Estimate / Quote Actions"
                description="Open the existing estimate draft for this company, property, and job context."
                techOSTheme={techOSTheme}
                variantKey="estimate"
                onClose={() => setOpenSectionKey(null)}
            >
                <View style={techWorkflowActionGridStyle}>
                    <ThemedButton
                        title={estimateActionLabel}
                        variant="primary"
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

            <TechOSSoldJobRecord
                scheduleSlotId={job.slot.id}
                techOSTheme={techOSTheme}
            />
            </>}

            {openSectionKey === 'finish' && <TechOSDetailSection
                title="Finish Visit"
                description="Choose the real visit outcome. This closes the current appointment and moves the request to the right queue."
                techOSTheme={techOSTheme}
                variantKey="finish"
                onClose={() => setOpenSectionKey(null)}
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
                            disabled={updating || !visitCloseable}
                            onPress={() => {
                                onChangeCloseoutForm({
                                    outcome: option.outcome,
                                    notifyHomeowner: option.homeownerDefault,
                                });
                            }}
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
                <DictationTextInput
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
                <ThemedButton
                    title={closeoutForm.nextActionDate
                        ? `Next Action: ${closeoutForm.nextActionDate}`
                        : 'Choose Next Action Date'}
                    variant="secondary"
                    onPress={() => setNextActionPickerOpen((current) => !current)}
                    style={assignedJobActionButtonStyle}
                />
                {nextActionPickerOpen && (
                    <View style={techWorkflowActionGridStyle}>
                        {getTechCloseoutDateChoices().map((choice) => (
                            <ThemedButton
                                key={choice.label}
                                title={choice.label}
                                variant={closeoutForm.nextActionDate === choice.value ? 'primary' : 'secondary'}
                                onPress={() => {
                                    onChangeCloseoutForm({ nextActionDate: choice.value });
                                    setNextActionPickerOpen(false);
                                }}
                                style={techWorkflowActionButtonStyle}
                            />
                        ))}
                    </View>
                )}
                <DictationTextInput
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
                        variant="danger"
                        disabled={updating || !closeoutForm.outcome || !visitCloseable}
                        onPress={() => onCloseServiceVisit()}
                        style={techWorkflowActionButtonStyle}
                        textStyle={techWorkflowActionButtonTextStyle}
                    />
                </View>
                {!visitCloseable && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>
                        {canControlWorkflow ? 'This visit is already closed.' : 'Only the lead technician can close this shared job.'}
                    </Text>
                )}
            </TechOSDetailSection>}

            {openSectionKey === 'availability' && <TechOSDetailSection
                title={nextJobAvailability.title}
                description={nextJobAvailability.description}
                techOSTheme={techOSTheme}
                variantKey="status"
                onClose={() => setOpenSectionKey(null)}
            >
                <View style={techWorkflowActionGridStyle}>
                    {TECHNICIAN_NEXT_JOB_STATUS_ACTIONS.map((action) => (
                        <ThemedButton
                            key={action.key}
                            title={action.label}
                            variant="secondary"
                            disabled={updating}
                            onPress={() => onRunTechnicianNextJobStatusAction(action)}
                            style={techWorkflowActionButtonStyle}
                        />
                    ))}
                </View>
                {!!technicianStatusMessage && (
                    <Text style={[clientMetaTextStyle, { color: techOSTheme.mutedTextColor }]}>{technicianStatusMessage}</Text>
                )}
            </TechOSDetailSection>}
        </View>
    );
}

function TechOSJobWorkspaceCard({
    active,
    description,
    disabled,
    icon,
    onPress,
    status,
    techOSTheme,
    title,
    variantKey,
}: {
    active: boolean;
    description: string;
    disabled: boolean;
    icon: (typeof TECHOS_JOB_WORKSPACE_SECTIONS)[number]['icon'];
    onPress: () => void;
    status: string;
    techOSTheme: TechOSThemePalette;
    title: string;
    variantKey: TechOSJobDetailVisualKey;
}) {
    const variant = techOSTheme.jobDetail[variantKey];

    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${active ? 'Close' : 'Open'} ${title}`}
            accessibilityState={{ disabled, expanded: active }}
            activeOpacity={0.82}
            disabled={disabled}
            onPress={onPress}
            style={[
                techJobWorkspaceCardStyle,
                {
                    backgroundColor: variant.backgroundColor,
                    borderColor: active ? techOSTheme.activeBorderColor : variant.borderColor,
                    opacity: disabled ? 0.48 : 1,
                },
                active && techJobWorkspaceCardActiveStyle,
            ]}
        >
            <View style={techJobWorkspaceCardTopRowStyle}>
                <View style={[techJobWorkspaceIconStyle, { backgroundColor: variant.accentColor }]}>
                    <MaterialCommunityIcons name={icon} color={techOSTheme.screenBackgroundColor} size={22} />
                </View>
                <MaterialCommunityIcons
                    name={active ? 'chevron-up' : 'chevron-down'}
                    color={active ? techOSTheme.activeBorderColor : techOSTheme.mutedTextColor}
                    size={23}
                />
            </View>
            <Text style={[techJobWorkspaceCardTitleStyle, { color: techOSTheme.textColor }]}>{title}</Text>
            <Text numberOfLines={2} style={[techJobWorkspaceCardDescriptionStyle, { color: techOSTheme.mutedTextColor }]}>
                {description}
            </Text>
            <Text numberOfLines={2} style={[techJobWorkspaceCardStatusStyle, { color: active ? techOSTheme.activeBorderColor : techOSTheme.textColor }]}>
                {status}
            </Text>
        </TouchableOpacity>
    );
}

function getTechOSJobWorkspaceSectionStatus({
    chatAvailable,
    estimateDraftCount,
    job,
    sectionKey,
    visitCloseable,
    workflowStatus,
}: {
    chatAvailable: boolean;
    estimateDraftCount: number;
    job: TechAssignedScheduleJob;
    sectionKey: TechOSJobWorkspaceSectionKey;
    visitCloseable: boolean;
    workflowStatus: string;
}) {
    if (sectionKey === 'summary') return formatArrivalWindow(job.slot);
    if (sectionKey === 'messages') return chatAvailable ? 'Open job chat' : 'Chat unavailable';
    if (sectionKey === 'media') return 'View request uploads';
    if (sectionKey === 'workflow') return formatTechWorkflowStatusText(workflowStatus);
    if (sectionKey === 'note') return job.slot.tech_status_note ? 'Status note saved' : 'Add a field note';
    if (sectionKey === 'estimate') {
        return estimateDraftCount > 0
            ? `${estimateDraftCount} draft item${estimateDraftCount === 1 ? '' : 's'}`
            : 'Start customer quote';
    }
    if (sectionKey === 'finish') return visitCloseable ? 'Close when work is done' : 'Visit closed';
    return 'Update Dispatch';
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

function TechWorkflowProgressStep({
    action,
    techOSTheme,
}: {
    action: TechWorkflowActionPresentation;
    techOSTheme: TechOSThemePalette;
}) {
    const isNext = action.progressState === 'next';
    const isCurrent = action.progressState === 'current';
    const isCompleted = action.progressState === 'completed';
    const borderColor = isNext || isCurrent
        ? techOSTheme.activeBorderColor
        : isCompleted
            ? '#166534'
            : techOSTheme.panelBorderColor;
    const backgroundColor = isNext
        ? 'rgba(15, 118, 110, 0.12)'
        : isCompleted
            ? 'rgba(22, 101, 52, 0.08)'
            : 'transparent';

    return (
        <View style={[techWorkflowStepStyle, { borderColor, backgroundColor }]}>
            <Text style={[techWorkflowStepStateStyle, { color: isNext ? techOSTheme.activeBorderColor : techOSTheme.mutedTextColor }]}>
                {formatTechWorkflowProgressState(action.progressState)}
            </Text>
            <Text style={[techWorkflowStepLabelStyle, { color: techOSTheme.textColor }]}>{action.label}</Text>
        </View>
    );
}

function TechOSDetailSection({
    children,
    description,
    onClose,
    techOSTheme,
    title,
    variantKey,
}: {
    children: ReactNode;
    description: string;
    onClose?: () => void;
    techOSTheme: TechOSThemePalette;
    title: string;
    variantKey: TechOSJobDetailVisualKey;
}) {
    const variant = techOSTheme.jobDetail[variantKey];

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
            {!!onClose && (
                <ThemedButton
                    title="Close Section"
                    variant="secondary"
                    onPress={onClose}
                    style={techJobWorkspaceCloseButtonStyle}
                />
            )}
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
    onSelectAssignmentRole,
    onSelectTechnician,
    onToggleAssignment,
    propertiesById,
    selectedAssignmentRoleByJob,
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
    onSelectAssignmentRole: (jobId: string, role: JobAssignmentRole) => void;
    onSelectTechnician: (jobId: string, technicianId: string) => void;
    onToggleAssignment: (jobId: string) => void;
    propertiesById: Record<string, PropertyRecord>;
    selectedAssignmentRoleByJob: Record<string, JobAssignmentRole>;
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
                                        onSelectAssignmentRole={onSelectAssignmentRole}
                                        onSelectTechnician={onSelectTechnician}
                                        onToggleAssignment={onToggleAssignment}
                                        property={property}
                                        selectedAssignmentRole={selectedAssignmentRoleByJob[job.id] || resolveDefaultJobAssignmentRole({
                                            activeAssignmentCount: job.assignment_count,
                                        })}
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
    onSelectAssignmentRole,
    onSelectTechnician,
    onToggleAssignment,
    property,
    selectedAssignmentRole,
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
    onSelectAssignmentRole: (jobId: string, role: JobAssignmentRole) => void;
    onSelectTechnician: (jobId: string, technicianId: string) => void;
    onToggleAssignment: (jobId: string) => void;
    property?: PropertyRecord;
    selectedAssignmentRole: JobAssignmentRole;
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
                                {selectedTechnician ? getTechnicianAssignmentDisplayName(selectedTechnician) : 'Choose an active technician'}
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
                            <Text style={[jobAssignmentTitleStyle, { color: theme.colors.text }]}>Role on this job</Text>
                            <View style={jobAssignmentRoleRowStyle}>
                                {(['primary', 'helper'] as const).map((role) => {
                                    const selected = selectedAssignmentRole === role;
                                    const helperUnavailable = role === 'helper' && Number(job.assignment_count || 0) === 0;

                                    return (
                                        <TouchableOpacity
                                            key={role}
                                            onPress={() => onSelectAssignmentRole(job.id, role)}
                                            disabled={helperUnavailable || assigning}
                                            style={[
                                                jobAssignmentRoleChoiceStyle,
                                                {
                                                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                                                    backgroundColor: selected ? theme.colors.secondaryButton : 'transparent',
                                                    opacity: helperUnavailable ? 0.45 : 1,
                                                },
                                            ]}
                                        >
                                            <Text style={[technicianPickerNameStyle, { color: theme.colors.text }]}>
                                                {role === 'primary' ? 'Lead' : 'Additional'}
                                            </Text>
                                            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                                                {role === 'primary'
                                                    ? Number(job.assignment_count || 0) > 0
                                                        ? 'Makes this technician lead and moves the current lead to additional.'
                                                        : 'The first assigned technician must be lead.'
                                                    : 'Adds another technician and keeps the current lead.'}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
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
                                                    {getTechnicianAssignmentDisplayName(technician)}
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
                        title={assigning
                            ? 'Assigning...'
                            : selectedAssignmentRole === 'primary'
                                ? 'Assign as Lead'
                                : 'Add Technician'}
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
        .select('id, company_id, property_id, company_property_client_id, display_code, display_sequence, request_type, status, priority, issue_summary, created_at, converted_job_id, converted_at')
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
                display_code: readStringField(record, 'display_code')?.toUpperCase() || null,
                display_sequence: readNumberField(record, 'display_sequence'),
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
    return isActiveScheduleSlot(slot.status);
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
    return isOpenTechOSAssignmentStatus(status);
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

function getTechCloseoutDateChoices() {
    const choices = [
        { label: 'No Follow-Up', days: null },
        { label: 'Tomorrow', days: 1 },
        { label: 'In 3 Days', days: 3 },
        { label: 'In 1 Week', days: 7 },
        { label: 'In 2 Weeks', days: 14 },
        { label: 'In 30 Days', days: 30 },
    ];

    return choices.map((choice) => {
        if (choice.days === null) return { label: choice.label, value: '' };
        const date = new Date();
        date.setDate(date.getDate() + choice.days);
        return { label: choice.label, value: date.toISOString().slice(0, 10) };
    });
}

function getAssignedJobTitle(job: TechAssignedScheduleJob) {
    const requestType = formatLabel(job.request?.request_type || 'Service Request');
    const summary = job.request?.issue_summary?.trim();

    return summary || requestType || 'Assigned service request';
}

function getTechOSAssignedJobCode(job: TechAssignedScheduleJob) {
    return getServiceRequestDisplayCode(job.request);
}

function getTechOSAssignedJobRequestReference(job: TechAssignedScheduleJob) {
    if (job.request) return formatServiceRequestReference(job.request);

    return 'Request number pending';
}

function getTechOSAssignedJobHeaderLabel(job: TechAssignedScheduleJob) {
    const code = getTechOSAssignedJobCode(job) || 'Request pending';
    const priority = job.slot.priority || job.request?.priority || '';
    const type = priority || job.request?.request_type || 'Service';

    return `${code} · ${formatLabel(type)}`;
}

function getAssignedJobVisibleWorkflowStatus(job: TechAssignedScheduleJob) {
    return resolveTechWorkflowVisibleStatus({
        requestStatus: job.request?.status,
        slotStatus: job.slot.status,
    }) || 'scheduled';
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

const techProfileClockOutButtonStyle = {
    alignSelf: 'stretch' as const,
    marginTop: 10,
    minHeight: 48,
};

const techProfileHoursSectionStyle = {
    marginTop: 12,
};

const techProfileHoursHeadingStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 0.5,
};

const techProfileHoursRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 6,
};

const techProfileHourStyle = {
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: 88,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
};

const techProfileHourValueStyle = {
    fontSize: 14,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    fontWeight: '900' as const,
};

const techProfileHourLabelStyle = {
    fontSize: 10,
    fontWeight: '800' as const,
    marginTop: 2,
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

const techAccessGateCardStyle = {
    borderCurve: 'continuous' as const,
    gap: 12,
    marginTop: 16,
};

const summaryValueStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const techClockElapsedStyle = {
    fontSize: 28,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    fontWeight: '900' as const,
    marginTop: 6,
};

const techRunningClockStyle = {
    borderCurve: 'continuous' as const,
    borderRadius: 14,
    borderWidth: 2,
    gap: 3,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
};

const techHourSummaryGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 10,
};

const techHourSummaryCardStyle = {
    borderCurve: 'continuous' as const,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 135,
    flexGrow: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const techHourSummaryLabelStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 0.5,
};

const techHourSummaryValueStyle = {
    fontSize: 20,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    fontWeight: '900' as const,
};

const techMealWarningStyle = {
    borderCurve: 'continuous' as const,
    borderRadius: 14,
    borderWidth: 2,
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const techMealWarningTitleStyle = {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900' as const,
    letterSpacing: 0.4,
};

const techMealWarningBodyStyle = {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 17,
};

const techOvertimeFloatingLayerStyle = {
    bottom: 18,
    left: 14,
    position: 'absolute' as const,
    right: 14,
    zIndex: 40,
};

const techOvertimeFloatingCardStyle = {
    alignSelf: 'flex-end' as const,
    borderColor: '#FFD166',
    borderWidth: 2,
    gap: 8,
    maxWidth: 520,
    padding: 14,
    width: '100%' as const,
};

const techOvertimeFloatingButtonStyle = {
    alignSelf: 'flex-start' as const,
    minWidth: 150,
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

const techJobWorkspaceIntroStyle = {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
};

const techJobWorkspaceCurrentStatusStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginTop: 8,
};

const techJobWorkspaceGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 12,
};

const techJobWorkspaceCardStyle = {
    borderRadius: 15,
    borderWidth: 1,
    flexBasis: 150,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 158,
    minWidth: 0,
    padding: 12,
};

const techJobWorkspaceCardActiveStyle = {
    borderWidth: 2,
};

const techJobWorkspaceCardTopRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
};

const techJobWorkspaceIconStyle = {
    alignItems: 'center' as const,
    borderRadius: 11,
    height: 38,
    justifyContent: 'center' as const,
    width: 38,
};

const techJobWorkspaceCardTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
    lineHeight: 19,
    marginTop: 10,
};

const techJobWorkspaceCardDescriptionStyle = {
    fontSize: 11,
    fontWeight: '700' as const,
    lineHeight: 15,
    marginTop: 3,
};

const techJobWorkspaceCardStatusStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
    lineHeight: 15,
    marginTop: 8,
};

const techJobWorkspaceHintStyle = {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 17,
    marginTop: 12,
    textAlign: 'center' as const,
};

const techJobWorkspaceCloseButtonStyle = {
    marginTop: 14,
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

const techWorkflowProgressGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const techWorkflowStepStyle = {
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: 128,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
};

const techWorkflowStepStateStyle = {
    fontSize: 10,
    fontWeight: '900' as const,
    lineHeight: 13,
    textTransform: 'uppercase' as const,
};

const techWorkflowStepLabelStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    lineHeight: 17,
    marginTop: 3,
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

const techStatusDropdownStyle = {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    minHeight: 46,
    justifyContent: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const techStatusDropdownMenuStyle = {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
    overflow: 'hidden' as const,
};

const techStatusDropdownRowStyle = {
    borderBottomColor: 'rgba(127, 127, 127, 0.22)',
    borderBottomWidth: 1,
    minHeight: 42,
    justifyContent: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 9,
};

const techCompactInputStyle = {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    fontWeight: '800' as const,
    marginTop: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
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

const jobAssignmentRoleRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
};

const jobAssignmentRoleChoiceStyle = {
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: 180,
    flexGrow: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
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
