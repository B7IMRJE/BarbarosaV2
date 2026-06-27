import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import HomeHeader from '../../../components/HomeHeader';
import ThemedButton from '../../../components/theme/ThemedButton';
import ThemedCard from '../../../components/theme/ThemedCard';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/useTheme';

type CompanyUserAccess = {
    id: string;
    company_id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    status: string | null;
    created_at: string | null;
};

type CompanyUser = CompanyUserAccess & {
    auth_user_id: string | null;
};

type JobAssignment = {
    id: string;
    company_id: string | null;
    job_id: string | null;
    technician_company_user_id: string | null;
    technician_auth_user_id: string | null;
    role_on_job: string | null;
    status: string | null;
    assigned_at: string | null;
};

type CompanyBrand = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    accent_color: string | null;
};

type CompanyClient = {
    id: string;
    company_id: string;
    property_id: string;
    display_name: string | null;
    status: string | null;
    source: string | null;
    connected_at: string | null;
    first_requested_at: string | null;
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

type TechOSJobDetail = {
    id: string;
    company_id: string | null;
    property_id: string | null;
    company_property_client_id: string | null;
    title: string | null;
    status: string | null;
    job_source: string | null;
    created_at: string | null;
    updated_at: string | null;
    client_display_name?: string | null;
    client_status?: string | null;
    client_source?: string | null;
    client_linked_at?: string | null;
    property_name?: string | null;
    property_address?: string | null;
    property_city?: string | null;
    property_state?: string | null;
    property_postal_code?: string | null;
    assignment_id?: string | null;
    assignment_status?: string | null;
    role_on_job?: string | null;
    access_mode?: string | null;
    access_role?: string | null;
};

const jobWorkflowSections = [
    {
        title: 'Assessment',
        body: 'Assessment checklists will attach to this job in a later pass.',
    },
    {
        title: 'Photos & Notes',
        body: 'Field photos and technician notes are not exposed here yet.',
    },
    {
        title: 'Estimate',
        body: 'Estimate drafting will connect after job scope capture is ready.',
    },
    {
        title: 'Completion / Review Request',
        body: 'Closeout, completion notes, and review requests come after the field workflow.',
    },
];

export default function TechOSJobDetailScreen() {
    const { jobId, companyId } = useLocalSearchParams<{ jobId?: string | string[]; companyId?: string | string[] }>();
    const { width: viewportWidth } = useWindowDimensions();
    const { theme } = useTheme();
    const isPhoneLayout = viewportWidth <= 640;
    const pagePadding = isPhoneLayout ? 16 : 20;
    const requestedJobId = useMemo(() => firstParam(jobId), [jobId]);
    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [membership, setMembership] = useState<CompanyUserAccess | null>(null);
    const [isPlatformAdminAccess, setIsPlatformAdminAccess] = useState(false);
    const [company, setCompany] = useState<CompanyBrand | null>(null);
    const [job, setJob] = useState<TechOSJobDetail | null>(null);
    const [client, setClient] = useState<CompanyClient | null>(null);
    const [property, setProperty] = useState<PropertyRecord | null>(null);
    const [assignableUsers, setAssignableUsers] = useState<CompanyUser[]>([]);
    const [assignments, setAssignments] = useState<JobAssignment[]>([]);
    const [assignmentPickerOpen, setAssignmentPickerOpen] = useState(false);
    const [assignmentLoading, setAssignmentLoading] = useState(false);
    const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
    const [assignmentMessage, setAssignmentMessage] = useState('');
    const [message, setMessage] = useState('Loading job...');

    useEffect(() => {
        loadJobDetail();
    }, [requestedJobId, requestedCompanyId]);

    async function loadJobDetail() {
        setCheckingAccess(true);
        setMessage('Loading job...');
        setMembership(null);
        setIsPlatformAdminAccess(false);
        setCompany(null);
        setJob(null);
        setClient(null);
        setProperty(null);
        setAssignableUsers([]);
        setAssignments([]);
        setAssignmentPickerOpen(false);
        setAssignmentMessage('');

        if (!requestedJobId) {
            setCheckingAccess(false);
            setMessage('Missing job id.');
            return;
        }

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as any);
            return;
        }

        const { data: jobData, error: jobError } = await supabase.rpc('get_techos_job_detail', {
            p_job_id: requestedJobId,
            p_company_id: requestedCompanyId || null,
        });

        if (jobError) {
            console.error('Could not load TechOS job detail', {
                message: jobError.message,
                code: jobError.code,
                details: jobError.details,
                hint: jobError.hint,
            });
            setCheckingAccess(false);
            setMessage(getFriendlyJobAccessMessage(jobError.message));
            return;
        }

        const loadedJob = (((jobData || []) as TechOSJobDetail[])[0] || null) as TechOSJobDetail | null;
        if (!loadedJob) {
            setCheckingAccess(false);
            setMessage('Job not found or not available to this TechOS user.');
            return;
        }

        if (!loadedJob.company_id) {
            setCheckingAccess(false);
            setMessage('This job is not linked to a company workspace.');
            return;
        }

        const isPlatformPreview = loadedJob.access_mode === 'platform_preview';
        const activeMembership = isPlatformPreview
            ? null
            : buildAccessMembership(loadedJob, user.id);

        setMembership(activeMembership);
        setIsPlatformAdminAccess(isPlatformPreview);
        setJob(loadedJob);
        setClient(buildClientFromJob(loadedJob));
        setProperty(buildPropertyFromJob(loadedJob));
        setMessage('');

        await Promise.all([
            loadCompanyBrand(loadedJob.company_id),
            loadJobAssignments(loadedJob.company_id, loadedJob.id),
            canManageAssignments(loadedJob) ? loadAssignableUsers(loadedJob.company_id) : Promise.resolve(),
        ]);

        setCheckingAccess(false);
    }

    async function loadCompanyBrand(companyIdToLoad: string) {
        const { data, error } = await supabase
            .from('companies')
            .select('id, name, public_name, dba_name, primary_color, secondary_color, accent_color')
            .eq('id', companyIdToLoad)
            .maybeSingle();

        if (error) {
            console.error('Could not load TechOS job company brand', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            });
            setCompany(null);
            setMessage('Job loaded, but company branding could not be loaded.');
            return;
        }

        setCompany((data || null) as CompanyBrand | null);
    }

    async function loadAssignableUsers(companyIdToLoad: string) {
        setAssignmentLoading(true);

        try {
            const result = await loadCompanyMembers(companyIdToLoad);

            if (result.error) {
                setAssignmentMessage(`Could not load technicians: ${result.error.message}`);
                setAssignableUsers([]);
                return;
            }

            setAssignableUsers(
                result.data.filter((member) => isActiveStatus(member.status) && isTechOSAssignableRole(member.role))
            );
        } finally {
            setAssignmentLoading(false);
        }
    }

    async function loadJobAssignments(companyIdToLoad: string, jobIdToLoad: string) {
        const { data, error } = await supabase
            .from('job_assignments')
            .select('id, company_id, job_id, technician_company_user_id, technician_auth_user_id, role_on_job, status, assigned_at')
            .eq('company_id', companyIdToLoad)
            .eq('job_id', jobIdToLoad)
            .order('assigned_at', { ascending: false });

        if (error) {
            console.error('Could not load TechOS job assignments', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            });
            setAssignments([]);
            return;
        }

        setAssignments(normalizeAssignments(data));
    }

    async function handleAssignTechnician(member: CompanyUser) {
        if (!job?.company_id || !job.id) return;

        setAssigningUserId(member.id);
        setAssignmentMessage(`Assigning ${getMemberDisplayName(member)}...`);

        const primaryResult = await supabase.rpc('assign_technician_to_job', {
            company_id: job.company_id,
            job_id: job.id,
            technician_user_id: member.id,
            note: 'Assigned from TechOS job detail',
        });

        const fallbackResult = primaryResult.error && shouldTryAssignmentFallback(primaryResult.error.message)
            ? await supabase.rpc('assign_technician_to_job', {
                p_company_id: job.company_id,
                p_job_id: job.id,
                p_technician_company_user_id: member.id,
                p_role_on_job: 'primary',
            })
            : primaryResult;

        if (fallbackResult.error) {
            console.error('Could not assign TechOS technician', {
                message: fallbackResult.error.message,
                code: fallbackResult.error.code,
                details: fallbackResult.error.details,
                hint: fallbackResult.error.hint,
            });
            setAssignmentMessage(getFriendlyAssignmentMessage(fallbackResult.error.message));
            setAssigningUserId(null);
            return;
        }

        setAssignmentPickerOpen(false);
        setAssignmentMessage(`${getMemberDisplayName(member)} was assigned. Refreshing job...`);
        setAssigningUserId(null);
        await loadJobDetail();
    }

    function handleBackToTechOS() {
        if (requestedCompanyId) {
            router.push({
                pathname: '/techos',
                params: { companyId: requestedCompanyId },
            } as any);
            return;
        }

        router.push('/techos' as any);
    }

    if (checkingAccess) {
        return <AccessMessage message="Checking TechOS job access..." onBack={handleBackToTechOS} />;
    }

    const companyName = company?.public_name || company?.name || 'TechOS';
    const primaryColor = company?.primary_color || theme.colors.primary;
    const accentColor = company?.accent_color || theme.colors.primary;
    const heroTextColor = getReadableColor(primaryColor);
    const displayClientName = client?.display_name || property?.name || 'Home';
    const linkedAt = client?.connected_at || client?.first_requested_at || client?.created_at;
    const canAssignTechnician = !!job && canManageAssignments(job);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: pagePadding, paddingBottom: 44, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1040, minWidth: 0 }}>
                <HomeHeader />

                <View style={[heroCardStyle, { backgroundColor: primaryColor, borderColor: accentColor }]}>
                    <Text style={[kickerStyle, { color: heroTextColor }]}>TechOS Job</Text>
                    <Text style={[titleStyle, { color: heroTextColor }]}>{job?.title || 'Service Visit'}</Text>
                    <Text style={[subtitleStyle, { color: heroTextColor }]}>
                        {companyName}
                        {company?.dba_name ? ` / ${company.dba_name}` : ''}
                    </Text>
                    <Text style={[subtitleStyle, { color: heroTextColor }]}>
                        Job details are populated from the assigned job context. Private HomeOS photos, documents, and
                        history are not loaded here.
                    </Text>
                    <View style={pillRowStyle}>
                        <InfoPill label="Role" value={isPlatformAdminAccess ? 'Platform Admin' : formatLabel(membership?.role || job?.access_role)} textColor={heroTextColor} />
                        <InfoPill label="Status" value={formatStatus(job?.status)} textColor={heroTextColor} />
                        <InfoPill label="Source" value={formatSource(job?.job_source)} textColor={heroTextColor} />
                        <InfoPill label="Created" value={formatDate(job?.created_at)} textColor={heroTextColor} />
                    </View>
                </View>

                <View style={buttonRowStyle}>
                    <ThemedButton title="Back to TechOS" variant="secondary" onPress={handleBackToTechOS} style={buttonStyle} />
                    <ThemedButton title="Refresh Job" onPress={loadJobDetail} style={buttonStyle} />
                </View>

                {!!message && (
                    <ThemedCard style={messageCardStyle}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}

                {job && (
                    <>
                        <AssignmentCard
                            assignments={assignments}
                            assignableUsers={assignableUsers}
                            canAssign={canAssignTechnician}
                            loading={assignmentLoading}
                            pickerOpen={assignmentPickerOpen}
                            assigningUserId={assigningUserId}
                            message={assignmentMessage}
                            onTogglePicker={() => setAssignmentPickerOpen((current) => !current)}
                            onAssign={handleAssignTechnician}
                        />

                        <View style={summaryGridStyle}>
                            <DetailCard title="Client / Home" value={displayClientName} body={formatAddress(property) || 'Basic home details are not available yet.'} />
                            <DetailCard title="Client Status" value={formatStatus(client?.status)} body={`Source: ${formatSource(client?.source)}`} />
                            <DetailCard title="Linked" value={formatDate(linkedAt)} body="Basic company client relationship for this assigned job." />
                        </View>

                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Job Workflow</Text>
                        <View style={workflowGridStyle}>
                            {jobWorkflowSections.map((section) => (
                                <ThemedCard key={section.title} style={workflowCardStyle}>
                                    <Text style={[workflowTitleStyle, { color: theme.colors.text }]}>{section.title}</Text>
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{section.body}</Text>
                                    <View style={[comingSoonStyle, { backgroundColor: theme.colors.secondaryButton, borderColor: theme.colors.border }]}>
                                        <Text style={[comingSoonTextStyle, { color: theme.colors.secondaryButtonText }]}>Coming next</Text>
                                    </View>
                                </ThemedCard>
                            ))}
                        </View>
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function AccessMessage({ message, onBack }: { message: string; onBack: () => void }) {
    const { theme } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 720 }}>
                <HomeHeader />
                <ThemedCard>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>TechOS Job</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    <ThemedButton title="Back to TechOS" variant="secondary" onPress={onBack} style={{ marginTop: 16 }} />
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

function AssignmentCard({
    assignments,
    assignableUsers,
    canAssign,
    loading,
    pickerOpen,
    assigningUserId,
    message,
    onTogglePicker,
    onAssign,
}: {
    assignments: JobAssignment[];
    assignableUsers: CompanyUser[];
    canAssign: boolean;
    loading: boolean;
    pickerOpen: boolean;
    assigningUserId: string | null;
    message: string;
    onTogglePicker: () => void;
    onAssign: (member: CompanyUser) => void;
}) {
    const { theme } = useTheme();
    const activeAssignments = assignments.filter((assignment) => isActiveAssignmentStatus(assignment.status));

    return (
        <ThemedCard style={assignmentCardStyle}>
            <View style={assignmentHeaderStyle}>
                <View style={assignmentHeaderTextStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text, marginBottom: 4 }]}>Assignment</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        {activeAssignments.length > 0
                            ? `${activeAssignments.length} active assignment${activeAssignments.length === 1 ? '' : 's'} on this job.`
                            : 'No active assignment is visible for this job yet.'}
                    </Text>
                </View>

                {canAssign && (
                    <ThemedButton
                        title={pickerOpen ? 'Hide Technicians' : 'Assign Technician'}
                        onPress={onTogglePicker}
                        disabled={loading || assigningUserId !== null}
                        style={assignmentButtonStyle}
                    />
                )}
            </View>

            {activeAssignments.length > 0 ? (
                <View style={assignmentListStyle}>
                    {activeAssignments.map((assignment) => (
                        <View key={assignment.id} style={[assignmentRowStyle, { borderColor: theme.colors.border }]}>
                            <View style={assignmentRowTextStyle}>
                                <Text style={[assignmentNameStyle, { color: theme.colors.text }]}>
                                    {getAssignmentDisplayName(assignment, assignableUsers)}
                                </Text>
                                <Text style={[assignmentMetaStyle, { color: theme.colors.mutedText }]}>
                                    {formatLabel(assignment.role_on_job)} / {formatStatus(assignment.status)}
                                    {' / '}Assigned {formatDate(assignment.assigned_at)}
                                </Text>
                            </View>
                            <View style={[statusBadgeStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.secondaryButton }]}>
                                <Text style={[statusBadgeTextStyle, { color: theme.colors.secondaryButtonText }]}>
                                    {formatStatus(assignment.status)}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <Text style={[bodyTextStyle, { color: theme.colors.mutedText, marginTop: 12 }]}>
                    Dispatch can assign one or more technicians/helpers here. Technicians only see jobs assigned to them.
                </Text>
            )}

            {canAssign && pickerOpen && (
                <View style={pickerPanelStyle}>
                    {loading ? (
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading technicians...</Text>
                    ) : assignableUsers.length === 0 ? (
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            No active TechOS users found for this company.
                        </Text>
                    ) : (
                        assignableUsers.map((member) => {
                            const assigning = assigningUserId === member.id;

                            return (
                                <TouchableOpacity
                                    key={member.id}
                                    onPress={() => onAssign(member)}
                                    disabled={assigningUserId !== null}
                                    style={[pickerRowStyle, { borderColor: theme.colors.border }]}
                                >
                                    <View style={assignmentRowTextStyle}>
                                        <Text style={[assignmentNameStyle, { color: theme.colors.text }]}>
                                            {getMemberDisplayName(member)}
                                        </Text>
                                        <Text style={[assignmentMetaStyle, { color: theme.colors.mutedText }]}>
                                            {member.email || shortId(member.auth_user_id || member.id)}
                                            {' / '}
                                            {formatLabel(member.role)}
                                        </Text>
                                    </View>
                                    <Text style={[pickerActionTextStyle, { color: theme.colors.primary }]}>
                                        {assigning ? 'Assigning...' : 'Assign'}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>
            )}

            {!!message && (
                <Text style={[assignmentMessageStyle, { color: theme.colors.mutedText }]}>
                    {message}
                </Text>
            )}
        </ThemedCard>
    );
}

function DetailCard({ title, value, body }: { title: string; value: string; body: string }) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={summaryCardStyle}>
            <Text style={[cardLabelStyle, { color: theme.colors.mutedText }]}>{title}</Text>
            <Text style={[cardValueStyle, { color: theme.colors.text }]}>{value}</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{body}</Text>
        </ThemedCard>
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

function buildAccessMembership(loadedJob: TechOSJobDetail, userId: string): CompanyUserAccess | null {
    if (!loadedJob.company_id) return null;

    return {
        id: loadedJob.assignment_id || userId,
        company_id: loadedJob.company_id,
        full_name: null,
        email: null,
        role: loadedJob.access_role || loadedJob.role_on_job || 'technician',
        status: loadedJob.assignment_status || 'active',
        created_at: loadedJob.created_at,
    };
}

function buildClientFromJob(loadedJob: TechOSJobDetail): CompanyClient | null {
    if (!loadedJob.company_id || !loadedJob.property_id) return null;
    if (!loadedJob.company_property_client_id && !loadedJob.client_display_name) return null;

    return {
        id: loadedJob.company_property_client_id || `${loadedJob.company_id}:${loadedJob.property_id}`,
        company_id: loadedJob.company_id,
        property_id: loadedJob.property_id,
        display_name: loadedJob.client_display_name || null,
        status: loadedJob.client_status || null,
        source: loadedJob.client_source || null,
        connected_at: loadedJob.client_linked_at || null,
        first_requested_at: null,
        created_at: loadedJob.client_linked_at || null,
    };
}

function buildPropertyFromJob(loadedJob: TechOSJobDetail): PropertyRecord | null {
    if (!loadedJob.property_id) return null;

    return {
        id: loadedJob.property_id,
        name: loadedJob.property_name || null,
        address: loadedJob.property_address || null,
        address_line_1: loadedJob.property_address || null,
        city: loadedJob.property_city || null,
        state: loadedJob.property_state || null,
        zip: loadedJob.property_postal_code || null,
        postal_code: loadedJob.property_postal_code || null,
    };
}

function getFriendlyJobAccessMessage(message?: string | null) {
    const normalized = normalizeStatus(message);

    if (normalized.includes('not assigned')) {
        return 'You are not assigned to this TechOS job.';
    }

    if (normalized.includes('selected company')) {
        return 'Open this job from the selected company TechOS preview.';
    }

    if (normalized.includes('not authorized')) {
        return 'You are not authorized to view this TechOS job.';
    }

    if (normalized.includes('not found')) {
        return 'Job not found or not available to this TechOS user.';
    }

    return message ? `Could not load job: ${message}` : 'Could not load this TechOS job right now.';
}

function getFriendlyAssignmentMessage(message?: string | null) {
    const normalized = normalizeStatus(message);

    if (normalized.includes('not authorized')) {
        return 'You are not authorized to assign technicians for this company.';
    }

    if (normalized.includes('not found')) {
        return 'That technician or job is no longer available for assignment.';
    }

    return message ? `Could not assign technician: ${message}` : 'Could not assign technician right now.';
}

function shouldTryAssignmentFallback(message?: string | null) {
    const normalized = normalizeStatus(message);

    return (
        normalized.includes('function') ||
        normalized.includes('parameter') ||
        normalized.includes('schema cache') ||
        normalized.includes('pgrst202')
    );
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

function normalizeAssignments(data: unknown): JobAssignment[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                id: readStringField(record, 'id') || '',
                company_id: readStringField(record, 'company_id'),
                job_id: readStringField(record, 'job_id'),
                technician_company_user_id: readStringField(record, 'technician_company_user_id'),
                technician_auth_user_id: readStringField(record, 'technician_auth_user_id'),
                role_on_job: readStringField(record, 'role_on_job'),
                status: readStringField(record, 'status'),
                assigned_at: readStringField(record, 'assigned_at'),
            };
        })
        .filter((assignment) => assignment.id);
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function canManageAssignments(loadedJob: TechOSJobDetail) {
    const accessMode = normalizeStatus(loadedJob.access_mode);
    const accessRole = normalizeStatus(loadedJob.access_role);

    return (
        accessMode === 'platform_preview' ||
        accessMode === 'company_preview' ||
        ['owner', 'admin', 'manager', 'platform_admin'].includes(accessRole)
    );
}

function isTechOSAssignableRole(role?: string | null) {
    return ['technician', 'tech', 'manager', 'admin', 'owner'].includes(normalizeStatus(role));
}

function isActiveStatus(status?: string | null) {
    return normalizeStatus(status) === 'active';
}

function isActiveAssignmentStatus(status?: string | null) {
    return !['removed', 'revoked', 'cancelled'].includes(normalizeStatus(status));
}

function getAssignmentDisplayName(assignment: JobAssignment, members: CompanyUser[]) {
    const member = members.find((candidate) => candidate.id === assignment.technician_company_user_id);

    if (member) return getMemberDisplayName(member);
    if (assignment.technician_auth_user_id) return `User ${shortId(assignment.technician_auth_user_id)}`;
    if (assignment.technician_company_user_id) return `Team member ${shortId(assignment.technician_company_user_id)}`;

    return 'Assigned technician';
}

function getMemberDisplayName(member: CompanyUser) {
    return member.full_name || member.email || `Team member ${shortId(member.auth_user_id || member.id)}`;
}

function shortId(value: string) {
    return value.length > 8 ? value.slice(0, 8) : value;
}

function formatLabel(value?: string | null) {
    return String(value || 'unknown')
        .trim()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function formatAddress(property?: PropertyRecord | null) {
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
    if (normalized === 'open') return 'Open';

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
    marginBottom: 16,
    padding: 22,
};

const kickerStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 6,
    opacity: 0.78,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
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

const assignmentCardStyle = {
    marginBottom: 18,
};

const assignmentHeaderStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
};

const assignmentHeaderTextStyle = {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
};

const assignmentButtonStyle = {
    minWidth: 180,
};

const assignmentListStyle = {
    gap: 10,
    marginTop: 14,
};

const assignmentRowStyle = {
    alignItems: 'center' as const,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const assignmentRowTextStyle = {
    flex: 1,
    minWidth: 0,
};

const assignmentNameStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const assignmentMetaStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 18,
    marginTop: 2,
};

const statusBadgeStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
};

const statusBadgeTextStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
};

const pickerPanelStyle = {
    gap: 8,
    marginTop: 14,
};

const pickerRowStyle = {
    alignItems: 'center' as const,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const pickerActionTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const assignmentMessageStyle = {
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 19,
    marginTop: 12,
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
    flexBasis: 240,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
};

const cardLabelStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    marginBottom: 5,
    textTransform: 'uppercase' as const,
};

const cardValueStyle = {
    fontSize: 20,
    fontWeight: '900' as const,
    marginBottom: 8,
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
    flexBasis: 260,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minHeight: 160,
    minWidth: 0,
};

const workflowTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 8,
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

const buttonRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 18,
};

const buttonStyle = {
    flexBasis: 180,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
};
