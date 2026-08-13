export const MINIMUM_PUBLIC_TECHNICIAN_REVIEWS = 5;

export function parseProfileList(value: string) {
    return cleanProfileList(value.split(/[,\n]/g));
}

export function formatProfileList(values: string[]) {
    return cleanProfileList(values).join(', ');
}

export function getTechnicianRatingDisclosure(profile: { public_rating: number | null; public_review_count: number }) {
    if (profile.public_rating === null || profile.public_review_count < MINIMUM_PUBLIC_TECHNICIAN_REVIEWS) {
        return `A public rating appears after ${MINIMUM_PUBLIC_TECHNICIAN_REVIEWS} verified completed-job reviews.`;
    }

    return `${profile.public_rating.toFixed(1)} out of 5 · ${profile.public_review_count} verified reviews`;
}

export function formatRatingCategoryLabel(value: string) {
    return value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function cleanProfileList(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
