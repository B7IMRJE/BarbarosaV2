import AsyncStorage from '@react-native-async-storage/async-storage';

const HOME_SERVICE_REVIEWS_KEY = 'homeos_service_reviews_v1';

export type HomeServiceReviewTarget = 'technician' | 'company';

export type HomeServiceReview = {
    id: string;
    target_type: HomeServiceReviewTarget;
    property_id: string;
    emergency_id: string | null;
    service_request_id: string | null;
    company_id: string | null;
    company_name: string | null;
    technician_id: string | null;
    technician_name: string | null;
    star_rating: number;
    comments: string;
    tags: string[];
    created_at: string;
    updated_at: string;
    source: 'local';
};

export type SaveHomeServiceReviewInput = Omit<HomeServiceReview, 'id' | 'created_at' | 'updated_at' | 'source'> & {
    id?: string;
};

export async function loadHomeServiceReviewsForEmergency(emergencyId: string): Promise<HomeServiceReview[]> {
    const normalizedEmergencyId = emergencyId.trim();

    if (!normalizedEmergencyId) return [];

    const reviews = await readReviews();

    return reviews
        .filter((review) => review.emergency_id === normalizedEmergencyId)
        .sort((first, second) => second.updated_at.localeCompare(first.updated_at));
}

export async function saveHomeServiceReview(input: SaveHomeServiceReviewInput): Promise<HomeServiceReview> {
    const reviews = await readReviews();
    const now = new Date().toISOString();
    const existingIndex = reviews.findIndex((review) => review.id === input.id || matchesReviewTarget(review, input));
    const existingReview = existingIndex >= 0 ? reviews[existingIndex] : null;
    const nextReview: HomeServiceReview = {
        ...input,
        id: existingReview?.id || input.id || makeReviewId(input.target_type),
        star_rating: Math.max(1, Math.min(5, Math.round(input.star_rating))),
        comments: input.comments.trim(),
        tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
        created_at: existingReview?.created_at || now,
        updated_at: now,
        source: 'local',
    };

    const nextReviews = existingIndex >= 0
        ? reviews.map((review, index) => (index === existingIndex ? nextReview : review))
        : [nextReview, ...reviews];

    await writeReviews(nextReviews);

    return nextReview;
}

async function readReviews(): Promise<HomeServiceReview[]> {
    const raw = await readRaw(HOME_SERVICE_REVIEWS_KEY);

    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) return [];

        return parsed
            .map(readReview)
            .filter((review): review is HomeServiceReview => Boolean(review));
    } catch {
        return [];
    }
}

async function writeReviews(reviews: HomeServiceReview[]) {
    await writeRaw(HOME_SERVICE_REVIEWS_KEY, JSON.stringify(reviews));
}

function readReview(value: unknown): HomeServiceReview | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const targetType = readReviewTarget(record.target_type);
    const id = readString(record.id);
    const propertyId = readString(record.property_id);
    const starRating = readNumber(record.star_rating);
    const createdAt = readString(record.created_at);
    const updatedAt = readString(record.updated_at);

    if (!targetType || !id || !propertyId || starRating < 1 || !createdAt || !updatedAt) return null;

    return {
        id,
        target_type: targetType,
        property_id: propertyId,
        emergency_id: readNullableString(record.emergency_id),
        service_request_id: readNullableString(record.service_request_id),
        company_id: readNullableString(record.company_id),
        company_name: readNullableString(record.company_name),
        technician_id: readNullableString(record.technician_id),
        technician_name: readNullableString(record.technician_name),
        star_rating: Math.max(1, Math.min(5, Math.round(starRating))),
        comments: readString(record.comments),
        tags: readStringArray(record.tags),
        created_at: createdAt,
        updated_at: updatedAt,
        source: 'local',
    };
}

function matchesReviewTarget(review: HomeServiceReview, input: SaveHomeServiceReviewInput) {
    return (
        review.target_type === input.target_type &&
        review.property_id === input.property_id &&
        review.emergency_id === input.emergency_id &&
        review.service_request_id === input.service_request_id
    );
}

function makeReviewId(targetType: HomeServiceReviewTarget) {
    return `${targetType}-review-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readReviewTarget(value: unknown): HomeServiceReviewTarget | null {
    return value === 'technician' || value === 'company' ? value : null;
}

function readString(value: unknown) {
    return String(value || '').trim();
}

function readNullableString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function readNumber(value: unknown) {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
}

function readStringArray(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value.map(readString).filter(Boolean);
}

async function readRaw(key: string) {
    if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
    }

    return AsyncStorage.getItem(key);
}

async function writeRaw(key: string, value: string) {
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
    }

    await AsyncStorage.setItem(key, value);
}
