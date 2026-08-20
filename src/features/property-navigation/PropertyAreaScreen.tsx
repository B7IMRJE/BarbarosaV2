import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { AreaContainer } from '../../components/homeos/HomeOSVisualFoundation';
import ThemedButton from '../../components/theme/ThemedButton';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import {
    activeAreasForScope,
    isTopLevelPropertyArea,
    type PropertyAreaRecord,
    type PropertyAreaScope,
} from '../../lib/propertyAreas';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { getAreaIcon } from '../../lib/systemDefaults';
import { supabase } from '../../lib/supabase';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export default function PropertyAreaScreen() {
    const { scope: rawScope } = useLocalSearchParams<{ scope?: string }>();
    const scope: Exclude<PropertyAreaScope, 'unclassified'> = rawScope === 'exterior'
        ? 'exterior'
        : 'interior';
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const { width: viewportWidth } = useWindowDimensions();
    const [areas, setAreas] = useState<PropertyAreaRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const label = scope === 'interior' ? 'Home' : 'Exterior';
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
                .or('archived.eq.false,archived.is.null')
                .order('name');

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

    const activeAreas = useMemo(
        () => activeAreasForScope(areas.filter(isTopLevelPropertyArea), scope),
        [areas, scope]
    );

    function openArea(area: PropertyAreaRecord) {
        router.push({
            pathname: '/home/area/[area]',
            params: { area: area.name || '' },
        } as never);
    }

    function renderAreaCard(area: PropertyAreaRecord) {
        const title = area.name || 'Area';

        return (
            <AreaContainer
                key={area.id}
                title={title}
                fallbackIcon={getAreaIcon(title)}
                onPress={() => openArea(area)}
                style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
            />
        );
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
                    {label}
                </Text>
                <Text selectable style={foundation.typography.body}>
                    {scope === 'interior'
                        ? 'Select an active indoor area'
                        : 'Select an active outdoor area'}
                </Text>
                <ThemedButton
                    title="Add Area"
                    onPress={() => router.push(`/home/${scope}/add-area` as never)}
                    style={{ alignSelf: 'flex-start' }}
                />

                {loading ? (
                    <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(32) }} />
                ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                        {activeAreas.map(renderAreaCard)}
                    </View>
                )}

                {!loading && activeAreas.length === 0 && (
                    <Text selectable style={foundation.typography.body}>
                        No active {scope} areas yet. Add only the areas that exist at this property.
                    </Text>
                )}

                {!!message && <Text selectable style={{ color: theme.colors.danger }}>{message}</Text>}
            </View>
        </ScrollView>
    );
}
