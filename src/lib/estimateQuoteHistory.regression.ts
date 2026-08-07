import {
    formatEstimateQuoteHistoryStatus,
    formatEstimateQuoteTotalRange,
    isEstimateQuoteSelected,
} from './estimateQuoteHistoryRules';

void runEstimateQuoteHistoryRegressions();

export function runEstimateQuoteHistoryRegressions() {
    assert(formatEstimateQuoteHistoryStatus('presented', '2026-08-07T12:00:00Z') === 'Accepted / Sold', 'Accepted quotes should use the final customer status.');
    assert(formatEstimateQuoteHistoryStatus('technician_review') === 'Technician Review', 'Review-stage quotes should have a readable status.');
    assert(formatEstimateQuoteTotalRange({ lowestTotal: 120, highestTotal: 250, selectedTotal: null }) === '$120.00 – $250.00', 'Offered totals should display as a range.');
    assert(formatEstimateQuoteTotalRange({ lowestTotal: 120, highestTotal: 250, selectedTotal: 175 }) === '$175.00', 'Accepted total should take precedence over the offered range.');
    assert(isEstimateQuoteSelected({ selectedSourceChoiceIds: ['repair-a'] }, 'repair-a'), 'Accepted option IDs should be recognized.');
    assert(!isEstimateQuoteSelected({ selectedSourceChoiceIds: ['repair-a'] }, 'repair-b'), 'Unselected option IDs should remain unselected.');
}

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
