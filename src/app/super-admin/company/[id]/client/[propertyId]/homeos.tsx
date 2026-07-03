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
import {
    scoreSystemHealth,
    statusForCard,
    type HomeHealthItem,
} from '../../../../../../lib/homeHealth';
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
    source: string | null;
    connected_at: string | null;
    created_at: string | null;
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
    status: string | null;
    request_source: string | null;
    can_view_documents: boolean | null;
    can_view_photos: boolean | null;
    can_view_service_history: boolean | null;
    can_view_quotes: boolean | null;
    created_at: string | null;
};

type HomeItemRow = HomeHealthItem & {
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

type StagedUpdate = {
    id: string;
    kind: 'work_note' | 'job_photo' | 'finding' | 'client_update';
    itemId: string;
    itemName: string;
    system: string;
    location: string;
    description: string;
    createdAt: string;
};

export default function ClientHomeOsShellScreen() {
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
    const [stagedUpdates, setStagedUpdates] = useState<StagedUpdate[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        void loadShell();
    }, [companyId, clientPropertyId]);

    const companyName = getCompanyDisplayName(company);
    const homeName = client?.display_name || property?.name || 'Customer Home';
    const address = formatAddress(property) || 'Address not available';
    const linkedAt = client?.connected_at || connection?.created_at || client?.created_at || null;
    const systemSections = useMemo(() => buildSystemSections(items), [items]);

    async function loadShell() {
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

        const access = await resolveShellAccess(companyId);

        if (!access.allowed) {
            setMessage(access.error || 'You do not have customer access for this company.');
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
                .select('id, company_id, property_id, property_connection_id, display_name, status, source, connected_at, created_at')
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

    async function resolveShellAccess(targetCompanyId: string) {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as never);
            return { allowed: false, estimateAccess: null, error: 'Sign in to open the Client HomeOS shell.' };
        }

        const [viewLookup, estimateLookup, platformAdmin] = await Promise.all([
            loadCurrentCompanyPermissionAccess('can_view_customers', { companyId: targetCompanyId }),
            loadCurrentCompanyPermissionAccess('can_add_item_to_estimate', { companyId: targetCompanyId }),
            isPlatformAdmin(user.id),
        ]);

        return {
            allowed: platformAdmin || Boolean(viewLookup.access),
            estimateAccess: estimateLookup.access,
            error: viewLookup.error || null,
        };
    }

    async function loadConnection(loadedClient: CompanyClient) {
        const baseQuery = supabase
            .from('property_connections')
            .select('id, status, request_source, can_view_documents, can_view_photos, can_view_service_history, can_view_quotes, created_at')
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
            setMessage(`Could not load client HomeOS structure: ${error.message}`);
            return [];
        }

        const loadedItems = (data || []) as HomeItemRow[];

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

        if (error) return;

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
            customer_home_name: homeName,
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

        setMessage(`${item.name || 'Item'} added to the estimate draft for ${homeName}.`);
    }

    function stageLocalUpdate(kind: StagedUpdate['kind'], item: HomeItemRow) {
        const itemName = item.name || 'Unnamed Item';
        const label = stagedKindLabel(kind);
        const location = item.location || item.parent_area || 'Not specified';
        const nextUpdate: StagedUpdate = {
            id: `${Date.now()}-${kind}-${item.id}`,
            kind,
            itemId: item.id,
            itemName,
            system: item.system || 'Unknown',
            location,
            description: `${label} placeholder for ${itemName}. This is local draft state only and has not been written to the client HomeOS.`,
            createdAt: new Date().toISOString(),
        };

        setStagedUpdates((current) => [nextUpdate, ...current]);
        setMessage(`${label} staged locally. Nothing has been published to the client's HomeOS.`);
    }

    function updateClientHomeOs() {
        setMessage('Client HomeOS update publishing is coming next. Staged updates are not written yet.');
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1180, minWidth: 0 }}>
                <AdminNavBar companyId={companyId} backFallback={clientRoute} />

                <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>ManagementOS</Text>
                <Text style={[titleStyle, { color: theme.colors.text }]}>Client HomeOS Shell</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    {companyName} / company workspace over {homeName}
                </Text>

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading client HomeOS shell...</Text>
                    </ThemedCard>
                ) : message && items.length === 0 && !client ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Unable to Open Client HomeOS</Text>
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
                        <ThemedCard style={heroCardStyle}>
                            <View style={heroHeaderStyle}>
                                <View style={{ flex: 1, minWidth: 220 }}>
                                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>{homeName}</Text>
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{address}</Text>
                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                        Provider status: {formatStatus(client?.status)} / linked {formatDate(linkedAt)}
                                    </Text>
                                </View>
                                <View style={[shellBadgeStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                                    <Text style={[shellBadgeTextStyle, { color: theme.colors.text }]}>Client HomeOS Shell</Text>
                                </View>
                            </View>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText, marginTop: 12 }]}>
                                Changes are staged for company review until you update the client's HomeOS.
                            </Text>
                        </ThemedCard>

                        {!!message && (
                            <ThemedCard style={messageCardStyle}>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                            </ThemedCard>
                        )}

                        <View style={overviewGridStyle}>
                            <MetricCard label="Systems" value={String(systemSections.length)} />
                            <MetricCard label="Areas" value={String(items.filter((item) => sameText(item.category, 'Area')).length)} />
                            <MetricCard label="Items" value={String(items.filter((item) => !sameText(item.category, 'Area')).length)} />
                            <MetricCard label="Staged Updates" value={String(stagedUpdates.length)} />
                        </View>

                        <ThemedCard style={sectionCardStyle}>
                            <View style={sectionHeaderStyle}>
                                <View style={{ flex: 1, minWidth: 220 }}>
                                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Staged Updates</Text>
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                        Company notes, findings, photos, and update marks stay here until a publish workflow is installed.
                                    </Text>
                                </View>
                                <ThemedButton
                                    title="Update Client's HomeOS"
                                    onPress={updateClientHomeOs}
                                    style={publishButtonStyle}
                                    textStyle={smallButtonTextStyle}
                                />
                            </View>

                            {stagedUpdates.length === 0 ? (
                                <View style={[emptyPillStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>No staged updates yet.</Text>
                                </View>
                            ) : (
                                <View style={stagedGridStyle}>
                                    {stagedUpdates.map((update) => (
                                        <View
                                            key={update.id}
                                            style={[stagedCardStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
                                        >
                                            <Text style={[cardTitleStyle, { color: theme.colors.text }]}>{stagedKindLabel(update.kind)}</Text>
                                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{update.itemName}</Text>
                                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{update.system} / {update.location}</Text>
                                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{update.description}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ThemedCard>

                        {systemSections.length === 0 ? (
                            <ThemedCard style={sectionCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>No HomeOS structure yet.</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    This customer home does not have systems, areas, or item cards yet.
                                </Text>
                            </ThemedCard>
                        ) : (
                            systemSections.map((section) => (
                                <SystemShellSection
                                    key={section.system}
                                    section={section}
                                    fileCounts={fileCounts}
                                    fileCountsLoaded={fileCountsLoaded}
                                    canViewPhotos={!!connection?.can_view_photos}
                                    canViewDocuments={!!connection?.can_view_documents}
                                    canAddToEstimate={!!estimateAccess}
                                    onOpenItem={openItem}
                                    onAddToEstimate={addToEstimate}
                                    onStageUpdate={stageLocalUpdate}
                                />
                            ))
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

function MetricCard({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={metricCardStyle}>
            <Text style={[metricValueStyle, { color: theme.colors.text }]}>{value}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{label}</Text>
        </ThemedCard>
    );
}

function SystemShellSection({
    section,
    fileCounts,
    fileCountsLoaded,
    canViewPhotos,
    canViewDocuments,
    canAddToEstimate,
    onOpenItem,
    onAddToEstimate,
    onStageUpdate,
}: {
    section: ReturnType<typeof buildSystemSections>[number];
    fileCounts: Record<string, ItemFileCount>;
    fileCountsLoaded: boolean;
    canViewPhotos: boolean;
    canViewDocuments: boolean;
    canAddToEstimate: boolean;
    onOpenItem: (item: HomeItemRow) => void;
    onAddToEstimate: (item: HomeItemRow) => void;
    onStageUpdate: (kind: StagedUpdate['kind'], item: HomeItemRow) => void;
}) {
    const { theme } = useTheme();
    const status = statusForCard(section.summary) || 'Not enough data yet';

    return (
        <ThemedCard style={sectionCardStyle}>
            <View style={sectionHeaderStyle}>
                <View style={{ flex: 1, minWidth: 220 }}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>{section.system}</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        {section.summary.itemCount} items / {section.areas.length} areas
                    </Text>
                </View>
                <View style={[statusPillStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                    <Text style={[statusPillTextStyle, { color: theme.colors.text }]}>{status}</Text>
                </View>
            </View>

            <Text style={[miniSectionTitleStyle, { color: theme.colors.mutedText }]}>Areas</Text>
            {section.areas.length === 0 ? (
                <View style={[emptyPillStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>No areas recorded.</Text>
                </View>
            ) : (
                <View style={areaChipGridStyle}>
                    {section.areas.map((area) => (
                        <View
                            key={area.id}
                            style={[areaChipStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
                        >
                            <Text style={[areaChipTextStyle, { color: theme.colors.text }]} numberOfLines={1}>
                                {area.name || area.location || 'Unnamed Area'}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            <Text style={[miniSectionTitleStyle, { color: theme.colors.mutedText }]}>Items</Text>
            {section.items.length === 0 ? (
                <View style={[emptyPillStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>No direct items in this system.</Text>
                </View>
            ) : (
                <View style={itemGridStyle}>
                    {section.items.map((item) => (
                        <ShellItemCard
                            key={item.id}
                            item={item}
                            fileCount={fileCounts[item.id]}
                            fileCountsLoaded={fileCountsLoaded}
                            canViewPhotos={canViewPhotos}
                            canViewDocuments={canViewDocuments}
                            canAddToEstimate={canAddToEstimate}
                            onOpen={() => onOpenItem(item)}
                            onAddToEstimate={() => onAddToEstimate(item)}
                            onStageUpdate={(kind) => onStageUpdate(kind, item)}
                        />
                    ))}
                </View>
            )}
        </ThemedCard>
    );
}

function ShellItemCard({
    item,
    fileCount,
    fileCountsLoaded,
    canViewPhotos,
    canViewDocuments,
    canAddToEstimate,
    onOpen,
    onAddToEstimate,
    onStageUpdate,
}: {
    item: HomeItemRow;
    fileCount?: ItemFileCount;
    fileCountsLoaded: boolean;
    canViewPhotos: boolean;
    canViewDocuments: boolean;
    canAddToEstimate: boolean;
    onOpen: () => void;
    onAddToEstimate: () => void;
    onStageUpdate: (kind: StagedUpdate['kind']) => void;
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
                    {item.category || 'Unknown Category'} / {location}
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
                <ThemedButton title="Open Item" onPress={onOpen} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                {canAddToEstimate && (
                    <ThemedButton
                        title="Add to Estimate"
                        variant="secondary"
                        onPress={onAddToEstimate}
                        style={smallButtonStyle}
                        textStyle={smallButtonTextStyle}
                    />
                )}
                <ThemedButton title="Add Work Note" variant="secondary" onPress={() => onStageUpdate('work_note')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                <ThemedButton title="Add Job Photo" variant="secondary" onPress={() => onStageUpdate('job_photo')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                <ThemedButton title="Add Finding" variant="secondary" onPress={() => onStageUpdate('finding')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                <ThemedButton title="Mark for Client Update" variant="secondary" onPress={() => onStageUpdate('client_update')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
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

function buildSystemSections(items: HomeItemRow[]) {
    const systems = Array.from(
        new Set(
            items
                .map((item) => item.system?.trim() || 'Uncategorized')
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b));

    return systems.map((system) => {
        const systemRows = items.filter((item) => sameText(item.system || 'Uncategorized', system));
        const areas = systemRows
            .filter((item) => sameText(item.category, 'Area'))
            .sort((a, b) => String(a.name || a.location || '').localeCompare(String(b.name || b.location || '')));
        const systemItems = systemRows
            .filter((item) => !sameText(item.category, 'Area'))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        return {
            system,
            areas,
            items: systemItems,
            summary: scoreSystemHealth(systemRows, system),
        };
    });
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

    return normalized ? titleCase(normalized.replace(/_/g, ' ')) : 'Unknown';
}

function formatDate(value?: string | null) {
    if (!value) return 'Not available';

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

function stagedKindLabel(kind: StagedUpdate['kind']) {
    if (kind === 'work_note') return 'Work Note';
    if (kind === 'job_photo') return 'Job Photo';
    if (kind === 'finding') return 'Finding';
    return 'Client Update';
}

function sameText(a?: string | null, b?: string | null) {
    return normalizeText(a) === normalizeText(b);
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

const heroCardStyle = {
    marginBottom: 16,
};

const heroHeaderStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
};

const shellBadgeStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
};

const shellBadgeTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const sectionCardStyle = {
    marginBottom: 16,
};

const messageCardStyle = {
    marginBottom: 16,
};

const sectionHeaderStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 14,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const miniSectionTitleStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
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

const overviewGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 16,
};

const metricCardStyle = {
    flexBasis: 150,
    flexGrow: 1,
    minHeight: 110,
};

const metricValueStyle = {
    fontSize: 30,
    fontWeight: '900' as const,
};

const statusPillStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
};

const statusPillTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const itemGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const itemCardStyle = {
    flexBasis: 260,
    flexGrow: 1,
    maxWidth: 380,
    minHeight: 260,
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

const publishButtonStyle = {
    minWidth: 190,
    paddingVertical: 12,
    paddingHorizontal: 14,
};

const smallButtonTextStyle = {
    fontSize: 12,
};

const areaChipGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
};

const areaChipStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
};

const areaChipTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const emptyPillStyle = {
    alignSelf: 'flex-start' as const,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
};

const stagedGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 14,
};

const stagedCardStyle = {
    flexBasis: 250,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
};
