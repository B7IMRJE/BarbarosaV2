import type { ImageSourcePropType } from 'react-native';
import { getAreaIcon } from '../../lib/systemDefaults';

export type HomeOSVisualAsset = {
    source?: ImageSourcePropType;
    uri?: string | null;
};

type HomeOSEquipmentIconRule = {
    icon: string;
    terms: readonly string[];
};

type HomeOSAreaIconRule = {
    icon: string;
    terms: readonly string[];
};

/**
 * HomeOS room and zone scenes. Keep this list close to the area catalog: it is
 * deliberately the one semantic source for active-area and Add Area cards.
 * Custom names intentionally fall through to the neutral home glyph.
 */
const HOME_OS_AREA_ICON_RULES: readonly HomeOSAreaIconRule[] = [
    { icon: '🏠', terms: ['whole home'] },
    { icon: '🍳', terms: ['kitchen'] },
    { icon: '🛋️', terms: ['living room', 'living'] },
    { icon: '🍽️', terms: ['dining room', 'dining'] },
    { icon: '🚪', terms: ['hallway', 'hall', 'foyer'] },
    { icon: '🚗', terms: ['attached garage', 'garage'] },
    { icon: '🧺', terms: ['laundry room', 'laundry'] },
    { icon: '🛏️', terms: ['primary bedroom', 'master bedroom', 'primary suite'] },
    { icon: '🛌', terms: ['bedroom', 'bedrooms'] },
    { icon: '🛁', terms: ['primary bathroom', 'master bathroom', 'primary bath'] },
    { icon: '🚿', terms: ['bathroom', 'bathrooms', 'bath'] },
    { icon: '💻', terms: ['office', 'study'] },
    { icon: '🪜', terms: ['attic'] },
    { icon: '🧱', terms: ['basement', 'crawlspace', 'crawl space'] },
    { icon: '🔥', terms: ['fireplace'] },
    { icon: '⚙️', terms: ['utility or mechanical room', 'utility mechanical room', 'utility room', 'mechanical room', 'mechanical'] },
    { icon: '🏋️', terms: ['gym', 'fitness room'] },
    { icon: '🍸', terms: ['bar'] },
    { icon: '🎬', terms: ['theater', 'media room'] },
    { icon: '🎮', terms: ['man cave', 'game room'] },
    { icon: '🍷', terms: ['wine room', 'wine cellar'] },
    { icon: '📦', terms: ['storage room', 'storage', 'closet'] },
    { icon: '🚶', terms: ['interior walkway', 'walkway', 'walk way'] },
    { icon: '🌳', terms: ['front yard'] },
    { icon: '🏡', terms: ['backyard', 'back yard'] },
    { icon: '🏡', terms: ['exterior'] },
    { icon: '🌿', terms: ['left side yard', 'right side yard', 'side yard'] },
    { icon: '🪑', terms: ['patio', 'deck'] },
    { icon: '🏠', terms: ['porch'] },
    { icon: '🌇', terms: ['balcony'] },
    { icon: '🛣️', terms: ['driveway'] },
    { icon: '🏊', terms: ['pool area', 'pool'] },
    { icon: '🫧', terms: ['spa area', 'spa', 'jacuzzi'] },
    { icon: '🍖', terms: ['bbq or outdoor kitchen', 'outdoor kitchen', 'bbq grill area', 'bbq', 'grill'] },
    { icon: '🚙', terms: ['detached garage'] },
    { icon: '🛖', terms: ['shed'] },
    { icon: '🛠️', terms: ['workshop'] },
    { icon: '🏘️', terms: ['guest house or adu', 'guest house', 'adu'] },
    { icon: '🏡', terms: ['pool house'] },
    { icon: '🌱', terms: ['landscaping', 'landscape'] },
    { icon: '💦', terms: ['irrigation'] },
    { icon: '🏠', terms: ['roof'] },
    { icon: '🌀', terms: ['exterior mechanical area', 'condenser area', 'equipment pad'] },
    { icon: '🔧', terms: ['exterior shutoff area', 'shutoff area', 'shut off area'] },
    { icon: '🛢️', terms: ['water heater area'] },
    { icon: '🌀', terms: ['exterior cleanout', 'sewer line'] },
    { icon: '🌱', terms: ['planter beds'] },
    { icon: '🎛️', terms: ['controller area'] },
    { icon: '🔧', terms: ['valve box area'] },
    { icon: '🚿', terms: ['outdoor shower'] },
    { icon: '⛲', terms: ['water features'] },
];

const HOME_OS_EQUIPMENT_ICON_RULES: readonly HomeOSEquipmentIconRule[] = [
    { icon: '🪜', terms: ['attic ladder'] },
    { icon: '📹', terms: ['camera inspection'] },
    { icon: '🚿', terms: ['fire sprinkler riser', 'sprinkler riser'] },
    { icon: '💦', terms: ['sprinkler head', 'drip emitter', 'rain sensor'] },
    { icon: '🗃️', terms: ['valve box'] },
    { icon: '💧', terms: ['backflow preventer', 'backflow device'] },
    { icon: '🪞', terms: ['lighted mirror', 'mirror'] },
    { icon: '💡', terms: ['light fixture', 'exterior lighting', 'lighting', 'lights', 'light'] },
    { icon: '🔔', terms: ['doorbell'] },
    { icon: '🔋', terms: ['battery backup', 'battery'] },
    { icon: '⚡', terms: ['whole home surge protector', 'surge protector', 'main electrical panel', 'electrical panel', 'subpanel', 'breaker', 'gfci', 'gfi', 'outlet', 'receptacle', 'electrical', 'electric heater', 'switch', 'panel', 'charger', 'generator inlet', 'ev charger'] },
    { icon: '🛡️', terms: ['smoke alarm system', 'co alarm system', 'smoke detector', 'co detector', 'carbon monoxide detector', 'fire extinguisher', 'security alarm', 'alarm keypad', 'alarm', 'safety'] },
    { icon: '🌀', terms: ['p trap', 'drain', 'cleanout', 'sewer', 'standpipe', 'waste', 'basket strainer', 'strainer'] },
    { icon: '🎛️', terms: ['pressure vacuum breaker', 'pressure regulator', 'prv', 'regulator', 'controller', 'automation controller'] },
    { icon: '🔧', terms: ['backwater valve', 'irrigation valve', 'gas shutoff', 'water shutoff', 'main water shutoff', 'shutoff', 'shut off', 'angle stop', 'valve', 'stop'] },
    { icon: '💧', terms: ['reverse osmosis', 'whole house filter', 'water filter', 'pool filter', 'filter', 'softener', 'water treatment', 'salt cell'] },
    { icon: '🚰', terms: ['faucet', 'tap', 'spigot', 'hose bib', 'tub filler'] },
    { icon: '〰️', terms: ['generator gas line', 'gas line', 'water main', 'ice maker line', 'line', 'hose', 'tubing', 'pipe', 'piping'] },
    { icon: '⚙️', terms: ['garbage disposal flange', 'garbage disposal', 'food waste disposer', 'disposal', 'disposer', 'flange'] },
    { icon: '♨️', terms: ['instant hot water dispenser', 'insta hot', 'instant hot', 'hot water dispenser', 'dispenser'] },
    { icon: '🛢️', terms: ['tankless water heater', 'gas water heater', 'water heater', 'expansion tank', 'pressure tank', 'tank'] },
    { icon: '📟', terms: ['water meter', 'gas meter', 'meter'] },
    { icon: '💨', terms: ['exhaust fan', 'exhaust', 'fan'] },
    { icon: '🌡️', terms: ['thermostat'] },
    { icon: '🔥', terms: ['pool heater', 'heater', 'boiler'] },
    { icon: '🍽️', terms: ['dishwasher'] },
    { icon: '🧊', terms: ['refrigerator', 'fridge', 'freezer', 'ice maker'] },
    { icon: '🍳', terms: ['stove', 'range', 'oven', 'cooktop'] },
    { icon: '🚰', terms: ['sink', 'basin'] },
    { icon: '🗄️', terms: ['counter', 'countertop', 'vanity', 'cabinet'] },
    { icon: '🚽', terms: ['toilet', 'bidet'] },
    { icon: '🚿', terms: ['shower', 'body spray', 'body sprays'] },
    { icon: '🛁', terms: ['tub', 'bathtub'] },
    { icon: '🧺', terms: ['washer', 'washing machine', 'dryer', 'laundry machine'] },
    { icon: '❄️', terms: ['air conditioner', 'air conditioning', 'exterior condenser', 'condenser', 'air handler', 'heat pump', 'furnace', 'hvac', 'supply vent', 'return vent', 'vent'] },
    { icon: '⚙️', terms: ['condensate pump', 'ejector pump', 'sump pump', 'irrigation pump', 'pool pump', 'spa pump', 'pump', 'chemical feeder'] },
    { icon: '🏊', terms: ['pool', 'spa', 'jacuzzi'] },
    { icon: '🔌', terms: ['appliance'] },
    { icon: '🧰', terms: ['fixture', 'equipment', 'component', 'controller'] },
];

function normalizeVisualLabel(label: string) {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function labelIncludesTerm(normalizedLabel: string, term: string) {
    return ` ${normalizedLabel} `.includes(` ${term} `);
}

function resolveIconRule<T extends { icon: string; terms: readonly string[] }>(
    normalizedLabel: string,
    rules: readonly T[],
    preferMostSpecific = true
) {
    const matches = rules.flatMap((rule) => rule.terms
        .filter((term) => labelIncludesTerm(normalizedLabel, term))
        .map((term) => ({ icon: rule.icon, term })));

    return preferMostSpecific
        ? matches.sort((left, right) => right.term.length - left.term.length)[0]?.icon
        : matches[0]?.icon;
}

/**
 * One replacement point for approved HomeOS illustrations and homeowner media.
 * No generated or placeholder production artwork is bundled here.
 */
export function resolveHomeOSVisualSource(asset?: HomeOSVisualAsset): ImageSourcePropType | undefined {
    if (asset?.uri?.trim()) return { uri: asset.uri.trim() };
    if (asset?.source) return asset.source;
    return undefined;
}

/** Homeowner media is always preferred over a shared catalog illustration. */
export function resolveHomeOSEquipmentVisual(
    homeownerPhotoUrl?: string | null,
    catalogImageUrl?: string | null
): HomeOSVisualAsset | undefined {
    const homeownerPhoto = homeownerPhotoUrl?.trim();
    if (homeownerPhoto) return { uri: homeownerPhoto };

    const catalogImage = catalogImageUrl?.trim();
    if (catalogImage) return { uri: catalogImage };

    return undefined;
}

/** Area cards retain their room/zone vocabulary and any explicit override. */
export function resolveHomeOSAreaFallbackIcon(label: string, fallbackIcon?: string) {
    const normalizedLabel = normalizeVisualLabel(label).replace(/\s+#?\d+$/, '');
    if (normalizedLabel.includes('custom')) return '⌂';

    const matchedIcon = resolveIconRule(normalizedLabel, HOME_OS_AREA_ICON_RULES);
    if (matchedIcon) return matchedIcon;

    const explicitFallback = fallbackIcon?.trim();
    if (explicitFallback) return explicitFallback;

    // The neutral home glyph is intentional only for a custom or unknown area.
    return '⌂';
}

/**
 * Equipment and component terms win over room words and generic screen fallbacks.
 * For example, Kitchen Sink resolves as a sink rather than as a Kitchen area.
 */
export function resolveHomeOSEquipmentFallbackIcon(label: string, fallbackIcon?: string) {
    const normalizedLabel = normalizeVisualLabel(label);

    if (normalizedLabel) {
        const matchingRule = resolveIconRule(normalizedLabel, HOME_OS_EQUIPMENT_ICON_RULES, false);

        if (matchingRule) return matchingRule;
    }

    const explicitFallback = fallbackIcon?.trim();

    return explicitFallback && !HOME_OS_ROOM_ONLY_FALLBACK_ICONS.has(explicitFallback)
        ? explicitFallback
        : '🧰';
}

const HOME_OS_ROOM_ONLY_FALLBACK_ICONS = new Set([
    '🏠',
    '🍳',
    '🚗',
    '📦',
    '🚪',
    '🌿',
    '🛋️',
]);

export function resolveHomeOSFallbackIcon(label: string, fallback = '⌂') {
    const areaFallback = label.trim() ? getAreaIcon(label) : fallback;
    return resolveHomeOSEquipmentFallbackIcon(label, areaFallback);
}
