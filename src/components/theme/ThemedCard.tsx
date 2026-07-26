import {
    Pressable,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { useCompanyGlassDepth } from '../../theme/glass-depth';
import type { ReactNode } from 'react';

type ThemedCardProps = {
    children: ReactNode;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
};

export default function ThemedCard({
    children,
    onPress,
    style,
    contentStyle,
}: ThemedCardProps) {
    const { appearance, scaleIcon, theme } = useTheme();
    const companyDepth = useCompanyGlassDepth();
    const depth = (companyDepth ?? appearance.glassDepth) / 100;
    const restingEdge = Math.max(1, Math.round(7 * depth));

    const cardStyle = [
        {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.card,
            borderWidth: 2,
            borderTopColor: 'rgba(255, 255, 255, 0.92)',
            borderBottomColor: theme.colors.primary,
            borderBottomWidth: restingEdge,
            borderCurve: 'continuous' as const,
            boxShadow: `0 ${Math.max(1, Math.round(8 * depth))}px ${Math.max(2, Math.round(16 * depth))}px rgba(7, 27, 51, ${0.04 + 0.18 * depth}), inset 0 1px 0 rgba(255, 255, 255, 0.92)`,
            maxWidth: '100%' as const,
            minWidth: 0,
            padding: scaleIcon(18),
        },
        contentStyle,
    ];

    if (onPress) {
        return (
            <Pressable
                accessibilityRole="button"
                onPress={onPress}
                style={({ pressed }) => [
                    cardStyle,
                    {
                        backgroundColor: theme.colors.surfaceAlt,
                        borderColor: theme.colors.primary,
                        borderTopColor: 'rgba(255, 255, 255, 0.94)',
                        borderBottomColor: theme.colors.primary,
                        borderWidth: 2,
                        borderBottomWidth: pressed ? 1 : restingEdge,
                        boxShadow: pressed
                            ? '0 1px 2px rgba(7, 27, 51, 0.12)'
                            : `0 ${Math.max(1, Math.round(9 * depth))}px ${Math.max(2, Math.round(18 * depth))}px rgba(7, 27, 51, ${0.05 + 0.2 * depth}), inset 0 1px 0 rgba(255, 255, 255, 0.94)`,
                        transform: [{ translateY: pressed ? Math.max(1, Math.round(4 * depth)) : 0 }],
                    },
                    style,
                ]}
            >
                {children}
            </Pressable>
        );
    }

    return <View style={[cardStyle, style]}>{children}</View>;
}
