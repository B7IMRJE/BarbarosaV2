import { homeOSStarterCardForInstalledContainer } from './homeosStarterCardPickerCore';
import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';
import { filterHomeOSContainerStarterCardChoices, type PropertyAreaContainerContext } from './propertyAreaContainerDeck';

export function isOutdoorCardArea(areaName: string) {
    return /^(front yard|back yard|backyard|side yard|patio|outdoor mechanical)$/i.test(areaName.trim());
}

/** Available archetypes are separate from recorded equipment; this never seeds rows. */
export function availableOutdoorHomeCards(
    cards: readonly HomeOSStarterCardChoice[],
    items: readonly { name?: string | null; starter_template_key?: string | null }[],
    context: PropertyAreaContainerContext,
) {
    if (!isOutdoorCardArea(context.areaName)) return [];
    const choices = filterHomeOSContainerStarterCardChoices(cards, {
        ...context, areaName: /^backyard$/i.test(context.areaName.trim()) ? 'Back Yard' : context.areaName,
    }).filter((card) =>
        card.templateKey.startsWith('exterior:') || card.templateKey === 'garage:whole_home_filter');
    const recorded = new Set(items.map((item) => homeOSStarterCardForInstalledContainer(choices, item)?.templateKey));
    return choices.filter((card) => !recorded.has(card.templateKey))
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}
