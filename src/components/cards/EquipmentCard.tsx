import { Pressable, Text } from 'react-native';
import { useTheme } from '../../theme/useTheme';

type EquipmentCardProps = {
    title: string;
    status?: string;
    subtitle?: string;
    onPress?: () => void;
};

export default function EquipmentCard({
    title,
    status,
    subtitle,
    onPress,
}: EquipmentCardProps) {
    const { theme } = useTheme();

    return (
        <Pressable
            onPress={onPress}
            style={{
                backgroundColor: theme.colors.surface,
                padding: 20,
                borderRadius: theme.radii.card,
                marginBottom: 15,
                borderWidth: 1,
                borderColor: theme.colors.border,
            }}
        >
            <Text
                style={{
                    fontSize: 22,
                    fontWeight: 'bold',
                    marginBottom: 8,
                    color: theme.colors.text,
                }}
            >
                {title}
            </Text>

            {status && (
                <Text
                    style={{
                        fontSize: 16,
                        marginBottom: 4,
                        color: theme.colors.text,
                    }}
                >
                    {status}
                </Text>
            )}

            {subtitle && (
                <Text
                    style={{
                        fontSize: 14,
                        color: theme.colors.mutedText,
                    }}
                >
                    {subtitle}
                </Text>
            )}
        </Pressable>
    );
}
