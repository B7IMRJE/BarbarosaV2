import { router } from 'expo-router';
import { Pressable, ScrollView, Text } from 'react-native';

export default function WaterHeaterComponentsScreen() {
    const components = [
        {
            name: 'Tank',
            status: 'Good',
            health: 95,
            installed: '2022',
            lastService: '2025',
        },
        {
            name: 'T&P Valve',
            status: 'Good',
            health: 90,
            installed: '2022',
            lastService: '2025',
        },
        {
            name: 'T&P Discharge Line',
            status: 'Good',
            health: 100,
            installed: '2022',
            lastService: '2025',
        },
        {
            name: 'Drain Pan',
            status: 'Missing',
            health: 0,
            installed: 'N/A',
            lastService: 'N/A',
        },
        {
            name: 'Expansion Tank',
            status: 'Good',
            health: 94,
            installed: '2024',
            lastService: '2026',
        },
        {
            name: 'Gas Valve',
            status: 'Good',
            health: 95,
            installed: '2022',
            lastService: '2025',
        },
        {
            name: 'Burner Assembly',
            status: 'Good',
            health: 90,
            installed: '2022',
            lastService: '2025',
        },
        {
            name: 'Thermocouple',
            status: 'Good',
            health: 90,
            installed: '2024',
            lastService: '2025',
        },
        {
            name: 'Earthquake Straps',
            status: 'Good',
            health: 100,
            installed: '2022',
            lastService: '2025',
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
            }}
        >
            <Pressable
                onPress={() => router.push('/water-heater')}
                style={{
                    marginTop: 20,
                    marginBottom: 20,
                }}
            >
                <Text style={{ fontSize: 18, color: '#071B33', fontWeight: 'bold' }}>
                    ← Back
                </Text>
            </Pressable>

            <Text
                style={{
                    fontSize: 32,
                    fontWeight: 'bold',
                    color: '#071B33',
                    marginBottom: 20,
                }}
            >
                Water Heater Components
            </Text>

            {components.map((item) => (
                <Pressable
                    key={item.name}
                    onPress={() => {
                        if (item.name === 'Expansion Tank') {
                            router.push('/expansion-tank');
                        }
                    }}
                    style={{
                        backgroundColor: 'white',
                        padding: 20,
                        borderRadius: 16,
                        marginBottom: 15,
                    }}
                >
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>
                        {item.name}
                    </Text>

                    <Text style={{ fontSize: 16, marginBottom: 4 }}>
                        Status: {item.status}
                    </Text>

                    <Text style={{ fontSize: 16, marginBottom: 4 }}>
                        Health: {item.health}/100
                    </Text>

                    <Text style={{ fontSize: 16, marginBottom: 4 }}>
                        Installed: {item.installed}
                    </Text>

                    <Text style={{ fontSize: 16, marginBottom: 8 }}>
                        Last Service: {item.lastService}
                    </Text>

                    <Text style={{ fontSize: 14, color: '#6B7280' }}>
                        Click for details
                    </Text>
                </Pressable>
            ))}
        </ScrollView>
    );
}