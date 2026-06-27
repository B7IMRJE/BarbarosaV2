import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type CompanyRole = 'technician' | 'manager' | 'admin' | 'owner';

type CompanyUserAccess = {
    id: string;
    company_id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    status: string | null;
    created_at: string | null;
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

const TECHOS_ROLES: CompanyRole[] = ['technician', 'manager', 'admin', 'owner'];

const secondaryWorkflowCards = [
    {
        title: 'Start Assessment',
        description: 'Technician assessment checklists will begin here without exposing private HomeOS data by default.',
    },
    {
        title: 'Photos & Notes',
        description: 'Field photos, notes, and findings will attach to approved jobs in a later pass.',
    },
    {
        title: 'Estimates',
        description: 'Estimate drafting will connect after job assignment and scope capture are ready.',
    },
    {
        title: 'Completion / Review Request',
        description: 'Completion summaries and review requests will be available after field closeout is built.',
    },
];

export default function TechOSScreen() {
    const { companyId } = useLocalSearchParams<{ companyId?: string }>();
    const { width: viewportWidth } = useWindowDimensions();
    const { theme } = useTheme();
    const isPhoneLayout = viewportWidth <= 640;
    const pagePadding = isPhoneLayout ? 16 : 20;
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [membership, setMembership] = useState<CompanyUserAccess | null>(null);
    const [isPlatformAdminAccess, setIsPlatformAdminAccess] = useState(false);
    const [company, setCompany] = useState<CompanyBrand | null>(null);
    const [clients, setClients] = useState<CompanyClient[]>([]);
    const [propertiesById, setPropertiesById] = useState<Record<string, PropertyRecord>>({});
    const [jobs, setJobs] = useState<TechOSJob[]>([]);
    const [activeCompanyId, setActiveCompanyId] = useState('');
    const [clientMessage, setClientMessage] = useState('');
    const [jobLoading, setJobLoading] = useState(false);
    const [creatingJobClientId, setCreatingJobClientId] = useState<string | null>(null);
    const [jobMessage, setJobMessage] = useState('');
    const [message, setMessage] = useState('Loading TechOS...');
    const [showAssignedClients, setShowAssignedClients] = useState(false);
    const [assignmentModelReady, setAssignmentModelReady] = useState(false);
    const [techOSMode, setTechOSMode] = useState<TechOSMode>('technician');

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

    useEffect(() => {
        loadTechOSAccess();
    }, [requestedCompanyId]);

    async function loadTechOSAccess() {
        setCheckingAccess(true);
        setMessage('Loading TechOS...');
        setMembership(null);
        setIsPlatformAdminAccess(false);
        setCompany(null);
        setClients([]);
        setPropertiesById({});
        setJobs([]);
        setActiveCompanyId('');
        setClientMessage('');
        setCreatingJobClientId(null);
        setJobMessage('');
        setAssignmentModelReady(false);
        setTechOSMode('technician');

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as any);
            return;
        }

        const platformAdminCheck = await loadPlatformAdminStatus(user.id);

        let membershipQuery = supabase
            .from('company_users')
            .select('id, company_id, full_name, email, role, status, created_at')
            .eq('auth_user_id', user.id)
            .eq('status', 'active')
            .in('role', TECHOS_ROLES)
            .order('created_at', { ascending: true })
            .limit(1);

        if (requestedCompanyId) {
            membershipQuery = membershipQuery.eq('company_id', requestedCompanyId);
        }

        const { data: membershipData, error: membershipError } = await membershipQuery;

        if (membershipError) {
            setCheckingAccess(false);
            setMessage(`Could not verify TechOS access: ${membershipError.message}`);
            return;
        }

        const activeMembership = ((membershipData || []) as CompanyUserAccess[])[0] || null;

        if (platformAdminCheck.isPlatformAdmin && requestedCompanyId) {
            setMembership(activeMembership);
            setIsPlatformAdminAccess(true);
            setTechOSMode('platform-preview');
            setActiveCompanyId(requestedCompanyId);
            await Promise.all([
                loadCompanyBrand(requestedCompanyId),
                loadCompanyClients(requestedCompanyId),
                loadCompanyJobs(requestedCompanyId, 'platform-preview'),
            ]);
            setCheckingAccess(false);
            setMessage('');
            return;
        }

        if (!activeMembership || !isTechOSRole(activeMembership.role)) {
            setCheckingAccess(false);
            setMessage(
                platformAdminCheck.isPlatformAdmin
                    ? 'Choose a company before opening TechOS as a platform admin.'
                    : 'TechOS is available to active company technicians, managers, admins, and owners.'
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
                loadAssignedTechnicianJobs(),
            ]);
        } else {
            await Promise.all([
                loadCompanyBrand(activeMembership.company_id),
                loadCompanyClients(activeMembership.company_id),
                loadCompanyJobs(activeMembership.company_id, 'management-preview'),
            ]);
        }
        setCheckingAccess(false);
        setMessage('');
    }

    async function loadCompanyBrand(companyIdToLoad: string) {
        const { data, error } = await supabase
            .from('companies')
            .select(
                'id, name, status, public_name, dba_name, logo_url, primary_color, secondary_color, accent_color, service_categories, license_number, short_description'
            )
            .eq('id', companyIdToLoad)
            .maybeSingle();

        if (error) {
            setMessage(`TechOS loaded, but company branding could not be loaded: ${error.message}`);
            setCompany(null);
            return;
        }

        setCompany((data || null) as CompanyBrand | null);
    }

    async function loadCompanyClients(companyIdToLoad: string) {
        setClientMessage('');

        const { data, error } = await supabase
            .from('company_property_clients')
            .select(
                'id, company_id, property_id, property_connection_id, display_name, status, source, first_requested_at, last_requested_at, connected_at, created_at'
            )
            .eq('company_id', companyIdToLoad)
            .order('created_at', { ascending: false });

        if (error) {
            setClients([]);
            setPropertiesById({});
            setClientMessage(`Could not load assigned clients: ${error.message}`);
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

        const { data, error } = await supabase
            .from('properties')
            .select('id, name, address, address_line_1, city, state, zip, postal_code')
            .in('id', propertyIds);

        if (error) {
            setPropertiesById({});
            setClientMessage(`Clients loaded, but basic home details could not be loaded: ${error.message}`);
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

    async function loadAssignedTechnicianJobs() {
        setJobLoading(true);
        setAssignmentModelReady(false);

        try {
            const { data, error } = await supabase.rpc('get_my_techos_jobs');

            if (error) {
                throw error;
            }

            setAssignmentModelReady(true);
            setJobs((data || []) as TechOSJob[]);
            setJobMessage('');
        } catch (error: any) {
            console.error('Could not load assigned TechOS jobs', {
                message: error?.message,
                code: error?.code,
                details: error?.details,
                hint: error?.hint,
            });
            setJobs([]);
            setJobMessage('Job assignment is not configured yet. Jobs will appear here after dispatch assigns them.');
        } finally {
            setJobLoading(false);
        }
    }

    async function loadCompanyJobs(companyIdToLoad: string, mode: TechOSMode) {
        setJobLoading(true);

        try {
            const { data, error } = await supabase
                .from('jobs')
                .select(
                    'id, company_id, property_id, company_property_client_id, title, status, job_source, created_at, updated_at'
                )
                .eq('company_id', companyIdToLoad)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                throw error;
            }

            setJobs((data || []) as TechOSJob[]);
            setJobMessage(
                mode === 'technician'
                    ? ''
                    : 'This is not a technician login. Select or assign a technician from ManagementOS to preview their workload.'
            );
        } catch (error: any) {
            console.error('Could not load TechOS jobs', {
                message: error?.message,
                code: error?.code,
                details: error?.details,
                hint: error?.hint,
            });
            setJobs([]);
            setJobMessage(error?.message ? `Could not load company jobs preview: ${error.message}` : 'Could not load company jobs preview right now.');
        } finally {
            setJobLoading(false);
        }
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
        } catch (error: any) {
            console.error('Could not create TechOS service job', {
                message: error?.message,
                code: error?.code,
                details: error?.details,
                hint: error?.hint,
            });
            const errorMessage = error?.message
                ? `Could not create service job for ${clientName}: ${error.message}`
                : `Could not create service job for ${clientName}.`;
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

    if (checkingAccess) {
        return <AccessMessage title="TechOS" message="Checking TechOS access..." />;
    }

    if (!membership && !isPlatformAdminAccess) {
        return <AccessMessage title="TechOS" message={message} />;
    }

    const companyName = company?.public_name || company?.name || 'Company';
    const dbaName = company?.dba_name || 'DBA not set';
    const primaryColor = company?.primary_color || theme.colors.primary;
    const secondaryColor = company?.secondary_color || theme.colors.primaryText;
    const accentColor = company?.accent_color || theme.colors.primary;
    const heroTextColor = getReadableColor(primaryColor);
    const logoUrl = company?.logo_url?.trim() || '';
    const canPreviewLogo = logoUrl.startsWith('http');
    const isTechnicianWorkspace = techOSMode === 'technician';
    const screenTitle = isTechnicianWorkspace ? 'My TechOS Workspace' : 'TechOS Management Preview';
    const jobBoardTitle = isTechnicianWorkspace ? 'Assigned Jobs' : 'Company Jobs Preview';
    const jobBoardDescription = isTechnicianWorkspace
        ? 'Only jobs assigned to the signed-in technician belong here.'
        : 'Company-level jobs shown for setup and dispatch preview. This is not one technician workload.';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: pagePadding, paddingBottom: 44, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1120, minWidth: 0 }}>
                <HomeHeader />

                <View
                    style={[
                        heroCardStyle,
                        {
                            backgroundColor: primaryColor,
                            borderColor: accentColor,
                        },
                    ]}
                >
                    <View style={heroTopRowStyle}>
                        {canPreviewLogo ? (
                            <Image source={{ uri: logoUrl }} style={[logoStyle, { backgroundColor: secondaryColor }]} />
                        ) : (
                            <View style={[logoFallbackStyle, { backgroundColor: secondaryColor }]}>
                                <Text style={[logoFallbackTextStyle, { color: getReadableColor(secondaryColor) }]}>
                                    {companyName.slice(0, 1).toUpperCase()}
                                </Text>
                            </View>
                        )}

                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[kickerStyle, { color: heroTextColor }]}>
                                {isTechnicianWorkspace ? 'Technician Workspace' : 'Management Preview'}
                            </Text>
                            <Text
                                style={[
                                    titleStyle,
                                    {
                                        color: heroTextColor,
                                        fontSize: isPhoneLayout ? 30 : titleStyle.fontSize,
                                    },
                                ]}
                            >
                                {screenTitle}
                            </Text>
                            <Text style={[dbaStyle, { color: accentColor }]}>{companyName}{dbaName ? ` / ${dbaName}` : ''}</Text>
                            <Text style={[subtitleStyle, { color: heroTextColor }]}>
                                {isTechnicianWorkspace
                                    ? 'Field workspace for jobs assigned to the signed-in technician.'
                                    : 'Company admins can review TechOS setup here without impersonating a technician.'}
                                {' '}Private homeowner photos, documents, and history stay out of TechOS until explicit access is built.
                            </Text>
                        </View>
                    </View>

                    <View style={pillRowStyle}>
                        <InfoPill
                            label="Role"
                            value={isPlatformAdminAccess ? 'Platform Admin' : formatLabel(membership?.role)}
                            textColor={heroTextColor}
                        />
                        <InfoPill
                            label="Mode"
                            value={isTechnicianWorkspace ? 'Technician' : 'Preview'}
                            textColor={heroTextColor}
                        />
                        <InfoPill label="Company" value={formatStatus(company?.status)} textColor={heroTextColor} />
                    </View>
                </View>

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

                <View style={summaryGridStyle}>
                    <SummaryCard
                        title={isTechnicianWorkspace ? 'My Assigned Jobs' : 'Active Jobs'}
                        value={String(visibleJobs.length)}
                        note={isTechnicianWorkspace ? 'Jobs assigned through dispatch.' : 'Company jobs visible in preview.'}
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
                        title={isTechnicianWorkspace ? 'My Sales' : 'Technicians'}
                        value="--"
                        note={isTechnicianWorkspace ? 'Sales totals are not connected yet.' : 'Technician assignment summary is not configured yet.'}
                    />
                    {!isTechnicianWorkspace && (
                        <SummaryCard
                            title="Unassigned Jobs"
                            value="--"
                            note="Assignment tracking will connect after job_assignments is installed."
                        />
                    )}
                    {!isTechnicianWorkspace && (
                        <SummaryCard
                            title="Dispatch Assignment"
                            value="--"
                            note="Assign technician workflow is proposed in SQL 577."
                        />
                    )}
                </View>

                <TechOSJobsBoard
                    clients={visibleClients}
                    groupedJobs={groupedJobSections}
                    jobs={visibleJobs}
                    loading={jobLoading}
                    message={jobMessage}
                    onOpenJob={handleOpenJob}
                    propertiesById={propertiesById}
                    title={jobBoardTitle}
                    description={jobBoardDescription}
                    emptyMessage={
                        isTechnicianWorkspace && !assignmentModelReady
                            ? 'Job assignment is not configured yet. Jobs will appear here after dispatch assigns them.'
                            : 'Jobs will appear here after ManagementOS dispatch creates or assigns company service jobs.'
                    }
                />

                <View style={secondarySectionHeaderStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text, marginBottom: 0 }]}>Field Tools</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Compact placeholders for the next technician workflow steps.
                    </Text>
                </View>
                <View style={compactModuleGridStyle}>
                    {secondaryWorkflowCards.map((card) => (
                        <WorkflowCard key={card.title} title={card.title} description={card.description} />
                    ))}
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

                <View style={buttonRowStyle}>
                    <ThemedButton title="Refresh TechOS" onPress={loadTechOSAccess} style={buttonStyle} />
                    <ThemedButton
                        title="Open Home"
                        variant="secondary"
                        onPress={() => router.push('/' as any)}
                        style={buttonStyle}
                    />
                </View>
            </View>
        </ScrollView>
    );
}

function AccessMessage({ title, message }: { title: string; message: string }) {
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
                        onPress={() => router.push('/' as any)}
                        style={{ marginTop: 16 }}
                    />
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

function InfoPill({ label, value, textColor }: { label: string; value: string; textColor: string }) {
    return (
        <View style={pillStyle}>
            <Text style={[pillLabelStyle, { color: textColor }]}>{label}</Text>
            <Text numberOfLines={1} style={[pillValueStyle, { color: textColor }]}>{value}</Text>
        </View>
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

function WorkflowCard({ title, description }: { title: string; description: string }) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={workflowCardStyle}>
            <Text style={[workflowTitleStyle, { color: theme.colors.text }]}>{title}</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{description}</Text>
            <View style={[comingSoonStyle, { backgroundColor: theme.colors.secondaryButton, borderColor: theme.colors.border }]}>
                <Text style={[comingSoonTextStyle, { color: theme.colors.secondaryButtonText }]}>Coming next</Text>
            </View>
        </ThemedCard>
    );
}

function TechOSJobsBoard({
    clients,
    description,
    emptyMessage,
    groupedJobs,
    jobs,
    loading,
    message,
    onOpenJob,
    propertiesById,
    title,
}: {
    clients: CompanyClient[];
    description: string;
    emptyMessage: string;
    groupedJobs: JobDateGroup[];
    jobs: TechOSJob[];
    loading: boolean;
    message: string;
    onOpenJob: (job: TechOSJob) => void;
    propertiesById: Record<string, PropertyRecord>;
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
                                        key={job.id}
                                        client={linkedClient}
                                        job={job}
                                        onOpenJob={onOpenJob}
                                        property={property}
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
    client,
    job,
    onOpenJob,
    property,
}: {
    client?: CompanyClient;
    job: TechOSJob;
    onOpenJob: (job: TechOSJob) => void;
    property?: PropertyRecord;
}) {
    const { theme } = useTheme();
    const displayName = client?.display_name || property?.name || 'Home';

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
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>Sale: Not tracked yet</Text>
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

function isTechOSRole(role?: string | null) {
    return TECHOS_ROLES.includes(normalizeRole(role) as CompanyRole);
}

function isTechnicianRole(role?: string | null) {
    const normalized = normalizeRole(role);

    return normalized === 'technician' || normalized === 'tech';
}

async function loadPlatformAdminStatus(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role, is_platform_admin')
        .eq('id', userId)
        .limit(1);

    if (!primaryQuery.error) {
        return {
            isPlatformAdmin: isPlatformAdminProfile((primaryQuery.data || [])[0] as PlatformProfile | undefined),
        };
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    return {
        isPlatformAdmin: isPlatformAdminProfile((fallbackQuery.data || [])[0] as PlatformProfile | undefined),
    };
}

function isPlatformAdminProfile(profile?: PlatformProfile | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

function normalizeRole(role?: string | null) {
    return String(role || '').trim().toLowerCase();
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

function normalizeStatus(status?: string | null) {
    return String(status || '').trim().toLowerCase();
}

function firstParam(value?: string | string[]) {
    if (Array.isArray(value)) return value[0] || '';

    return value || '';
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

const heroCardStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    borderRadius: 28,
    borderWidth: 1,
    marginBottom: 22,
    padding: 22,
};

const heroTopRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 18,
    minWidth: 0,
};

const logoStyle = {
    borderRadius: 24,
    height: 90,
    width: 90,
};

const logoFallbackStyle = {
    alignItems: 'center' as const,
    borderRadius: 24,
    height: 90,
    justifyContent: 'center' as const,
    width: 90,
};

const logoFallbackTextStyle = {
    fontSize: 40,
    fontWeight: '900' as const,
};

const kickerStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 6,
    opacity: 0.78,
};

const titleStyle = {
    fontSize: 36,
    fontWeight: '900' as const,
};

const dbaStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    marginTop: 4,
};

const subtitleStyle = {
    fontSize: 15,
    fontWeight: '700' as const,
    lineHeight: 22,
    marginTop: 8,
    opacity: 0.84,
};

const pillRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 18,
    maxWidth: '100%' as const,
};

const pillStyle = {
    maxWidth: '100%' as const,
    flexShrink: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
};

const pillLabelStyle = {
    fontSize: 11,
    fontWeight: '800' as const,
    opacity: 0.72,
};

const pillValueStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginTop: 2,
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

const workflowGridStyle = {
    width: '100%' as const,
    minWidth: 0,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 24,
};

const compactModuleGridStyle = {
    width: '100%' as const,
    minWidth: 0,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 24,
};

const workflowCardStyle = {
    flex: 1,
    flexBasis: 220,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minHeight: 140,
    minWidth: 0,
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

const secondarySectionHeaderStyle = {
    marginBottom: 10,
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

const comingSoonStyle = {
    alignSelf: 'flex-start' as const,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
};

const comingSoonTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const nextStepCardStyle = {
    marginBottom: 16,
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
