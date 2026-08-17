import {
    isPredefinedEstimateWorkPathActive,
    selectCustomEstimateWorkPath,
    selectPredefinedEstimateWorkPath,
} from './estimateBuilderMode';

runEstimateBuilderModeRegressions();

export function runEstimateBuilderModeRegressions() {
    predefinedAndCustomWorkPathsStayMutuallyExclusive();
    customModeRequiresAnExplicitAction();
    returningToPredefinedRestoresOnlyTheChosenService();
}

function predefinedAndCustomWorkPathsStayMutuallyExclusive() {
    const predefined = selectPredefinedEstimateWorkPath('valve_replacement');
    const custom = selectCustomEstimateWorkPath(predefined.predefinedCategory);

    assert(isPredefinedEstimateWorkPathActive(predefined), 'A chosen Price Book service should be the active work path.');
    assert(!isPredefinedEstimateWorkPathActive(custom), 'Custom mode must visibly switch away from the predefined path.');
    assert(custom.mode === 'custom', 'Custom mode should be entered only through the custom action.');
}

function customModeRequiresAnExplicitAction() {
    const selected = selectPredefinedEstimateWorkPath('valve_replacement');

    assert(selected.mode === 'predefined', 'Selecting a predefined service must not advance into custom quote mode.');
    assert(selected.predefinedCategory === 'valve_replacement', 'The selected service must remain intact until an explicit mode change.');
}

function returningToPredefinedRestoresOnlyTheChosenService() {
    const custom = selectCustomEstimateWorkPath('valve_replacement');
    const restored = selectPredefinedEstimateWorkPath(custom.predefinedCategory || 'valve_replacement');

    assert(restored.mode === 'predefined', 'Choosing a service after custom mode should intentionally return to the predefined path.');
    assert(restored.predefinedCategory === 'valve_replacement', 'Returning to predefined mode should restore the chosen service without custom requirements.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`Estimate builder mode regression failed: ${message}`);
}
