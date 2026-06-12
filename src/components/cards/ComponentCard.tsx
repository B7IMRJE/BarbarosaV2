import { Pressable, Text, View } from 'react-native';
import { getStatusColor, type EquipmentStatus } from '../../constants/status';

type ComponentCardProps = {
    name: string;
    status: EquipmentStatus;
    onPress?: () => void;
};

export default function ComponentCard({
    name,
    status,
    onPress,
}: ComponentCardProps) {
    const statusColor = getStatusColor(status);

    return (
        <Pressable
            onPress={onPress}
            style={{
                backgroundColor: '#F9FAFB',
                padding: 16,
                borderRadius: 14,
                marginBottom: 12,
                borderLeftWidth: 8,
                borderLeftColor: statusColor,
            }}
        >
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>
                {name}
            </Text>

            <View
                style={{
                    backgroundColor: statusColor,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    alignSelf: 'flex-start',
                }}
            >
                <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>
                    {status}
                </Text>
            </View>
        </Pressable>
    );
}