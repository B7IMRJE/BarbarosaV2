import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { DEFAULT_THEME_NAME, homeOSThemes, type HomeOSTheme } from '../../theme';
import { useTheme } from '../../theme/useTheme';

type SystemStatusCardProps = {
    title: string;
    icon: string;
    status?: string | null;
    onPress?: () => void;
    style?: ViewStyle;
    compact?: boolean;
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

    if (
        normalizedStatus === 'not inspected' ||
        normalizedStatus === 'needs review' ||
        normalizedStatus === 'needs confirmation' ||
        normalizedStatus === 'missing information'
    ) {
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
    compact = false,
}: SystemStatusCardProps) {
    const { appearance, scaleFont, scaleIcon, theme } = useTheme();
    const depth = appearance.glassDepth / 100;
    const classic = appearance.appearanceStyle === 'classic';

    return (
        <Pressable
            accessibilityRole={onPress ? 'button' : undefined}
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }) => [
                cardStyle,
                {
                    borderRadius: theme.radii.card,
                    minHeight: compact ? 0 : scaleIcon(152),
                    padding: compact ? 8 : scaleIcon(18),
                    borderTopColor: classic ? theme.colors.border : 'rgba(255, 255, 255, 0.96)',
                    borderBottomColor: classic ? theme.colors.border : theme.colors.primary,
                    borderBottomWidth: classic ? 1 : pressed ? 1 : Math.max(1, Math.round(8 * depth)),
                    boxShadow: classic
                        ? '0 1px 2px rgba(15, 23, 42, 0.05)'
                        : pressed
                          ? '0 2px 4px rgba(7, 27, 51, 0.14)'
                          : `0 ${Math.max(1, Math.round(10 * depth))}px ${Math.max(2, Math.round(20 * depth))}px rgba(7, 27, 51, ${0.05 + 0.2 * depth}), inset 0 1px 0 rgba(255, 255, 255, 0.94)`,
                    transform: [{ translateY: classic ? 0 : pressed ? Math.max(1, Math.round(5 * depth)) : 0 }],
                },
                getStatusCardStyle(status, theme),
                style,
            ]}
        >
            <View
                style={[
                    iconCircleStyle,
                    {
                        backgroundColor: theme.colors.iconBackground,
                        width: compact ? 48 : scaleIcon(82),
                        height: compact ? 48 : scaleIcon(82),
                        marginBottom: compact ? 7 : scaleIcon(14),
                    },
                ]}
            >
                <Text style={[iconTextStyle, { fontSize: compact ? 25 : scaleIcon(40) }]}>
                    {icon}
                </Text>
            </View>

            <Text
                style={[
                    titleStyle,
                    {
                        color: theme.colors.text,
                        fontSize: compact ? 11 : scaleFont(16),
                        lineHeight: compact ? 14 : scaleFont(20),
                    },
                ]}
                numberOfLines={2}
                ellipsizeMode="tail"
            >
                {title}
            </Text>
        </Pressable>
    );
}

const cardStyle = {
    borderWidth: 2,
    borderCurve: 'continuous' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const iconCircleStyle = {
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const iconTextStyle = {};

const titleStyle = {
    fontWeight: '900' as const,
    textAlign: 'center' as const,
    wordBreak: 'normal' as const,
    overflowWrap: 'normal' as const,
};
