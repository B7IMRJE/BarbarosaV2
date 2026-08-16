import { loadTechOSJobWithStableAuth, type TechOSJobAuthSnapshot } from './techosJobOpen';

void run();

async function run() {
    await verifiesAccountSwitchRestartsTheRead();
    await verifiesSessionInitializationGetsOneBoundedRetry();
    await verifiesStableAuthorizationErrorsAreNotRetried();
    console.log('TechOS stable job-open regression checks passed.');
}

async function verifiesAccountSwitchRestartsTheRead() {
    const snapshots: TechOSJobAuthSnapshot[] = [
        { userId: 'old-user' },
        { userId: 'new-user' },
        { userId: 'new-user' },
        { userId: 'new-user' },
    ];
    const loadedFor: string[] = [];
    const result = await loadTechOSJobWithStableAuth({
        getAuthSnapshot: async () => snapshots.shift() || { userId: 'new-user' },
        loadJob: async (userId) => {
            loadedFor.push(userId);
            return { data: { id: `${userId}-job` } };
        },
        wait: async () => undefined,
    });

    assert(result.status === 'loaded' && result.data.id === 'new-user-job', 'A job read started under the previous account must never be published after the account changes.');
    assert(loadedFor.join(',') === 'old-user,new-user', 'An account transition should restart the read once under the new authenticated identity.');
}

async function verifiesSessionInitializationGetsOneBoundedRetry() {
    const snapshots: TechOSJobAuthSnapshot[] = [
        { userId: '', error: new Error('Auth session missing') },
        { userId: 'ready-user' },
        { userId: 'ready-user' },
    ];
    const result = await loadTechOSJobWithStableAuth({
        getAuthSnapshot: async () => snapshots.shift() || { userId: 'ready-user' },
        loadJob: async () => ({ data: { id: 'ready-job' } }),
        wait: async () => undefined,
    });

    assert(result.status === 'loaded' && result.attempts === 2, 'A short session initialization gap should recover without requiring the user to open the job twice.');
}

async function verifiesStableAuthorizationErrorsAreNotRetried() {
    let loadCount = 0;
    const denied = new Error('Not authorized for this job');
    const result = await loadTechOSJobWithStableAuth({
        getAuthSnapshot: async () => ({ userId: 'stable-user' }),
        loadJob: async () => {
            loadCount += 1;
            return { data: null, error: denied };
        },
        wait: async () => undefined,
    });

    assert(result.status === 'error' && result.error === denied, 'A real stable-account authorization error must remain an error.');
    assert(loadCount === 1, 'A stable authorization denial must not be retried or weakened.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
