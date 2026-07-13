import {
    formatStarterSetupResult,
    type StarterHomeSetupPlanResult,
} from './starterHomeSetup';

export const STARTER_RECOVERY_PROVIDER_MESSAGE =
    'Provider mode starter recovery must use an approved provider publishing workflow. Nothing was changed in this customer HomeOS.';
export const STARTER_RECOVERY_CONFIRMATION_TITLE = 'Add missing starter equipment?';
export const STARTER_RECOVERY_CONFIRMATION_BODY =
    'This creates unconfirmed checklist cards only. It will not overwrite existing items, and it will not add model numbers, serial numbers, photos, documents, or history.';
export const STARTER_RECOVERY_CHECKING_MESSAGE = 'Checking starter equipment...';
export const STARTER_RECOVERY_CREATING_MESSAGE = 'Creating starter equipment...';
export const STARTER_RECOVERY_FALLBACK_ERROR = 'Starter equipment could not be created.';

export type StarterRecoveryOpenAction =
    | { type: 'open_confirmation' }
    | { type: 'provider_blocked'; message: string }
    | { type: 'noop' };

export function resolveStarterRecoveryOpenAction({
    hasPreview,
    providerMode,
    recovering,
}: {
    hasPreview: boolean;
    providerMode: boolean;
    recovering: boolean;
}): StarterRecoveryOpenAction {
    if (!hasPreview || recovering) return { type: 'noop' };
    if (providerMode) return { type: 'provider_blocked', message: STARTER_RECOVERY_PROVIDER_MESSAGE };

    return { type: 'open_confirmation' };
}

export function starterRecoveryCanSubmit({
    planCount,
    recovering,
}: {
    planCount: number;
    recovering: boolean;
}) {
    return planCount > 0 && !recovering;
}

export async function runStarterRecoverySubmission({
    closeConfirmation,
    create,
    isSubmitting,
    planCount,
    reload,
    setMessage,
    setSubmitting,
}: {
    closeConfirmation: () => void;
    create: () => Promise<StarterHomeSetupPlanResult>;
    isSubmitting: () => boolean;
    planCount: number;
    reload: () => Promise<void>;
    setMessage: (message: string) => void;
    setSubmitting: (submitting: boolean) => void;
}): Promise<{ status: 'ignored' | 'success' | 'failure'; message?: string }> {
    if (!starterRecoveryCanSubmit({ planCount, recovering: isSubmitting() })) {
        return { status: 'ignored' };
    }

    setSubmitting(true);
    setMessage(STARTER_RECOVERY_CHECKING_MESSAGE);

    try {
        const result = await create();
        const message = formatStarterSetupResult(result);

        setMessage(message);
        closeConfirmation();
        await reload();

        return { status: 'success', message };
    } catch (error) {
        const message = starterRecoveryErrorMessage(error);

        setMessage(message);

        return { status: 'failure', message };
    } finally {
        setSubmitting(false);
    }
}

export function starterRecoveryErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim()) return error.message;

    return STARTER_RECOVERY_FALLBACK_ERROR;
}
