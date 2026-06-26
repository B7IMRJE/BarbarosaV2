import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
    const { theme } = useTheme();
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [membership, setMembership] = useState<CompanyUserAccess | null>(null);
    const [isPlatformAdminAccess, setIsPlatformAdminAccess] = useState(false);
    const [company, setCompany] = useState<CompanyBrand | null>(null);
    const [message, setMessage] = useState('Loading TechOS...');

    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);

    useEffect(() => {
        loadTechOSAccess();
    }, [requestedCompanyId]);

    async function loadTechOSAccess() {
        setCheckingAccess(true);
        setMessage('Loading TechOS...');
        setMembership(null);
        setIsPlatformAdminAccess(false);
        setCompany(null);

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
            await loadCompanyBrand(requestedCompanyId);
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
        await loadCompanyBrand(activeMembership.company_id);
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
            contentContainerStyle={{ padding: 20, paddingBottom: 44, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1120 }}>
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

                        <View style={{ flex: 1, minWidth: 260 }}>
                            <Text style={[kickerStyle, { color: heroTextColor }]}>TechOS Workspace</Text>
                            <Text style={[titleStyle, { color: heroTextColor }]}>{companyName}</Text>
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
                    <SummaryCard title="My Jobs" value="0" note="Job assignment is not connected yet." />
                    <SummaryCard title="Assigned Clients" value="0" note="Client assignment will connect after access rules are ready." />
                    <SummaryCard title="Open Assessments" value="0" note="Assessment drafts will live here." />
                </View>

                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Technician Workflow</Text>
                <View style={workflowGridStyle}>
                    {workflowCards.map((card) => (
                        <WorkflowCard key={card.title} title={card.title} description={card.description} />
                    ))}
                </View>

                <ThemedCard style={nextStepCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Next Connection Point</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        This shell is ready for the next pass: assigning a technician to a selected company client/home
                        and then showing only that approved job context in TechOS.
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
            <Text style={[pillValueStyle, { color: textColor }]}>{value}</Text>
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
};

const pillStyle = {
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
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 24,
};

const summaryCardStyle = {
    flex: 1,
    minWidth: 220,
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
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 24,
};

const workflowCardStyle = {
    flex: 1,
    minHeight: 170,
    minWidth: 280,
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
    minWidth: 180,
};
