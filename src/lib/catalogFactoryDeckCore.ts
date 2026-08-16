export type CatalogFactoryStarterMapping = {
    name: string;
    system: string;
    mappedVariantIds: readonly string[];
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
