import { getHomeOSVisualFoundation } from './homeos-visual-foundation';
import { homeOSThemes } from './themes';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`HomeOS visual foundation regression failed: ${message}`);
}

const foundation = getHomeOSVisualFoundation(homeOSThemes.ocean, (value) => value, (value) => value);

assert(
    foundation.grid.destinationMinimumHeight >= 268,
    'Property landing destinations must retain a spacious picture-card hierarchy.'
);
assert(
    foundation.grid.areaImageHeight >= 112 && foundation.grid.equipmentImageHeight >= 124,
    'Area and equipment cards must reserve a large visual hero region.'
);
assert(
    foundation.grid.destinationImageHeight > foundation.grid.areaImageHeight,
    'The property landing destinations must remain visually dominant over area cards.'
);
