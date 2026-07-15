import {
    buildHomeownerStatusMessage,
    createStatusTransitionIdempotencyKey,
    getHomeownerStatusTemplate,
} from './serviceRequestStatusNotifications';

runServiceRequestStatusNotificationRegressions();

export function runServiceRequestStatusNotificationRegressions() {
    onMyWayUsesHomeownerSafeCopy();
    onMyWayEtaUsesApproximateRange();
    internalOperationalStatusesStayPrivate();
    remainingHomeownerVisibleStatusesAreMapped();
    delayedCopyHidesLunchDetails();
    idempotencyKeyIncludesSlotStatusVersionAndRecipient();
}

function onMyWayUsesHomeownerSafeCopy() {
    const template = getHomeownerStatusTemplate('on_my_way');
    const message = buildHomeownerStatusMessage({
        status: 'on_my_way',
        technicianName: 'Michael',
    });

    assert(template?.status === 'technician_on_the_way', 'On My Way should map to Technician On the Way.');
    assert(message === 'Your technician, Michael, is on the way.', 'On My Way copy should use the approved homeowner wording.');
}

function onMyWayEtaUsesApproximateRange() {
    const message = buildHomeownerStatusMessage({
        status: 'on_my_way',
        technicianName: 'Michael',
        etaRange: '20-30 minutes',
    });

    assert(
        message === 'Your technician, Michael, is on the way and is expected to arrive in approximately 20-30 minutes.',
        'On My Way ETA copy should use an approximate range.'
    );
    assert(!message.includes('at 2:14'), 'On My Way copy should not promise an exact minute.');
}

function internalOperationalStatusesStayPrivate() {
    ['lunch', 'break', 'office_review', 'assistance_needed', 'custom'].forEach((status) => {
        assert(getHomeownerStatusTemplate(status) === null, `${status} should not automatically become homeowner-visible.`);
    });
}

function remainingHomeownerVisibleStatusesAreMapped() {
    const expectedStatuses = [
        'scheduled',
        'assigned',
        'arriving_soon',
        'arrived',
        'in_progress',
        'estimate_needed',
        'completed',
    ];

    expectedStatuses.forEach((status) => {
        assert(getHomeownerStatusTemplate(status)?.notifyHomeowner, `${status} should have a homeowner-visible template.`);
    });
}

function delayedCopyHidesLunchDetails() {
    const template = getHomeownerStatusTemplate('running_late');
    const message = buildHomeownerStatusMessage({
        status: 'running_late',
        technicianName: 'Michael',
    }).toLowerCase();

    assert(template?.status === 'technician_delayed', 'Running late should map to Technician Delayed.');
    assert(message.includes('temporarily delayed'), 'Delayed copy should explain the customer-visible state.');
    assert(!message.includes('lunch'), 'Delayed copy should not expose meal details.');
}

function idempotencyKeyIncludesSlotStatusVersionAndRecipient() {
    const key = createStatusTransitionIdempotencyKey({
        scheduleSlotId: 'slot-1',
        status: 'On My Way',
        version: 'updated-at-1',
        recipientUserId: 'homeowner-1',
    });

    assert(
        key === 'homeowner-status:slot-1:on_my_way:updated-at-1:homeowner-1',
        'Status transition idempotency should include slot, status, version, and recipient.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
