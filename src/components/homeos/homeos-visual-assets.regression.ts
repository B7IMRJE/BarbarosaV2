import { resolveHomeOSEquipmentVisual } from './homeos-visual-assets';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

assert(
    resolveHomeOSEquipmentVisual('https://home.test/water-heater.jpg', 'https://catalog.test/water-heater.jpg')?.uri === 'https://home.test/water-heater.jpg',
    'A homeowner equipment photo must take precedence over a generic catalog image.'
);
assert(
    resolveHomeOSEquipmentVisual('', 'https://catalog.test/water-heater.jpg')?.uri === 'https://catalog.test/water-heater.jpg',
    'A generic catalog image must remain available when an item has no photo.'
);
assert(!resolveHomeOSEquipmentVisual('', ''), 'Fallback icons must be used when neither image is available.');
