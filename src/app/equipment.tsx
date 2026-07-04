import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import SystemStatusCard from '../components/cards/SystemStatusCard';
import { homeSystemOptions } from '../lib/homeSystems';
import { providerModeQueryParams, readProviderModeParams } from '../lib/providerMode';
import { useTheme } from '../theme/useTheme';

export default function EquipmentScreen() {
    const { theme } = useTheme();
    const routeParams = useLocalSearchParams<{
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
    }>();
    const providerModeContext = useMemo(() => readProviderModeParams(routeParams), [
        routeParams.providerMode,
        routeParams.companyId,
        routeParams.propertyId,
        routeParams.returnTo,
    ]);

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

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: 8,
                    }}
                >
                    Equipment
                </Text>

                <Text
                    style={{
                        fontSize: 16,
                        color: theme.colors.mutedText,
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
                    {homeSystemOptions.map((system) => (
                        <SystemStatusCard
                            key={system.key}
                            title={system.label}
                            icon={system.icon}
                            onPress={() => {
                                if (providerModeContext) {
                                    router.push({
                                        pathname: '/system/[system]',
                                        params: {
                                            system: system.key,
                                            ...providerModeQueryParams(providerModeContext),
                                        },
                                    } as never);
                                    return;
                                }

                                if (system.key === 'Plumbing') {
                                    router.push('/system/plumbing' as never);
                                    return;
                                }

                                router.push({
                                    pathname: '/system/[system]',
                                    params: { system: system.key },
                                } as never);
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
