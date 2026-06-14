import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import SystemStatusCard from '../../../components/cards/SystemStatusCard';
import { AREAS } from '../../../constants/areas';
import { getSystemLabel } from '../../../lib/homeSystems';

export default function SystemAreasScreen() {
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
                        color: '#071B33',
                        fontWeight: '900',
                    }}
                >
                    ← Back
                </Text>

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: '#071B33',
                        marginBottom: 8,
                    }}
                >
                    {systemLabel}
                </Text>

                <Text
                    style={{
                        fontSize: 16,
                        color: '#637083',
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
                    placeholderTextColor="#9AA6B2"
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 18,
                        padding: 16,
                        fontSize: 16,
                        borderWidth: 1,
                        borderColor: '#E3E8EF',
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
