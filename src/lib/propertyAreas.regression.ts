import {
    activeAreasForScope,
    catalogForScope,
    classifyPropertyArea,
    isChildPropertyArea,
    isDirectPropertyAreaItem,
    isTopLevelPropertyArea,
    type PropertyAreaRecord,
} from './propertyAreas';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`Property navigation regression failed: ${message}`);
}

assert(classifyPropertyArea({ name: 'Hallway' }) === 'interior', 'Hallway must be interior.');
assert(classifyPropertyArea({ name: 'Bathroom 2' }) === 'interior', 'Numbered bathrooms must remain interior.');
assert(classifyPropertyArea({ name: 'Attached Garage' }) === 'interior', 'Attached garage must be interior.');
assert(classifyPropertyArea({ name: 'Detached Garage' }) === 'exterior', 'Detached garage must be exterior.');
assert(classifyPropertyArea({ name: 'Garage' }) === 'unclassified', 'Ambiguous garages must remain unclassified.');
assert(classifyPropertyArea({ name: 'Unknown workshop nook' }) === 'unclassified', 'Unknown labels must remain unclassified.');

const rows: PropertyAreaRecord[] = [
    { id: 'a', name: 'Kitchen', system: 'Plumbing', area_scope: 'interior' },
    { id: 'b', name: 'Front Yard', system: 'Irrigation', area_scope: 'exterior' },
    { id: 'c', name: 'Garage', system: 'Plumbing' },
    { id: 'd', name: 'Kitchen', system: 'Electrical', area_scope: 'interior' },
    { id: 'e', name: 'Bathroom', system: 'Plumbing', area_scope: 'interior', parent_area: 'Guest House' },
];

assert(
    activeAreasForScope(rows.filter(isTopLevelPropertyArea), 'interior').length === 1,
    'Top-level area cards must be de-duplicated without pulling in nested areas.'
);
assert(activeAreasForScope(rows, 'unclassified').some((row) => row.id === 'c'), 'Unclassified areas must stay visible.');
assert(!catalogForScope('interior', rows).some((card) => card.name === 'Kitchen'), 'Existing areas must not be offered again.');
assert(catalogForScope('interior', rows).some((card) => card.name === 'Hallway'), 'Unused interior areas must remain available.');
assert(
    catalogForScope('interior', rows.filter(isTopLevelPropertyArea)).some((card) => card.name === 'Bathroom'),
    'A nested area must not suppress the same top-level catalog choice.'
);
assert(isTopLevelPropertyArea({ parent_area: '  ' }), 'Blank parents must remain top-level.');
assert(!isTopLevelPropertyArea({ parent_area: 'Kitchen' }), 'Nested areas must not appear in the root deck.');
assert(
    isChildPropertyArea({ category: 'AREA', parent_area: ' Master Bathroom ' }, 'master bathroom'),
    'Child-area matching must be normalized and case-insensitive.'
);
assert(
    isDirectPropertyAreaItem({ category: 'Fixture', location: ' KITCHEN ', parent_area: '' }, 'kitchen'),
    'Root item matching must be normalized and case-insensitive.'
);
assert(
    isDirectPropertyAreaItem(
        { category: 'Fixture', location: 'Toilet', parent_area: 'MASTER BATHROOM' },
        'toilet',
        'Master Bathroom'
    ),
    'Nested item matching must preserve its parent relationship.'
);
