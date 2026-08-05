import { buildCustomEstimateChoice } from './customEstimateOption';
import {
    hasConflictingEstimateSelectionGroups,
    normalizeCompleteEstimateOptionSet,
    toggleEstimateChoiceSelection,
    toHomeownerPresentationChoice,
    type EstimateChoice,
} from './estimateOptions';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

const repair = customChoice('option-1', 'Repair the existing valve', 'Repair the documented valve.', 425);
const replacement = {
    ...customChoice('option-2', 'Replace the complete valve', 'Replace the documented valve.', 1195),
    selectionGroup: 'legacy-valve-equipment',
    selectionGroupLabel: 'Legacy equipment choice',
};
const protection = customChoice('option-3', 'Replace valve + home protection', 'Replace the valve and add the documented protection.', 3295);
const normalized = normalizeCompleteEstimateOptionSet(
    [repair, replacement, protection],
    'valve_replacement'
);

assert(normalized.length === 3, 'Standardizing alternatives must not remove a technician-built option.');
assert(new Set(normalized.map((choice) => choice.selectionGroup)).size === 1, 'Every complete option in the quote should use the same selection group.');
assert(normalized.every((choice) => choice.selectionGroupLabel === 'Choose one complete quote option'), 'Every alternative should use a clear homeowner instruction.');
assert(normalized.map((choice) => choice.pricingResult.totalAmount).join(',') === '425,1195,3295', 'Grouping alternatives must never change an option price.');

const withRepair = toggleEstimateChoiceSelection(normalized, [], 'option-1');
const withReplacement = toggleEstimateChoiceSelection(normalized, withRepair, 'option-2');

assert(!withReplacement.includes('option-1'), 'Choosing a replacement alternative should remove the previously selected repair option.');
assert(withReplacement.includes('option-2'), 'The newly chosen complete option should remain selected.');
assert(!hasConflictingEstimateSelectionGroups(normalized, withReplacement), 'Normal homeowner selection should contain no conflicting complete options.');
assert(hasConflictingEstimateSelectionGroups(normalized, ['option-1', 'option-3']), 'A different client attempting to submit two complete options should be detectable.');

const presentation = toHomeownerPresentationChoice(normalized[2]);

assert(presentation.selectionGroup === normalized[2].selectionGroup, 'Homeowner presentation mapping must preserve the selection group.');
assert(presentation.selectionGroupLabel === 'Choose one complete quote option', 'Homeowner presentation mapping must preserve the human-readable instruction.');

function customChoice(id: string, name: string, summary: string, price: number): EstimateChoice {
    const result = buildCustomEstimateChoice({
        id,
        displayOrder: Number(id.split('-')[1]) || 1,
        draft: {
            name,
            workScope: `${name}.`,
            customerSummary: summary,
            price: String(price),
        },
    });

    assert(result.choice, result.error || 'Custom regression option should be valid.');

    return result.choice;
}

console.log('homeownerQuoteAlternatives regression checks passed');
