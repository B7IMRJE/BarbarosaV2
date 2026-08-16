import type { ApprovedMasterCatalogItem } from './catalogFactory';
import type { EstimateOptionCategory } from './estimateOptions';

export type HomeItemCatalogContext = {
    name?: string | null;
    system?: string | null;
    category?: string | null;
    location?: string | null;
    parentArea?: string | null;
};

const AREA_TERMS = [
    'kitchen',
    'bathroom',
    'shower',
    'tub',
    'laundry',
    'garage',
    'outdoor',
    'exterior',
    'irrigation',
] as const;

const PRODUCT_CONCEPTS = [
    { key: 'faucet', terms: ['faucet', 'tap'] },
    { key: 'showerhead', terms: ['showerhead', 'shower head'] },
    { key: 'cartridge', terms: ['cartridge'] },
    { key: 'valve', terms: ['valve'] },
    { key: 'toilet', terms: ['toilet', 'commode'] },
    { key: 'water_heater', terms: ['water heater', 'tankless'] },
    { key: 'garbage_disposal', terms: ['garbage disposal', 'food waste disposer', 'disposal'] },
    { key: 'filtration', terms: ['filtration', 'water filter', 'water softener'] },
    { key: 'pump', terms: ['pump'] },
    { key: 'sink', terms: ['sink', 'basin'] },
    { key: 'drain', terms: ['drain', 'sewer'] },
] as const;

export function catalogProductName(item: ApprovedMasterCatalogItem) {
    const specificationName = typeof item.specifications.product_name === 'string'
        ? item.specifications.product_name.trim()
        : '';

    return specificationName
        || [item.brand, item.familyName, item.modelNumber].filter(Boolean).join(' ')
        || item.category
        || 'Catalog product';
}

export function filterCatalogItemsForHomeItem(
    items: ApprovedMasterCatalogItem[],
    context: HomeItemCatalogContext,
) {
    const contextText = normalizeText([
        context.name,
        context.category,
        context.system,
        context.location,
        context.parentArea,
    ].filter(Boolean).join(' '));
    const contextConcepts = productConceptKeys(contextText);
    const contextAreas = matchingTerms(contextText, AREA_TERMS);

    return items
        .filter((item) => item.entitled && item.offering?.active && item.offering.companyCatalogProductId)
        .map((item) => {
            const productText = normalizeText([
                catalogProductName(item),
                item.category,
                item.manufacturer,
                item.brand,
                item.familyName,
                item.modelNumber,
                item.description,
                ...Object.entries(item.specifications).flatMap(([key, value]) => [key, stringify(value)]),
            ].join(' '));
            const productConcepts = productConceptKeys(productText);
            const productAreas = matchingTerms(productText, AREA_TERMS);
            const conceptMatches = contextConcepts.filter((concept) => productConcepts.includes(concept));
            const areaMatches = contextAreas.filter((area) => productAreas.includes(area));

            if (contextConcepts.length > 0 && conceptMatches.length === 0) return null;
            if (contextAreas.length > 0 && productAreas.length > 0 && areaMatches.length === 0) return null;
            if (contextConcepts.length === 0 && contextAreas.length > 0 && areaMatches.length === 0) return null;

            return {
                item,
                score: conceptMatches.length * 10 + areaMatches.length * 4,
            };
        })
        .filter((entry): entry is { item: ApprovedMasterCatalogItem; score: number } => Boolean(entry))
        .sort((left, right) => (
            right.score - left.score
            || catalogProductName(left.item).localeCompare(catalogProductName(right.item))
        ))
        .map((entry) => entry.item);
}

export function estimateCategoryForHomeItemCatalog(
    context: HomeItemCatalogContext,
    item: ApprovedMasterCatalogItem,
): EstimateOptionCategory {
    const text = normalizeText([
        context.name,
        context.category,
        context.system,
        context.location,
        context.parentArea,
        item.category,
        catalogProductName(item),
    ].filter(Boolean).join(' '));

    if (text.includes('water heater') || text.includes('tankless')) return 'water_heater';
    if (text.includes('garbage disposal') || text.includes('disposer')) return 'garbage_disposal';
    if (text.includes('toilet') || text.includes('commode')) return 'toilet_replacement';
    if (text.includes('filtration') || text.includes('water filter') || text.includes('softener')) return 'water_filtration_replacement';
    if (text.includes('irrigation')) return 'irrigation_installation';
    if (text.includes('water main')) return 'water_main_replacement';
    if (text.includes('sewer')) return 'sewer_line_replacement';
    if (text.includes('gas line')) return 'gas_line_replacement';
    if (text.includes('valve')) return 'valve_replacement';

    return 'faucet_replacement';
}

function productConceptKeys(value: string) {
    return PRODUCT_CONCEPTS
        .filter((concept) => concept.terms.some((term) => includesTerm(value, term)))
        .map((concept) => concept.key);
}

function matchingTerms<T extends readonly string[]>(value: string, terms: T) {
    return terms.filter((term) => includesTerm(value, term));
}

function includesTerm(value: string, term: string) {
    return ` ${value} `.includes(` ${normalizeText(term)} `);
}

function stringify(value: unknown) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
