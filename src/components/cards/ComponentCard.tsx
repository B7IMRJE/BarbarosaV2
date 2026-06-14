import { Pressable, Text, View } from 'react-native';
import { STATUS, type EquipmentStatus } from '../../constants/status';
import { type HomeOSTheme } from '../../theme';
import { useTheme } from '../../theme/useTheme';

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
    const { theme } = useTheme();
    const statusStyle = getStatusStyle(status, theme);

    return (
        <Pressable
            onPress={onPress}
            style={{
                backgroundColor: theme.colors.surface,
                padding: 16,
                borderRadius: theme.radii.card,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderLeftWidth: 8,
                borderLeftColor: statusStyle.border,
            }}
        >
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: theme.colors.text }}>
                {name}
            </Text>

            <View
                style={{
                    backgroundColor: statusStyle.background,
                    borderColor: statusStyle.border,
                    borderWidth: 1,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: theme.radii.pill,
                    alignSelf: 'flex-start',
                }}
            >
                <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: 'bold' }}>
                    {status}
                </Text>
            </View>
        </Pressable>
    );
}

function getStatusStyle(status: EquipmentStatus, theme: HomeOSTheme) {
    if (status === STATUS.GOOD) return theme.colors.status.good;
    if (status === STATUS.MAINTENANCE_RECOMMENDED) return theme.colors.status.notInspected;
    if (status === STATUS.NEEDS_ATTENTION) return theme.colors.status.needsAttention;
    if (status === STATUS.EMERGENCY) return theme.colors.status.emergency;
    if (status === STATUS.NOT_INSPECTED) return theme.colors.status.notInspected;

    return theme.colors.status.unknown;
}
