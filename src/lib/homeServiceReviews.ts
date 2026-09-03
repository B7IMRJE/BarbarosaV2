import { supabase } from './supabase';
import {
    clampHomeServiceReviewRating,
    cleanHomeServiceReviewCategoryScores,
    cleanHomeServiceReviewList,
    normalizeHomeServiceReviews,
    type HomeServiceReview,
    type HomeServiceReviewTarget,
} from './homeServiceReviewCore';
export {
    isHomeServiceReviewEligible,
    normalizeHomeServiceReviews,
    type HomeServiceReview,
    type HomeServiceReviewTarget,
} from './homeServiceReviewCore';

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

    const serviceRequestId = String((emergency as Record<string, unknown> | null)?.service_request_id || '').trim();

    if (!serviceRequestId) return [];

    return loadHomeServiceReviewsForRequest(serviceRequestId, normalizedEmergencyId);
}

export async function loadHomeServiceReviewsForRequest(
    serviceRequestId: string,
    emergencyId: string | null = null,
): Promise<HomeServiceReview[]> {
    const normalizedServiceRequestId = serviceRequestId.trim();

    if (!normalizedServiceRequestId) return [];

    const { data, error } = await supabase.rpc('get_verified_home_service_reviews_for_request', {
        p_service_request_id: normalizedServiceRequestId,
    });

    if (error) throw new Error(error.message);

    return normalizeHomeServiceReviews(data, emergencyId);
}

export async function saveHomeServiceReview(input: SaveHomeServiceReviewInput): Promise<HomeServiceReview> {
    const serviceRequestId = String(input.service_request_id || '').trim();

    if (!serviceRequestId) {
        throw new Error('A completed service request is required before leaving a verified review.');
    }

    const categoryScores = cleanHomeServiceReviewCategoryScores(input.category_scores);
    const { data, error } = await supabase.rpc('save_verified_home_service_review', {
        p_service_request_id: serviceRequestId,
        p_target_type: input.target_type,
        p_star_rating: clampHomeServiceReviewRating(input.star_rating),
        p_category_scores: categoryScores,
        p_tags: cleanHomeServiceReviewList(input.tags),
        p_comments: input.comments.trim() || null,
        p_technician_company_user_id: input.target_type === 'technician'
            ? String(input.technician_id || '').trim() || null
            : null,
    });

    if (error) throw new Error(error.message);

    const review = normalizeHomeServiceReviews(data, input.emergency_id)[0];

    if (!review) throw new Error('The verified review was saved but could not be read.');

    return {
        ...review,
        company_name: input.company_name,
        technician_name: input.technician_name,
    };
}
