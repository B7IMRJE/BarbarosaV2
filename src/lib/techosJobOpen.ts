export type TechOSJobAuthSnapshot = {
    userId: string;
    error?: unknown;
};

export type TechOSJobOpenResult<T> =
    | { status: 'loaded'; data: T; userId: string; attempts: number }
    | { status: 'unauthenticated'; error?: unknown; attempts: number }
    | { status: 'session-changing'; error?: unknown; attempts: number }
    | { status: 'error'; error: unknown; attempts: number };

type LoadResult<T> = { data: T; error?: unknown };

export async function loadTechOSJobWithStableAuth<T>({
    getAuthSnapshot,
    loadJob,
    wait = defaultWait,
    maxAttempts = 2,
}: {
    getAuthSnapshot: () => Promise<TechOSJobAuthSnapshot>;
    loadJob: (userId: string) => Promise<LoadResult<T>>;
    wait?: (milliseconds: number) => Promise<void>;
    maxAttempts?: number;
}): Promise<TechOSJobOpenResult<T>> {
    const attemptLimit = Math.max(1, maxAttempts);

    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
        let before: TechOSJobAuthSnapshot;

        try {
            before = await getAuthSnapshot();
        } catch (error) {
            if (attempt < attemptLimit) {
                await wait(180);
                continue;
            }
            return { status: 'error', error, attempts: attempt };
        }

        if (!before.userId || before.error) {
            if (attempt < attemptLimit) {
                await wait(180);
                continue;
            }
            return { status: 'unauthenticated', error: before.error, attempts: attempt };
        }

        let loadResult: LoadResult<T>;
        try {
            loadResult = await loadJob(before.userId);
        } catch (error) {
            loadResult = { data: undefined as T, error };
        }

        let after: TechOSJobAuthSnapshot;
        try {
            after = await getAuthSnapshot();
        } catch (error) {
            if (attempt < attemptLimit) {
                await wait(180);
                continue;
            }
            return { status: 'session-changing', error, attempts: attempt };
        }

        if (!after.userId || after.error || after.userId !== before.userId) {
            if (attempt < attemptLimit) {
                await wait(180);
                continue;
            }
            return { status: 'session-changing', error: after.error, attempts: attempt };
        }

        if (loadResult.error) {
            return { status: 'error', error: loadResult.error, attempts: attempt };
        }

        return { status: 'loaded', data: loadResult.data, userId: after.userId, attempts: attempt };
    }

    return { status: 'session-changing', attempts: attemptLimit };
}

function defaultWait(milliseconds: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
