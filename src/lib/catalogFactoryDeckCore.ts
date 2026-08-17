export type CatalogFactoryStarterMapping = {
    name: string;
    system: string;
    mappedVariantIds: readonly string[];
};

export type CatalogFactoryDeckWorkCard = CatalogFactoryStarterMapping & {
    templateKey: string;
    shortCode?: string;
    roomKind: string;
    placementTags?: readonly string[];
    category: string;
    parentTemplateKey: string | null;
    aliases: readonly string[];
    displayOrder: number;
    readinessStatus: string;
    /** Human-readable categories from real products mapped to this archetype. */
    catalogCategories?: readonly string[];
};

export type CatalogFactoryDeckFilterKind = 'area' | 'family' | 'system' | 'category' | 'readiness';

export type CatalogFactoryDeckFilterOption = {
    key: string;
    label: string;
    kind: CatalogFactoryDeckFilterKind;
    count: number;
};

export function catalogFactoryMappedVariantIds(cards: readonly CatalogFactoryStarterMapping[]) {
    return new Set(cards.flatMap((card) => card.mappedVariantIds));
}

export function filterUnmappedCatalogFactoryRecords<T extends { id: string }>(
    records: readonly T[],
    cards: readonly CatalogFactoryStarterMapping[],
) {
    const mappedVariantIds = catalogFactoryMappedVariantIds(cards);
    return records.filter((record) => !mappedVariantIds.has(record.id));
}

export function catalogFactoryStarterOptionsLabel(card: Pick<CatalogFactoryStarterMapping, 'name' | 'system'>) {
    return `Options for ${card.name} ${card.system}`.replace(/\s+/g, ' ').trim();
}

export function catalogFactoryDeckFilterOptions(cards: readonly CatalogFactoryDeckWorkCard[]) {
    const options: CatalogFactoryDeckFilterOption[] = [];
    const facets: { kind: Exclude<CatalogFactoryDeckFilterKind, 'family'>; values: (card: CatalogFactoryDeckWorkCard) => readonly string[] }[] = [
        { kind: 'area', values: (card) => [card.roomKind, ...(card.placementTags || [])] },
        { kind: 'system', values: (card) => [card.system] },
        { kind: 'category', values: (card) => [card.category, ...(card.catalogCategories || [])] },
        { kind: 'readiness', values: (card) => [card.readinessStatus] },
    ];

    for (const facet of facets) {
        const values = uniqueMetadata(cards.flatMap((card) => facet.values(card)));
        for (const value of values) {
            options.push({
                key: `${facet.kind}:${normalizeDeckTerm(value)}`,
                label: facet.kind === 'system' ? value : metadataLabel(value),
                kind: facet.kind,
                count: cards.filter((card) => facet.values(card).some((candidate) => normalizeDeckTerm(candidate) === normalizeDeckTerm(value))).length,
            });
        }
    }

    const parentKeys = new Set(cards.map((card) => card.parentTemplateKey).filter((value): value is string => Boolean(value)));
    for (const parent of cards.filter((card) => parentKeys.has(card.templateKey))) {
        const count = cards.filter((card) => card.templateKey === parent.templateKey || deckCardBelongsToFamily(card, parent.templateKey, cards)).length;
        options.push({
            key: `family:${parent.templateKey}`,
            label: familyFilterLabel(parent),
            kind: 'family',
            count,
        });
    }

    const order: Record<CatalogFactoryDeckFilterKind, number> = { area: 0, family: 1, system: 2, category: 3, readiness: 4 };
    return options.sort((left, right) => order[left.kind] - order[right.kind] || left.label.localeCompare(right.label));
}

export function filterAndSortCatalogFactoryDeckCards<T extends CatalogFactoryDeckWorkCard>(
    cards: readonly T[],
    query: string,
    filterKey: string,
): T[] {
    const normalizedQuery = normalizeDeckTerm(query);
    const option = catalogFactoryDeckFilterOptions(cards).find((candidate) => candidate.key === filterKey);
    const parents = new Map(cards.map((card) => [card.templateKey, card]));

    return cards
        .filter((card) => {
            if (normalizedQuery && !deckCardSearchText(card, parents).includes(normalizedQuery)) return false;
            if (!option) return true;
            if (option.kind === 'family') {
                const familyKey = option.key.slice('family:'.length);
                return card.templateKey === familyKey || deckCardBelongsToFamily(card, familyKey, cards);
            }
            return deckCardFacetValues(card, option.kind)
                .some((value) => `${option.kind}:${normalizeDeckTerm(value)}` === option.key);
        })
        .sort((left, right) => readinessWeight(left.readinessStatus) - readinessWeight(right.readinessStatus)
            || left.roomKind.localeCompare(right.roomKind)
            || left.displayOrder - right.displayOrder
            || left.name.localeCompare(right.name));
}

export function catalogFactoryDeckGroupLabel(value: string) {
    return metadataLabel(value);
}

function deckCardSearchText(card: CatalogFactoryDeckWorkCard, parents: ReadonlyMap<string, CatalogFactoryDeckWorkCard>) {
    const parent = card.parentTemplateKey ? parents.get(card.parentTemplateKey) : null;
    return normalizeDeckTerm([
        card.templateKey,
        card.shortCode || '',
        card.roomKind,
        ...(card.placementTags || []),
        card.name,
        card.system,
        card.category,
        ...(card.catalogCategories || []),
        card.readinessStatus,
        ...card.aliases,
        parent?.name || '',
        ...(parent?.aliases || []),
    ].join(' '));
}

function deckCardFacetValues(card: CatalogFactoryDeckWorkCard, kind: Exclude<CatalogFactoryDeckFilterKind, 'family'>) {
    if (kind === 'area') return [card.roomKind, ...(card.placementTags || [])];
    if (kind === 'system') return [card.system];
    if (kind === 'category') return [card.category, ...(card.catalogCategories || [])];
    return [card.readinessStatus];
}

function deckCardBelongsToFamily(card: CatalogFactoryDeckWorkCard, familyKey: string, cards: readonly CatalogFactoryDeckWorkCard[]) {
    const parents = new Map(cards.map((candidate) => [candidate.templateKey, candidate.parentTemplateKey]));
    let parentKey = card.parentTemplateKey;
    const visited = new Set<string>();
    while (parentKey && !visited.has(parentKey)) {
        if (parentKey === familyKey) return true;
        visited.add(parentKey);
        parentKey = parents.get(parentKey) || null;
    }
    return false;
}

function familyFilterLabel(card: CatalogFactoryDeckWorkCard) {
    const firstSegment = card.name.split(/\s+(?:\/|&|and)\s+/i)[0]?.trim();
    return firstSegment || card.name;
}

function readinessWeight(value: string) {
    if (normalizeDeckTerm(value) === 'building') return 0;
    if (normalizeDeckTerm(value) === 'ready') return 2;
    return 1;
}

function uniqueMetadata(values: readonly string[]) {
    const unique = new Map<string, string>();
    for (const value of values) {
        const normalized = normalizeDeckTerm(value);
        if (normalized && !unique.has(normalized)) unique.set(normalized, value.trim());
    }
    return [...unique.values()];
}

function metadataLabel(value: string) {
    return value.trim().replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeDeckTerm(value: string) {
    return value.trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
