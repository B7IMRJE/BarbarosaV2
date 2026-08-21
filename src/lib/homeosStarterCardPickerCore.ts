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

/**
 * Reconciles a saved root/container record with its one unambiguous Super
 * Admin Deck card. This gives older containers that predate permanent keys a
 * stable identity without modifying the saved customer record.
 */
export function homeOSStarterCardForInstalledContainer(
    cards: readonly HomeOSStarterCardChoice[],
    container: {
        starter_template_key?: string | null;
        name?: string | null;
    },
) {
    return starterCardForInstalledRecord(
        cards.filter((card) => card.presentationRole === 'container'),
        container,
    );
}

/**
 * Resolves any installed item to its one unambiguous canonical Deck card.
 * Detail routes use this for nested parents whose own presentation role is a
 * component rather than a top-level container.
 */
export function homeOSStarterCardForInstalledItem(
    cards: readonly HomeOSStarterCardChoice[],
    item: {
        starter_template_key?: string | null;
        name?: string | null;
    },
) {
    return starterCardForInstalledRecord(cards, item);
}

/**
 * Reconciles one saved legacy component with a compatible Super Admin Deck
 * card. Exact permanent keys win. Older shortened keys, names, or aliases are
 * accepted only when they identify exactly one descendant of the parent
 * container, so the UI never guesses between similar master cards.
 */
export function homeOSStarterCardForInstalledComponent(
    cards: readonly HomeOSStarterCardChoice[],
    containerTemplateKey: string | null | undefined,
    component: {
        starter_template_key?: string | null;
        name?: string | null;
    },
) {
    const candidates = homeOSStarterComponentCardsForContainer(cards, containerTemplateKey);
    return starterCardForInstalledRecord(candidates, component);
}

function starterCardForInstalledRecord(
    candidates: readonly HomeOSStarterCardChoice[],
    record: {
        starter_template_key?: string | null;
        name?: string | null;
    },
) {
    if (candidates.length === 0) return undefined;

    const explicitKey = normalizeTemplateKey(record.starter_template_key);
    const directMatch = explicitKey
        ? candidates.find((card) => normalizeTemplateKey(card.templateKey) === explicitKey)
        : undefined;
    if (directMatch) return directMatch;

    // A deliberately custom identity must remain custom. Only null or older
    // non-custom keys are eligible for compatibility reconciliation.
    if (explicitKey.startsWith('custom:')) return undefined;

    const observedIdentities = uniqueNormalized([
        record.name,
        explicitKey ? templateKeyTail(explicitKey) : '',
    ]);
    if (observedIdentities.length === 0) return undefined;

    const exactMatches = candidates.filter((card) => {
        const identities = starterCardIdentities(card);
        return observedIdentities.some((identity) => identities.includes(identity));
    });
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) return undefined;

    const containedMatches = candidates.filter((card) => {
        const identities = starterCardIdentities(card);
        return observedIdentities.some((observed) => observed.length >= 4 && identities.some((identity) =>
            ` ${identity} `.includes(` ${observed} `)
        ));
    });

    return containedMatches.length === 1 ? containedMatches[0] : undefined;
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

function starterCardIdentities(card: HomeOSStarterCardChoice) {
    return uniqueNormalized([
        card.templateKey,
        templateKeyTail(card.templateKey),
        card.name,
        ...card.aliases,
    ]);
}

function templateKeyTail(value: string) {
    const tail = value.split(':').pop() || value;
    return tail.replace(/[_-]+/g, ' ');
}

function uniqueNormalized(values: readonly (string | null | undefined)[]) {
    return [...new Set(values
        .map((value) => normalize(String(value || '')).replace(/\s+#?\d+$/, ''))
        .filter(Boolean))];
}
