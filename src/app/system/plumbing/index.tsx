


import HomeHeader from '../../../components/HomeHeader';





import { router } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const plumbingSections = [
    {
        title: 'Areas',
        status: 'Missing Information',
        subtitle: 'Kitchen, bathrooms, laundry, garage, exterior, shutoff areas.',
        route: '/system/plumbing/areas',
    },
    {
        title: 'Fixtures',
        status: 'Missing Information',
        subtitle: 'Faucets, toilets, showers, hose bibs, laundry valves, drains.',
        route: '/system/plumbing/fixtures',
    },
    {
        title: 'Equipment',
        status: 'Missing Information',
        subtitle: 'Water heater, PRV, shutoff, softener, filtration, expansion tank.',
        route: '/system/plumbing/equipment',
    },
];

export default function PlumbingSystemScreen() {
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
                <HomeHeader />

                <Text style={{ fontSize: 34, fontWeight: '900', color: '#071B33' }}>
                    Plumbing
                </Text>

                <Text
                    style={{
                        color: '#637083',
                        marginTop: 8,
                        marginBottom: 24,
                        fontSize: 16,
                        lineHeight: 22,
                    }}
                >
                    View plumbing by area, fixture, or equipment. Status is based on real
                    information entered into HomeOS.
                </Text>

                {plumbingSections.map((section) => (
                    <TouchableOpacity
                        key={section.title}
                        onPress={() => router.push(section.route as any)}
                        style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: 20,
                            padding: 20,
                            borderWidth: 1,
                            borderColor: '#E3E8EF',
                            marginBottom: 14,
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 22,
                                fontWeight: '900',
                                color: '#071B33',
                            }}
                        >
                            {section.title}
                        </Text>

                        <Text
                            style={{
                                marginTop: 8,
                                fontSize: 14,
                                fontWeight: '900',
                                color: '#B7791F',
                            }}
                        >
                            Status: {section.status}
                        </Text>

                        <Text
                            style={{
                                color: '#637083',
                                marginTop: 8,
                                fontSize: 15,
                                lineHeight: 21,
                            }}
                        >
                            {section.subtitle}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>
    );
}