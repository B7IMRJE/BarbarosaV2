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
    const { appearance, theme } = useTheme();
    const inheritedPalette = useGlassPalette();
    const palette = paletteOverride || inheritedPalette;
    const companyDepth = useCompanyGlassDepth();
    const depth = (companyDepth ?? appearance.glassDepth) / 100;
    const colors = palette.tones[tone];
    const edge = Math.max(1, Math.round(6 * depth));
    const baseStyle: ViewStyle = {
        backgroundColor: appearance.appearanceStyle === 'classic'
            ? theme.colors.surfaceAlt
            : colors.background,
        borderColor: appearance.appearanceStyle === 'classic'
            ? theme.colors.border
            : colors.border,
        borderRadius: theme.radii.card,
        borderWidth: 1,
        borderTopColor: appearance.appearanceStyle === 'classic'
            ? theme.colors.border
            : 'rgba(255, 255, 255, 0.78)',
        borderBottomColor: appearance.appearanceStyle === 'classic'
            ? theme.colors.border
            : colors.edge,
        borderBottomWidth: appearance.appearanceStyle === 'classic' ? 1 : edge,
        boxShadow: appearance.appearanceStyle === 'classic'
            ? '0 1px 2px rgba(15, 23, 42, 0.05)'
            : `0 ${Math.max(3, Math.round(12 * depth))}px ${Math.max(8, Math.round(30 * depth))}px rgba(0, 8, 18, ${0.2 + depth * 0.3}), 0 0 ${Math.round(22 * depth)}px ${colors.glow}, inset 0 2px 0 rgba(255, 255, 255, 0.3), inset 1px 0 0 rgba(255, 255, 255, 0.12), inset -1px 0 0 rgba(0, 8, 18, 0.24)`,
        overflow: 'hidden',
    };

    const content = (
        <>
            {appearance.appearanceStyle === 'glass' && <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '68%',
                    height: '46%',
                    backgroundColor: `rgba(255, 255, 255, ${0.07 + depth * 0.08})`,
                    borderBottomLeftRadius: 90,
                }}
            />}
            {appearance.appearanceStyle === 'glass' && <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: 1,
                    left: '7%',
                    right: '7%',
                    height: Math.max(1, Math.round(2 * depth)),
                    borderRadius: 999,
                    backgroundColor: `rgba(255, 255, 255, ${0.2 + depth * 0.28})`,
                }}
            />}
            {appearance.appearanceStyle === 'glass' && <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: '16%',
                    left: 0,
                    width: Math.max(1, Math.round(2 * depth)),
                    height: '58%',
                    borderRadius: 999,
                    backgroundColor: `rgba(255, 255, 255, ${0.08 + depth * 0.16})`,
                }}
            />}
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
                    borderBottomWidth: appearance.appearanceStyle === 'classic'
                        ? 1
                        : pressed
                          ? 1
                          : edge,
                    transform: [{
                        translateY:
                            appearance.appearanceStyle === 'classic'
                                ? 0
                                : pressed
                                  ? Math.max(1, Math.round(4 * depth))
                                  : 0,
                    }],
                },
                style,
            ]}
        >
            {content}
        </Pressable>
    );
}
