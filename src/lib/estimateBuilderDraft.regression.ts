import {
    formatEstimateBuilderStep,
    hasEstimateBuilderSnapshot,
    normalizeEstimateBuilderStep,
} from './estimateBuilderDraft';

void runEstimateBuilderDraftRegressions();

export function runEstimateBuilderDraftRegressions() {
    assert(normalizeEstimateBuilderStep('findings') === 'findings', 'Known draft steps should be preserved.');
    assert(normalizeEstimateBuilderStep('unknown') === 'work', 'Unknown draft steps should safely reopen at Work.');
    assert(formatEstimateBuilderStep('option_added') === 'Add another option', 'Draft hub should use a readable step label.');
    assert(hasEstimateBuilderSnapshot({ selectedCategory: 'water_heater' }), 'Non-empty server snapshots should be restorable.');
    assert(!hasEstimateBuilderSnapshot({}), 'Empty server snapshots should not replace a local draft.');
}

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
