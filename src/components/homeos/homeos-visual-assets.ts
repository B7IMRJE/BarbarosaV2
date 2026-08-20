import type { ImageSourcePropType } from 'react-native';
import { getAreaIcon } from '../../lib/systemDefaults';

export type HomeOSVisualAsset = {
    source?: ImageSourcePropType;
    uri?: string | null;
};

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

export function resolveHomeOSFallbackIcon(label: string, fallback = '⌂') {
    return label.trim() ? getAreaIcon(label) : fallback;
}
