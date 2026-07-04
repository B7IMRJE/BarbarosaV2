import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import AdminNavBar from '../../../../../../components/AdminNavBar';
import ThemedButton from '../../../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../../../components/theme/ThemedCard';
import { verifyCustomerWorkspaceAccess } from '../../../../../../lib/customerWorkspaceAccess';
import {
    loadProviderStagedWorkWithStatus,
    type ProviderStagedWorkEntry,
    type ProviderStagedWorkPayload,
} from '../../../../../../lib/providerStagedWork';
import { supabase } from '../../../../../../lib/supabase';
import { useTheme } from '../../../../../../theme/useTheme';

type CompanyRecord = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
};

type CompanyClient = {
    id: string;
    property_connection_id: string | null;
    display_name: string | null;
    status: string | null;
};

type PropertyRecord = {
    id: string;
    name: string | null;
};

type PropertyConnection = {
    id: string;
    can_view_documents: boolean | null;
};

type SharedDocument = {
    id?: string | null;
    item_slug: string | null;
    file_url: string;
    file_name: string | null;
    category: string | null;
    created_at: string | null;
};

type StagedDocumentTile = {
    entry: ProviderStagedWorkEntry;
    url: string;
};

export default function CustomerDocumentsScreen() {
    const { theme } = useTheme();
    const { id, propertyId } = useLocalSearchParams<{ id: string; propertyId: string }>();
    const companyId = String(id || '');
    const clientPropertyId = String(propertyId || '');
    const clientRoute = `/super-admin/company/${companyId}/client/${clientPropertyId}` as Href;
    const [company, setCompany] = useState<CompanyRecord | null>(null);
    const [client, setClient] = useState<CompanyClient | null>(null);
    const [property, setProperty] = useState<PropertyRecord | null>(null);
    const [connection, setConnection] = useState<PropertyConnection | null>(null);
    const [stagedDocuments, setStagedDocuments] = useState<StagedDocumentTile[]>([]);
    const [stagedDocumentEntries, setStagedDocumentEntries] = useState<ProviderStagedWorkEntry[]>([]);
    const [sharedDocuments, setSharedDocuments] = useState<SharedDocument[]>([]);
    const [stagingStatusMessage, setStagingStatusMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        void loadDocuments();
    }, [companyId, clientPropertyId]);

    const companyName = getCompanyDisplayName(company);
    const homeName = client?.display_name || property?.name || 'Customer Home';

    async function loadDocuments() {
        if (!companyId || !clientPropertyId) {
            setMessage('Missing company or property id.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setMessage('');
        setStagedDocuments([]);
        setStagedDocumentEntries([]);
        setSharedDocuments([]);

        const access = await verifyCustomerWorkspaceAccess(companyId);

        if (!access.allowed) {
            if (!access.userId) {
                router.replace('/auth/login' as never);
                return;
            }

            setMessage(access.error || 'You do not have customer access for this company.');
            setLoading(false);
            return;
        }

        const [companyResult, clientResult, propertyResult] = await Promise.all([
            supabase
                .from('companies')
                .select('id, name, public_name, dba_name')
                .eq('id', companyId)
                .maybeSingle(),
            supabase
                .from('company_property_clients')
                .select('id, property_connection_id, display_name, status')
                .eq('company_id', companyId)
                .eq('property_id', clientPropertyId)
                .maybeSingle(),
            supabase
                .from('properties')
                .select('id, name')
                .eq('id', clientPropertyId)
                .maybeSingle(),
        ]);

        if (companyResult.error) {
            setMessage(`Could not load company context: ${companyResult.error.message}`);
            setLoading(false);
            return;
        }

        if (clientResult.error || !clientResult.data) {
            setMessage(clientResult.error?.message || 'This home is not connected to this company as a customer.');
            setLoading(false);
            return;
        }

        const loadedClient = clientResult.data as CompanyClient;

        if (isInactiveStatus(loadedClient.status)) {
            setMessage('This customer relationship is not active.');
            setLoading(false);
            return;
        }

        setCompany((companyResult.data || null) as CompanyRecord | null);
        setClient(loadedClient);
        setProperty((propertyResult.data || null) as PropertyRecord | null);

        const loadedConnection = await loadConnection(loadedClient);
        await Promise.all([
            loadStagedDocuments(),
            loadedConnection?.can_view_documents ? loadSharedDocuments() : Promise.resolve(),
        ]);

        setLoading(false);
    }

    async function loadConnection(loadedClient: CompanyClient) {
        const baseQuery = supabase
            .from('property_connections')
            .select('id, can_view_documents')
            .eq('company_id', companyId)
            .eq('property_id', clientPropertyId);
        const query = loadedClient.property_connection_id
            ? baseQuery.eq('id', loadedClient.property_connection_id)
            : baseQuery;
        const { data } = await query.order('created_at', { ascending: false }).limit(1);
        const loadedConnection = ((data || []) as PropertyConnection[])[0] || null;

        setConnection(loadedConnection);
        return loadedConnection;
    }

    async function loadStagedDocuments() {
        try {
            const result = await loadProviderStagedWorkWithStatus({
                companyId,
                propertyId: clientPropertyId,
            });
            const documentEntries = result.entries.filter((entry) => entry.type === 'document');
            const resolvedDocuments = await Promise.all(documentEntries.map(resolveStagedDocumentTile));

            setStagedDocumentEntries(documentEntries);
            setStagedDocuments(resolvedDocuments.filter((tile): tile is StagedDocumentTile => Boolean(tile)));
            setStagingStatusMessage(result.backendStatus.message);
        } catch (error) {
            setStagedDocumentEntries([]);
            setStagedDocuments([]);
            setStagingStatusMessage(`Provider staging unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async function resolveStagedDocumentTile(entry: ProviderStagedWorkEntry): Promise<StagedDocumentTile | null> {
        const directUrl = payloadString(entry.payload, 'preview_url') ||
            payloadString(entry.payload, 'public_or_signed_url') ||
            payloadString(entry.payload, 'public_url') ||
            payloadString(entry.payload, 'signed_url');

        if (directUrl) {
            return { entry, url: directUrl };
        }

        const bucket = payloadString(entry.payload, 'bucket') || 'item-files';
        const storagePath = payloadString(entry.payload, 'storage_path');

        if (!storagePath) return null;

        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 3600);

        if (error || !data?.signedUrl) return null;

        return {
            entry,
            url: data.signedUrl,
        };
    }

    async function loadSharedDocuments() {
        const { data, error } = await supabase
            .from('home_item_files')
            .select('id, item_slug, file_url, file_name, category, created_at')
            .eq('property_id', clientPropertyId)
            .eq('file_type', 'document')
            .order('created_at', { ascending: false });

        if (error) {
            setMessage(`Shared documents could not be loaded: ${error.message}`);
            return;
        }

        setSharedDocuments((data || []) as SharedDocument[]);
    }

    async function openUrl(url: string) {
        try {
            await Linking.openURL(url);
        } catch (error) {
            setMessage(`Could not open document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1100, minWidth: 0 }}>
                <AdminNavBar companyId={companyId} backFallback={clientRoute} />

                <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>ManagementOS</Text>
                <Text style={[titleStyle, { color: theme.colors.text }]}>Customer Documents</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    {companyName} / {homeName}
                </Text>

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading customer documents...</Text>
                    </ThemedCard>
                ) : message && !client ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Unable to Open Documents</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                ) : (
                    <>
                        {!!message && (
                            <ThemedCard style={messageCardStyle}>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                            </ThemedCard>
                        )}

                        <ThemedCard style={sectionCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Provider Staged Documents</Text>
                            {!!stagingStatusMessage && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{stagingStatusMessage}</Text>
                            )}
                            {stagedDocumentEntries.length === 0 ? (
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    No provider staged documents or document intents for this customer yet.
                                </Text>
                            ) : (
                                <View style={documentGridStyle}>
                                    {stagedDocumentEntries.map((entry) => {
                                        const resolvedDocument = stagedDocuments.find((document) => document.entry.id === entry.id);
                                        const documentUrl = resolvedDocument?.url || '';

                                        return (
                                            <ThemedCard key={entry.id} style={documentTileStyle}>
                                                <Text style={[documentIconStyle, { color: theme.colors.text }]}>DOC</Text>
                                                <Text style={[tileTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                                                    {payloadString(entry.payload, 'file_name') || entry.item_name || 'Provider staged document'}
                                                </Text>
                                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={3}>
                                                    {documentTypeLabel(payloadString(entry.payload, 'document_type'))} / {payloadString(entry.payload, 'action_source') || 'Provider Document'}
                                                </Text>
                                                {documentUrl ? (
                                                    <ThemedButton
                                                        title="Open"
                                                        variant="secondary"
                                                        onPress={() => openUrl(documentUrl)}
                                                        style={smallButtonStyle}
                                                        textStyle={smallButtonTextStyle}
                                                    />
                                                ) : (
                                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                                        Intent staged. No uploaded file is attached yet.
                                                    </Text>
                                                )}
                                            </ThemedCard>
                                        );
                                    })}
                                </View>
                            )}
                        </ThemedCard>

                        <ThemedCard style={sectionCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Shared Homeowner Documents</Text>
                            {connection?.can_view_documents ? (
                                sharedDocuments.length === 0 ? (
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                        The homeowner has shared document access, but no permanent HomeOS documents are available yet.
                                    </Text>
                                ) : (
                                    <View style={documentGridStyle}>
                                        {sharedDocuments.map((document) => (
                                            <ThemedCard key={document.id || document.file_url} style={documentTileStyle}>
                                                <Text style={[documentIconStyle, { color: theme.colors.text }]}>DOC</Text>
                                                <Text style={[tileTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                                                    {document.file_name || 'Shared homeowner document'}
                                                </Text>
                                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={3}>
                                                    {document.category || 'Document'}{document.item_slug ? ` / ${document.item_slug}` : ''}
                                                </Text>
                                                <ThemedButton
                                                    title="Open"
                                                    variant="secondary"
                                                    onPress={() => openUrl(document.file_url)}
                                                    style={smallButtonStyle}
                                                    textStyle={smallButtonTextStyle}
                                                />
                                            </ThemedCard>
                                        ))}
                                    </View>
                                )
                            ) : (
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Homeowner permanent documents are private. Request access from the customer before showing them here.
                                </Text>
                            )}
                        </ThemedCard>

                        <ThemedButton
                            title="Back to Customer Home"
                            variant="secondary"
                            onPress={() => router.replace(clientRoute)}
                            style={{ marginTop: 18 }}
                        />
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function getCompanyDisplayName(company?: CompanyRecord | null) {
    return company?.public_name?.trim() || company?.dba_name?.trim() || company?.name?.trim() || 'Company';
}

function isInactiveStatus(status?: string | null) {
    return ['archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'].includes(
        String(status || '').trim().toLowerCase()
    );
}

function payloadString(payload: ProviderStagedWorkPayload, key: string) {
    const value = payload[key];

    return typeof value === 'string' ? value.trim() : '';
}

function documentTypeLabel(value: string) {
    return value.trim()
        ? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
        : 'Provider staged document';
}

const eyebrowStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    fontSize: 16,
    fontWeight: '800' as const,
    lineHeight: 23,
    marginTop: 8,
    marginBottom: 24,
};

const sectionCardStyle = {
    marginBottom: 16,
};

const messageCardStyle = {
    marginBottom: 16,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const metaTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    lineHeight: 19,
    marginTop: 8,
};

const documentGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 12,
};

const documentTileStyle = {
    width: 180,
    minHeight: 230,
};

const documentIconStyle = {
    alignSelf: 'flex-start' as const,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
};

const tileTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const smallButtonStyle = {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const smallButtonTextStyle = {
    fontSize: 13,
};
