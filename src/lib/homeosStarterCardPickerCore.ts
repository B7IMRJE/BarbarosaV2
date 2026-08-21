import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';

export type HomeOSStarterCardGroup = {
    key: string;
    label: string;
    count: number;
};

export function homeOSStarterCardGroups(cards: readonly HomeOSStarterCardChoice[]): HomeOSStarterCardGroup[] {
    const counts = new Map<string, number>();
    for (const card of cards) {
        const keys = new Set([card.roomKind, ...(card.placementTags || [])].map(normalize).filter(Boolean));
        for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
        .map(([key, count]) => ({ key, label: metadataLabel(key), count }))
        .sort((left, right) => left.label.localeCompare(right.label));
}

export function filterHomeOSStarterCardChoices(
    cards: readonly HomeOSStarterCardChoice[],
    query: string,
    groupKey = 'all',
) {
    const normalizedQuery = normalize(query);
    const parentNames = new Map(cards.map((card) => [card.templateKey, card.name]));

    return cards
        .filter((card) => groupKey === 'all' || [card.roomKind, ...(card.placementTags || [])].some((value) => normalize(value) === normalize(groupKey)))
        .filter((card) => !normalizedQuery || normalize([
            card.templateKey,
            card.shortCode,
            card.roomKind,
            ...(card.placementTags || []),
            card.name,
            card.system,
            card.category,
            ...card.aliases,
            card.parentTemplateKey ? parentNames.get(card.parentTemplateKey) || '' : '',
        ].join(' ')).includes(normalizedQuery))
        .sort((left, right) => left.roomKind.localeCompare(right.roomKind)
            || left.displayOrder - right.displayOrder
            || left.name.localeCompare(right.name));
}

/**
 * Returns the canonical Component Card descendants of one Super Admin Deck
 * container. Nested assemblies are included so a container such as Kitchen
 * Counter can expose its RO system and the RO system's service parts.
 */
export function homeOSStarterComponentCardsForContainer(
    cards: readonly HomeOSStarterCardChoice[],
    containerTemplateKey?: string | null,
) {
    const rootKey = normalizeTemplateKey(containerTemplateKey);
    if (!rootKey) return [];

    const childrenByParent = new Map<string, HomeOSStarterCardChoice[]>();
    for (const card of cards) {
        const parentKey = normalizeTemplateKey(card.parentTemplateKey);
        if (!parentKey) continue;
        const children = childrenByParent.get(parentKey) || [];
        children.push(card);
        childrenByParent.set(parentKey, children);
    }

    const results: HomeOSStarterCardChoice[] = [];
    const visited = new Set<string>([rootKey]);
    const queue = [...(childrenByParent.get(rootKey) || [])];

    while (queue.length > 0) {
        const card = queue.shift()!;
        const cardKey = normalizeTemplateKey(card.templateKey);
        if (!cardKey || visited.has(cardKey)) continue;
        visited.add(cardKey);

        if (card.presentationRole !== 'container') results.push(card);
        queue.push(...(childrenByParent.get(cardKey) || []));
    }

    return results.sort((left, right) => left.displayOrder - right.displayOrder
        || left.name.localeCompare(right.name));
}

export function homeOSStarterCardGroupLabel(roomKind: string) {
    return metadataLabel(roomKind);
}

function metadataLabel(value: string) {
    return value.trim().replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalize(value: string) {
    return value.trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeTemplateKey(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
