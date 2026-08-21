import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { AreaContainer } from '../../components/homeos/HomeOSVisualFoundation';
import { useHydratedRouteParamsReady } from '../../hooks/useHydratedRouteParamsReady';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import {
    catalogForScope,
    isTopLevelPropertyArea,
    type PropertyAreaRecord,
    type PropertyAreaScope,
} from '../../lib/propertyAreas';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { supabase } from '../../lib/supabase';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export default function AddPropertyAreaScreen() {
    const { scope: rawScope } = useLocalSearchParams<{ scope?: string }>();
    const routeParamsReady = useHydratedRouteParamsReady();
    const scope: Exclude<PropertyAreaScope, 'unclassified'> = routeParamsReady && rawScope === 'exterior'
        ? 'exterior'
        : 'interior';
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const { width: viewportWidth } = useWindowDimensions();
    const [areas, setAreas] = useState<PropertyAreaRecord[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState('');
    const [message, setMessage] = useState('');
    const inFlight = useRef(false);
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const gridGap = foundation.grid.gap;
    const cardMinimumWidth = foundation.grid.areaMinimumWidth;
    const columns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: cardMinimumWidth,
        gap: gridGap,
    });
    const cardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns,
        gap: gridGap,
        minimumItemWidth: cardMinimumWidth,
        maximumItemWidth: scaleIcon(220),
    });

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');

        try {
            const property = await requireActivePropertyMembership();
            const { data, error } = await supabase
                .from('home_items')
                .select('id, name, system, area_scope, parent_area, archived')
                .eq('property_id', property.propertyId)
                .ilike('category', 'Area')
                .or('archived.eq.false,archived.is.null');

            if (error) throw error;
            setAreas((data || []) as PropertyAreaRecord[]);
        } catch (error) {
            setAreas([]);
            setMessage(activePropertyErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => {
        void load();
    }, [load]));

    const cards = useMemo(() => {
        const query = search.trim().toLowerCase();

        return catalogForScope(scope, areas.filter(isTopLevelPropertyArea)).filter(
            (card) => !query || card.name.toLowerCase().includes(query)
        );
    }, [areas, scope, search]);

    async function addArea(name: string) {
        if (inFlight.current || saving) return;

        inFlight.current = true;
        setSaving(name);
        setMessage('');

        try {
            const property = await requireActivePropertyMembership();
            const { data, error } = await supabase.rpc('add_homeowner_property_area', {
                p_property_id: property.propertyId,
                p_name: name,
                p_area_scope: scope,
            });

            if (error) throw error;

            const result = readAddedAreaResult(data);
            if (!result) throw new Error('The area could not be confirmed. Please try again.');

            const destinationScope = result.area_scope === 'interior' || result.area_scope === 'exterior'
                ? result.area_scope
                : scope;
            router.replace(`/home/${destinationScope}` as never);
        } catch (error) {
            setMessage(readErrorMessage(error, 'Could not add this area. Please try again.'));
        } finally {
            inFlight.current = false;
            setSaving('');
        }
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
                padding: foundation.spacing.comfortable,
                paddingBottom: scaleIcon(42),
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 960, gap: foundation.spacing.regular }}>
                <HomeHeader />
                <Text
                    selectable
                    style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}
                >
                    Add {scope === 'interior' ? 'an indoor area' : 'an outdoor area'}
                </Text>
                <TextInput
                    accessibilityLabel="Search areas"
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search areas"
                    placeholderTextColor={theme.colors.mutedText}
                    style={{
                        color: theme.colors.text,
                        borderColor: theme.colors.border,
                        borderWidth: 1,
                        borderRadius: foundation.radii.container,
                        padding: scaleIcon(14),
                        fontSize: scaleFont(16),
                    }}
                />

                {loading ? (
                    <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(32) }} />
                ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                        {cards.map((card) => (
                            <AreaContainer
                                key={card.name}
                                title={saving === card.name ? 'Adding…' : card.name}
                                accessibilityLabel={`Add ${card.name}`}
                                onPress={() => void addArea(card.name)}
                                disabled={Boolean(saving)}
                                style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                            />
                        ))}
                    </View>
                )}

                {!loading && cards.length === 0 && (
                    <Text selectable style={foundation.typography.body}>
                        No unused areas match that search.
                    </Text>
                )}
                {!!message && <Text selectable style={{ color: theme.colors.danger }}>{message}</Text>}
            </View>
        </ScrollView>
    );
}

function readErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (error && typeof error === 'object' && 'message' in error) {
        const message = String(error.message || '').trim();
        if (message) return message;
    }
    return fallback;
}

type AddedAreaResult = {
    area_id?: string | null;
    area_scope?: string | null;
};

function readAddedAreaResult(data: unknown): AddedAreaResult | null {
    const value = Array.isArray(data) ? data[0] : data;
    if (!value || typeof value !== 'object') return null;

    const result = value as AddedAreaResult;
    return String(result.area_id || '').trim() ? result : null;
}
