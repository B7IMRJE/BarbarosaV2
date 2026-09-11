import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { HomeOSStarterCardChoice } from '../../lib/homeosStarterCatalog';
import { availableOutdoorHomeCards } from '../../lib/outdoorHomeCards';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../theme/ThemedButton';
import { EquipmentContainer } from './HomeOSVisualFoundation';

export default function OutdoorCardChoices({
    cards, items, areaName, parentAreaName, cardWidth, onChoose,
}: {
    cards: readonly HomeOSStarterCardChoice[];
    items: readonly { name?: string | null; starter_template_key?: string | null }[];
    areaName: string;
    parentAreaName?: string;
    cardWidth: number;
    onChoose: (card: HomeOSStarterCardChoice) => void;
}) {
    const { theme, scaleFont, scaleIcon } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const [expanded, setExpanded] = useState(false);
    const choices = useMemo(() => availableOutdoorHomeCards(cards, items, { areaName, parentAreaName }),
        [cards, items, areaName, parentAreaName]);
    if (!choices.length) return null;

    return (
        <View style={{ gap: foundation.spacing.regular }}>
            <Text style={foundation.typography.containerTitle}>More cards for {areaName}</Text>
            <Text style={foundation.typography.body}>
                Choose what is at your home. You can add details and photos after selecting a card.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: foundation.grid.gap }}>
                {(expanded ? choices : choices.slice(0, 6)).map((card) => (
                    <EquipmentContainer
                        key={card.templateKey}
                        title={card.name}
                        semanticIdentity={card.templateKey}
                        detail="Available to add"
                        accessibilityLabel={`Add ${card.name} to ${areaName}`}
                        onPress={() => onChoose(card)}
                        style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                    />
                ))}
            </View>
            {choices.length > 6 && (
                <ThemedButton
                    title={expanded ? 'Show fewer cards' : `See all ${choices.length} available cards`}
                    variant="secondary"
                    onPress={() => setExpanded(!expanded)}
                    style={{ alignSelf: 'flex-start' }}
                />
            )}
        </View>
    );
}
