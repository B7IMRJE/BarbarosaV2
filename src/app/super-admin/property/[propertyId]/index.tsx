import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';

const cards = [
    'Equipment',
    'Documents',
    'Photos',
    'Jobs',
    'Health Score',
    'Settings',
];

export default function PropertyDashboardScreen() {
    const { width: viewportWidth } = useWindowDimensions();
    const isPhoneLayout = viewportWidth <= 640;
    const pagePadding = isPhoneLayout ? 16 : 20;
    const { propertyId } = useLocalSearchParams<{
        propertyId: string;
    }>();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{
                padding: pagePadding,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
                <AdminNavBar backFallback="/super-admin/companies" />

                <Text
                    style={{
                        fontSize: isPhoneLayout ? 30 : 34,
                        fontWeight: '900',
                        color: '#071B33',
                    }}
                >
                    Property Dashboard
                </Text>

                <Text
                    numberOfLines={1}
                    style={{
                        color: '#637083',
                        marginTop: 8,
                        marginBottom: 24,
                        maxWidth: '100%',
                    }}
                >
                    Property ID: {propertyId}
                </Text>

                <View
                    style={{
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: isPhoneLayout ? 16 : 20,
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
                        width: '100%',
                        minWidth: 0,
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
                                width: isPhoneLayout ? '100%' : '48%',
                                maxWidth: '100%',
                                minWidth: 0,
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
                                numberOfLines={2}
                                style={{
                                    fontSize: 18,
                                    fontWeight: '900',
                                    color: '#071B33',
                                    flexShrink: 1,
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
