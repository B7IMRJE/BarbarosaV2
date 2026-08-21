import {
    formatPropertyCollectionTitle,
    formatPropertySummaryAddress,
} from './homePropertyCollectionPresentation';

assert(formatPropertyCollectionTitle('Lupe Rodriguez') === "Lupe's Properties", 'The collection should use the homeowner first name.');
assert(formatPropertyCollectionTitle('James Smith') === "James' Properties", 'Names ending in s should use a clean possessive.');
assert(formatPropertyCollectionTitle('') === 'Your Properties', 'Missing profile names need a generic collection heading.');
assert(
    formatPropertySummaryAddress({
        formatted_address: '100 Oak Street, Austin, TX 78701, US',
    }) === '100 Oak Street, Austin, TX 78701, US',
    'A verified formatted address should remain the property card address.'
);
assert(
    formatPropertySummaryAddress({
        address_line_1: '100 Oak Street',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        country_code: 'US',
    }) === '100 Oak Street, Austin, TX, 78701, US',
    'Legacy address columns should produce a readable fallback.'
);

console.log('Home property collection regression checks passed.');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`Home property collection regression failed: ${message}`);
}
