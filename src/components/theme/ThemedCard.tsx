import {
    Pressable,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/useTheme';
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
    const { scaleIcon, theme } = useTheme();

    const cardStyle = [
        {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.card,
            borderWidth: 2,
            borderTopColor: 'rgba(255, 255, 255, 0.92)',
            borderBottomColor: theme.colors.primary,
            borderBottomWidth: 5,
            borderCurve: 'continuous' as const,
            boxShadow: '0 8px 16px rgba(7, 27, 51, 0.20), inset 0 2px 0 rgba(255, 255, 255, 0.92)',
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
                        borderBottomWidth: pressed ? 2 : 6,
                        boxShadow: pressed
                            ? '0 1px 2px rgba(7, 27, 51, 0.12)'
                            : '0 9px 18px rgba(7, 27, 51, 0.23), inset 0 2px 0 rgba(255, 255, 255, 0.94)',
                        transform: [{ translateY: pressed ? 4 : 0 }],
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
