import {
    HOME_ITEM_CUSTOM_LOCATION_VALUE,
    buildHomeItemEditLocationChoices,
    getHomeItemEditLocationChoiceValue,
    resolveHomeItemEditLocationChoice,
} from './home-item-edit-locations';

runHomeItemEditLocationRegressions();

export function runHomeItemEditLocationRegressions() {
    sameNamedNestedAreasKeepDistinctPlacementIdentity();
    unknownSavedLocationsRemainCustom();
}

function sameNamedNestedAreasKeepDistinctPlacementIdentity() {
    const choices = buildHomeItemEditLocationChoices(
        ['Kitchen', 'Garage', 'Custom'],
        [
            { name: 'Kitchen', parent_area: '', system: 'Plumbing' },
            { name: 'Kitchen', parent_area: 'Guest House', system: 'Plumbing' },
        ]
    );
    const topLevelValue = getHomeItemEditLocationChoiceValue('Kitchen', '', 'Plumbing', choices);
    const nestedValue = getHomeItemEditLocationChoiceValue('Kitchen', 'Guest House', 'Plumbing', choices);
    const topLevel = resolveHomeItemEditLocationChoice(topLevelValue, choices);
    const nested = resolveHomeItemEditLocationChoice(nestedValue, choices);

    assert(topLevelValue !== nestedValue, 'Same-named areas must retain distinct selected values.');
    assert(topLevel?.location === 'Kitchen' && topLevel.parentArea === '', 'Top-level Kitchen must keep an empty parent area.');
    assert(nested?.location === 'Kitchen' && nested.parentArea === 'Guest House', 'Nested Kitchen must keep Guest House as its parent.');
    assert(topLevel?.label === 'Kitchen — top level', 'The top-level choice should be visibly disambiguated.');
    assert(nested?.label === 'Kitchen — inside Guest House', 'The nested choice should name its parent area.');
}

function unknownSavedLocationsRemainCustom() {
    const choices = buildHomeItemEditLocationChoices(['Kitchen', 'Custom'], []);

    assert(
        getHomeItemEditLocationChoiceValue('Mechanical Closet', '', 'HVAC', choices) === HOME_ITEM_CUSTOM_LOCATION_VALUE,
        'An existing custom location should continue to use the Custom edit flow.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
