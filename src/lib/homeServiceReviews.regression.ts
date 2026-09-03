import {
    isHomeServiceReviewEligible,
    normalizeHomeServiceReviews,
} from './homeServiceReviewCore';

runHomeServiceReviewRegressions();

export function runHomeServiceReviewRegressions() {
    normalizesVerifiedReviewRows();
    rejectsIncompleteReviewRows();
    recognizesCompletedRequestsAndCloseoutEvents();
    excludesActiveAndCancelledRequests();
}

function normalizesVerifiedReviewRows() {
    const reviews = normalizeHomeServiceReviews([reviewRow()], 'emergency-1');

    assert(reviews.length === 1, 'A valid verified review must be returned.');
    assert(reviews[0].emergency_id === 'emergency-1', 'Emergency context must be preserved when supplied.');
    assert(reviews[0].star_rating === 5, 'Ratings above five must be clamped.');
    assert(reviews[0].category_scores.work_quality === 5, 'Category scores must be normalized and clamped.');
    assert(reviews[0].tags.join('|') === 'Professional|Clean work', 'Review tags must be trimmed and deduplicated.');
}

function rejectsIncompleteReviewRows() {
    assert(normalizeHomeServiceReviews([{ ...reviewRow(), service_request_id: '' }]).length === 0, 'Rows without service-request identity must be rejected.');
}

function recognizesCompletedRequestsAndCloseoutEvents() {
    ['complete', 'completed', 'closed', 'done', 'resolved'].forEach((status) => {
        assert(isHomeServiceReviewEligible(status), `${status} requests must allow a review.`);
    });
    assert(isHomeServiceReviewEligible('in_progress', 'work_completed_rating_requested'), 'A legacy closeout event must make a review available.');
}

function excludesActiveAndCancelledRequests() {
    assert(!isHomeServiceReviewEligible('in_progress'), 'Active work must not allow a verified review.');
    assert(!isHomeServiceReviewEligible('cancelled'), 'Cancelled work must not allow a verified review.');
}

function reviewRow() {
    return {
        id: 'review-1',
        target_type: 'technician',
        property_id: 'property-1',
        service_request_id: 'request-1',
        company_id: 'company-1',
        technician_company_user_id: 'technician-1',
        star_rating: 7,
        category_scores: { 'Work Quality': 6 },
        comments: 'Great work',
        tags: ['Professional', ' Professional ', 'Clean work'],
        moderation_status: 'private',
        created_at: '2026-09-02T12:00:00.000Z',
        updated_at: '2026-09-02T12:00:00.000Z',
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`Home service review regression failed: ${message}`);
}
