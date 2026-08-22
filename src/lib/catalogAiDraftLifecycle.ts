export type CatalogAiDraftSaveDecision = {
    shouldSave: boolean;
    delayMs: number;
};

/**
 * Decides whether an editable AI catalog draft should enter the persisted save queue.
 * This has no knowledge of research, approval, or storage so normal catalog reads
 * can never trigger a save.
 */
export function decideCatalogAiDraftSave(input: {
    hasContent: boolean;
    currentFingerprint: string;
    savedFingerprint: string;
    failedAutoSaveFingerprint: string;
    immediate?: boolean;
}): CatalogAiDraftSaveDecision {
    if (!input.hasContent || input.currentFingerprint === input.savedFingerprint || input.currentFingerprint === input.failedAutoSaveFingerprint) {
        return { shouldSave: false, delayMs: 0 };
    }
    return { shouldSave: true, delayMs: input.immediate ? 0 : 750 };
}
