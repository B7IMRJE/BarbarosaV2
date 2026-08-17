export const HOMEOS_SIGN_OUT_SCOPE = 'local' as const;

type SignOutError = {
    message?: string | null;
};

type HomeOSSignOutDependencies = {
    signOut: (scope: typeof HOMEOS_SIGN_OUT_SCOPE) => Promise<{ error: SignOutError | null }>;
    clearPendingInviteState: () => void | Promise<void>;
    clearSessionActivity: () => void | Promise<void>;
    replaceWithLogin: () => void;
};

export type HomeOSSignOutResult =
    | { status: 'signed_out' }
    | { status: 'failed'; message: string };

export async function signOutFromHomeOS({
    signOut,
    clearPendingInviteState,
    clearSessionActivity,
    replaceWithLogin,
}: HomeOSSignOutDependencies): Promise<HomeOSSignOutResult> {
    try {
        const { error } = await signOut(HOMEOS_SIGN_OUT_SCOPE);

        if (error) {
            return {
                status: 'failed',
                message: normalizeSignOutError(error.message),
            };
        }
    } catch (error) {
        return {
            status: 'failed',
            message: normalizeSignOutError(error instanceof Error ? error.message : null),
        };
    }

    // Authentication is already ended. Local UX cleanup must never keep a user
    // on an authenticated screen if device storage is temporarily unavailable.
    await Promise.allSettled([
        Promise.resolve().then(clearPendingInviteState),
        Promise.resolve().then(clearSessionActivity),
    ]);
    replaceWithLogin();

    return { status: 'signed_out' };
}

function normalizeSignOutError(message?: string | null) {
    const normalized = String(message || '').trim();

    return normalized || 'Sign out could not be completed.';
}
