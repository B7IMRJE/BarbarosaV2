import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type HomeItem = {
    id: string;
    name: string;
    system: string | null;
    location: string | null;
};

const systems = ['Plumbing', 'HVAC', 'Electrical', 'Gas', 'Water Quality', 'Safety', 'Appliances', 'Exterior', 'Other'];
const areas = ['Kitchen', 'Bathroom', 'Laundry', 'Garage', 'Exterior', 'Water Heater Area', 'Main Shutoff Area', 'Whole Home', 'Other'];

function cleanFileName(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export default function CreateMaintenanceRecordScreen() {
    const { theme } = useTheme();
    const [items, setItems] = useState<HomeItem[]>([]);
    const [system, setSystem] = useState(systems[0]);
    const [area, setArea] = useState(areas[0]);
    const [itemId, setItemId] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [serviceDate, setServiceDate] = useState('');
    const [nextServiceDate, setNextServiceDate] = useState('');
    const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
    const [documents, setDocuments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadItems();
    }, []);

    async function loadItems() {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as any);
            return;
        }

        const { data, error } = await supabase
            .from('home_items')
            .select('id, name, system, location')
            .eq('user_id', user.id)
            .or('archived.eq.false,archived.is.null')
            .order('name', { ascending: true });

        if (!error) {
            setItems((data || []) as HomeItem[]);
        }
    }

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

        if (!result.canceled) {
            setPhotos((current) => [...current, ...result.assets]);
            setMessage('');
        }
    }

    async function addDocument() {
        const result = await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: true,
            multiple: true,
        });

        if (!result.canceled) {
            setDocuments((current) => [...current, ...result.assets]);
            setMessage('');
        }
    }

    async function uploadPhoto(userId: string, recordId: string, asset: ImagePicker.ImagePickerAsset) {
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const fileName = cleanFileName(asset.fileName || `maintenance-${Date.now()}.jpg`);
        const filePath = `users/${userId}/maintenance/${recordId}/photos/${Date.now()}-${fileName}`;

        const { error } = await supabase.storage.from('item-files').upload(filePath, arrayBuffer, {
            contentType: asset.mimeType || 'image/jpeg',
            upsert: true,
        });

        if (error) throw new Error(error.message);

        return supabase.storage.from('item-files').getPublicUrl(filePath).data.publicUrl;
    }

    async function uploadDocument(userId: string, recordId: string, asset: DocumentPicker.DocumentPickerAsset) {
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const fileName = cleanFileName(asset.name || `maintenance-document-${Date.now()}`);
        const filePath = `users/${userId}/maintenance/${recordId}/documents/${Date.now()}-${fileName}`;

        const { error } = await supabase.storage.from('item-files').upload(filePath, arrayBuffer, {
            contentType: asset.mimeType || 'application/octet-stream',
            upsert: true,
        });

        if (error) throw new Error(error.message);

        return supabase.storage.from('item-files').getPublicUrl(filePath).data.publicUrl;
    }

    async function saveRecord() {
        if (!title.trim()) {
            setMessage('Enter a maintenance title.');
            return;
        }

        setSaving(true);
        setMessage('Saving maintenance record...');

        try {
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
                setMessage('You must be logged in to save maintenance records.');
                router.replace('/auth/login' as any);
                return;
            }

            const { data: created, error: insertError } = await supabase
                .from('maintenance_records')
                .insert({
                    user_id: user.id,
                    system,
                    area,
                    item_id: itemId || null,
                    title: title.trim(),
                    description: description.trim(),
                    service_date: serviceDate.trim() || null,
                    next_service_date: nextServiceDate.trim() || null,
                    photo_urls: [],
                    document_urls: [],
                })
                .select('id')
                .single();

            if (insertError || !created) {
                setMessage(`Save failed: ${insertError?.message || 'Record was not created.'}`);
                return;
            }

            const recordId = String(created.id);
            const photoUrls: string[] = [];
            const documentUrls: string[] = [];

            if (photos.length > 0) {
                setMessage('Uploading photos...');
                for (const photo of photos) {
                    photoUrls.push(await uploadPhoto(user.id, recordId, photo));
                }
            }

            if (documents.length > 0) {
                setMessage('Uploading documents...');
                for (const document of documents) {
                    documentUrls.push(await uploadDocument(user.id, recordId, document));
                }
            }

            if (photoUrls.length > 0 || documentUrls.length > 0) {
                const { error: updateError } = await supabase
                    .from('maintenance_records')
                    .update({
                        photo_urls: photoUrls,
                        document_urls: documentUrls,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', recordId)
                    .eq('user_id', user.id);

                if (updateError) {
                    setMessage(`Record saved but attachments failed: ${updateError.message}`);
                    return;
                }
            }

            router.replace(`/maintenance/${recordId}` as any);
        } catch (error: any) {
            setMessage(`Save failed: ${error.message || 'Unknown error'}`);
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
                    Add Maintenance Record
                </Text>
                <Text style={{ color: theme.colors.mutedText, marginTop: 8, marginBottom: 20, lineHeight: 22 }}>
                    Save homeowner maintenance history. This does not create jobs, estimates, dispatch, or technician workflows.
                </Text>

                <Text style={[labelStyle, { color: theme.colors.text }]}>Title</Text>
                <ThemedInput value={title} onChangeText={setTitle} placeholder="Example: Replaced HVAC filter" />

                <Text style={[labelStyle, { color: theme.colors.text }]}>System</Text>
                <OptionRow options={systems} value={system} onChange={setSystem} />

                <Text style={[labelStyle, { color: theme.colors.text }]}>Area</Text>
                <OptionRow options={areas} value={area} onChange={setArea} />

                {items.length > 0 && (
                    <>
                        <Text style={[labelStyle, { color: theme.colors.text }]}>Item</Text>
                        <OptionRow
                            options={['None', ...items.map((item) => item.name)]}
                            value={items.find((item) => item.id === itemId)?.name || 'None'}
                            onChange={(name) => {
                                const selected = items.find((item) => item.name === name);
                                setItemId(selected?.id || '');
                            }}
                        />
                    </>
                )}

                <Text style={[labelStyle, { color: theme.colors.text }]}>Description</Text>
                <ThemedInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="What was serviced, repaired, inspected, replaced, or documented?"
                    multiline
                    minHeight={120}
                />

                <Text style={[labelStyle, { color: theme.colors.text }]}>Service Date</Text>
                <ThemedInput value={serviceDate} onChangeText={setServiceDate} placeholder="YYYY-MM-DD" />

                <Text style={[labelStyle, { color: theme.colors.text }]}>Next Service Date</Text>
                <ThemedInput value={nextServiceDate} onChangeText={setNextServiceDate} placeholder="YYYY-MM-DD optional" />

                <Text style={[labelStyle, { color: theme.colors.text }]}>Photos</Text>
                <ThemedButton title="Attach Photos" variant="secondary" onPress={addPhotos} />
                {photos.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                        {photos.map((photo, index) => (
                            <Image
                                key={`${photo.uri}-${index}`}
                                source={{ uri: photo.uri }}
                                style={{ width: 96, height: 96, borderRadius: 14, backgroundColor: theme.colors.surfaceAlt }}
                            />
                        ))}
                    </View>
                )}

                <Text style={[labelStyle, { color: theme.colors.text }]}>Documents</Text>
                <ThemedButton title="Attach Documents" variant="secondary" onPress={addDocument} />
                {documents.length > 0 && (
                    <ThemedCard style={{ marginTop: 12 }}>
                        {documents.map((document) => (
                            <Text key={`${document.uri}-${document.name}`} style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 6 }}>
                                {document.name}
                            </Text>
                        ))}
                    </ThemedCard>
                )}

                <ThemedButton
                    title={saving ? 'Saving...' : 'Save Maintenance Record'}
                    disabled={saving}
                    onPress={saveRecord}
                    style={{ marginTop: 20 }}
                />

                {!!message && (
                    <ThemedCard style={{ marginTop: 14 }}>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function ThemedInput({
    value,
    onChangeText,
    placeholder,
    multiline,
    minHeight,
}: {
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    multiline?: boolean;
    minHeight?: number;
}) {
    const { theme } = useTheme();

    return (
        <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.mutedText}
            multiline={multiline}
            style={{
                color: theme.colors.text,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 16,
                padding: 16,
                fontSize: 16,
                lineHeight: 22,
                minHeight,
                textAlignVertical: multiline ? 'top' : 'auto',
                marginBottom: 4,
            }}
        />
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
