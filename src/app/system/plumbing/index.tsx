


import HomeHeader from '../../../components/HomeHeader';
import SystemStatusCard from '../../../components/cards/SystemStatusCard';





import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useTheme } from '../../../theme/useTheme';

const plumbingSections = [
    {
        title: 'Areas',
        icon: '🏠',
        route: '/system/plumbing/areas',
    },
    {
        title: 'Fixtures',
        icon: '🚰',
        route: '/system/plumbing/fixtures',
    },
    {
        title: 'Equipment',
        icon: '🔧',
        route: '/system/plumbing/equipment',
    },
];

export default function PlumbingSystemScreen() {
    const { theme } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ fontSize: 34, fontWeight: '900', color: theme.colors.text }}>
                    Plumbing
                </Text>

                <Text
                    style={{
                        color: theme.colors.mutedText,
                        marginTop: 8,
                        marginBottom: 24,
                        fontSize: 16,
                        lineHeight: 22,
                    }}
                >
                    View plumbing by area, fixture, or equipment. Status is based on real
                    information entered into HomeOS.
                </Text>

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 14,
                    }}
                >
                    {plumbingSections.map((section) => (
                        <SystemStatusCard
                            key={section.title}
                            title={section.title}
                            icon={section.icon}
                            onPress={() => router.push(section.route as any)}
                            style={{ width: '31.8%', minWidth: 156, flexGrow: 1 }}
                        />
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
