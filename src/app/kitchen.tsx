import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import EquipmentCard from '../components/cards/EquipmentCard';

export default function KitchenScreen() {
    const components = [
        {
            name: 'Kitchen Faucet',
            status: 'Status: Good',
            subtitle: 'Faucet, cartridge, sprayer, supply lines',
            route: '/kitchen-faucet',
        },
        {
            name: 'Garbage Disposal',
            status: 'Status: Good',
            subtitle: 'Disposal body, drain, power connection',
            route: '',
        },
        {
            name: 'Dishwasher',
            status: 'Status: Good',
            subtitle: 'Supply line, drain hose, connections',
            route: '',
        },
        {
            name: 'Dishwasher Air Gap',
            status: 'Status: Not Inspected',
            subtitle: 'Air gap body and drain routing',
            route: '',
        },
        {
            name: 'Hot Angle Stop',
            status: 'Status: Good',
            subtitle: 'Fixture shutoff valve',
            route: '',
        },
        {
            name: 'Cold Angle Stop',
            status: 'Status: Good',
            subtitle: 'Fixture shutoff valve',
            route: '',
        },
        {
            name: 'P-Trap',
            status: 'Status: Good',
            subtitle: 'Trap and waste arm',
            route: '',
        },
        {
            name: 'Drain Assembly',
            status: 'Status: Good',
            subtitle: 'Basket strainer and drain system',
            route: '',
        },
        {
            name: 'RO System',
            status: 'Status: Not Inspected',
            subtitle: 'Reverse osmosis system if installed',
            route: '',
        },
        {
            name: 'Ice Maker Line',
            status: 'Status: Not Inspected',
            subtitle: 'Refrigerator water supply',
            route: '',
        },
    ];

    return (
        <ScrollView
            style={{
                flex: 1,
                backgroundColor: '#F6F8FB',
            }}
            contentContainerStyle={{
                padding: 24,
                alignItems: 'center',
            }}
        >
            <View
                style={{
                    width: '100%',
                    maxWidth: 900,
                }}
            >
                <Text
                    onPress={() => router.push('/fixtures')}
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
                        fontSize: 36,
                        fontWeight: 'bold',
                        color: '#071B33',
                        marginBottom: 10,
                    }}
                >
                    Kitchen
                </Text>

                <Text
                    style={{
                        fontSize: 18,
                        color: '#52606D',
                        marginBottom: 25,
                    }}
                >
                    Kitchen fixtures, appliances, valves, drains, and related plumbing components.
                </Text>

                <View
                    style={{
                        backgroundColor: 'white',
                        padding: 20,
                        borderRadius: 16,
                        marginBottom: 20,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 22,
                            fontWeight: 'bold',
                            marginBottom: 10,
                        }}
                    >
                        Status
                    </Text>

                    <Text
                        style={{
                            fontSize: 18,
                            color: '#16A34A',
                            fontWeight: 'bold',
                        }}
                    >
                        Good
                    </Text>

                    <Text
                        style={{
                            marginTop: 10,
                            fontSize: 16,
                            lineHeight: 24,
                        }}
                    >
                        No active leaks or drainage issues have been documented in the kitchen area.
                    </Text>
                </View>

                <View
                    style={{
                        backgroundColor: 'white',
                        padding: 20,
                        borderRadius: 16,
                        marginBottom: 20,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 22,
                            fontWeight: 'bold',
                            marginBottom: 10,
                        }}
                    >
                        Quick Actions
                    </Text>

                    <Text style={{ marginBottom: 8 }}>• Upload Photos</Text>
                    <Text style={{ marginBottom: 8 }}>• Upload Documents</Text>
                    <Text style={{ marginBottom: 8 }}>• Request Service</Text>
                </View>

                <Text
                    style={{
                        fontSize: 24,
                        fontWeight: 'bold',
                        color: '#071B33',
                        marginBottom: 15,
                    }}
                >
                    Related Parts
                </Text>

                {components.map((item) => (
                    <EquipmentCard
                        key={item.name}
                        title={item.name}
                        status={item.status}
                        subtitle={item.subtitle}
                        onPress={() => {
                            if (item.route) {
                                router.push(item.route as any);
                            }
                        }}
                    />
                ))}
            </View>
        </ScrollView>
    );
}
