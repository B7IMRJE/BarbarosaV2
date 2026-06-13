import HomeHeader from '../../components/HomeHeader';

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Linking,
    Modal,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type ItemFile = {
    id: string;
    item_slug: string;
    user_id: string | null;
    file_url: string;
    file_name: string | null;
    file_type: string;
    category: string;
    created_at: string;
};

const photoCategories = [
    'equipment_photo',
    'label_photo',
    'serial_photo',
    'before_photo',
    'after_photo',
    'other',
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

function isImageFile(fileName?: string | null) {
    const lowerName = fileName?.toLowerCase() || '';
    return (
        lowerName.endsWith('.jpg') ||
        lowerName.endsWith('.jpeg') ||
        lowerName.endsWith('.png') ||
        lowerName.endsWith('.webp')
    );
}

export default function ItemScreen() {
    const [showDocumentTypePicker, setShowDocumentTypePicker] = useState(false);
    const { slug } = useLocalSearchParams();
    const [item, setItem] = useState<any>(null);
    const [files, setFiles] = useState<ItemFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showPhoto, setShowPhoto] = useState(false);
    const [showPhotos, setShowPhotos] = useState(false);
    const [showDocuments, setShowDocuments] = useState(false);
    const [photoCategory, setPhotoCategory] = useState('equipment_photo');
    const [selectedDocumentType, setSelectedDocumentType] = useState<string | null>(null);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadItem();
        loadFiles();
    }, [slug]);

    async function loadItem() {
        setLoading(true);

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setMessage('You must be logged in to view this item.');
            setItem(null);
            setLoading(false);
            router.replace('/auth/login' as any);
            return;
        }

        const { data, error } = await supabase
            .from('home_items')
            .select('*')
            .eq('item_slug', String(slug))
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            setMessage(`Item load failed: ${error.message}`);
            setItem(null);
        } else if (!data) {
            setMessage('Item not found.');
            setItem(null);
        } else {
            setItem(data);
            setMessage('');
        }

        setLoading(false);
    }

    async function loadFiles() {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setMessage('You must be logged in to view files.');
            setFiles([]);
            router.replace('/auth/login' as any);
            return;
        }

        const { data, error } = await supabase
            .from('home_item_files')
            .select('*')
            .eq('item_slug', String(slug))
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            setMessage(`Files load failed: ${error.message}`);
            return;
        }

        setFiles(data || []);
    }

    async function uploadMainPhotoFromAsset(asset: ImagePicker.ImagePickerAsset) {
        try {
            setUploading(true);
            setMessage('Uploading main photo...');

            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
                setMessage('You must be logged in to upload photos.');
                router.replace('/auth/login' as any);
                return;
            }

            const response = await fetch(asset.uri);
            const arrayBuffer = await response.arrayBuffer();

            const fileExt = asset.uri.split('.').pop() || 'jpg';
            const fileName = `${String(slug)}-main-${Date.now()}.${fileExt}`;
            const filePath = `users/${user.id}/items/${String(slug)}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('item-photos')
                .upload(filePath, arrayBuffer, {
                    contentType: asset.mimeType || 'image/jpeg',
                    upsert: true,
                });

            if (uploadError) {
                setMessage(`Upload failed: ${uploadError.message}`);
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
                .eq('user_id', user.id);

            if (updateError) {
                setMessage(`Photo saved but item update failed: ${updateError.message}`);
                return;
            }

            setMessage('Main photo uploaded.');
            await loadItem();
        } catch (error: any) {
            setMessage(`Upload failed: ${error.message || 'Unknown error'}`);
        } finally {
            setUploading(false);
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
    }) {
        try {
            setUploading(true);
            setMessage(`Uploading ${fileType}...`);

            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
                setMessage(`You must be logged in to upload ${fileType}s.`);
                router.replace('/auth/login' as any);
                return;
            }

            const response = await fetch(uri);
            const arrayBuffer = await response.arrayBuffer();

            const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
            const filePath = `users/${user.id}/items/${String(slug)}/${fileType}s/${Date.now()}-${cleanName}`;

            const { error: uploadError } = await supabase.storage
                .from('item-files')
                .upload(filePath, arrayBuffer, {
                    contentType: mimeType,
                    upsert: true,
                });

            if (uploadError) {
                setMessage(`Upload failed: ${uploadError.message}`);
                return;
            }

            const { data: publicUrlData } = supabase.storage
                .from('item-files')
                .getPublicUrl(filePath);

            const fileUrl = publicUrlData.publicUrl;

            const { error: insertError } = await supabase
                .from('home_item_files')
                .insert({
                    user_id: user.id,
                    item_slug: String(slug),
                    file_url: fileUrl,
                    file_name: fileName,
                    file_type: fileType,
                    category,
                });

            if (insertError) {
                setMessage(`File uploaded but record failed: ${insertError.message}`);
                return;
            }

            setMessage(`${fileType === 'photo' ? 'Photo' : 'Document'} uploaded.`);
            await loadFiles();
        } catch (error: any) {
            setMessage(`Upload failed: ${error.message || 'Unknown error'}`);
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

    async function handleUploadAdditionalPhoto() {
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
            category: photoCategory,
        });
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

        await uploadExtraFile({
            uri: asset.uri,
            fileName: asset.name || `${String(slug)}-${Date.now()}`,
            mimeType: asset.mimeType || 'application/octet-stream',
            fileType: 'document',
            category: selectedType,
        });

        setSelectedDocumentType(selectedType);
        setShowDocuments(true);
    }


    async function handleOpenCamera() {
        if (Platform.OS === 'web') {
            setMessage('Camera works on phone/tablet. On web, use Upload Main Photo.');
            return;
        }

        const permission = await ImagePicker.requestCameraPermissionsAsync();

        if (!permission.granted) {
            setMessage('Camera permission is required.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
        });

        if (result.canceled) return;

        await uploadMainPhotoFromAsset(result.assets[0]);
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

    async function handleRemoveItem() {
        setMessage('Archiving item...');

        const { error } = await supabase
            .from('home_items')
            .update({ archived: true })
            .eq('item_slug', String(slug))
            .eq('user_id', item.user_id);

        if (error) {
            setMessage(`Remove failed: ${error.message}`);
            return;
        }

        setMessage('Item archived.');

        setTimeout(() => {
            router.back();
        }, 700);
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
                <Text style={{ fontSize: 18, color: '#071B33', fontWeight: '900' }}>
                    Item not found.
                </Text>
                <Text style={{ marginTop: 10, color: '#637083' }}>{message}</Text>
            </View>
        );
    }

    const photos = files.filter((file) => file.file_type === 'photo');
    const documents = files.filter((file) => file.file_type === 'document');

    const groupedDocuments = documentCategories.map((category) => ({
        category,
        documents: documents.filter((doc) => doc.category === category),
    }));


    const detailCards = [
        { label: 'Install State', value: item.install_state || 'Unknown' },
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
                style={{ flex: 1, backgroundColor: '#F3F6FA' }}
                contentContainerStyle={{ padding: 20, alignItems: 'center' }}
            >
                <View style={{ width: '100%', maxWidth: 1200 }}>
                    <HomeHeader />

                    <Text style={titleStyle}>{item.name}</Text>

                    <Text style={subtitleStyle}>
                        {item.about || 'This item has not been fully documented yet.'}
                    </Text>

                    <View style={photoCardStyle}>
                        <Text style={labelStyle}>Main Item Photo</Text>

                        {item.photo_url ? (
                            <>
                                <Image
                                    source={{ uri: item.photo_url }}
                                    style={photoStyle}
                                    resizeMode="contain"
                                />

                                <TouchableOpacity
                                    onPress={() => setShowPhoto(true)}
                                    style={secondaryButtonStyle}
                                >
                                    <Text style={secondaryButtonTextStyle}>
                                        View Full Photo
                                    </Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <View style={photoPlaceholderStyle}>
                                <Text style={photoIconStyle}>📷</Text>
                                <Text style={photoTextStyle}>No main photo uploaded</Text>
                            </View>
                        )}
                    </View>

                    <View style={infoGridStyle}>
                        {detailCards.map((detail) => (
                            <View key={detail.label} style={miniCardStyle}>
                                <Text style={miniLabelStyle}>{detail.label}</Text>
                                <Text style={miniValueStyle} numberOfLines={2}>
                                    {detail.value}
                                </Text>
                            </View>
                        ))}
                    </View>

                    <View style={fileSummaryStyle}>
                        <View style={fileSummaryCardStyle}>
                            <Text style={fileSummaryTitleStyle}>Photos</Text>
                            <Text style={fileSummaryCountStyle}>{photos.length}</Text>
                        </View>

                        <View style={fileSummaryCardStyle}>
                            <Text style={fileSummaryTitleStyle}>Documents</Text>
                            <Text style={fileSummaryCountStyle}>{documents.length}</Text>
                        </View>
                    </View>

                    <Text style={sectionTitleStyle}>Photo Type</Text>
                    <OptionRow
                        options={photoCategories}
                        value={photoCategory}
                        onChange={setPhotoCategory}
                    />

                    <View style={actionGridStyle}>
                        <TouchableOpacity
                            onPress={handleUploadMainPhoto}
                            disabled={uploading}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>
                                {uploading ? 'Uploading...' : 'Upload Main Photo'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleUploadAdditionalPhoto}
                            disabled={uploading}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>
                                {uploading ? 'Uploading...' : 'Upload Additional Photo'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleUploadDocument}
                            disabled={uploading}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>
                                {uploading ? 'Uploading...' : 'Upload Document'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleOpenCamera}
                            disabled={uploading}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>
                                {uploading ? 'Uploading...' : 'Open Camera'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setShowPhotos(true)}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>View Photos</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => {
                                setSelectedDocumentType(null);
                                setShowDocuments(true);
                            }}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>View Documents</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleEditInformation}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>Edit Information</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleAddRelatedItem}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>Add Related Item</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setMessage('Request service comes next.')}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>Request Service</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleRemoveItem}
                            style={removeButtonStyle}
                        >
                            <Text style={removeButtonTextStyle}>Remove Item</Text>
                        </TouchableOpacity>
                    </View>

                    {!!message && (
                        <View style={messageCardStyle}>
                            <Text style={labelStyle}>Message</Text>
                            <Text style={bodyTextStyle}>{message}</Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            <Modal visible={showPhoto} transparent={false} animationType="fade">
                <View style={modalStyle}>
                    <TouchableOpacity
                        onPress={() => setShowPhoto(false)}
                        style={modalCloseStyle}
                    >
                        <Text style={modalCloseTextStyle}>✕</Text>
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
                <ScrollView style={galleryModalStyle} contentContainerStyle={{ padding: 20 }}>
                    <TouchableOpacity onPress={() => setShowPhotos(false)}>
                        <Text style={modalBackTextStyle}>← Close Photos</Text>
                    </TouchableOpacity>

                    <Text style={modalTitleStyle}>Photos</Text>

                    <View style={galleryGridStyle}>
                        {photos.map((photo) => (
                            <TouchableOpacity
                                key={photo.id}
                                style={galleryCardStyle}
                                onPress={() => Linking.openURL(photo.file_url)}
                            >
                                <Image
                                    source={{ uri: photo.file_url }}
                                    style={galleryImageStyle}
                                    resizeMode="contain"
                                />
                                <Text style={galleryCategoryStyle}>
                                    {photo.category}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {photos.length === 0 && (
                        <Text style={emptyTextStyle}>No additional photos yet.</Text>
                    )}
                </ScrollView>
            </Modal>

            <Modal visible={showDocuments} transparent={false} animationType="slide">
                <ScrollView style={galleryModalStyle} contentContainerStyle={{ padding: 20 }}>
                    <TouchableOpacity onPress={() => setShowDocuments(false)}>
                        <Text style={modalBackTextStyle}>Close Documents</Text>
                    </TouchableOpacity>

                    <Text style={modalTitleStyle}>Documents</Text>

                    {!selectedDocumentType ? (
                        <>
                            <Text style={documentExplorerTitleStyle}>Document Type Explorer</Text>

                            <View style={documentExplorerGridStyle}>
                                {groupedDocuments.map((group) => (
                                    <TouchableOpacity
                                        key={group.category}
                                        style={documentExplorerBlockStyle}
                                        onPress={() => setSelectedDocumentType(group.category)}
                                    >
                                        <Text style={documentExplorerBlockTitleStyle}>
                                            {documentLabel(group.category, 'plural')}
                                        </Text>
                                        <Text style={documentExplorerBlockCountStyle}>
                                            ({group.documents.length})
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    ) : (
                        <View>
                            <TouchableOpacity onPress={() => setSelectedDocumentType(null)}>
                                <Text style={modalBackTextStyle}>Back to Document Type Explorer</Text>
                            </TouchableOpacity>

                            <Text style={documentGroupTitleStyle}>
                                {documentLabel(selectedDocumentType, 'plural')}
                            </Text>

                            {documents
                                .filter((doc) => doc.category === selectedDocumentType)
                                .map((doc) => (
                                    <TouchableOpacity
                                        key={doc.id}
                                        style={documentCardStyle}
                                        onPress={() => Linking.openURL(doc.file_url)}
                                    >
                                        <View style={documentPreviewStyle}>
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

                                        <View style={{ flex: 1 }}>
                                            <Text style={documentTitleStyle}>
                                                {doc.file_name || 'Document'}
                                            </Text>
                                            <Text style={documentSubTextStyle}>
                                                {documentLabel(doc.category)}
                                            </Text>
                                            <Text style={documentOpenTextStyle}>Open</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}

                            {documents.filter((doc) => doc.category === selectedDocumentType).length === 0 && (
                                <Text style={emptyTextStyle}>
                                    No {documentLabel(selectedDocumentType, 'plural').toLowerCase()} yet.
                                </Text>
                            )}
                        </View>
                    )}

                    {documents.length === 0 && (
                        <Text style={emptyTextStyle}>No documents yet.</Text>
                    )}
                </ScrollView>
            </Modal>
            <Modal visible={showDocumentTypePicker} transparent={false} animationType="slide">
                <ScrollView style={galleryModalStyle} contentContainerStyle={{ padding: 20 }}>
                    <TouchableOpacity
                        onPress={() => {
                            setShowDocumentTypePicker(false);
                        }}
                    >
                        <Text style={modalBackTextStyle}>← Cancel</Text>
                    </TouchableOpacity>

                    <Text style={modalTitleStyle}>What type of document is this?</Text>

                    <Text style={subtitleStyle}>
                        Choose where this file should be stored.
                    </Text>

                    <View style={documentTypeGridStyle}>
                        {documentCategories.map((type) => (
                            <TouchableOpacity
                                key={type}
                                style={documentTypeBlockStyle}
                                onPress={() => finishDocumentUpload(type)}
                            >
                                <Text style={documentTypeBlockTitleStyle}>
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
}: {
    options: string[];
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <View style={optionRowStyle}>
            {options.map((option) => (
                <TouchableOpacity
                    key={option}
                    onPress={() => onChange(option)}
                    style={[
                        optionButtonStyle,
                        value === option && optionButtonSelectedStyle,
                    ]}
                >
                    <Text
                        style={[
                            optionButtonTextStyle,
                            value === option && optionButtonSelectedTextStyle,
                        ]}
                    >
                        {option.replace(/_/g, ' ')}
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
    color: '#071B33',
};

const subtitleStyle = {
    color: '#637083',
    marginTop: 8,
    marginBottom: 24,
    fontSize: 16,
    lineHeight: 22,
};

const photoCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const labelStyle = {
    fontSize: 14,
    color: '#637083',
    marginBottom: 6,
    fontWeight: '900' as const,
};

const photoStyle = {
    height: 320,
    width: '100%' as const,
    borderRadius: 18,
    marginTop: 12,
    backgroundColor: '#F3F6FA',
};

const photoPlaceholderStyle = {
    height: 260,
    backgroundColor: '#E3E8EF',
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
    color: '#637083',
    fontWeight: '900' as const,
};

const secondaryButtonStyle = {
    backgroundColor: '#E7ECF3',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center' as const,
    marginTop: 12,
};

const secondaryButtonTextStyle = {
    color: '#071B33',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const miniLabelStyle = {
    fontSize: 13,
    color: '#637083',
    fontWeight: '900' as const,
    marginBottom: 6,
};

const miniValueStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    color: '#071B33',
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
    backgroundColor: '#EAF2FF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#CFE1FF',
};

const fileSummaryTitleStyle = {
    color: '#637083',
    fontSize: 13,
    fontWeight: '900' as const,
};

const fileSummaryCountStyle = {
    color: '#071B33',
    fontSize: 28,
    fontWeight: '900' as const,
    marginTop: 4,
};

const sectionTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    color: '#071B33',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const optionButtonSelectedStyle = {
    backgroundColor: '#071B33',
    borderColor: '#071B33',
};

const optionButtonTextStyle = {
    color: '#637083',
    fontWeight: '900' as const,
};

const optionButtonSelectedTextStyle = {
    color: '#FFFFFF',
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
    backgroundColor: '#071B33',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
};

const buttonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};

const removeButtonStyle = {
    width: '32%' as const,
    minWidth: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: '#F1B8B8',
};

const removeButtonTextStyle = {
    color: '#B00020',
    fontSize: 16,
    fontWeight: '900' as const,
};

const messageCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const bodyTextStyle = {
    fontSize: 16,
    color: '#637083',
    lineHeight: 22,
};

const modalStyle = {
    flex: 1,
    backgroundColor: '#000000',
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
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900' as const,
};

const modalImageStyle = {
    width: '95%' as const,
    height: '90%' as const,
};

const galleryModalStyle = {
    flex: 1,
    backgroundColor: '#F3F6FA',
};

const modalBackTextStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    color: '#071B33',
    marginBottom: 20,
};

const modalTitleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    color: '#071B33',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const galleryImageStyle = {
    width: '100%' as const,
    height: 140,
    borderRadius: 14,
    backgroundColor: '#E7ECF3',
};

const galleryCategoryStyle = {
    marginTop: 8,
    color: '#071B33',
    fontWeight: '900' as const,
};


const documentPreviewStyle = {
    width: 90,
    height: 90,
    backgroundColor: '#E7ECF3',
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
    color: '#0B5FFF',
    marginTop: 8,
    fontWeight: '900' as const,
};


const documentCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    flexDirection: 'row' as const,
    gap: 12,
    alignItems: 'center' as const,
};

const documentTitleStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
};

const documentSubTextStyle = {
    color: '#637083',
    marginTop: 6,
    fontWeight: '900' as const,
};

const emptyTextStyle = {
    color: '#637083',
    fontSize: 16,
    fontWeight: '900' as const,
};
const documentGroupTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    color: '#071B33',
    marginTop: 12,
    marginBottom: 10,
    textTransform: 'capitalize' as const,
};

const documentExplorerTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    color: '#637083',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const documentExplorerBlockTitleStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
};

const documentExplorerBlockCountStyle = {
    color: '#637083',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const documentTypeBlockTitleStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
    textTransform: 'capitalize' as const,
};
