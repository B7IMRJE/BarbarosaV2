import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import HomeHeader from '../../../components/HomeHeader';
import ThemedButton from '../../../components/theme/ThemedButton';
import ThemedCard from '../../../components/theme/ThemedCard';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/useTheme';

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
};

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

const TECHOS_ROLES: CompanyRole[] = ['technician', 'manager', 'admin', 'owner'];

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

        const { data: jobData, error: jobError } = await supabase
            .from('jobs')
            .select('id, company_id, property_id, company_property_client_id, title, status, job_source, created_at, updated_at')
            .eq('id', requestedJobId)
            .maybeSingle();

        if (jobError) {
            console.error('Could not load TechOS job detail', {
                message: jobError.message,
                code: jobError.code,
                details: jobError.details,
                hint: jobError.hint,
            });
            setCheckingAccess(false);
            setMessage(`Could not load job: ${jobError.message}`);
            return;
        }

        const loadedJob = (jobData || null) as TechOSJobDetail | null;
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

        if (requestedCompanyId && requestedCompanyId !== loadedJob.company_id) {
            setCheckingAccess(false);
            setMessage('This job does not belong to the selected company.');
            return;
        }

        const platformAdminCheck = await loadPlatformAdminStatus(user.id);
        const activeMembership = await loadCompanyMembership(user.id, loadedJob.company_id);
        const platformAdminAllowed = platformAdminCheck.isPlatformAdmin && requestedCompanyId === loadedJob.company_id;

        if (!activeMembership && !platformAdminAllowed) {
            setCheckingAccess(false);
            setMessage(
                platformAdminCheck.isPlatformAdmin
                    ? 'Open this job from a selected company TechOS workspace.'
                    : 'TechOS jobs are available to active company technicians, managers, admins, and owners.'
            );
            return;
        }

        setMembership(activeMembership);
        setIsPlatformAdminAccess(platformAdminAllowed);
        setJob(loadedJob);
        setMessage('');

        await Promise.all([
            loadCompanyBrand(loadedJob.company_id),
            loadJobClient(loadedJob),
            loadJobProperty(loadedJob.property_id),
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

    async function loadJobClient(loadedJob: TechOSJobDetail) {
        if (!loadedJob.company_id || !loadedJob.property_id) {
            setClient(null);
            return;
        }

        let query = supabase
            .from('company_property_clients')
            .select('id, company_id, property_id, display_name, status, source, connected_at, first_requested_at, created_at')
            .eq('company_id', loadedJob.company_id)
            .eq('property_id', loadedJob.property_id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (loadedJob.company_property_client_id) {
            query = query.eq('id', loadedJob.company_property_client_id);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Could not load TechOS job client', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            });
            setClient(null);
            setMessage('Job loaded, but client details could not be loaded.');
            return;
        }

        setClient(((data || []) as CompanyClient[])[0] || null);
    }

    async function loadJobProperty(propertyId?: string | null) {
        if (!propertyId) {
            setProperty(null);
            return;
        }

        const { data, error } = await supabase
            .from('properties')
            .select('id, name, address, address_line_1, city, state, zip, postal_code')
            .eq('id', propertyId)
            .maybeSingle();

        if (error) {
            console.error('Could not load TechOS job property', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            });
            setProperty(null);
            setMessage('Job loaded, but basic home details could not be loaded.');
            return;
        }

        setProperty((data || null) as PropertyRecord | null);
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
                    <View style={pillRowStyle}>
                        <InfoPill label="Role" value={isPlatformAdminAccess ? 'Platform Admin' : formatLabel(membership?.role)} textColor={heroTextColor} />
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
                        <View style={summaryGridStyle}>
                            <DetailCard title="Client / Home" value={displayClientName} body={formatAddress(property) || 'Basic home details are not available yet.'} />
                            <DetailCard title="Client Status" value={formatStatus(client?.status)} body={`Source: ${formatSource(client?.source)}`} />
                            <DetailCard title="Linked" value={formatDate(linkedAt)} body="Company client relationship." />
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

async function loadCompanyMembership(userId: string, companyId: string) {
    const { data, error } = await supabase
        .from('company_users')
        .select('id, company_id, full_name, email, role, status, created_at')
        .eq('auth_user_id', userId)
        .eq('company_id', companyId)
        .eq('status', 'active')
        .in('role', TECHOS_ROLES)
        .order('created_at', { ascending: true })
        .limit(1);

    if (error) {
        console.error('Could not verify TechOS company membership', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        return null;
    }

    const membership = ((data || []) as CompanyUserAccess[])[0] || null;
    return membership && isTechOSRole(membership.role) ? membership : null;
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

function isTechOSRole(role?: string | null) {
    return TECHOS_ROLES.includes(normalizeRole(role) as CompanyRole);
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
