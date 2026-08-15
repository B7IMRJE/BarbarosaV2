const DEFAULT_COMPANY_PRICE_BOOK_LOAD_TIMEOUT_MS = 15_000;

export function withCompanyPriceBookLoadTimeout<T>(
    promise: PromiseLike<T>,
    message: string,
    timeoutMs = DEFAULT_COMPANY_PRICE_BOOK_LOAD_TIMEOUT_MS
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);

        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timeoutId);
                resolve(value);
            },
            (error) => {
                clearTimeout(timeoutId);
                reject(error);
            }
        );
    });
}

export function getCompanyPriceBookLoadErrorMessage(error: unknown) {
    const technicalMessage = error instanceof Error ? error.message : String(error || '');
    const normalizedMessage = technicalMessage.trim().toLowerCase();

    if (normalizedMessage.includes('not authorized') || normalizedMessage.includes('permission')) {
        return 'This account does not have permission to view the company Price Book.';
    }

    if (normalizedMessage.includes('too long') || normalizedMessage.includes('timeout')) {
        return 'The Price Book took too long to load. Check the connection and try again.';
    }

    return 'The Price Book could not be loaded. Check the connection and try again.';
}
