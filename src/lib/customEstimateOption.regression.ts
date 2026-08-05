import {
    buildCustomEstimateChoice,
    isCustomEstimateChoice,
    synchronizeCustomEstimateChoiceCopy,
} from './customEstimateOption';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

const result = buildCustomEstimateChoice({
    id: 'option-1',
    displayOrder: 1,
    draft: {
        name: 'Custom shower repair',
        workScope: 'Remove the damaged trim, rebuild the connection, test, and clean the work area.',
        customerSummary: 'Complete the documented shower repair with the exact scope shown below.',
        price: '$1,275.50',
    },
});

assert(result.choice, 'A complete custom quote should create an option.');
assert(result.choice.pricingResult.totalAmount === 1275.5, 'The exact technician-entered price must be preserved.');
assert(result.choice.pricingResult.lineItems.length === 1, 'A custom quote should create exactly one manual scope line.');
assert(result.choice.pricingResult.lineItems[0]?.code === 'CUSTOM_MANUAL', 'A custom quote must be explicitly marked as manual work.');
assert(result.choice.pricingResult.priceBookSnapshot.length === 0, 'A custom quote must not claim a company price-book snapshot.');
assert(isCustomEstimateChoice(result.choice), 'The saved custom option should remain identifiable after persistence.');

const edited = synchronizeCustomEstimateChoiceCopy({
    ...result.choice,
    title: 'Custom shower valve repair',
    shortSummary: 'Replace the documented internal valve components and test operation.',
});

assert(edited.pricingResult.lineItems[0]?.name === 'Custom shower valve repair', 'Editing the option name should update its visible priced line.');
assert(edited.customerSelections?.[0]?.includes('Replace the documented internal valve components'), 'Editing the work scope should update homeowner-visible scope details.');

for (const draft of [
    { name: '', workScope: 'Scope', customerSummary: 'Summary', price: '100' },
    { name: 'Name', workScope: '', customerSummary: 'Summary', price: '100' },
    { name: 'Name', workScope: 'Scope', customerSummary: '', price: '100' },
    { name: 'Name', workScope: 'Scope', customerSummary: 'Summary', price: '0' },
    { name: 'Name', workScope: 'Scope', customerSummary: 'Summary', price: '100.999' },
]) {
    assert(!buildCustomEstimateChoice({ id: 'invalid', displayOrder: 1, draft }).choice, 'Incomplete or invalid custom work must not become an option.');
}

console.log('customEstimateOption regression checks passed');
