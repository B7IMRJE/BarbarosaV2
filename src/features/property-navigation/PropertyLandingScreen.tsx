import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { MainDestinationCard } from '../../components/homeos/HomeOSVisualFoundation';
import HomeOSStatusLegend from '../../components/homeos/HomeOSStatusLegend';
import HomeownerActiveRequestStatus from '../../components/serviceRequests/HomeownerActiveRequestStatus';
import ThemedButton from '../../components/theme/ThemedButton';
import { activePropertyErrorMessage, selectActiveProperty } from '../../lib/activeProperty';
import { clearPendingCompanyInviteState } from '../../lib/companyInviteState';
import {
    loadHomePropertyCollection,
    type HomePropertyCollection,
} from '../../lib/homePropertyCollection';
import { signOutFromHomeOS } from '../../lib/homeosSignOut';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { propertyLandingWorkflowDestinations } from '../../lib/propertyLandingNavigation';
import { clearSessionActivity } from '../../lib/sessionSecurity';
import { supabase } from '../../lib/supabase';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export default function PropertyLandingScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { width: viewportWidth } = useWindowDimensions();
    const [collection, setCollection] = useState<HomePropertyCollection | null>(null);
    const [loading, setLoading] = useState(true);
    const [openingPropertyId, setOpeningPropertyId] = useState('');
    const [signingOut, setSigningOut] = useState(false);
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            setCollection(await loadHomePropertyCollection());
        } catch (error) {
            setCollection(null);
            setMessage(activePropertyErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { void load(); }, [load]));
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const cardGap = foundation.spacing.regular;
    const propertyColumns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: scaleIcon(280),
        gap: cardGap,
        maximumColumns: 2,
    });
    const propertyCardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns: propertyColumns,
        gap: cardGap,
        minimumItemWidth: scaleIcon(280),
        maximumItemWidth: scaleIcon(460),
    });
    const activityColumns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: scaleIcon(152),
        gap: cardGap,
        maximumColumns: 4,
    });
    const activityCardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns: activityColumns,
        gap: cardGap,
        minimumItemWidth: scaleIcon(152),
        maximumItemWidth: scaleIcon(260),
    });

    async function openProperty(propertyId: string) {
        if (openingPropertyId) return;

        setOpeningPropertyId(propertyId);
        setMessage('');

        try {
            await selectActiveProperty(propertyId);
            setCollection((current) => current ? {
                ...current,
                selectedPropertyId: propertyId,
                properties: current.properties.map((property) => ({
                    ...property,
                    isSelected: property.propertyId === propertyId,
                })),
            } : current);
            router.push('/home' as never);
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
        } finally {
            setOpeningPropertyId('');
        }
    }

    async function handleSignOut() {
        if (signingOut) return;

        setSigningOut(true);
        setMessage('');

        const result = await signOutFromHomeOS({
            signOut: (scope) => supabase.auth.signOut({ scope }),
            clearPendingInviteState: clearPendingCompanyInviteState,
            clearSessionActivity,
            replaceWithLogin: () => router.replace('/auth/login' as never),
        });

        if (result.status === 'failed') {
            setSigningOut(false);
            setMessage(result.message);
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
                <View
                    testID="homeos-property-collection"
                    style={[
                        foundation.surface,
                        {
                            padding: foundation.spacing.comfortable,
                            gap: foundation.spacing.regular,
                            overflow: 'hidden',
                        },
                    ]}
                >
                    <Text
                        testID="homeos-property-collection-motif"
                        pointerEvents="none"
                        accessible={false}
                        style={{
                            position: 'absolute',
                            right: foundation.spacing.regular,
                            top: scaleIcon(42),
                            fontSize: scaleIcon(108),
                            opacity: 0.08,
                        }}
                    >🏠</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: foundation.spacing.regular }}>
                        <View style={{ flex: 1, gap: foundation.spacing.compact }}>
                            <Text selectable style={[foundation.typography.label, { color: theme.colors.primary, textTransform: 'uppercase' }]}>HomeOS</Text>
                            <Text selectable numberOfLines={2} style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30), lineHeight: scaleFont(36) }]}>
                                {collection?.title || 'Your Properties'}
                            </Text>
                        </View>
                        <ThemedButton
                            title={signingOut ? 'Signing Out...' : 'Sign Out'}
                            accessibilityLabel="Sign out of HomeOS"
                            testID="homeos-sign-out"
                            disabled={signingOut}
                            variant="ghost"
                            onPress={() => void handleSignOut()}
                            style={{ minHeight: scaleIcon(44), minWidth: scaleIcon(92), paddingHorizontal: scaleIcon(12), paddingVertical: scaleIcon(8) }}
                            textStyle={{ fontSize: scaleFont(13) }}
                        />
                    </View>
                    <Text selectable style={foundation.typography.body}>
                        Choose a property to open its rooms, equipment, documents, requests, and service history.
                    </Text>
                    <ThemedButton
                        title="Add Property"
                        accessibilityLabel="Add another property to this HomeOS account"
                        testID="homeos-add-property"
                        variant="secondary"
                        onPress={() => router.push('/property/add' as never)}
                        style={{ alignSelf: 'flex-start', minHeight: scaleIcon(46), paddingHorizontal: scaleIcon(18) }}
                    />

                    {loading ? (
                        <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: scaleIcon(32) }} />
                    ) : (
                        <View testID="homeos-property-cards" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                            {(collection?.properties || []).map((property) => (
                                <MainDestinationCard
                                    key={property.propertyId}
                                    title={property.name}
                                    description={property.address || 'Verified property'}
                                    visual={{ source: require('../../../assets/homeos/destinations/home.png') }}
                                    fallbackIcon="🏠"
                                    visualContentFit="contain"
                                    actionLabel={property.isSelected ? 'Open selected property' : 'Open property'}
                                    accentColor={property.isSelected ? theme.colors.primary : undefined}
                                    disabled={Boolean(openingPropertyId)}
                                    accessibilityState={{ selected: property.isSelected, busy: openingPropertyId === property.propertyId }}
                                    onPress={() => void openProperty(property.propertyId)}
                                    accessibilityLabel={`Open ${property.name}${property.address ? ` at ${property.address}` : ''}`}
                                    style={{ width: propertyCardWidth, minWidth: propertyCardWidth, maxWidth: propertyCardWidth }}
                                />
                            ))}
                        </View>
                    )}
                </View>

                {!loading ? (
                    <View testID="homeos-property-workflow-cards" style={{ gap: foundation.spacing.compact }}>
                        <HomeOSStatusLegend />
                        <Text selectable style={foundation.typography.containerTitle}>Home activity</Text>
                        <Text selectable style={foundation.typography.body}>
                            Emergency updates remain in the request tracker. Open a card for the established workflow.
                        </Text>
                        <HomeownerActiveRequestStatus bottomOffset={0} presentation="inline" />
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                            {propertyLandingWorkflowDestinations.map((destination) => (
                                <MainDestinationCard
                                    key={destination.key}
                                    title={destination.title}
                                    description={destination.description}
                                    fallbackIcon={destination.icon}
                                    actionLabel="Open"
                                    size="compact"
                                    onPress={() => router.push(destination.route as never)}
                                    accessibilityLabel={destination.accessibilityLabel}
                                    style={{ width: activityCardWidth, minWidth: activityCardWidth, maxWidth: activityCardWidth }}
                                />
                            ))}
                        </View>
                    </View>
                ) : null}
                {!!message && (
                    <Text
                        selectable
                        accessibilityLiveRegion="polite"
                        style={{ color: theme.colors.danger, fontSize: scaleFont(14), marginTop: scaleIcon(8) }}
                    >
                        {message}
                    </Text>
                )}
            </View>
        </ScrollView>
    );
}
