import { router } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import SystemStatusCard from '../components/cards/SystemStatusCard';

const systems = [
    { name: 'Plumbing', icon: '🚰' },
    { name: 'HVAC', icon: '❄️' },
    { name: 'Electrical', icon: '⚡' },
    { name: 'Water Quality', icon: '💧' },
    { name: 'Safety', icon: '🛡️' },
    { name: 'Appliances', icon: '🔌' },
    { name: 'Gas', icon: '🔥' },
    { name: 'Exterior', icon: '🏠' },
    { name: 'Drains / Sewer', icon: '🧰' },
];

export default function EquipmentScreen() {
    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <Text
                    onPress={() => router.push('/' as any)}
                    style={{
                        marginTop: 20,
                        marginBottom: 20,
                        fontSize: 18,
                        color: '#071B33',
                        fontWeight: '900',
                    }}
                >
                    ← Back
                </Text>

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: '#071B33',
                        marginBottom: 8,
                    }}
                >
                    Equipment
                </Text>

                <Text
                    style={{
                        fontSize: 16,
                        color: '#637083',
                        marginBottom: 24,
                        lineHeight: 22,
                    }}
                >
                    Choose a home system. Areas are available by default, but equipment is
                    only added when you enter real items.
                </Text>

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    {systems.map((system) => (
                        <SystemStatusCard
                            key={system.name}
                            title={system.name}
                            icon={system.icon}
                            onPress={() => {
                                if (system.name === 'Plumbing') {
                                    router.push('/system/plumbing' as any);
                                    return;
                                }

                                router.push({
                                    pathname: '/system/[system]',
                                    params: { system: system.name },
                                } as any);
                            }}
                            style={{
                                width: '48%',
                            }}
                        />
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
