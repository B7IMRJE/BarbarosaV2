import { type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import type { ReactNode } from 'react';
import GlassCard from '../glass/GlassCard';

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
    const { scaleIcon } = useTheme();

    return (
        <GlassCard
            onPress={onPress}
            style={[
                {
                    maxWidth: '100%',
                    minWidth: 0,
                    padding: scaleIcon(18),
                },
                contentStyle,
                style,
            ]}
        >
            {children}
        </GlassCard>
    );
}
