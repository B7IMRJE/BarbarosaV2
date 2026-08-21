import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { MainDestinationCard } from '../../components/homeos/HomeOSVisualFoundation';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import { formatSingleLineAddress, loadActiveHomeIdentity, type HomeIdentity } from '../../lib/homeIdentity';
import {
    propertyLandingPrimaryDestinations,
    resolvePropertyLandingIdentity,
} from '../../lib/propertyLandingNavigation';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export default function PropertyLandingScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { width: viewportWidth } = useWindowDimensions();
    const [identity, setIdentity] = useState<HomeIdentity | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            await requireActivePropertyMembership();
            setIdentity(await loadActiveHomeIdentity());
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { void load(); }, [load]));
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const identityPresentation = resolvePropertyLandingIdentity({
        name: identity?.name,
        address: formatSingleLineAddress(identity?.address),
    });
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const cardGap = foundation.spacing.regular;
    const columns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: scaleIcon(280),
        gap: cardGap,
        maximumColumns: 2,
    });
    const cardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns,
        gap: cardGap,
        minimumItemWidth: scaleIcon(280),
        maximumItemWidth: scaleIcon(460),
    });

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: foundation.spacing.comfortable, paddingBottom: scaleIcon(42), alignItems: 'center' }}>
            <View style={{ width: '100%', maxWidth: 960, gap: foundation.spacing.regular }}>
                <HomeHeader />
                <View
                    accessibilityRole="summary"
                    accessibilityLabel={`${identityPresentation.title}${identityPresentation.address ? `, ${identityPresentation.address}` : ''}`}
                    style={[
                        foundation.surface,
                        {
                            minHeight: scaleIcon(156),
                            padding: foundation.spacing.comfortable,
                            overflow: 'hidden',
                            justifyContent: 'center',
                            backgroundColor: theme.colors.surface,
                        },
                    ]}
                >
                    <Text
                        pointerEvents="none"
                        accessible={false}
                        style={{
                            position: 'absolute',
                            right: foundation.spacing.regular,
                            bottom: scaleIcon(-10),
                            fontSize: scaleIcon(112),
                            opacity: 0.16,
                        }}
                    >
                        🏠
                    </Text>
                    <View style={{ maxWidth: '78%', gap: foundation.spacing.compact }}>
                        <Text selectable style={[foundation.typography.label, { color: theme.colors.primary, textTransform: 'uppercase' }]}>
                            {identityPresentation.eyebrow}
                        </Text>
                        <Text selectable numberOfLines={2} style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30), lineHeight: scaleFont(36) }]}>
                            {identityPresentation.title}
                        </Text>
                        {identityPresentation.address ? (
                            <Text selectable numberOfLines={2} style={foundation.typography.body}>
                                {identityPresentation.address}
                            </Text>
                        ) : null}
                    </View>
                </View>
                {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(32) }} /> : (
                    <View testID="homeos-property-destinations" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                        {propertyLandingPrimaryDestinations.map((destination) => (
                            <MainDestinationCard
                                key={destination.key}
                                title={destination.title}
                                description={destination.description}
                                visual={{
                                    source: destination.key === 'interior'
                                        ? require('../../../assets/homeos/destinations/home.png')
                                        : require('../../../assets/homeos/destinations/exterior.png'),
                                }}
                                fallbackIcon={destination.key === 'interior' ? '🏠' : '🌳'}
                                visualContentFit="contain"
                                actionLabel={destination.actionLabel}
                                onPress={() => router.push(destination.route as any)}
                                accessibilityLabel={destination.accessibilityLabel}
                                style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                            />
                        ))}
                    </View>
                )}
                {!!message && <Text selectable style={{ color: theme.colors.danger, fontSize: scaleFont(14), marginTop: scaleIcon(18) }}>{message}</Text>}
            </View>
        </ScrollView>
    );
}
