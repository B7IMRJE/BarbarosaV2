import { router } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { MainDestinationCard } from '../../components/homeos/HomeOSVisualFoundation';
import ThemedButton from '../../components/theme/ThemedButton';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { myHomeAreaDestinations } from '../../lib/propertyLandingNavigation';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

/** Property-area chooser. Area decks stay hidden until the homeowner selects a scope. */
export default function MyHomeScreen() {
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
                    title="‹ Back to Property"
                    variant="secondary"
                    accessibilityLabel="Back to Property"
                    onPress={() => router.replace('/' as never)}
                    style={{ alignSelf: 'flex-start' }}
                />
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
                            onPress={() => router.push(destination.route as never)}
                            accessibilityLabel={destination.accessibilityLabel}
                            style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                        />
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
