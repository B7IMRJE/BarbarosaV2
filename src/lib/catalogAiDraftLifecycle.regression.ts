import { decideCatalogAiDraftSave } from './catalogAiDraftLifecycle';

assert(!decideCatalogAiDraftSave({
    hasContent: false, currentFingerprint: 'blank', savedFingerprint: '', failedAutoSaveFingerprint: '',
}).shouldSave, 'Blank drafts must not autosave.');

assert(!decideCatalogAiDraftSave({
    hasContent: true, currentFingerprint: 'saved', savedFingerprint: 'saved', failedAutoSaveFingerprint: '',
}).shouldSave, 'An unchanged saved draft must not queue another save.');

assert(!decideCatalogAiDraftSave({
    hasContent: true, currentFingerprint: 'failed', savedFingerprint: 'older', failedAutoSaveFingerprint: 'failed',
}).shouldSave, 'A failed autosave must wait for another edit instead of retrying in a loop.');

const edit = decideCatalogAiDraftSave({
    hasContent: true, currentFingerprint: 'changed', savedFingerprint: 'saved', failedAutoSaveFingerprint: '',
});
assert(edit.shouldSave && edit.delayMs === 750, 'Normal edits must queue a debounced save.');

const research = decideCatalogAiDraftSave({
    hasContent: true, currentFingerprint: 'researched', savedFingerprint: 'saved', failedAutoSaveFingerprint: '', immediate: true,
});
assert(research.shouldSave && research.delayMs === 0, 'Completed research must request an immediate persisted save.');

console.log('catalog AI draft lifecycle regression checks passed');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
