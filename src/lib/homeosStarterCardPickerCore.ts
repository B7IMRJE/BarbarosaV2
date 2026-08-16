import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';

export type HomeOSStarterCardGroup = {
    key: string;
    label: string;
    count: number;
};

export function homeOSStarterCardGroups(cards: readonly HomeOSStarterCardChoice[]): HomeOSStarterCardGroup[] {
    const counts = new Map<string, number>();
    for (const card of cards) {
        const key = normalize(card.roomKind);
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
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
        .filter((card) => groupKey === 'all' || normalize(card.roomKind) === normalize(groupKey))
        .filter((card) => !normalizedQuery || normalize([
            card.templateKey,
            card.shortCode,
            card.roomKind,
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

export function homeOSStarterCardGroupLabel(roomKind: string) {
    return metadataLabel(roomKind);
}

function metadataLabel(value: string) {
    return value.trim().replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalize(value: string) {
    return value.trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
