import { router } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const systems = [
    'Plumbing',
    'HVAC',
    'Electrical',
    'Water Quality',
    'Safety',
    'Appliances',
    'Gas',
    'Exterior',
    'Drains / Sewer',
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

                <View style={{ gap: 14 }}>
                    {systems.map((system) => (
                        <TouchableOpacity
                            key={system}
                            onPress={() => {
                                if (system === 'Plumbing') {
                                    router.push('/system/plumbing' as any);
                                    return;
                                }

                                router.push({
                                    pathname: '/system/[system]',
                                    params: { system },
                                } as any);
                            }}
                            style={{
                                backgroundColor: '#FFFFFF',
                                borderRadius: 22,
                                padding: 20,
                                borderWidth: 1,
                                borderColor: '#E3E8EF',
                            }}
                        >
                            <Text
                                style={{
                                    fontSize: 20,
                                    fontWeight: '900',
                                    color: '#071B33',
                                }}
                            >
                                {system}
                            </Text>

                            <Text
                                style={{
                                    fontSize: 14,
                                    color: '#637083',
                                    marginTop: 8,
                                    lineHeight: 20,
                                }}
                            >
                                Select areas, fixtures, and equipment.
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}