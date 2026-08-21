import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { MainDestinationCard } from '../../components/homeos/HomeOSVisualFoundation';
import ThemedButton from '../../components/theme/ThemedButton';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { loadCompanyHomeIdentity, type HomeIdentity } from '../../lib/homeIdentity';
import { myHomeAreaDestinations } from '../../lib/propertyLandingNavigation';
import { providerModePath, readProviderModeParams } from '../../lib/providerMode';
import { getProviderReturnActionLabel } from '../../lib/techosClientAccess';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

/** Property-area chooser. Area decks stay hidden until the homeowner selects a scope. */
export default function MyHomeScreen() {
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
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const { width: viewportWidth } = useWindowDimensions();
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const gap = foundation.grid.gap;
    const columns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: scaleIcon(280),
        gap,
        maximumColumns: 2,
    });
    const cardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns,
        gap,
        minimumItemWidth: scaleIcon(280),
        maximumItemWidth: scaleIcon(460),
    });
    const [providerIdentity, setProviderIdentity] = useState<HomeIdentity | null>(null);
    const [providerIdentityLoading, setProviderIdentityLoading] = useState(false);

    useFocusEffect(useCallback(() => {
        if (!providerModeContext) {
            setProviderIdentity(null);
            setProviderIdentityLoading(false);
            return;
        }

        let current = true;
        setProviderIdentityLoading(true);
        void loadCompanyHomeIdentity(providerModeContext)
            .then((identity) => { if (current) setProviderIdentity(identity); })
            .catch(() => { if (current) setProviderIdentity(null); })
            .finally(() => { if (current) setProviderIdentityLoading(false); });

        return () => { current = false; };
    }, [providerModeContext]));

    const providerReturnTo = providerModeContext?.returnTo || '/techos';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
                alignItems: 'center',
                padding: foundation.spacing.comfortable,
                paddingBottom: scaleIcon(42),
            }}
        >
            <View style={{ width: '100%', maxWidth: 960, gap: foundation.spacing.regular }}>
                <HomeHeader />
                <ThemedButton
                    title={providerModeContext
                        ? `‹ ${getProviderReturnActionLabel(providerReturnTo)}`
                        : '‹ Back to Property'}
                    variant="secondary"
                    accessibilityLabel={providerModeContext
                        ? getProviderReturnActionLabel(providerReturnTo)
                        : 'Back to Property'}
                    onPress={() => router.replace((providerModeContext ? providerReturnTo : '/') as never)}
                    style={{ alignSelf: 'flex-start' }}
                />
                {providerModeContext ? (
                    <View
                        testID="provider-homeos-property-identity"
                        style={[foundation.surface, { padding: foundation.spacing.comfortable, gap: foundation.spacing.compact }]}
                    >
                        <Text selectable style={[foundation.typography.label, { color: theme.colors.primary, textTransform: 'uppercase' }]}>Client HomeOS</Text>
                        {providerIdentityLoading ? (
                            <ActivityIndicator color={theme.colors.primary} style={{ alignSelf: 'flex-start' }} />
                        ) : (
                            <>
                                <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}>
                                    {providerIdentity?.name || 'Client Home'}
                                </Text>
                                <Text selectable style={foundation.typography.body}>
                                    {providerIdentity?.address?.formattedAddress || 'Assigned client property'}
                                </Text>
                            </>
                        )}
                    </View>
                ) : null}
                <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}>My Home</Text>
                <Text selectable style={foundation.typography.body}>
                    Choose Interior or Exterior to open that property-area deck.
                </Text>
                <View testID="homeos-my-home-area-sections" style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                    {myHomeAreaDestinations.map((destination) => (
                        <MainDestinationCard
                            key={destination.key}
                            title={destination.title}
                            description={destination.description}
                            actionLabel={destination.actionLabel}
                            onPress={() => router.push((providerModeContext
                                ? providerModePath(destination.route, providerModeContext)
                                : destination.route) as never)}
                            accessibilityLabel={destination.accessibilityLabel}
                            style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                        />
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
