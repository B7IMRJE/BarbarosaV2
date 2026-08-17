import { areaTemplates, buildAreaRow, buildStarterRows } from './areaTemplates';
import {
    HomeAreaCreationTimeoutError,
    getHomeAreaCreationErrorMessage,
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
    nestedStarterRowsAreNotDuplicatedOnRetry();
    platformAdminDirectWriteKeepsTheHomeownerAsRecordOwner();
    await accessConfirmationTimeoutHasRecoveryCopy();
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
