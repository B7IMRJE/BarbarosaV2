export type HomeServiceReviewTarget = 'technician' | 'company';

export type HomeServiceReview = {
    id: string;
    target_type: HomeServiceReviewTarget;
    property_id: string;
    emergency_id: string | null;
    service_request_id: string;
    company_id: string;
    company_name: string | null;
    technician_id: string | null;
    technician_name: string | null;
    star_rating: number;
    category_scores: Record<string, number>;
    comments: string;
    tags: string[];
    verified_completed_job: true;
    moderation_status: 'private' | 'approved' | 'rejected';
    created_at: string;
    updated_at: string;
    source: 'server';
};

export function normalizeHomeServiceReviews(data: unknown, emergencyId: string | null = null) {
    return (Array.isArray(data) ? data : data ? [data] : [])
        .map((value): HomeServiceReview | null => {
            const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
            const targetType = readReviewTarget(record.target_type);
            const id = readString(record.id);
            const propertyId = readString(record.property_id);
            const serviceRequestId = readString(record.service_request_id);
            const companyId = readString(record.company_id);
            const starRating = clampRating(Number(record.star_rating));
            const createdAt = readString(record.created_at);
            const updatedAt = readString(record.updated_at);

            if (!targetType || !id || !propertyId || !serviceRequestId || !companyId || !createdAt || !updatedAt) {
                return null;
            }

            return {
                id,
                target_type: targetType,
                property_id: propertyId,
                emergency_id: emergencyId,
                service_request_id: serviceRequestId,
                company_id: companyId,
                company_name: null,
                technician_id: readNullableString(record.technician_company_user_id),
                technician_name: null,
                star_rating: starRating,
                category_scores: cleanCategoryScores(record.category_scores),
                comments: readString(record.comments),
                tags: readStringArray(record.tags),
                verified_completed_job: true,
                moderation_status: readModerationStatus(record.moderation_status),
                created_at: createdAt,
                updated_at: updatedAt,
                source: 'server',
            };
        })
        .filter((review): review is HomeServiceReview => Boolean(review));
}

export function isHomeServiceReviewEligible(
    requestStatus?: string | null,
    latestEventType?: string | null,
) {
    const status = normalizeStatus(requestStatus);
    const eventType = normalizeStatus(latestEventType);

    return ['complete', 'completed', 'closed', 'done', 'resolved'].includes(status)
        || ['work_completed', 'work_completed_rating_requested'].includes(eventType);
}

export function cleanHomeServiceReviewCategoryScores(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.entries(value).reduce<Record<string, number>>((result, [key, entry]) => {
        const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        const score = Number(entry);

        if (normalizedKey && Number.isFinite(score)) result[normalizedKey] = clampRating(score);

        return result;
    }, {});
}

export function clampHomeServiceReviewRating(value: number) {
    return Math.max(1, Math.min(5, Math.round(Number.isFinite(value) ? value : 1)));
}

export function cleanHomeServiceReviewList(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function cleanCategoryScores(value: unknown) {
    return cleanHomeServiceReviewCategoryScores(value);
}

function readReviewTarget(value: unknown): HomeServiceReviewTarget | null {
    return value === 'technician' || value === 'company' ? value : null;
}

function readModerationStatus(value: unknown): HomeServiceReview['moderation_status'] {
    return value === 'approved' || value === 'rejected' ? value : 'private';
}

function clampRating(value: number) {
    return clampHomeServiceReviewRating(value);
}

function cleanList(values: string[]) {
    return cleanHomeServiceReviewList(values);
}

function readString(value: unknown) {
    return String(value || '').trim();
}

function readNullableString(value: unknown) {
    return readString(value) || null;
}

function readStringArray(value: unknown) {
    return Array.isArray(value) ? cleanList(value.map(readString)) : [];
}

function normalizeStatus(value: unknown) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}
