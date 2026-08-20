import type { HomeItemHierarchyRecord } from './homeItemHierarchy';
import {
    resolveHomeItemAreaAssemblyDeck,
    type HomeItemAreaHierarchyScope,
} from './homeItemHierarchyProjection';
import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';

export type PropertyAreaContainerContext = {
    areaName: string;
    parentAreaName?: string | null;
};

type ElectricalSafetyIdentity = {
    name?: string | null;
    system?: string | null;
    category?: string | null;
    starter_template_key?: string | null;
    templateKey?: string | null;
    tradeKey?: string | null;
};

/**
 * Property-first area pages are a read-only projection over saved rows. They
 * intentionally do not rewrite, archive, or relocate records hidden here.
 */
export function resolvePropertyAreaContainerDeck<T extends HomeItemHierarchyRecord>(
    rows: readonly T[],
    scope: string | HomeItemAreaHierarchyScope,
    starterCards: readonly HomeOSStarterCardChoice[] = [],
): T[] {
    const presentationRoles = new Map<string, 'container' | 'component'>();

    for (const card of starterCards) {
        if (card.presentationRole) {
            presentationRoles.set(clean(card.templateKey).toLowerCase(), card.presentationRole);
        }
    }

    return resolveHomeItemAreaAssemblyDeck(rows, scope)
        .filter((row) => isPropertyAreaContainerRoot(row, presentationRoles));
}

/** Keep ambiguous legacy Fixture/Equipment roots unless they are clearly not a container. */
export function isPropertyAreaContainerRoot(
    row: HomeItemHierarchyRecord,
    presentationRoles: ReadonlyMap<string, 'container' | 'component'> = new Map(),
) {
    if (clean(row.parent_home_item_id)) return false;

    const templateKey = clean(row.starter_template_key).toLowerCase();
    const presentationRole = presentationRoles.get(templateKey);

    if (presentationRole) {
        return presentationRole === 'container' && !sameIdentity(row.category, 'Component');
    }

    if (sameIdentity(row.category, 'Component')) return false;
    if (NON_CONTAINER_STARTER_TEMPLATE_KEYS.has(templateKey)) return false;
    if (isKnownKitchenCounterBoundRoot(row)) return false;
    return !isElectricalOrSafetyOnlyCard(row);
}

/**
 * Narrows the master Deck only for Add Container. The normal Create Item Deck
 * remains intentionally broad and continues to expose child cards.
 */
export function filterHomeOSContainerStarterCardChoices(
    cards: readonly HomeOSStarterCardChoice[],
    context: PropertyAreaContainerContext,
) {
    const placement = resolvePropertyAreaPlacement(context);

    return cards.filter((card) => (
        isContainerStarterCard(card) &&
        !sameIdentity(card.category, 'Component') &&
        !isElectricalOrSafetyOnlyCard(card) &&
        isStarterCardRelevantToArea(card, placement)
    ));
}

function isContainerStarterCard(card: HomeOSStarterCardChoice) {
    if (clean(card.parentTemplateKey)) return false;

    if (card.presentationRole) {
        return card.presentationRole === 'container';
    }

    // Older picker responses do not include presentation metadata. Preserve
    // the narrow legacy exclusions until the additive catalog migration is live.
    return !NON_CONTAINER_STARTER_TEMPLATE_KEYS.has(clean(card.templateKey).toLowerCase());
}

export function propertyAreaRoutePath(context: PropertyAreaContainerContext) {
    const areaName = clean(context.areaName);
    const parentAreaName = clean(context.parentAreaName);

    if (!areaName) return '/';

    return `/home/area/${encodeURIComponent(areaName)}` +
        (parentAreaName ? `?parentArea=${encodeURIComponent(parentAreaName)}` : '');
}

export function buildPropertyAreaContainerCreateRoute(context: PropertyAreaContainerContext) {
    const areaName = clean(context.areaName);
    const parentAreaName = clean(context.parentAreaName);

    return {
        pathname: '/item/create' as const,
        params: {
            system: 'Plumbing',
            area: areaName,
            ...(parentAreaName ? { parentArea: parentAreaName } : {}),
            containerMode: 'true',
            deckPicker: 'true',
            areaReturnTo: propertyAreaRoutePath({ areaName, parentAreaName }),
        },
    };
}

export function isElectricalOrSafetyOnlyCard(card: ElectricalSafetyIdentity) {
    const category = normalize(card.category);
    const system = normalize(card.system);
    const templateKey = normalizedKey(card.starter_template_key || card.templateKey);
    const tradeKey = normalizedKey(card.tradeKey);
    const name = normalize(card.name);

    if (category === 'safety') return true;
    if (tradeKey === 'electrical') return true;
    if (templateKey.startsWith('electrical_') || templateKey.startsWith('electrical:')) return true;
    if (ELECTRICAL_SAFETY_SYSTEMS.has(system)) return true;

    return ELECTRICAL_SAFETY_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

type PropertyAreaPlacement = {
    keys: Set<string>;
    isLaundry: boolean;
};

function resolvePropertyAreaPlacement(context: PropertyAreaContainerContext): PropertyAreaPlacement {
    const keys = new Set<string>();
    const areaValues = [context.areaName, context.parentAreaName].map(normalizedKey).filter(Boolean);

    for (const value of areaValues) {
        keys.add(value);
        keys.add(value.replace(/_\d+$/, ''));

        if (/(^|_)(bathroom|bath_room|bath|powder_room)(_|$)/.test(value)) keys.add('bathroom');
        if (/(^|_)(master|primary)_bath(room)?(_|$)/.test(value)) keys.add('master_bathroom');
        if (/(^|_)kitchen(_|$)/.test(value)) keys.add('kitchen');
        if (/(^|_)(garage|attached_garage|detached_garage)(_|$)/.test(value)) keys.add('garage');
        if (/(^|_)(laundry|laundry_room|utility_laundry)(_|$)/.test(value)) {
            keys.add('laundry');
            keys.add('laundry_room');
        }
        if (/(^|_)(whole_home|whole_house)(_|$)/.test(value)) keys.add('whole_home');
        if (/(^|_)(utility|utility_room)(_|$)/.test(value)) keys.add('utility_room');
        if (/(^|_)(mechanical|mechanical_room)(_|$)/.test(value)) keys.add('mechanical_room');
    }

    return {
        keys,
        isLaundry: keys.has('laundry') || keys.has('laundry_room'),
    };
}

function isStarterCardRelevantToArea(
    card: HomeOSStarterCardChoice,
    placement: PropertyAreaPlacement,
) {
    const roomKind = normalizedKey(card.roomKind);
    const placementTags = (card.placementTags || []).map(normalizedKey).filter(Boolean);

    if (placement.keys.has(roomKind)) return true;
    if (placementTags.some((tag) => placement.keys.has(tag))) return true;

    // The current additive catalog keeps Laundry Connections in the Garage
    // family. This narrow compatibility rule exposes that existing choice in a
    // Laundry area without making every Garage card relevant there.
    if (placement.isLaundry && roomKind === 'garage') {
        const identity = normalize([
            card.templateKey,
            card.name,
            ...card.aliases,
        ].join(' '));

        return /(^| )(laundry|washer|washing machine)( |$)/.test(identity);
    }

    return false;
}

function isKnownKitchenCounterBoundRoot(row: HomeItemHierarchyRecord) {
    const templateKey = clean(row.starter_template_key).toLowerCase();

    if (KITCHEN_COUNTER_BOUND_TEMPLATE_KEYS.has(templateKey)) return true;

    const placement = normalize(`${clean(row.location)} ${clean(row.parent_area)}`);
    if (!/(^| )kitchen( |$)/.test(placement)) return false;

    const name = normalize(row.name);
    return KITCHEN_COUNTER_BOUND_NAMES.has(name);
}

const ELECTRICAL_SAFETY_SYSTEMS = new Set([
    'electrical',
    'electric',
    'lighting',
    'lights',
    'life safety',
    'home safety',
    'safety',
    'fire safety',
    'security',
]);

// These established null-parent templates are components of a larger
// property-first container. Their database relationships and normal Services
// Deck visibility remain unchanged; Add Container alone omits them.
const NON_CONTAINER_STARTER_TEMPLATE_KEYS = new Set([
    'bathroom:bathroom_sink',
    'bathroom:bathroom_sink_faucet',
    'kitchen:kitchen_faucet',
    'kitchen:garbage_disposal',
    'kitchen:instant_hot_water_dispenser',
    'kitchen:reverse_osmosis_system',
]);

const KITCHEN_COUNTER_BOUND_TEMPLATE_KEYS = new Set([
    'kitchen:instant_hot_water_dispenser',
    'kitchen:reverse_osmosis_system',
]);

const KITCHEN_COUNTER_BOUND_NAMES = new Set([
    'instant hot water dispenser',
    'instant hot',
    'hot water dispenser',
    'reverse osmosis system',
    'reverse osmosis',
    'ro system',
]);

const ELECTRICAL_SAFETY_NAME_PATTERNS = [
    /(^| )(gfi|gfci|afci)( |$)/,
    /(^| )(electrical outlet|wall outlet|receptacle)( |$)/,
    /(^| )(lighted mirror)( |$)/,
    /(^| )(bathroom|kitchen|garage|interior|exterior|outdoor|ceiling|wall|vanity) (light|lights|lighting|light fixture)( |$)/,
    /^(light|lights|lighting|light fixture)$/,
    /(^| )(light switch|dimmer switch|switch dimmer)( |$)/,
    /(^| )(main electrical panel|electrical panel|breaker panel|service panel|electrical subpanel|subpanel)( |$)/,
    /(^| )(smoke alarm|fire alarm|co alarm|carbon monoxide alarm|smoke carbon monoxide alarm)( |$)/,
    /(^| )(bathroom exhaust fan|exhaust fan|ceiling fan)( |$)/,
    /(^| )(ev charger|electric vehicle charger|evse)( |$)/,
    /(^| )(doorbell|surge protector|dedicated electrical circuit|electrical circuit)( |$)/,
    /(^| )(generator transfer switch|transfer switch|electric heater)( |$)/,
];

function clean(value: unknown) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalize(value: unknown) {
    return clean(value)
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizedKey(value: unknown) {
    return normalize(value).replace(/\s+/g, '_');
}

function sameIdentity(first: unknown, second: unknown) {
    return normalize(first) === normalize(second);
}
