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

const HOME_OS_EQUIPMENT_ICON_RULES: readonly HomeOSEquipmentIconRule[] = [
    { icon: '🪞', terms: ['lighted mirror', 'mirror'] },
    { icon: '💡', terms: ['light', 'lights', 'lighted', 'lighting', 'light fixture'] },
    { icon: '🔔', terms: ['doorbell'] },
    { icon: '⚡', terms: ['gfci', 'gfi', 'outlet', 'receptacle', 'electrical', 'electric heater', 'breaker', 'switch', 'panel', 'subpanel', 'charger', 'surge protector'] },
    { icon: '🛡️', terms: ['alarm', 'safety', 'smoke detector', 'co detector', 'carbon monoxide detector', 'fire extinguisher', 'emergency shutoff'] },
    { icon: '🌀', terms: ['p trap', 'drain', 'cleanout', 'sewer', 'standpipe', 'waste', 'basket strainer', 'strainer'] },
    { icon: '🎛️', terms: ['pressure regulator', 'prv', 'regulator'] },
    { icon: '🔧', terms: ['valve', 'shutoff', 'shut off', 'angle stop', 'stop'] },
    { icon: '💧', terms: ['filter', 'reverse osmosis', 'ro', 'softener', 'water treatment'] },
    { icon: '🚰', terms: ['faucet', 'tap', 'spigot', 'hose bib', 'tub filler'] },
    { icon: '〰️', terms: ['water main', 'line', 'hose', 'tubing', 'pipe', 'piping'] },
    { icon: '⚙️', terms: ['garbage disposal flange', 'garbage disposal', 'food waste disposer', 'disposal', 'disposer', 'flange'] },
    { icon: '♨️', terms: ['instant hot water dispenser', 'insta hot', 'instant hot', 'hot water dispenser', 'dispenser'] },
    { icon: '🛢️', terms: ['expansion tank', 'pressure tank', 'tank'] },
    { icon: '📟', terms: ['water meter', 'gas meter', 'meter'] },
    { icon: '💨', terms: ['exhaust fan', 'exhaust', 'fan'] },
    { icon: '🌡️', terms: ['thermostat'] },
    { icon: '🔥', terms: ['water heater', 'tankless water heater', 'heater', 'boiler'] },
    { icon: '🍽️', terms: ['dishwasher'] },
    { icon: '🧊', terms: ['refrigerator', 'fridge', 'freezer', 'ice maker'] },
    { icon: '🔥', terms: ['stove', 'range', 'oven', 'cooktop'] },
    { icon: '🚰', terms: ['sink', 'basin'] },
    { icon: '🗄️', terms: ['counter', 'countertop', 'vanity', 'cabinet'] },
    { icon: '🚽', terms: ['toilet', 'bidet'] },
    { icon: '🚿', terms: ['shower', 'body spray', 'body sprays'] },
    { icon: '🛁', terms: ['tub', 'bathtub'] },
    { icon: '🧺', terms: ['washer', 'washing machine', 'dryer', 'laundry machine'] },
    { icon: '❄️', terms: ['hvac', 'furnace', 'air conditioner', 'air conditioning', 'ac', 'condenser', 'air handler', 'heat pump', 'vent'] },
    { icon: '⚙️', terms: ['pump'] },
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
    const explicitFallback = fallbackIcon?.trim();
    if (explicitFallback) return explicitFallback;

    const trimmedLabel = label.trim();
    return trimmedLabel ? getAreaIcon(trimmedLabel) : '⌂';
}

/**
 * Equipment and component terms win over room words and generic screen fallbacks.
 * For example, Kitchen Sink resolves as a sink rather than as a Kitchen area.
 */
export function resolveHomeOSEquipmentFallbackIcon(label: string, fallbackIcon?: string) {
    const normalizedLabel = normalizeVisualLabel(label);

    if (normalizedLabel) {
        const matchingRule = HOME_OS_EQUIPMENT_ICON_RULES.find((rule) =>
            rule.terms.some((term) => labelIncludesTerm(normalizedLabel, term))
        );

        if (matchingRule) return matchingRule.icon;
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
