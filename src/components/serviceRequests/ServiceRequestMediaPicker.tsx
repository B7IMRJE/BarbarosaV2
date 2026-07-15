import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { useState } from 'react';
import { Image, Platform, Text, TextInput, View } from 'react-native';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';
import {
    createServiceRequestMediaDraftFromAsset,
    hasUnresolvedServiceRequestMedia,
    removeServiceRequestAttachment,
    serviceRequestMediaLimitSummary,
    serviceRequestMediaStatusLabel,
    validateServiceRequestMediaSelection,
    type ServiceRequestMediaDraft,
    type ServiceRequestMediaType,
} from '../../lib/serviceRequestMedia';
import { useTheme } from '../../theme/useTheme';

type ServiceRequestMediaPickerProps = {
    items: ServiceRequestMediaDraft[];
    disabled?: boolean;
    onChange: (items: ServiceRequestMediaDraft[]) => void;
    onMessage?: (message: string) => void;
};

export default function ServiceRequestMediaPicker({
    items,
    disabled,
    onChange,
    onMessage,
}: ServiceRequestMediaPickerProps) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [picking, setPicking] = useState(false);
    const busy = disabled || picking || hasUnresolvedServiceRequestMedia(items);

    async function choosePhotos() {
        await pickFromLibrary('photo', true);
    }

    async function chooseVideo() {
        await pickFromLibrary('video', false);
    }

    async function takePhoto() {
        await captureWithCamera('photo');
    }

    async function recordVideo() {
        await captureWithCamera('video');
    }

    async function pickFromLibrary(
        mediaType: ServiceRequestMediaType,
        allowsMultipleSelection: boolean,
        options: { skipBusyCheck?: boolean } = {}
    ) {
        if (!options.skipBusyCheck && busy) return;

        setPicking(true);
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (!permission.granted) {
                setPickerMessage('Photo/video library permission is required.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                allowsMultipleSelection,
                mediaTypes: mediaType === 'photo' ? ['images'] : ['videos'],
                orderedSelection: true,
                quality: 0.8,
                videoMaxDuration: 60,
            });

            if (!result.canceled) {
                addPickedAssets(result.assets, mediaType);
            }
        } catch (error) {
            setPickerMessage(getErrorMessage(error));
        } finally {
            setPicking(false);
        }
    }

    async function captureWithCamera(mediaType: ServiceRequestMediaType) {
        if (busy) return;

        setPicking(true);
        try {
            const permission = await ImagePicker.requestCameraPermissionsAsync();

            if (!permission.granted) {
                setPickerMessage('Camera capture is not available here. Choose a file instead.');
                setPicking(false);
                await pickFromLibrary(mediaType, false, { skipBusyCheck: true });
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: mediaType === 'photo' ? ['images'] : ['videos'],
                quality: 0.8,
                videoMaxDuration: 60,
            });

            if (!result.canceled) {
                addPickedAssets(result.assets, mediaType);
            }
        } catch {
            setPickerMessage('Camera capture is not available here. Choose a file instead.');
            setPicking(false);
            await pickFromLibrary(mediaType, false, { skipBusyCheck: true });
            return;
        } finally {
            setPicking(false);
        }
    }

    async function replaceItem(item: ServiceRequestMediaDraft) {
        if (busy) return;

        setPicking(true);
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (!permission.granted) {
                setPickerMessage('Photo/video library permission is required.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: item.mediaType === 'photo' ? ['images'] : ['videos'],
                quality: 0.8,
                videoMaxDuration: 60,
            });

            if (result.canceled || !result.assets[0]) return;

            const replacement = createServiceRequestMediaDraftFromAsset(result.assets[0], item.mediaType);
            const nextItems = items.map((current) => current.localId === item.localId
                ? { ...replacement, localId: item.localId, caption: item.caption }
                : current
            );
            const validationMessage = validateServiceRequestMediaSelection(nextItems);

            if (validationMessage) {
                setPickerMessage(validationMessage);
                return;
            }

            if (item.status === 'saved' && item.attachmentId && item.bucket && item.storagePath) {
                await removeServiceRequestAttachment({
                    id: item.attachmentId,
                    bucket: item.bucket,
                    storagePath: item.storagePath,
                });
            }

            onChange(nextItems);
            setPickerMessage('');
        } catch (error) {
            setPickerMessage(getErrorMessage(error));
        } finally {
            setPicking(false);
        }
    }

    async function removeItem(item: ServiceRequestMediaDraft) {
        if (busy) return;

        if (item.status === 'saved' && item.attachmentId && item.bucket && item.storagePath) {
            onChange(items.map((current) => current.localId === item.localId ? { ...current, status: 'removing' } : current));
            try {
                await removeServiceRequestAttachment({
                    id: item.attachmentId,
                    bucket: item.bucket,
                    storagePath: item.storagePath,
                });
            } catch (error) {
                onChange(items.map((current) => current.localId === item.localId ? {
                    ...current,
                    status: 'saved',
                    error: getErrorMessage(error),
                } : current));
                return;
            }
        }

        onChange(items.filter((current) => current.localId !== item.localId));
    }

    function updateCaption(item: ServiceRequestMediaDraft, caption: string) {
        onChange(items.map((current) => current.localId === item.localId ? { ...current, caption } : current));
    }

    function addPickedAssets(assets: ImagePicker.ImagePickerAsset[], mediaType: ServiceRequestMediaType) {
        const drafts = assets.map((asset) => createServiceRequestMediaDraftFromAsset(asset, mediaType));
        const nextItems = [...items, ...drafts];
        const validationMessage = validateServiceRequestMediaSelection(nextItems);

        if (validationMessage) {
            setPickerMessage(validationMessage);
            return;
        }

        onChange(nextItems);
        setPickerMessage('');
    }

    function setPickerMessage(message: string) {
        onMessage?.(message);
    }

    return (
        <ThemedCard style={{ marginTop: scaleIcon(14), marginBottom: scaleIcon(14) }}>
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>
                Photos and videos
            </Text>
            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '800', lineHeight: scaleFont(19), marginTop: scaleIcon(6) }}>
                {serviceRequestMediaLimitSummary()}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginTop: scaleIcon(12) }}>
                <ThemedButton title="Take Photo" variant="secondary" disabled={busy} onPress={takePhoto} style={buttonStyle} textStyle={buttonTextStyle} />
                <ThemedButton title="Choose Photos" variant="secondary" disabled={busy} onPress={choosePhotos} style={buttonStyle} textStyle={buttonTextStyle} />
                <ThemedButton title="Record Video" variant="secondary" disabled={busy} onPress={recordVideo} style={buttonStyle} textStyle={buttonTextStyle} />
                <ThemedButton title="Choose Video" variant="secondary" disabled={busy} onPress={chooseVideo} style={buttonStyle} textStyle={buttonTextStyle} />
            </View>

            {items.length === 0 ? (
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '800', marginTop: scaleIcon(12) }}>
                    No media selected.
                </Text>
            ) : (
                <View style={{ gap: scaleIcon(10), marginTop: scaleIcon(14) }}>
                    {items.map((item) => (
                        <View
                            key={item.localId}
                            style={{
                                borderColor: theme.colors.border,
                                borderRadius: theme.radii.card,
                                borderWidth: 1,
                                padding: scaleIcon(10),
                                backgroundColor: theme.colors.surfaceAlt,
                            }}
                        >
                            <View style={{ flexDirection: 'row', gap: scaleIcon(10), alignItems: 'flex-start' }}>
                                <MediaPreview item={item} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }} numberOfLines={1}>
                                        {item.fileName || (item.mediaType === 'video' ? 'Video' : 'Photo')}
                                    </Text>
                                    <Text style={{ color: statusColor(item.status, theme), fontSize: scaleFont(12), fontWeight: '900', marginTop: scaleIcon(3) }}>
                                        {serviceRequestMediaStatusLabel(item.status)}
                                    </Text>
                                    {!!item.error && (
                                        <Text style={{ color: theme.colors.danger, fontSize: scaleFont(12), fontWeight: '800', lineHeight: scaleFont(17), marginTop: scaleIcon(4) }}>
                                            {item.error}
                                        </Text>
                                    )}
                                </View>
                            </View>

                            <TextInput
                                value={item.caption}
                                onChangeText={(text) => updateCaption(item, text)}
                                placeholder="Optional caption"
                                placeholderTextColor={theme.colors.mutedText}
                                editable={!busy && item.status !== 'saved'}
                                style={{
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.card,
                                    borderWidth: 1,
                                    color: theme.colors.text,
                                    fontSize: scaleFont(13),
                                    fontWeight: '700',
                                    marginTop: scaleIcon(10),
                                    padding: scaleIcon(10),
                                }}
                            />

                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginTop: scaleIcon(10) }}>
                                <ThemedButton title="Replace" variant="secondary" disabled={busy} onPress={() => replaceItem(item)} style={smallButtonStyle} textStyle={buttonTextStyle} />
                                <ThemedButton title="Remove" variant="danger" disabled={busy} onPress={() => removeItem(item)} style={smallButtonStyle} textStyle={buttonTextStyle} />
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </ThemedCard>
    );
}

function MediaPreview({ item }: { item: ServiceRequestMediaDraft }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const previewUri = item.signedUrl || item.uri;

    if (item.mediaType === 'photo') {
        return (
            <Image
                source={{ uri: previewUri }}
                style={{
                    width: scaleIcon(86),
                    height: scaleIcon(86),
                    borderRadius: theme.radii.card,
                    backgroundColor: theme.colors.surface,
                }}
            />
        );
    }

    if (Platform.OS === 'web') {
        return (
            <View style={{ width: scaleIcon(110), height: scaleIcon(86), borderRadius: theme.radii.card, overflow: 'hidden', backgroundColor: theme.colors.surface }}>
                {React.createElement('video', {
                    src: previewUri,
                    controls: true,
                    style: { width: '100%', height: '100%', objectFit: 'cover' },
                })}
            </View>
        );
    }

    return (
        <View
            style={{
                width: scaleIcon(86),
                height: scaleIcon(86),
                borderRadius: theme.radii.card,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surface,
            }}
        >
            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900' }}>
                Video
            </Text>
        </View>
    );
}

function statusColor(status: ServiceRequestMediaDraft['status'], theme: ReturnType<typeof useTheme>['theme']) {
    if (status === 'failed') return theme.colors.danger;
    if (status === 'saved') return theme.colors.text;
    return theme.colors.mutedText;
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
}

const buttonStyle = {
    flexGrow: 1,
    flexBasis: 140,
    paddingVertical: 10,
    paddingHorizontal: 12,
};

const smallButtonStyle = {
    paddingVertical: 9,
    paddingHorizontal: 12,
};

const buttonTextStyle = {
    fontSize: 13,
};
