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
            borderWidth: 1,
            borderCurve: 'continuous' as const,
            boxShadow: '0 4px 9px rgba(7, 27, 51, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72)',
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
                        borderWidth: 2,
                        borderBottomWidth: pressed ? 2 : 5,
                        boxShadow: pressed
                            ? '0 1px 2px rgba(7, 27, 51, 0.12)'
                            : '0 6px 12px rgba(7, 27, 51, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.72)',
                        transform: [{ translateY: pressed ? 3 : 0 }],
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
