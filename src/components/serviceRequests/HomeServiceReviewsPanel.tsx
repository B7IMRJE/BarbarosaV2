import DictationTextInput from '@/components/input/DictationTextInput';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import {
    loadHomeServiceReviewsForRequest,
    saveHomeServiceReview,
    type HomeServiceReview,
    type HomeServiceReviewTarget,
} from '../../lib/homeServiceReviews';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';

type ReviewFormState = {
    rating: number;
    categoryRatings: Record<string, number>;
    comments: string;
    tags: string[];
};

const technicianReviewTags = ['On time', 'Professional', 'Clean work', 'Explained clearly'];
const companyReviewTags = ['Fair pricing', 'Easy scheduling', 'Good communication', 'Would recommend'];
const technicianReviewCategories = [
    { key: 'arrival_reliability', label: 'Arrival & reliability' },
    { key: 'professionalism', label: 'Professionalism' },
    { key: 'work_quality', label: 'Work quality' },
    { key: 'communication', label: 'Communication' },
];
const companyReviewCategories = [
    { key: 'scheduling', label: 'Scheduling' },
    { key: 'office_communication', label: 'Office communication' },
    { key: 'pricing_clarity', label: 'Pricing clarity' },
    { key: 'overall_service', label: 'Overall service' },
];
const emptyReviewForm: ReviewFormState = {
    rating: 0,
    categoryRatings: {},
    comments: '',
    tags: [],
};

export default function HomeServiceReviewsPanel({
    serviceRequestId,
    propertyId,
    companyId,
    companyName = 'Service company',
    technicianName = 'Assigned technician',
}: {
    serviceRequestId: string;
    propertyId: string;
    companyId: string;
    companyName?: string | null;
    technicianName?: string | null;
}) {
    const { theme } = useTheme();
    const [reviews, setReviews] = useState<HomeServiceReview[]>([]);
    const [activeTarget, setActiveTarget] = useState<HomeServiceReviewTarget | null>(null);
    const [technicianForm, setTechnicianForm] = useState<ReviewFormState>(emptyReviewForm);
    const [companyForm, setCompanyForm] = useState<ReviewFormState>(emptyReviewForm);
    const [loading, setLoading] = useState(true);
    const [savingTarget, setSavingTarget] = useState<HomeServiceReviewTarget | null>(null);
    const [message, setMessage] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        setMessage('');

        void loadHomeServiceReviewsForRequest(serviceRequestId)
            .then((loadedReviews) => {
                if (!active) return;
                setReviews(loadedReviews);
                setTechnicianForm(reviewToForm(findReview(loadedReviews, 'technician')));
                setCompanyForm(reviewToForm(findReview(loadedReviews, 'company')));
            })
            .catch((error) => {
                if (active) setMessage(reviewErrorMessage(error));
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [serviceRequestId]);

    function updateForm(target: HomeServiceReviewTarget, updater: (form: ReviewFormState) => ReviewFormState) {
        if (target === 'technician') {
            setTechnicianForm((current) => updater(current));
        } else {
            setCompanyForm((current) => updater(current));
        }
    }

    function updateCategoryRating(target: HomeServiceReviewTarget, category: string, rating: number) {
        updateForm(target, (form) => {
            const categoryRatings = { ...form.categoryRatings, [category]: rating };
            const scores = Object.values(categoryRatings);

            return {
                ...form,
                categoryRatings,
                rating: scores.length > 0
                    ? Math.max(1, Math.min(5, Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)))
                    : 0,
            };
        });
    }

    async function submitReview(target: HomeServiceReviewTarget) {
        if (savingTarget) return;

        const form = target === 'technician' ? technicianForm : companyForm;
        const requiredCategories = target === 'technician' ? technicianReviewCategories : companyReviewCategories;

        if (requiredCategories.some((category) => !form.categoryRatings[category.key])) {
            setMessage(`${reviewTitle(target)} needs a rating for each service category.`);
            return;
        }

        setSavingTarget(target);
        setMessage(`Saving ${reviewTitle(target).toLowerCase()}...`);

        try {
            const savedReview = await saveHomeServiceReview({
                id: findReview(reviews, target)?.id,
                target_type: target,
                property_id: propertyId,
                emergency_id: null,
                service_request_id: serviceRequestId,
                company_id: companyId,
                company_name: target === 'company' ? companyName || null : null,
                technician_id: null,
                technician_name: target === 'technician' ? technicianName || null : null,
                star_rating: form.rating,
                category_scores: form.categoryRatings,
                comments: form.comments,
                tags: form.tags,
            });
            const nextReviews = [savedReview, ...reviews.filter((review) => review.id !== savedReview.id)];
            setReviews(nextReviews);
            setActiveTarget(null);
            setMessage(`${reviewTitle(target)} saved.`);
        } catch (error) {
            setMessage(`${reviewTitle(target)} failed: ${reviewErrorMessage(error)}`);
        } finally {
            setSavingTarget(null);
        }
    }

    return (
        <ThemedCard style={styles.panel}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Service Reviews</Text>
            <Text style={[styles.subtitle, { color: theme.colors.mutedText }]}>Rate the completed visit. The technician and company are reviewed separately.</Text>

            {loading ? (
                <ActivityIndicator color={theme.colors.primary} />
            ) : (
                <View style={styles.grid}>
                    <ReviewCard
                        title="Review Technician"
                        targetName={technicianName || 'Assigned technician'}
                        tags={technicianReviewTags}
                        categories={technicianReviewCategories}
                        form={technicianForm}
                        savedReview={findReview(reviews, 'technician')}
                        expanded={activeTarget === 'technician'}
                        saving={savingTarget === 'technician'}
                        onToggle={() => setActiveTarget(activeTarget === 'technician' ? null : 'technician')}
                        onCategoryRatingChange={(category, rating) => updateCategoryRating('technician', category, rating)}
                        onTagToggle={(tag) => updateForm('technician', (form) => ({
                            ...form,
                            tags: form.tags.includes(tag) ? form.tags.filter((entry) => entry !== tag) : [...form.tags, tag],
                        }))}
                        onCommentsChange={(comments) => updateForm('technician', (form) => ({ ...form, comments }))}
                        onSubmit={() => void submitReview('technician')}
                    />
                    <ReviewCard
                        title="Review Company"
                        targetName={companyName || 'Service company'}
                        tags={companyReviewTags}
                        categories={companyReviewCategories}
                        form={companyForm}
                        savedReview={findReview(reviews, 'company')}
                        expanded={activeTarget === 'company'}
                        saving={savingTarget === 'company'}
                        onToggle={() => setActiveTarget(activeTarget === 'company' ? null : 'company')}
                        onCategoryRatingChange={(category, rating) => updateCategoryRating('company', category, rating)}
                        onTagToggle={(tag) => updateForm('company', (form) => ({
                            ...form,
                            tags: form.tags.includes(tag) ? form.tags.filter((entry) => entry !== tag) : [...form.tags, tag],
                        }))}
                        onCommentsChange={(comments) => updateForm('company', (form) => ({ ...form, comments }))}
                        onSubmit={() => void submitReview('company')}
                    />
                </View>
            )}

            {!!message && <Text style={[styles.notice, { color: theme.colors.mutedText }]}>{message}</Text>}
        </ThemedCard>
    );
}

function ReviewCard({
    title,
    targetName,
    tags,
    categories,
    form,
    savedReview,
    expanded,
    saving,
    onToggle,
    onCategoryRatingChange,
    onTagToggle,
    onCommentsChange,
    onSubmit,
}: {
    title: string;
    targetName: string;
    tags: string[];
    categories: { key: string; label: string }[];
    form: ReviewFormState;
    savedReview?: HomeServiceReview;
    expanded: boolean;
    saving: boolean;
    onToggle: () => void;
    onCategoryRatingChange: (category: string, rating: number) => void;
    onTagToggle: (tag: string) => void;
    onCommentsChange: (comments: string) => void;
    onSubmit: () => void;
}) {
    const { theme } = useTheme();
    const visibleRating = form.rating || savedReview?.star_rating || 0;

    return (
        <View style={[styles.reviewCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
            <Text style={[styles.reviewTitle, { color: theme.colors.text }]}>{title}</Text>
            <Text style={[styles.targetName, { color: theme.colors.mutedText }]}>{targetName}</Text>
            {savedReview && (
                <Text style={[styles.saved, { color: theme.colors.mutedText }]}>Saved: {savedReview.star_rating} star{savedReview.star_rating === 1 ? '' : 's'}</Text>
            )}
            <ThemedButton title={expanded ? 'Close' : savedReview ? 'Edit Review' : title} variant="secondary" onPress={onToggle} />

            {expanded && (
                <View style={styles.form}>
                    <Text style={[styles.label, { color: theme.colors.text }]}>Rate each part of the service</Text>
                    <Text style={[styles.score, { color: theme.colors.mutedText }]}>Overall score: {visibleRating || 'Not complete'}</Text>
                    {categories.map((category) => {
                        const categoryRating = form.categoryRatings[category.key] || savedReview?.category_scores[category.key] || 0;

                        return (
                            <View key={category.key} style={styles.category}>
                                <Text style={[styles.categoryLabel, { color: theme.colors.text }]}>{category.label}</Text>
                                <View style={styles.row}>
                                    {[1, 2, 3, 4, 5].map((rating) => (
                                        <TouchableOpacity
                                            key={rating}
                                            accessibilityRole="button"
                                            accessibilityLabel={`${category.label}: ${rating} out of 5`}
                                            onPress={() => onCategoryRatingChange(category.key, rating)}
                                            style={[
                                                styles.star,
                                                {
                                                    backgroundColor: categoryRating >= rating ? theme.colors.primary : theme.colors.surface,
                                                    borderColor: categoryRating >= rating ? theme.colors.primary : theme.colors.border,
                                                },
                                            ]}
                                        >
                                            <Text style={{ color: categoryRating >= rating ? theme.colors.primaryText : theme.colors.text, fontWeight: '900' }}>{rating}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        );
                    })}

                    <Text style={[styles.label, { color: theme.colors.text }]}>Quick tags</Text>
                    <View style={styles.row}>
                        {tags.map((tag) => {
                            const selected = form.tags.includes(tag);

                            return (
                                <TouchableOpacity
                                    key={tag}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${selected ? 'Remove' : 'Add'} review tag ${tag}`}
                                    onPress={() => onTagToggle(tag)}
                                    style={[
                                        styles.tag,
                                        {
                                            backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                                        },
                                    ]}
                                >
                                    <Text style={{ color: selected ? theme.colors.primaryText : theme.colors.mutedText, fontWeight: '900' }}>{tag}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={[styles.label, { color: theme.colors.text }]}>Comments</Text>
                    <DictationTextInput
                        accessibilityLabel={`${title} comments`}
                        value={form.comments}
                        onChangeText={onCommentsChange}
                        placeholder="Optional comments"
                        placeholderTextColor={theme.colors.mutedText}
                        maxLength={2000}
                        multiline
                        style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    />
                    <ThemedButton title={saving ? 'Saving Review...' : `Save ${title}`} disabled={saving} onPress={onSubmit} />
                </View>
            )}
        </View>
    );
}

function findReview(reviews: HomeServiceReview[], target: HomeServiceReviewTarget) {
    return reviews.find((review) => review.target_type === target);
}

function reviewToForm(review?: HomeServiceReview): ReviewFormState {
    if (!review) return emptyReviewForm;

    return {
        rating: review.star_rating,
        categoryRatings: review.category_scores,
        comments: review.comments,
        tags: review.tags,
    };
}

function reviewTitle(target: HomeServiceReviewTarget) {
    return target === 'technician' ? 'Review Technician' : 'Review Company';
}

function reviewErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : 'Reviews could not be loaded.';
    const normalized = message.toLowerCase();

    if (normalized.includes('get_verified_home_service_reviews_for_request') || normalized.includes('could not find the function')) {
        return 'Reviews are ready in the app, but their database update has not been installed yet.';
    }

    return message;
}

const styles = {
    panel: { gap: 12, marginTop: 12 },
    title: { fontSize: 18, fontWeight: '900' as const },
    subtitle: { fontSize: 13, lineHeight: 18 },
    grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
    reviewCard: { borderWidth: 1, borderRadius: 14, flexBasis: 260, flexGrow: 1, gap: 9, padding: 12 },
    reviewTitle: { fontSize: 16, fontWeight: '900' as const },
    targetName: { fontSize: 13, fontWeight: '800' as const, lineHeight: 18 },
    saved: { fontSize: 12, fontWeight: '900' as const },
    form: { gap: 10 },
    label: { fontSize: 12, fontWeight: '900' as const, textTransform: 'uppercase' as const },
    score: { fontSize: 12, fontWeight: '800' as const },
    category: { gap: 6 },
    categoryLabel: { fontSize: 13, fontWeight: '900' as const },
    row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
    star: { alignItems: 'center' as const, borderRadius: 12, borderWidth: 1, height: 38, justifyContent: 'center' as const, width: 38 },
    tag: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
    input: { borderRadius: 14, borderWidth: 1, minHeight: 86, padding: 12, textAlignVertical: 'top' as const },
    notice: { fontSize: 13, fontWeight: '800' as const, lineHeight: 18 },
};
