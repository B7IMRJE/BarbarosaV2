import {
    authenticationMethodsIncludePassword,
    hasCompletedInvitationPasswordSetup,
    INVITATION_PASSWORD_SETUP_COMPLETED_AT_KEY,
    shouldRequireInvitationPasswordSetup,
} from './invitation-password-setup-core';

assert(
    shouldRequireInvitationPasswordSetup({
        pending: true,
        authenticationMethods: [{ method: 'otp', timestamp: 1 }],
    }),
    'A fresh invitation-code session should require its first password before sign-out.'
);

assert(
    !shouldRequireInvitationPasswordSetup({
        pending: true,
        authenticationMethods: [{ method: 'password', timestamp: 1 }],
    }),
    'A verified password login must clear a stale invitation setup marker.'
);

assert(
    !shouldRequireInvitationPasswordSetup({
        pending: true,
        pendingStartedAt: '2026-08-12T12:00:00.000Z',
        userMetadata: { [INVITATION_PASSWORD_SETUP_COMPLETED_AT_KEY]: '2026-08-12T12:00:00.000Z' },
        authenticationMethods: [{ method: 'otp', timestamp: 1 }],
    }),
    'Server-backed completion metadata must prevent repeat password creation prompts.'
);

assert(
    shouldRequireInvitationPasswordSetup({
        pending: true,
        pendingStartedAt: '2026-08-13T12:00:00.000Z',
        userMetadata: { [INVITATION_PASSWORD_SETUP_COMPLETED_AT_KEY]: '2026-08-12T12:00:00.000Z' },
        authenticationMethods: [{ method: 'magiclink', timestamp: 1 }],
    }),
    'A later recovery-code session should still require a new password even if an older setup completed.'
);

assert(
    !shouldRequireInvitationPasswordSetup({ pending: false }),
    'Accounts without a pending invitation setup must sign out normally.'
);

assert(authenticationMethodsIncludePassword(['password']), 'RFC-style AMR strings should be supported.');
assert(!authenticationMethodsIncludePassword([{ method: 'magiclink' }]), 'Magic-link sessions are not password proof.');
assert(
    hasCompletedInvitationPasswordSetup({ [INVITATION_PASSWORD_SETUP_COMPLETED_AT_KEY]: 'complete' }),
    'Completion metadata should be recognized.'
);

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

console.log('Invitation password setup regression checks passed.');
