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

type SystemAreaItem = HomeHealthItem & {
    name?: string | null;
};

export default function SystemAreasScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { system } = useLocalSearchParams<{ system: string }>();
    const [search, setSearch] = useState('');
    const [homeItems, setHomeItems] = useState<SystemAreaItem[]>([]);
    const [message, setMessage] = useState('');

    const systemName = system ? String(system) : 'System';
    const systemLabel = getSystemLabel(systemName);
    const systemDefaults = useMemo(() => getSystemDefaults(systemName), [systemName]);

    const savedAreas = useMemo(
        () => getSavedAreasForSystem(homeItems, systemName),
        [homeItems, systemName]
    );
    const areaChoices = useMemo(
        () => uniqueAreaNames([...systemDefaults.areas, ...savedAreas]),
        [savedAreas, systemDefaults.areas]
    );
    const filteredAreas = useMemo(() => {
        return areaChoices.filter((area) =>
            area.toLowerCase().includes(search.toLowerCase())
        );
    }, [areaChoices, search]);
    const systemItems = useMemo(
        () => homeItems.filter((item) => sameText(item.system, systemName)),
        [homeItems, systemName]
    );

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
            .select('id, name, status, install_state, system, location, parent_area, category')
            .eq('property_id', activeProperty.propertyId)
            .or('archived.eq.false,archived.is.null');

        if (error) {
            setHomeItems([]);
            setMessage(`Could not load area status: ${error.message}`);
            return;
        }

        setHomeItems((data || []) as SystemAreaItem[]);
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
                padding: scaleIcon(20),
                paddingBottom: scaleIcon(40),
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text
                    style={{
                        fontSize: scaleFont(34),
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: scaleIcon(8),
                    }}
                >
                    {systemLabel}
                </Text>

                <Text
                    style={{
                        fontSize: scaleFont(16),
                        color: theme.colors.mutedText,
                        marginBottom: scaleIcon(14),
                        lineHeight: scaleFont(22),
                    }}
                >
                    Choose or add an area. Items are added inside the area you open.
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
                        padding: scaleIcon(16),
                        fontSize: scaleFont(16),
                        color: theme.colors.text,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        marginBottom: scaleIcon(20),
                    }}
                />

                {!!message && (
                    <Text
                        style={{
                            color: theme.colors.mutedText,
                            fontSize: scaleFont(14),
                            fontWeight: '800',
                            marginBottom: scaleIcon(14),
                        }}
                    >
                        {message}
                    </Text>
                )}

                <Text
                    style={{
                        fontSize: scaleFont(20),
                        color: theme.colors.text,
                        fontWeight: '900',
                        marginBottom: scaleIcon(12),
                    }}
                >
                    Areas
                </Text>

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: scaleIcon(12),
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

function getSavedAreasForSystem(items: SystemAreaItem[], systemName: string) {
    return items
        .filter((item) => sameText(item.category, 'Area') && sameText(item.system, systemName))
        .map((item) => item.name || item.location || item.parent_area || '')
        .filter((area) => !!area.trim());
}

function uniqueAreaNames(areas: string[]) {
    const seen = new Set<string>();

    return areas.filter((area) => {
        const normalizedArea = normalizeText(area);

        if (!normalizedArea || seen.has(normalizedArea)) return false;

        seen.add(normalizedArea);
        return true;
    });
}

function sameText(a?: string | null, b?: string | null) {
    return normalizeText(a) === normalizeText(b);
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
