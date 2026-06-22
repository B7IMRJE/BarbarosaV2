import HomeHeader from '../../components/HomeHeader';

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    ScrollView,
    Text,
    View,
    TouchableOpacity,
} from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import { addItemToEstimateDraft } from '../../lib/estimateDraft';
import { createJobWithFirstEvent } from '../../lib/jobs';
import { isStaffRole, loadCurrentUserRole } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

declare const __DEV__: boolean;

type ItemFile = {
    id: string;
    property_id: string | null;
    home_item_id: string | null;
    item_slug: string | null;
    user_id: string | null;
    storage_bucket: string | null;
    storage_path: string | null;
    file_url: string;
    file_name: string | null;
    file_type: string;
    category: string;
    created_at: string | null;
};

type GalleryPhoto = ItemFile & {
    isMainPhoto?: boolean;
};

const photoCategories = [
    'equipment_photo',
    'serial_photo',
    'model_photo',
    'other_photo',
];

const documentCategories = [
    'manual',
    'warranty',

    'estimate',
    'accepted_option',
    'declined_option',

    'invoice',
    'receipt',

    'permit',
    'inspection',

    'service_report',
    'maintenance_record',

    'other',
];

const documentCategoryLabels: Record<string, { singular: string; plural: string }> = {
    manual: { singular: 'Manual', plural: 'Manuals' },
    warranty: { singular: 'Warranty', plural: 'Warranties' },
    estimate: { singular: 'Estimate', plural: 'Estimates' },
    accepted_option: { singular: 'Accepted Option', plural: 'Accepted Options' },
    declined_option: { singular: 'Declined Option', plural: 'Declined Options' },
    invoice: { singular: 'Invoice', plural: 'Invoices' },
    receipt: { singular: 'Receipt', plural: 'Receipts' },
    permit: { singular: 'Permit', plural: 'Permits' },
    inspection: { singular: 'Inspection', plural: 'Inspections' },
    service_report: { singular: 'Service Report', plural: 'Service Reports' },
    maintenance_record: { singular: 'Maintenance Record', plural: 'Maintenance Records' },
    other: { singular: 'Other', plural: 'Other' },
};

function documentLabel(category: string, variant: 'singular' | 'plural' = 'singular') {
    return documentCategoryLabels[category]?.[variant] || category.replace(/_/g, ' ');
}

function photoLabel(category: string) {
    const labels: Record<string, string> = {
        main_photo: 'Main Photo',
        equipment_photo: 'Equipment Photo',
        label_photo: 'Label Photo',
        serial_photo: 'Serial Number Photo',
        model_photo: 'Model Number Photo',
        before_photo: 'Before Photo',
        after_photo: 'After Photo',
        other: 'Other Photo',
        other_photo: 'Other Photo',
    };

    return labels[category] || category.replace(/_/g, ' ');
}

function normalizePhotoCategory(category: string) {
    return category === 'other' ? 'other_photo' : category;
}

function isImageFile(fileName?: string | null) {
    const lowerName = fileName?.toLowerCase() || '';
    return (
        lowerName.endsWith('.jpg') ||
        lowerName.endsWith('.jpeg') ||
        lowerName.endsWith('.png') ||
        lowerName.endsWith('.webp')
    );
}

function mergeUniqueFiles(...groups: ItemFile[][]) {
    const filesById = new Map<string, ItemFile>();

    groups.flat().forEach((file) => {
        const key = file.id || `${file.file_url}-${file.file_name || ''}`;
        filesById.set(key, file);
    });

    return Array.from(filesById.values()).sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );
}

function getStorageBucket(file: ItemFile) {
    return file.storage_bucket || 'item-files';
}

function getStoragePath(file: ItemFile) {
    if (file.storage_path) return file.storage_path;

    const bucket = getStorageBucket(file);
    const markers = [
        `/storage/v1/object/public/${bucket}/`,
        `/storage/v1/object/sign/${bucket}/`,
    ];

    for (const marker of markers) {
        const markerIndex = file.file_url.indexOf(marker);

        if (markerIndex >= 0) {
            const path = file.file_url.slice(markerIndex + marker.length).split('?')[0];
            return decodeURIComponent(path);
        }
    }

    return null;
}

function buildGalleryPhotos(mainPhotoUrl: string | null | undefined, appendedPhotos: ItemFile[]) {
    const usedUrls = new Set<string>();
    const galleryPhotos: GalleryPhoto[] = [];

    if (mainPhotoUrl) {
        usedUrls.add(mainPhotoUrl);
        galleryPhotos.push({
            id: 'main-photo',
            property_id: null,
            home_item_id: null,
            item_slug: null,
            user_id: null,
            storage_bucket: 'item-photos',
            storage_path: null,
            file_url: mainPhotoUrl,
            file_name: 'Main Photo',
            file_type: 'photo',
            category: 'main_photo',
            created_at: null,
            isMainPhoto: true,
        });
    }

    appendedPhotos.forEach((photo) => {
        if (!photo.file_url || usedUrls.has(photo.file_url)) return;
        usedUrls.add(photo.file_url);
        galleryPhotos.push(photo);
    });

    return galleryPhotos;
}

function getSafeErrorCode(error: unknown) {
    const candidate =
        (error as { code?: unknown; status?: unknown; name?: unknown } | null)?.code ??
        (error as { status?: unknown; name?: unknown } | null)?.status ??
        (error as { name?: unknown } | null)?.name;

    return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : 'unknown';
}

function logMediaDebug(stage: string, error?: unknown) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.info('[ItemMedia]', { stage, code: error ? getSafeErrorCode(error) : 'none' });
    }
}

export default function ItemScreen() {
    const { theme } = useTheme();
    const [showDocumentTypePicker, setShowDocumentTypePicker] = useState(false);
    const { slug } = useLocalSearchParams();
    const [item, setItem] = useState<any>(null);
    const [files, setFiles] = useState<ItemFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [capturingPhoto, setCapturingPhoto] = useState(false);
    const [showPhoto, setShowPhoto] = useState(false);
    const [showPhotos, setShowPhotos] = useState(false);
    const [showDocuments, setShowDocuments] = useState(false);
    const [photoCategory, setPhotoCategory] = useState('equipment_photo');
    const [selectedDocumentType, setSelectedDocumentType] = useState<string | null>(null);
    const [currentUserRole, setCurrentUserRole] = useState('HOMEOWNER');
    const [removingFileId, setRemovingFileId] = useState<string | null>(null);
    const [message, setMessage] = useState('');

    useEffect(() => {
        void loadItem();
    }, [slug]);

    async function loadItem() {
        setLoading(true);

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');
            setItem(null);
            setFiles([]);
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        setCurrentUserRole(await loadCurrentUserRole());

        const { data, error } = await supabase
            .from('home_items')
            .select('*')
            .eq('item_slug', String(slug))
            .eq('property_id', activeProperty.propertyId)
            .maybeSingle();

        if (error) {
            setMessage(`Item load failed: ${error.message}`);
            setItem(null);
            setFiles([]);
        } else if (!data) {
            setMessage('Item not found.');
            setItem(null);
            setFiles([]);
        } else {
            setItem(data);
            setMessage('');
            await loadFiles({
                propertyId: activeProperty.propertyId,
                homeItemId: String(data.id || ''),
                itemSlug: data.item_slug || String(slug),
            });
        }

        setLoading(false);
    }

    async function loadFiles({
        propertyId,
        homeItemId,
        itemSlug,
    }: {
        propertyId?: string;
        homeItemId?: string;
        itemSlug?: string | null;
    } = {}) {
        let resolvedPropertyId = propertyId;

        if (!resolvedPropertyId) {
            try {
                resolvedPropertyId = (await requireActivePropertyMembership()).propertyId;
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');
                setFiles([]);

                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                return;
            }
        }

        const resolvedHomeItemId = homeItemId || String(item?.id || '');
        const resolvedItemSlug = itemSlug || item?.item_slug || String(slug);
        const fileGroups: ItemFile[][] = [];
        let homeItemIdQueryFailed = false;

        if (resolvedHomeItemId) {
            const { data, error } = await supabase
                .from('home_item_files')
                .select('*')
                .eq('home_item_id', resolvedHomeItemId)
                .eq('property_id', resolvedPropertyId)
                .order('created_at', { ascending: false });

            if (error) {
                homeItemIdQueryFailed = true;
                logMediaDebug('load-files-home-item-id', error);
            } else {
                fileGroups.push((data || []) as ItemFile[]);
            }
        }

        if (resolvedItemSlug) {
            const { data, error } = await supabase
                .from('home_item_files')
                .select('*')
                .eq('item_slug', resolvedItemSlug)
                .eq('property_id', resolvedPropertyId)
                .order('created_at', { ascending: false });

            if (error) {
                logMediaDebug('load-files-item-slug', error);
                setMessage('Files could not be loaded. Please try again.');
                return;
            }

            fileGroups.push((data || []) as ItemFile[]);
        }

        if (homeItemIdQueryFailed && !resolvedItemSlug) {
            setMessage('Files could not be loaded. Please try again.');
            setFiles([]);
            return;
        }

        setFiles(mergeUniqueFiles(...fileGroups));
    }

    async function uploadMainPhotoFromAsset(asset: ImagePicker.ImagePickerAsset) {
        try {
            setUploading(true);
            setMessage('Uploading main photo...');

            let activeProperty;

            try {
                activeProperty = await requireActivePropertyMembership();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');

                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                return;
            }

            const response = await fetch(asset.uri);
            const arrayBuffer = await response.arrayBuffer();

            const fileExt = asset.uri.split('.').pop() || 'jpg';
            const fileName = `${String(slug)}-main-${Date.now()}.${fileExt}`;
            const filePath = `users/${activeProperty.userId}/items/${String(slug)}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('item-photos')
                .upload(filePath, arrayBuffer, {
                    contentType: asset.mimeType || 'image/jpeg',
                    upsert: true,
                });

            if (uploadError) {
                logMediaDebug('main-photo-storage-upload', uploadError);
                setMessage('Main photo upload failed. Please try again.');
                return;
            }

            const { data: publicUrlData } = supabase.storage
                .from('item-photos')
                .getPublicUrl(filePath);

            const photoUrl = publicUrlData.publicUrl;

            const { error: updateError } = await supabase
                .from('home_items')
                .update({ photo_url: photoUrl })
                .eq('item_slug', String(slug))
                .eq('property_id', activeProperty.propertyId);

            if (updateError) {
                logMediaDebug('main-photo-item-update', updateError);
                setMessage('Main photo uploaded but could not be saved. Please try again.');
                return;
            }

            setMessage('Main photo uploaded.');
            await loadItem();
        } catch (error: any) {
            logMediaDebug('main-photo-upload', error);
            setMessage('Main photo upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    }

    async function cleanupUploadedFile(bucket: string, path: string, stage: string) {
        const { error } = await supabase.storage.from(bucket).remove([path]);

        if (error) {
            logMediaDebug(stage, error);
        }
    }

    async function uploadExtraFile({
        uri,
        fileName,
        mimeType,
        fileType,
        category,
    }: {
        uri: string;
        fileName: string;
        mimeType: string;
        fileType: 'photo' | 'document';
        category: string;
    }): Promise<boolean> {
        try {
            setUploading(true);
            setMessage(`Uploading ${fileType}...`);

            let activeProperty;

            try {
                activeProperty = await requireActivePropertyMembership();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');

                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                return false;
            }

            const response = await fetch(uri);
            const arrayBuffer = await response.arrayBuffer();

            const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
            const resolvedItemSlug = item?.item_slug || String(slug);
            const filePath = `users/${activeProperty.userId}/items/${resolvedItemSlug}/${fileType}s/${Date.now()}-${cleanName}`;

            const { error: uploadError } = await supabase.storage
                .from('item-files')
                .upload(filePath, arrayBuffer, {
                    contentType: mimeType,
                    upsert: true,
                });

            if (uploadError) {
                logMediaDebug(`${fileType}-storage-upload`, uploadError);
                setMessage(`${fileType === 'photo' ? 'Photo' : 'Document'} upload failed. Please try again.`);
                return false;
            }

            const { data: publicUrlData } = supabase.storage
                .from('item-files')
                .getPublicUrl(filePath);

            const fileUrl = publicUrlData.publicUrl;

            const { error: insertError } = await supabase
                .from('home_item_files')
                .insert({
                    user_id: activeProperty.userId,
                    property_id: activeProperty.propertyId,
                    home_item_id: item?.id || null,
                    item_slug: resolvedItemSlug,
                    storage_bucket: 'item-files',
                    storage_path: filePath,
                    file_url: fileUrl,
                    file_name: fileName,
                    file_type: fileType,
                    category,
                });

            if (insertError) {
                logMediaDebug(`${fileType}-metadata-insert`, insertError);
                await cleanupUploadedFile('item-files', filePath, `${fileType}-metadata-cleanup`);
                setMessage(`${fileType === 'photo' ? 'Photo' : 'Document'} upload failed. Please try again.`);
                return false;
            }

            setMessage(`${fileType === 'photo' ? 'Photo' : 'Document'} uploaded.`);
            await loadFiles({
                propertyId: activeProperty.propertyId,
                homeItemId: String(item?.id || ''),
                itemSlug: item?.item_slug || String(slug),
            });
            return true;
        } catch (error: any) {
            logMediaDebug(`${fileType}-upload`, error);
            setMessage(`${fileType === 'photo' ? 'Photo' : 'Document'} upload failed. Please try again.`);
            return false;
        } finally {
            setUploading(false);
        }
    }

    async function handleUploadMainPhoto() {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            setMessage('Photo library permission is required.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
        });

        if (result.canceled) return;

        await uploadMainPhotoFromAsset(result.assets[0]);
    }

    async function handleTakeMainPhoto() {
        await capturePhoto('main');
    }

    async function handleUploadAdditionalPhoto() {
        const selectedCategory = normalizePhotoCategory(photoCategory);
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            setMessage('Photo library permission is required.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
        });

        if (result.canceled) return;

        const asset = result.assets[0];

        await uploadExtraFile({
            uri: asset.uri,
            fileName: asset.fileName || `${String(slug)}-${Date.now()}.jpg`,
            mimeType: asset.mimeType || 'image/jpeg',
            fileType: 'photo',
            category: selectedCategory,
        });
    }

    async function handleTakeAdditionalPhoto() {
        await capturePhoto('additional', normalizePhotoCategory(photoCategory));
    }

    async function handleUploadDocument() {
        setShowDocumentTypePicker(true);
    }

    async function finishDocumentUpload(selectedType: string) {
        setShowDocumentTypePicker(false);

        const result = await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: true,
            multiple: false,
        });

        if (result.canceled) return;

        const asset = result.assets[0];

        const uploaded = await uploadExtraFile({
            uri: asset.uri,
            fileName: asset.name || `${String(slug)}-${Date.now()}`,
            mimeType: asset.mimeType || 'application/octet-stream',
            fileType: 'document',
            category: selectedType,
        });

        if (uploaded) {
            setSelectedDocumentType(selectedType);
            setShowDocuments(true);
        }
    }

    async function capturePhoto(intent: 'main' | 'additional', category = 'equipment_photo') {
        try {
            if (capturingPhoto || uploading) return;

            setCapturingPhoto(true);
            const permission = await ImagePicker.requestCameraPermissionsAsync();

            if (!permission.granted) {
                setMessage('Camera permission is required. Check browser or device camera permissions and try again.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.8,
            });

            if (result.canceled) return;

            const asset = result.assets[0];

            if (intent === 'main') {
                await uploadMainPhotoFromAsset(asset);
                return;
            }

            await uploadExtraFile({
                uri: asset.uri,
                fileName: asset.fileName || `${String(slug)}-${Date.now()}.jpg`,
                mimeType: asset.mimeType || 'image/jpeg',
                fileType: 'photo',
                category,
            });
        } catch (error: any) {
            logMediaDebug('camera-capture', error);
            setMessage('Camera could not open. Check camera permissions and try again.');
        } finally {
            setCapturingPhoto(false);
        }
    }

    function handleEditInformation() {
        router.push({
            pathname: '/item/edit',
            params: { slug: String(slug) },
        } as any);
    }

    function handleAddRelatedItem() {
        router.push({
            pathname: '/item/create',
            params: {
                system: item.system || 'Plumbing',
                category: 'Component',
                location: item.location || '',
                parentArea: item.parent_area || item.name || '',
            },
        } as any);
    }

    async function handleAddToEstimate() {
        await addItemToEstimateDraft({
            id: String(item.id || item.item_slug || slug),
            name: item.name || 'Unknown Item',
            item_slug: item.item_slug || String(slug),
            system: item.system || 'Unknown',
            category: item.category || 'Unknown',
            status: item.status || null,
            install_state: item.install_state || null,
        });

        setMessage(`${item.name || 'Item'} added to estimate.`);
    }

    async function handleStartJobThread() {
        try {
            setMessage('Starting job thread...');

            const itemSlug = item.item_slug || String(slug);
            const itemName = item.name || 'Unknown Item';
            const system = item.system || 'Unknown';
            const roomOrArea = item.location || item.parent_area || null;
            const status = String(item.status || '').toLowerCase();
            const priority =
                status.includes('emergency') || status.includes('active leak')
                    ? 'emergency'
                    : 'normal';

            const { job } = await createJobWithFirstEvent({
                title: `${itemName} Service Request`,
                system,
                priority,
                room_or_area: roomOrArea,
                item_slug: itemSlug,
                job_source: 'item',
                job_type: 'service_request',
                event_type: 'job_created',
                visibility: 'homeowner',
                actor_role: 'homeowner',
                metadata: {
                    item_slug: itemSlug,
                    item_name: itemName,
                    system,
                    room_or_area: roomOrArea,
                },
            });

            router.push(`/jobs/${job.id}` as any);
        } catch (error: any) {
            setMessage(`Could not start job thread: ${error.message || 'Unknown error'}`);
        }
    }

    async function handleRemoveItem() {
        setMessage('Archiving item...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const { error } = await supabase
            .from('home_items')
            .update({ archived: true })
            .eq('item_slug', String(slug))
            .eq('property_id', activeProperty.propertyId);

        if (error) {
            setMessage(`Remove failed: ${error.message}`);
            return;
        }

        setMessage('Item archived.');

        setTimeout(() => {
            router.back();
        }, 700);
    }

    function handleRemoveFile(file: ItemFile) {
        Alert.alert(
            'Remove file?',
            'This will delete the uploaded file from this item.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                        void removeFile(file);
                    },
                },
            ]
        );
    }

    async function removeFile(file: ItemFile) {
        try {
            setRemovingFileId(file.id);
            setMessage('Removing file...');

            let activeProperty;

            try {
                activeProperty = await requireActivePropertyMembership();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');

                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                return;
            }

            if (file.user_id && file.user_id !== activeProperty.userId) {
                setMessage('You can only remove your own files.');
                return;
            }

            const storageBucket = getStorageBucket(file);
            const storagePath = getStoragePath(file);

            if (!storagePath) {
                setMessage('This legacy file record cannot be removed from storage safely yet.');
                return;
            }

            const { error: storageError } = await supabase.storage
                .from(storageBucket)
                .remove([storagePath]);

            if (storageError) {
                logMediaDebug('file-storage-remove', storageError);
                setMessage('File could not be removed. Please try again.');
                return;
            }

            const { error: deleteError } = await supabase
                .from('home_item_files')
                .delete()
                .eq('id', file.id)
                .eq('property_id', activeProperty.propertyId);

            if (deleteError) {
                logMediaDebug('file-metadata-delete', deleteError);
                setMessage('File could not be removed. Please try again.');
                return;
            }

            setMessage('File removed.');
            await loadFiles({
                propertyId: activeProperty.propertyId,
                homeItemId: String(item?.id || ''),
                itemSlug: item?.item_slug || String(slug),
            });
        } catch (error: any) {
            logMediaDebug('file-remove', error);
            setMessage('File could not be removed. Please try again.');
        } finally {
            setRemovingFileId(null);
        }
    }

    if (loading) {
        return (
            <View style={centerStyle}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (!item) {
        return (
            <View style={centerStyle}>
                <Text style={{ fontSize: 18, color: theme.colors.text, fontWeight: '900' }}>
                    Item not found.
                </Text>
                <Text style={{ marginTop: 10, color: theme.colors.mutedText }}>{message}</Text>
            </View>
        );
    }

    const photos = files.filter((file) => file.file_type === 'photo');
    const galleryPhotos = buildGalleryPhotos(item.photo_url, photos);
    const documents = files.filter((file) => file.file_type === 'document');
    const mediaActionBusy = uploading || capturingPhoto;
    const mediaBusyTitle = uploading ? 'Uploading...' : 'Opening...';

    const groupedDocuments = documentCategories.map((category) => ({
        category,
        documents: documents.filter((doc) => doc.category === category),
    }));

    const canUseStaffTools = isStaffRole(currentUserRole);

    const detailCards = [
        { label: 'Condition', value: item.install_state || 'Unknown' },
        { label: 'Status', value: item.status || 'Missing Information' },
        { label: 'System', value: item.system || 'Unknown' },
        { label: 'Category', value: item.category || 'Unknown' },
        { label: 'Location', value: item.location || 'Unknown' },
        { label: 'Parent Area', value: item.parent_area || 'None' },
        { label: 'Brand', value: item.brand || 'Unknown' },
        { label: 'Model', value: item.model || 'Unknown' },
        { label: 'Serial', value: item.serial || 'Unknown' },
    ];

    return (
        <>
            <ScrollView
                style={{ flex: 1, backgroundColor: theme.colors.background }}
                contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
            >
                <View style={{ width: '100%', maxWidth: 1200 }}>
                    <HomeHeader />

                    <Text style={[titleStyle, { color: theme.colors.text }]}>{item.name}</Text>

                    <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                        {item.about || 'This item has not been fully documented yet.'}
                    </Text>

                    <ThemedCard style={photoCardStyle}>
                        <Text style={[labelStyle, { color: theme.colors.mutedText }]}>Main Item Photo</Text>

                        {item.photo_url ? (
                            <>
                                <Image
                                    source={{ uri: item.photo_url }}
                                    style={photoStyle}
                                    resizeMode="contain"
                                />

                                <ThemedButton
                                    title="View Full Photo"
                                    variant="secondary"
                                    onPress={() => setShowPhoto(true)}
                                    style={secondaryButtonStyle}
                                    textStyle={secondaryButtonTextStyle}
                                />
                            </>
                        ) : (
                            <View style={[photoPlaceholderStyle, { backgroundColor: theme.colors.surfaceAlt }]}>
                                <Text style={photoIconStyle}>📷</Text>
                                <Text style={[photoTextStyle, { color: theme.colors.mutedText }]}>No main photo uploaded</Text>
                            </View>
                        )}
                    </ThemedCard>

                    <View style={infoGridStyle}>
                        {detailCards.map((detail) => (
                            <ThemedCard
                                key={detail.label}
                                style={miniCardStyle}
                            >
                                <Text style={[miniLabelStyle, { color: theme.colors.mutedText }]}>{detail.label}</Text>
                                <Text style={[miniValueStyle, { color: theme.colors.text }]} numberOfLines={2}>
                                    {detail.value}
                                </Text>
                            </ThemedCard>
                        ))}
                    </View>

                    <View style={fileSummaryStyle}>
                        <ThemedCard style={fileSummaryCardStyle}>
                            <Text style={[fileSummaryTitleStyle, { color: theme.colors.mutedText }]}>Photos</Text>
                            <Text style={[fileSummaryCountStyle, { color: theme.colors.text }]}>{galleryPhotos.length}</Text>
                        </ThemedCard>

                        <ThemedCard style={fileSummaryCardStyle}>
                            <Text style={[fileSummaryTitleStyle, { color: theme.colors.mutedText }]}>Documents</Text>
                            <Text style={[fileSummaryCountStyle, { color: theme.colors.text }]}>{documents.length}</Text>
                        </ThemedCard>
                    </View>

                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Photo Type</Text>
                    <OptionRow
                        options={photoCategories}
                        value={photoCategory}
                        onChange={setPhotoCategory}
                        labelForOption={photoLabel}
                    />

                    <View style={actionGridStyle}>
                        {canUseStaffTools && (
                            <>
                                <ThemedButton
                                    title="Add To Estimate"
                                    onPress={handleAddToEstimate}
                                    style={buttonStyle}
                                    textStyle={buttonTextStyle}
                                />

                                <ThemedButton
                                    title="View Estimate"
                                    onPress={() => router.push('/estimate' as any)}
                                    style={buttonStyle}
                                    textStyle={buttonTextStyle}
                                />

                                <ThemedButton
                                    title="Start Job Thread"
                                    onPress={handleStartJobThread}
                                    style={buttonStyle}
                                    textStyle={buttonTextStyle}
                                />
                            </>
                        )}

                        <ThemedButton
                            title={mediaActionBusy ? mediaBusyTitle : 'Upload Main Photo'}
                            onPress={handleUploadMainPhoto}
                            disabled={mediaActionBusy}
                            style={buttonStyle}
                            textStyle={buttonTextStyle}
                        />

                        <ThemedButton
                            title={mediaActionBusy ? mediaBusyTitle : 'Take Main Photo'}
                            onPress={handleTakeMainPhoto}
                            disabled={mediaActionBusy}
                            style={buttonStyle}
                            textStyle={buttonTextStyle}
                        />

                        <ThemedButton
                            title={mediaActionBusy ? mediaBusyTitle : 'Choose Photo'}
                            onPress={handleUploadAdditionalPhoto}
                            disabled={mediaActionBusy}
                            style={buttonStyle}
                            textStyle={buttonTextStyle}
                        />

                        <ThemedButton
                            title={mediaActionBusy ? mediaBusyTitle : 'Upload Document'}
                            onPress={handleUploadDocument}
                            disabled={mediaActionBusy}
                            style={buttonStyle}
                            textStyle={buttonTextStyle}
                        />

                        <ThemedButton
                            title={mediaActionBusy ? mediaBusyTitle : 'Take Photo'}
                            onPress={handleTakeAdditionalPhoto}
                            disabled={mediaActionBusy}
                            style={buttonStyle}
                            textStyle={buttonTextStyle}
                        />

                        <ThemedButton
                            title="View Photos"
                            onPress={() => setShowPhotos(true)}
                            style={buttonStyle}
                            textStyle={buttonTextStyle}
                        />

                        <ThemedButton
                            title="View Documents"
                            onPress={() => {
                                setSelectedDocumentType(null);
                                setShowDocuments(true);
                            }}
                            style={buttonStyle}
                            textStyle={buttonTextStyle}
                        />

                        <ThemedButton
                            title="Edit Information"
                            onPress={handleEditInformation}
                            style={buttonStyle}
                            textStyle={buttonTextStyle}
                        />

                        <ThemedButton
                            title="Add Related Item"
                            onPress={handleAddRelatedItem}
                            style={buttonStyle}
                            textStyle={buttonTextStyle}
                        />

                        <ThemedButton
                            title="Request Service"
                            onPress={() => setMessage('Request service comes next.')}
                            style={buttonStyle}
                            textStyle={buttonTextStyle}
                        />

                        <ThemedButton
                            title="Remove Item"
                            variant="danger"
                            onPress={handleRemoveItem}
                            style={removeButtonStyle}
                            textStyle={removeButtonTextStyle}
                        />
                    </View>

                    {!!message && (
                        <ThemedCard style={messageCardStyle}>
                            <Text style={[labelStyle, { color: theme.colors.mutedText }]}>Message</Text>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                        </ThemedCard>
                    )}
                </View>
            </ScrollView>

            <Modal visible={showPhoto} transparent={false} animationType="fade">
                <View style={[modalStyle, { backgroundColor: theme.colors.overlay }]}>
                    <TouchableOpacity
                        onPress={() => setShowPhoto(false)}
                        style={modalCloseStyle}
                    >
                        <Text style={[modalCloseTextStyle, { color: theme.colors.primaryText }]}>✕</Text>
                    </TouchableOpacity>

                    {item.photo_url && (
                        <Image
                            source={{ uri: item.photo_url }}
                            style={modalImageStyle}
                            resizeMode="contain"
                        />
                    )}
                </View>
            </Modal>

            <Modal visible={showPhotos} transparent={false} animationType="slide">
                <ScrollView
                    style={[galleryModalStyle, { backgroundColor: theme.colors.background }]}
                    contentContainerStyle={{ padding: 20 }}
                >
                    <TouchableOpacity onPress={() => setShowPhotos(false)}>
                        <Text style={[modalBackTextStyle, { color: theme.colors.text }]}>← Close Photos</Text>
                    </TouchableOpacity>

                    <Text style={[modalTitleStyle, { color: theme.colors.text }]}>Photos</Text>

                    <View style={galleryGridStyle}>
                        {galleryPhotos.map((photo) => (
                            <View
                                key={photo.id}
                                style={[
                                    galleryCardStyle,
                                    {
                                        backgroundColor: theme.colors.surface,
                                        borderColor: theme.colors.border,
                                        borderRadius: theme.radii.button,
                                    },
                                ]}
                            >
                                <TouchableOpacity onPress={() => Linking.openURL(photo.file_url)} activeOpacity={0.82}>
                                    <Image
                                        source={{ uri: photo.file_url }}
                                        style={[galleryImageStyle, { backgroundColor: theme.colors.surfaceAlt }]}
                                        resizeMode="contain"
                                    />
                                    <Text style={[galleryCategoryStyle, { color: theme.colors.text }]}>
                                        {photoLabel(photo.category)}
                                    </Text>
                                </TouchableOpacity>
                                {!photo.isMainPhoto && (
                                    <ThemedButton
                                        title={removingFileId === photo.id ? 'Removing...' : 'Remove'}
                                        variant="danger"
                                        disabled={removingFileId === photo.id}
                                        onPress={() => handleRemoveFile(photo)}
                                        style={fileActionButtonStyle}
                                        textStyle={fileActionButtonTextStyle}
                                    />
                                )}
                            </View>
                        ))}
                    </View>

                    {galleryPhotos.length === 0 && (
                        <Text style={[emptyTextStyle, { color: theme.colors.mutedText }]}>No photos yet.</Text>
                    )}
                </ScrollView>
            </Modal>

            <Modal visible={showDocuments} transparent={false} animationType="slide">
                <ScrollView
                    style={[galleryModalStyle, { backgroundColor: theme.colors.background }]}
                    contentContainerStyle={{ padding: 20 }}
                >
                    <TouchableOpacity onPress={() => setShowDocuments(false)}>
                        <Text style={[modalBackTextStyle, { color: theme.colors.text }]}>Close Documents</Text>
                    </TouchableOpacity>

                    <Text style={[modalTitleStyle, { color: theme.colors.text }]}>Documents</Text>

                    {!selectedDocumentType ? (
                        <>
                            <Text style={[documentExplorerTitleStyle, { color: theme.colors.mutedText }]}>Document Type Explorer</Text>

                            <View style={documentExplorerGridStyle}>
                                {groupedDocuments.map((group) => (
                                    <TouchableOpacity
                                        key={group.category}
                                        style={[
                                            documentExplorerBlockStyle,
                                            {
                                                backgroundColor: theme.colors.surface,
                                                borderColor: theme.colors.border,
                                                borderRadius: theme.radii.card,
                                            },
                                        ]}
                                        onPress={() => setSelectedDocumentType(group.category)}
                                    >
                                        <Text style={[documentExplorerBlockTitleStyle, { color: theme.colors.text }]}>
                                            {documentLabel(group.category, 'plural')}
                                        </Text>
                                        <Text style={[documentExplorerBlockCountStyle, { color: theme.colors.mutedText }]}>
                                            ({group.documents.length})
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    ) : (
                        <View>
                            <TouchableOpacity onPress={() => setSelectedDocumentType(null)}>
                                <Text style={[modalBackTextStyle, { color: theme.colors.text }]}>Back to Document Type Explorer</Text>
                            </TouchableOpacity>

                            <Text style={[documentGroupTitleStyle, { color: theme.colors.text }]}>
                                {documentLabel(selectedDocumentType, 'plural')}
                            </Text>

                            {documents
                                .filter((doc) => doc.category === selectedDocumentType)
                                .map((doc) => (
                                    <View
                                        key={doc.id}
                                        style={[
                                            documentCardStyle,
                                            {
                                                backgroundColor: theme.colors.surface,
                                                borderColor: theme.colors.border,
                                                borderRadius: theme.radii.button,
                                            },
                                        ]}
                                    >
                                        <View style={documentOpenAreaStyle}>
                                            <View style={[documentPreviewStyle, { backgroundColor: theme.colors.surfaceAlt }]}>
                                                {isImageFile(doc.file_name) ? (
                                                    <Image
                                                        source={{ uri: doc.file_url }}
                                                        style={documentPreviewImageStyle}
                                                        resizeMode="contain"
                                                    />
                                                ) : (
                                                    <Text style={documentPreviewIconStyle}>DOC</Text>
                                                )}
                                            </View>

                                            <View style={documentContentStyle}>
                                                <Text style={[documentTitleStyle, { color: theme.colors.text }]}>
                                                    {doc.file_name || 'Document'}
                                                </Text>
                                                <Text style={[documentSubTextStyle, { color: theme.colors.mutedText }]}>
                                                    {documentLabel(doc.category)}
                                                </Text>

                                                <View style={documentActionRowStyle}>
                                                    <ThemedButton
                                                        title="Open"
                                                        variant="secondary"
                                                        onPress={() => Linking.openURL(doc.file_url)}
                                                        style={documentOpenButtonStyle}
                                                        textStyle={documentActionTextStyle}
                                                    />
                                                    <ThemedButton
                                                        title={removingFileId === doc.id ? 'Removing...' : 'Remove'}
                                                        variant="danger"
                                                        disabled={removingFileId === doc.id}
                                                        onPress={() => handleRemoveFile(doc)}
                                                        style={documentRemoveButtonStyle}
                                                        textStyle={documentActionTextStyle}
                                                    />
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                ))}

                            {documents.filter((doc) => doc.category === selectedDocumentType).length === 0 && (
                                <Text style={[emptyTextStyle, { color: theme.colors.mutedText }]}>
                                    No {documentLabel(selectedDocumentType, 'plural').toLowerCase()} yet.
                                </Text>
                            )}
                        </View>
                    )}

                    {documents.length === 0 && (
                        <Text style={[emptyTextStyle, { color: theme.colors.mutedText }]}>No documents yet.</Text>
                    )}
                </ScrollView>
            </Modal>
            <Modal visible={showDocumentTypePicker} transparent={false} animationType="slide">
                <ScrollView
                    style={[galleryModalStyle, { backgroundColor: theme.colors.background }]}
                    contentContainerStyle={{ padding: 20 }}
                >
                    <TouchableOpacity
                        onPress={() => {
                            setShowDocumentTypePicker(false);
                        }}
                    >
                        <Text style={[modalBackTextStyle, { color: theme.colors.text }]}>← Cancel</Text>
                    </TouchableOpacity>

                    <Text style={[modalTitleStyle, { color: theme.colors.text }]}>What type of document is this?</Text>

                    <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                        Choose where this file should be stored.
                    </Text>

                    <View style={documentTypeGridStyle}>
                        {documentCategories.map((type) => (
                            <TouchableOpacity
                                key={type}
                                style={[
                                    documentTypeBlockStyle,
                                    {
                                        backgroundColor: theme.colors.surface,
                                        borderColor: theme.colors.border,
                                        borderRadius: theme.radii.card,
                                    },
                                ]}
                                onPress={() => finishDocumentUpload(type)}
                            >
                                <Text style={[documentTypeBlockTitleStyle, { color: theme.colors.text }]}>
                                    {documentLabel(type)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </Modal>
        </>
    );
}

function OptionRow({
    options,
    value,
    onChange,
    labelForOption = (option: string) => option.replace(/_/g, ' '),
}: {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    labelForOption?: (option: string) => string;
}) {
    const { theme } = useTheme();

    return (
        <View style={optionRowStyle}>
            {options.map((option) => (
                <TouchableOpacity
                    key={option}
                    onPress={() => onChange(option)}
                    style={[
                        optionButtonStyle,
                        {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.pill,
                        },
                        value === option && {
                            backgroundColor: theme.colors.primary,
                            borderColor: theme.colors.primary,
                        },
                    ]}
                >
                    <Text
                        style={[
                            optionButtonTextStyle,
                            { color: theme.colors.mutedText },
                            value === option && { color: theme.colors.primaryText },
                        ]}
                    >
                        {labelForOption(option)}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const centerStyle = {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 24,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 16,
    lineHeight: 22,
};

const photoCardStyle = {
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
};

const labelStyle = {
    fontSize: 14,
    marginBottom: 6,
    fontWeight: '900' as const,
};

const photoStyle = {
    height: 320,
    width: '100%' as const,
    borderRadius: 18,
    marginTop: 12,
};

const photoPlaceholderStyle = {
    height: 260,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 12,
};

const photoIconStyle = {
    fontSize: 28,
    marginBottom: 6,
};

const photoTextStyle = {
    fontWeight: '900' as const,
};

const secondaryButtonStyle = {
    borderRadius: 16,
    padding: 14,
    alignItems: 'center' as const,
    marginTop: 12,
};

const secondaryButtonTextStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const infoGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 14,
};

const miniCardStyle = {
    width: '32%' as const,
    minWidth: 180,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
};

const miniLabelStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 6,
};

const miniValueStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const fileSummaryStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 14,
};

const fileSummaryCardStyle = {
    flex: 1,
    minWidth: 180,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
};

const fileSummaryTitleStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const fileSummaryCountStyle = {
    fontSize: 28,
    fontWeight: '900' as const,
    marginTop: 4,
};

const sectionTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginTop: 14,
    marginBottom: 10,
};

const optionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 12,
};

const optionButtonStyle = {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
};

const optionButtonSelectedStyle = {
};

const optionButtonTextStyle = {
    fontWeight: '900' as const,
};

const optionButtonSelectedTextStyle = {
};

const actionGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 6,
};

const buttonStyle = {
    width: '32%' as const,
    minWidth: 180,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
};

const buttonTextStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};

const removeButtonStyle = {
    width: '32%' as const,
    minWidth: 180,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
    borderWidth: 1,
};

const removeButtonTextStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};

const messageCardStyle = {
    borderRadius: 20,
    padding: 18,
    marginTop: 12,
    borderWidth: 1,
};

const bodyTextStyle = {
    fontSize: 16,
    lineHeight: 22,
};

const modalStyle = {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
};

const modalCloseStyle = {
    position: 'absolute' as const,
    top: 50,
    right: 30,
    zIndex: 999,
};

const modalCloseTextStyle = {
    fontSize: 30,
    fontWeight: '900' as const,
};

const modalImageStyle = {
    width: '95%' as const,
    height: '90%' as const,
};

const galleryModalStyle = {
    flex: 1,
};

const modalBackTextStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 20,
};

const modalTitleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    marginBottom: 20,
};

const galleryGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const galleryCardStyle = {
    width: '23%' as const,
    minWidth: 160,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
};

const galleryImageStyle = {
    width: '100%' as const,
    height: 140,
    borderRadius: 14,
};

const galleryCategoryStyle = {
    marginTop: 8,
    fontWeight: '900' as const,
};


const documentPreviewStyle = {
    width: 90,
    height: 90,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const documentPreviewImageStyle = {
    width: '100%' as const,
    height: '100%' as const,
    borderRadius: 14,
};

const documentPreviewIconStyle = {
    fontSize: 34,
};

const documentOpenTextStyle = {
    marginTop: 8,
    fontWeight: '900' as const,
};

const fileActionButtonStyle = {
    marginTop: 12,
    paddingVertical: 12,
};

const fileActionButtonTextStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
};

const documentCardStyle = {
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
};

const documentOpenAreaStyle = {
    flexDirection: 'row' as const,
    gap: 12,
    alignItems: 'flex-start' as const,
};

const documentContentStyle = {
    flex: 1,
    minWidth: 0,
};

const documentActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 12,
};

const documentOpenButtonStyle = {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: 12,
};

const documentRemoveButtonStyle = {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: 12,
};

const documentActionTextStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
};

const documentTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const documentSubTextStyle = {
    marginTop: 6,
    fontWeight: '900' as const,
};

const emptyTextStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};
const documentGroupTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginTop: 12,
    marginBottom: 10,
    textTransform: 'capitalize' as const,
};

const documentExplorerTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 14,
};

const documentExplorerGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const documentExplorerBlockStyle = {
    width: '23%' as const,
    minWidth: 190,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
};

const documentExplorerBlockTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const documentExplorerBlockCountStyle = {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '900' as const,
};

const documentTypeGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 20,
};

const documentTypeBlockStyle = {
    width: '31%' as const,
    minWidth: 180,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
};

const documentTypeBlockTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    textTransform: 'capitalize' as const,
};
