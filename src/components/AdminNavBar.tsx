import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { getCompanyLeadCounts, type CompanyLeadCounts } from '../lib/companyLeadAlerts';
import { safeBack } from '../lib/navigation';
import { useTheme } from '../theme/useTheme';

type AdminNavBarProps = {
    companyId?: string | null;
    backFallback?: Href;
    showBack?: boolean;
};

export default function AdminNavBar({
    companyId,
    backFallback = '/super-admin',
    showBack = true,
}: AdminNavBarProps) {
    const { theme } = useTheme();
    const normalizedCompanyId = String(companyId || '').trim();
    const companyDashboardRoute = normalizedCompanyId ? (`/super-admin/company/${normalizedCompanyId}` as Href) : null;
    const [leadCounts, setLeadCounts] = useState<CompanyLeadCounts | null>(null);
    const [leadCountError, setLeadCountError] = useState('');

    useEffect(() => {
        let active = true;

        async function loadLeadCounts() {
            if (!normalizedCompanyId) {
                setLeadCounts(null);
                setLeadCountError('');
                return;
            }

            try {
                const counts = await getCompanyLeadCounts(normalizedCompanyId);

                if (!active) return;

                setLeadCounts(counts);
                setLeadCountError('');
            } catch {
                if (!active) return;

                setLeadCounts(null);
                setLeadCountError('Lead count unavailable.');
            }
        }

        void loadLeadCounts();

        return () => {
            active = false;
        };
    }, [normalizedCompanyId]);

    const leadBadgeLabel = getLeadBadgeLabel(leadCounts, leadCountError);

    return (
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
            {normalizedCompanyId && leadBadgeLabel && (
                <NavButton
                    label={leadBadgeLabel}
                    onPress={() => router.push({
                        pathname: '/dispatch',
                        params: { companyId: normalizedCompanyId },
                    } as never)}
                    backgroundColor={leadCountError ? theme.colors.dangerBackground : theme.colors.secondaryButton}
                    borderColor={leadCountError ? theme.colors.danger : theme.colors.primary}
                    textColor={leadCountError ? theme.colors.danger : theme.colors.secondaryButtonText}
                />
            )}
        </View>
    );
}

function getLeadBadgeLabel(counts: CompanyLeadCounts | null, error: string) {
    if (error) return 'Lead count unavailable.';
    if (!counts || counts.newLeads === 0) return '';
    if (counts.emergencyLeads > 0) return `Emergency Leads: ${counts.emergencyLeads} / New Leads: ${counts.newLeads}`;

    return `New Leads: ${counts.newLeads}`;
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

const navWrapStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 16,
    marginBottom: 18,
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
