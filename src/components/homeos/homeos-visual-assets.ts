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
    if (asset?.source) return asset.source;
    if (asset?.uri?.trim()) return { uri: asset.uri.trim() };
    return undefined;
}

export function resolveHomeOSFallbackIcon(label: string, fallback = '⌂') {
    return label.trim() ? getAreaIcon(label) : fallback;
}
