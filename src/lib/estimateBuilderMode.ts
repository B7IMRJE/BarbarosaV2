import type { EstimateOptionCategory } from './estimateOptions';

export type EstimateWorkPathState = {
    mode: 'predefined' | 'custom';
    predefinedCategory: EstimateOptionCategory | null;
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
