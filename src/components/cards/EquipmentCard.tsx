import { Pressable, Text } from 'react-native';

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
    return (
        <Pressable
            onPress={onPress}
            style={{
                backgroundColor: 'white',
                padding: 20,
                borderRadius: 16,
                marginBottom: 15,
            }}
        >
            <Text
                style={{
                    fontSize: 22,
                    fontWeight: 'bold',
                    marginBottom: 8,
                    color: '#071B33',
                }}
            >
                {title}
            </Text>

            {status && (
                <Text
                    style={{
                        fontSize: 16,
                        marginBottom: 4,
                    }}
                >
                    {status}
                </Text>
            )}

            {subtitle && (
                <Text
                    style={{
                        fontSize: 14,
                        color: '#6B7280',
                    }}
                >
                    {subtitle}
                </Text>
            )}
        </Pressable>
    );
}