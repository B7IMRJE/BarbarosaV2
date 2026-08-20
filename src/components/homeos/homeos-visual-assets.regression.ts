import {
    resolveHomeOSEquipmentVisual,
    resolveHomeOSVisualSource,
} from './homeos-visual-assets';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`HomeOS visual asset regression failed: ${message}`);
}

assert(
    resolveHomeOSEquipmentVisual(
        'https://home.test/water-heater.jpg',
        'https://catalog.test/water-heater.jpg'
    )?.uri === 'https://home.test/water-heater.jpg',
    'a homeowner equipment photo must take precedence over a generic catalog image.'
);
assert(
    resolveHomeOSEquipmentVisual('', 'https://catalog.test/water-heater.jpg')?.uri ===
        'https://catalog.test/water-heater.jpg',
    'a catalog image must remain available when an item has no homeowner photo.'
);
assert(
    !resolveHomeOSEquipmentVisual('', ''),
    'the shared fallback icon must be used when neither image is available.'
);

const resolvedMixedAsset = resolveHomeOSVisualSource({
    uri: 'https://home.test/installed-photo.jpg',
    source: { uri: 'https://catalog.test/generic-photo.jpg' },
}) as { uri?: string } | undefined;

assert(
    resolvedMixedAsset?.uri === 'https://home.test/installed-photo.jpg',
    'a homeowner URI must win when a card also has a bundled or catalog source.'
);
