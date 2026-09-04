// Only identity references belong in recovery state. Never retain access codes
// or copy raw database errors into recovery messages, logs, or local storage.
export type PendingHomeSetup = { propertyId: string; userId: string };

export type HomeCreationRecoveryOptions = {
    pendingHome?: PendingHomeSetup | null;
    onIdentityReady?: (home: PendingHomeSetup) => void;
};

export class IncompleteHomeSetupError extends Error {
    readonly home: PendingHomeSetup;

    constructor(home: PendingHomeSetup) {
        super('Your home already exists, but setup is incomplete. Choose Retry Home Setup to finish this same home. A second home will not be created.');
        this.name = 'IncompleteHomeSetupError';
        this.home = home;
    }
}

export async function runRecoverableHomeCreation({
    userId,
    createIdentity,
    finishSetup,
    pendingHome,
    onIdentityReady,
}: HomeCreationRecoveryOptions & {
    userId: string;
    createIdentity: () => Promise<string>;
    finishSetup: (propertyId: string) => Promise<void>;
}) {
    if (!userId.trim()) throw new Error('Please log in to finish your home setup.');
    if (pendingHome && pendingHome.userId !== userId) {
        throw new Error('This unfinished home belongs to a different sign-in. Return to the original account to finish setup.');
    }

    const propertyId = pendingHome?.propertyId || await createIdentity();
    if (!propertyId.trim()) throw new Error('We could not confirm your home was created. Please try again.');
    const home = { propertyId, userId };

    // Report the successful identity step BEFORE any later request can fail.
    // Reuse this identity on retries, including after a navigation failure.
    onIdentityReady?.(home);
    try {
        await finishSetup(propertyId);
    } catch {
        throw new IncompleteHomeSetupError(home);
    }
    return propertyId;
}
