import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import {
    AreaContainer,
    EquipmentContainer,
} from '../../components/homeos/HomeOSVisualFoundation';
import { resolveHomeOSEquipmentVisual } from '../../components/homeos/homeos-visual-assets';
import { useHydratedRouteParamsReady } from '../../hooks/useHydratedRouteParamsReady';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { resolveHomeItemDisplay } from '../../lib/homeItemDisplay';
import { resolveHomeItemAreaAssemblyDeck } from '../../lib/homeItemHierarchyProjection';
import { isChildPropertyArea } from '../../lib/propertyAreas';
import { getAreaIcon } from '../../lib/systemDefaults';
import { supabase } from '../../lib/supabase';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

type AreaItem = {
    id: string;
    name: string | null;
    item_slug: string | null;
    system: string | null;
    category: string | null;
    location: string | null;
    parent_area: string | null;
    starter_template_key?: string | null;
    parent_home_item_id?: string | null;
    placement_label?: string | null;
    photo_url?: string | null;
};

export default function PropertyAreaDetailScreen() {
    const { area, parentArea } = useLocalSearchParams<{ area?: string; parentArea?: string }>();
    const routeParamsReady = useHydratedRouteParamsReady();
    const areaName = routeParamsReady ? decodeRouteParam(area) : '';
    const parentAreaName = routeParamsReady ? decodeRouteParam(parentArea) : '';
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const { width: viewportWidth } = useWindowDimensions();
    const [allItems, setAllItems] = useState<AreaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const gridGap = foundation.grid.gap;
    const gridMinimumWidth = foundation.grid.equipmentMinimumWidth;
    const columns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: gridMinimumWidth,
        gap: gridGap,
    });
    const cardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns,
        gap: gridGap,
        minimumItemWidth: gridMinimumWidth,
        maximumItemWidth: scaleIcon(220),
    });

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');

        try {
            const property = await requireActivePropertyMembership();
            const { data, error } = await supabase
                .from('home_items')
                .select('id, name, item_slug, system, category, location, parent_area, starter_template_key, parent_home_item_id, placement_label, photo_url')
                .eq('property_id', property.propertyId)
                .or('archived.eq.false,archived.is.null')
                .order('system')
                .order('name');

            if (error) throw error;
            setAllItems((data || []) as AreaItem[]);
        } catch (error) {
            setAllItems([]);
            setMessage(activePropertyErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => {
        void load();
    }, [load]));

    const childAreas = useMemo(
        () => allItems.filter((item) => isChildPropertyArea(item, areaName)),
        [allItems, areaName]
    );
    const assemblyItems = useMemo(
        () => resolveHomeItemAreaAssemblyDeck(allItems, { areaName, parentAreaName }),
        [allItems, areaName, parentAreaName]
    );

    function openChildArea(item: AreaItem) {
        router.push({
            pathname: '/home/area/[area]',
            params: {
                area: item.name || '',
                parentArea: areaName,
            },
        } as never);
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
                    {areaName || 'Area'}
                </Text>
                <Text selectable style={foundation.typography.body}>
                    Existing areas, equipment, and items stored here
                </Text>

                {loading ? (
                    <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(28) }} />
                ) : (
                    <>
                        {childAreas.length > 0 && (
                            <View style={{ gap: foundation.spacing.regular }}>
                                <Text selectable style={foundation.typography.containerTitle}>Areas</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                                    {childAreas.map((item) => {
                                        const title = item.name || 'Area';

                                        return (
                                            <AreaContainer
                                                key={item.id}
                                                title={title}
                                                fallbackIcon={getAreaIcon(title)}
                                                onPress={() => openChildArea(item)}
                                                style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                                            />
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {assemblyItems.length > 0 && (
                            <View style={{ gap: foundation.spacing.regular }}>
                                <Text selectable style={foundation.typography.containerTitle}>Equipment &amp; Fixtures</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                                    {assemblyItems.map((item) => {
                                        const itemSlug = String(item.item_slug || '').trim();
                                        const itemDisplay = resolveHomeItemDisplay(item);

                                        return (
                                            <EquipmentContainer
                                                key={item.id}
                                                title={itemDisplay.title}
                                                detail={itemSlug
                                                    ? itemDisplay.placementLabel || undefined
                                                    : [itemDisplay.placementLabel, 'Details unavailable'].filter(Boolean).join(' · ')}
                                                visual={resolveHomeOSEquipmentVisual(item.photo_url)}
                                                accessibilityLabel={itemSlug
                                                    ? `Open ${itemDisplay.title}${itemDisplay.placementLabel ? `, ${itemDisplay.placementLabel}` : ''}`
                                                    : `${itemDisplay.title} details unavailable`}
                                                disabled={!itemSlug}
                                                onPress={itemSlug ? () => router.push({
                                                    pathname: '/item/[slug]',
                                                    params: { slug: itemSlug, presentation: 'assembly' },
                                                } as never) : undefined}
                                                style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                                            />
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {childAreas.length === 0 && assemblyItems.length === 0 && (
                            <Text selectable style={foundation.typography.body}>
                                No equipment or items are currently stored in this area.
                            </Text>
                        )}
                    </>
                )}

                {!!message && <Text selectable style={{ color: theme.colors.danger }}>{message}</Text>}
            </View>
        </ScrollView>
    );
}

function decodeRouteParam(value?: string) {
    const text = String(value || '').trim();

    try {
        return decodeURIComponent(text).trim();
    } catch {
        return text;
    }
}
