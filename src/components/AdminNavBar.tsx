import { router, type Href } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
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
    const companyDashboardRoute = companyId ? (`/super-admin/company/${companyId}` as Href) : null;

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
        </View>
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
