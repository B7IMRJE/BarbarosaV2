import {
    isCustomerInvitePending,
    isCustomerInviteTerminal,
} from './customerInviteStatus';

runCustomerInviteStatusRegressions();

export function runCustomerInviteStatusRegressions() {
    pendingInviteContinues();
    acceptedInviteCannotResume();
    revokedAndExpiredInvitesCannotResume();
    missingInviteCannotResume();
}

function pendingInviteContinues() {
    assert(
        isCustomerInvitePending({
            status: 'pending',
            expires_at: '2026-08-01T00:00:00.000Z',
        }, Date.parse('2026-07-22T22:00:00.000Z')),
        'A live pending customer invite should remain resumable.'
    );
}

function acceptedInviteCannotResume() {
    const invite = {
        status: 'accepted',
        expires_at: '2026-08-01T00:00:00.000Z',
    };

    assert(isCustomerInviteTerminal(invite), 'An accepted customer invite should be terminal.');
    assert(!isCustomerInvitePending(invite), 'An accepted customer invite must not resume after login.');
}

function revokedAndExpiredInvitesCannotResume() {
    assert(
        isCustomerInviteTerminal({ status: 'revoked' }),
        'A revoked customer invite should be terminal.'
    );
    assert(
        isCustomerInviteTerminal({
            status: 'pending',
            expires_at: '2026-07-01T00:00:00.000Z',
        }, Date.parse('2026-07-22T22:00:00.000Z')),
        'An expired pending invite should be terminal.'
    );
}

function missingInviteCannotResume() {
    assert(isCustomerInviteTerminal(null), 'A missing customer invite should be terminal.');
    assert(!isCustomerInvitePending(null), 'A missing customer invite must not resume after login.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
