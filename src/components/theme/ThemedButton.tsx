import {
    Text,
    TouchableOpacity,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/useTheme';
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
    const { theme } = useTheme();

    const variantStyle = {
        primary: {
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.primary,
            color: theme.colors.primaryText,
        },
        secondary: {
            backgroundColor: theme.colors.secondaryButton,
            borderColor: theme.colors.border,
            color: theme.colors.secondaryButtonText,
        },
        danger: {
            backgroundColor: theme.colors.dangerBackground,
            borderColor: theme.colors.dangerBackground,
            color: theme.colors.danger,
        },
        ghost: {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text,
        },
    }[variant];

    return (
        <TouchableOpacity
            activeOpacity={0.82}
            disabled={disabled}
            onPress={onPress}
            style={[
                {
                    backgroundColor: variantStyle.backgroundColor,
                    borderColor: variantStyle.borderColor,
                    borderRadius: theme.radii.button,
                    borderWidth: 1,
                    padding: 18,
                    alignItems: 'center',
                    opacity: disabled ? 0.55 : 1,
                },
                style,
            ]}
        >
            {children || (
                <Text
                    style={[
                        {
                            color: variantStyle.color,
                            fontSize: 16,
                            fontWeight: '900',
                        },
                        textStyle,
                    ]}
                >
                    {title}
                </Text>
            )}
        </TouchableOpacity>
    );
}
