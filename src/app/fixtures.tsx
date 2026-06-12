import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import EquipmentCard from '../components/cards/EquipmentCard';

export default function FixturesScreen() {
    const rooms = [
        {
            name: 'Kitchen',
            status: 'Status: Good',
            subtitle:
                'Faucet, garbage disposal, dishwasher, air gap, angle stops, drain system',
            route: '/kitchen',
        },
        {
            name: 'Master Bathroom',
            status: 'Status: Needs Documentation',
            subtitle:
                'Lavatory faucet, toilet, shower valve, tub spout, drains',
            route: '',
        },
        {
            name: 'Bathroom 2',
            status: 'Status: Not Inspected',
            subtitle:
                'Lavatory faucet, toilet, shower valve, drains',
            route: '',
        },
        {
            name: 'Laundry Room',
            status: 'Status: Not Inspected',
            subtitle:
                'Laundry valves, standpipe, hammer arrestors, utility sink',
            route: '',
        },
        {
            name: 'Garage',
            status: 'Status: Not Inspected',
            subtitle:
                'Garage sink, hose bibs, utility fixtures, floor drains',
            route: '',
        },
        {
            name: 'Exterior',
            status: 'Status: Not Inspected',
            subtitle:
                'Hose bibs, irrigation fixtures, yard drains, exterior plumbing',
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
                        fontSize: 36,
                        fontWeight: 'bold',
                        color: '#071B33',
                        marginBottom: 8,
                    }}
                >
                    Fixtures
                </Text>

                <Text
                    style={{
                        fontSize: 18,
                        color: '#52606D',
                        marginBottom: 25,
                    }}
                >
                    Organize fixtures by room, just like homeowners think about their home.
                </Text>

                {rooms.map((room) => (
                    <EquipmentCard
                        key={room.name}
                        title={room.name}
                        status={room.status}
                        subtitle={room.subtitle}
                        onPress={() => {
                            if (room.route) {
                                router.push(room.route as any);
                            }
                        }}
                    />
                ))}
            </View>
        </ScrollView>
    );
}