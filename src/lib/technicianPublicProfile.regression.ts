import {
    MINIMUM_PUBLIC_TECHNICIAN_REVIEWS,
    formatProfileList,
    formatRatingCategoryLabel,
    getTechnicianRatingDisclosure,
    parseProfileList,
} from './technicianPublicProfileFormatting.ts';

function assert(condition: unknown, message: string) {
    if (!condition) throw new Error(message);
}

assert(
    JSON.stringify(parseProfileList('Leak detection, Spanish\nLeak detection')) === JSON.stringify(['Leak detection', 'Spanish']),
    'Profile lists should trim, split, and remove duplicates.'
);
assert(formatProfileList([' Plumbing ', 'HVAC']) === 'Plumbing, HVAC', 'Profile lists should format for editing.');
assert(formatRatingCategoryLabel('explained_clearly') === 'Explained Clearly', 'Rating categories should be readable.');
assert(
    getTechnicianRatingDisclosure({ public_rating: 4.9, public_review_count: MINIMUM_PUBLIC_TECHNICIAN_REVIEWS - 1 })
        .includes(`${MINIMUM_PUBLIC_TECHNICIAN_REVIEWS}`),
    'Low review counts should not disclose a public rating.'
);
assert(
    getTechnicianRatingDisclosure({ public_rating: 4.8, public_review_count: MINIMUM_PUBLIC_TECHNICIAN_REVIEWS })
        === '4.8 out of 5 · 5 verified reviews',
    'Eligible verified review summaries should be formatted.'
);

console.log('technician public profile regression checks passed');
