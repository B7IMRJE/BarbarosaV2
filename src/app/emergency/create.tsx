import { router } from 'expo-router';
import { useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ServiceRequestMediaPicker from '../../components/serviceRequests/ServiceRequestMediaPicker';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import {
    createHomeownerServiceRequest,
    linkHomeEmergencyToServiceRequest,
    type CreatedServiceRequestReceipt,
} from '../../lib/homeServiceRequests';
import { loadPreferredProviderForProperty, type PreferredProvider } from '../../lib/preferredProviders';
import { addProviderStagedWork } from '../../lib/providerStagedWork';
import {
    hasUnresolvedServiceRequestMedia,
    uploadPendingServiceRequestMedia,
    type ServiceRequestMediaDraft,
} from '../../lib/serviceRequestMedia';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type EmergencyStatus = 'Reported' | 'Acknowledged' | 'In Progress' | 'Resolved';

type EmergencyHistoryEntry = {
    id: string;
    kind: 'created' | 'photo' | 'note' | 'status';
    message: string;
    created_at: string;
};

type PendingEmergencySubmission = {
    emergencyId: string;
    serviceRequest: CreatedServiceRequestReceipt | null;
    history: EmergencyHistoryEntry[];
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

const COMPANY_INTAKE_NOT_CONNECTED_MESSAGE = 'Emergency saved in HomeOS, but company intake is not connected yet.';

function makeHistoryEntry(kind: EmergencyHistoryEntry['kind'], message: string) {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind,
        message,
        created_at: new Date().toISOString(),
    };
}

export default function CreateEmergencyScreen() {
    const { theme } = useTheme();
    const [emergencyType, setEmergencyType] = useState(emergencyTypes[0]);
    const [area, setArea] = useState(areas[0]);
    const [description, setDescription] = useState('');
    const [media, setMedia] = useState<ServiceRequestMediaDraft[]>([]);
    const [pendingEmergency, setPendingEmergency] = useState<PendingEmergencySubmission | null>(null);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    async function submitEmergency() {
        if (!description.trim()) {
            setMessage('Description is required.');
            return;
        }

        if (hasUnresolvedServiceRequestMedia(media)) {
            setMessage('Wait for the current media action to finish before saving the emergency.');
            return;
        }

        setSaving(true);
        setMessage(pendingEmergency ? 'Retrying emergency media upload...' : 'Saving emergency...');

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

            let preferredProvider: PreferredProvider | null = null;

            try {
                preferredProvider = await loadPreferredProviderForProperty(activeProperty.propertyId);
            } catch {
                preferredProvider = null;
            }

            let emergencyId = pendingEmergency?.emergencyId || '';
            let currentHistory = pendingEmergency?.history || [];
            let serviceRequest = pendingEmergency?.serviceRequest || null;

            if (!emergencyId) {
                const now = new Date().toISOString();
                const status: EmergencyStatus = 'Reported';
                currentHistory = [
                    makeHistoryEntry(
                        'created',
                        `${emergencyType} reported for ${area}.`
                    ),
                    ...(preferredProvider
                        ? [makeHistoryEntry('status', `Preferred company at save: ${preferredProvider.companyName}.`)]
                        : []),
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
                        history: currentHistory,
                        created_at: now,
                        updated_at: now,
                    })
                    .select('id')
                    .single();

                if (insertError || !created) {
                    setMessage(`Save emergency failed: ${insertError?.message || 'Emergency was not created.'}`);
                    return;
                }

                emergencyId = String(created.id);
            }

            if (!preferredProvider) {
                setMessage(COMPANY_INTAKE_NOT_CONNECTED_MESSAGE);
                setTimeout(() => router.replace(`/emergency/${emergencyId}` as any), 900);
                return;
            }

            if (!serviceRequest) {
                setMessage(`Emergency saved. Sending to ${preferredProvider.companyName}...`);
                try {
                    serviceRequest = await createHomeownerServiceRequest({
                        propertyId: activeProperty.propertyId,
                        companyId: preferredProvider.companyId,
                        requestType: 'emergency',
                        issueSummary: buildServiceRequestSummary(emergencyType, area, description),
                        priority: 'emergency',
                    });
                } catch (error) {
                    const staged = await stageEmergencyForPreferredCompany({
                        activeProperty,
                        emergencyId,
                        preferredProvider,
                        mediaCount: media.length,
                        sendError: getErrorMessage(error),
                    });

                    setMessage(staged ? COMPANY_INTAKE_NOT_CONNECTED_MESSAGE : `Emergency saved, but company intake failed: ${getErrorMessage(error)}`);
                    setTimeout(() => router.replace(`/emergency/${emergencyId}` as any), 900);
                    return;
                }
            }

            if (media.length > 0) {
                setPendingEmergency({ emergencyId, serviceRequest, history: currentHistory });
                setMessage('Uploading emergency photos and videos...');
                try {
                    await uploadPendingServiceRequestMedia({
                        companyId: serviceRequest.companyId,
                        propertyId: serviceRequest.propertyId,
                        serviceRequestId: serviceRequest.id,
                        items: media,
                        onItemChange: updateMediaDraft,
                    });
                } catch (error) {
                    setMessage(`Emergency ${shortId(emergencyId)} was saved, but media upload failed: ${getErrorMessage(error)}. Remove or retry the failed file to finish sending media.`);
                    return;
                }

                currentHistory = [
                    ...currentHistory,
                    makeHistoryEntry('photo', `${media.length} media attachment${media.length === 1 ? '' : 's'} added to service request ${shortId(serviceRequest.id)}.`),
                ];
            }

            await linkSavedEmergencyToServiceRequest({
                activeProperty,
                emergencyId,
                preferredProvider,
                serviceRequest,
                history: currentHistory,
            });

            setPendingEmergency(null);
            setMedia([]);
            setMessage('Emergency saved and sent to preferred company.');
            setTimeout(() => router.replace(`/emergency/${emergencyId}` as any), 900);
        } catch (error) {
            setMessage(`Save emergency failed: ${getErrorMessage(error)}`);
        } finally {
            setSaving(false);
        }
    }

    function updateMediaDraft(localId: string, updates: Partial<ServiceRequestMediaDraft>) {
        setMedia((current) => current.map((item) => (
            item.localId === localId ? { ...item, ...updates } : item
        )));
    }

    async function linkSavedEmergencyToServiceRequest({
        activeProperty,
        emergencyId,
        preferredProvider,
        serviceRequest,
        history,
    }: {
        activeProperty: { propertyId: string };
        emergencyId: string;
        preferredProvider: PreferredProvider;
        serviceRequest: CreatedServiceRequestReceipt;
        history: EmergencyHistoryEntry[];
    }) {
        await linkHomeEmergencyToServiceRequest({
            emergencyId,
            propertyId: activeProperty.propertyId,
            serviceRequest,
        });

        const nextHistory = [
            ...history,
            makeHistoryEntry('status', `Service request ${shortId(serviceRequest.id)} sent to ${preferredProvider.companyName}.`),
        ];

        await supabase
            .from('home_emergencies')
            .update({
                history: nextHistory,
                updated_at: new Date().toISOString(),
            })
            .eq('id', emergencyId)
            .eq('property_id', activeProperty.propertyId);
    }

    async function stageEmergencyForPreferredCompany({
        activeProperty,
        emergencyId,
        preferredProvider,
        mediaCount,
        sendError,
    }: {
        activeProperty: { userId: string; propertyId: string };
        emergencyId: string;
        preferredProvider: PreferredProvider;
        mediaCount: number;
        sendError: string;
    }) {
        try {
            const entry = await addProviderStagedWork({
                company_id: preferredProvider.companyId,
                property_id: activeProperty.propertyId,
                item_id: null,
                item_slug: null,
                item_name: 'HomeOS Emergency',
                system: 'Emergency',
                location: area,
                category: emergencyType,
                type: 'note',
                created_by: activeProperty.userId,
                status: 'staged',
                payload: {
                    source: 'homeos_emergency_create',
                    emergency_id: emergencyId,
                    emergency_type: emergencyType,
                    area,
                    description: description.trim(),
                    media_count: mediaCount,
                    service_request_error: sendError,
                },
            });

            return entry.source === 'provider_staging';
        } catch {
            return false;
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
                    Document Emergency
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
                    Document the emergency in HomeOS. If a preferred company is connected, HomeOS will try to send the emergency to that company during save.
                </Text>
                <ThemedCard style={{ marginBottom: 14, borderColor: theme.colors.status.activeEmergency.border, backgroundColor: theme.colors.status.activeEmergency.background }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', lineHeight: 20 }}>
                        If there is immediate danger, fire, gas odor, electrical danger, or a medical emergency, call 911. If safe, shut off the affected water or gas supply.
                    </Text>
                </ThemedCard>

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

                <ServiceRequestMediaPicker
                    items={media}
                    disabled={saving}
                    onChange={setMedia}
                    onMessage={setMessage}
                />

                {!!pendingEmergency && (
                    <Text style={{ color: theme.colors.mutedText, fontWeight: '900', lineHeight: 20, marginTop: 6 }}>
                        Emergency {shortId(pendingEmergency.emergencyId)} is waiting for media to finish. Retrying will use the same request.
                    </Text>
                )}

                <ThemedButton
                    title={saving ? 'Saving...' : 'Save HomeOS Emergency'}
                    disabled={saving || hasUnresolvedServiceRequestMedia(media)}
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

function buildServiceRequestSummary(emergencyType: string, area: string, description: string) {
    return [
        `${emergencyType} reported for ${area}.`,
        description,
    ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join('\n\n');
}

function shortId(value?: string | null) {
    return String(value || '').replace(/-/g, '').slice(0, 8).toUpperCase() || 'UNKNOWN';
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    return 'Unknown error';
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
