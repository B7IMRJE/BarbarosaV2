import {
    buildQuoteScopePolishRequest,
    formatQuoteScopeAiFailure,
    readPolishedQuoteScope,
} from './quoteScopeAssistant';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

const request = buildQuoteScopePolishRequest(
    ' 7a92da6c-1a0f-468f-a441-3f8516796320 ',
    ' replace customer supplied faucet; test; clean area ',
);

assert(request.session_id === '7a92da6c-1a0f-468f-a441-3f8516796320', 'Session IDs should be trimmed.');
assert(request.rough_scope === 'replace customer supplied faucet; test; clean area', 'Rough scope should be trimmed without changing meaning.');
assert(readPolishedQuoteScope({ polished_scope: ' Install customer-supplied faucet. ' }) === 'Install customer-supplied faucet.', 'A valid polished scope should be read.');
assert(readPolishedQuoteScope({ polished_scope: 12 }) === '', 'A non-text AI scope must be rejected.');
assert(/original scope notes were not changed/i.test(formatQuoteScopeAiFailure(new Error('The operation was aborted'))), 'Timeout copy should confirm the original text is preserved.');

console.log('quote scope assistant regression: ok');
