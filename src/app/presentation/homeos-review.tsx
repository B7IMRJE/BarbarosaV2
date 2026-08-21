import { useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import {
    AreaContainer,
    EquipmentContainer,
    HomeOSCardVisual,
    MainDestinationCard,
} from '../../components/homeos/HomeOSVisualFoundation';
import ThemedButton from '../../components/theme/ThemedButton';
import {
    HOME_OS_REVIEW_INITIAL_STATE,
    cardsForHomeOSReviewScope,
    homeOSReviewBackLabel,
    homeOSReviewWorkflowCards,
    selectedHomeOSReviewCard,
    transitionHomeOSReview,
    type HomeOSReviewAction,
    type HomeOSReviewCard,
    type HomeOSReviewState,
} from '../../lib/homeosReviewFlow';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

/**
 * Local, data-free visual review route. It deliberately uses production HomeOS
 * card components while avoiding authentication, network requests, and property data.
 */
export default function HomeOSReviewPresentation() {
    const [reviewState, setReviewState] = useState<HomeOSReviewState>(HOME_OS_REVIEW_INITIAL_STATE);
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { width: viewportWidth } = useWindowDimensions();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const gap = foundation.spacing.regular;
    const columns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: scaleIcon(220),
        gap,
        maximumColumns: 2,
    });
    const cardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns,
        gap,
        minimumItemWidth: scaleIcon(220),
        maximumItemWidth: scaleIcon(460),
    });

    function dispatch(action: HomeOSReviewAction) {
        setReviewState((current) => transitionHomeOSReview(current, action));
    }

    function renderReviewCard(card: HomeOSReviewCard, scope: 'interior' | 'exterior') {
        const sharedProps = {
            title: card.title,
            accessibilityLabel: card.accessibilityLabel,
            onPress: () => dispatch({ type: 'open_detail', scope, cardKey: card.key }),
            style: { width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth },
        };

        return card.kind === 'area'
            ? <AreaContainer key={card.key} {...sharedProps} />
            : <EquipmentContainer key={card.key} {...sharedProps} detail={card.detail} />;
    }

    const backLabel = homeOSReviewBackLabel(reviewState);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ alignItems: 'center', padding: foundation.spacing.comfortable, paddingBottom: scaleIcon(42) }}
        >
            <View style={{ width: '100%', maxWidth: 960, gap: foundation.spacing.regular }}>
                <Text selectable style={[foundation.typography.label, { color: theme.colors.mutedText }]}>LOCAL, DATA-FREE REVIEW</Text>
                {backLabel ? (
                    <ThemedButton
                        title={`‹ ${backLabel}`}
                        variant="secondary"
                        accessibilityLabel={backLabel}
                        testID="homeos-review-back"
                        onPress={() => dispatch({ type: 'back' })}
                        style={{ alignSelf: 'flex-start', minHeight: scaleIcon(48), paddingHorizontal: scaleIcon(16), paddingVertical: scaleIcon(10) }}
                        textStyle={{ fontSize: scaleFont(14) }}
                    />
                ) : null}

                {reviewState.level === 'landing' ? (
                    <LandingReview cardWidth={cardWidth} contentWidth={contentWidth} gap={gap} onOpenHome={() => dispatch({ type: 'open_home' })} />
                ) : null}

                {reviewState.level === 'home' ? (
                    <>
                        <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}>My Home</Text>
                        <Text selectable style={foundation.typography.body}>Choose Interior or Exterior to open that property-area deck.</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                            <MainDestinationCard
                                title="Interior"
                                description="Rooms and indoor areas"
                                fallbackIcon="🏠"
                                actionLabel="Open Interior"
                                accessibilityLabel="Open Interior review areas"
                                onPress={() => dispatch({ type: 'open_section', scope: 'interior' })}
                                style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                            />
                            <MainDestinationCard
                                title="Exterior"
                                description="Yards and outdoor areas"
                                fallbackIcon="🌳"
                                actionLabel="Open Exterior"
                                accessibilityLabel="Open Exterior review areas"
                                onPress={() => dispatch({ type: 'open_section', scope: 'exterior' })}
                                style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                            />
                        </View>
                    </>
                ) : null}

                {reviewState.level === 'section' ? (
                    <>
                        <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}>
                            {reviewState.scope === 'interior' ? 'Interior' : 'Exterior'}
                        </Text>
                        <Text selectable style={foundation.typography.body}>
                            {reviewState.scope === 'interior'
                                ? 'Select an indoor area or equipment card to open its data-free detail.'
                                : 'Select an outdoor area card to open its data-free detail.'}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                            {cardsForHomeOSReviewScope(reviewState.scope).map((card) => renderReviewCard(card, reviewState.scope))}
                        </View>
                    </>
                ) : null}

                {reviewState.level === 'detail' ? (
                    <DetailReview state={reviewState} />
                ) : null}
            </View>
        </ScrollView>
    );
}

function LandingReview({
    cardWidth,
    contentWidth,
    gap,
    onOpenHome,
}: {
    cardWidth: number;
    contentWidth: number;
    gap: number;
    onOpenHome: () => void;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const primaryWidth = Math.min(contentWidth, scaleIcon(640));

    return (
        <>
            <View style={[foundation.surface, { minHeight: scaleIcon(156), padding: foundation.spacing.comfortable, overflow: 'hidden', justifyContent: 'center' }]}>
                <Text pointerEvents="none" accessible={false} style={{ position: 'absolute', right: foundation.spacing.regular, bottom: scaleIcon(-10), fontSize: scaleIcon(112), opacity: 0.16 }}>🏠</Text>
                <View style={{ maxWidth: '78%', gap: foundation.spacing.compact }}>
                    <Text selectable style={[foundation.typography.label, { color: theme.colors.primary, textTransform: 'uppercase' }]}>Your Property</Text>
                    <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30), lineHeight: scaleFont(36) }]}>Oak Street Home</Text>
                    <Text selectable style={foundation.typography.body}>100 Oak Street, Austin, TX</Text>
                </View>
            </View>

            <MainDestinationCard
                title="My Home"
                description="Rooms, indoor areas, and everything outside your home."
                visual={{ source: require('../../../assets/homeos/destinations/home.png') }}
                fallbackIcon="🏠"
                visualContentFit="contain"
                actionLabel="Open My Home"
                accessibilityLabel="Review My Home card"
                onPress={onOpenHome}
                style={{ width: primaryWidth, minWidth: primaryWidth, maxWidth: primaryWidth }}
            />

            <View style={{ gap: foundation.spacing.compact }}>
                <Text selectable style={foundation.typography.containerTitle}>Home activity</Text>
                <Text selectable style={foundation.typography.body}>These workflow cards are intentionally read-only in this data-free review.</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                    {homeOSReviewWorkflowCards.map((card) => (
                        <MainDestinationCard
                            key={card.key}
                            title={card.title}
                            description={card.description}
                            fallbackIcon={card.fallbackIcon}
                            accessibilityLabel={`${card.title} data-free preview only`}
                            style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                        />
                    ))}
                </View>
            </View>
        </>
    );
}

function DetailReview({ state }: { state: Extract<HomeOSReviewState, { level: 'detail' }> }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const card = selectedHomeOSReviewCard(state);

    if (!card) return null;

    return (
        <View style={{ gap: foundation.spacing.regular }}>
            <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}>{card.title}</Text>
            <View style={[foundation.surface, { padding: foundation.spacing.regular, gap: foundation.spacing.regular, maxWidth: scaleIcon(640) }]}>
                <HomeOSCardVisual label={card.title} fallbackContext={card.kind === 'area' ? 'area' : 'equipment'} size="destination" />
                <Text selectable style={foundation.typography.containerTitle}>{card.kind === 'area' ? 'Area detail review' : 'Equipment detail review'}</Text>
                <Text selectable style={foundation.typography.body}>
                    This is a data-free interaction state. The signed-in product opens the existing property record and preserves its photos, history, documents, and item identity.
                </Text>
            </View>
        </View>
    );
}
