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
        label: input.selected ? 'Continue with this service →' : 'Choose a service',
        accessibilityState: {
            selected: input.selected,
            disabled,
        },
    };
}
