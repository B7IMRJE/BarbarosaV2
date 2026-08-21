import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { MainDestinationCard } from '../../components/homeos/HomeOSVisualFoundation';
import ThemedButton from '../../components/theme/ThemedButton';
import { loadCompanyHomeIdentity, type HomeIdentity } from '../../lib/homeIdentity';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { providerModePath, readProviderModeParams } from '../../lib/providerMode';
import { getProviderReturnActionLabel } from '../../lib/techosClientAccess';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

/** Provider landing that mirrors the property-first HomeOS hierarchy without homeowner-only activity. */
export default function ProviderPropertyLandingScreen() {
    const routeParams = useLocalSearchParams<{
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const providerModeContext = useMemo(() => readProviderModeParams({
        providerMode: routeParams.providerMode,
        companyId: routeParams.companyId,
        propertyId: routeParams.propertyId,
        returnTo: routeParams.returnTo,
        serviceRequestId: routeParams.serviceRequestId,
        scheduleSlotId: routeParams.scheduleSlotId,
        jobId: routeParams.jobId,
    }), [
        routeParams.providerMode,
        routeParams.companyId,
        routeParams.propertyId,
        routeParams.returnTo,
        routeParams.serviceRequestId,
        routeParams.scheduleSlotId,
        routeParams.jobId,
    ]);
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { width: viewportWidth } = useWindowDimensions();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const cardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns: resolveHomeOSContainerGrid({
            viewportWidth,
            contentWidth,
            minimumItemWidth: scaleIcon(280),
            gap: foundation.grid.gap,
            maximumColumns: 2,
        }),
        gap: foundation.grid.gap,
        minimumItemWidth: scaleIcon(280),
        maximumItemWidth: scaleIcon(460),
    });
    const [identity, setIdentity] = useState<HomeIdentity | null>(null);
    const [loading, setLoading] = useState(true);

    useFocusEffect(useCallback(() => {
        if (!providerModeContext) {
            setIdentity(null);
            setLoading(false);
            return;
        }

        let current = true;
        setLoading(true);
        void loadCompanyHomeIdentity(providerModeContext)
            .then((nextIdentity) => { if (current) setIdentity(nextIdentity); })
            .catch(() => { if (current) setIdentity(null); })
            .finally(() => { if (current) setLoading(false); });

        return () => { current = false; };
    }, [providerModeContext]));

    const returnTo = providerModeContext?.returnTo || '/techos';
    const homeName = identity?.name || 'Client Home';
    const homeAddress = identity?.address?.formattedAddress || 'Assigned client property';

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
                <ThemedButton
                    title={`‹ ${getProviderReturnActionLabel(returnTo)}`}
                    accessibilityLabel={getProviderReturnActionLabel(returnTo)}
                    variant="secondary"
                    onPress={() => router.replace(returnTo as never)}
                    style={{ alignSelf: 'flex-start' }}
                />
                <View style={{ gap: foundation.spacing.compact }}>
                    <Text selectable style={[foundation.typography.label, { color: theme.colors.primary, textTransform: 'uppercase' }]}>Client HomeOS</Text>
                    <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}>Property</Text>
                    <Text selectable style={foundation.typography.body}>
                        Open the client home before choosing Interior or Exterior.
                    </Text>
                </View>
                {loading ? (
                    <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: scaleIcon(32) }} />
                ) : (
                    <MainDestinationCard
                        title={homeName}
                        description={homeAddress}
                        visual={{ source: require('../../../assets/homeos/destinations/home.png') }}
                        fallbackIcon="🏠"
                        visualContentFit="contain"
                        actionLabel="Open Home"
                        disabled={!providerModeContext}
                        onPress={() => {
                            if (!providerModeContext) return;
                            router.push(providerModePath('/home', providerModeContext) as never);
                        }}
                        accessibilityLabel={`Open ${homeName}${homeAddress ? ` at ${homeAddress}` : ''}`}
                        style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                    />
                )}
            </View>
        </ScrollView>
    );
}
