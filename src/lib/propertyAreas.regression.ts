import {
    activeAreasForScope,
    catalogForScope,
    childPropertyAreasForHost,
    classifyPropertyArea,
    hasAmbiguousPortableLaundryAreas,
    isChildPropertyArea,
    isCanonicalLaundryAreaName,
    isDirectPropertyAreaItem,
    isPortableLaundryAreaName,
    isTopLevelPropertyArea,
    laundryAreaLocationActionLabel,
    laundryAreaPlacementText,
    propertyAreaDetailRouteParams,
    propertyAreaLocationActionLabel,
    propertyAreaPlacementText,
    resolvePropertyAreaDetail,
    propertyAreaScopeFromRoute,
    visibleRootAreasForScope,
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
assert(propertyAreaScopeFromRoute('interior') === 'interior', 'Interior routes must open the My Home deck.');
assert(propertyAreaScopeFromRoute('exterior') === 'exterior', 'Exterior routes must open the exterior deck.');
assert(
    propertyAreaScopeFromRoute('unclassified') === 'unclassified',
    'The secondary other-areas route must keep ambiguous existing areas visible.'
);
assert(propertyAreaScopeFromRoute('unexpected') === 'interior', 'Unknown area routes must fail safely into My Home.');
assert(isCanonicalLaundryAreaName('Laundry'), 'Laundry must be the canonical Laundry area name.');
assert(!isCanonicalLaundryAreaName('Laundry Room'), 'Laundry Room must remain a legacy alias, not a second canonical name.');
assert(isPortableLaundryAreaName('Laundry Room'), 'Legacy Laundry Room must resolve to the portable Laundry area.');

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
assert(
    !catalogForScope('interior', [{ id: 'legacy-laundry', name: 'Laundry Room', system: 'Plumbing' }]).some((card) => card.name === 'Laundry'),
    'A legacy Laundry Room must suppress the canonical Laundry catalog choice without rewriting that record.'
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

const laundryPlacementRows: PropertyAreaRecord[] = [
    { id: 'kitchen', name: 'Kitchen', system: 'Plumbing', area_scope: 'interior' },
    { id: 'pantry', name: 'Pantry', system: 'Plumbing', area_scope: 'interior', parent_area: 'Kitchen' },
    { id: 'garage-kitchen', name: 'Secondary Kitchen', system: 'Structural', area_scope: 'interior', parent_area: 'Garage', area_placement_state: 'inside_area' },
    { id: 'garage-kitchen-a', name: 'Kitchen Annex', system: 'Structural', area_scope: 'interior', parent_area: 'Garage', area_placement_state: 'inside_area' },
    { id: 'guest-kitchen-a', name: 'Kitchen Annex', system: 'Structural', area_scope: 'interior', parent_area: 'Guest House', area_placement_state: 'inside_area' },
    { id: 'laundry-unassigned', name: 'Laundry', system: 'Plumbing', area_scope: 'interior', area_placement_state: 'unassigned' },
    { id: 'laundry-assigned', name: 'Laundry Room', system: 'Plumbing', area_scope: 'interior', parent_area: 'Garage', area_placement_state: 'inside_area' },
];
const visibleLaundryDeck = visibleRootAreasForScope(laundryPlacementRows, 'interior');
const singleLaundryDeck = visibleRootAreasForScope([
    laundryPlacementRows[0],
    laundryPlacementRows[6],
], 'interior');

assert(
    !visibleLaundryDeck.some((row) => row.id === 'pantry'),
    'Ordinary nested areas must remain in their host area rather than appearing in the root deck.'
);
assert(
    visibleLaundryDeck.some((row) => row.id === 'garage-kitchen'),
    'An explicitly placed Area must stay discoverable in the root deck while its host shows the same record as a portal.'
);
assert(
    visibleLaundryDeck.filter((row) => row.name === 'Kitchen Annex').length === 2,
    'Same-named Areas in different hosts are separate canonical records and must both stay discoverable.'
);
assert(
    visibleLaundryDeck.filter((row) => isPortableLaundryAreaName(row.name)).length === 2,
    'Ambiguous legacy Laundry aliases must both remain visible until a person resolves them.'
);
assert(
    hasAmbiguousPortableLaundryAreas(laundryPlacementRows),
    'Multiple active Laundry aliases must be identified as an ambiguity instead of silently merged.'
);
assert(
    singleLaundryDeck.filter((row) => isPortableLaundryAreaName(row.name)).length === 1,
    'One saved Laundry alias must appear as one canonical root card after assignment.'
);
assert(
    laundryAreaPlacementText(laundryPlacementRows[5]) === 'Location not assigned',
    'An unassigned Laundry must say that its location is not assigned.'
);
assert(
    laundryAreaLocationActionLabel(laundryPlacementRows[5]) === 'Assign location',
    'An unassigned Laundry must offer Assign location.'
);
assert(
    laundryAreaPlacementText({ name: 'Laundry Room', parent_area: 'Garage', area_placement_state: 'unassigned' }) === 'Location not assigned',
    'An unconfirmed legacy parent snapshot must not be presented as an assigned Laundry location.'
);
assert(
    laundryAreaLocationActionLabel({ parent_area: 'Garage', area_placement_state: 'unassigned' }) === 'Assign location',
    'An unconfirmed legacy parent snapshot must still require Assign location.'
);
assert(
    laundryAreaPlacementText({ name: 'Laundry', area_placement_state: 'standalone' }) === 'Standalone laundry room',
    'A standalone Laundry room must retain its distinct placement text.'
);
assert(
    laundryAreaLocationActionLabel({ area_placement_state: 'standalone' }) === 'Change location',
    'A standalone Laundry must offer Change location.'
);
assert(
    laundryAreaPlacementText(laundryPlacementRows[6]) === 'Located in Garage',
    'An assigned Laundry must identify its host area.'
);
assert(
    laundryAreaLocationActionLabel(laundryPlacementRows[6]) === 'Change location',
    'An assigned Laundry must offer Change location.'
);
assert(
    JSON.stringify(propertyAreaDetailRouteParams(laundryPlacementRows[6])) === JSON.stringify({
        area: 'Laundry Room',
        parentArea: 'Garage',
        areaId: 'laundry-assigned',
    }),
    'Laundry detail routes must preserve the Area UUID and exact saved parent area.'
);
assert(
    propertyAreaPlacementText(laundryPlacementRows[2]) === 'Located in Garage',
    'Generic explicitly placed Areas must identify their host.'
);
assert(
    propertyAreaLocationActionLabel({ area_placement_state: 'unassigned' }) === 'Assign location',
    'Generic unassigned Areas must offer Assign location.'
);

const movedAreaRows = [
    { id: 'laundry', category: 'Area', name: 'Laundry', parent_area: 'Garage', archived: false },
    { id: 'other-laundry', category: 'Area', name: 'Laundry', parent_area: 'Guest House', archived: false },
];
const exactMovedArea = resolvePropertyAreaDetail(movedAreaRows, {
    areaName: 'Laundry',
    parentAreaName: 'Garage',
    areaId: 'laundry',
});
assert(
    exactMovedArea.status === 'exact' && exactMovedArea.area?.id === 'laundry',
    'A current UUID detail route must resolve its exact Area.'
);
const recoveredMovedArea = resolvePropertyAreaDetail(movedAreaRows, {
    areaName: 'Laundry',
    parentAreaName: 'Hallway',
    areaId: 'laundry',
});
assert(
    recoveredMovedArea.status === 'recovered' && recoveredMovedArea.area?.parent_area === 'Garage',
    'A stale UUID detail route must recover the moved Area before any write is enabled.'
);
assert(
    resolvePropertyAreaDetail(movedAreaRows, {
        areaName: 'Laundry',
        parentAreaName: 'Garage',
        areaId: 'archived-or-unknown-area',
    }).status === 'missing',
    'An unknown stable Area ID must not fall through to a different same-named record.'
);
assert(
    resolvePropertyAreaDetail(movedAreaRows, {
        areaName: 'Laundry',
        parentAreaName: 'Hallway',
    }).status === 'ambiguous',
    'A legacy stale route with two same-named Areas must not guess a write target.'
);

const nestedPortalRows = [
    { id: 'garage-annex', category: 'Area', name: 'Kitchen Annex', parent_area: 'Garage', archived: false },
    { id: 'guest-annex', category: 'Area', name: 'Kitchen Annex', parent_area: 'Guest House', archived: false },
    {
        id: 'garage-annex-pantry',
        category: 'Area',
        name: 'Pantry',
        parent_area: 'Kitchen Annex',
        archived: false,
    },
    {
        id: 'guest-annex-pantry',
        category: 'Area',
        name: 'Pantry',
        parent_area: 'Kitchen Annex',
        archived: false,
    },
    {
        id: 'ambiguous-legacy-annex-child',
        category: 'Area',
        name: 'Storage',
        parent_area: 'Kitchen Annex',
        archived: false,
    },
];
assert(
    childPropertyAreasForHost(nestedPortalRows, nestedPortalRows[0]).length === 0,
    'A Garage Kitchen Annex must not project a name-only child when another same-named host exists.'
);
assert(
    childPropertyAreasForHost(nestedPortalRows, nestedPortalRows[1]).length === 0,
    'A Guest House Kitchen Annex must not project a name-only child from the Garage host.'
);
assert(
    !childPropertyAreasForHost(nestedPortalRows, nestedPortalRows[0]).some((row) => row.id === 'ambiguous-legacy-annex-child'),
    'An ambiguous legacy child must be hidden rather than projected under the wrong same-named host.'
);
const uniqueHostPortalRows = [
    { id: 'kitchen', category: 'Area', name: 'Kitchen', parent_area: '', archived: false },
    { id: 'pantry', category: 'Area', name: 'Pantry', parent_area: 'Kitchen', archived: false },
];
assert(
    childPropertyAreasForHost(uniqueHostPortalRows, uniqueHostPortalRows[0]).map((row) => row.id).join(',') === 'pantry',
    'A uniquely named legacy host may safely project its direct child Area.'
);
