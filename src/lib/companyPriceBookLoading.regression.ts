import {
    getCompanyPriceBookLoadErrorMessage,
    withCompanyPriceBookLoadTimeout,
} from './companyPriceBookLoading';

void runCompanyPriceBookLoadingRegressions();

async function runCompanyPriceBookLoadingRegressions() {
    const value = await withCompanyPriceBookLoadTimeout(Promise.resolve('loaded'), 'Timed out.', 20);
    assert(value === 'loaded', 'A completed Price Book request should return its value.');

    let timedOut = false;

    try {
        await withCompanyPriceBookLoadTimeout(new Promise(() => undefined), 'Timed out.', 1);
    } catch (error) {
        timedOut = error instanceof Error && error.message === 'Timed out.';
    }

    assert(timedOut, 'A stalled Price Book request should reach a terminal timeout state.');
    assert(
        getCompanyPriceBookLoadErrorMessage(new Error('Not authorized')) ===
            'This account does not have permission to view the company Price Book.',
        'Authorization failures should have a clear, nontechnical message.'
    );
    assert(
        getCompanyPriceBookLoadErrorMessage(new Error('The company Price Book took too long to load.')) ===
            'The Price Book took too long to load. Check the connection and try again.',
        'Timeout failures should tell the user to retry.'
    );
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}
