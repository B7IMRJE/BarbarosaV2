import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
    Image,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
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

const emergencyTypes = [
    'Water Leak',
    'Flooding',
    'Gas Smell',
    'No Hot Water',
    'Drain Backup',
    'Electrical Problem',
    'HVAC Failure',
    'Other',
];

const areas = [
    'Kitchen',
    'Bathroom',
    'Laundry',
    'Garage',
    'Exterior',
    'Water Heater Area',
    'Main Shutoff Area',
    'Whole Home',
    'Other',
];

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

export default function CreateEmergencyScreen() {
    const { theme } = useTheme();
    const [emergencyType, setEmergencyType] = useState(emergencyTypes[0]);
    const [area, setArea] = useState(areas[0]);
    const [description, setDescription] = useState('');
    const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    async function addPhotos() {
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

        setPhotos((current) => [...current, ...result.assets]);
        setMessage('');
    }

    async function uploadPhotos(userId: string, emergencyId: string) {
        const urls: string[] = [];

        for (const asset of photos) {
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
            urls.push(data.publicUrl);
        }

        return urls;
    }

    async function submitEmergency() {
        if (!description.trim()) {
            setMessage('Add a description of what is happening.');
            return;
        }

        setSaving(true);
        setMessage('Submitting emergency...');

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

            const status: EmergencyStatus = 'Reported';
            const history = [
                makeHistoryEntry(
                    'created',
                    `${emergencyType} reported for ${area}.`
                ),
            ];

            const { data: created, error: insertError } = await supabase
                .from('home_emergencies')
                .insert({
                    user_id: activeProperty.userId,
                    property_id: activeProperty.propertyId,
                    emergency_type: emergencyType,
                    area,
                    description: description.trim(),
                    status,
                    photo_urls: [],
                    video_urls: [],
                    history,
                })
                .select('id')
                .single();

            if (insertError || !created) {
                setMessage(`Submit failed: ${insertError?.message || 'Emergency was not created.'}`);
                return;
            }

            const emergencyId = String(created.id);

            if (photos.length > 0) {
                setMessage('Uploading photos...');
                const photoUrls = await uploadPhotos(activeProperty.userId, emergencyId);
                const nextHistory = [
                    ...history,
                    makeHistoryEntry('photo', `${photoUrls.length} photo${photoUrls.length === 1 ? '' : 's'} added.`),
                ];

                const { error: updateError } = await supabase
                    .from('home_emergencies')
                    .update({
                        photo_urls: photoUrls,
                        history: nextHistory,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', emergencyId)
                    .eq('property_id', activeProperty.propertyId);

                if (updateError) {
                    setMessage(`Emergency created but photos were not saved: ${updateError.message}`);
                    return;
                }
            }

            router.replace(`/emergency/${emergencyId}` as any);
        } catch (error: any) {
            setMessage(`Submit failed: ${error.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900' }}>
                    Report Emergency
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        marginTop: 8,
                        marginBottom: 20,
                        fontSize: 16,
                        lineHeight: 22,
                    }}
                >
                    Document what is happening now. This does not create a job, dispatch, estimate, thread, or notification.
                </Text>

                <Text style={[labelStyle, { color: theme.colors.text }]}>Emergency Type</Text>
                <OptionRow options={emergencyTypes} value={emergencyType} onChange={setEmergencyType} />

                <Text style={[labelStyle, { color: theme.colors.text }]}>Area / Room</Text>
                <OptionRow options={areas} value={area} onChange={setArea} />

                <Text style={[labelStyle, { color: theme.colors.text }]}>Description</Text>
                <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Describe the emergency, visible damage, sounds, smells, and shutoff actions taken."
                    placeholderTextColor={theme.colors.mutedText}
                    multiline
                    style={[
                        inputStyle,
                        {
                            color: theme.colors.text,
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            minHeight: 130,
                            textAlignVertical: 'top',
                        },
                    ]}
                />

                <Text style={[labelStyle, { color: theme.colors.text }]}>Photos</Text>
                <ThemedButton title="Add Photos" variant="secondary" onPress={addPhotos} />

                {photos.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                        {photos.map((photo, index) => (
                            <Image
                                key={`${photo.uri}-${index}`}
                                source={{ uri: photo.uri }}
                                style={{
                                    width: 96,
                                    height: 96,
                                    borderRadius: 14,
                                    backgroundColor: theme.colors.surfaceAlt,
                                }}
                            />
                        ))}
                    </View>
                )}

                <Text style={[labelStyle, { color: theme.colors.text, marginTop: 18 }]}>Videos</Text>
                <ThemedCard>
                    <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>
                        Video uploads are planned for a later phase.
                    </Text>
                </ThemedCard>

                <ThemedButton
                    title={saving ? 'Submitting...' : 'Submit Emergency'}
                    disabled={saving}
                    onPress={submitEmergency}
                    style={{ marginTop: 20 }}
                />

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

function OptionRow({
    options,
    value,
    onChange,
}: {
    options: string[];
    value: string;
    onChange: (value: string) => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {options.map((option) => {
                const selected = option === value;

                return (
                    <TouchableOpacity
                        key={option}
                        onPress={() => onChange(option)}
                        style={{
                            backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                            borderRadius: theme.radii.pill,
                            borderWidth: 1,
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                        }}
                    >
                        <Text
                            style={{
                                color: selected ? theme.colors.primaryText : theme.colors.mutedText,
                                fontWeight: '900',
                            }}
                        >
                            {option}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const labelStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginTop: 14,
    marginBottom: 10,
};

const inputStyle = {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    fontSize: 16,
    lineHeight: 22,
};
