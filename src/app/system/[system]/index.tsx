import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import HomeHeader from '../../../components/HomeHeader';
import SystemStatusCard from '../../../components/cards/SystemStatusCard';
import ThemedButton from '../../../components/theme/ThemedButton';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../../lib/activeProperty';
import { scoreAreaHealth, statusForCard, type HomeHealthItem } from '../../../lib/homeHealth';
import { getSystemLabel } from '../../../lib/homeSystems';
import { getAreaIcon, getSystemDefaults } from '../../../lib/systemDefaults';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/useTheme';

export default function SystemAreasScreen() {
    const { theme } = useTheme();
    const { system } = useLocalSearchParams<{ system: string }>();
    const [search, setSearch] = useState('');
    const [homeItems, setHomeItems] = useState<HomeHealthItem[]>([]);
    const [message, setMessage] = useState('');

    const systemName = system ? String(system) : 'System';
    const systemLabel = getSystemLabel(systemName);
    const systemDefaults = useMemo(() => getSystemDefaults(systemName), [systemName]);
    const systemItems = useMemo(
        () =>
            homeItems.filter(
                (item) =>
                    sameText(item.system, systemName) ||
                    sameText(item.system, systemLabel)
            ),
        [homeItems, systemLabel, systemName]
    );

    const filteredAreas = useMemo(() => {
        return systemDefaults.areas.filter((area) =>
            area.toLowerCase().includes(search.toLowerCase())
        );
    }, [search, systemDefaults]);

    const loadAreaHealth = useCallback(async () => {
        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setHomeItems([]);
            setMessage(activePropertyErrorMessage(error));

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const { data, error } = await supabase
            .from('home_items')
            .select('id, status, condition, install_state, system, area, location, parent_area, category')
            .eq('property_id', activeProperty.propertyId)
            .or('archived.eq.false,archived.is.null');

        if (error) {
            setHomeItems([]);
            setMessage(`Could not load area status: ${error.message}`);
            return;
        }

        setHomeItems((data || []) as HomeHealthItem[]);
        setMessage('');
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadAreaHealth();
        }, [loadAreaHealth])
    );

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
                        marginBottom: 14,
                        lineHeight: 22,
                    }}
                >
                    Choose an area. Areas are available by default, but items are added only when real equipment is entered.
                </Text>

                <ThemedButton
                    title="Add Area"
                    onPress={() =>
                        router.push({
                            pathname: '/area/create',
                            params: { system: systemName },
                        } as any)
                    }
                    style={{ marginBottom: 20 }}
                />

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

                {!!message && (
                    <Text
                        style={{
                            color: theme.colors.mutedText,
                            fontSize: 14,
                            fontWeight: '800',
                            marginBottom: 14,
                        }}
                    >
                        {message}
                    </Text>
                )}

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    {filteredAreas.map((area) => {
                        const areaSummary = scoreAreaHealth(systemItems, area);

                        return (
                            <SystemStatusCard
                                key={area}
                                title={area}
                                icon={getAreaIcon(area)}
                                status={statusForCard(areaSummary)}
                                onPress={() =>
                                    router.push({
                                        pathname: '/system/[system]/area/[area]',
                                        params: {
                                            system: systemName,
                                            area,
                                        },
                                    } as any)
                                }
                                style={{
                                    width: '48%',
                                }}
                            />
                        );
                    })}
                </View>
            </View>
        </ScrollView>
    );
}

function sameText(a?: string | null, b?: string | null) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}
