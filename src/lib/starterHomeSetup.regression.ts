import {
    ACTIVATED_ITEM_INSTALL_STATE,
    ACTIVATED_ITEM_STATUS,
    STARTER_ITEM_INSTALL_STATE,
    STARTER_ITEM_STATUS,
    buildDefaultStarterHomePlan,
    buildStarterHomeSetupPreview,
    formatStarterSetupResult,
    isStarterHomeItemShell,
    starterPlanContainsArea,
} from './starterHomeSetup';

runStarterHomeSetupRegressions();

export function runStarterHomeSetupRegressions() {
    newlyInitializedHomeCreatesKitchenStarterCards();
    kitchenIncludesRequiredCards();
    starterItemsAreUnconfirmedUnknownShells();
    starterShellsHaveAnExplicitActivationBoundary();
    repeatedStarterCreationDoesNotDuplicateRows();
    existingCustomItemsAreNotOverwritten();
    olderSlugAndNameVariantsPreventDuplicates();
    starterItemsAreScopedToTheRequestedProperty();
    existingHomeRecoveryCreatesOnlyMissingCards();
    kitchenHasDirectItemsAfterSetup();
}

function starterShellsHaveAnExplicitActivationBoundary() {
    assert(
        isStarterHomeItemShell({
            status: STARTER_ITEM_STATUS,
            install_state: STARTER_ITEM_INSTALL_STATE,
        }),
        'Missing-information starter shells should offer activation.'
    );
    assert(
        !isStarterHomeItemShell({
            status: ACTIVATED_ITEM_STATUS,
            install_state: ACTIVATED_ITEM_INSTALL_STATE,
        }),
        'Activated items should stop offering activation.'
    );
    assert(
        !isStarterHomeItemShell({
            status: 'Good',
            install_state: STARTER_ITEM_INSTALL_STATE,
        }),
        'A documented item should not be treated as a starter shell.'
    );
}

function newlyInitializedHomeCreatesKitchenStarterCards() {
    const preview = previewWith([]);
    const kitchenRows = preview.rowsToInsert.filter((row) => normalize(row.location) === 'kitchen');

    assert(starterPlanContainsArea(buildDefaultStarterHomePlan('HOUSE'), 'Kitchen'), 'Default standard home plan should include Kitchen.');
    assert(kitchenRows.length > 0, 'New standard home should create Kitchen starter rows.');
}

function kitchenIncludesRequiredCards() {
    const names = new Set(previewWith([]).rowsToInsert.map((row) => row.name));

    [
        'Kitchen Faucet',
        'Kitchen Sink',
        'Garbage Disposal',
        'Dishwasher',
        'Dishwasher Supply Line',
        'Dishwasher Drain Line',
        'Dishwasher Air Gap',
        'Kitchen Drain / P-Trap',
        'Kitchen Hot Angle Stop',
        'Kitchen Cold Angle Stop',
        'Refrigerator Water Line',
        'Stove / Range',
        'Kitchen GFCI / Outlets',
    ].forEach((name) => {
        assert(names.has(name), `Kitchen starter catalog should include ${name}.`);
    });
}

function starterItemsAreUnconfirmedUnknownShells() {
    const kitchenItemRows = previewWith([]).rowsToInsert.filter((row) =>
        normalize(row.location) === 'kitchen' && normalize(row.category) !== 'area'
    );

    assert(kitchenItemRows.length > 0, 'Kitchen should have starter item rows.');
    kitchenItemRows.forEach((row) => {
        assert(row.property_id === 'property-1', 'Starter rows should use the requested property id.');
        assert(row.status === STARTER_ITEM_STATUS, 'Starter rows should be Missing Information.');
        assert(row.install_state === STARTER_ITEM_INSTALL_STATE, 'Starter rows should keep install state Unknown.');
        assert(normalize(row.status) !== 'installed', 'Starter rows should not be Installed.');
        assert(normalize(row.status) !== 'confirmed', 'Starter rows should not be Confirmed.');
    });
}

function repeatedStarterCreationDoesNotDuplicateRows() {
    const firstRun = previewWith([]);
    const secondRun = previewWith(firstRun.rowsToInsert);

    assert(firstRun.rowsToInsert.length > 0, 'First run should create starter rows.');
    assert(secondRun.rowsToInsert.length === 0, 'Second run should not create duplicate starter rows.');
}

function existingCustomItemsAreNotOverwritten() {
    const existingCustom = {
        name: 'Custom Coffee Bar Filter',
        system: 'Water Quality',
        category: 'Equipment',
        location: 'Kitchen',
        parent_area: '',
        item_slug: 'custom-coffee-bar-filter',
    };
    const preview = previewWith([existingCustom]);

    assert(
        preview.rowsToInsert.some((row) => row.name === 'Kitchen Faucet'),
        'Starter recovery should still add missing starter cards.'
    );
    assert(
        preview.rowsToInsert.every((row) => row.name !== existingCustom.name),
        'Starter recovery should not overwrite or recreate existing custom items.'
    );
}

function olderSlugAndNameVariantsPreventDuplicates() {
    const preview = previewWith([
        {
            name: 'Kitchen Faucet',
            system: 'Water Service',
            category: 'Fixture',
            location: 'Kitchen',
            parent_area: '',
            item_slug: 'kitchen-kitchen-faucet',
        },
        {
            name: 'Air Gap',
            system: 'Plumbing',
            category: 'Component',
            location: 'Kitchen',
            parent_area: '',
            item_slug: 'kitchen-air-gap',
        },
    ]);

    assert(!preview.rowsToInsert.some((row) => row.name === 'Kitchen Faucet'), 'Older Kitchen Faucet slug should prevent a duplicate.');
    assert(!preview.rowsToInsert.some((row) => row.name === 'Dishwasher Air Gap'), 'Older Air Gap name should prevent a duplicate Dishwasher Air Gap.');
}

function starterItemsAreScopedToTheRequestedProperty() {
    const preview = buildStarterHomeSetupPreview({
        userId: 'user-1',
        propertyId: 'property-2',
        plan: buildDefaultStarterHomePlan('HOUSE'),
        existingItems: [],
    });

    assert(preview.rowsToInsert.every((row) => row.property_id === 'property-2'), 'Starter rows should be scoped to the selected property.');
}

function existingHomeRecoveryCreatesOnlyMissingCards() {
    const firstRun = previewWith([]);
    const kitchenFaucet = firstRun.rowsToInsert.find((row) => row.name === 'Kitchen Faucet');
    const garbageDisposal = firstRun.rowsToInsert.find((row) => row.name === 'Garbage Disposal');

    assert(kitchenFaucet && garbageDisposal, 'Initial plan should include Kitchen Faucet and Garbage Disposal.');

    const recovery = previewWith([kitchenFaucet, garbageDisposal]);

    assert(!recovery.rowsToInsert.some((row) => row.name === 'Kitchen Faucet'), 'Recovery should skip already present Kitchen Faucet.');
    assert(!recovery.rowsToInsert.some((row) => row.name === 'Garbage Disposal'), 'Recovery should skip already present Garbage Disposal.');
    assert(recovery.rowsToInsert.some((row) => row.name === 'Dishwasher'), 'Recovery should still create missing Dishwasher.');
    assert(formatStarterSetupResult(recovery).includes('already present'), 'Recovery result should report already-present cards.');
}

function kitchenHasDirectItemsAfterSetup() {
    const directKitchenItems = previewWith([]).rowsToInsert.filter((row) =>
        normalize(row.location) === 'kitchen' &&
        normalize(row.category) !== 'area'
    );

    assert(directKitchenItems.length > 0, 'Kitchen area should not be empty after starter setup.');
}

function previewWith(existingItems: Parameters<typeof buildStarterHomeSetupPreview>[0]['existingItems']) {
    return buildStarterHomeSetupPreview({
        userId: 'user-1',
        propertyId: 'property-1',
        plan: buildDefaultStarterHomePlan('HOUSE'),
        existingItems,
    });
}

function normalize(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
