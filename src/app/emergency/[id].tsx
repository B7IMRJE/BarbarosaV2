import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ServiceRequestMediaGallery from '../../components/serviceRequests/ServiceRequestMediaGallery';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import {
    createHomeownerServiceRequest,
    formatServiceRequestReference,
    getServiceRequestDisplayCode,
    linkHomeEmergencyToServiceRequest,
    requestHomeownerServiceRequestUpdate,
} from '../../lib/homeServiceRequests';
import {
    getHomeownerFacingStatusLabel,
} from '../../lib/homeownerActiveRequests';
import {
    loadHomeServiceReviewsForEmergency,
    saveHomeServiceReview,
    type HomeServiceReview,
    type HomeServiceReviewTarget,
} from '../../lib/homeServiceReviews';
import { loadPreferredProviderForProperty, type PreferredProvider } from '../../lib/preferredProviders';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type EmergencyStatus = 'Reported' | 'Acknowledged' | 'In Progress' | 'Resolved';

type EmergencyHistoryEntry = {
    id: string;
    kind: 'created' | 'photo' | 'note' | 'status';
    message: string;
    created_at: string;
};

type EmergencyRecord = {
    id: string;
    user_id: string;
    property_id: string;
    emergency_type: string;
    area: string;
    description: string;
    photo_urls: string[] | null;
    video_urls: string[] | null;
    status: EmergencyStatus;
    history: EmergencyHistoryEntry[] | null;
    created_at: string;
    updated_at: string | null;
    resolved_at: string | null;
    service_request_id?: string | null;
    service_request_company_id?: string | null;
    service_request_sent_at?: string | null;
};

type ReviewFormState = {
    rating: number;
    comments: string;
    tags: string[];
};

const technicianReviewTags = ['On time', 'Professional', 'Clean work', 'Explained clearly'];
const companyReviewTags = ['Fair pricing', 'Easy scheduling', 'Good communication', 'Would recommend'];

const emptyReviewForm: ReviewFormState = {
    rating: 0,
    comments: '',
    tags: [],
};

function formatDate(value?: string | null) {
    if (!value) return 'Unknown';
    return new Date(value).toLocaleString();
}

function makeHistoryEntry(kind: EmergencyHistoryEntry['kind'], message: string) {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind,
        message,
        created_at: new Date().toISOString(),
    };
}

function normalizeHistory(value: EmergencyRecord['history']) {
    return Array.isArray(value) ? value : [];
}

function normalizePhotos(value: EmergencyRecord['photo_urls']) {
    return Array.isArray(value) ? value : [];
}

export default function EmergencyDetailScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [emergency, setEmergency] = useState<EmergencyRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [note, setNote] = useState('');
    const [message, setMessage] = useState('');
    const [noteMessage, setNoteMessage] = useState('');
    const [serviceRequestMessage, setServiceRequestMessage] = useState('');
    const [preferredProvider, setPreferredProvider] = useState<PreferredProvider | null>(null);
    const [activePropertyId, setActivePropertyId] = useState('');
    const [sentServiceRequestId, setSentServiceRequestId] = useState('');
    const [sentServiceRequestDisplayCode, setSentServiceRequestDisplayCode] = useState('');
    const [sentServiceRequestStatus, setSentServiceRequestStatus] = useState('');
    const [reviews, setReviews] = useState<HomeServiceReview[]>([]);
    const [activeReviewTarget, setActiveReviewTarget] = useState<HomeServiceReviewTarget | null>(null);
    const [technicianReviewForm, setTechnicianReviewForm] = useState<ReviewFormState>(emptyReviewForm);
    const [companyReviewForm, setCompanyReviewForm] = useState<ReviewFormState>(emptyReviewForm);
    const [reviewMessage, setReviewMessage] = useState('');
    const [savingReviewTarget, setSavingReviewTarget] = useState<HomeServiceReviewTarget | null>(null);

    useEffect(() => {
        loadEmergency();
    }, [id]);

    async function loadEmergency(options?: { preserveMessages?: boolean }) {
        setLoading(true);
        if (!options?.preserveMessages) {
            setMessage('');
            setNoteMessage('');
            setServiceRequestMessage('');
            setSentServiceRequestStatus('');
            setReviewMessage('');
        }

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
            setActivePropertyId(activeProperty.propertyId);
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setEmergency(null);
            setPreferredProvider(null);
            setActivePropertyId('');
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        await loadPreferredProvider(activeProperty.propertyId);

        const { data, error } = await supabase
            .from('home_emergencies')
            .select('*')
            .eq('id', String(id))
            .eq('property_id', activeProperty.propertyId)
            .maybeSingle();

        if (error) {
            setMessage(`Could not load emergency: ${error.message}`);
            setEmergency(null);
        } else if (!data) {
            setMessage('Emergency not found.');
            setEmergency(null);
        } else {
            setEmergency(data as EmergencyRecord);
            await loadReviewsForEmergency((data as EmergencyRecord).id);
            const linkedId = String((data as EmergencyRecord).service_request_id || '').trim();
            if (linkedId) {
                setSentServiceRequestId(linkedId);
                await loadLinkedServiceRequestStatus(linkedId);
            }
        }

        setLoading(false);
    }

    async function loadReviewsForEmergency(emergencyId: string) {
        const loadedReviews = await loadHomeServiceReviewsForEmergency(emergencyId);

        setReviews(loadedReviews);
        setTechnicianReviewForm(reviewToForm(findReview(loadedReviews, 'technician')));
        setCompanyReviewForm(reviewToForm(findReview(loadedReviews, 'company')));
    }

    async function loadLinkedServiceRequestStatus(serviceRequestId: string) {
        const { data, error } = await supabase
            .from('service_requests')
            .select('id, display_sequence, display_code, status')
            .eq('id', serviceRequestId)
            .maybeSingle();

        if (error || !data) {
            setSentServiceRequestStatus('');
            setSentServiceRequestDisplayCode('');
            return;
        }

        const record = data as { status?: string | null; display_code?: string | null; display_sequence?: number | null };

        setSentServiceRequestStatus(String(record.status || ''));
        setSentServiceRequestDisplayCode(getServiceRequestDisplayCode(record));
    }

    async function loadPreferredProvider(propertyId: string) {
        try {
            setPreferredProvider(await loadPreferredProviderForProperty(propertyId));
        } catch (error) {
            setPreferredProvider(null);
            setServiceRequestMessage(`Could not load preferred provider: ${getErrorMessage(error)}`);
        }
    }

    async function addNote() {
        if (!emergency || !note.trim()) {
            setNoteMessage('Enter a HomeOS issue note first.');
            return;
        }

        setSaving(true);
        setNoteMessage('Adding HomeOS issue note...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setNoteMessage(activePropertyErrorMessage(error));
            setSaving(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const nextHistory = [
            ...normalizeHistory(emergency.history),
            makeHistoryEntry('note', note.trim()),
        ];

        const { error } = await supabase
            .from('home_emergencies')
            .update({
                history: nextHistory,
                updated_at: new Date().toISOString(),
            })
            .eq('id', emergency.id)
            .eq('property_id', activeProperty.propertyId);

        setSaving(false);

        if (error) {
            setNoteMessage(`HomeOS issue note failed: ${error.message}`);
            return;
        }

        setNote('');
        await loadEmergency({ preserveMessages: true });
        setNoteMessage('HomeOS issue note added.');
    }

    async function requestServiceForIssue() {
        if (!emergency) return;

        if (!activePropertyId || !preferredProvider?.companyId) {
            setServiceRequestMessage('Choose a preferred provider before requesting service.');
            return;
        }

        setSaving(true);
        setServiceRequestMessage('Sending service request...');

        let confirmedRequest;

        try {
            confirmedRequest = await createHomeownerServiceRequest({
                propertyId: activePropertyId,
                companyId: preferredProvider.companyId,
                requestType: 'emergency',
                issueSummary: buildServiceRequestSummary(emergency),
                priority: 'emergency',
            });
        } catch (error) {
            setSaving(false);
            setServiceRequestMessage(`Could not send service request: ${getErrorMessage(error)}`);
            return;
        }

        setSaving(false);
        setSentServiceRequestId(confirmedRequest.id);
        setSentServiceRequestDisplayCode(getServiceRequestDisplayCode(confirmedRequest));
        setSentServiceRequestStatus(confirmedRequest.status);
        const requestReference = formatServiceRequestReference(confirmedRequest);

        setServiceRequestMessage(`${requestReference} sent to ${preferredProvider.companyName}.`);

        if (!emergencySupportsServiceRequestLink(emergency)) {
            return;
        }

        const nextHistory = [
            ...normalizeHistory(emergency.history),
            makeHistoryEntry('status', `${requestReference} sent to ${preferredProvider.companyName}.`),
        ];

        const linkResult = await linkHomeEmergencyToServiceRequest({
            emergencyId: emergency.id,
            propertyId: activePropertyId,
            serviceRequest: confirmedRequest,
        });

        const { error: historyError } = await supabase
            .from('home_emergencies')
            .update({
                history: nextHistory,
                updated_at: new Date().toISOString(),
            })
            .eq('id', emergency.id)
            .eq('property_id', activePropertyId);

        if (!linkResult.linked || historyError) {
            setServiceRequestMessage(
                `${requestReference} sent to ${preferredProvider.companyName}. Link update failed: ${historyError?.message || linkResult.detail}`
            );
            return;
        }

        await loadEmergency({ preserveMessages: true });
    }

    async function requestServiceUpdate() {
        const serviceRequestId = firstText(emergency?.service_request_id, sentServiceRequestId);

        if (!serviceRequestId) {
            setServiceRequestMessage('Send this issue as a service request first.');
            return;
        }

        setSaving(true);
        setServiceRequestMessage('Requesting update...');

        try {
            const result = await requestHomeownerServiceRequestUpdate(serviceRequestId);

            setServiceRequestMessage(result.message);
        } catch (error) {
            setServiceRequestMessage(`Request update failed: ${getErrorMessage(error)}`);
        } finally {
            setSaving(false);
        }
    }

    async function markResolved() {
        if (!emergency) return;

        setSaving(true);
        setMessage('Marking resolved...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setSaving(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const now = new Date().toISOString();
        const nextHistory = [
            ...normalizeHistory(emergency.history),
            makeHistoryEntry('status', 'Marked resolved by homeowner.'),
        ];

        const { error } = await supabase
            .from('home_emergencies')
            .update({
                status: 'Resolved',
                resolved_at: now,
                updated_at: now,
                history: nextHistory,
            })
            .eq('id', emergency.id)
            .eq('property_id', activeProperty.propertyId);

        setSaving(false);

        if (error) {
            setMessage(`Status update failed: ${error.message}`);
            return;
        }

        setMessage('Emergency marked resolved.');
        await loadEmergency({ preserveMessages: true });
    }

    function updateReviewRating(target: HomeServiceReviewTarget, rating: number) {
        updateReviewForm(target, (form) => ({ ...form, rating }));
    }

    function updateReviewComments(target: HomeServiceReviewTarget, comments: string) {
        updateReviewForm(target, (form) => ({ ...form, comments }));
    }

    function toggleReviewTag(target: HomeServiceReviewTarget, tag: string) {
        updateReviewForm(target, (form) => ({
            ...form,
            tags: form.tags.includes(tag)
                ? form.tags.filter((currentTag) => currentTag !== tag)
                : [...form.tags, tag],
        }));
    }

    function updateReviewForm(
        target: HomeServiceReviewTarget,
        updater: (form: ReviewFormState) => ReviewFormState
    ) {
        if (target === 'technician') {
            setTechnicianReviewForm((current) => updater(current));
            return;
        }

        setCompanyReviewForm((current) => updater(current));
    }

    async function submitReview(target: HomeServiceReviewTarget) {
        if (!emergency) return;

        const form = target === 'technician' ? technicianReviewForm : companyReviewForm;

        if (form.rating < 1) {
            setReviewMessage(`${reviewTitle(target)} needs a star rating.`);
            return;
        }

        setSavingReviewTarget(target);
        setReviewMessage(`Saving ${reviewTitle(target).toLowerCase()}...`);

        try {
            const savedReview = await saveHomeServiceReview({
                id: findReview(reviews, target)?.id,
                target_type: target,
                property_id: emergency.property_id,
                emergency_id: emergency.id,
                service_request_id: firstText(emergency.service_request_id, sentServiceRequestId) || null,
                company_id: target === 'company'
                    ? firstText(emergency.service_request_company_id, preferredProvider?.companyId) || null
                    : null,
                company_name: target === 'company' ? preferredProvider?.companyName || null : null,
                technician_id: null,
                technician_name: null,
                star_rating: form.rating,
                comments: form.comments,
                tags: form.tags,
            });
            const nextReviews = [
                savedReview,
                ...reviews.filter((review) => review.id !== savedReview.id),
            ];

            setReviews(nextReviews);
            setActiveReviewTarget(null);
            setReviewMessage(`${reviewTitle(target)} saved.`);
        } catch (error) {
            setReviewMessage(`${reviewTitle(target)} failed: ${getErrorMessage(error)}`);
        } finally {
            setSavingReviewTarget(null);
        }
    }

    if (loading) {
        return (
            <View
                style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.background,
                }}
            >
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (!emergency) {
        return (
            <ScrollView
                style={{ flex: 1, backgroundColor: theme.colors.background }}
                contentContainerStyle={{ padding: 20, alignItems: 'center' }}
            >
                <View style={{ width: '100%', maxWidth: 900 }}>
                    <HomeHeader />
                    <ThemedCard>
                        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                            Emergency unavailable
                        </Text>
                        <Text style={{ color: theme.colors.mutedText, marginTop: 8 }}>
                            {message || 'This emergency could not be loaded.'}
                        </Text>
                    </ThemedCard>
                </View>
            </ScrollView>
        );
    }

    const photos = normalizePhotos(emergency.photo_urls);
    const history = normalizeHistory(emergency.history);
    const currentServiceRequestId = firstText(emergency.service_request_id, sentServiceRequestId);
    const hasDispatchRequest = !!currentServiceRequestId;
    const savedTechnicianReview = findReview(reviews, 'technician');
    const savedCompanyReview = findReview(reviews, 'company');

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900' }}>
                    {emergency.emergency_type}
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: 16,
                        lineHeight: 22,
                        marginTop: 8,
                        marginBottom: 18,
                    }}
                >
                    {emergency.area} · Created {formatDate(emergency.created_at)}
                </Text>

                <ThemedCard
                    style={{
                        marginBottom: 14,
                        borderColor: hasDispatchRequest
                            ? theme.colors.status.good.border
                            : theme.colors.status.activeEmergency.border,
                        backgroundColor: hasDispatchRequest
                            ? theme.colors.status.good.background
                            : theme.colors.status.activeEmergency.background,
                    }}
                >
                    <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>
                        {hasDispatchRequest ? 'Sent to Dispatch' : 'Not sent to Dispatch yet'}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, marginTop: 8, lineHeight: 20, fontWeight: '800' }}>
                        {hasDispatchRequest
                            ? `${formatServiceRequestReference({ id: currentServiceRequestId, displayCode: sentServiceRequestDisplayCode })} was sent to ${preferredProvider?.companyName || 'your provider'}.`
                            : `Send this emergency to ${preferredProvider?.companyName || 'your preferred provider'}.`}
                    </Text>
                    {hasDispatchRequest && (
                        <Text style={{ color: theme.colors.mutedText, marginTop: 6, fontWeight: '900' }}>
                            Status: {getHomeownerFacingStatusLabel(sentServiceRequestStatus) || 'Unknown'}
                        </Text>
                    )}
                    <Text style={{ color: theme.colors.mutedText, marginTop: 8, lineHeight: 20 }}>
                        HomeOS photos, documents, and private timeline history stay private.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                        {!hasDispatchRequest && (
                            <ThemedButton
                                title={saving ? 'Sending...' : 'Send to Dispatch / Request Emergency Service'}
                                disabled={saving || !preferredProvider}
                                onPress={requestServiceForIssue}
                                style={{ flexGrow: 1, minWidth: 220 }}
                            />
                        )}
                        {hasDispatchRequest && (
                            <ThemedButton
                                title={saving ? 'Requesting...' : 'Request Update'}
                                disabled={saving}
                                variant="secondary"
                                onPress={requestServiceUpdate}
                                style={{ flexGrow: 1, minWidth: 160 }}
                            />
                        )}
                    </View>
                </ThemedCard>

                {!!serviceRequestMessage && (
                    <ThemedCard style={{ marginBottom: 14 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                            Service Request
                        </Text>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900', marginTop: 8, lineHeight: 20 }}>
                            {serviceRequestMessage}
                        </Text>
                    </ThemedCard>
                )}

                {!!message && (
                    <ThemedCard style={{ marginBottom: 14 }}>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>
                            {message}
                        </Text>
                    </ThemedCard>
                )}

                <ThemedCard style={{ marginBottom: 14 }}>
                    <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>Status</Text>
                    <Text
                        style={{
                            color: theme.colors.text,
                            fontSize: 24,
                            fontWeight: '900',
                            marginTop: 6,
                        }}
                    >
                        {emergency.status}
                    </Text>

                    <Text
                        style={{
                            color: theme.colors.mutedText,
                            fontWeight: '900',
                            marginTop: 18,
                        }}
                    >
                        Description
                    </Text>
                    <Text style={{ color: theme.colors.text, lineHeight: 22, marginTop: 6 }}>
                        {emergency.description}
                    </Text>

                </ThemedCard>

                <ServiceRequestMediaGallery
                    serviceRequestId={currentServiceRequestId}
                    title="Request photos and videos"
                />

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                    {emergency.status !== 'Resolved' && (
                        <ThemedButton
                            title="Mark Resolved"
                            disabled={saving}
                            variant="danger"
                            onPress={markResolved}
                            style={{ flexGrow: 1, minWidth: 160 }}
                        />
                    )}
                </View>

                <ThemedCard style={{ marginBottom: 14 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Service Reviews
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, marginTop: 8, lineHeight: 20, fontWeight: '800' }}>
                        Technician and company reviews are saved as separate HomeOS review records.
                    </Text>

                    <View style={reviewGridStyle}>
                        <ServiceReviewCard
                            title="Review Technician"
                            targetName={savedTechnicianReview?.technician_name || 'Technician not assigned in HomeOS yet'}
                            tags={technicianReviewTags}
                            form={technicianReviewForm}
                            savedReview={savedTechnicianReview}
                            expanded={activeReviewTarget === 'technician'}
                            saving={savingReviewTarget === 'technician'}
                            onToggle={() => setActiveReviewTarget(activeReviewTarget === 'technician' ? null : 'technician')}
                            onRatingChange={(rating) => updateReviewRating('technician', rating)}
                            onTagToggle={(tag) => toggleReviewTag('technician', tag)}
                            onCommentsChange={(comments) => updateReviewComments('technician', comments)}
                            onSubmit={() => submitReview('technician')}
                        />
                        <ServiceReviewCard
                            title="Review Company"
                            targetName={preferredProvider?.companyName || savedCompanyReview?.company_name || 'Company not connected yet'}
                            tags={companyReviewTags}
                            form={companyReviewForm}
                            savedReview={savedCompanyReview}
                            expanded={activeReviewTarget === 'company'}
                            saving={savingReviewTarget === 'company'}
                            onToggle={() => setActiveReviewTarget(activeReviewTarget === 'company' ? null : 'company')}
                            onRatingChange={(rating) => updateReviewRating('company', rating)}
                            onTagToggle={(tag) => toggleReviewTag('company', tag)}
                            onCommentsChange={(comments) => updateReviewComments('company', comments)}
                            onSubmit={() => submitReview('company')}
                        />
                    </View>

                    {!!reviewMessage && (
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900', marginTop: 12 }}>
                            {reviewMessage}
                        </Text>
                    )}
                </ThemedCard>

                {photos.length > 0 && (
                    <ThemedCard style={{ marginBottom: 14 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                            Photos
                        </Text>
                        <View
                            style={{
                                flexDirection: 'row',
                                flexWrap: 'wrap',
                                gap: 10,
                                marginTop: 12,
                            }}
                        >
                            {photos.map((photoUrl) => (
                                <Image
                                    key={photoUrl}
                                    source={{ uri: photoUrl }}
                                    style={{
                                        width: 110,
                                        height: 110,
                                        borderRadius: 14,
                                        backgroundColor: theme.colors.surfaceAlt,
                                    }}
                                />
                            ))}
                        </View>
                    </ThemedCard>
                )}

                <ThemedCard style={{ marginBottom: 14 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Add HomeOS Issue Note
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, marginTop: 8, lineHeight: 20 }}>
                        This note stays on the private HomeOS issue timeline. {hasDispatchRequest ? 'Use Request Update above to notify Dispatch.' : 'Send this issue to Dispatch before requesting company updates.'}
                    </Text>
                    <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="Add a private HomeOS issue note, action taken, or condition change."
                        placeholderTextColor={theme.colors.mutedText}
                        multiline
                        style={{
                            color: theme.colors.text,
                            backgroundColor: theme.colors.surfaceAlt,
                            borderColor: theme.colors.border,
                            borderWidth: 1,
                            borderRadius: 16,
                            padding: 14,
                            minHeight: 100,
                            marginTop: 12,
                            textAlignVertical: 'top',
                        }}
                    />
                    <ThemedButton
                        title={saving ? 'Saving...' : 'Add Note'}
                        disabled={saving}
                        onPress={addNote}
                        style={{ marginTop: 12 }}
                    />
                    {!!noteMessage && (
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900', marginTop: 10 }}>
                            {noteMessage}
                        </Text>
                    )}
                </ThemedCard>

                <ThemedCard>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Timeline
                    </Text>

                    {history.length === 0 && (
                        <Text style={{ color: theme.colors.mutedText, marginTop: 10 }}>
                            No timeline entries yet.
                        </Text>
                    )}

                    <View style={{ gap: 10, marginTop: 12 }}>
                        {history.map((entry) => (
                            <View
                                key={entry.id}
                                style={{
                                    borderLeftWidth: 3,
                                    borderLeftColor: theme.colors.border,
                                    paddingLeft: 12,
                                }}
                            >
                                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                                    {entry.message}
                                </Text>
                                <Text style={{ color: theme.colors.mutedText, marginTop: 4 }}>
                                    {formatDate(entry.created_at)}
                                </Text>
                            </View>
                        ))}
                    </View>
                </ThemedCard>

            </View>
        </ScrollView>
    );
}

function ServiceReviewCard({
    title,
    targetName,
    tags,
    form,
    savedReview,
    expanded,
    saving,
    onToggle,
    onRatingChange,
    onTagToggle,
    onCommentsChange,
    onSubmit,
}: {
    title: string;
    targetName: string;
    tags: string[];
    form: ReviewFormState;
    savedReview?: HomeServiceReview;
    expanded: boolean;
    saving: boolean;
    onToggle: () => void;
    onRatingChange: (rating: number) => void;
    onTagToggle: (tag: string) => void;
    onCommentsChange: (comments: string) => void;
    onSubmit: () => void;
}) {
    const { theme } = useTheme();
    const visibleRating = form.rating || savedReview?.star_rating || 0;

    return (
        <View style={[reviewCardStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900' }}>{title}</Text>
                <Text style={{ color: theme.colors.mutedText, marginTop: 5, fontWeight: '800', lineHeight: 19 }}>
                    {targetName}
                </Text>
                {savedReview && (
                    <Text style={{ color: theme.colors.mutedText, marginTop: 6, fontWeight: '900' }}>
                        Saved: {savedReview.star_rating} star{savedReview.star_rating === 1 ? '' : 's'}
                    </Text>
                )}
            </View>

            <ThemedButton
                title={expanded ? 'Close' : title}
                variant="secondary"
                onPress={onToggle}
                style={reviewButtonStyle}
                textStyle={reviewButtonTextStyle}
            />

            {expanded && (
                <View style={reviewFormStyle}>
                    <View>
                        <Text style={[reviewLabelStyle, { color: theme.colors.text }]}>Star rating</Text>
                        <View style={starRowStyle}>
                            {[1, 2, 3, 4, 5].map((rating) => (
                                <TouchableOpacity
                                    key={rating}
                                    onPress={() => onRatingChange(rating)}
                                    activeOpacity={0.82}
                                    style={[
                                        starButtonStyle,
                                        {
                                            backgroundColor: visibleRating >= rating ? theme.colors.primary : theme.colors.surface,
                                            borderColor: visibleRating >= rating ? theme.colors.primary : theme.colors.border,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={{
                                            color: visibleRating >= rating ? theme.colors.primaryText : theme.colors.text,
                                            fontWeight: '900',
                                        }}
                                    >
                                        {rating}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View>
                        <Text style={[reviewLabelStyle, { color: theme.colors.text }]}>Quick tags</Text>
                        <View style={tagRowStyle}>
                            {tags.map((tag) => {
                                const selected = form.tags.includes(tag);

                                return (
                                    <TouchableOpacity
                                        key={tag}
                                        onPress={() => onTagToggle(tag)}
                                        activeOpacity={0.82}
                                        style={[
                                            reviewTagStyle,
                                            {
                                                backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                                                borderColor: selected ? theme.colors.primary : theme.colors.border,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={{
                                                color: selected ? theme.colors.primaryText : theme.colors.mutedText,
                                                fontWeight: '900',
                                            }}
                                        >
                                            {tag}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    <View>
                        <Text style={[reviewLabelStyle, { color: theme.colors.text }]}>Comments</Text>
                        <TextInput
                            value={form.comments}
                            onChangeText={onCommentsChange}
                            placeholder="Optional comments"
                            placeholderTextColor={theme.colors.mutedText}
                            multiline
                            style={[
                                reviewInputStyle,
                                {
                                    color: theme.colors.text,
                                    backgroundColor: theme.colors.surface,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                        />
                    </View>

                    <ThemedButton
                        title={saving ? 'Saving Review...' : `Save ${title}`}
                        disabled={saving}
                        onPress={onSubmit}
                    />
                </View>
            )}
        </View>
    );
}

function firstText(...values: Array<string | null | undefined>) {
    for (const value of values) {
        const text = String(value || '').trim();

        if (text) return text;
    }

    return '';
}

function formatLabel(value?: string | null) {
    const normalized = String(value || '').trim();

    if (!normalized) return 'Unknown';

    return normalized
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function buildServiceRequestSummary(emergency: EmergencyRecord) {
    return [
        `${emergency.emergency_type} reported for ${emergency.area}.`,
        emergency.description,
    ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join('\n\n');
}

function findReview(reviews: HomeServiceReview[], target: HomeServiceReviewTarget) {
    return reviews.find((review) => review.target_type === target);
}

function reviewToForm(review?: HomeServiceReview): ReviewFormState {
    if (!review) return emptyReviewForm;

    return {
        rating: review.star_rating,
        comments: review.comments,
        tags: review.tags,
    };
}

function reviewTitle(target: HomeServiceReviewTarget) {
    return target === 'technician' ? 'Review Technician' : 'Review Company';
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    return 'Unknown error';
}

function emergencySupportsServiceRequestLink(emergency: EmergencyRecord) {
    return (
        Object.prototype.hasOwnProperty.call(emergency, 'service_request_id') &&
        Object.prototype.hasOwnProperty.call(emergency, 'service_request_company_id') &&
        Object.prototype.hasOwnProperty.call(emergency, 'service_request_sent_at')
    );
}

const reviewGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 14,
};

const reviewCardStyle = {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 260,
    width: '48%' as const,
    gap: 10,
};

const reviewButtonStyle = {
    paddingVertical: 10,
};

const reviewButtonTextStyle = {
    fontSize: 13,
};

const reviewFormStyle = {
    gap: 12,
};

const reviewLabelStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
};

const starRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
};

const starButtonStyle = {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
};

const tagRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
};

const reviewTagStyle = {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
};

const reviewInputStyle = {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    minHeight: 86,
    textAlignVertical: 'top' as const,
    fontWeight: '800' as const,
};
