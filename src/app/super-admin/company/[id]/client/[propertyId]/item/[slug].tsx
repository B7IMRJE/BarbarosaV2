import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import AdminNavBar from '../../../../../../../components/AdminNavBar';
import ThemedButton from '../../../../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../../../../components/theme/ThemedCard';
import {
    loadCurrentCompanyPermissionAccess,
    type CompanyPermissionAccess,
} from '../../../../../../../lib/companyPermissions';
import { addItemToEstimateDraft } from '../../../../../../../lib/estimateDraft';
import { supabase } from '../../../../../../../lib/supabase';
import { useTheme } from '../../../../../../../theme/useTheme';

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

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

type StagedUpdate = {
    id: string;
    kind: 'work_note' | 'job_photo' | 'finding' | 'client_update';
    label: string;
    description: string;
    createdAt: string;
};

export default function CompanyClientItemScreen() {
    const { theme } = useTheme();
    const routeParams = useLocalSearchParams<{
        id: string;
        propertyId: string;
        slug?: string | string[];
        returnTo?: string | string[];
    }>();
    const companyId = String(routeParams.id || '');
    const clientPropertyId = String(routeParams.propertyId || '');
    const slug = firstParam(routeParams.slug);
    const clientRoute = `/super-admin/company/${companyId}/client/${clientPropertyId}` as Href;
    const shellRoute = `/super-admin/company/${companyId}/client/${clientPropertyId}/homeos`;
    const returnRoute = useMemo(
        () => getSafeReturnRoute(firstParam(routeParams.returnTo), companyId, clientPropertyId, shellRoute),
        [routeParams.returnTo, companyId, clientPropertyId, shellRoute]
    );

    const [company, setCompany] = useState<CompanyRecord | null>(null);
    const [client, setClient] = useState<CompanyClient | null>(null);
    const [property, setProperty] = useState<PropertyRecord | null>(null);
    const [connection, setConnection] = useState<PropertyConnection | null>(null);
    const [item, setItem] = useState<HomeItemRow | null>(null);
    const [estimateAccess, setEstimateAccess] = useState<CompanyPermissionAccess | null>(null);
    const [estimatePermissionMessage, setEstimatePermissionMessage] = useState('');
    const [stagedUpdates, setStagedUpdates] = useState<StagedUpdate[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        void loadCustomerItem();
    }, [companyId, clientPropertyId, slug]);

    const companyName = getCompanyDisplayName(company);
    const homeName = client?.display_name || property?.name || 'Customer Home';
    const address = formatAddress(property) || 'Address not available';
    const itemName = item?.name || 'Customer Item';
    const location = item?.location || item?.parent_area || 'Not specified';
    const canAddToEstimate = Boolean(estimateAccess);

    async function loadCustomerItem() {
        if (!companyId || !clientPropertyId || !slug) {
            setMessage('Missing company, property, or item id.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setMessage('');
        setItem(null);
        setEstimateAccess(null);
        setEstimatePermissionMessage('');

        const access = await resolveManagementAccess(companyId);

        if (!access.allowed) {
            setMessage(access.error || 'You do not have access to this customer item.');
            setLoading(false);
            return;
        }

        setEstimateAccess(access.estimateAccess);
        setEstimatePermissionMessage(!access.estimateAccess && access.estimateError ? 'Estimate permission unavailable.' : '');

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
            setMessage(`Could not confirm customer relationship: ${clientResult.error.message}`);
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
        await loadConnection(loadedClient);
        await loadItem();
        setLoading(false);
    }

    async function resolveManagementAccess(targetCompanyId: string) {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as never);
            return { allowed: false, estimateAccess: null, estimateError: null, error: 'Sign in to view this customer item.' };
        }

        const [viewLookup, estimateLookup, platformAdmin] = await Promise.all([
            loadCurrentCompanyPermissionAccess('can_view_customers', { companyId: targetCompanyId }),
            loadCurrentCompanyPermissionAccess('can_add_item_to_estimate', { companyId: targetCompanyId }),
            isPlatformAdmin(user.id),
        ]);

        return {
            allowed: platformAdmin || Boolean(viewLookup.access || estimateLookup.access),
            estimateAccess: estimateLookup.access,
            estimateError: estimateLookup.error,
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

        setConnection(((data || []) as PropertyConnection[])[0] || null);
    }

    async function loadItem() {
        const { data, error } = await supabase
            .from('home_items')
            .select('id, property_id, name, item_slug, system, location, parent_area, category, status, install_state, archived, created_at')
            .eq('property_id', clientPropertyId)
            .eq('item_slug', slug)
            .or('archived.is.null,archived.eq.false')
            .maybeSingle();

        if (error) {
            setMessage(`Item load failed: ${error.message}`);
            setItem(null);
            return;
        }

        if (!data) {
            setMessage('Item not found for this customer home.');
            setItem(null);
            return;
        }

        setItem(data as HomeItemRow);
    }

    async function handleAddToEstimate() {
        if (!estimateAccess || !item) {
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
            source: 'management',
            created_at: new Date().toISOString(),
        }, {
            userId: estimateAccess.userId,
            companyId: estimateAccess.companyId,
            propertyId: item.property_id || clientPropertyId,
        });

        router.push({
            pathname: '/estimate',
            params: {
                companyId: estimateAccess.companyId,
                propertyId: item.property_id || clientPropertyId,
                itemSlug: item.item_slug || item.id,
                mode: 'management',
            },
        } as never);
    }

    function openEstimate() {
        if (!estimateAccess || !item) return;

        router.push({
            pathname: '/estimate',
            params: {
                companyId: estimateAccess.companyId,
                propertyId: item.property_id || clientPropertyId,
                itemSlug: item.item_slug || item.id,
                mode: 'management',
            },
        } as never);
    }

    function stageLocalUpdate(kind: StagedUpdate['kind']) {
        if (!item) return;

        const label = stagedKindLabel(kind);
        const nextUpdate: StagedUpdate = {
            id: `${Date.now()}-${kind}-${item.id}`,
            kind,
            label,
            description: `${label} placeholder for ${item.name || 'this item'}. This is local draft state only and has not been written to the client's HomeOS.`,
            createdAt: new Date().toISOString(),
        };

        setStagedUpdates((current) => [nextUpdate, ...current]);
        setMessage(`${label} staged locally. Nothing has been published to the client's HomeOS.`);
    }

    function stageEditPlaceholder(label: string) {
        if (!item) return;

        setMessage(`${label} will be saved after the publishing workflow is installed. Nothing has been written to the client's HomeOS.`);
    }

    function updateClientHomeOs() {
        setMessage('Client HomeOS update publishing is coming next. Staged company details are not written yet.');
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 980, minWidth: 0 }}>
                <AdminNavBar companyId={companyId} backFallback={clientRoute} />

                <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>ManagementOS / Client HomeOS Shell</Text>
                <Text style={[titleStyle, { color: theme.colors.text }]}>{itemName}</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    {companyName} / {homeName}
                </Text>

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading customer item...</Text>
                    </ThemedCard>
                ) : !item ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Unable to Open Item</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                        <ThemedButton
                            title="Back to Client HomeOS Shell"
                            variant="secondary"
                            onPress={() => router.replace(returnRoute as never)}
                            style={{ marginTop: 16 }}
                        />
                    </ThemedCard>
                ) : (
                    <>
                        <ThemedCard style={heroCardStyle}>
                            <View style={heroHeaderStyle}>
                                <View style={{ flex: 1, minWidth: 220 }}>
                                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>{item.name || 'Unnamed Item'}</Text>
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{address}</Text>
                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                        Basic item identity is visible through this active customer relationship.
                                    </Text>
                                </View>
                                <View style={[shellBadgeStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                                    <Text style={[shellBadgeTextStyle, { color: theme.colors.text }]}>Company View</Text>
                                </View>
                            </View>
                        </ThemedCard>

                        {!!message && (
                            <ThemedCard style={messageCardStyle}>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                            </ThemedCard>
                        )}

                        <ThemedCard style={photoCardStyle}>
                            <Text style={[miniLabelStyle, { color: theme.colors.mutedText }]}>Main Item Photo</Text>
                            <View style={[photoPlaceholderStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                                <Text style={[photoPlaceholderIconStyle, { color: theme.colors.text }]}>📷</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    {connection?.can_view_photos
                                        ? 'Shared item photos will appear here after company media loading is enabled.'
                                        : 'Private HomeOS photos are locked in company view.'}
                                </Text>
                            </View>
                        </ThemedCard>

                        <View style={detailGridStyle}>
                            <DetailCard label="System" value={item.system || 'Unknown'} />
                            <DetailCard label="Area / Location" value={location} />
                            <DetailCard label="Category" value={item.category || 'Unknown'} />
                            <DetailCard label="Status" value={formatStatus(item.status)} />
                            <DetailCard label="Install State" value={item.install_state || 'Unknown'} />
                            <DetailCard label="Created" value={formatDate(item.created_at)} />
                        </View>

                        <ThemedCard style={sectionCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Maintenance Reminders</Text>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                This mirrors the HomeOS item layout. Reminder details are not loaded into company view until the customer sharing workflow allows it.
                            </Text>
                        </ThemedCard>

                        <ThemedCard style={sectionCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Company Tools</Text>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                These actions stay in ManagementOS. Homeowner-only profile, theme, emergency, and provider controls are not shown here.
                            </Text>
                            {!!estimatePermissionMessage && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    {estimatePermissionMessage}
                                </Text>
                            )}

                            <View style={buttonRowStyle}>
                                {canAddToEstimate && (
                                    <>
                                        <ThemedButton
                                            title="Add to Estimate"
                                            onPress={handleAddToEstimate}
                                            style={smallButtonStyle}
                                            textStyle={smallButtonTextStyle}
                                        />
                                        <ThemedButton
                                            title="View Estimate"
                                            variant="secondary"
                                            onPress={openEstimate}
                                            style={smallButtonStyle}
                                            textStyle={smallButtonTextStyle}
                                        />
                                    </>
                                )}
                                <ThemedButton title="Add Details / Notes" variant="secondary" onPress={() => stageLocalUpdate('work_note')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                                <ThemedButton title="Add Job Photo" variant="secondary" onPress={() => stageLocalUpdate('job_photo')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                                <ThemedButton title="Add Finding" variant="secondary" onPress={() => stageLocalUpdate('finding')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                                <ThemedButton title="Mark for Client Update" variant="secondary" onPress={() => stageLocalUpdate('client_update')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                                <ThemedButton title="Edit Information" variant="secondary" onPress={() => stageEditPlaceholder('Staged editing')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                                <ThemedButton title="Move Item" variant="secondary" onPress={() => stageEditPlaceholder('Staged move')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                                <ThemedButton title="Add Related Item" variant="secondary" onPress={() => stageEditPlaceholder('Staged related item')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                                <ThemedButton title="Archive Item" variant="danger" onPress={() => stageEditPlaceholder('Archive item request')} style={smallButtonStyle} textStyle={smallButtonTextStyle} />
                            </View>
                        </ThemedCard>

                        <ThemedCard style={sectionCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Shared Access</Text>
                            <View style={chipRowStyle}>
                                <StatusChip label={connection?.can_view_photos ? 'Photos shared' : 'Photos locked'} />
                                <StatusChip label={connection?.can_view_documents ? 'Documents shared' : 'Documents locked'} />
                                <StatusChip label={connection?.can_view_service_history ? 'History shared' : 'History locked'} />
                            </View>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText, marginTop: 12 }]}>
                                Private HomeOS photos, documents, and history are not loaded automatically from this company item view.
                            </Text>
                        </ThemedCard>

                        <ThemedCard style={sectionCardStyle}>
                            <View style={sectionHeaderStyle}>
                                <View style={{ flex: 1, minWidth: 220 }}>
                                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Staged Updates</Text>
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                        Local placeholders for future client HomeOS update publishing.
                                    </Text>
                                </View>
                                <View style={[shellBadgeStyle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                                    <Text style={[shellBadgeTextStyle, { color: theme.colors.text }]}>{stagedUpdates.length} staged</Text>
                                </View>
                            </View>

                            <ThemedButton
                                title="Update Client's HomeOS"
                                onPress={updateClientHomeOs}
                                style={publishButtonStyle}
                                textStyle={smallButtonTextStyle}
                            />

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
                                            <Text style={[cardTitleStyle, { color: theme.colors.text }]}>{update.label}</Text>
                                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{update.description}</Text>
                                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{formatDate(update.createdAt)}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ThemedCard>

                        <ThemedButton
                            title="Back to Client HomeOS Shell"
                            variant="secondary"
                            onPress={() => router.replace(returnRoute as never)}
                            style={{ marginTop: 4 }}
                        />
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function DetailCard({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={detailCardStyle}>
            <Text style={[miniLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[miniValueStyle, { color: theme.colors.text }]} numberOfLines={2}>
                {value}
            </Text>
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
        .select('role')
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

function getSafeReturnRoute(
    rawReturnTo: string,
    companyId: string,
    propertyId: string,
    fallbackRoute: string
) {
    const shellRoute = `/super-admin/company/${companyId}/client/${propertyId}/homeos`;
    const itemsRoute = `/super-admin/company/${companyId}/client/${propertyId}/items`;
    const allowedRoutes = [shellRoute, itemsRoute];

    return allowedRoutes.some((route) => rawReturnTo === route || rawReturnTo.startsWith(`${route}?`))
        ? rawReturnTo
        : fallbackRoute;
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
    if (kind === 'work_note') return 'Company Note / Details';
    if (kind === 'job_photo') return 'Job Photo';
    if (kind === 'finding') return 'Finding';
    return 'Client Update';
}

function firstParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || '' : value || '';
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

const photoCardStyle = {
    marginBottom: 16,
};

const photoPlaceholderStyle = {
    minHeight: 220,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 18,
    marginTop: 10,
};

const photoPlaceholderIconStyle = {
    fontSize: 42,
    fontWeight: '900' as const,
    marginBottom: 10,
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

const detailGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 16,
};

const detailCardStyle = {
    flexBasis: 150,
    flexGrow: 1,
    minHeight: 110,
};

const miniLabelStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
    marginBottom: 8,
};

const miniValueStyle = {
    fontSize: 17,
    fontWeight: '900' as const,
    lineHeight: 22,
};

const buttonRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 16,
};

const smallButtonStyle = {
    minWidth: 130,
    paddingVertical: 10,
    paddingHorizontal: 12,
};

const publishButtonStyle = {
    alignSelf: 'flex-start' as const,
    marginBottom: 14,
    minWidth: 190,
    paddingVertical: 12,
    paddingHorizontal: 14,
};

const smallButtonTextStyle = {
    fontSize: 12,
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

const cardTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    lineHeight: 23,
    marginBottom: 4,
};
