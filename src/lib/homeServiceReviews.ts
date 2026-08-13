import { supabase } from './supabase';

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

export type SaveHomeServiceReviewInput = {
    id?: string;
    target_type: HomeServiceReviewTarget;
    property_id: string;
    emergency_id: string | null;
    service_request_id: string | null;
    company_id: string | null;
    company_name: string | null;
    technician_id: string | null;
    technician_name: string | null;
    star_rating: number;
    category_scores: Record<string, number>;
    comments: string;
    tags: string[];
};

export async function loadHomeServiceReviewsForEmergency(emergencyId: string): Promise<HomeServiceReview[]> {
    const normalizedEmergencyId = emergencyId.trim();

    if (!normalizedEmergencyId) return [];

    const { data: emergency, error: emergencyError } = await supabase
        .from('home_emergencies')
        .select('service_request_id')
        .eq('id', normalizedEmergencyId)
        .maybeSingle();

    if (emergencyError) throw new Error(emergencyError.message);

    const serviceRequestId = readString((emergency as Record<string, unknown> | null)?.service_request_id);

    if (!serviceRequestId) return [];

    const { data, error } = await supabase.rpc('get_verified_home_service_reviews_for_request', {
        p_service_request_id: serviceRequestId,
    });

    if (error) throw new Error(error.message);

    return readReviews(data, normalizedEmergencyId);
}

export async function saveHomeServiceReview(input: SaveHomeServiceReviewInput): Promise<HomeServiceReview> {
    const serviceRequestId = String(input.service_request_id || '').trim();

    if (!serviceRequestId) {
        throw new Error('A completed service request is required before leaving a verified review.');
    }

    const categoryScores = cleanCategoryScores(input.category_scores);
    const { data, error } = await supabase.rpc('save_verified_home_service_review', {
        p_service_request_id: serviceRequestId,
        p_target_type: input.target_type,
        p_star_rating: clampRating(input.star_rating),
        p_category_scores: categoryScores,
        p_tags: cleanList(input.tags),
        p_comments: input.comments.trim() || null,
        p_technician_company_user_id: input.target_type === 'technician'
            ? String(input.technician_id || '').trim() || null
            : null,
    });

    if (error) throw new Error(error.message);

    const review = readReviews(data, input.emergency_id)[0];

    if (!review) throw new Error('The verified review was saved but could not be read.');

    return {
        ...review,
        company_name: input.company_name,
        technician_name: input.technician_name,
    };
}

function readReviews(data: unknown, emergencyId: string | null) {
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

function cleanCategoryScores(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.entries(value).reduce<Record<string, number>>((result, [key, entry]) => {
        const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        const score = Number(entry);

        if (normalizedKey && Number.isFinite(score)) result[normalizedKey] = clampRating(score);

        return result;
    }, {});
}

function readReviewTarget(value: unknown): HomeServiceReviewTarget | null {
    return value === 'technician' || value === 'company' ? value : null;
}

function readModerationStatus(value: unknown): HomeServiceReview['moderation_status'] {
    return value === 'approved' || value === 'rejected' ? value : 'private';
}

function clampRating(value: number) {
    return Math.max(1, Math.min(5, Math.round(Number.isFinite(value) ? value : 1)));
}

function cleanList(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
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
