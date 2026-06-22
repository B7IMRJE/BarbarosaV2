import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../lib/activeProperty';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type HomeDocument = {
    id?: string;
    item_slug: string | null;
    file_url: string;
    file_name: string | null;
    category: string | null;
    created_at: string | null;
};

export default function DocumentsScreen() {
    const { theme } = useTheme();
    const [documents, setDocuments] = useState<HomeDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadDocuments();
    }, []);

    async function loadDocuments() {
        setLoading(true);

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setDocuments([]);
            setMessage(activePropertyErrorMessage(error));
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const { data, error } = await supabase
            .from('home_item_files')
            .select('id, item_slug, file_url, file_name, category, created_at')
            .eq('property_id', activeProperty.propertyId)
            .eq('file_type', 'document')
            .order('created_at', { ascending: false });

        setLoading(false);

        if (error) {
            setMessage(`Could not load documents: ${error.message}`);
            return;
        }

        setDocuments((data || []) as HomeDocument[]);
        setMessage('');
    }

    async function openDocument(url: string) {
        try {
            await Linking.openURL(url);
        } catch (error: any) {
            setMessage(`Could not open document: ${error.message || 'Unknown error'}`);
        }
    }

    function handleAddDocument() {
        setMessage('Open an item detail page and use Upload Document. Full document-center upload is planned.');
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <TouchableOpacity onPress={() => router.back()} activeOpacity={0.82}>
                    <Text style={[backTextStyle, { color: theme.colors.text }]}>Back</Text>
                </TouchableOpacity>

                <Text style={[titleStyle, { color: theme.colors.text }]}>Documents</Text>

                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Keep warranties, manuals, permits, receipts, photos, and service records connected to your home.
                </Text>

                <ThemedCard style={actionCardStyle}>
                    <Text style={[actionTitleStyle, { color: theme.colors.text }]}>Add Document</Text>
                    <Text style={[actionSubtitleStyle, { color: theme.colors.mutedText }]}>
                        Upload from an item detail page for now so each file stays attached to the right home item.
                    </Text>
                    <ThemedButton
                        title="Add Document"
                        variant="secondary"
                        onPress={handleAddDocument}
                        style={{ marginTop: 16 }}
                    />
                </ThemedCard>

                {loading ? (
                    <ThemedCard style={stateCardStyle}>
                        <Text style={[stateTextStyle, { color: theme.colors.mutedText }]}>Loading documents...</Text>
                    </ThemedCard>
                ) : documents.length === 0 ? (
                    <ThemedCard style={stateCardStyle}>
                        <Text style={[stateTitleStyle, { color: theme.colors.text }]}>No documents yet.</Text>
                        <Text style={[stateTextStyle, { color: theme.colors.mutedText }]}>
                            Manuals, warranties, receipts, permits, photos, and service records will appear here after
                            they are uploaded to an item.
                        </Text>
                    </ThemedCard>
                ) : (
                    <View style={documentListStyle}>
                        {documents.map((document) => (
                            <ThemedCard
                                key={document.id || `${document.item_slug}-${document.file_url}`}
                                onPress={() => openDocument(document.file_url)}
                            >
                                <Text style={[documentTitleStyle, { color: theme.colors.text }]}>
                                    {document.file_name || 'Document'}
                                </Text>
                                <Text style={[documentMetaStyle, { color: theme.colors.mutedText }]}>
                                    {document.category || 'Document'}
                                    {document.item_slug ? ` | ${document.item_slug}` : ''}
                                </Text>
                            </ThemedCard>
                        ))}
                    </View>
                )}

                {!!message && (
                    <ThemedCard style={{ marginTop: 16 }}>
                        <Text style={[stateTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

const backTextStyle = {
    marginTop: 20,
    marginBottom: 20,
    fontSize: 18,
    fontWeight: '900' as const,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const subtitleStyle = {
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 24,
};

const actionCardStyle = {
    marginBottom: 22,
};

const actionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
};

const actionSubtitleStyle = {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
};

const stateCardStyle = {
    marginBottom: 16,
};

const stateTitleStyle = {
    fontSize: 20,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const stateTextStyle = {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800' as const,
};

const documentListStyle = {
    gap: 14,
};

const documentTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const documentMetaStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    marginTop: 8,
};
