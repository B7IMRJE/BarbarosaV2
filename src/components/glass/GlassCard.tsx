import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useCompanyGlassDepth } from '../../theme/glass-depth';
import { type GlassPalette, type GlassTone } from '../../theme/glassPalette';
import { useGlassPalette } from '../../theme/glass-palette-context';
import { useTheme } from '../../theme/useTheme';

type GlassCardProps = {
    children: ReactNode;
    tone?: GlassTone;
    palette?: GlassPalette;
    onPress?: () => void;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
};

export default function GlassCard({
    children,
    tone = 'steel',
    palette: paletteOverride,
    onPress,
    disabled,
    style,
}: GlassCardProps) {
    const { appearance } = useTheme();
    const inheritedPalette = useGlassPalette();
    const palette = paletteOverride || inheritedPalette;
    const companyDepth = useCompanyGlassDepth();
    const depth = (companyDepth ?? appearance.glassDepth) / 100;
    const colors = palette.tones[tone];
    const edge = Math.max(1, Math.round(6 * depth));
    const baseStyle: ViewStyle = {
        backgroundColor: colors.background,
        borderColor: colors.border,
        borderRadius: 18,
        borderWidth: 1.5,
        borderTopColor: 'rgba(255, 255, 255, 0.78)',
        borderBottomColor: colors.edge,
        borderBottomWidth: edge,
        boxShadow: `0 ${Math.max(2, Math.round(10 * depth))}px ${Math.max(5, Math.round(24 * depth))}px rgba(0, 8, 18, ${0.18 + depth * 0.26}), 0 0 ${Math.round(18 * depth)}px ${colors.glow}, inset 0 2px 0 rgba(255, 255, 255, 0.22)`,
        overflow: 'hidden',
    };

    const content = (
        <>
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '62%',
                    height: '42%',
                    backgroundColor: 'rgba(255, 255, 255, 0.075)',
                    borderBottomLeftRadius: 90,
                }}
            />
            {children}
        </>
    );

    if (!onPress) return <View style={[baseStyle, style]}>{content}</View>;

    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                baseStyle,
                {
                    opacity: disabled ? 0.52 : 1,
                    borderBottomWidth: pressed ? 1 : edge,
                    transform: [{ translateY: pressed ? Math.max(1, Math.round(4 * depth)) : 0 }],
                },
                style,
            ]}
        >
            {content}
        </Pressable>
    );
}
