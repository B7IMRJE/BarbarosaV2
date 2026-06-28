import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
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

type PreferredProvider = {
    companyId: string;
    companyName: string;
};

type CreatedServiceRequestReceipt = {
    id: string;
    companyId: string;
    propertyId: string;
    requestType: string;
    status: string;
    priority: string;
    createdAt: string | null;
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

function cleanFileName(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '-');
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
    const [sentServiceRequestStatus, setSentServiceRequestStatus] = useState('');

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
            const linkedId = String((data as EmergencyRecord).service_request_id || '').trim();
            if (linkedId) {
                setSentServiceRequestId(linkedId);
                await loadLinkedServiceRequestStatus(linkedId);
            }
        }

        setLoading(false);
    }

    async function loadLinkedServiceRequestStatus(serviceRequestId: string) {
        const { data, error } = await supabase
            .from('service_requests')
            .select('id, status')
            .eq('id', serviceRequestId)
            .maybeSingle();

        if (error || !data) {
            setSentServiceRequestStatus('');
            return;
        }

        setSentServiceRequestStatus(String((data as { status?: string | null }).status || ''));
    }

    async function loadPreferredProvider(propertyId: string) {
        const { data: preferredRows, error: preferredError } = await supabase
            .from('property_preferred_providers')
            .select('company_id, property_id, status, selected_at')
            .eq('property_id', propertyId)
            .eq('status', 'active')
            .order('selected_at', { ascending: false })
            .limit(1);

        if (preferredError) {
            setPreferredProvider(null);
            setServiceRequestMessage(`Could not load preferred provider: ${preferredError.message}`);
            return;
        }

        const preferredRow = (preferredRows || [])[0] as { company_id?: string | null } | undefined;
        const providerCompanyId = String(preferredRow?.company_id || '').trim();

        if (!providerCompanyId) {
            setPreferredProvider(null);
            return;
        }

        const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .select('id, name, public_name, dba_name')
            .eq('id', providerCompanyId)
            .maybeSingle();

        if (companyError) {
            setPreferredProvider({
                companyId: providerCompanyId,
                companyName: 'Selected provider',
            });
            return;
        }

        const companyRecord = (companyData || {}) as {
            name?: string | null;
            public_name?: string | null;
            dba_name?: string | null;
        };

        setPreferredProvider({
            companyId: providerCompanyId,
            companyName: firstText(companyRecord.public_name, companyRecord.dba_name, companyRecord.name) || 'Selected provider',
        });
    }

    async function uploadPhoto(userId: string, emergencyId: string, asset: ImagePicker.ImagePickerAsset) {
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const fallbackName = `emergency-${Date.now()}.jpg`;
        const fileName = cleanFileName(asset.fileName || fallbackName);
        const filePath = `users/${userId}/emergencies/${emergencyId}/${Date.now()}-${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('item-files')
            .upload(filePath, arrayBuffer, {
                contentType: asset.mimeType || 'image/jpeg',
                upsert: true,
            });

        if (uploadError) {
            throw new Error(uploadError.message);
        }

        const { data } = supabase.storage.from('item-files').getPublicUrl(filePath);
        return data.publicUrl;
    }

    async function addPhotos() {
        if (!emergency) return;

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            setMessage('Photo library permission is required.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            quality: 0.8,
        });

        if (result.canceled) return;

        setSaving(true);
        setMessage('Uploading photos...');

        try {
            let activeProperty;

            try {
                activeProperty = await requireActivePropertyMembership();
            } catch (error) {
                setMessage(activePropertyErrorMessage(error));

                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                return;
            }

            const uploadedUrls: string[] = [];

            for (const asset of result.assets) {
                uploadedUrls.push(await uploadPhoto(activeProperty.userId, emergency.id, asset));
            }

            const nextPhotoUrls = [...normalizePhotos(emergency.photo_urls), ...uploadedUrls];
            const nextHistory = [
                ...normalizeHistory(emergency.history),
                makeHistoryEntry(
                    'photo',
                    `${uploadedUrls.length} photo${uploadedUrls.length === 1 ? '' : 's'} added.`
                ),
            ];

            const { error } = await supabase
                .from('home_emergencies')
                .update({
                    photo_urls: nextPhotoUrls,
                    history: nextHistory,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', emergency.id)
                .eq('property_id', activeProperty.propertyId);

            if (error) {
                setMessage(`Photo update failed: ${error.message}`);
                return;
            }

            setMessage('Photos added.');
            await loadEmergency({ preserveMessages: true });
        } catch (error: any) {
            setMessage(`Photo upload failed: ${error.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
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

        const { data, error } = await supabase.rpc('create_homeowner_service_request', {
            p_property_id: activePropertyId,
            p_company_id: preferredProvider.companyId,
            p_request_type: 'emergency',
            p_issue_summary: buildServiceRequestSummary(emergency),
            p_priority: 'emergency',
        });

        setSaving(false);

        if (error) {
            setServiceRequestMessage(`Could not send service request: ${error.message}`);
            return;
        }

        const confirmedRequest = parseCreatedServiceRequest(data);

        if (!confirmedRequest) {
            setServiceRequestMessage('Could not confirm service request: Supabase did not return a service_request_id.');
            return;
        }

        setSentServiceRequestId(confirmedRequest.id);
        setSentServiceRequestStatus(confirmedRequest.status);
        setServiceRequestMessage(`Service request sent to ${preferredProvider.companyName}. Request ID: ${shortId(confirmedRequest.id)}.`);

        if (!emergencySupportsServiceRequestLink(emergency)) {
            return;
        }

        const nextHistory = [
            ...normalizeHistory(emergency.history),
            makeHistoryEntry('status', `Service request ${shortId(confirmedRequest.id)} sent to ${preferredProvider.companyName}.`),
        ];

        const { error: linkError } = await supabase
            .from('home_emergencies')
            .update({
                service_request_id: confirmedRequest.id,
                service_request_company_id: confirmedRequest.companyId,
                service_request_sent_at: confirmedRequest.createdAt || new Date().toISOString(),
                history: nextHistory,
                updated_at: new Date().toISOString(),
            })
            .eq('id', emergency.id)
            .eq('property_id', activePropertyId);

        if (linkError) {
            setServiceRequestMessage(
                `Service request sent to ${preferredProvider.companyName}. Request ID: ${shortId(confirmedRequest.id)}. Link update failed: ${linkError.message}`
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

        const { error } = await supabase.rpc('request_service_request_update', {
            p_service_request_id: serviceRequestId,
        });

        setSaving(false);

        if (error) {
            setServiceRequestMessage(`Could not request update: ${error.message}`);
            return;
        }

        setServiceRequestMessage(`Update requested for service request ${shortId(serviceRequestId)}.`);
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
                            ? `Request ${shortId(currentServiceRequestId)} was sent to ${preferredProvider?.companyName || 'your provider'}.`
                            : `Send this emergency to ${preferredProvider?.companyName || 'your preferred provider'}.`}
                    </Text>
                    {hasDispatchRequest && (
                        <Text style={{ color: theme.colors.mutedText, marginTop: 6, fontWeight: '900' }}>
                            Status: {formatLabel(sentServiceRequestStatus) || 'Unknown'}
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

                    <Text
                        style={{
                            color: theme.colors.mutedText,
                            fontWeight: '900',
                            marginTop: 18,
                        }}
                    >
                        Videos
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, marginTop: 6 }}>
                        Video uploads are planned for a later phase.
                    </Text>
                </ThemedCard>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                    <ThemedButton
                        title={saving ? 'Working...' : 'Add Photos'}
                        disabled={saving}
                        variant="secondary"
                        onPress={addPhotos}
                        style={{ flexGrow: 1, minWidth: 160 }}
                    />
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

function firstText(...values: Array<string | null | undefined>) {
    for (const value of values) {
        const text = String(value || '').trim();

        if (text) return text;
    }

    return '';
}

function shortId(value?: string | null) {
    return String(value || '').replace(/-/g, '').slice(0, 8).toUpperCase() || 'UNKNOWN';
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

function parseCreatedServiceRequest(data: unknown): CreatedServiceRequestReceipt | null {
    const row = Array.isArray(data) ? data[0] : data;

    if (!row || typeof row !== 'object') return null;

    const record = row as Record<string, unknown>;
    const id = String(record.service_request_id || '').trim();
    const companyId = String(record.company_id || '').trim();
    const propertyId = String(record.property_id || '').trim();

    if (!id || !companyId || !propertyId) return null;

    return {
        id,
        companyId,
        propertyId,
        requestType: String(record.request_type || ''),
        status: String(record.status || ''),
        priority: String(record.priority || ''),
        createdAt: typeof record.created_at === 'string' ? record.created_at : null,
    };
}

function emergencySupportsServiceRequestLink(emergency: EmergencyRecord) {
    return (
        Object.prototype.hasOwnProperty.call(emergency, 'service_request_id') &&
        Object.prototype.hasOwnProperty.call(emergency, 'service_request_company_id') &&
        Object.prototype.hasOwnProperty.call(emergency, 'service_request_sent_at')
    );
}
