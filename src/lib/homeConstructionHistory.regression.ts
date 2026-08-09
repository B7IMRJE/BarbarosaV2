import {
    constructionCategoryLabel,
    constructionEventTypeLabel,
    formatConstructionEventDate,
    normalizeConstructionEventDate,
    validateConstructionEventDraft,
    type ConstructionEventDraft,
} from './homeConstructionHistory';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

const validDraft: ConstructionEventDraft = {
    eventType: 'replacement',
    category: 'roof',
    title: 'Roof replaced',
    eventDate: '2024-06-15',
    datePrecision: 'exact',
    description: 'Homeowner reports the roof was replaced.',
    homeItemId: '',
    system: 'Exterior',
    installerName: '',
    serviceCompany: '',
    serviceContact: '',
    warrantyDetails: '',
    relatedJobId: '',
};

assert(validateConstructionEventDraft(validDraft) === '', 'A durable past event should validate.');
assert(validateConstructionEventDraft({ ...validDraft, title: '' }).includes('title'), 'A title is required.');
assert(validateConstructionEventDraft({ ...validDraft, eventDate: '2999-01-01' }).includes('future'), 'Future work must not enter construction history.');
assert(constructionEventTypeLabel('significant_repair') === 'Significant repair', 'Event labels should be homeowner-friendly.');
assert(constructionCategoryLabel('hvac') === 'HVAC', 'Category labels should preserve common acronyms.');
assert(formatConstructionEventDate('2024-06-15', 'year') === '2024', 'Year precision should not imply an exact date.');
assert(normalizeConstructionEventDate('2024', 'year') === '2024-01-01', 'A year-only fact should use a representative storage date.');
assert(normalizeConstructionEventDate('2024-06', 'month') === '2024-06-01', 'A month-only fact should use a representative storage date.');

console.log('home construction history regression checks passed');
