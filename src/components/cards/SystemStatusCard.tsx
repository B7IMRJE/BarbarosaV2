import { Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { DEFAULT_THEME_NAME, homeOSThemes, type HomeOSTheme } from '../../theme';
import { useTheme } from '../../theme/useTheme';

type SystemStatusCardProps = {
    title: string;
    icon: string;
    status?: string | null;
    onPress?: () => void;
    style?: ViewStyle;
};

export function getStatusCardStyle(
    status?: string | null,
    theme: HomeOSTheme = homeOSThemes[DEFAULT_THEME_NAME]
) {
    const normalizedStatus = (status || '').trim().toLowerCase();

    if (
        normalizedStatus.includes('active leak') ||
        normalizedStatus.includes('active emergency') ||
        normalizedStatus.includes('flood') ||
        normalizedStatus.includes('gas smell')
    ) {
        return {
            backgroundColor: theme.colors.status.activeEmergency.background,
            borderColor: theme.colors.status.activeEmergency.border,
        };
    }

    if (normalizedStatus.includes('emergency')) {
        return {
            backgroundColor: theme.colors.status.emergency.background,
            borderColor: theme.colors.status.emergency.border,
        };
    }

    if (normalizedStatus === 'needs attention' || normalizedStatus === 'maintenance recommended') {
        return {
            backgroundColor: theme.colors.status.needsAttention.background,
            borderColor: theme.colors.status.needsAttention.border,
        };
    }

    if (normalizedStatus === 'not inspected') {
        return {
            backgroundColor: theme.colors.status.notInspected.background,
            borderColor: theme.colors.status.notInspected.border,
        };
    }

    if (normalizedStatus === 'good') {
        return {
            backgroundColor: theme.colors.status.good.background,
            borderColor: theme.colors.status.good.border,
        };
    }

    return {
        backgroundColor: theme.colors.status.unknown.background,
        borderColor: theme.colors.status.unknown.border,
    };
}

export default function SystemStatusCard({
    title,
    icon,
    status,
    onPress,
    style,
}: SystemStatusCardProps) {
    const { theme } = useTheme();

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.82}
            disabled={!onPress}
            style={[cardStyle, { borderRadius: theme.radii.card }, getStatusCardStyle(status, theme), style]}
        >
            <View style={[iconCircleStyle, { backgroundColor: theme.colors.iconBackground }]}>
                <Text style={iconTextStyle}>{icon}</Text>
            </View>

            <Text
                style={[titleStyle, { color: theme.colors.text }]}
                numberOfLines={2}
                ellipsizeMode="tail"
            >
                {title}
            </Text>
        </TouchableOpacity>
    );
}

const cardStyle = {
    minHeight: 152,
    padding: 18,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const iconCircleStyle = {
    width: 82,
    height: 82,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 14,
};

const iconTextStyle = {
    fontSize: 40,
};

const titleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
    lineHeight: 20,
    wordBreak: 'normal' as const,
    overflowWrap: 'normal' as const,
};
