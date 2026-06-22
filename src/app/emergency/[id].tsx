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

    useEffect(() => {
        loadEmergency();
    }, [id]);

    async function loadEmergency() {
        setLoading(true);
        setMessage('');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setEmergency(null);
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

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
        }

        setLoading(false);
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
            await loadEmergency();
        } catch (error: any) {
            setMessage(`Photo upload failed: ${error.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    async function addNote() {
        if (!emergency || !note.trim()) {
            setMessage('Enter a note first.');
            return;
        }

        setSaving(true);
        setMessage('Adding note...');

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
            setMessage(`Note failed: ${error.message}`);
            return;
        }

        setNote('');
        setMessage('Note added.');
        await loadEmergency();
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
        await loadEmergency();
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
                        Add Note
                    </Text>
                    <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="Add a homeowner update, action taken, or condition change."
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

                {!!message && (
                    <ThemedCard style={{ marginTop: 14 }}>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>
                            {message}
                        </Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}
