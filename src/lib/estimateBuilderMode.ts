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
