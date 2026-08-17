import type { CatalogFactoryRecord } from './catalogFactory';
import type { CatalogTemplateDefinition } from './catalogFactoryCore';
import type { HomeOSStarterDeckCard } from './homeosStarterCatalog';

export type CatalogSuggestionOption = {
    value: string;
    label: string;
    description?: string;
    searchText?: string;
    addNewValue?: string;
};

export type CatalogQuickStartTier = 'Entry / retrofit' | 'Mid tier' | 'Premium';

export type CatalogQuickStartSuggestion = {
    id: string;
    groupId: string;
    starterTemplateKey: string;
    productName: string;
    tier: CatalogQuickStartTier;
    fitSummary: string;
    retailerName: string;
    retailerUrl: string;
    verifiedOn: string;
    authoringFacts: Record<string, string>;
    seed: {
        category: string;
        manufacturer: string;
        brand: string;
        family_name: string;
        model_number: string;
        manufacturer_part_number: string;
        finish: string;
        description: string;
        specifications: Record<string, string>;
        sources: Record<string, string | number>[];
        confidence: string;
    };
};

export type CatalogQuickStartGroup = {
    id: string;
    label: string;
    archetypeTerms: string[];
    requiredFacts: string[];
    authoringNote: string;
};

type BrandIntent = 'fixture' | 'stop_supply' | 'ball_valve' | 'repair' | 'tank_water_heater' | 'tankless_water_heater' | 'general';

type CuratedBrand = {
    name: string;
    intents: BrandIntent[];
};

// This is a practical authoring vocabulary, not a claim that every retailer
// carries every brand. It stores no per-retailer availability assertion;
// exact product suggestions still require their own current model-specific source.
const CURATED_PLUMBING_BRANDS: CuratedBrand[] = [
    ...['Moen', 'Kohler', 'Delta', 'American Standard', 'Pfister', 'Grohe', 'Hansgrohe', 'Brizo', 'Toto', 'Gerber', 'Symmons', 'Rohl']
        .map((name) => ({ name, intents: ['fixture', 'general'] as BrandIntent[] })),
    { name: 'BrassCraft', intents: ['stop_supply', 'ball_valve', 'general'] },
    { name: 'Dahl', intents: ['stop_supply', 'ball_valve', 'general'] },
    { name: 'SharkBite', intents: ['stop_supply', 'ball_valve', 'general'] },
    { name: 'Everbilt', intents: ['stop_supply', 'ball_valve', 'general'] },
    { name: 'Apollo', intents: ['ball_valve', 'general'] },
    { name: 'NIBCO', intents: ['ball_valve', 'general'] },
    { name: 'Watts', intents: ['ball_valve', 'general'] },
    { name: 'Zurn', intents: ['ball_valve', 'repair', 'general'] },
    { name: 'Webstone', intents: ['ball_valve', 'general'] },
    { name: 'Sioux Chief', intents: ['stop_supply', 'repair', 'general'] },
    { name: 'Legend Valve', intents: ['ball_valve', 'general'] },
    { name: 'Matco-Norca', intents: ['ball_valve', 'stop_supply', 'general'] },
    { name: 'Danco', intents: ['repair', 'general'] },
    { name: 'Peerless', intents: ['fixture', 'repair', 'general'] },
    { name: 'Glacier Bay', intents: ['fixture', 'repair', 'general'] },
    { name: 'Westbrass', intents: ['fixture', 'repair', 'general'] },
    ...['Bradford White', 'A. O. Smith', 'Rheem']
        .map((name) => ({ name, intents: ['tank_water_heater', 'general'] as BrandIntent[] })),
    ...['Navien', 'Noritz', 'Rinnai']
        .map((name) => ({ name, intents: ['tankless_water_heater', 'general'] as BrandIntent[] })),
];

const INTENT_PRIORITY: Record<BrandIntent, string[]> = {
    fixture: ['Moen', 'Delta', 'Kohler', 'American Standard', 'Pfister', 'Grohe', 'Hansgrohe', 'Brizo', 'Toto', 'Gerber', 'Symmons', 'Rohl'],
    stop_supply: ['BrassCraft', 'Dahl', 'SharkBite', 'Everbilt', 'Sioux Chief', 'Matco-Norca'],
    ball_valve: ['NIBCO', 'Apollo', 'Watts', 'Legend Valve', 'Webstone', 'Dahl', 'BrassCraft', 'SharkBite'],
    repair: ['Danco', 'Peerless', 'Glacier Bay', 'Westbrass', 'Zurn', 'Sioux Chief'],
    tank_water_heater: ['Bradford White', 'A. O. Smith', 'Rheem'],
    tankless_water_heater: ['Navien', 'Noritz', 'Rinnai'],
    general: [],
};

const HOME_DEPOT = 'Home Depot';
const VERIFIED_ON = '2026-08-15';

export const CATALOG_QUICK_START_GROUPS: CatalogQuickStartGroup[] = [
    group('shower_tub', 'Shower Trim & Valve Packages', ['shower trim', 'tub shower trim', 'shower valve', 'rough in valve', 'shower cartridge'], ['installation_category', 'size_capacity', 'fuel_energy_source', 'connection_type', 'flow_pressure', 'compatibility_required_parts', 'retail_source_reference'], 'Exact exposed trim, tub-spout configuration, and concealed rough-in contents must be explicit.'),
    group('water_heater', 'Water Heater', ['water heater'], ['installation_category', 'size_capacity', 'fuel_energy_source', 'connection_type', 'flow_pressure', 'compatibility_required_parts', 'retail_source_reference'], 'Rheem entry, A. O. Smith mid, and Bradford White premium are user-defined selling tiers, not objective quality rankings. Exact sourced models are still required.'),
    group('tankless_water_heater', 'Tankless Water Heater', ['tankless water heater'], ['installation_category', 'size_capacity', 'fuel_energy_source', 'connection_type', 'flow_pressure', 'compatibility_required_parts', 'retail_source_reference'], 'Navien and Noritz are planned premium alternatives; no product appears until an exact sourced model is verified.'),
    group('smart_water_monitor', 'Smart Water Monitor & Shutoff', ['smart water monitor', 'automatic shutoff', 'whole home shutoff'], ['installation_category', 'size_capacity', 'fuel_energy_source', 'connection_type', 'flow_pressure', 'compatibility_required_parts', 'retail_source_reference'], 'Flo by Moen is planned; pipe size, power, connectivity, and shutoff compatibility must be exact.'),
    group('expansion_tank', 'Thermal Expansion Tank', ['expansion tank'], ['installation_category', 'tank_size_class', 'water_heater_capacity', 'incoming_pressure', 'pressure_setpoint', 'connection_type', 'compatibility_required_parts', 'retail_source_reference'], 'The common 2-gallon and 4.5/5-gallon classes are not interchangeable. Capacity, incoming pressure, and setpoint are required before draft creation.'),
    group('water_heater_straps', 'Water Heater Safety Straps', ['water heater strap', 'safety strap'], ['installation_category', 'size_capacity', 'connection_type', 'compatibility_required_parts', 'retail_source_reference'], 'Tank diameter, wall construction, local requirements, and included hardware must be verified.'),
    group('tpr_valve', 'T&P Relief Valve', ['tpr valve', 't p valve', 'temperature pressure relief'], ['installation_category', 'size_capacity', 'connection_type', 'flow_pressure', 'compatibility_required_parts', 'retail_source_reference'], 'Connection, temperature/pressure rating, capacity, and heater compatibility must be exact.'),
    group('anode_rod', 'Anode Rod', ['anode rod'], ['installation_category', 'size_capacity', 'connection_type', 'compatibility_required_parts', 'retail_source_reference'], 'Material, length, thread, segmented/solid construction, and heater compatibility must be exact.'),
    group('delta_faucets_parts', 'Delta Faucets & Cartridges', ['faucet', 'cartridge'], ['installation_category', 'size_capacity', 'connection_type', 'flow_pressure', 'compatibility_required_parts', 'retail_source_reference'], 'Exact faucet or cartridge model and compatible Delta platform are required.'),
    group('kohler_products', 'Kohler Products', ['faucet', 'toilet', 'shower', 'sink'], ['installation_category', 'size_capacity', 'connection_type', 'flow_pressure', 'compatibility_required_parts', 'retail_source_reference'], 'Exact model, application, and required companion parts are required.'),
    group('brasscraft_stops_supply', 'BrassCraft Stops & Supply', ['angle stop', 'supply line', 'shutoff'], ['installation_category', 'size_capacity', 'connection_type', 'flow_pressure', 'compatibility_required_parts', 'retail_source_reference'], 'Inlet/outlet size, material, connection standard, and application must be exact.'),
    group('ball_valves', 'Ball Valves', ['ball valve', 'shutoff valve', 'isolation valve'], ['installation_category', 'size_capacity', 'connection_type', 'flow_pressure', 'compatibility_required_parts', 'retail_source_reference'], 'Exact valve brand/model, port type, pressure/temperature rating, material, and connection standard are required.'),
];

export const CATALOG_QUICK_START_SUGGESTIONS: CatalogQuickStartSuggestion[] = [
    {
        id: 'moen-chateau-181119-trim-only',
        groupId: 'shower_tub',
        starterTemplateKey: 'bathroom:shower_trim',
        productName: 'Moen Chateau Lever Posi-Temp Shower Valve Trim',
        tier: 'Entry / retrofit',
        fitSummary: 'Chrome trim only. Requires an existing compatible Moen Posi-Temp rough-in valve.',
        retailerName: HOME_DEPOT,
        retailerUrl: 'https://www.homedepot.com/p/316606664',
        verifiedOn: VERIFIED_ON,
        authoringFacts: {
            installation_category: 'Shower valve trim retrofit',
            size_capacity: 'Valve trim; no storage capacity',
            fuel_energy_source: 'Not applicable',
            connection_type: 'Requires existing compatible Moen Posi-Temp rough-in valve',
            flow_pressure: 'Posi-Temp pressure-balancing control; trim does not define outlet flow',
            compatibility_required_parts: 'Compatible Moen Posi-Temp rough-in valve required; not included',
            retail_source_reference: 'https://www.homedepot.com/p/316606664',
        },
        seed: {
            category: 'shower_valve',
            manufacturer: 'Moen',
            brand: 'Moen',
            family_name: 'Chateau',
            model_number: '181119',
            manufacturer_part_number: '181119',
            finish: 'Chrome',
            description: 'Chateau lever Posi-Temp shower valve trim kit in Chrome. Trim only; a compatible Moen Posi-Temp rough-in valve is required and is not included.',
            specifications: {
                valve_type: 'Moen Posi-Temp pressure-balancing trim',
                connection_size: 'Compatible existing Moen Posi-Temp rough-in valve required',
                trim_included: 'Yes',
                rough_in_valve_included: 'No',
                application: 'Trim retrofit / replacement',
            },
            sources: [retailerSource(HOME_DEPOT, 'Moen Chateau 181119 official retailer listing', 'https://www.homedepot.com/p/316606664')],
            confidence: '0.98',
        },
    },
    {
        id: 'moen-brantford-t2151bn-2510-bundle',
        groupId: 'shower_tub',
        starterTemplateKey: 'bathroom:shower_trim',
        productName: 'Moen Brantford Posi-Temp Trim + Rough-In Valve',
        tier: 'Mid tier',
        fitSummary: 'Brushed Nickel trim plus Moen 2510 brass 1/2 in. IPS rough-in valve.',
        retailerName: HOME_DEPOT,
        retailerUrl: 'https://www.homedepot.com/p/sets/338530447',
        verifiedOn: VERIFIED_ON,
        authoringFacts: {
            installation_category: 'Tub/shower valve trim plus rough-in',
            size_capacity: 'Valve and trim; no storage capacity',
            fuel_energy_source: 'Not applicable',
            connection_type: '1/2 in. IPS',
            flow_pressure: 'Posi-Temp pressure-balancing cycling valve',
            compatibility_required_parts: 'T2151BN trim paired with Moen 2510 rough-in valve',
            retail_source_reference: 'https://www.homedepot.com/p/sets/338530447',
        },
        seed: {
            category: 'shower_valve',
            manufacturer: 'Moen',
            brand: 'Moen',
            family_name: 'Brantford',
            model_number: 'T2151BN + 2510',
            manufacturer_part_number: 'T2151BN + 2510',
            finish: 'Brushed Nickel',
            description: 'Brantford single-handle Posi-Temp valve trim in Brushed Nickel bundled with a Moen 2510 brass pressure-balancing tub/shower rough-in valve with 1/2 in. IPS connections.',
            specifications: {
                valve_type: 'Moen Posi-Temp pressure-balancing cycling tub/shower valve',
                connection_size: '1/2 in. IPS',
                trim_included: 'Yes (T2151BN)',
                rough_in_valve_included: 'Yes (2510)',
                bundle_component_models: 'T2151BN trim + 2510 rough-in valve',
            },
            sources: [retailerSource(HOME_DEPOT, 'Moen Brantford trim and 1/2 in. IPS rough-in valve retailer bundle', 'https://www.homedepot.com/p/sets/338530447')],
            confidence: '0.98',
        },
    },
    {
        id: 'moen-align-t2191bg-2510-bundle',
        groupId: 'shower_tub',
        starterTemplateKey: 'bathroom:shower_trim',
        productName: 'Moen Align Posi-Temp Brushed Gold Trim + Rough-In Valve',
        tier: 'Premium',
        fitSummary: 'Brushed Gold trim plus Moen 2510 brass 1/2 in. IPS rough-in valve.',
        retailerName: HOME_DEPOT,
        retailerUrl: 'https://www.homedepot.com/p/sets/338530413',
        verifiedOn: VERIFIED_ON,
        authoringFacts: {
            installation_category: 'Tub/shower valve trim plus rough-in',
            size_capacity: 'Valve and trim; no storage capacity',
            fuel_energy_source: 'Not applicable',
            connection_type: '1/2 in. IPS',
            flow_pressure: 'Posi-Temp pressure-balancing cycling valve',
            compatibility_required_parts: 'T2191BG trim paired with Moen 2510 rough-in valve',
            retail_source_reference: 'https://www.homedepot.com/p/sets/338530413',
        },
        seed: {
            category: 'shower_valve',
            manufacturer: 'Moen',
            brand: 'Moen',
            family_name: 'Align',
            model_number: 'T2191BG + 2510',
            manufacturer_part_number: 'T2191BG + 2510',
            finish: 'Brushed Gold',
            description: 'Align single-handle Posi-Temp valve trim in Brushed Gold bundled with a Moen 2510 brass pressure-balancing tub/shower rough-in valve with 1/2 in. IPS connections.',
            specifications: {
                valve_type: 'Moen Posi-Temp pressure-balancing cycling tub/shower valve',
                connection_size: '1/2 in. IPS',
                trim_included: 'Yes (T2191BG)',
                rough_in_valve_included: 'Yes (2510)',
                bundle_component_models: 'T2191BG trim + 2510 rough-in valve',
            },
            sources: [retailerSource(HOME_DEPOT, 'Moen Align Brushed Gold trim and 1/2 in. IPS rough-in valve retailer bundle', 'https://www.homedepot.com/p/sets/338530413')],
            confidence: '0.98',
        },
    },
];

export function catalogBrandSuggestions(context: string, records: CatalogFactoryRecord[], field: 'manufacturer' | 'brand') {
    const intent = brandIntent(context);
    const preferred = INTENT_PRIORITY[intent];
    const existing = records.map((record) => field === 'manufacturer' ? record.manufacturer : record.brand).filter(Boolean);
    const names = unique([...CURATED_PLUMBING_BRANDS.map((brand) => brand.name), ...existing]);

    return names
        .map((name) => {
            const curated = CURATED_PLUMBING_BRANDS.find((brand) => equal(brand.name, name));
            const preferredIndex = preferred.findIndex((candidate) => equal(candidate, name));
            const score = preferredIndex >= 0
                ? 1000 - preferredIndex
                : curated?.intents.includes(intent)
                    ? 500
                    : existing.some((candidate) => equal(candidate, name))
                        ? 250
                        : 0;
            return {
                value: name,
                label: name,
                description: preferredIndex >= 0 ? contextDescription(intent) : existing.some((candidate) => equal(candidate, name)) ? 'Already used in the master catalog' : 'Curated plumbing catalog suggestion',
                score,
            };
        })
        .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
        .map(({ score: _score, ...option }) => option satisfies CatalogSuggestionOption);
}

export function catalogCategorySuggestions(templates: CatalogTemplateDefinition[], starterCards: HomeOSStarterDeckCard[]): CatalogSuggestionOption[] {
    const templateOptions = templates
        .filter((template) => template.status !== 'archived')
        .map((template) => {
            const matches = starterCards.filter((card) => taxonomyMatches(template, card));
            const homeOSNames = unique(matches.map((card) => card.name));
            return {
                value: template.id,
                label: template.categoryName,
                description: homeOSNames.length
                    ? `HomeOS: ${homeOSNames.slice(0, 4).join(', ')}${homeOSNames.length > 4 ? ` +${homeOSNames.length - 4}` : ''}`
                    : 'Existing Catalog Factory category',
                searchText: [template.templateKey, template.categoryName, ...homeOSNames, ...matches.flatMap((card) => [card.roomKind, card.system, card.category, ...card.aliases])].join(' '),
                matched: matches.length > 0,
            };
        })
        .sort((left, right) => Number(right.matched) - Number(left.matched) || left.label.localeCompare(right.label))
        .map(({ matched: _matched, ...option }) => option satisfies CatalogSuggestionOption);
    const existingIdentities = new Set(templates.flatMap((template) => [identity(template.categoryName), identity(template.templateKey)]));
    const starterOptions = uniqueOptions(starterCards
        .filter((card) => !existingIdentities.has(identity(card.name)))
        .map((card) => ({
            value: `homeos:${card.templateKey}`,
            label: `Add HomeOS category: ${card.name}`,
            description: `${title(card.roomKind)} starter archetype · creates an authoring category only`,
            searchText: [card.name, card.roomKind, card.system, card.category, ...card.aliases].join(' '),
            addNewValue: card.name,
        })));

    return [...templateOptions, ...starterOptions];
}

export function catalogFamilySuggestions(records: CatalogFactoryRecord[], input: {
    templateId?: string;
    category?: string;
    manufacturer?: string;
    brand?: string;
}) {
    const matches = records
        .filter((record) => record.familyName)
        .map((record) => {
            const brandMatch = !input.brand || equal(record.brand, input.brand);
            const manufacturerMatch = !input.manufacturer || equal(record.manufacturer, input.manufacturer);
            const categoryMatch = !input.templateId && !input.category
                ? true
                : input.templateId
                    ? record.templateId === input.templateId
                    : equal(record.category, input.category || '');
            return {
                value: record.familyName,
                label: record.familyName,
                description: [record.brand, record.category].filter(Boolean).join(' · '),
                searchText: [record.manufacturer, record.brand, record.category, record.modelNumber].join(' '),
                score: Number(brandMatch) * 8 + Number(manufacturerMatch) * 4 + Number(categoryMatch) * 2,
            };
        })
        .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));

    return uniqueOptions(matches.map(({ score: _score, ...option }) => option));
}

export function catalogQuickStartsForDeck(starterCards: HomeOSStarterDeckCard[]) {
    const keys = new Set(starterCards.map((card) => card.templateKey));
    return CATALOG_QUICK_START_SUGGESTIONS.filter((suggestion) => keys.has(suggestion.starterTemplateKey));
}

export function catalogQuickStartGroupsForDeck(starterCards: HomeOSStarterDeckCard[]) {
    const taxonomy = starterCards.map((card) => searchableText([card.name, card.system, card.category, ...card.aliases].join(' ')));
    return CATALOG_QUICK_START_GROUPS.map((groupDefinition) => ({
        ...groupDefinition,
        matchedStarterNames: unique(starterCards
            .filter((card, index) => groupDefinition.archetypeTerms.some((term) => taxonomy[index].includes(searchableText(term))))
            .map((card) => card.name)),
        suggestions: CATALOG_QUICK_START_SUGGESTIONS.filter((suggestion) => suggestion.groupId === groupDefinition.id),
    }));
}

export function catalogQuickStartIsReady(suggestion: CatalogQuickStartSuggestion) {
    const groupDefinition = CATALOG_QUICK_START_GROUPS.find((candidate) => candidate.id === suggestion.groupId);
    return Boolean(
        groupDefinition
        && suggestion.seed.model_number.trim()
        && suggestion.seed.manufacturer_part_number.trim()
        && suggestion.retailerUrl.startsWith('https://')
        && suggestion.seed.sources.some((source) => source.type === 'retailer_page' && source.url === suggestion.retailerUrl)
        && groupDefinition.requiredFacts.every((field) => suggestion.authoringFacts[field]?.trim()),
    );
}

function group(id: string, label: string, archetypeTerms: string[], requiredFacts: string[], authoringNote: string): CatalogQuickStartGroup {
    return { id, label, archetypeTerms, requiredFacts, authoringNote };
}

function retailerSource(retailer: string, title: string, url: string) {
    return {
        type: 'retailer_page',
        title,
        url,
        retailer,
        verified_at: `${VERIFIED_ON}T12:00:00Z`,
        confidence: 0.98,
    };
}

function brandIntent(context: string): BrandIntent {
    const normalized = context.toLowerCase();
    if (/tankless|on demand|on-demand/.test(normalized)) return 'tankless_water_heater';
    if (/tank water heater|storage water heater|water heater/.test(normalized)) return 'tank_water_heater';
    if (/ball valve|full port|isolation valve/.test(normalized)) return 'ball_valve';
    if (/angle stop|fixture stop|shutoff|shut-off|supply line|connector/.test(normalized)) return 'stop_supply';
    if (/repair|replacement|cartridge|flapper|fill valve|wax ring|tank bolt|drain assembly|pop-up/.test(normalized)) return 'repair';
    if (/faucet|shower|tub|sink|toilet|fixture|trim/.test(normalized)) return 'fixture';
    return 'general';
}

function contextDescription(intent: BrandIntent) {
    if (intent === 'tank_water_heater') return 'Prioritized for storage tank water heaters';
    if (intent === 'tankless_water_heater') return 'Prioritized for tankless water heaters';
    if (intent === 'stop_supply') return 'Prioritized for stops and supply connections';
    if (intent === 'ball_valve') return 'Prioritized for ball valves and isolation';
    if (intent === 'repair') return 'Prioritized for repair and replacement parts';
    if (intent === 'fixture') return 'Prioritized for fixtures, faucets, and shower trim';
    return 'Curated plumbing catalog suggestion';
}

function taxonomyMatches(template: CatalogTemplateDefinition, card: HomeOSStarterDeckCard) {
    const categoryTokens = meaningfulTokens(`${template.templateKey} ${template.categoryName}`);
    const cardTokens = new Set(meaningfulTokens([card.name, card.system, card.category, ...card.aliases].join(' ')));
    return categoryTokens.some((token) => cardTokens.has(token));
}

function meaningfulTokens(value: string) {
    const ignored = new Set(['and', 'the', 'home', 'plumbing', 'product', 'other', 'equipment', 'component', 'fixture', 'system', 'water']);
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((token) => token.length >= 3 && !ignored.has(token));
}

function searchableText(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function identity(value: string) {
    return searchableText(value).replaceAll(' ', '');
}

function title(value: string) {
    return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function equal(left: string, right: string) {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function unique(values: string[]) {
    const seen = new Set<string>();
    return values.filter((value) => {
        const key = value.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function uniqueOptions<T extends CatalogSuggestionOption>(options: T[]) {
    const seen = new Set<string>();
    return options.filter((option) => {
        const key = option.value.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
