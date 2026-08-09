import {
    formatEstimateBuilderStep,
    hasEstimateBuilderSnapshot,
    normalizeEstimateBuilderStep,
    resolveEstimateDraftResumeRouteMode,
} from './estimateBuilderDraft';

void runEstimateBuilderDraftRegressions();

export function runEstimateBuilderDraftRegressions() {
    assert(normalizeEstimateBuilderStep('findings') === 'findings', 'Known draft steps should be preserved.');
    assert(normalizeEstimateBuilderStep('unknown') === 'work', 'Unknown draft steps should safely reopen at Work.');
    assert(formatEstimateBuilderStep('option_added') === 'Add another option', 'Draft hub should use a readable step label.');
    assert(hasEstimateBuilderSnapshot({ selectedCategory: 'water_heater' }), 'Non-empty server snapshots should be restorable.');
    assert(!hasEstimateBuilderSnapshot({}), 'Empty server snapshots should not replace a local draft.');

    const techOSResumeMode = resolveEstimateDraftResumeRouteMode({
        propertyId: 'property-1',
        source: 'techos',
    });
    assert(techOSResumeMode.providerMode === '1', 'A saved TechOS client draft should resume with provider context.');
    assert(techOSResumeMode.mode === 'techos', 'A saved TechOS client draft should return through TechOS.');

    const managementResumeMode = resolveEstimateDraftResumeRouteMode({
        propertyId: 'property-1',
        source: 'management',
    });
    assert(managementResumeMode.providerMode === null, 'A management draft should keep management access instead of inventing provider mode.');
    assert(managementResumeMode.mode === 'management', 'A management draft should resume in its company workspace.');
}

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
