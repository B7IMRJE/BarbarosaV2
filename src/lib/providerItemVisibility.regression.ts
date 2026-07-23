import {
    buildHomeDashboardSystemTiles,
} from './homeDashboardSystems';
import {
    formatDirectItemsEmptyMessage,
    resolveAreaVisibleItems,
} from './providerItemVisibility';
import {
    STARTER_RECOVERY_PROVIDER_MESSAGE,
    resolveStarterRecoveryOpenAction,
} from './starterRecoveryConfirmation';

export function runProviderItemVisibilityRegressions() {
    homeownerKitchenQueryFindsPlumbingKitchenFaucet();
    providerWaterServiceKitchenFindsTheSameItem();
    homeownerAndProviderResolveSamePropertyScopedItemIds();
    providerCannotTreatAnotherPropertyAsVisibleRows();
    providerRecoveryRemainsBlocked();
    providerQueryFailureIsNotDisplayedAsEmptyList();
    providerDashboardShowsCustomTopLevelAreas();
    childContainerDoesNotBecomeDuplicateRootTile();
    canonicalSystemsDoNotBecomeDuplicateRootTiles();
    nestedContainerShowsDirectItems();
}

function homeownerKitchenQueryFindsPlumbingKitchenFaucet() {
    const result = resolveAreaVisibleItems(homeItems, {
        systemName: 'Plumbing',
        areaName: 'Kitchen',
    });

    assert(
        result.directItems.some((item) => item.id === 'item-kitchen-faucet'),
        'Homeowner Kitchen area should find a Plumbing-system Kitchen Faucet.'
    );
}

function providerWaterServiceKitchenFindsTheSameItem() {
    const result = resolveAreaVisibleItems(homeItems, {
        systemName: 'Water Service',
        areaName: 'Kitchen',
    });

    assert(
        result.directItems.some((item) => item.id === 'item-kitchen-faucet'),
        'Provider Water Service -> Kitchen should find a Plumbing-system Kitchen Faucet.'
    );
}

function homeownerAndProviderResolveSamePropertyScopedItemIds() {
    const homeownerResult = resolveAreaVisibleItems(homeItems, {
        systemName: 'Plumbing',
        areaName: 'Kitchen',
    });
    const providerResult = resolveAreaVisibleItems(homeItems, {
        systemName: 'Water Service',
        areaName: 'Kitchen',
    });

    assert(
        itemIds(homeownerResult.directItems) === itemIds(providerResult.directItems),
        'Homeowner and provider area views should resolve the same property-scoped Kitchen item ids.'
    );
}

function providerCannotTreatAnotherPropertyAsVisibleRows() {
    const selectedPropertyRows = homeItems.filter((item) => item.property_id === 'property-1');
    const otherPropertyRows = homeItems.filter((item) => item.property_id === 'property-2');
    const selectedResult = resolveAreaVisibleItems(selectedPropertyRows, {
        systemName: 'Water Service',
        areaName: 'Kitchen',
    });
    const otherPropertyResult = resolveAreaVisibleItems(otherPropertyRows, {
        systemName: 'Water Service',
        areaName: 'Kitchen',
    });

    assert(
        selectedResult.directItems.some((item) => item.id === 'item-kitchen-faucet'),
        'Selected provider property should include its Kitchen Faucet.'
    );
    assert(
        !selectedResult.directItems.some((item) => item.id === 'other-property-faucet'),
        'Provider visibility should not mix another property into the selected property result.'
    );
    assert(
        otherPropertyResult.directItems.some((item) => item.id === 'other-property-faucet'),
        'Another property should only appear when that property is the selected scoped input.'
    );
}

function providerRecoveryRemainsBlocked() {
    const action = resolveStarterRecoveryOpenAction({
        hasPreview: true,
        providerMode: true,
        recovering: false,
    });

    assert(action.type === 'provider_blocked', 'Provider mode starter recovery should remain blocked.');
    assert(action.message === STARTER_RECOVERY_PROVIDER_MESSAGE, 'Provider recovery should keep the approved workflow message.');
}

function providerQueryFailureIsNotDisplayedAsEmptyList() {
    const failedMessage = formatDirectItemsEmptyMessage({
        providerMode: true,
        queryFailed: true,
        returnedRowCount: null,
    });
    const noRowsMessage = formatDirectItemsEmptyMessage({
        providerMode: true,
        queryFailed: false,
        returnedRowCount: 0,
    });

    assert(!failedMessage.toLowerCase().includes('no direct items yet'), 'Provider query failure should not be shown as an empty item list.');
    assert(!noRowsMessage.toLowerCase().includes('no direct items yet'), 'Provider zero visible rows should not use the homeowner empty list copy.');
}

function providerDashboardShowsCustomTopLevelAreas() {
    const tiles = buildHomeDashboardSystemTiles(customHierarchyItems);

    assert(tiles.some((tile) => tile.key === 'Main Home'), 'Provider dashboard should show Main Home as a custom top-level hierarchy.');
}

function childContainerDoesNotBecomeDuplicateRootTile() {
    const tiles = buildHomeDashboardSystemTiles(customHierarchyItems);

    assert(!tiles.some((tile) => tile.key === 'Repipe'), 'Child Repipe container should not become a duplicate root dashboard tile.');
}

function canonicalSystemsDoNotBecomeDuplicateRootTiles() {
    const tiles = buildHomeDashboardSystemTiles([
        ...customHierarchyItems,
        {
            id: 'plumbing-root',
            property_id: 'property-1',
            name: 'Plumbing',
            system: 'plumbing',
            item_slug: 'plumbing',
            category: 'Area',
            location: 'Plumbing',
            parent_area: '',
        },
        {
            id: 'hvac-root',
            property_id: 'property-1',
            name: 'HVAC',
            system: 'hvac',
            item_slug: 'hvac',
            category: 'Area',
            location: 'HVAC',
            parent_area: '',
        },
    ]);

    assert(
        tiles.filter((tile) => tile.key === 'Plumbing').length === 1,
        'Plumbing records must resolve to the single Water Service dashboard card.'
    );
    assert(
        tiles.filter((tile) => tile.key === 'HVAC').length === 1,
        'HVAC records must resolve to the single AC Service dashboard card.'
    );
    assert(!tiles.some((tile) => tile.label === 'Plumbing'), 'A duplicate Plumbing card must not be added.');
    assert(!tiles.some((tile) => tile.label === 'HVAC'), 'A duplicate HVAC card must not be added.');
}

function nestedContainerShowsDirectItems() {
    const result = resolveAreaVisibleItems(customHierarchyItems, {
        systemName: 'Main Home',
        areaName: 'Repipe',
        parentAreaName: 'Main Home',
    });

    assert(
        result.directItems.some((item) => item.id === 'whole-house-repipe'),
        'Nested Repipe container should show Whole House Repipe as a direct item.'
    );
}

function itemIds(items: Array<{ id?: string | null }>) {
    return items.map((item) => item.id || '').filter(Boolean).sort().join('|');
}

const homeItems = [
    {
        id: 'area-kitchen',
        property_id: 'property-1',
        name: 'Kitchen',
        system: 'Plumbing',
        item_slug: 'kitchen',
        category: 'Area',
        location: 'Kitchen',
        parent_area: '',
    },
    {
        id: 'item-kitchen-faucet',
        property_id: 'property-1',
        name: 'Kitchen Faucet',
        system: 'Plumbing',
        item_slug: 'kitchen-kitchen-faucet',
        category: 'Fixture',
        location: 'Kitchen',
        parent_area: '',
    },
    {
        id: 'item-kitchen-sink',
        property_id: 'property-1',
        name: 'Kitchen Sink',
        system: 'Water Service',
        item_slug: 'kitchen-kitchen-sink',
        category: 'Fixture',
        location: 'Kitchen',
        parent_area: '',
    },
    {
        id: 'item-dishwasher',
        property_id: 'property-1',
        name: 'Dishwasher',
        system: 'Appliances',
        item_slug: 'kitchen-dishwasher',
        category: 'Equipment',
        location: 'Kitchen',
        parent_area: '',
    },
    {
        id: 'item-kitchen-drain',
        property_id: 'property-1',
        name: 'Kitchen Drain / P-Trap',
        system: 'Drains / Sewer',
        item_slug: 'kitchen-kitchen-drain-p-trap',
        category: 'Fixture',
        location: 'Kitchen',
        parent_area: '',
    },
    {
        id: 'other-property-faucet',
        property_id: 'property-2',
        name: 'Kitchen Faucet',
        system: 'Plumbing',
        item_slug: 'kitchen-kitchen-faucet',
        category: 'Fixture',
        location: 'Kitchen',
        parent_area: '',
    },
];

const customHierarchyItems = [
    {
        id: 'main-home-root',
        property_id: 'property-1',
        name: 'Main Home',
        system: 'Main Home',
        item_slug: 'main-home',
        category: 'Area',
        location: 'Main Home',
        parent_area: '',
    },
    {
        id: 'repipe-container',
        property_id: 'property-1',
        name: 'Repipe',
        system: 'Main Home',
        item_slug: 'main-home-repipe',
        category: 'Area',
        location: 'Main Home',
        parent_area: 'Main Home',
    },
    {
        id: 'whole-house-repipe',
        property_id: 'property-1',
        name: 'Whole House Repipe',
        system: 'Main Home',
        item_slug: 'main-home-repipe-whole-house-repipe',
        category: 'Service',
        location: 'Main Home',
        parent_area: 'Repipe',
    },
];

runProviderItemVisibilityRegressions();

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
