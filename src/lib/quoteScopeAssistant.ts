export type QuoteScopePolishRequest = {
    session_id: string;
    rough_scope: string;
};

export function buildQuoteScopePolishRequest(sessionId: string, roughScope: string): QuoteScopePolishRequest {
    return {
        session_id: String(sessionId || '').trim(),
        rough_scope: String(roughScope || '').trim(),
    };
}

export function readPolishedQuoteScope(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

    const polishedScope = (value as Record<string, unknown>).polished_scope;

    return typeof polishedScope === 'string' ? polishedScope.trim() : '';
}

export function formatQuoteScopeAiFailure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalized = message.toLowerCase();

    if (normalized.includes('abort')) {
        return 'AI took too long. Your original scope notes were not changed.';
    }

    if (normalized.includes('credit') || normalized.includes('quota') || normalized.includes('billing')) {
        return 'AI scope polishing is unavailable because the AI account needs attention. Your original notes were not changed.';
    }

    if (normalized.includes('network') || normalized.includes('fetch')) {
        return 'AI scope polishing could not reach HomeOS services. Your original notes were not changed.';
    }

    return message
        ? `AI scope polishing was not used. Your original notes were not changed. ${message}`
        : 'AI scope polishing was not used. Your original notes were not changed.';
}
