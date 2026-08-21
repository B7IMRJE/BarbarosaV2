import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { AreaContainer } from '../../components/homeos/HomeOSVisualFoundation';
import ThemedButton from '../../components/theme/ThemedButton';
import { useHydratedRouteParamsReady } from '../../hooks/useHydratedRouteParamsReady';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import {
    classifyPropertyArea,
    hasAmbiguousPortableLaundryAreas,
    isPortableLaundryAreaName,
} from '../../lib/propertyAreas';
import { supabase } from '../../lib/supabase';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

type AreaPlacementState = 'unassigned' | 'standalone' | 'inside_area';

type PropertyAreaLocationRow = {
    id: string;
    name: string | null;
    parent_area: string | null;
    area_scope: string | null;
    area_placement_state: string | null;
    archived: boolean | null;
};

export default function AssignPropertyAreaLocationScreen() {
    const { areaId: rawAreaId } = useLocalSearchParams<{
        areaId?: string;
    }>();
    const routeParamsReady = useHydratedRouteParamsReady();
    const areaId = routeParamsReady ? decodeRouteParam(rawAreaId) : '';
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const { width: viewportWidth } = useWindowDimensions();
    const [areas, setAreas] = useState<PropertyAreaLocationRow[]>([]);
    const [placementState, setPlacementState] = useState<AreaPlacementState>('unassigned');
    const [hostAreaId, setHostAreaId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const gridGap = foundation.grid.gap;
    const columns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: foundation.grid.areaMinimumWidth,
        gap: gridGap,
    });
    const cardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns,
        gap: gridGap,
        minimumItemWidth: foundation.grid.areaMinimumWidth,
        maximumItemWidth: scaleIcon(220),
    });

    const targetArea = useMemo(
        () => areas.find((area) => area.id === areaId) || null,
        [areaId, areas]
    );
    const hostAreas = useMemo(() => areas.filter((area) => (
        area.id !== areaId
        && !clean(area.parent_area)
        && !isChildAreaOf(area, targetArea)
    )), [areaId, areas, targetArea]);
    const selectedHost = useMemo(
        () => hostAreas.find((area) => area.id === hostAreaId) || null,
        [hostAreaId, hostAreas]
    );
    const targetHasChildAreas = useMemo(
        () => areas.some((area) => area.id !== areaId && isChildAreaOf(area, targetArea)),
        [areaId, areas, targetArea]
    );
    const targetHasAmbiguousLaundryAlias = Boolean(
        targetArea
        && isPortableLaundryAreaName(targetArea.name)
        && hasAmbiguousPortableLaundryAreas(areas)
    );
    const canSave = Boolean(
        targetArea
        && !saving
        && !targetHasChildAreas
        && !targetHasAmbiguousLaundryAlias
        && (placementState !== 'inside_area' || selectedHost)
    );

    const load = useCallback(async () => {
        if (!routeParamsReady) return;

        setLoading(true);
        setMessage('');

        if (!areaId) {
            setAreas([]);
            setMessage('Choose an area before setting its location.');
            setLoading(false);
            return;
        }

        try {
            const property = await requireActivePropertyMembership();
            const { data, error } = await supabase
                .from('home_items')
                .select('id, name, parent_area, area_scope, area_placement_state, archived')
                .eq('property_id', property.propertyId)
                .ilike('category', 'Area')
                .or('archived.eq.false,archived.is.null')
                .order('name');

            if (error) throw error;

            const nextAreas = (data || []) as PropertyAreaLocationRow[];
            const target = nextAreas.find((area) => area.id === areaId);

            if (!target) {
                setAreas([]);
                setMessage('This area is no longer available. Return to HomeOS and reopen it.');
                return;
            }

            setAreas(nextAreas);

            const nextState = placementStateFor(target);
            const nextHost = nextState === 'inside_area'
                ? nextAreas.find((area) => (
                    area.id !== target.id
                    && !clean(area.parent_area)
                    && sameText(area.name, target.parent_area)
                ))
                : null;

            setPlacementState(nextState);
            setHostAreaId(nextHost?.id || '');

            if (nextState === 'inside_area' && !nextHost) {
                setMessage('This area needs a current host selection. Choose where it belongs, then save.');
            }
        } catch (error) {
            setAreas([]);
            setMessage(activePropertyErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }, [areaId, routeParamsReady]);

    useFocusEffect(useCallback(() => {
        void load();
    }, [load]));

    function choosePlacement(nextState: AreaPlacementState, nextHostAreaId = '') {
        setPlacementState(nextState);
        setHostAreaId(nextState === 'inside_area' ? nextHostAreaId : '');
        setMessage('');
    }

    async function saveLocation() {
        if (!targetArea || !canSave) return;

        setSaving(true);
        setMessage('');

        try {
            const { error } = await supabase.rpc('move_homeowner_property_area', {
                p_area_id: targetArea.id,
                p_placement_state: placementState,
                p_host_area_id: placementState === 'inside_area' ? selectedHost?.id || null : null,
            });

            if (error) throw error;

            returnToHomeOS();
        } catch (error) {
            setMessage(readErrorMessage(error, 'Could not save this area location. Please try again.'));
        } finally {
            setSaving(false);
        }
    }

    function returnToHomeOS() {
        const scope = targetArea ? classifyPropertyArea(targetArea) : 'interior';
        router.dismissTo(`/home/${scope}` as never);
    }

    function locationCardStyle(selected: boolean) {
        return [
            {
                width: cardWidth,
                minWidth: cardWidth,
                maxWidth: cardWidth,
                borderWidth: selected ? 3 : 1,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
            },
        ];
    }

    const targetName = targetArea?.name || 'Area';

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
                    Set {targetName} location
                </Text>
                <Text selectable style={foundation.typography.body}>
                    Choose one location. This keeps the same area, containers, documents, and history.
                </Text>

                {loading ? (
                    <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(28) }} />
                ) : targetArea ? (
                    <>
                        <View style={{ gap: foundation.spacing.regular }}>
                            <Text selectable style={foundation.typography.containerTitle}>Location</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                                <AreaContainer
                                    title="Not assigned yet"
                                    subtitle={placementState === 'unassigned' ? 'Selected · Choose a location later' : 'Choose a location later'}
                                    fallbackIcon="📍"
                                    accessibilityLabel={`${placementState === 'unassigned' ? 'Selected. ' : ''}Keep ${targetName} not assigned yet`}
                                    accessibilityState={{ selected: placementState === 'unassigned' }}
                                    onPress={() => choosePlacement('unassigned')}
                                    style={locationCardStyle(placementState === 'unassigned')}
                                />
                                <AreaContainer
                                    title="Standalone room"
                                    subtitle={placementState === 'standalone' ? 'Selected · Its own room' : 'Its own room'}
                                    fallbackIcon="🚪"
                                    accessibilityLabel={`${placementState === 'standalone' ? 'Selected. ' : ''}Make ${targetName} a standalone room`}
                                    accessibilityState={{ selected: placementState === 'standalone' }}
                                    onPress={() => choosePlacement('standalone')}
                                    style={locationCardStyle(placementState === 'standalone')}
                                />
                            </View>
                        </View>

                        <View style={{ gap: foundation.spacing.regular }}>
                            <Text selectable style={foundation.typography.containerTitle}>Inside an existing area</Text>
                            <Text selectable style={foundation.typography.body}>
                                Pick the room or area where {targetName} is located.
                            </Text>
                            {hostAreas.length > 0 ? (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                                    {hostAreas.map((host) => {
                                        const selected = placementState === 'inside_area' && host.id === hostAreaId;
                                        const title = host.name || 'Area';

                                        return (
                                            <AreaContainer
                                                key={host.id}
                                                title={title}
                                                subtitle={selected ? 'Selected · Place inside this area' : 'Place inside this area'}
                                                accessibilityLabel={`${selected ? 'Selected. ' : ''}Place ${targetName} inside ${title}`}
                                                accessibilityState={{ selected }}
                                                onPress={() => choosePlacement('inside_area', host.id)}
                                                style={locationCardStyle(selected)}
                                            />
                                        );
                                    })}
                                </View>
                            ) : (
                                <Text selectable style={foundation.typography.body}>
                                    Add another top-level area before placing this area inside it.
                                </Text>
                            )}
                        </View>

                        {targetHasChildAreas ? (
                            <Text selectable accessibilityLiveRegion="polite" style={{ color: theme.colors.danger }}>
                                Move the areas inside {targetName} first, then change this location.
                            </Text>
                        ) : null}

                        {targetHasAmbiguousLaundryAlias ? (
                            <Text selectable accessibilityLiveRegion="polite" style={{ color: theme.colors.danger }}>
                                More than one Laundry area is saved. Keep both records unchanged until the duplicate is reviewed.
                            </Text>
                        ) : null}

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: foundation.spacing.compact }}>
                            <ThemedButton
                                title={saving ? 'Saving location…' : 'Save Location'}
                                accessibilityLabel={`Save ${targetName} location`}
                                testID="homeos-area-location-save"
                                disabled={!canSave}
                                onPress={() => void saveLocation()}
                                style={{ minWidth: scaleIcon(186) }}
                            />
                            <ThemedButton
                                title="Cancel"
                                variant="secondary"
                                testID="homeos-area-location-cancel"
                                disabled={saving}
                                onPress={returnToHomeOS}
                                style={{ minWidth: scaleIcon(120) }}
                            />
                        </View>
                    </>
                ) : null}

                {!!message && (
                    <Text selectable accessibilityLiveRegion="polite" style={{ color: theme.colors.danger }}>
                        {message}
                    </Text>
                )}
            </View>
        </ScrollView>
    );
}

function placementStateFor(area: PropertyAreaLocationRow): AreaPlacementState {
    const saved = clean(area.area_placement_state).toLowerCase();

    if (saved === 'standalone' || saved === 'inside_area' || saved === 'unassigned') {
        return saved;
    }

    if (clean(area.parent_area)) return 'inside_area';

    return isPortableLaundryAreaName(area.name) ? 'unassigned' : 'standalone';
}

function isChildAreaOf(area: PropertyAreaLocationRow, target: PropertyAreaLocationRow | null) {
    return Boolean(target && sameText(area.parent_area, target.name));
}

function clean(value: unknown) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function sameText(first: unknown, second: unknown) {
    return clean(first).toLowerCase() === clean(second).toLowerCase();
}

function decodeRouteParam(value?: string) {
    const text = String(value || '').trim();

    try {
        return decodeURIComponent(text).trim();
    } catch {
        return text;
    }
}

function readErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (error && typeof error === 'object' && 'message' in error) {
        const message = String(error.message || '').trim();
        if (message) return message;
    }
    return fallback;
}
