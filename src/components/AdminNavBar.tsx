import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import {
    getCompanyLeadCounts,
    LEAD_ALERT_REFRESH_MS,
    type CompanyLeadCounts,
} from '../lib/companyLeadAlerts';
import { safeBack } from '../lib/navigation';
import { useTheme } from '../theme/useTheme';

type AdminNavBarProps = {
    companyId?: string | string[] | null;
    backFallback?: Href;
    showBack?: boolean;
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

    function openDispatchBoard() {
        if (!normalizedCompanyId) return;

        router.push({
            pathname: '/dispatch',
            params: { companyId: normalizedCompanyId },
        } as never);
    }

    return (
        <View style={navShellStyle}>
            <LeadAlertBadges
                counts={leadCounts}
                error={leadCountError}
                loading={leadCountLoading}
                onPress={openDispatchBoard}
            />

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
