import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import ConsumableCard from '../components/cards/ConsumableCard';

export default function ConsumablesScreen() {
    const consumables = [
        {
            title: 'HVAC Filter',
            status: 'Replace Filter',
            daysRemaining: 45,
        },
        {
            title: 'Water Softener Salt',
            status: 'Check Salt Level',
            daysRemaining: 10,
        },
        {
            title: 'RO Filter',
            status: 'Replace Filter',
            daysRemaining: -5,
        },
        {
            title: 'UV Bulb',
            status: 'Operating Normally',
            daysRemaining: 180,
        },
    ];

    const goodCount = consumables.filter((item) => item.daysRemaining > 30).length;
    const dueSoonCount = consumables.filter(
        (item) => item.daysRemaining <= 30 && item.daysRemaining > 0
    ).length;
    const overdueCount = consumables.filter((item) => item.daysRemaining <= 0).length;

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
                    maxWidth: 1100,
                }}
            >
                <Text
                    onPress={() => router.push('/')}
                    style={{
                        marginTop: 20,
                        marginBottom: 20,
                        fontSize: 18,
                        fontWeight: 'bold',
                        color: '#071B33',
                    }}
                >
                    ← Back
                </Text>

                <Text
                    style={{
                        fontSize: 42,
                        fontWeight: 'bold',
                        color: '#071B33',
                        marginBottom: 20,
                    }}
                >
                    Consumables
                </Text>

                <View
                    style={{
                        backgroundColor: '#071B33',
                        padding: 24,
                        borderRadius: 18,
                        marginBottom: 20,
                    }}
                >
                    <Text
                        style={{
                            color: 'white',
                            fontSize: 20,
                            fontWeight: 'bold',
                            marginBottom: 12,
                        }}
                    >
                        Consumable Status Summary
                    </Text>

                    <Text style={{ color: 'white', fontSize: 16, marginBottom: 8 }}>
                        Good: {goodCount}
                    </Text>

                    <Text style={{ color: 'white', fontSize: 16, marginBottom: 8 }}>
                        Due Soon: {dueSoonCount}
                    </Text>

                    <Text style={{ color: 'white', fontSize: 16 }}>
                        Action Required: {overdueCount}
                    </Text>
                </View>

                {consumables.map((item) => (
                    <ConsumableCard
                        key={item.title}
                        title={item.title}
                        status={item.status}
                        daysRemaining={item.daysRemaining}
                    />
                ))}
            </View>
        </ScrollView>
    );
}