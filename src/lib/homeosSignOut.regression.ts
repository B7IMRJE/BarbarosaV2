import {
    HOMEOS_SIGN_OUT_SCOPE,
    signOutFromHomeOS,
} from './homeosSignOut';

void run();

async function run() {
    await signsOutTheCurrentDeviceAndReturnsToLogin();
    await staysOnHomeOSWhenAuthenticationDoesNotEnd();
    await localCleanupCannotTrapAnAlreadySignedOutUser();
    console.log('HomeOS sign-out regression checks passed.');
}

async function signsOutTheCurrentDeviceAndReturnsToLogin() {
    const events: string[] = [];
    const result = await signOutFromHomeOS({
        signOut: async (scope) => {
            events.push(`sign-out:${scope}`);
            return { error: null };
        },
        clearPendingInviteState: () => {
            events.push('clear-invite');
        },
        clearSessionActivity: async () => {
            events.push('clear-activity');
        },
        replaceWithLogin: () => {
            events.push('login');
        },
    });

    assert(HOMEOS_SIGN_OUT_SCOPE === 'local', 'HomeOS logout must end the current device session without signing out unrelated devices.');
    assert(result.status === 'signed_out', 'Successful authentication logout should report signed out.');
    assert(events[0] === 'sign-out:local', 'Authentication must end before local cleanup or navigation.');
    assert(events.includes('clear-invite') && events.includes('clear-activity'), 'Successful logout must clear local invite and activity state.');
    assert(events.at(-1) === 'login', 'Successful logout must replace HomeOS with the sign-in route.');
}

async function staysOnHomeOSWhenAuthenticationDoesNotEnd() {
    let navigated = false;
    let cleaned = false;
    const result = await signOutFromHomeOS({
        signOut: async () => ({ error: { message: 'Network unavailable' } }),
        clearPendingInviteState: () => {
            cleaned = true;
        },
        clearSessionActivity: () => {
            cleaned = true;
        },
        replaceWithLogin: () => {
            navigated = true;
        },
    });

    assert(result.status === 'failed', 'An authentication sign-out error must remain visible to the caller.');
    assert(!navigated, 'A failed logout must not falsely navigate to sign-in.');
    assert(!cleaned, 'A failed logout must not clear local state for a session that is still active.');
}

async function localCleanupCannotTrapAnAlreadySignedOutUser() {
    let navigated = false;
    const result = await signOutFromHomeOS({
        signOut: async () => ({ error: null }),
        clearPendingInviteState: () => {
            throw new Error('Storage unavailable');
        },
        clearSessionActivity: async () => {
            throw new Error('Storage unavailable');
        },
        replaceWithLogin: () => {
            navigated = true;
        },
    });

    assert(result.status === 'signed_out', 'A completed authentication logout must stay completed when local cleanup fails.');
    assert(navigated, 'A signed-out user must still be returned to login when local cleanup fails.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
