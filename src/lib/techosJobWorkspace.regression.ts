import {
    TECHOS_JOB_WORKSPACE_SECTIONS,
    toggleTechOSJobWorkspaceSection,
} from './techosJobWorkspace';

runTechOSJobWorkspaceRegressions();

export function runTechOSJobWorkspaceRegressions() {
    workspaceKeepsEveryJobToolReachable();
    workspaceOpensOnlyOneSectionAtATime();
    tappingTheOpenSectionClosesIt();
}

function workspaceKeepsEveryJobToolReachable() {
    const keys = TECHOS_JOB_WORKSPACE_SECTIONS.map((section) => section.key);

    assert(keys.length === 8, 'The compact job workspace should expose eight focused tools.');
    assert(new Set(keys).size === keys.length, 'Every job workspace tool should have a unique key.');
    assert(keys.includes('estimate'), 'The quote and estimate workspace must remain directly accessible.');
    assert(keys.includes('finish'), 'Visit closeout must remain directly accessible.');
}

function workspaceOpensOnlyOneSectionAtATime() {
    const openedSummary = toggleTechOSJobWorkspaceSection(null, 'summary');
    const openedEstimate = toggleTechOSJobWorkspaceSection(openedSummary, 'estimate');

    assert(openedSummary === 'summary', 'The requested job section should open.');
    assert(openedEstimate === 'estimate', 'Opening a second section should replace the first section.');
}

function tappingTheOpenSectionClosesIt() {
    assert(
        toggleTechOSJobWorkspaceSection('workflow', 'workflow') === null,
        'Tapping the active job section should collapse it.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
