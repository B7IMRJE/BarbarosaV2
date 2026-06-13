import { Text, TouchableOpacity, View, type ViewStyle } from 'react-native';

type SystemStatusCardProps = {
    title: string;
    icon: string;
    status?: string | null;
    onPress?: () => void;
    style?: ViewStyle;
};

export function getStatusCardStyle(status?: string | null) {
    const normalizedStatus = (status || '').trim().toLowerCase();

    if (
        normalizedStatus.includes('active leak') ||
        normalizedStatus.includes('active emergency') ||
        normalizedStatus.includes('flood') ||
        normalizedStatus.includes('gas smell')
    ) {
        return { backgroundColor: '#FFD6D6', borderColor: '#E25C5C' };
    }

    if (normalizedStatus.includes('emergency')) {
        return { backgroundColor: '#FFEAEA', borderColor: '#F1B8B8' };
    }

    if (normalizedStatus === 'needs attention' || normalizedStatus === 'maintenance recommended') {
        return { backgroundColor: '#FFF0DD', borderColor: '#F2C28F' };
    }

    if (normalizedStatus === 'not inspected') {
        return { backgroundColor: '#FFF8DB', borderColor: '#F4E6A0' };
    }

    if (normalizedStatus === 'good') {
        return { backgroundColor: '#EAF8EF', borderColor: '#BFE8CC' };
    }

    return { backgroundColor: '#FFFFFF', borderColor: '#E3E8EF' };
}

export default function SystemStatusCard({
    title,
    icon,
    status,
    onPress,
    style,
}: SystemStatusCardProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.82}
            disabled={!onPress}
            style={[cardStyle, getStatusCardStyle(status), style]}
        >
            <View style={iconCircleStyle}>
                <Text style={iconTextStyle}>{icon}</Text>
            </View>

            <Text style={titleStyle} numberOfLines={2}>
                {title}
            </Text>
        </TouchableOpacity>
    );
}

const cardStyle = {
    minHeight: 152,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const iconCircleStyle = {
    width: 82,
    height: 82,
    backgroundColor: '#E7ECF3',
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 14,
};

const iconTextStyle = {
    fontSize: 40,
};

const titleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    color: '#071B33',
    textAlign: 'center' as const,
};
