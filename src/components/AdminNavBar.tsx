import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import {
    getCompanyLeadCounts,
    LEAD_ALERT_REFRESH_MS,
    type CompanyLeadCounts,
} from '../lib/companyLeadAlerts';
import { clearPendingCompanyInviteState } from '../lib/companyInviteState';
import { safeBack } from '../lib/navigation';
import { loadLoggedInUserCompanyAccess } from '../lib/onboarding';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type AdminNavBarProps = {
    companyId?: string | string[] | null;
    backFallback?: Href;
    showBack?: boolean;
};

type ManagementIdentity = {
    userId: string;
    email: string | null;
    companyUserId: string | null;
    role: string | null;
    status: string | null;
};

export default function AdminNavBar({
    companyId,
    backFallback = '/super-admin',
    showBack = true,
}: AdminNavBarProps) {
    const { theme } = useTheme();
    const normalizedCompanyId = normalizeCompanyId(companyId);
    const companyDashboardRoute = normalizedCompanyId ? (`/super-admin/company/${normalizedCompanyId}` as Href) : null;
    const [leadCounts, setLeadCounts] = useState<CompanyLeadCounts | null>(null);
    const [leadCountError, setLeadCountError] = useState('');
    const [leadCountLoading, setLeadCountLoading] = useState(false);
    const [identity, setIdentity] = useState<ManagementIdentity | null>(null);
    const [identityError, setIdentityError] = useState('');
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        let active = true;
        let refreshing = false;

        if (!normalizedCompanyId) {
            setLeadCounts(null);
            setLeadCountError('');
            setLeadCountLoading(false);
            return () => {
                active = false;
            };
        }

        async function loadLeadCounts() {
            if (refreshing) return;

            refreshing = true;
            setLeadCountLoading(true);

            try {
                const counts = await getCompanyLeadCounts(normalizedCompanyId);

                if (!active) return;

                setLeadCounts(counts);
                setLeadCountError('');
            } catch {
                if (!active) return;

                setLeadCounts(null);
                setLeadCountError('Lead count unavailable.');
            } finally {
                refreshing = false;

                if (active) {
                    setLeadCountLoading(false);
                }
            }
        }

        void loadLeadCounts();

        const intervalId = setInterval(() => {
            void loadLeadCounts();
        }, LEAD_ALERT_REFRESH_MS);

        const appStateSubscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                void loadLeadCounts();
            }
        });

        const focusTarget = globalThis as {
            addEventListener?: (type: 'focus', listener: () => void) => void;
            removeEventListener?: (type: 'focus', listener: () => void) => void;
        };
        const handleFocus = () => {
            void loadLeadCounts();
        };

        focusTarget.addEventListener?.('focus', handleFocus);

        return () => {
            active = false;
            clearInterval(intervalId);
            appStateSubscription.remove();
            focusTarget.removeEventListener?.('focus', handleFocus);
        };
    }, [normalizedCompanyId]);

    useEffect(() => {
        let active = true;

        if (!normalizedCompanyId) {
            setIdentity(null);
            setIdentityError('');
            return () => {
                active = false;
            };
        }

        async function loadIdentity() {
            try {
                const {
                    data: { user },
                    error: userError,
                } = await supabase.auth.getUser();

                if (userError || !user) {
                    if (!active) return;

                    setIdentity(null);
                    setIdentityError('Signed-in identity unavailable.');
                    return;
                }

                const accessResult = await loadLoggedInUserCompanyAccess(user.id);

                if (!active) return;

                const matchingAccess = accessResult.data.find((access) => access.company_id === normalizedCompanyId);

                setIdentity({
                    userId: user.id,
                    email: user.email || null,
                    companyUserId: matchingAccess?.id || null,
                    role: matchingAccess?.role || null,
                    status: matchingAccess?.status || (matchingAccess ? null : 'no company row'),
                });
                setIdentityError(accessResult.error ? 'Company access check unavailable.' : '');
            } catch {
                if (!active) return;

                setIdentity(null);
                setIdentityError('Signed-in identity unavailable.');
            }
        }

        void loadIdentity();

        return () => {
            active = false;
        };
    }, [normalizedCompanyId]);

    function openDispatchBoard() {
        if (!normalizedCompanyId) return;

        router.push({
            pathname: '/dispatch',
            params: { companyId: normalizedCompanyId },
        } as never);
    }

    async function signOut() {
        if (signingOut) return;

        setSigningOut(true);
        clearPendingCompanyInviteState();
        await supabase.auth.signOut();
        router.replace('/auth/login' as Href);
    }

    return (
        <View style={navShellStyle}>
            <LeadAlertBadges
                counts={leadCounts}
                error={leadCountError}
                loading={leadCountLoading}
                onPress={openDispatchBoard}
            />
            <View style={identityActionRowStyle}>
                <ManagementIdentityBadge identity={identity} error={identityError} />
                <NavButton
                    label={signingOut ? 'Signing Out...' : 'Sign Out'}
                    onPress={signOut}
                    backgroundColor={theme.colors.secondaryButton}
                    borderColor={theme.colors.border}
                    textColor={theme.colors.secondaryButtonText}
                />
            </View>

            <View style={navWrapStyle}>
                {showBack && (
                    <NavButton
                        label="Back"
                        onPress={() => safeBack(router, backFallback)}
                        backgroundColor={theme.colors.secondaryButton}
                        borderColor={theme.colors.border}
                        textColor={theme.colors.secondaryButtonText}
                    />
                )}
                <NavButton
                    label="Home"
                    onPress={() => router.replace('/' as Href)}
                    backgroundColor={theme.colors.secondaryButton}
                    borderColor={theme.colors.border}
                    textColor={theme.colors.secondaryButtonText}
                />
                <NavButton
                    label="Super Admin"
                    onPress={() => router.replace('/super-admin' as Href)}
                    backgroundColor={theme.colors.secondaryButton}
                    borderColor={theme.colors.border}
                    textColor={theme.colors.secondaryButtonText}
                />
                {companyDashboardRoute && (
                    <NavButton
                        label="Company Dashboard"
                        onPress={() => router.replace(companyDashboardRoute)}
                        backgroundColor={theme.colors.primary}
                        borderColor={theme.colors.primary}
                        textColor={theme.colors.primaryText}
                    />
                )}
            </View>
        </View>
    );
}

function ManagementIdentityBadge({
    identity,
    error,
}: {
    identity: ManagementIdentity | null;
    error: string;
}) {
    const { theme } = useTheme();
    const [showDetails, setShowDetails] = useState(false);

    if (error) {
        return (
            <View style={identityBadgeRowStyle}>
                <Text style={[identityTextStyle, { color: theme.colors.danger, backgroundColor: theme.colors.dangerBackground, borderColor: theme.colors.danger }]}>
                    {error}
                </Text>
            </View>
        );
    }

    if (!identity) return null;

    const role = identity.role ? formatTinyLabel(identity.role) : 'No company role';
    const status = identity.status ? formatTinyLabel(identity.status) : 'Unknown access';
    return (
        <View style={identityBadgeRowStyle}>
            <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => setShowDetails((current) => !current)}
                style={[
                    identityPillStyle,
                    {
                        backgroundColor: theme.colors.surfaceAlt,
                        borderColor: theme.colors.border,
                    },
                ]}
            >
                <Text style={[identityTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                    {identity.email || 'unknown email'} / role {role} / access {status}
                </Text>
                <Text style={[identityDetailsToggleTextStyle, { color: theme.colors.primary }]} numberOfLines={1}>
                    {showDetails ? 'Hide details' : 'Details'}
                </Text>
                {showDetails && (
                    <Text style={[identityDetailsTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                        user {shortId(identity.userId)} / company user {identity.companyUserId ? shortId(identity.companyUserId) : 'none'}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
}

function LeadAlertBadges({
    counts,
    error,
    loading,
    onPress,
}: {
    counts: CompanyLeadCounts | null;
    error: string;
    loading: boolean;
    onPress: () => void;
}) {
    const { theme } = useTheme();

    if (error) {
        return (
            <View style={leadBadgeRowStyle}>
                <Text
                    style={[
                        leadStatusTextStyle,
                        { color: theme.colors.danger, backgroundColor: theme.colors.dangerBackground },
                    ]}
                >
                    Lead count unavailable
                </Text>
            </View>
        );
    }

    if (loading && !counts) {
        return (
            <View style={leadBadgeRowStyle}>
                <Text
                    style={[
                        leadStatusTextStyle,
                        { color: theme.colors.mutedText, backgroundColor: theme.colors.surfaceAlt },
                    ]}
                >
                    Checking leads...
                </Text>
            </View>
        );
    }

    if (!counts || counts.newLeads === 0) return null;

    return (
        <View style={leadBadgeRowStyle}>
            {counts.emergencyLeads > 0 && (
                <LeadBadge
                    label={`Emergencies ${counts.emergencyLeads}`}
                    onPress={onPress}
                    backgroundColor={theme.colors.dangerBackground}
                    borderColor={theme.colors.danger}
                    textColor={theme.colors.danger}
                />
            )}
            <LeadBadge
                label={`Leads ${counts.newLeads}`}
                onPress={onPress}
                backgroundColor={theme.colors.secondaryButton}
                borderColor={theme.colors.primary}
                textColor={theme.colors.secondaryButtonText}
            />
        </View>
    );
}

function LeadBadge({
    label,
    onPress,
    backgroundColor,
    borderColor,
    textColor,
}: {
    label: string;
    onPress: () => void;
    backgroundColor: string;
    borderColor: string;
    textColor: string;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.82}
            accessibilityRole="button"
            onPress={onPress}
            style={[
                leadBadgeStyle,
                {
                    backgroundColor,
                    borderColor,
                },
            ]}
        >
            <Text style={[leadBadgeTextStyle, { color: textColor }]} numberOfLines={1}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

function NavButton({
    label,
    onPress,
    backgroundColor,
    borderColor,
    textColor,
}: {
    label: string;
    onPress: () => void;
    backgroundColor: string;
    borderColor: string;
    textColor: string;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.82}
            onPress={onPress}
            style={[
                navButtonStyle,
                {
                    backgroundColor,
                    borderColor,
                },
            ]}
        >
            <Text style={[navButtonTextStyle, { color: textColor }]} numberOfLines={1}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

function normalizeCompanyId(value?: string | string[] | null) {
    const text = Array.isArray(value) ? value[0] || '' : value || '';

    return text.trim();
}

function shortId(value: string) {
    const text = value.trim();

    return text.length <= 8 ? text : `...${text.slice(-8)}`;
}

function formatTinyLabel(value: string) {
    return value
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

const navShellStyle = {
    marginTop: 16,
    marginBottom: 18,
};

const navWrapStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const navButtonStyle = {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
};

const navButtonTextStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
};

const leadBadgeRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 10,
};

const leadBadgeStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
};

const leadBadgeTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const leadStatusTextStyle = {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '900' as const,
    overflow: 'hidden' as const,
    paddingHorizontal: 12,
    paddingVertical: 7,
};

const identityBadgeRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    flexShrink: 1,
};

const identityTextStyle = {
    fontSize: 11,
    fontWeight: '800' as const,
};

const identityActionRowStyle = {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 10,
};

const identityPillStyle = {
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 620,
    paddingHorizontal: 10,
    paddingVertical: 7,
};

const identityDetailsTextStyle = {
    fontSize: 10,
    fontWeight: '700' as const,
    marginTop: 3,
};

const identityDetailsToggleTextStyle = {
    fontSize: 10,
    fontWeight: '900' as const,
    marginTop: 3,
};
