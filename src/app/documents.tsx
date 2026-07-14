import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../lib/activeProperty';
import { providerModePath, readProviderModeParams } from '../lib/providerMode';
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
    const { scaleFont, scaleIcon, theme } = useTheme();
    const routeParams = useLocalSearchParams<{
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const providerModeContext = useMemo(() => readProviderModeParams(routeParams), [
        routeParams.providerMode,
        routeParams.companyId,
        routeParams.propertyId,
        routeParams.returnTo,
        routeParams.serviceRequestId,
        routeParams.scheduleSlotId,
        routeParams.jobId,
    ]);

    function scaleStyle<T extends Record<string, unknown>>(style: T): T {
        const fontKeys = new Set(['fontSize', 'lineHeight']);
        const iconKeys = new Set([
            'padding',
            'paddingBottom',
            'paddingVertical',
            'paddingHorizontal',
            'marginTop',
            'marginBottom',
            'gap',
            'width',
            'height',
            'minWidth',
            'minHeight',
            'borderRadius',
        ]);

        const scaledStyle: Record<string, unknown> = { ...style };

        Object.entries(style).forEach(([key, value]) => {
            if (typeof value !== 'number') return;

            if (fontKeys.has(key)) {
                scaledStyle[key] = scaleFont(value);
            }

            if (iconKeys.has(key)) {
                scaledStyle[key] = scaleIcon(value);
            }
        });

        return scaledStyle as T;
    }
    const [documents, setDocuments] = useState<HomeDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (providerModeContext) {
            setDocuments([]);
            setMessage('');
            setLoading(false);
            return;
        }

        loadDocuments();
    }, [
        providerModeContext?.companyId,
        providerModeContext?.propertyId,
        providerModeContext?.serviceRequestId,
        providerModeContext?.scheduleSlotId,
        providerModeContext?.jobId,
    ]);

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
                router.replace('/auth/login' as never);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as never);
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
        } catch (error) {
            setMessage(`Could not open document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    function handleAddDocument() {
        setMessage('Open an item detail page and use Upload Document. Full document-center upload is planned.');
    }

    function goToClientHome() {
        if (!providerModeContext) return;

        router.push(providerModePath('/', providerModeContext) as never);
    }

    function goToCustomerDetail() {
        if (!providerModeContext) return;

        router.push(
            `/super-admin/company/${encodeURIComponent(providerModeContext.companyId)}/client/${encodeURIComponent(providerModeContext.propertyId)}` as never
        );
    }

    function goToCompanyDashboard() {
        if (!providerModeContext) return;

        router.push(`/super-admin/company/${encodeURIComponent(providerModeContext.companyId)}` as never);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), paddingBottom: scaleIcon(40), alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <TouchableOpacity onPress={() => router.back()} activeOpacity={0.82}>
                    <Text style={[scaleStyle(backTextStyle), { color: theme.colors.text }]}>Back</Text>
                </TouchableOpacity>

                <Text style={[scaleStyle(titleStyle), { color: theme.colors.text }]}>
                    {providerModeContext ? 'Client Documents' : 'Documents'}
                </Text>

                <Text style={[scaleStyle(subtitleStyle), { color: theme.colors.mutedText }]}>
                    {providerModeContext
                        ? 'Client documents stay protected until the provider sharing workflow is enabled.'
                        : 'Keep warranties, manuals, permits, receipts, photos, and service records connected to your home.'}
                </Text>

                {providerModeContext ? (
                    <ThemedCard style={scaleStyle(actionCardStyle)}>
                        <Text style={[scaleStyle(actionTitleStyle), { color: theme.colors.text }]}>
                            Provider-mode documents are coming next.
                        </Text>
                        <Text style={[scaleStyle(actionSubtitleStyle), { color: theme.colors.mutedText }]}>
                            Homeowner documents are not opened from this provider view yet. Company-side staged photos
                            and notes remain available from item pages.
                        </Text>

                        <View style={scaleStyle(providerActionRowStyle)}>
                            <ThemedButton title="Client Home" onPress={goToClientHome} />
                            <ThemedButton title="Customer Detail" variant="secondary" onPress={goToCustomerDetail} />
                            <ThemedButton title="Company Dashboard" variant="secondary" onPress={goToCompanyDashboard} />
                        </View>
                    </ThemedCard>
                ) : (
                    <>
                        <ThemedCard style={scaleStyle(actionCardStyle)}>
                            <Text style={[scaleStyle(actionTitleStyle), { color: theme.colors.text }]}>Add Document</Text>
                            <Text style={[scaleStyle(actionSubtitleStyle), { color: theme.colors.mutedText }]}>
                                Upload from an item detail page for now so each file stays attached to the right home item.
                            </Text>
                            <ThemedButton
                                title="Add Document"
                                variant="secondary"
                                onPress={handleAddDocument}
                                style={{ marginTop: scaleIcon(16) }}
                            />
                        </ThemedCard>

                        {loading ? (
                            <ThemedCard style={scaleStyle(stateCardStyle)}>
                                <Text style={[scaleStyle(stateTextStyle), { color: theme.colors.mutedText }]}>Loading documents...</Text>
                            </ThemedCard>
                        ) : documents.length === 0 ? (
                            <ThemedCard style={scaleStyle(stateCardStyle)}>
                                <Text style={[scaleStyle(stateTitleStyle), { color: theme.colors.text }]}>No documents yet.</Text>
                                <Text style={[scaleStyle(stateTextStyle), { color: theme.colors.mutedText }]}>
                                    Manuals, warranties, receipts, permits, photos, and service records will appear here after
                                    they are uploaded to an item.
                                </Text>
                            </ThemedCard>
                        ) : (
                            <View style={scaleStyle(documentListStyle)}>
                                {documents.map((document) => (
                                    <ThemedCard
                                        key={document.id || `${document.item_slug}-${document.file_url}`}
                                        onPress={() => openDocument(document.file_url)}
                                    >
                                        <Text style={[scaleStyle(documentTitleStyle), { color: theme.colors.text }]}>
                                            {document.file_name || 'Document'}
                                        </Text>
                                        <Text style={[scaleStyle(documentMetaStyle), { color: theme.colors.mutedText }]}>
                                            {document.category || 'Document'}
                                            {document.item_slug ? ` | ${document.item_slug}` : ''}
                                        </Text>
                                    </ThemedCard>
                                ))}
                            </View>
                        )}
                    </>
                )}

                {!!message && (
                    <ThemedCard style={{ marginTop: scaleIcon(16) }}>
                        <Text style={[scaleStyle(stateTextStyle), { color: theme.colors.mutedText }]}>{message}</Text>
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

const providerActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 16,
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
