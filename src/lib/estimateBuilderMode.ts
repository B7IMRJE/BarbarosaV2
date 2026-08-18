import type { EstimateOptionCategory } from './estimateOptions';

export type EstimateWorkPathState = {
    mode: 'predefined' | 'custom';
    predefinedCategory: EstimateOptionCategory | null;
};

export type EstimateSelectionDraftState = {
    selectedWorkType: string | null;
    estimateCategoryChosen: boolean;
    selectedChoiceId: string;
    answers: Record<string, unknown>;
    measurementDraftByKey: Record<string, string>;
    customQuoteMode: boolean;
    customQuoteDraft: {
        name: string;
        workScope: string;
        customerSummary: string;
        price: string;
    };
    guidedStep: string;
    guidedBuildStep: string;
    documentationExpanded: boolean;
    evidenceDeferred: boolean;
    clearedAnswerQuestionIds: string[];
};

export type EstimateEvidenceReminder = {
    visible: boolean;
    title: string;
    actionLabel: string;
    blocksFinalization: boolean;
};

export type EstimateRequirementReasonChoice = {
    label: string;
    reason: 'inaccessible' | 'unsafe_to_capture' | 'label_unreadable' | 'customer_unavailable' | 'not_applicable' | 'other' | null;
};

export type EstimateServiceSessionContext = {
    id: string;
    companyId: string;
    propertyId: string | null;
    serviceRequestId: string | null;
    jobId: string | null;
    scheduleSlotId: string | null;
    homeItemId: string | null;
    category: string;
    status: string;
};

export type SelectedEstimateServiceTransitionResult = 'advanced' | 'blocked' | 'failed';

export type SelectedEstimateServiceTransitionInput<TSession> = {
    selected: boolean;
    customQuoteMode: boolean;
    sessionReady: boolean;
    resolveSession: () => Promise<TSession | null>;
    yieldForFeedback?: () => Promise<void>;
    onOpening: () => void;
    onAdvance: (session: TSession | null) => void;
    onSuccess: () => void;
    onFailure: (message: string) => void;
    onSettled: () => void;
};

const estimateRequirementReasonChoices: EstimateRequirementReasonChoice[] = [
    { label: 'Skip for now', reason: null },
    { label: 'Inaccessible', reason: 'inaccessible' },
    { label: 'Unsafe', reason: 'unsafe_to_capture' },
    { label: 'Label unreadable', reason: 'label_unreadable' },
    { label: 'Customer unavailable', reason: 'customer_unavailable' },
    { label: 'N/A', reason: 'not_applicable' },
    { label: 'Other', reason: 'other' },
];

export function getEstimateRequirementReasonChoices(input: { required: boolean }) {
    return estimateRequirementReasonChoices.filter((choice) =>
        choice.reason !== 'not_applicable' || !input.required
    );
}

export function shouldStackEstimateBuilderHeading(input: { width: number; fontScale: number }) {
    return input.width <= 560 || input.fontScale >= 1.2;
}

export function getEstimateRequirementControlState(input: {
    action: 'resolving' | 'saving' | 'removing' | null;
    uploading: boolean;
    pendingPhoto: boolean;
    error: string | null;
}) {
    const working = input.action !== null || input.uploading;

    return {
        working,
        retryVisible: input.pendingPhoto && Boolean(input.error) && !working,
        reasonsEnabled: !working && !input.pendingPhoto,
        removeVisible: input.pendingPhoto || input.action !== null || input.uploading,
    };
}

export function selectPredefinedEstimateWorkPath(
    category: EstimateOptionCategory
): EstimateWorkPathState {
    return {
        mode: 'predefined',
        predefinedCategory: category,
    };
}

export function selectCustomEstimateWorkPath(
    currentCategory: EstimateOptionCategory | null
): EstimateWorkPathState {
    return {
        mode: 'custom',
        predefinedCategory: currentCategory,
    };
}

export function isPredefinedEstimateWorkPathActive(state: EstimateWorkPathState) {
    return state.mode === 'predefined' && state.predefinedCategory !== null;
}

export function shouldResetEstimateChecklistForServiceSelection(input: {
    currentCategory: EstimateOptionCategory;
    nextCategory: EstimateOptionCategory;
    categoryChosen: boolean;
}) {
    return !input.categoryChosen || input.currentCategory !== input.nextCategory;
}

export function hasMeaningfulEstimateSelectionDraft(state: EstimateSelectionDraftState) {
    return Object.keys(state.answers).length > 0 ||
        Object.values(state.measurementDraftByKey).some((value) => value.trim().length > 0) ||
        Object.values(state.customQuoteDraft).some((value) => value.trim().length > 0);
}

export function clearEstimateSelectionDraft<T extends EstimateSelectionDraftState>(state: T): T {
    return {
        ...state,
        selectedWorkType: null,
        estimateCategoryChosen: false,
        selectedChoiceId: '',
        answers: {},
        measurementDraftByKey: {},
        customQuoteMode: false,
        customQuoteDraft: {
            name: '',
            workScope: '',
            customerSummary: '',
            price: '',
        },
        guidedStep: 'build',
        guidedBuildStep: 'work',
        documentationExpanded: false,
        evidenceDeferred: false,
        clearedAnswerQuestionIds: Array.from(new Set([
            ...state.clearedAnswerQuestionIds,
            ...Object.keys(state.answers),
        ])),
    };
}

export function deferEstimateEvidence<T extends EstimateSelectionDraftState>(state: T): T {
    return {
        ...state,
        guidedStep: 'build',
        guidedBuildStep: 'price',
        documentationExpanded: false,
        evidenceDeferred: true,
    };
}

export function getEstimateEvidenceReminder(input: {
    deferred: boolean;
    missingPhotoCount: number;
    missingMeasurementCount: number;
}): EstimateEvidenceReminder {
    const hasMissingEvidence = input.missingPhotoCount > 0 || input.missingMeasurementCount > 0;

    return {
        visible: input.deferred && hasMissingEvidence,
        title: 'Photos and measurements still needed',
        actionLabel: 'Return / Complete',
        blocksFinalization: hasMissingEvidence,
    };
}

export function getSelectedEstimateServiceActionState(input: {
    selected: boolean;
    unavailable?: boolean;
    saving?: boolean;
}) {
    const disabled = !input.selected || input.unavailable === true || input.saving === true;

    return {
        disabled,
        label: input.saving
            ? 'Opening findings…'
            : input.selected
                ? 'Continue with this service →'
                : 'Choose a service',
        accessibilityState: {
            selected: input.selected,
            disabled,
        },
    };
}

export function isHydratedEstimateSessionReadyForService(input: {
    session: EstimateServiceSessionContext | null;
    hydratedSessionId: string;
    companyId: string;
    propertyId: string | null;
    serviceRequestId: string | null;
    jobId: string | null;
    scheduleSlotId: string | null;
    homeItemId: string | null;
    category: string;
}) {
    const session = input.session;

    if (!session || !input.hydratedSessionId || session.id !== input.hydratedSessionId) return false;

    // A persisted draft can be reopened through TechOS or provider-mode routing. Once the
    // server-authorized draft has hydrated, its exact id and assigned context are the safe
    // reuse boundary; the entry-route source does not require another session upsert.
    return ['draft', 'technician_review'].includes(normalizeBuilderModeText(session.status))
        && normalizeBuilderModeText(session.category) === normalizeBuilderModeText(input.category)
        && sameNullableEstimateContextValue(session.companyId, input.companyId)
        && sameNullableEstimateContextValue(session.propertyId, input.propertyId)
        && sameNullableEstimateContextValue(session.serviceRequestId, input.serviceRequestId)
        && sameNullableEstimateContextValue(session.jobId, input.jobId)
        && sameNullableEstimateContextValue(session.scheduleSlotId, input.scheduleSlotId)
        && sameNullableEstimateContextValue(session.homeItemId, input.homeItemId);
}

export function createSelectedEstimateServiceTransitionController() {
    let inFlight: Promise<SelectedEstimateServiceTransitionResult> | null = null;

    return {
        run<TSession>(input: SelectedEstimateServiceTransitionInput<TSession>) {
            if (inFlight) return inFlight;

            const transition = runSelectedEstimateServiceTransition(input);
            inFlight = transition;

            const clearInFlight = () => {
                if (inFlight === transition) inFlight = null;
            };

            void transition.then(clearInFlight, clearInFlight);

            return transition;
        },
    };
}

async function runSelectedEstimateServiceTransition<TSession>(
    input: SelectedEstimateServiceTransitionInput<TSession>
): Promise<SelectedEstimateServiceTransitionResult> {
    if (!input.selected || input.customQuoteMode) return 'blocked';

    input.onOpening();

    try {
        if (input.yieldForFeedback) await input.yieldForFeedback();

        let session: TSession | null = null;

        if (!input.sessionReady) {
            session = await input.resolveSession();

            if (!session) {
                input.onFailure('The secure estimate draft could not be opened. Tap Continue with this service to retry.');
                return 'failed';
            }
        }

        input.onAdvance(session);
        input.onSuccess();
        return 'advanced';
    } catch (error) {
        const detail = error instanceof Error && error.message.trim()
            ? ` ${error.message.trim()}`
            : '';

        input.onFailure(`The secure estimate draft could not be opened.${detail} Tap Continue with this service to retry.`);
        return 'failed';
    } finally {
        input.onSettled();
    }
}

function sameNullableEstimateContextValue(left?: string | null, right?: string | null) {
    return normalizeBuilderModeText(left) === normalizeBuilderModeText(right);
}

function normalizeBuilderModeText(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
