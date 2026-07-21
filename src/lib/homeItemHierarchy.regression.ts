import {
    filterChildHomeItems,
    isChildHomeItem,
    resolveHomeItemChildCreateContext,
    type HomeItemHierarchyRecord,
} from './homeItemHierarchy';

runHomeItemHierarchyRegressions();

export function runHomeItemHierarchyRegressions() {
    stoveChildrenUseTheStoveAsTheirImmediateLocation();
    childFilteringFindsGasValveUnderStove();
    childFilteringRejectsSiblingAndArchivedRecords();
    sameRecordIsNeverItsOwnChild();
    legacyParentOnlyChildShapeStillLoadsUnderItem();
}

function stoveChildrenUseTheStoveAsTheirImmediateLocation() {
    const context = resolveHomeItemChildCreateContext(stoveItem());

    assert(context.location === 'Stove', 'Child components should be located inside the current item.');
    assert(context.parentArea === 'Kitchen', 'Child components should retain the current item area as parent area.');
}

function childFilteringFindsGasValveUnderStove() {
    const child = gasValveChild();

    assert(isChildHomeItem(child, stoveItem()), 'Gas valve should be a child of Stove.');
}

function childFilteringRejectsSiblingAndArchivedRecords() {
    const children = filterChildHomeItems([
        gasValveChild(),
        {
            id: 'sink',
            item_slug: 'sink',
            name: 'Sink Angle Stop',
            location: 'Kitchen',
            parent_area: null,
            archived: false,
        },
        {
            id: 'old-valve',
            item_slug: 'old-valve',
            name: 'Old Gas Valve',
            location: 'Stove',
            parent_area: 'Kitchen',
            archived: true,
        },
    ], stoveItem());

    assert(children.length === 1, 'Only active children directly under Stove should be returned.');
    assert(children[0]?.name === 'Gas Valve', 'The gas valve should be the visible child.');
}

function sameRecordIsNeverItsOwnChild() {
    assert(!isChildHomeItem(stoveItem(), stoveItem()), 'An item should not render itself as a child.');
}

function legacyParentOnlyChildShapeStillLoadsUnderItem() {
    const legacyChild: HomeItemHierarchyRecord = {
        id: 'legacy',
        item_slug: 'legacy',
        name: 'Legacy Valve',
        location: '',
        parent_area: 'Stove',
        archived: false,
    };

    assert(isChildHomeItem(legacyChild, stoveItem()), 'Legacy child records using parent_area only should still load.');
}

function stoveItem(): HomeItemHierarchyRecord {
    return {
        id: 'stove',
        item_slug: 'stove',
        name: 'Stove',
        system: 'Gas',
        category: 'Equipment',
        location: 'Kitchen',
        parent_area: null,
        archived: false,
    };
}

function gasValveChild(): HomeItemHierarchyRecord {
    return {
        id: 'gas-valve',
        item_slug: 'gas-valve',
        name: 'Gas Valve',
        system: 'Gas',
        category: 'Component',
        location: 'Stove',
        parent_area: 'Kitchen',
        archived: false,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
