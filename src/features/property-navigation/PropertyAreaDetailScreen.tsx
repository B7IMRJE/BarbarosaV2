import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import {
    AreaContainer,
    EquipmentContainer,
} from '../../components/homeos/HomeOSVisualFoundation';
import { resolveHomeOSEquipmentVisual } from '../../components/homeos/homeos-visual-assets';
import ThemedButton from '../../components/theme/ThemedButton';
import { useHydratedRouteParamsReady } from '../../hooks/useHydratedRouteParamsReady';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { resolveHomeItemDisplay } from '../../lib/homeItemDisplay';
import {
    resolveHomeItemHealthRollupPresentation,
    resolveHomeItemHealthCardStyle,
} from '../../lib/homeItemHealthPresentation';
import { resolveHomeItemComponentDeck } from '../../lib/homeItemHierarchyProjection';
import { isChildPropertyArea } from '../../lib/propertyAreas';
import {
    loadHomeOSStarterCardChoices,
    type HomeOSStarterCardChoice,
} from '../../lib/homeosStarterCatalog';
import {
    buildPropertyAreaContainerCreateRoute,
    resolvePropertyAreaContainerDeck,
} from '../../lib/propertyAreaContainerDeck';
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
    status?: string | null;
    install_state?: string | null;
    starter_template_key?: string | null;
    parent_home_item_id?: string | null;
    placement_label?: string | null;
    photo_url?: string | null;
    archived?: boolean | null;
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
    const [starterCards, setStarterCards] = useState<HomeOSStarterCardChoice[]>([]);
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
            const [itemsResult, deckResult] = await Promise.all([
                supabase
                    .from('home_items')
                    .select('id, name, item_slug, system, category, location, parent_area, status, install_state, starter_template_key, parent_home_item_id, placement_label, photo_url, archived')
                    .eq('property_id', property.propertyId)
                    .or('archived.eq.false,archived.is.null')
                    .order('system')
                    .order('name'),
                loadHomeOSStarterCardChoices({ propertyId: property.propertyId })
                    .then((cards) => ({ cards, error: null as unknown }))
                    .catch((error) => ({ cards: [] as HomeOSStarterCardChoice[], error })),
            ]);
            const { data, error } = itemsResult;

            if (error) throw error;
            setAllItems((data || []) as AreaItem[]);
            setStarterCards(deckResult.cards);

            if (deckResult.error) {
                console.warn('HomeOS container presentation metadata was unavailable; using conservative compatibility rules.');
            }
        } catch (error) {
            setAllItems([]);
            setStarterCards([]);
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
    const containerItems = useMemo(
        () => resolvePropertyAreaContainerDeck(allItems, { areaName, parentAreaName }, starterCards),
        [allItems, areaName, parentAreaName, starterCards]
    );
    const containerComponentsById = useMemo(() => {
        const componentDecks = new Map<string, AreaItem[]>();

        containerItems.forEach((item) => {
            componentDecks.set(item.id, resolveHomeItemComponentDeck(allItems, item));
        });

        return componentDecks;
    }, [allItems, containerItems]);

    function openChildArea(item: AreaItem) {
        router.push({
            pathname: '/home/area/[area]',
            params: {
                area: item.name || '',
                parentArea: areaName,
            },
        } as never);
    }

    function openAddContainer() {
        router.push(buildPropertyAreaContainerCreateRoute({
            areaName,
            parentAreaName,
        }) as never);
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
                    Existing areas and containers stored here
                </Text>
                <ThemedButton
                    title="Add Container"
                    accessibilityLabel={`Add a container to ${areaName || 'this area'}`}
                    disabled={!routeParamsReady || !areaName}
                    onPress={openAddContainer}
                    style={{ alignSelf: 'flex-start' }}
                />

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

                        {containerItems.length > 0 && (
                            <View style={{ gap: foundation.spacing.regular }}>
                                <Text selectable style={foundation.typography.containerTitle}>Containers</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                                    {containerItems.map((item) => {
                                        const itemSlug = String(item.item_slug || '').trim();
                                        const itemDisplay = resolveHomeItemDisplay(item);
                                        const componentItems = containerComponentsById.get(item.id) || [];
                                        const health = resolveHomeItemHealthRollupPresentation([
                                            item,
                                            ...componentItems,
                                        ]);
                                        const statusDetail = `Status: ${health.label}`;

                                        return (
                                            <EquipmentContainer
                                                key={item.id}
                                                title={itemDisplay.title}
                                                detail={itemSlug
                                                    ? [statusDetail, itemDisplay.placementLabel].filter(Boolean).join(' · ')
                                                    : [statusDetail, itemDisplay.placementLabel, 'Details unavailable'].filter(Boolean).join(' · ')}
                                                visual={resolveHomeOSEquipmentVisual(item.photo_url)}
                                                accessibilityLabel={itemSlug
                                                    ? `Open ${itemDisplay.title}${itemDisplay.placementLabel ? `, ${itemDisplay.placementLabel}` : ''}. Status: ${health.label}`
                                                    : `${itemDisplay.title} details unavailable. Status: ${health.label}`}
                                                disabled={!itemSlug}
                                                onPress={itemSlug ? () => router.push({
                                                    pathname: '/item/[slug]',
                                                    params: { slug: itemSlug, presentation: 'assembly' },
                                                } as never) : undefined}
                                                style={[
                                                    resolveHomeItemHealthCardStyle(health.tone, theme),
                                                    { width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth },
                                                ]}
                                            />
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {childAreas.length === 0 && containerItems.length === 0 && (
                            <Text selectable style={foundation.typography.body}>
                                No containers are currently stored in this area.
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
