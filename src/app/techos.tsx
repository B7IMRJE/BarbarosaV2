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

const TECHOS_ROLES: CompanyRole[] = ['technician', 'manager', 'admin', 'owner'];

const workflowCards = [
    {
        title: 'Today / My Jobs',
        description: 'Assigned field work will appear here once technician dispatch is connected.',
    },
    {
        title: 'Assigned Clients',
        description: 'Client and home assignments will stay limited to approved company access.',
    },
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

    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
    const visibleClients = useMemo(
        () => clients.filter((client) => normalizeStatus(client.status) !== 'archived'),
        [clients]
    );
    const visibleJobs = useMemo(
        () =>
            jobs.filter((job) => {
                const normalizedStatus = normalizeStatus(job.status);
                return !['archived', 'deleted', 'cancelled'].includes(normalizedStatus);
            }),
        [jobs]
    );

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
            setActiveCompanyId(requestedCompanyId);
            await Promise.all([
                loadCompanyBrand(requestedCompanyId),
                loadCompanyClients(requestedCompanyId),
                loadCompanyJobs(requestedCompanyId),
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
        setActiveCompanyId(activeMembership.company_id);
        await Promise.all([
            loadCompanyBrand(activeMembership.company_id),
            loadCompanyClients(activeMembership.company_id),
            loadCompanyJobs(activeMembership.company_id),
        ]);
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

    async function loadCompanyJobs(companyIdToLoad: string) {
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
        } catch (error: any) {
            console.error('Could not load TechOS jobs', {
                message: error?.message,
                code: error?.code,
                details: error?.details,
                hint: error?.hint,
            });
            setJobs([]);
            setJobMessage(error?.message ? `Could not load jobs: ${error.message}` : 'Could not load jobs right now.');
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
            await loadCompanyJobs(selectedCompanyId);
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
                            <Text style={[kickerStyle, { color: heroTextColor }]}>TechOS Workspace</Text>
                            <Text
                                numberOfLines={2}
                                style={[
                                    titleStyle,
                                    {
                                        color: heroTextColor,
                                        fontSize: isPhoneLayout ? 30 : titleStyle.fontSize,
                                    },
                                ]}
                            >
                                {companyName}
                            </Text>
                            <Text style={[dbaStyle, { color: accentColor }]}>{dbaName}</Text>
                            <Text style={[subtitleStyle, { color: heroTextColor }]}>
                                Technician-facing workspace for assigned jobs, assessments, notes, estimates, and
                                closeout. Private homeowner data stays hidden until explicit access is built.
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
                            label="Status"
                            value={isPlatformAdminAccess ? 'Admin Preview' : formatLabel(membership?.status)}
                            textColor={heroTextColor}
                        />
                        <InfoPill label="License" value={company?.license_number || 'Not set'} textColor={heroTextColor} />
                        {(company?.service_categories || []).slice(0, 3).map((category) => (
                            <InfoPill key={category} label="Service" value={category} textColor={heroTextColor} />
                        ))}
                    </View>
                </View>

                {!!message && (
                    <ThemedCard style={messageCardStyle}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}

                <View style={summaryGridStyle}>
                    <SummaryCard
                        title="My Jobs"
                        value={String(visibleJobs.length)}
                        note={visibleJobs.length === 1 ? 'Open company service job.' : 'Open company service jobs.'}
                    />
                    <SummaryCard
                        title="Assigned Clients"
                        value={String(visibleClients.length)}
                        note="Homes that selected this company as a provider."
                    />
                    <SummaryCard title="Open Assessments" value="0" note="Assessment drafts will live here." />
                </View>

                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Technician Workflow</Text>
                <View style={workflowGridStyle}>
                    {workflowCards.map((card) => {
                        if (card.title === 'Today / My Jobs') {
                            return (
                                <TechOSJobsCard
                                    key={card.title}
                                    clients={visibleClients}
                                    jobs={visibleJobs}
                                    loading={jobLoading}
                                    message={jobMessage}
                                    onOpenJob={handleOpenJob}
                                    propertiesById={propertiesById}
                                />
                            );
                        }

                        if (card.title === 'Assigned Clients') {
                            return (
                                <AssignedClientsCard
                                    key={card.title}
                                    clients={visibleClients}
                                    creatingJobClientId={creatingJobClientId}
                                    propertiesById={propertiesById}
                                    message={clientMessage}
                                    onStartServiceJob={handleStartServiceJob}
                                />
                            );
                        }

                        return <WorkflowCard key={card.title} title={card.title} description={card.description} />;
                    })}
                </View>

                <ThemedCard style={nextStepCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Next Connection Point</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Service jobs can now start from assigned clients. Technician assignment and field workflow
                        details come next.
                    </Text>
                    <View style={buttonRowStyle}>
                        <ThemedButton title="Refresh TechOS" onPress={loadTechOSAccess} style={buttonStyle} />
                        <ThemedButton
                            title="Open Home"
                            variant="secondary"
                            onPress={() => router.push('/' as any)}
                            style={buttonStyle}
                        />
                    </View>
                </ThemedCard>
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

function TechOSJobsCard({
    clients,
    jobs,
    loading,
    message,
    onOpenJob,
    propertiesById,
}: {
    clients: CompanyClient[];
    jobs: TechOSJob[];
    loading: boolean;
    message: string;
    onOpenJob: (job: TechOSJob) => void;
    propertiesById: Record<string, PropertyRecord>;
}) {
    const { theme } = useTheme();
    const clientsById = clients.reduce<Record<string, CompanyClient>>((accumulator, client) => {
        accumulator[client.id] = client;
        return accumulator;
    }, {});

    return (
        <ThemedCard style={workflowCardStyle}>
            <Text style={[workflowTitleStyle, { color: theme.colors.text }]}>Today / My Jobs</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                Company-scoped service jobs created from assigned clients.
            </Text>

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
                        Start a job from an assigned client when field work is ready.
                    </Text>
                </View>
            ) : (
                <View style={clientListStyle}>
                    {jobs.map((job) => {
                        const linkedClient = job.company_property_client_id
                            ? clientsById[job.company_property_client_id]
                            : undefined;
                        const property = job.property_id ? propertiesById[job.property_id] : undefined;

                        return (
                            <TechOSJobRow
                                key={job.id}
                                client={linkedClient}
                                job={job}
                                onOpenJob={onOpenJob}
                                property={property}
                            />
                        );
                    })}
                </View>
            )}
        </ThemedCard>
    );
}

function TechOSJobRow({
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
        <View style={[clientRowStyle, { borderColor: theme.colors.border }]}>
            <Text style={[clientNameStyle, { color: theme.colors.text }]}>{job.title || 'Service Visit'}</Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Client: {displayName}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Status: {formatStatus(job.status)}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Source: {formatSource(job.job_source)}
            </Text>
            <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>
                Created: {formatDate(job.created_at)}
            </Text>
            <ThemedButton
                title="Open Job"
                variant="secondary"
                onPress={() => onOpenJob(job)}
                style={clientActionButtonStyle}
            />
        </View>
    );
}

function AssignedClientsCard({
    clients,
    creatingJobClientId,
    propertiesById,
    message,
    onStartServiceJob,
}: {
    clients: CompanyClient[];
    creatingJobClientId: string | null;
    propertiesById: Record<string, PropertyRecord>;
    message: string;
    onStartServiceJob: (client: CompanyClient, property?: PropertyRecord) => void;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={assignedClientsCardStyle}>
            <Text style={[workflowTitleStyle, { color: theme.colors.text }]}>Assigned Clients</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                Homeowner-selected company clients with only basic home profile details.
            </Text>

            {!!message && (
                <Text style={[clientMetaTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
            )}

            {clients.length === 0 ? (
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
    property,
    onStartServiceJob,
}: {
    client: CompanyClient;
    creating: boolean;
    disabled: boolean;
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
            <ThemedButton
                title={creating ? 'Creating Job...' : 'Start Service Job'}
                variant="secondary"
                disabled={disabled}
                onPress={() => onStartServiceJob(client, property)}
                style={clientActionButtonStyle}
            />
        </View>
    );
}

function isTechOSRole(role?: string | null) {
    return TECHOS_ROLES.includes(normalizeRole(role) as CompanyRole);
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

const workflowCardStyle = {
    flex: 1,
    flexBasis: 280,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minHeight: 170,
    minWidth: 0,
};

const assignedClientsCardStyle = {
    flex: 2,
    flexBasis: 320,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minHeight: 170,
    minWidth: 0,
};

const workflowTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 8,
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
