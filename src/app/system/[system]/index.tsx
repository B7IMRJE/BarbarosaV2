import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import HomeHeader from '../../../components/HomeHeader';
import SystemStatusCard from '../../../components/cards/SystemStatusCard';
import { AREAS } from '../../../constants/areas';
import { getSystemLabel } from '../../../lib/homeSystems';
import { useTheme } from '../../../theme/useTheme';

export default function SystemAreasScreen() {
    const { theme } = useTheme();
    const { system } = useLocalSearchParams<{ system: string }>();
    const [search, setSearch] = useState('');

    const systemName = system ? String(system) : 'System';
    const systemLabel = getSystemLabel(systemName);

    const filteredAreas = useMemo(() => {
        return AREAS.filter((area) =>
            area.name.toLowerCase().includes(search.toLowerCase())
        );
    }, [search]);

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
                    {systemLabel}
                </Text>

                <Text
                    style={{
                        fontSize: 16,
                        color: theme.colors.mutedText,
                        marginBottom: 20,
                        lineHeight: 22,
                    }}
                >
                    Choose an area. Areas are available by default, but items are added only when real equipment is entered.
                </Text>

                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search areas..."
                    placeholderTextColor={theme.colors.mutedText}
                    style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radii.button,
                        padding: 16,
                        fontSize: 16,
                        color: theme.colors.text,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        marginBottom: 20,
                    }}
                />

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    {filteredAreas.map((area) => (
                        <SystemStatusCard
                            key={area.name}
                            title={area.name}
                            icon={area.icon}
                            onPress={() =>
                                router.push({
                                    pathname: '/system/[system]/area/[area]',
                                    params: {
                                        system: systemName,
                                        area: area.name,
                                    },
                                } as any)
                            }
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
