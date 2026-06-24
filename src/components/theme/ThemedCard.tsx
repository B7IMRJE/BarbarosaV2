import {
    TouchableOpacity,
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
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.card,
            borderWidth: 1,
            padding: scaleIcon(18),
        },
        contentStyle,
    ];

    if (onPress) {
        return (
            <TouchableOpacity
                activeOpacity={0.82}
                onPress={onPress}
                style={[cardStyle, style]}
            >
                {children}
            </TouchableOpacity>
        );
    }

    return <View style={[cardStyle, style]}>{children}</View>;
}
