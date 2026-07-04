import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import SystemStatusCard from '../../../../components/cards/SystemStatusCard';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import {
    loadCurrentCompanyPermissionAccess,
    type CompanyPermissionAccess,
} from '../../../../lib/companyPermissions';
import {
    archiveCompanyPriceBookItem,
    loadCompanyPriceBook,
    priceBookUnits,
    upsertCompanyPriceBookItem,
    type CompanyPriceBookDraft,
    type CompanyPriceBookItem,
    type CompanyPriceBookUnit,
} from '../../../../lib/companyPriceBook';
import { homeSystemOptions } from '../../../../lib/homeSystems';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type CompanyRecord = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
    service_categories: string[] | null;
};

type PriceBookView = 'systems' | 'items' | 'custom';

type PriceBookTemplate = Omit<CompanyPriceBookItem, 'id' | 'company_id' | 'created_at' | 'updated_at' | 'source'>;

type EditorForm = {
    id?: string;
    priceKey: string;
    name: string;
    system: string;
    category: string;
    unit: CompanyPriceBookUnit;
    basePrice: string;
    laborHours: string;
    materialCost: string;
    customerDescription: string;
    internalNotes: string;
    active: boolean;
};

const starterPriceTemplates: PriceBookTemplate[] = [
    template('water-service-faucet-repair', 'Faucet Repair / Replacement', 'Plumbing', 'Fixture Service', 'each'),
    template('water-service-angle-stop', 'Angle Stop Replacement', 'Plumbing', 'Fixture Service', 'each'),
    template('water-service-main-shutoff', 'Main Water Shutoff Service', 'Plumbing', 'Water Service', 'each'),
    template('water-service-prv', 'Pressure Regulator / PRV Service', 'Plumbing', 'Water Service', 'each'),
    template('water-heater-standard-service', 'Water Heater Service', 'Plumbing', 'Water Heater', 'each'),
    template('water-heater-tankless-service', 'Tankless Water Heater Service', 'Plumbing', 'Water Heater', 'each'),
    template('drain-sewer-cleanout', 'Drain Cleaning', 'Drains / Sewer', 'Drain Service', 'each'),
    template('drain-sewer-camera-inspection', 'Sewer Camera Inspection', 'Drains / Sewer', 'Inspection', 'inspection'),
    template('gas-line-service', 'Gas Line Service', 'Gas', 'Gas Service', 'hour'),
    template('water-quality-filter-service', 'Whole Home Filter Service', 'Water Quality', 'Filter Service', 'each'),
    template('hvac-service-call', 'HVAC Service Call', 'HVAC', 'Service Call', 'each'),
    template('electrical-outlet-service', 'Outlet / GFCI Service', 'Electrical', 'Electrical Service', 'each'),
    template('safety-inspection', 'Safety Inspection', 'Safety', 'Inspection', 'inspection'),
    template('appliance-connection', 'Appliance Connection Service', 'Appliances', 'Appliance Service', 'each'),
    template('exterior-hose-bibb', 'Hose Bibb Service', 'Exterior', 'Exterior Plumbing', 'each'),
    template('irrigation-zone-service', 'Irrigation Zone Service', 'Irrigation', 'Irrigation Service', 'hour'),
    template('pool-equipment-service', 'Pool Equipment Service', 'Pool', 'Pool Service', 'hour'),
];

export default function CompanyPriceBookScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const companyId = String(id || '');
    const companyRoute = `/super-admin/company/${encodeURIComponent(companyId)}`;
    const [company, setCompany] = useState<CompanyRecord | null>(null);
    const [items, setItems] = useState<CompanyPriceBookItem[]>([]);
    const [view, setView] = useState<PriceBookView>('systems');
    const [selectedSystem, setSelectedSystem] = useState('');
    const [search, setSearch] = useState('');
    const [pricedFilter, setPricedFilter] = useState<'all' | 'priced' | 'not_priced'>('all');
    const [manageAccess, setManageAccess] = useState<CompanyPermissionAccess | null>(null);
    const [canView, setCanView] = useState(false);
    const [backendStatusMessage, setBackendStatusMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorForm, setEditorForm] = useState<EditorForm>(emptyEditorForm());

    useEffect(() => {
        void loadPriceBook();
    }, [companyId]);

    const companyName = getCompanyDisplayName(company);
    const displayItems = useMemo(() => buildDisplayItems(companyId, items), [companyId, items]);
    const filteredItems = useMemo(
        () => filterPriceBookItems(displayItems, search, selectedSystem, pricedFilter),
        [displayItems, search, selectedSystem, pricedFilter]
    );
    const pricedCount = displayItems.filter((item) => item.base_price !== null).length;
    const activeCount = displayItems.filter((item) => item.active).length;

    async function loadPriceBook() {
        if (!companyId) {
            setMessage('Missing company id.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setMessage('');
        setCanView(false);
        setManageAccess(null);

        const access = await resolvePriceBookAccess(companyId);

        if (!access.allowed) {
            if (!access.userId) {
                router.replace('/auth/login' as never);
                return;
            }

            setMessage(access.error || 'You do not have access to this company price book.');
            setLoading(false);
            return;
        }

        setCanView(true);
        setManageAccess(access.manageAccess);

        const [companyResult, priceBookResult] = await Promise.all([
            supabase
                .from('companies')
                .select('id, name, public_name, dba_name, service_categories')
                .eq('id', companyId)
                .maybeSingle(),
            loadCompanyPriceBook(companyId),
        ]);

        if (companyResult.error) {
            setMessage(`Could not load company context: ${companyResult.error.message}`);
            setLoading(false);
            return;
        }

        setCompany((companyResult.data || null) as CompanyRecord | null);
        setItems(priceBookResult.items);
        setBackendStatusMessage(priceBookResult.backendStatus.message);
        setLoading(false);
    }

    function openSystem(systemName: string) {
        setSelectedSystem(systemName);
        setView('items');
        setSearch('');
    }

    function editItem(item: CompanyPriceBookItem) {
        setEditorForm({
            id: item.source === 'backend' || item.source === 'local' ? item.id : undefined,
            priceKey: item.price_key,
            name: item.name,
            system: item.system,
            category: item.category,
            unit: item.unit,
            basePrice: item.base_price === null ? '' : String(item.base_price),
            laborHours: item.labor_hours === null ? '' : String(item.labor_hours),
            materialCost: item.material_cost === null ? '' : String(item.material_cost),
            customerDescription: item.customer_description || '',
            internalNotes: item.internal_notes || '',
            active: item.active,
        });
        setEditorOpen(true);
        setMessage('');
    }

    function addCustomItem() {
        setEditorForm(emptyEditorForm({
            system: selectedSystem || company?.service_categories?.[0] || 'Plumbing',
        }));
        setView('custom');
        setEditorOpen(true);
        setMessage('');
    }

    async function saveEditor() {
        if (!manageAccess) {
            setMessage('Only company owners, admins, managers, or platform admins can edit the price book.');
            return;
        }

        if (!editorForm.name.trim()) {
            setMessage('Add an item or service name before saving.');
            return;
        }

        setSaving(true);
        setMessage('Saving price book item...');

        try {
            const draft: CompanyPriceBookDraft = {
                id: editorForm.id,
                price_key: editorForm.priceKey || createPriceKey(editorForm.system, editorForm.category, editorForm.name),
                name: editorForm.name,
                system: editorForm.system,
                category: editorForm.category,
                unit: editorForm.unit,
                base_price: parseOptionalNumber(editorForm.basePrice),
                labor_hours: parseOptionalNumber(editorForm.laborHours),
                material_cost: parseOptionalNumber(editorForm.materialCost),
                customer_description: editorForm.customerDescription,
                internal_notes: editorForm.internalNotes,
                active: editorForm.active,
            };
            const result = await upsertCompanyPriceBookItem(companyId, draft);
            const refreshed = await loadCompanyPriceBook(companyId);

            setItems(refreshed.items);
            setBackendStatusMessage(result.backendStatus.message);
            setMessage(result.backendStatus.status === 'connected'
                ? 'Price book item saved.'
                : 'Local price book draft saved. Install SQL 597 for shared company pricing.'
            );
            setEditorOpen(false);
            setView('items');
        } catch (error) {
            setMessage(`Price book save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    async function archiveItem(item: CompanyPriceBookItem) {
        if (!manageAccess) {
            setMessage('Only company owners, admins, managers, or platform admins can archive price book items.');
            return;
        }

        setSaving(true);
        setMessage('Archiving price book item...');

        try {
            const result = await archiveCompanyPriceBookItem(companyId, item);
            const refreshed = await loadCompanyPriceBook(companyId);

            setItems(refreshed.items);
            setBackendStatusMessage(result.backendStatus.message);
            setMessage('Price book item marked inactive.');
        } catch (error) {
            setMessage(`Could not archive price book item: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1180, minWidth: 0 }}>
                <AdminNavBar companyId={companyId} backFallback={companyRoute as never} />

                <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>ManagementOS / Price Book</Text>
                <Text style={[titleStyle, { color: theme.colors.text }]}>Company Price Book</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    {companyName} / Company-owned pricing used for estimates and proposals.
                </Text>

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading price book...</Text>
                    </ThemedCard>
                ) : message && !canView ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Unable to Open Price Book</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                ) : (
                    <>
                        <View style={summaryGridStyle}>
                            <SummaryCard label="Items" value={String(displayItems.length)} />
                            <SummaryCard label="Priced" value={String(pricedCount)} />
                            <SummaryCard label="Active" value={String(activeCount)} />
                            <SummaryCard label="Mode" value={manageAccess ? 'Edit' : 'View'} />
                        </View>

                        <ThemedCard style={statusCardStyle}>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                {backendStatusMessage || 'Price book backend: checking'}
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                No fake prices are generated. Starter items are priceable templates until your company saves real pricing.
                            </Text>
                        </ThemedCard>

                        {!!message && (
                            <ThemedCard style={statusCardStyle}>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                            </ThemedCard>
                        )}

                        <View style={tabRowStyle}>
                            <TabButton active={view === 'systems'} label="Systems" onPress={() => setView('systems')} />
                            <TabButton active={view === 'items'} label="All Items" onPress={() => setView('items')} />
                            <TabButton active={view === 'custom'} label="Add Custom Price Item" onPress={addCustomItem} />
                        </View>

                        {view === 'systems' && (
                            <ThemedCard style={sectionCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Systems</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Pick a service system to drill into priceable items.
                                </Text>
                                <View style={systemGridStyle}>
                                    {homeSystemOptions.map((system) => (
                                        <SystemStatusCard
                                            key={system.key}
                                            title={system.label}
                                            icon={system.icon}
                                            status={systemHasPricedItems(displayItems, system.key) ? 'Good' : 'Needs Review'}
                                            onPress={() => openSystem(system.key)}
                                            style={systemTileStyle}
                                        />
                                    ))}
                                </View>
                            </ThemedCard>
                        )}

                        {view !== 'systems' && (
                            <ThemedCard style={sectionCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                                    {selectedSystem ? `${selectedSystem} Items` : 'All Price Book Items'}
                                </Text>
                                <View style={filterRowStyle}>
                                    <TextInput
                                        value={search}
                                        onChangeText={setSearch}
                                        placeholder="Search name, system, category..."
                                        style={[searchInputStyle, {
                                            borderColor: theme.colors.border,
                                            color: theme.colors.text,
                                            backgroundColor: theme.colors.surfaceAlt,
                                        }]}
                                        placeholderTextColor={theme.colors.mutedText}
                                    />
                                    <FilterButton label="All" active={pricedFilter === 'all'} onPress={() => setPricedFilter('all')} />
                                    <FilterButton label="Priced" active={pricedFilter === 'priced'} onPress={() => setPricedFilter('priced')} />
                                    <FilterButton label="Not Priced" active={pricedFilter === 'not_priced'} onPress={() => setPricedFilter('not_priced')} />
                                    {!!selectedSystem && (
                                        <FilterButton label="Clear System" active={false} onPress={() => setSelectedSystem('')} />
                                    )}
                                </View>

                                {filteredItems.length === 0 ? (
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                        No price book items match this filter.
                                    </Text>
                                ) : (
                                    <View style={itemGridStyle}>
                                        {filteredItems.map((item) => (
                                            <PriceBookItemCard
                                                key={item.price_key}
                                                item={item}
                                                canManage={!!manageAccess}
                                                onEdit={() => editItem(item)}
                                                onArchive={() => archiveItem(item)}
                                            />
                                        ))}
                                    </View>
                                )}
                            </ThemedCard>
                        )}

                        {editorOpen && (
                            <ThemedCard style={sectionCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Price Item Editor</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Save company-owned pricing. This does not edit homeowner HomeOS records.
                                </Text>

                                <View style={editorGridStyle}>
                                    <EditorField label="Item / Service Name" value={editorForm.name} onChangeText={(value) => updateEditor('name', value)} />
                                    <EditorField label="System" value={editorForm.system} onChangeText={(value) => updateEditor('system', value)} />
                                    <EditorField label="Category" value={editorForm.category} onChangeText={(value) => updateEditor('category', value)} />
                                    <EditorField label="Base Price" value={editorForm.basePrice} onChangeText={(value) => updateEditor('basePrice', value)} keyboardType="decimal-pad" />
                                    <EditorField label="Labor Hours" value={editorForm.laborHours} onChangeText={(value) => updateEditor('laborHours', value)} keyboardType="decimal-pad" />
                                    <EditorField label="Material Cost" value={editorForm.materialCost} onChangeText={(value) => updateEditor('materialCost', value)} keyboardType="decimal-pad" />
                                </View>

                                <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Unit</Text>
                                <View style={unitRowStyle}>
                                    {priceBookUnits.map((unit) => (
                                        <FilterButton
                                            key={unit}
                                            label={unit}
                                            active={editorForm.unit === unit}
                                            onPress={() => setEditorForm((current) => ({ ...current, unit }))}
                                        />
                                    ))}
                                </View>

                                <EditorField label="Customer-Facing Description" value={editorForm.customerDescription} onChangeText={(value) => updateEditor('customerDescription', value)} multiline />
                                <EditorField label="Internal Notes" value={editorForm.internalNotes} onChangeText={(value) => updateEditor('internalNotes', value)} multiline />

                                <TouchableOpacity
                                    activeOpacity={0.82}
                                    onPress={() => setEditorForm((current) => ({ ...current, active: !current.active }))}
                                    style={[activeToggleStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                                >
                                    <Text style={[bodyTextStyle, { color: theme.colors.text }]}>
                                        {editorForm.active ? 'Active item' : 'Inactive item'}
                                    </Text>
                                </TouchableOpacity>

                                <View style={editorActionRowStyle}>
                                    <ThemedButton
                                        title={saving ? 'Saving...' : 'Save Price Item'}
                                        disabled={saving || !manageAccess}
                                        onPress={saveEditor}
                                        style={compactButtonStyle}
                                        textStyle={compactButtonTextStyle}
                                    />
                                    <ThemedButton
                                        title="Cancel"
                                        variant="secondary"
                                        onPress={() => setEditorOpen(false)}
                                        style={compactButtonStyle}
                                        textStyle={compactButtonTextStyle}
                                    />
                                </View>
                            </ThemedCard>
                        )}
                    </>
                )}
            </View>
        </ScrollView>
    );

    function updateEditor(key: keyof EditorForm, value: string) {
        setEditorForm((current) => ({
            ...current,
            [key]: value,
            priceKey: key === 'name' || key === 'system' || key === 'category'
                ? createPriceKey(
                    key === 'system' ? value : current.system,
                    key === 'category' ? value : current.category,
                    key === 'name' ? value : current.name
                )
                : current.priceKey,
        }));
    }
}

function PriceBookItemCard({
    item,
    canManage,
    onEdit,
    onArchive,
}: {
    item: CompanyPriceBookItem;
    canManage: boolean;
    onEdit: () => void;
    onArchive: () => void;
}) {
    const { theme } = useTheme();
    const priced = item.base_price !== null;

    return (
        <ThemedCard style={priceItemCardStyle}>
            <Text style={[itemTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                {item.name}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                {item.system} / {item.category}
            </Text>
            <View style={chipRowStyle}>
                <Text style={[chipStyle, { color: theme.colors.text, borderColor: theme.colors.border }]}>
                    {priced ? formatPrice(item.base_price) : 'Not priced'}
                </Text>
                <Text style={[chipStyle, { color: theme.colors.text, borderColor: theme.colors.border }]}>
                    {item.unit}
                </Text>
                <Text style={[chipStyle, { color: theme.colors.text, borderColor: theme.colors.border }]}>
                    {item.active ? 'Active' : 'Inactive'}
                </Text>
            </View>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                {item.source === 'local' ? 'Local price book draft' : item.source === 'backend' ? 'Saved to company price book' : 'Starter template'}
            </Text>

            <View style={itemActionRowStyle}>
                <ThemedButton
                    title={canManage ? 'Edit Price' : 'View Details'}
                    variant={canManage ? 'primary' : 'secondary'}
                    onPress={onEdit}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                {canManage && item.source !== 'template' && (
                    <ThemedButton
                        title="Set Inactive"
                        variant="secondary"
                        onPress={onArchive}
                        style={compactButtonStyle}
                        textStyle={compactButtonTextStyle}
                    />
                )}
            </View>
        </ThemedCard>
    );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={summaryCardStyle}>
            <Text style={[summaryLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[summaryValueStyle, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
        </ThemedCard>
    );
}

function TabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
    const { theme } = useTheme();

    return (
        <TouchableOpacity
            activeOpacity={0.82}
            onPress={onPress}
            style={[
                tabButtonStyle,
                {
                    backgroundColor: active ? theme.colors.primary : theme.colors.secondaryButton,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                },
            ]}
        >
            <Text style={[tabButtonTextStyle, { color: active ? theme.colors.primaryText : theme.colors.secondaryButtonText }]}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

function FilterButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
    const { theme } = useTheme();

    return (
        <TouchableOpacity
            activeOpacity={0.82}
            onPress={onPress}
            style={[
                filterButtonStyle,
                {
                    backgroundColor: active ? theme.colors.primary : theme.colors.secondaryButton,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                },
            ]}
        >
            <Text style={[filterButtonTextStyle, { color: active ? theme.colors.primaryText : theme.colors.secondaryButtonText }]}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

function EditorField({
    label,
    value,
    onChangeText,
    keyboardType,
    multiline = false,
}: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    keyboardType?: 'default' | 'decimal-pad';
    multiline?: boolean;
}) {
    const { theme } = useTheme();

    return (
        <View style={fieldWrapStyle}>
            <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                keyboardType={keyboardType || 'default'}
                multiline={multiline}
                style={[
                    inputStyle,
                    multiline ? multilineInputStyle : null,
                    {
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        backgroundColor: theme.colors.surfaceAlt,
                    },
                ]}
                placeholderTextColor={theme.colors.mutedText}
            />
        </View>
    );
}

async function resolvePriceBookAccess(companyId: string) {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        return {
            allowed: false,
            userId: null,
            manageAccess: null,
            error: 'Sign in to open this company price book.',
        };
    }

    if (await isPlatformAdmin(user.id)) {
        return {
            allowed: true,
            userId: user.id,
            manageAccess: platformAdminAccess(user.id, companyId),
            error: null,
        };
    }

    const [manageLookup, viewLookup] = await Promise.all([
        loadCurrentCompanyPermissionAccess('can_create_estimates', { companyId }),
        loadCurrentCompanyPermissionAccess('can_view_techos', { companyId }),
    ]);

    return {
        allowed: Boolean(manageLookup.access || viewLookup.access),
        userId: user.id,
        manageAccess: manageLookup.access,
        error: manageLookup.error || viewLookup.error || 'No active company access for this price book.',
    };
}

function platformAdminAccess(userId: string, companyId: string): CompanyPermissionAccess {
    return {
        userId,
        companyUserId: '',
        companyId,
        role: 'platform_admin',
        status: 'active',
        permissions: {
            can_view_techos: true,
            can_create_estimates: true,
            can_add_item_to_estimate: true,
            can_view_customers: true,
            can_view_jobs: true,
            can_manage_company_users: true,
            can_manage_company_profile: true,
        },
    };
}

async function isPlatformAdmin(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role, is_platform_admin')
        .eq('id', userId)
        .limit(1);

    if (!primaryQuery.error) {
        return isPlatformAdminProfile((primaryQuery.data || [])[0] as { role?: string | null; is_platform_admin?: boolean | null } | undefined);
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    return isPlatformAdminProfile((fallbackQuery.data || [])[0] as { role?: string | null } | undefined);
}

function isPlatformAdminProfile(profile?: { role?: string | null; is_platform_admin?: boolean | null } | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

function buildDisplayItems(companyId: string, savedItems: CompanyPriceBookItem[]) {
    const savedByKey = new Map(savedItems.map((item) => [item.price_key, item]));
    const templateItems: CompanyPriceBookItem[] = starterPriceTemplates.map((item) => ({
        ...item,
        id: `template-${item.price_key}`,
        company_id: companyId,
        created_at: null,
        updated_at: null,
        source: 'template' as const,
    }));

    return [
        ...templateItems.map((item) => savedByKey.get(item.price_key) || item),
        ...savedItems.filter((item) => !starterPriceTemplates.some((templateItem) => templateItem.price_key === item.price_key)),
    ].sort((a, b) =>
        a.system.localeCompare(b.system) ||
        a.category.localeCompare(b.category) ||
        a.name.localeCompare(b.name)
    );
}

function filterPriceBookItems(
    items: CompanyPriceBookItem[],
    search: string,
    selectedSystem: string,
    pricedFilter: 'all' | 'priced' | 'not_priced'
) {
    const searchTerm = search.trim().toLowerCase();

    return items.filter((item) => {
        if (selectedSystem && item.system !== selectedSystem) return false;
        if (pricedFilter === 'priced' && item.base_price === null) return false;
        if (pricedFilter === 'not_priced' && item.base_price !== null) return false;
        if (!searchTerm) return true;

        return [item.name, item.system, item.category, item.unit]
            .join(' ')
            .toLowerCase()
            .includes(searchTerm);
    });
}

function systemHasPricedItems(items: CompanyPriceBookItem[], system: string) {
    return items.some((item) => item.system === system && item.base_price !== null && item.active);
}

function emptyEditorForm(seed: Partial<EditorForm> = {}): EditorForm {
    const system = seed.system || 'Plumbing';
    const category = seed.category || 'Service';
    const name = seed.name || '';

    return {
        priceKey: seed.priceKey || createPriceKey(system, category, name),
        name,
        system,
        category,
        unit: seed.unit || 'each',
        basePrice: seed.basePrice || '',
        laborHours: seed.laborHours || '',
        materialCost: seed.materialCost || '',
        customerDescription: seed.customerDescription || '',
        internalNotes: seed.internalNotes || '',
        active: seed.active ?? true,
    };
}

function template(
    priceKey: string,
    name: string,
    system: string,
    category: string,
    unit: CompanyPriceBookUnit
): PriceBookTemplate {
    return {
        price_key: priceKey,
        name,
        system,
        category,
        unit,
        base_price: null,
        labor_hours: null,
        material_cost: null,
        customer_description: null,
        internal_notes: null,
        active: true,
    };
}

function getCompanyDisplayName(company?: CompanyRecord | null) {
    return company?.public_name?.trim() || company?.dba_name?.trim() || company?.name?.trim() || 'Company';
}

function createPriceKey(system: string, category: string, name: string) {
    return [system, category, name]
        .filter(Boolean)
        .join(' ')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'price-item';
}

function parseOptionalNumber(value: string) {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    const parsedValue = Number.parseFloat(trimmedValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
}

function formatPrice(value: number | null) {
    if (value === null) return 'Not priced';

    return `$${value.toFixed(2)}`;
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
    marginBottom: 20,
};

const sectionCardStyle = {
    marginBottom: 16,
};

const statusCardStyle = {
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
    fontWeight: '900' as const,
    lineHeight: 19,
    marginTop: 8,
};

const summaryGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 14,
};

const summaryCardStyle = {
    width: 150,
    minHeight: 96,
};

const summaryLabelStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const summaryValueStyle = {
    fontSize: 24,
    fontWeight: '900' as const,
    marginTop: 8,
};

const tabRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 16,
};

const tabButtonStyle = {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
};

const tabButtonTextStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
};

const filterRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
    marginBottom: 14,
};

const filterButtonStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
};

const filterButtonTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const searchInputStyle = {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '800' as const,
    minWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const systemGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 14,
};

const systemTileStyle = {
    width: 160,
    minHeight: 160,
};

const itemGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const priceItemCardStyle = {
    width: 240,
    minHeight: 230,
};

const itemTitleStyle = {
    fontSize: 17,
    fontWeight: '900' as const,
};

const chipRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 10,
};

const chipStyle = {
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 12,
    fontWeight: '900' as const,
    paddingHorizontal: 8,
    paddingVertical: 5,
};

const itemActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const compactButtonStyle = {
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const compactButtonTextStyle = {
    fontSize: 12,
};

const editorGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 14,
};

const fieldWrapStyle = {
    flexGrow: 1,
    flexBasis: 240,
};

const fieldLabelStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    marginBottom: 6,
    marginTop: 12,
};

const inputStyle = {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '800' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const multilineInputStyle = {
    minHeight: 90,
    textAlignVertical: 'top' as const,
};

const unitRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
};

const activeToggleStyle = {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
    alignSelf: 'flex-start' as const,
};

const editorActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 14,
};
