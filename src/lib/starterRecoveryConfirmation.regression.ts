import {
    STARTER_RECOVERY_PROVIDER_MESSAGE,
    resolveStarterRecoveryOpenAction,
    runStarterRecoverySubmission,
} from './starterRecoveryConfirmation';
import type { StarterHomeSetupPlanResult } from './starterHomeSetup';

void runStarterRecoveryConfirmationRegressions();

export async function runStarterRecoveryConfirmationRegressions() {
    homeownerClickOpensConfirmationOnWeb();
    cancelCreatesNothing();
    providerModeStillCannotCreateRecords();
    await confirmInvokesStarterCreationExactlyOnce();
    await repeatedClicksWhileSavingCannotDuplicateCalls();
    await successReloadsAndUpdatesPreview();
    await failureDisplaysErrorAndPermitsRetry();
}

function homeownerClickOpensConfirmationOnWeb() {
    const action = resolveStarterRecoveryOpenAction({
        hasPreview: true,
        providerMode: false,
        recovering: false,
    });

    assert(action.type === 'open_confirmation', 'Homeowner starter recovery click should open an in-app confirmation.');
}

function cancelCreatesNothing() {
    let confirmationVisible = false;
    let createCalls = 0;
    const action = resolveStarterRecoveryOpenAction({
        hasPreview: true,
        providerMode: false,
        recovering: false,
    });

    if (action.type === 'open_confirmation') confirmationVisible = true;
    confirmationVisible = false;

    assert(confirmationVisible === false, 'Cancel should close the starter recovery confirmation.');
    assert(createCalls === 0, 'Cancel should not create starter equipment.');
}

function providerModeStillCannotCreateRecords() {
    const action = resolveStarterRecoveryOpenAction({
        hasPreview: true,
        providerMode: true,
        recovering: false,
    });

    assert(action.type === 'provider_blocked', 'Provider mode should not open the direct homeowner starter recovery submit flow.');
    assert(action.message === STARTER_RECOVERY_PROVIDER_MESSAGE, 'Provider mode should keep the approved workflow message.');
}

async function confirmInvokesStarterCreationExactlyOnce() {
    let submitting = false;
    let createCalls = 0;

    await runStarterRecoverySubmission({
        closeConfirmation: () => {},
        create: async () => {
            createCalls += 1;
            return fakeResult();
        },
        isSubmitting: () => submitting,
        planCount: 1,
        reload: async () => {},
        setMessage: () => {},
        setSubmitting: (nextSubmitting) => {
            submitting = nextSubmitting;
        },
    });

    assert(createCalls === 1, 'Confirm should invoke starter creation exactly once.');
}

async function repeatedClicksWhileSavingCannotDuplicateCalls() {
    let submitting = false;
    let createCalls = 0;
    let finishCreate: () => void = () => {
        throw new Error('Starter recovery test create callback was not registered.');
    };

    const firstSubmit = runStarterRecoverySubmission({
        closeConfirmation: () => {},
        create: async () => {
            createCalls += 1;
            await new Promise<void>((resolve) => {
                finishCreate = resolve;
            });

            return fakeResult();
        },
        isSubmitting: () => submitting,
        planCount: 1,
        reload: async () => {},
        setMessage: () => {},
        setSubmitting: (nextSubmitting) => {
            submitting = nextSubmitting;
        },
    });
    const secondSubmit = runStarterRecoverySubmission({
        closeConfirmation: () => {},
        create: async () => {
            createCalls += 1;
            return fakeResult();
        },
        isSubmitting: () => submitting,
        planCount: 1,
        reload: async () => {},
        setMessage: () => {},
        setSubmitting: (nextSubmitting) => {
            submitting = nextSubmitting;
        },
    });

    finishCreate();

    await Promise.all([firstSubmit, secondSubmit]);

    assert(createCalls === 1, 'Repeated starter recovery clicks while saving should not create duplicate calls.');
}

async function successReloadsAndUpdatesPreview() {
    let submitting = false;
    let previewStillMissingRecords: boolean = true;
    let reloadCalls = 0;
    let closed = false;
    let latestMessage = '';

    await runStarterRecoverySubmission({
        closeConfirmation: () => {
            closed = true;
        },
        create: async () => fakeResult({ createdItemRows: 13, createdAreaRows: 2, alreadyPresentAreaRows: 3 }),
        isSubmitting: () => submitting,
        planCount: 1,
        reload: async () => {
            reloadCalls += 1;
            previewStillMissingRecords = false;
        },
        setMessage: (message) => {
            latestMessage = message;
        },
        setSubmitting: (nextSubmitting) => {
            submitting = nextSubmitting;
        },
    });

    assert(closed, 'Success should close the starter recovery confirmation.');
    assert(reloadCalls === 1, 'Success should reload area records exactly once.');
    assert(!previewStillMissingRecords, 'Success reload should allow the missing preview to update.');
    assert(latestMessage.includes('13 starter card'), 'Success should report created card count.');
    assert(latestMessage.includes('2 area'), 'Success should report created area count.');
    assert(latestMessage.includes('3 areas already present'), 'Success should report already-present area count.');
}

async function failureDisplaysErrorAndPermitsRetry() {
    let submitting = false;
    let latestMessage = '';
    let createCalls = 0;

    const firstResult = await runStarterRecoverySubmission({
        closeConfirmation: () => {},
        create: async () => {
            createCalls += 1;
            throw new Error('RLS blocked starter insert');
        },
        isSubmitting: () => submitting,
        planCount: 1,
        reload: async () => {},
        setMessage: (message) => {
            latestMessage = message;
        },
        setSubmitting: (nextSubmitting) => {
            submitting = nextSubmitting;
        },
    });

    assert(firstResult.status === 'failure', 'Rejected starter recovery insert should report failure.');
    assert(latestMessage === 'RLS blocked starter insert', 'Failure should show the real user-readable error.');
    assert(submitting === false, 'Failure should re-enable starter recovery retry.');

    const secondResult = await runStarterRecoverySubmission({
        closeConfirmation: () => {},
        create: async () => {
            createCalls += 1;
            return fakeResult();
        },
        isSubmitting: () => submitting,
        planCount: 1,
        reload: async () => {},
        setMessage: (message) => {
            latestMessage = message;
        },
        setSubmitting: (nextSubmitting) => {
            submitting = nextSubmitting;
        },
    });

    assert(secondResult.status === 'success', 'Starter recovery should be retryable after a failure.');
    assert(createCalls === 2, 'Retry should create one additional call after the failed attempt.');
}

function fakeResult(overrides: Partial<StarterHomeSetupPlanResult> = {}): StarterHomeSetupPlanResult {
    return {
        rowsToInsert: [],
        createdAreaRows: 0,
        createdItemRows: 1,
        alreadyPresentAreaRows: 1,
        alreadyPresentItemRows: 1,
        skippedDuplicateRows: 0,
        ...overrides,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
