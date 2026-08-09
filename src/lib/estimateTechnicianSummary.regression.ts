import { buildDocumentedTechnicianSummary } from './estimateTechnicianSummary';

runEstimateTechnicianSummaryRegression();

export function runEstimateTechnicianSummaryRegression() {
    const flapperSummary = buildDocumentedTechnicianSummary({
        technicianNotes: 'toilet running because of incorrect flapper',
        workItems: [{ name: 'Flapper replacement', code: 'water_service_bathroom_flapper_replacement' }],
    });
    const generalSummary = buildDocumentedTechnicianSummary({
        technicianNotes: 'shower cartridge is worn and leaking from the handle',
        workItems: [{ name: 'Shower cartridge replacement' }],
    });
    const noNotesSummary = buildDocumentedTechnicianSummary({
        workItems: [{ name: 'Flapper replacement', code: 'water_service_bathroom_flapper_replacement' }],
    });

    assert(flapperSummary.includes('running because the existing flapper was not the correct size or fit'), 'Flapper wording should clearly explain the documented cause of a running toilet.');
    assert(flapperSummary.includes('Flapper replacement'), 'Flapper wording should include only the selected service.');
    assert(flapperSummary.includes('checked after the repair'), 'Flapper wording should include the post-repair verification.');
    assert(generalSummary.includes('Shower cartridge replacement'), 'General wording should include the selected service.');
    assert(generalSummary.includes('worn and leaking from the handle'), 'General wording should retain the technician finding.');
    assert(noNotesSummary.includes('Flapper replacement'), 'A summary should still document the selected work when notes are empty.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
