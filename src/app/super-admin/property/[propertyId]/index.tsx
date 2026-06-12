import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const cards = [
    'Equipment',
    'Documents',
    'Photos',
    'Jobs',
    'Health Score',
    'Settings',
];

export default function PropertyDashboardScreen() {
    const { propertyId } = useLocalSearchParams<{
        propertyId: string;
    }>();

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
                    onPress={() => router.back()}
                    style={{
                        marginTop: 20,
                        marginBottom: 20,
                        fontSize: 18,
                        fontWeight: '900',
                        color: '#071B33',
                    }}
                >
                    ← Back
                </Text>

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: '#071B33',
                    }}
                >
                    Property Dashboard
                </Text>

                <Text
                    style={{
                        color: '#637083',
                        marginTop: 8,
                        marginBottom: 24,
                    }}
                >
                    Property ID: {propertyId}
                </Text>

                <View
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: '#E3E8EF',
                        marginBottom: 20,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 20,
                            fontWeight: '900',
                            color: '#071B33',
                        }}
                    >
                        HomeOS Property Center
                    </Text>

                    <Text
                        style={{
                            marginTop: 10,
                            color: '#637083',
                        }}
                    >
                        Equipment, documents, photos, jobs, warranties,
                        maintenance records, and home health all live here.
                    </Text>
                </View>

                <Text
                    style={{
                        fontSize: 22,
                        fontWeight: '900',
                        color: '#071B33',
                        marginBottom: 14,
                    }}
                >
                    Property Modules
                </Text>

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    {cards.map((card) => (
                        <TouchableOpacity
                            key={card}
                            onPress={() => {
                                if (card === 'Equipment') {
                                    router.push(
                                        `/super-admin/property/${propertyId}/equipment` as any
                                    );
                                    return;
                                }

                                if (card === 'Documents') {
                                    router.push(
                                        `/super-admin/property/${propertyId}/documents` as any
                                    );
                                    return;
                                }

                                if (card === 'Photos') {
                                    router.push(
                                        `/super-admin/property/${propertyId}/photos` as any
                                    );
                                    return;
                                }

                                if (card === 'Jobs') {
                                    router.push(
                                        `/super-admin/property/${propertyId}/jobs` as any
                                    );
                                    return;
                                }

                                if (card === 'Settings') {
                                    router.push(
                                        `/super-admin/property/${propertyId}/settings` as any
                                    );
                                    return;
                                }

                                alert(`${card} coming soon.`);
                            }}
                            style={{
                                width: '48%',
                                minHeight: 100,
                                backgroundColor: '#FFFFFF',
                                borderRadius: 20,
                                padding: 16,
                                borderWidth: 1,
                                borderColor: '#E3E8EF',
                                justifyContent: 'center',
                            }}
                        >
                            <Text
                                style={{
                                    fontSize: 18,
                                    fontWeight: '900',
                                    color: '#071B33',
                                }}
                            >
                                {card}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}