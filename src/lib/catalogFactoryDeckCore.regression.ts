import {
    catalogFactoryDeckFilterOptions,
    catalogFactoryStarterOptionsLabel,
    filterAndSortCatalogFactoryDeckCards,
    filterUnmappedCatalogFactoryRecords,
} from './catalogFactoryDeckCore';

const showerTub = {
    name: 'Tub & Shower Trim',
    system: 'Plumbing',
    mappedVariantIds: ['moen-chateau'],
};
const records = [
    { id: 'moen-chateau', name: 'Moen Chateau' },
    { id: 'unmapped-faucet', name: 'Unmapped Faucet' },
];

assert(
    catalogFactoryStarterOptionsLabel(showerTub) === 'Options for Tub & Shower Trim Plumbing',
    'The deck must label Moen Chateau under exposed Tub & Shower Trim rather than concealed Shower Valve.',
);
assert(
    filterUnmappedCatalogFactoryRecords(records, [showerTub]).map((record) => record.id).join(',') === 'unmapped-faucet',
    'A mapped real product must appear inside its starter card and not as a loose card in the lower overview list.',
);

const workCards = [
    deckCard('bathroom:shower_tub', 'bathroom', 'Shower / Tub', null, ['Shower', 'Tub'], 'ready', 40),
    deckCard('bathroom:shower_valve', 'bathroom', 'Shower Valve', 'bathroom:shower_tub', [], 'building', 120),
    deckCard('kitchen:kitchen_sink', 'kitchen', 'Kitchen Sink', null, ['Sink'], 'unbuilt', 10),
    deckCard('garage:water_heater', 'garage', 'Water Heater', null, [], 'ready', 10),
    deckCard('pool:pool_pump', 'pool', 'Pool Pump', null, ['Circulation Pump'], 'unbuilt', 10),
    {
        ...deckCard('whole_home:smart_water_shutoff', 'whole_home', 'Smart Water Shutoff', null, ['Smart Water Monitor and Shutoff', 'Automatic Smart Water Shutoff'], 'building', 10),
        catalogCategories: ['Smart Water Shutoff And Leak Detection'],
    },
];
const filterOptions = catalogFactoryDeckFilterOptions(workCards);

assert(filterOptions.some((option) => option.key === 'area:pool' && option.label === 'Pool'), 'Future area filters must be derived from metadata without screen changes.');
assert(filterOptions.some((option) => option.key === 'area:whole home' && option.label === 'Whole Home'), 'Location-neutral equipment must have an intuitive Whole Home deck-group filter.');
assert(filterOptions.some((option) => option.key === 'category:smart water shutoff and leak detection' && option.label === 'Smart Water Shutoff And Leak Detection'), 'Mapped product categories must become selectable Deck filters.');
assert(filterOptions.some((option) => option.key === 'family:bathroom:shower_tub' && option.label === 'Shower'), 'The Shower family filter must be derived from the starter parent taxonomy.');
assert(filterAndSortCatalogFactoryDeckCards(workCards, 'shower', 'all').map((card) => card.name).join(',') === 'Shower Valve,Shower / Tub', 'Search must include aliases and parent metadata while keeping in-progress work ahead of completed work.');
assert(filterAndSortCatalogFactoryDeckCards(workCards, '', 'family:bathroom:shower_tub').map((card) => card.name).join(',') === 'Shower Valve,Shower / Tub', 'A family filter must include both the generic parent and its nested starter parts.');
assert(filterAndSortCatalogFactoryDeckCards(workCards, '', 'all').at(-1)?.readinessStatus === 'ready', 'Completed starter cards must sort behind unfinished work.');
for (const query of ['smart', 'water', 'shutoff']) {
    assert(filterAndSortCatalogFactoryDeckCards(workCards, query, 'all').some((card) => card.templateKey === 'whole_home:smart_water_shutoff'), `Deck search for “${query}” must find the location-neutral Smart Water Shutoff archetype.`);
}
assert(filterAndSortCatalogFactoryDeckCards(workCards, '', 'category:smart water shutoff and leak detection').map((card) => card.templateKey).join(',') === 'whole_home:smart_water_shutoff', 'The mapped Smart Water Shutoff category filter must select its parent archetype.');

console.log('Catalog Factory deck presentation regression checks passed.');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function deckCard(templateKey: string, roomKind: string, name: string, parentTemplateKey: string | null, aliases: string[], readinessStatus: string, displayOrder: number) {
    return {
        templateKey,
        roomKind,
        name,
        system: 'Plumbing',
        category: 'Component',
        parentTemplateKey,
        aliases,
        displayOrder,
        readinessStatus,
        mappedVariantIds: [],
    };
}
