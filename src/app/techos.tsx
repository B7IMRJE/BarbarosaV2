import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
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
import { loadLoggedInUserCompanyAccess, type CompanyRouteAccessRow } from '../lib/onboarding';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

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
type TechWorkflowActionKey = 'on_my_way' | 'arrived' | 'in_progress' | 'estimate_needed' | 'completed';

type TechWorkflowAction = {
    key: TechWorkflowActionKey;
    label: string;
    status: string;
};

const HOMEOS_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';
const TECHOS_ASSIGNMENT_REFRESH_MS = 45_000;
const TECH_WORKFLOW_ACTIONS: TechWorkflowAction[] = [
    { key: 'on_my_way', label: 'On my way', status: 'on_my_way' },
    { key: 'arrived', label: 'Arrived', status: 'arrived' },
    { key: 'in_progress', label: 'Started / In progress', status: 'in_progress' },
    { key: 'estimate_needed', label: 'Need approval / estimate needed', status: 'estimate_needed' },
    { key: 'completed', label: 'Completed', status: 'completed' },
];

export default function TechOSScreen() {
    const { companyId } = useLocalSearchParams<{ companyId?: string }>();
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
    const [authEmail, setAuthEmail] = useState('');
    const [signingOut, setSigningOut] = useState(false);
    const [selectedAssignedJobId, setSelectedAssignedJobId] = useState('');
    const [workflowStatusBySlotId, setWorkflowStatusBySlotId] = useState<Record<string, string>>({});
    const [workflowMessageBySlotId, setWorkflowMessageBySlotId] = useState<Record<string, string>>({});
    const [updatingWorkflowSlotId, setUpdatingWorkflowSlotId] = useState('');
    const knownAssignedSlotIdsRef = useRef<Set<string>>(new Set());

    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
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
        () => assignedScheduleSlots.map((slot) => ({
            slot,
            request: slot.service_request_id ? serviceRequestsById[slot.service_request_id] || null : null,
        })),
        [assignedScheduleSlots, serviceRequestsById]
    );
    const todayAssignedScheduleJobs = useMemo(
        () => assignedScheduleJobs.filter((job) => isActiveTodayScheduleJob(job.slot)),
        [assignedScheduleJobs]
    );
    const futureAssignedScheduleJobs = useMemo(
        () => assignedScheduleJobs.filter((job) => isFutureScheduleJob(job.slot)),
        [assignedScheduleJobs]
    );
    const activeUpcomingScheduleJobs = useMemo(
        () => [...todayAssignedScheduleJobs, ...futureAssignedScheduleJobs],
        [futureAssignedScheduleJobs, todayAssignedScheduleJobs]
    );
    const historyScheduleJobs = useMemo(
        () => assignedScheduleJobs.filter((job) => !isActiveUpcomingScheduleJob(job.slot)),
        [assignedScheduleJobs]
    );
    const assignedOpenScheduleJobs = useMemo(
        () => assignedScheduleJobs.filter((job) => isOpenJobStatus(job.slot.status || job.request?.status)),
        [assignedScheduleJobs]
    );
    const assignedPausedScheduleJobs = useMemo(
        () => assignedScheduleJobs.filter((job) => isPausedJobStatus(job.slot.status || job.request?.status)),
        [assignedScheduleJobs]
    );
    const assignedClosedScheduleJobs = useMemo(
        () => assignedScheduleJobs.filter((job) => isClosedJobStatus(job.slot.status || job.request?.status)),
        [assignedScheduleJobs]
    );
    const calendarScheduleGroups = useMemo(
        () => groupAssignedScheduleJobsByDate(assignedScheduleJobs),
        [assignedScheduleJobs]
    );
    const selectedAssignedJob = useMemo(
        () => assignedScheduleJobs.find((job) => job.slot.id === selectedAssignedJobId) || null,
        [assignedScheduleJobs, selectedAssignedJobId]
    );

    useEffect(() => {
        loadTechOSAccess();
    }, [requestedCompanyId]);

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
        setAuthEmail('');
        setSelectedAssignedJobId('');
        setWorkflowStatusBySlotId({});
        setWorkflowMessageBySlotId({});
        setUpdatingWorkflowSlotId('');
        knownAssignedSlotIdsRef.current = new Set();

        let userId = '';

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
            setAuthEmail(user.email || '');
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
        if (nextMode === 'technician') {
            await Promise.all([
                loadCompanyBrand(activeMembership.company_id),
                loadAssignedScheduleJobs(activeMembership.company_id, activeMembership.id, {
                    announceNewAssignments: false,
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
        options: { announceNewAssignments?: boolean; subtle?: boolean } = {}
    ) {
        if (!companyIdToLoad || !technicianCompanyUserId) {
            setAssignedScheduleSlots([]);
            setServiceRequestsById({});
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
            .select('id, company_id, job_id, service_request_id, technician_company_user_id, start_at, end_at, arrival_window_start, arrival_window_end, status, estimated_duration_minutes, priority, notes')
            .eq('company_id', companyIdToLoad)
            .eq('technician_company_user_id', technicianCompanyUserId)
            .gte('start_at', windowStart.toISOString())
            .lte('start_at', windowEnd.toISOString())
            .order('start_at', { ascending: true });

        if (error) {
            setAssignedScheduleSlots([]);
            setServiceRequestsById({});
            setScheduleMessage(`Could not load assigned jobs: ${normalizeServiceErrorMessage(error.message)}`);
            setScheduleLoading(false);
            return;
        }

        const nextSlots = normalizeScheduleSlots(data);
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
        setDashboardView('jobs');
    }

    function handleCloseAssignedJobDetails() {
        setSelectedAssignedJobId('');
    }

    function handleOpenFullAssignedJob(job: TechAssignedScheduleJob) {
        if (!job.slot.job_id) return;

        router.push({
            pathname: '/techos/job/[jobId]',
            params: { jobId: job.slot.job_id, companyId: job.slot.company_id },
        } as any);
    }

    async function handleTechWorkflowAction(job: TechAssignedScheduleJob, action: TechWorkflowAction) {
        const slotId = job.slot.id;

        if (!slotId || !job.slot.company_id || !job.slot.technician_company_user_id) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId || 'missing']: 'Workflow update failed: assigned job context is missing.',
            }));
            return;
        }

        setUpdatingWorkflowSlotId(slotId);
        setWorkflowMessageBySlotId((current) => ({
            ...current,
            [slotId]: `Updating status to ${action.label}...`,
        }));

        try {
            const { data, error } = await supabase
                .from('job_schedule_slots')
                .update({ status: action.status })
                .eq('id', slotId)
                .eq('company_id', job.slot.company_id)
                .eq('technician_company_user_id', job.slot.technician_company_user_id)
                .select('id')
                .maybeSingle();

            if (error) {
                throw new Error(error.message);
            }

            if (!data) {
                throw new Error('No assigned job was updated. Confirm this job is assigned to your technician profile.');
            }

            setAssignedScheduleSlots((current) => current.map((slot) => (
                slot.id === slotId ? { ...slot, status: action.status } : slot
            )));
            setWorkflowStatusBySlotId((current) => ({
                ...current,
                [slotId]: action.status,
            }));
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: `Status updated: ${action.label}.`,
            }));
        } catch (error) {
            setWorkflowMessageBySlotId((current) => ({
                ...current,
                [slotId]: `Workflow update failed: ${normalizeServiceErrorMessage(getErrorMessage(error))}`,
            }));
        } finally {
            setUpdatingWorkflowSlotId('');
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
    const dashboardJobsCount = isTechnicianWorkspace ? activeUpcomingScheduleJobs.length : visibleJobs.length;
    const dashboardHistoryCount = isTechnicianWorkspace ? historyScheduleJobs.length : closedJobs.length;
    const dashboardOpenCount = isTechnicianWorkspace ? assignedOpenScheduleJobs.length : openJobs.length;
    const dashboardPausedCount = isTechnicianWorkspace ? assignedPausedScheduleJobs.length : pausedJobs.length;
    const dashboardClosedCount = isTechnicianWorkspace ? assignedClosedScheduleJobs.length : closedJobs.length;
    const technicianName = isPlatformAdminAccess
        ? 'Platform Admin'
        : membership?.full_name || authEmail || membership?.email || 'Technician';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
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

                {!!dispatchCompanyId && (
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

                <TechOSDashboardCards
                    activeView={dashboardView}
                    historyCount={dashboardHistoryCount}
                    jobsCount={dashboardJobsCount}
                    onSelectView={setDashboardView}
                    scheduleCount={calendarScheduleGroups.length}
                    todayCount={dashboardTodayCount}
                    upcomingCount={dashboardFutureCount}
                />

                {isTechnicianWorkspace ? (
                    <TechOSDashboardContent
                        activeJobs={activeUpcomingScheduleJobs}
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
                        selectedJob={selectedAssignedJob}
                        todayJobs={todayAssignedScheduleJobs}
                        onRefresh={() => {
                            if (activeCompanyId && membership?.id) {
                                void loadAssignedScheduleJobs(activeCompanyId, membership.id, {
                                    announceNewAssignments: false,
                                });
                            }
                        }}
                        onCloseDetails={handleCloseAssignedJobDetails}
                        onOpenDetails={handleOpenAssignedJobDetails}
                        onOpenFullJob={handleOpenFullAssignedJob}
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
    todayCount,
    upcomingCount,
}: {
    activeView: TechDashboardView;
    historyCount: number;
    jobsCount: number;
    onSelectView: (view: TechDashboardView) => void;
    scheduleCount: number;
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
    const { theme } = useTheme();

    return (
        <View style={dashboardGridStyle}>
            {cards.map((card) => {
                const active = activeView === card.key;

                return (
                    <ThemedCard
                        key={card.key}
                        onPress={() => onSelectView(card.key)}
                        style={[
                            dashboardCardStyle,
                            card.priority && {
                                borderColor: theme.colors.primary,
                            },
                            active && {
                                borderColor: theme.colors.primary,
                                backgroundColor: theme.colors.secondaryButton,
                            },
                        ]}
                    >
                        <Text style={[dashboardCardValueStyle, { color: theme.colors.text }]}>{card.value}</Text>
                        <Text style={[dashboardCardTitleStyle, { color: theme.colors.text }]}>{card.title}</Text>
                        <Text style={[dashboardCardNoteStyle, { color: theme.colors.mutedText }]}>{card.note}</Text>
                    </ThemedCard>
                );
            })}
        </View>
    );
}

function TechOSDashboardContent({
    activeJobs,
    activeView,
    calendarGroups,
    futureJobs,
    historyJobs,
    jobStats,
    loading,
    message,
    selectedJob,
    todayJobs,
    onRefresh,
    onCloseDetails,
    onOpenDetails,
    onOpenFullJob,
    onRunWorkflowAction,
    updatingWorkflowSlotId,
    workflowMessageBySlotId,
    workflowStatusBySlotId,
}: {
    activeJobs: TechAssignedScheduleJob[];
    activeView: TechDashboardView;
    calendarGroups: Array<{ key: string; label: string; jobs: TechAssignedScheduleJob[] }>;
    futureJobs: TechAssignedScheduleJob[];
    historyJobs: TechAssignedScheduleJob[];
    jobStats: { closed: number; open: number; paused: number };
    loading: boolean;
    message: string;
    selectedJob: TechAssignedScheduleJob | null;
    todayJobs: TechAssignedScheduleJob[];
    onRefresh: () => void;
    onCloseDetails: () => void;
    onOpenDetails: (job: TechAssignedScheduleJob) => void;
    onOpenFullJob: (job: TechAssignedScheduleJob) => void;
    onRunWorkflowAction: (job: TechAssignedScheduleJob, action: TechWorkflowAction) => void;
    updatingWorkflowSlotId: string;
    workflowMessageBySlotId: Record<string, string>;
    workflowStatusBySlotId: Record<string, string>;
}) {
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
                selectedJob={selectedJob}
                onRefresh={onRefresh}
                onCloseDetails={onCloseDetails}
                onOpenDetails={onOpenDetails}
                onOpenFullJob={onOpenFullJob}
                onRunWorkflowAction={onRunWorkflowAction}
                title="Assigned Jobs"
                todayJobs={todayJobs}
                futureJobs={futureJobs}
                updatingWorkflowSlotId={updatingWorkflowSlotId}
                workflowMessageBySlotId={workflowMessageBySlotId}
                workflowStatusBySlotId={workflowStatusBySlotId}
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
            <TechOSModulePlaceholder
                title="Estimates & Invoices"
                message="Estimate and invoice workflow will open here after job scope, pricing, and approval are connected."
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
    selectedJob,
    todayJobs,
    onRefresh,
    onCloseDetails,
    onOpenDetails,
    onOpenFullJob,
    onRunWorkflowAction,
    title,
    updatingWorkflowSlotId,
    workflowMessageBySlotId,
    workflowStatusBySlotId,
}: {
    emptyMessage: string;
    emptyTitle: string;
    futureJobs?: TechAssignedScheduleJob[];
    jobs: TechAssignedScheduleJob[];
    jobStats?: { closed: number; open: number; paused: number };
    loading: boolean;
    message: string;
    selectedJob?: TechAssignedScheduleJob | null;
    todayJobs?: TechAssignedScheduleJob[];
    onRefresh: () => void;
    onCloseDetails?: () => void;
    onOpenDetails?: (job: TechAssignedScheduleJob) => void;
    onOpenFullJob?: (job: TechAssignedScheduleJob) => void;
    onRunWorkflowAction?: (job: TechAssignedScheduleJob, action: TechWorkflowAction) => void;
    title: string;
    updatingWorkflowSlotId?: string;
    workflowMessageBySlotId?: Record<string, string>;
    workflowStatusBySlotId?: Record<string, string>;
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

            {!!selectedJob && onCloseDetails && onOpenFullJob && onRunWorkflowAction && (
                <TechOSAssignedJobDetail
                    job={selectedJob}
                    message={workflowMessageBySlotId?.[selectedJob.slot.id] || ''}
                    onBack={onCloseDetails}
                    onOpenFullJob={onOpenFullJob}
                    onRunWorkflowAction={onRunWorkflowAction}
                    updating={updatingWorkflowSlotId === selectedJob.slot.id}
                    workflowStatus={workflowStatusBySlotId?.[selectedJob.slot.id] || selectedJob.slot.status || selectedJob.request?.status || 'scheduled'}
                />
            )}

            {loading && visibleJobCount === 0 ? (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>Checking assigned jobs...</Text>
                </View>
            ) : visibleJobCount === 0 ? (
                <View style={[emptyClientStateStyle, { borderColor: theme.colors.border }]}>
                    <Text style={[clientNameStyle, { color: theme.colors.text }]}>{emptyTitle}</Text>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                        {emptyMessage}
                    </Text>
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
                        Simple day view for assigned work.
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
                        Scheduled assignments will appear here by day.
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
                    {formatStatus(job.slot.status || job.request?.status || 'scheduled')}
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
            {!job.slot.job_id && (
                <Text style={[jobWorkflowHintStyle, { color: theme.colors.mutedText }]}>
                    Full job route opens after this request is converted to a TechOS job.
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
    job,
    message,
    onBack,
    onOpenFullJob,
    onRunWorkflowAction,
    updating,
    workflowStatus,
}: {
    job: TechAssignedScheduleJob;
    message: string;
    onBack: () => void;
    onOpenFullJob: (job: TechAssignedScheduleJob) => void;
    onRunWorkflowAction: (job: TechAssignedScheduleJob, action: TechWorkflowAction) => void;
    updating: boolean;
    workflowStatus: string;
}) {
    const { theme } = useTheme();
    const title = getAssignedJobTitle(job);
    const location = getAssignedJobLocation(job);

    return (
        <View style={[techJobDetailStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <View style={techJobDetailHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[jobNumberStyle, { color: theme.colors.mutedText }]}>Job Details</Text>
                    <Text style={[jobTitleStyle, { color: theme.colors.text, marginBottom: 4 }]} numberOfLines={2}>
                        {title}
                    </Text>
                    <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{formatScheduleRange(job.slot)}</Text>
                </View>
                <ThemedButton
                    title="Back to Jobs"
                    variant="secondary"
                    onPress={onBack}
                    style={techJobDetailBackButtonStyle}
                />
            </View>

            <View style={techJobDetailInfoGridStyle}>
                <TechJobDetailInfo label="Arrival Window" value={formatArrivalWindow(job.slot)} />
                <TechJobDetailInfo label="Status" value={formatLabel(workflowStatus)} />
                <TechJobDetailInfo label="Priority" value={formatLabel(job.slot.priority || job.request?.priority || 'normal')} />
                <TechJobDetailInfo label="Home / Request" value={location} />
            </View>

            <View style={[techJobDetailSummaryStyle, { borderColor: theme.colors.border }]}>
                <Text style={[jobAssignmentTitleStyle, { color: theme.colors.text }]}>Request Summary</Text>
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                    {job.request?.issue_summary || job.slot.notes || 'No request summary provided.'}
                </Text>
            </View>

            <Text style={[jobAssignmentTitleStyle, { color: theme.colors.text }]}>Technician Workflow</Text>
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

            {!!job.slot.job_id && (
                <ThemedButton
                    title="Open Full Job"
                    variant="secondary"
                    onPress={() => onOpenFullJob(job)}
                    style={assignedJobActionButtonStyle}
                />
            )}

            {!job.slot.job_id && (
                <Text style={[jobWorkflowHintStyle, { color: theme.colors.mutedText }]}>
                    Full job route is not connected for this request yet. Use these field actions to update the assigned schedule status.
                </Text>
            )}

            {!!message && (
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
            )}
        </View>
    );
}

function TechJobDetailInfo({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View style={[techJobDetailInfoStyle, { borderColor: theme.colors.border }]}>
            <Text style={[techJobDetailInfoLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[techJobDetailInfoValueStyle, { color: theme.colors.text }]} numberOfLines={2}>{value}</Text>
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

function isFutureDate(value?: string | null) {
    const key = getDateKey(value);
    const todayKey = getDateKey(new Date().toISOString());

    return Boolean(key && todayKey && key > todayKey);
}

function isActiveTodayScheduleJob(slot: TechScheduleSlot) {
    return isActiveScheduleSlot(slot.status) && isTodayDate(slot.start_at);
}

function isFutureScheduleJob(slot: TechScheduleSlot) {
    return isActiveScheduleSlot(slot.status) && isFutureDate(slot.start_at);
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

function isActiveScheduleSlot(status?: string | null) {
    const normalized = normalizeStatus(status);

    return !['cancelled', 'canceled', 'completed', 'complete', 'closed', 'archived'].includes(normalized);
}

function getAssignedJobTitle(job: TechAssignedScheduleJob) {
    const requestType = formatLabel(job.request?.request_type || 'Service Request');
    const summary = job.request?.issue_summary?.trim();

    return summary || requestType || 'Assigned service request';
}

function getAssignedJobLocation(job: TechAssignedScheduleJob) {
    if (job.request?.property_id) return 'Customer home';
    if (job.slot.service_request_id) return 'Assigned request';

    return 'Assigned schedule slot';
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

function isPausedJobStatus(status?: string | null) {
    const normalized = normalizeStatus(status);
    return ['paused', 'on_hold', 'waiting', 'waiting_on_customer', 'blocked'].includes(normalized);
}

function isClosedJobStatus(status?: string | null) {
    const normalized = normalizeStatus(status);
    return ['completed', 'complete', 'closed', 'done', 'cancelled', 'canceled'].includes(normalized);
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

const assignedJobTopRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
};

const jobWorkflowHintStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 17,
    marginTop: 10,
};

const techJobDetailStyle = {
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
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

const techJobDetailSummaryStyle = {
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
