import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

export default function DispatchScreen() {
    const quickUpdates = [
        'Stopped for gas',
        'Traffic delay',
        'Vehicle issue',
        'Flat tire',
        'Picking up parts',
        'Running behind',
        'Arrived on site',
    ];

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F6F8FB' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <Text
                    onPress={() => router.push('/')}
                    style={{
                        marginTop: 20,
                        marginBottom: 20,
                        fontSize: 18,
                        color: '#071B33',
                        fontWeight: 'bold',
                    }}
                >
                    ← Back
                </Text>

                <Text
                    style={{
                        fontSize: 40,
                        fontWeight: 'bold',
                        color: '#071B33',
                        marginBottom: 20,
                    }}
                >
                    Dispatch / Travel
                </Text>

                <View
                    style={{
                        backgroundColor: '#071B33',
                        padding: 24,
                        borderRadius: 18,
                        marginBottom: 20,
                    }}
                >
                    <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>
                        Current Job
                    </Text>

                    <Text style={{ color: '#36D399', fontSize: 34, fontWeight: 'bold', marginTop: 10 }}>
                        ETA: 10:30 AM
                    </Text>

                    <Text style={{ color: 'white', fontSize: 16, marginTop: 8 }}>
                        Water Heater Inspection
                    </Text>

                    <Text style={{ color: 'white', fontSize: 16, marginTop: 4 }}>
                        5526 Wayman Street, Riverside, CA
                    </Text>
                </View>

                <View
                    style={{
                        backgroundColor: 'white',
                        padding: 24,
                        borderRadius: 18,
                        marginBottom: 20,
                    }}
                >
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>
                        Quick Status Update
                    </Text>

                    {quickUpdates.map((item) => (
                        <Pressable
                            key={item}
                            style={{
                                backgroundColor: '#071B33',
                                paddingVertical: 16,
                                borderRadius: 12,
                                marginBottom: 12,
                                alignItems: 'center',
                            }}
                        >
                            <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
                                {item}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                <View
                    style={{
                        backgroundColor: 'white',
                        padding: 24,
                        borderRadius: 18,
                        marginBottom: 40,
                    }}
                >
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>
                        Message Preview
                    </Text>

                    <Text style={{ fontSize: 16, lineHeight: 24 }}>
                        Your technician has sent an update: “Stopped for gas.” The estimated arrival time may be adjusted if needed.
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}