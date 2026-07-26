import {
    Pressable,
    Text,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { useCompanyGlassDepth } from '../../theme/glass-depth';
import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type ThemedButtonProps = {
    title?: string;
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    variant?: ButtonVariant;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
};

export default function ThemedButton({
    title,
    children,
    onPress,
    disabled,
    variant = 'primary',
    style,
    textStyle,
}: ThemedButtonProps) {
    const { appearance, scaleFont, scaleIcon, theme } = useTheme();
    const companyDepth = useCompanyGlassDepth();
    const depth = (companyDepth ?? appearance.glassDepth) / 100;
    const restingEdge = Math.max(1, Math.round(6 * depth));

    const variantStyle = {
        primary: {
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.primary,
            color: theme.colors.primaryText,
        },
        secondary: {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.primary,
            color: theme.colors.primary,
        },
        danger: {
            backgroundColor: theme.colors.danger,
            borderColor: theme.colors.danger,
            color: '#FFFFFF',
        },
        ghost: {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text,
        },
    }[variant];

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                {
                    alignItems: 'center',
                    backgroundColor: variantStyle.backgroundColor,
                    borderColor: variantStyle.borderColor,
                    borderCurve: 'continuous',
                    borderRadius: Math.min(theme.radii.button, 14),
                    borderWidth: 2,
                    borderBottomWidth: pressed || disabled ? 1 : restingEdge,
                    boxShadow: disabled
                        ? 'none'
                        : pressed
                            ? '0 2px 3px rgba(7, 27, 51, 0.18)'
                            : `0 ${Math.max(1, Math.round(6 * depth))}px ${Math.max(2, Math.round(11 * depth))}px rgba(7, 27, 51, ${0.05 + 0.21 * depth}), inset 0 1px 0 rgba(255, 255, 255, 0.38)`,
                    justifyContent: 'center',
                    maxWidth: '100%' as const,
                    minHeight: scaleIcon(52),
                    minWidth: 0,
                    opacity: disabled ? 0.48 : 1,
                    paddingHorizontal: scaleIcon(20),
                    paddingVertical: scaleIcon(13),
                    transform: [{ translateY: pressed && !disabled ? Math.max(1, Math.round(4 * depth)) : 0 }],
                },
                style,
            ]}
        >
            {children || (
                <Text
                    style={[
                        {
                            color: variantStyle.color,
                            fontSize: scaleFont(16),
                            fontWeight: '900',
                            letterSpacing: 0.15,
                            lineHeight: scaleFont(21),
                            flexShrink: 1,
                            textAlign: 'center',
                        },
                        textStyle,
                    ]}
                >
                    {title}
                </Text>
            )}
        </Pressable>
    );
}
