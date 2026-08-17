import { areaTemplates, buildAreaRow, buildStarterRows } from './areaTemplates';
import {
    HomeAreaCreationTimeoutError,
    formatHomeAreaCreationSummary,
    getHomeAreaCreationErrorMessage,
    isHomeAreaDuplicateWriteError,
    orderHomeAreaCreationRows,
    pickHomeAreaRecordOwnerUserId,
    planHomeAreaCreation,
    withHomeAreaCreationTimeout,
} from './homeAreaCreation';

runHomeAreaCreationRegressions().catch((error) => {
    throw error;
});

export async function runHomeAreaCreationRegressions() {
    wholeHomeIsAnExplicitLocationNeutralChoice();
    retryReusesTheExistingAreaAndFillsOnlyMissingStarterItems();
    separateBathroomsCanUseTheSameCanonicalStarterCards();
    nestedStarterRowsAreNotDuplicatedOnRetry();
    starterRowsAreWrittenBeforeTheAreaTriggerRuns();
    concurrentDuplicateWritesBecomeSafeSkips();
    existingRowsAreNeverMutatedByThePlanner();
    platformAdminDirectWriteKeepsTheHomeownerAsRecordOwner();
    await accessConfirmationTimeoutHasRecoveryCopy();
}

function separateBathroomsCanUseTheSameCanonicalStarterCards() {
    const template = requiredTemplate('bathroom');
    const bathroomOne = buildStarterRows('user-1', 'property-1', 'Bathroom 1', template);
    const bathroomTwo = buildStarterRows('user-1', 'property-1', 'Bathroom 2', template);
    const repeatedNames = ['Toilet', 'Bathroom Sink'];

    for (const name of repeatedNames) {
        const first = bathroomOne.find((row) => row.name === name);
        const second = bathroomTwo.find((row) => row.name === name);

        assert(first && second, `Both bathroom fixtures should include ${name}.`);
        assert(first.location !== second.location, `${name} must keep its selected bathroom placement.`);
        assert(first.item_slug !== second.item_slug, `${name} route slugs should remain placement-qualified.`);
        assert(first.starter_template_key === second.starter_template_key, `${name} must retain the same reusable Catalog Deck archetype across rooms.`);
    }
}

function starterRowsAreWrittenBeforeTheAreaTriggerRuns() {
    const template = requiredTemplate('bathroom');
    const area = buildAreaRow('user-1', 'property-1', 'Bathroom 2', 'Plumbing');
    const starters = buildStarterRows('user-1', 'property-1', 'Bathroom 2', template);
    const ordered = orderHomeAreaCreationRows([area, ...starters]);

    assert(ordered.at(-1)?.category === 'Area', 'The area row must be written last so its starter trigger sees the already-created cards.');
    assert(ordered.slice(0, -1).every((row) => row.category !== 'Area'), 'Every starter card should be written before the triggering area row.');
}

function concurrentDuplicateWritesBecomeSafeSkips() {
    assert(isHomeAreaDuplicateWriteError({ code: '23505' }), 'Concurrent unique conflicts should be recognized as idempotent skips.');
    assert(
        formatHomeAreaCreationSummary({ created: 2, skipped: 2 }) === 'Created 2 new items; 2 existing items safely skipped.',
        'The UI should report both created and skipped records without exposing a database error.'
    );
}

function existingRowsAreNeverMutatedByThePlanner() {
    const template = requiredTemplate('bathroom');
    const existingArea = buildAreaRow('user-1', 'property-1', 'Bathroom 1', 'Plumbing');
    const existingToilet = buildStarterRows('user-1', 'property-1', 'Bathroom 1', template)
        .find((row) => row.name === 'Toilet');
    assert(existingToilet, 'Bathroom regression fixture should include Toilet.');
    const before = JSON.stringify([existingArea, existingToilet]);

    planHomeAreaCreation({
        userId: 'user-1',
        propertyId: 'property-1',
        areaName: 'Bathroom 1',
        system: 'Plumbing',
        template,
        includeStarterItems: true,
        existingRows: [existingArea, existingToilet],
    });

    assert(JSON.stringify([existingArea, existingToilet]) === before, 'Gap filling must not update or overwrite existing installed records or their history links.');
}

function platformAdminDirectWriteKeepsTheHomeownerAsRecordOwner() {
    const ownerUserId = pickHomeAreaRecordOwnerUserId([
        { id: '1', user_id: 'guest-user', role: 'guest', created_at: '2026-01-01' },
        { id: '2', user_id: 'homeowner-user', role: 'homeowner', created_at: '2026-02-01' },
        { id: '3', user_id: 'owner-user', role: 'owner', created_at: '2026-03-01' },
    ]);

    assert(ownerUserId === 'owner-user', 'A platform-admin direct write must preserve the active homeowner as the HomeOS record owner.');
}

function wholeHomeIsAnExplicitLocationNeutralChoice() {
    const wholeHome = areaTemplates.find((template) => template.id === 'whole-home');

    assert(wholeHome?.name === 'Whole Home', 'Whole Home should be an explicit Add Area / Container choice.');
    assert(Object.keys(wholeHome?.starterItems || {}).length === 0, 'Whole Home must not fabricate installed equipment or a physical room.');
}

function retryReusesTheExistingAreaAndFillsOnlyMissingStarterItems() {
    const template = requiredTemplate('bathroom');
    const area = buildAreaRow('user-1', 'property-1', 'Bathroom 1', 'Plumbing');
    const starterRows = buildStarterRows('user-1', 'property-1', 'Bathroom 1', template);
    const existingStarter = starterRows.find((row) => row.name === 'Toilet');
    assert(existingStarter, 'Bathroom regression fixture should include Toilet.');

    const plan = planHomeAreaCreation({
        userId: 'user-1',
        propertyId: 'property-1',
        areaName: 'Bathroom 1',
        system: 'Plumbing',
        template,
        includeStarterItems: true,
        existingRows: [area, existingStarter],
    });

    assert(plan.duplicateAreaExists, 'A retry should recognize the area created by the first attempt.');
    assert(!plan.rowsToInsert.some((row) => row.category === 'Area'), 'A retry must not create a duplicate area.');
    assert(!plan.rowsToInsert.some((row) => row.name === 'Toilet'), 'A retry must not duplicate an existing starter card.');
    assert(plan.rowsToInsert.length === starterRows.length - 1, 'A retry should safely fill only the missing starter cards.');
}

function nestedStarterRowsAreNotDuplicatedOnRetry() {
    const template = requiredTemplate('kitchen');
    const nested = buildStarterRows('user-1', 'property-1', 'Kitchen', template)
        .find((row) => Boolean(row.parent_area) && row.location !== 'Kitchen');
    assert(nested, 'Kitchen regression fixture should include a nested starter part.');

    const plan = planHomeAreaCreation({
        userId: 'user-1',
        propertyId: 'property-1',
        areaName: 'Kitchen',
        system: 'Plumbing',
        template,
        includeStarterItems: true,
        existingRows: [
            buildAreaRow('user-1', 'property-1', 'Kitchen', 'Plumbing'),
            nested,
        ],
    });

    assert(!plan.rowsToInsert.some((row) => row.item_slug === nested.item_slug), 'Nested starter cards must remain idempotent on retry.');
}

async function accessConfirmationTimeoutHasRecoveryCopy() {
    let timeoutError: unknown = null;

    try {
        await withHomeAreaCreationTimeout(new Promise<never>(() => undefined), 'access', 1);
    } catch (error) {
        timeoutError = error;
    }

    assert(timeoutError instanceof HomeAreaCreationTimeoutError, 'A stalled company access check should time out.');
    assert(/try again/i.test(getHomeAreaCreationErrorMessage(timeoutError)), 'Timeout copy should provide an explicit retry path.');
    assert(/reused safely/i.test(getHomeAreaCreationErrorMessage(timeoutError)), 'Timeout copy should explain idempotent retry behavior.');
}

function requiredTemplate(id: string) {
    const template = areaTemplates.find((candidate) => candidate.id === id);
    assert(template, `Missing ${id} area template.`);
    return template;
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
