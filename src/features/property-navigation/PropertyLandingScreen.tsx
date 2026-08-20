import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { AreaContainer, MainDestinationCard } from '../../components/homeos/HomeOSVisualFoundation';
import ThemedButton from '../../components/theme/ThemedButton';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import { formatSingleLineAddress, loadActiveHomeIdentity, type HomeIdentity } from '../../lib/homeIdentity';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import {
    activeAreasForScope,
    isTopLevelPropertyArea,
    type PropertyAreaRecord,
} from '../../lib/propertyAreas';
import { getAreaIcon } from '../../lib/systemDefaults';
import { supabase } from '../../lib/supabase';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export default function PropertyLandingScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { width: viewportWidth } = useWindowDimensions();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const [identity, setIdentity] = useState<HomeIdentity | null>(null);
    const [areas, setAreas] = useState<PropertyAreaRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const cardGap = foundation.grid.gap;
    const cardMinimumWidth = scaleIcon(280);
    const columns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: cardMinimumWidth,
        gap: cardGap,
        maximumColumns: 2,
    });
    const cardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns,
        gap: cardGap,
        minimumItemWidth: cardMinimumWidth,
        maximumItemWidth: scaleIcon(460),
    });
    const areaColumns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: foundation.grid.areaMinimumWidth,
        gap: cardGap,
    });
    const areaCardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns: areaColumns,
        gap: cardGap,
        minimumItemWidth: foundation.grid.areaMinimumWidth,
        maximumItemWidth: scaleIcon(220),
    });

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');

        try {
            const property = await requireActivePropertyMembership();
            setIdentity(await loadActiveHomeIdentity());
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
            setIdentity(null);
            setAreas([]);
            setMessage(activePropertyErrorMessage(error));

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as never);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as never);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => {
        void load();
    }, [load]));

    const propertyLabel = formatSingleLineAddress(identity?.address) || identity?.name || 'My property';
    const unclassifiedAreas = activeAreasForScope(
        areas.filter(isTopLevelPropertyArea),
        'unclassified'
    );
    const destinationCardStyle = {
        width: cardWidth,
        minWidth: cardWidth,
        maxWidth: cardWidth,
    };

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
                <Text selectable style={foundation.typography.label}>{propertyLabel}</Text>
                <Text
                    selectable
                    style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}
                >
                    Your property
                </Text>

                {loading ? (
                    <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(32) }} />
                ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                        <MainDestinationCard
                            title="Home"
                            description="Rooms, equipment, and everything inside your home"
                            visual={{ source: require('../../../assets/homeos/destinations/home.png') }}
                            fallbackIcon="🏠"
                            visualContentFit="contain"
                            actionLabel="Open Home"
                            accentColor={theme.colors.primary}
                            onPress={() => router.push('/home/interior' as never)}
                            style={destinationCardStyle}
                        />
                        <MainDestinationCard
                            title="Exterior"
                            description="Outdoor areas, equipment, and everything around your home"
                            visual={{ source: require('../../../assets/homeos/destinations/exterior.png') }}
                            fallbackIcon="🌳"
                            visualContentFit="contain"
                            actionLabel="Open Exterior"
                            accentColor={theme.colors.status.good.border}
                            onPress={() => router.push('/home/exterior' as never)}
                            style={destinationCardStyle}
                        />
                    </View>
                )}

                {!loading && unclassifiedAreas.length > 0 && (
                    <View style={{ marginTop: foundation.spacing.spacious, gap: foundation.spacing.regular }}>
                        <Text selectable style={foundation.typography.containerTitle}>
                            Other / Unclassified
                        </Text>
                        <Text selectable style={foundation.typography.body}>
                            These existing areas were not guessed or moved. You can still open them here.
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                            {unclassifiedAreas.map((area) => {
                                const title = area.name || 'Area';

                                return (
                                    <AreaContainer
                                        key={area.id}
                                        title={title}
                                        fallbackIcon={getAreaIcon(title)}
                                        onPress={() => router.push({
                                            pathname: '/home/area/[area]',
                                            params: { area: title },
                                        } as never)}
                                        style={{
                                            width: areaCardWidth,
                                            minWidth: areaCardWidth,
                                            maxWidth: areaCardWidth,
                                        }}
                                    />
                                );
                            })}
                        </View>
                    </View>
                )}

                <View style={{ alignItems: 'flex-start', marginTop: foundation.spacing.compact }}>
                    <ThemedButton
                        title="Services"
                        variant="secondary"
                        accessibilityLabel="Open home services"
                        onPress={() => router.push('/services' as never)}
                    />
                </View>

                {!!message && (
                    <Text selectable style={{ color: theme.colors.danger, fontSize: scaleFont(14) }}>
                        {message}
                    </Text>
                )}
            </View>
        </ScrollView>
    );
}
