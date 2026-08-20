import { activeAreasForScope, catalogForScope, classifyPropertyArea, type PropertyAreaRecord } from './propertyAreas';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

assert(classifyPropertyArea({ name: 'Hallway' }) === 'interior', 'Hallway must be a standard interior area.');
assert(classifyPropertyArea({ name: 'Attached Garage' }) === 'interior', 'Attached garage must be interior.');
assert(classifyPropertyArea({ name: 'Detached Garage' }) === 'exterior', 'Detached garage must be exterior.');
assert(classifyPropertyArea({ name: 'Garage' }) === 'unclassified', 'Ambiguous garages must remain unclassified.');
assert(classifyPropertyArea({ name: 'Unknown workshop nook' }) === 'unclassified', 'Unknown areas must remain visible as unclassified.');

const rows: PropertyAreaRecord[] = [
    { id: 'a', name: 'Kitchen', system: 'Plumbing', area_scope: 'interior' },
    { id: 'b', name: 'Front Yard', system: 'Irrigation', area_scope: 'exterior' },
    { id: 'c', name: 'Garage', system: 'Plumbing' },
    { id: 'd', name: 'Kitchen', system: 'Electrical', area_scope: 'interior' },
];
assert(activeAreasForScope(rows, 'interior').length === 1, 'Active screens must be scope-filtered and de-duplicated.');
assert(activeAreasForScope(rows, 'unclassified').map((row) => row.id).includes('c'), 'Unclassified areas must stay visible.');
assert(!catalogForScope('interior', rows).some((card) => card.name === 'Kitchen'), 'Active areas must not be offered for duplicate creation.');
assert(catalogForScope('interior', rows).some((card) => card.name === 'Hallway'), 'Filtered catalog must include Hallway.');
