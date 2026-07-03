import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import AdminNavBar from '../../../../../../components/AdminNavBar';
import ThemedButton from '../../../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../../../components/theme/ThemedCard';
import {
    loadCurrentCompanyPermissionAccess,
    type CompanyPermissionAccess,
} from '../../../../../../lib/companyPermissions';
import { addItemToEstimateDraft } from '../../../../../../lib/estimateDraft';
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
    company_id: string;
    property_id: string;
    property_connection_id: string | null;
    display_name: string | null;
    status: string | null;
};

type PropertyRecord = {
    id: string;
    name: string | null;
    address: string | null;
    address_line_1?: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    postal_code?: string | null;
};

type PropertyConnection = {
    id: string;
    can_view_documents: boolean | null;
    can_view_photos: boolean | null;
    can_view_service_history: boolean | null;
    can_view_quotes: boolean | null;
};

type HomeItemRow = {
    id: string;
    property_id: string | null;
    name: string | null;
    item_slug: string | null;
    system: string | null;
    location: string | null;
    parent_area: string | null;
    category: string | null;
    status: string | null;
    install_state: string | null;
    archived?: boolean | null;
    created_at: string | null;
};

type ItemFileCountRow = {
    home_item_id: string | null;
    file_type: string | null;
};

type ItemFileCount = {
    photos: number;
    documents: number;
};

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

export default function CompanyClientItemsScreen() {
    const { theme } = useTheme();
    const { id, propertyId } = useLocalSearchParams<{ id: string; propertyId: string }>();
    const companyId = String(id || '');
    const clientPropertyId = String(propertyId || '');
    const clientRoute = `/super-admin/company/${companyId}/client/${clientPropertyId}` as Href;

    const [company, setCompany] = useState<CompanyRecord | null>(null);
    const [client, setClient] = useState<CompanyClient | null>(null);
    const [property, setProperty] = useState<PropertyRecord | null>(null);
    const [connection, setConnection] = useState<PropertyConnection | null>(null);
    const [items, setItems] = useState<HomeItemRow[]>([]);
    const [fileCounts, setFileCounts] = useState<Record<string, ItemFileCount>>({});
    const [fileCountsLoaded, setFileCountsLoaded] = useState(false);
    const [estimateAccess, setEstimateAccess] = useState<CompanyPermissionAccess | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        void loadCustomerItems();
    }, [companyId, clientPropertyId]);

    const companyName = getCompanyDisplayName(company);
    const homeName = client?.display_name || property?.name || 'Customer Home';
    const itemCountLabel = useMemo(
        () => `${items.length} ${items.length === 1 ? 'item' : 'items'}`,
        [items.length]
    );

    async function loadCustomerItems() {
        if (!companyId || !clientPropertyId) {
            setMessage('Missing company or property id.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setMessage('');
        setItems([]);
        setFileCounts({});
        setFileCountsLoaded(false);
        setEstimateAccess(null);

        const access = await resolveManagementAccess(companyId);

        if (!access.allowed) {
            setMessage(access.error || 'You do not have access to this customer home.');
            setLoading(false);
            return;
        }

        setEstimateAccess(access.estimateAccess);

        const [companyResult, clientResult, propertyResult] = await Promise.all([
            supabase
                .from('companies')
                .select('id, name, public_name, dba_name')
                .eq('id', companyId)
                .maybeSingle(),
            supabase
                .from('company_property_clients')
                .select('id, company_id, property_id, property_connection_id, display_name, status')
                .eq('company_id', companyId)
                .eq('property_id', clientPropertyId)
                .maybeSingle(),
            supabase
                .from('properties')
                .select('id, name, address, address_line_1, city, state, zip, postal_code')
                .eq('id', clientPropertyId)
                .maybeSingle(),
        ]);

        if (companyResult.error) {
            setMessage(`Could not load company context: ${companyResult.error.message}`);
            setLoading(false);
            return;
        }

        if (clientResult.error) {
            setMessage(`Could not load client relationship: ${clientResult.error.message}`);
            setLoading(false);
            return;
        }

        if (!clientResult.data) {
            setMessage('This home is not connected to this company as a customer.');
            setLoading(false);
            return;
        }

        const loadedClient = clientResult.data as CompanyClient;
        const clientStatus = normalizeText(loadedClient.status);

        if (['archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'].includes(clientStatus)) {
            setMessage('This customer relationship is not active.');
            setLoading(false);
            return;
        }

        setCompany((companyResult.data || null) as CompanyRecord | null);
        setClient(loadedClient);
        setProperty((propertyResult.data || null) as PropertyRecord | null);

        const loadedConnection = await loadConnection(loadedClient);
        const loadedItems = await loadItems();

        if (loadedItems.length > 0) {
            await loadSafeFileCounts(loadedItems, loadedConnection);
        }

        setLoading(false);
    }

    async function resolveManagementAccess(targetCompanyId: string) {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as never);
            return { allowed: false, estimateAccess: null, error: 'Sign in to view customer items.' };
        }

        const [viewLookup, estimateLookup, platformAdmin] = await Promise.all([
            loadCurrentCompanyPermissionAccess('can_view_customers', { companyId: targetCompanyId }),
            loadCurrentCompanyPermissionAccess('can_add_item_to_estimate', { companyId: targetCompanyId }),
            isPlatformAdmin(user.id),
        ]);

        return {
            allowed: platformAdmin || Boolean(viewLookup.access || estimateLookup.access),
            estimateAccess: estimateLookup.access,
            error: viewLookup.error || estimateLookup.error || null,
        };
    }

    async function loadConnection(loadedClient: CompanyClient) {
        const baseQuery = supabase
            .from('property_connections')
            .select('id, can_view_documents, can_view_photos, can_view_service_history, can_view_quotes')
            .eq('company_id', companyId)
            .eq('property_id', clientPropertyId);
        const query = loadedClient.property_connection_id
            ? baseQuery.eq('id', loadedClient.property_connection_id)
            : baseQuery;
        const { data } = await query.limit(1);
        const loadedConnection = ((data || []) as PropertyConnection[])[0] || null;

        setConnection(loadedConnection);
        return loadedConnection;
    }

    async function loadItems() {
        const { data, error } = await supabase
            .from('home_items')
            .select('id, property_id, name, item_slug, system, location, parent_area, category, status, install_state, archived, created_at')
            .eq('property_id', clientPropertyId)
            .or('archived.is.null,archived.eq.false')
            .order('system', { ascending: true })
            .order('location', { ascending: true })
            .order('name', { ascending: true });

        if (error) {
            setMessage(`Could not load customer items: ${error.message}`);
            return [];
        }

        const loadedItems = ((data || []) as HomeItemRow[]).filter(
            (row) => normalizeText(row.category) !== 'area'
        );

        setItems(loadedItems);
        return loadedItems;
    }

    async function loadSafeFileCounts(loadedItems: HomeItemRow[], loadedConnection: PropertyConnection | null) {
        if (!loadedConnection?.can_view_photos && !loadedConnection?.can_view_documents) {
            return;
        }

        const itemIds = loadedItems.map((item) => item.id).filter(Boolean);
        if (itemIds.length === 0) return;

        const { data, error } = await supabase
            .from('home_item_files')
            .select('home_item_id, file_type')
            .eq('property_id', clientPropertyId)
            .in('home_item_id', itemIds);

        if (error) {
            return;
        }

        const nextCounts: Record<string, ItemFileCount> = {};

        ((data || []) as ItemFileCountRow[]).forEach((file) => {
            const homeItemId = file.home_item_id || '';
            if (!homeItemId) return;

            const existing = nextCounts[homeItemId] || { photos: 0, documents: 0 };
            const fileType = normalizeText(file.file_type);

            if (fileType === 'photo' && loadedConnection.can_view_photos) {
                existing.photos += 1;
            }

            if (fileType === 'document' && loadedConnection.can_view_documents) {
                existing.documents += 1;
            }

            nextCounts[homeItemId] = existing;
        });

        setFileCounts(nextCounts);
        setFileCountsLoaded(true);
    }

    function openItem(item: HomeItemRow) {
        if (!item.item_slug) {
            setMessage('This item is missing a slug and cannot be opened yet.');
            return;
        }

        const itemPath = `/item/${encodeURIComponent(item.item_slug)}?companyId=${encodeURIComponent(companyId)}&propertyId=${encodeURIComponent(clientPropertyId)}&mode=management`;

        router.push(itemPath as never);
    }

    async function addToEstimate(item: HomeItemRow) {
        if (!estimateAccess) {
            setMessage('You need active company estimate permission to add this item.');
            return;
        }

        await addItemToEstimateDraft({
            id: item.id,
            property_id: item.property_id || clientPropertyId,
            name: item.name || 'Unknown Item',
            item_slug: item.item_slug || item.id,
            system: item.system || 'Unknown',
            category: item.category || 'Unknown',
            location: item.location || null,
            parent_area: item.parent_area || null,
            status: item.status || null,
            install_state: item.install_state || null,
            company_id: estimateAccess.companyId,
            company_user_id: estimateAccess.companyUserId,
            created_at: new Date().toISOString(),
        }, {
            userId: estimateAccess.userId,
            companyId: estimateAccess.companyId,
        });

        router.push({
            pathname: '/estimate',
            params: {
                companyId: estimateAccess.companyId,
                propertyId: clientPropertyId,
                itemSlug: item.item_slug || item.id,
                mode: 'management',
            },
        } as never);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1180, minWidth: 0 }}>
                <AdminNavBar companyId={companyId} backFallback={clientRoute} />

                <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>ManagementOS</Text>
                <Text style={[titleStyle, { color: theme.colors.text }]}>Customer Items</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    {companyName} / {homeName}
                </Text>

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading customer items...</Text>
                    </ThemedCard>
                ) : message && items.length === 0 ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Unable to Open Items</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                        <ThemedButton
                            title="Back to Customer Home"
                            variant="secondary"
                            onPress={() => router.replace(clientRoute)}
                            style={{ marginTop: 16 }}
                        />
                    </ThemedCard>
                ) : (
                    <>
                        {!!message && (
                            <ThemedCard style={messageCardStyle}>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                            </ThemedCard>
                        )}

                        <ThemedCard style={summaryCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>{itemCountLabel}</Text>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                Basic item identity is available for active customer relationships. Photos, documents, and private history stay locked unless the homeowner has shared that access.
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Address: {formatAddress(property) || 'Address not available'}
                            </Text>
                        </ThemedCard>

                        {items.length === 0 ? (
                            <ThemedCard style={emptyCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>No items found.</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    This customer home does not have HomeOS item cards yet.
                                </Text>
                            </ThemedCard>
                        ) : (
                            <View style={itemGridStyle}>
                                {items.map((item) => (
                                    <CustomerItemCard
                                        key={item.id}
                                        item={item}
                                        fileCount={fileCounts[item.id]}
                                        fileCountsLoaded={fileCountsLoaded}
                                        canViewPhotos={!!connection?.can_view_photos}
                                        canViewDocuments={!!connection?.can_view_documents}
                                        canAddToEstimate={!!estimateAccess}
                                        onOpen={() => openItem(item)}
                                        onAddToEstimate={() => addToEstimate(item)}
                                    />
                                ))}
                            </View>
                        )}

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

function CustomerItemCard({
    item,
    fileCount,
    fileCountsLoaded,
    canViewPhotos,
    canViewDocuments,
    canAddToEstimate,
    onOpen,
    onAddToEstimate,
}: {
    item: HomeItemRow;
    fileCount?: ItemFileCount;
    fileCountsLoaded: boolean;
    canViewPhotos: boolean;
    canViewDocuments: boolean;
    canAddToEstimate: boolean;
    onOpen: () => void;
    onAddToEstimate: () => void;
}) {
    const { theme } = useTheme();
    const itemName = item.name || 'Unnamed Item';
    const location = item.location || item.parent_area || 'Not specified';
    const photoLabel = canViewPhotos
        ? fileCountsLoaded
            ? `Photos: ${fileCount?.photos ?? 0}`
            : 'Photos: Shared'
        : 'Photos: Private';
    const documentLabel = canViewDocuments
        ? fileCountsLoaded
            ? `Documents: ${fileCount?.documents ?? 0}`
            : 'Documents: Shared'
        : 'Documents: Private';

    return (
        <ThemedCard style={itemCardStyle}>
            <View style={{ flex: 1 }}>
                <Text style={[cardTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                    {itemName}
                </Text>
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                    {item.system || 'Unknown System'} / {item.category || 'Unknown Category'}
                </Text>
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                    Area: {location}
                </Text>

                <View style={chipRowStyle}>
                    <StatusChip label={formatStatus(item.status) || 'Missing Information'} />
                    <StatusChip label={item.install_state || 'Unknown'} />
                </View>

                <View style={privacyRowStyle}>
                    <Text style={[privacyTextStyle, { color: theme.colors.mutedText }]}>{photoLabel}</Text>
                    <Text style={[privacyTextStyle, { color: theme.colors.mutedText }]}>{documentLabel}</Text>
                </View>
            </View>

            <View style={buttonRowStyle}>
                <ThemedButton
                    title="Open Item"
                    onPress={onOpen}
                    style={smallButtonStyle}
                    textStyle={smallButtonTextStyle}
                />
                {canAddToEstimate && (
                    <ThemedButton
                        title="Add to Estimate"
                        variant="secondary"
                        onPress={onAddToEstimate}
                        style={smallButtonStyle}
                        textStyle={smallButtonTextStyle}
                    />
                )}
            </View>
        </ThemedCard>
    );
}

function StatusChip({ label }: { label: string }) {
    const { theme } = useTheme();

    return (
        <View style={[statusChipStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
            <Text style={[statusChipTextStyle, { color: theme.colors.text }]} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

async function isPlatformAdmin(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role, is_platform_admin')
        .eq('id', userId)
        .limit(1);

    if (!primaryQuery.error) {
        return isPlatformAdminProfile((primaryQuery.data || [])[0] as PlatformProfile | undefined);
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    return isPlatformAdminProfile((fallbackQuery.data || [])[0] as PlatformProfile | undefined);
}

function isPlatformAdminProfile(profile?: PlatformProfile | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

function getCompanyDisplayName(company?: CompanyRecord | null) {
    return company?.public_name?.trim() || company?.dba_name?.trim() || company?.name?.trim() || 'Company';
}

function formatAddress(property?: PropertyRecord | null) {
    if (!property) return '';

    const street = property.address || property.address_line_1;
    const postalCode = property.zip || property.postal_code;

    return [street, property.city, property.state, postalCode].filter(Boolean).join(', ');
}

function formatStatus(status?: string | null) {
    const normalized = normalizeText(status);

    return normalized ? titleCase(normalized.replace(/_/g, ' ')) : '';
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function titleCase(value: string) {
    return value
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
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

const summaryCardStyle = {
    marginBottom: 16,
};

const messageCardStyle = {
    marginBottom: 16,
};

const emptyCardStyle = {
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
    fontWeight: '800' as const,
    lineHeight: 19,
    marginTop: 6,
};

const itemGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const itemCardStyle = {
    flexBasis: 260,
    flexGrow: 1,
    maxWidth: 360,
    minHeight: 230,
    justifyContent: 'space-between' as const,
};

const cardTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    lineHeight: 23,
    marginBottom: 4,
};

const chipRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 10,
};

const statusChipStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
};

const statusChipTextStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
};

const privacyRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 12,
};

const privacyTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const buttonRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 16,
};

const smallButtonStyle = {
    minWidth: 118,
    paddingVertical: 10,
    paddingHorizontal: 12,
};

const smallButtonTextStyle = {
    fontSize: 12,
};
