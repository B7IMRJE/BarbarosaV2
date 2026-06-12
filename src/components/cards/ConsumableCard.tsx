import { Pressable, Text, View } from 'react-native';

type ConsumableCardProps = {
    title: string;
    status: string;
    daysRemaining: number;
    onPress?: () => void;
};

export default function ConsumableCard({
    title,
    status,
    daysRemaining,
    onPress,
}: ConsumableCardProps) {

    let statusColor = '#4ADE80';
    let statusText = 'Good';

    if (daysRemaining <= 30) {
        statusColor = '#FACC15';
        statusText = 'Due Soon';
    }

    if (daysRemaining <= 0) {
        statusColor = '#EF4444';
        statusText = 'Action Required';
    }

    return (
        <Pressable
            onPress={onPress}
            style={{
                backgroundColor: 'white',
                padding: 20,
                borderRadius: 16,
                marginBottom: 15,
                borderLeftWidth: 8,
                borderLeftColor: statusColor,
            }}
        >
            <Text
                style={{
                    fontSize: 22,
                    fontWeight: 'bold',
                    marginBottom: 10,
                }}
            >
                {title}
            </Text>

            <Text
                style={{
                    fontSize: 16,
                    marginBottom: 6,
                }}
            >
                {status}
            </Text>

            <Text
                style={{
                    fontSize: 15,
                    color: statusColor,
                    fontWeight: 'bold',
                    marginBottom: 15,
                }}
            >
                {statusText}
            </Text>

            <View
                style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                }}
            >
                <View
                    style={{
                        backgroundColor: '#071B33',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                    }}
                >
                    <Text style={{ color: 'white' }}>
                        Completed
                    </Text>
                </View>

                <View
                    style={{
                        backgroundColor: '#374151',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                    }}
                >
                    <Text style={{ color: 'white' }}>
                        Snooze
                    </Text>
                </View>

                <View
                    style={{
                        backgroundColor: '#6B7280',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                    }}
                >
                    <Text style={{ color: 'white' }}>
                        Ignore
                    </Text>
                </View>

                <View
                    style={{
                        backgroundColor: '#059669',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                    }}
                >
                    <Text style={{ color: 'white' }}>
                        Service
                    </Text>
                </View>
            </View>
        </Pressable>
    );
}