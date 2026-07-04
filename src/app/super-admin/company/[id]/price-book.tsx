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
type PriceTool = 'ai' | 'bulk' | 'calculator' | 'import' | null;
type BulkScope = 'active' | 'filtered' | 'system' | 'category' | 'selected';
type PricingMode = 'markup' | 'margin';
type Positioning = 'budget' | 'market average' | 'premium';

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

type CalculatorForm = {
    materialCost: string;
    laborHours: string;
    laborRate: string;
    markupPercent: string;
    marginPercent: string;
    overheadPercent: string;
    minimumPrice: string;
    mode: PricingMode;
};

type CalculatorResult = {
    materialCost: number;
    laborCost: number;
    overheadCost: number;
    totalCost: number;
    suggestedPrice: number;
    grossProfit: number;
    grossMargin: number;
    markup: number;
    valid: boolean;
    error: string;
};

type BulkPreviewRow = {
    item: CompanyPriceBookItem;
    oldPrice: number;
    newPrice: number;
    difference: number;
    percentChange: number;
};

type PriceSuggestion = {
    id: string;
    priceKey: string;
    itemName: string;
    currentPrice: number | null;
    suggestedPrice: number;
    lowPrice: number | null;
    averagePrice: number | null;
    highPrice: number | null;
    confidence: 'low' | 'medium' | 'high';
    sourceCount: number;
    notes: string;
    reasoningSummary: string;
    assumptions: string[];
    cautionNotes: string[];
    sourceNotes: string[];
    applyAllowed: boolean;
    createdAt: string;
};

type AiResearchSuggestionRecord = {
    item_key?: unknown;
    name?: unknown;
    suggested_low_price?: unknown;
    suggested_average_price?: unknown;
    suggested_high_price?: unknown;
    recommended_price?: unknown;
    confidence?: unknown;
    reasoning_summary?: unknown;
    assumptions?: unknown;
    caution_notes?: unknown;
    source_notes?: unknown;
    apply_allowed?: unknown;
};

type ResearchForm = {
    scope: 'one_item' | 'current_system' | 'filtered_list' | 'all_unpriced';
    itemKey: string;
    serviceArea: string;
    trade: string;
    positioning: Positioning;
    targetMargin: string;
    notes: string;
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
    const [activeTool, setActiveTool] = useState<PriceTool>(null);
    const [bulkScope, setBulkScope] = useState<BulkScope>('filtered');
    const [bulkPercent, setBulkPercent] = useState('8');
    const [bulkSystem, setBulkSystem] = useState('');
    const [bulkCategory, setBulkCategory] = useState('');
    const [selectedPriceKeys, setSelectedPriceKeys] = useState<string[]>([]);
    const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false);
    const [calculatorForm, setCalculatorForm] = useState<CalculatorForm>(emptyCalculatorForm());
    const [researchForm, setResearchForm] = useState<ResearchForm>(emptyResearchForm());
    const [suggestions, setSuggestions] = useState<PriceSuggestion[]>([]);
    const [researching, setResearching] = useState(false);

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
    const systems = useMemo(() => uniqueStrings(displayItems.map((item) => item.system)), [displayItems]);
    const categories = useMemo(() => uniqueStrings(displayItems.map((item) => item.category)), [displayItems]);
    const bulkPreviewRows = useMemo(
        () => buildBulkPreviewRows(
            displayItems,
            filteredItems,
            bulkScope,
            selectedPriceKeys,
            bulkSystem,
            bulkCategory,
            parseOptionalNumber(bulkPercent)
        ),
        [displayItems, filteredItems, bulkScope, selectedPriceKeys, bulkSystem, bulkCategory, bulkPercent]
    );
    const calculatorResult = useMemo(() => calculatePrice(calculatorForm), [calculatorForm]);
    const currentEditorSuggestion = suggestions.find((suggestion) => suggestion.priceKey === editorForm.priceKey);

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

    function toggleTool(tool: PriceTool) {
        setActiveTool((current) => current === tool ? null : tool);
        setMessage('');
    }

    function toggleSelectedItem(priceKey: string) {
        setSelectedPriceKeys((current) =>
            current.includes(priceKey)
                ? current.filter((key) => key !== priceKey)
                : [...current, priceKey]
        );
        setBulkPreviewOpen(false);
    }

    function previewBulkUpdate() {
        if (!manageAccess) {
            setMessage('Only company owners, admins, managers, or platform admins can apply bulk price updates.');
            return;
        }

        if (parseOptionalNumber(bulkPercent) === null) {
            setMessage('Enter a valid percentage before previewing a bulk update.');
            return;
        }

        if (bulkPreviewRows.length === 0) {
            setMessage('No priced items match this bulk update scope.');
            setBulkPreviewOpen(false);
            return;
        }

        setBulkPreviewOpen(true);
        setMessage(`Previewing ${bulkPreviewRows.length} price changes. Review before applying.`);
    }

    async function applyBulkUpdate() {
        if (!manageAccess) {
            setMessage('Only company owners, admins, managers, or platform admins can apply bulk price updates.');
            return;
        }

        if (!bulkPreviewOpen || bulkPreviewRows.length === 0) {
            setMessage('Preview the bulk price changes before applying them.');
            return;
        }

        setSaving(true);
        setMessage('Applying bulk price update...');

        try {
            for (const row of bulkPreviewRows) {
                await upsertCompanyPriceBookItem(companyId, {
                    id: row.item.source === 'template' ? undefined : row.item.id,
                    price_key: row.item.price_key,
                    name: row.item.name,
                    system: row.item.system,
                    category: row.item.category,
                    unit: row.item.unit,
                    base_price: row.newPrice,
                    labor_hours: row.item.labor_hours,
                    material_cost: row.item.material_cost,
                    customer_description: row.item.customer_description,
                    internal_notes: row.item.internal_notes,
                    active: row.item.active,
                });
            }

            const refreshed = await loadCompanyPriceBook(companyId);

            setItems(refreshed.items);
            setBackendStatusMessage(refreshed.backendStatus.message);
            setBulkPreviewOpen(false);
            setMessage(`Applied bulk price update to ${bulkPreviewRows.length} items.`);
        } catch (error) {
            setMessage(`Bulk price update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    function applyCalculatorToEditor() {
        if (!calculatorResult.valid) {
            setMessage(calculatorResult.error || 'Calculator needs valid cost and pricing inputs.');
            return;
        }

        setEditorForm((current) => ({
            ...current,
            basePrice: calculatorResult.suggestedPrice.toFixed(2),
            materialCost: calculatorForm.materialCost.trim() || current.materialCost,
            laborHours: calculatorForm.laborHours.trim() || current.laborHours,
        }));
        setEditorOpen(true);
        setView('custom');
        setMessage('Calculator price applied to the current item editor.');
    }

    async function applyCalculatorToSelectedItems() {
        if (!manageAccess) {
            setMessage('Only company owners, admins, managers, or platform admins can apply calculator pricing.');
            return;
        }

        if (!calculatorResult.valid) {
            setMessage(calculatorResult.error || 'Calculator needs valid cost and pricing inputs.');
            return;
        }

        const selectedItems = displayItems.filter((item) => selectedPriceKeys.includes(item.price_key));

        if (selectedItems.length === 0) {
            setMessage('Select one or more price book items before applying calculator pricing.');
            return;
        }

        setSaving(true);
        setMessage('Applying calculator price to selected items...');

        try {
            for (const item of selectedItems) {
                await upsertCompanyPriceBookItem(companyId, {
                    id: item.source === 'template' ? undefined : item.id,
                    price_key: item.price_key,
                    name: item.name,
                    system: item.system,
                    category: item.category,
                    unit: item.unit,
                    base_price: calculatorResult.suggestedPrice,
                    labor_hours: parseOptionalNumber(calculatorForm.laborHours) ?? item.labor_hours,
                    material_cost: parseOptionalNumber(calculatorForm.materialCost) ?? item.material_cost,
                    customer_description: item.customer_description,
                    internal_notes: item.internal_notes,
                    active: item.active,
                });
            }

            const refreshed = await loadCompanyPriceBook(companyId);

            setItems(refreshed.items);
            setBackendStatusMessage(refreshed.backendStatus.message);
            setMessage(`Applied calculator price to ${selectedItems.length} selected items.`);
        } catch (error) {
            setMessage(`Calculator pricing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    function openAiResearchForItem(item: CompanyPriceBookItem) {
        setActiveTool('ai');
        setResearchForm((current) => ({
            ...current,
            scope: 'one_item',
            itemKey: item.price_key,
            trade: item.system || current.trade,
        }));
        setMessage('Ready to research this item. Suggestions are generated for manual review only.');
    }

    async function requestAiResearch() {
        if (!manageAccess) {
            setMessage('Only company owners, admins, managers, or platform admins can request AI price research.');
            return;
        }

        const researchItems = getResearchItems(displayItems, filteredItems, researchForm, selectedSystem);

        if (researchItems.length === 0) {
            setMessage('No price book items match this AI research scope.');
            return;
        }

        setResearching(true);
        setMessage('Researching prices with AI...');

        try {
            const { data, error } = await supabase.functions.invoke('research-price-book', {
                body: {
                    company_id: companyId,
                    company_name: companyName,
                    service_area_zip: researchForm.serviceArea,
                    city: researchForm.serviceArea,
                    trade: researchForm.trade || selectedSystem || researchItems[0]?.system || 'Home service',
                    pricing_positioning: toApiPositioning(researchForm.positioning),
                    target_margin_percent: parseOptionalNumber(researchForm.targetMargin),
                    notes: researchForm.notes,
                    items: researchItems.map(toAiResearchItemPayload),
                },
            });

            if (error) {
                throw new Error(readFunctionErrorMessage(error, data));
            }

            const nextSuggestions = readAiSuggestions(data, displayItems);

            if (nextSuggestions.length === 0) {
                setMessage('AI price research returned no suggestions. Try narrowing the scope or adding more item details.');
                return;
            }

            setSuggestions((current) => mergeSuggestions(current, nextSuggestions));
            setMessage('AI-assisted price suggestions are ready. Review carefully before applying.');
        } catch (error) {
            setMessage(`AI price research failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setResearching(false);
        }
    }

    async function applySuggestion(suggestion: PriceSuggestion) {
        if (!manageAccess) {
            setMessage('Only company owners, admins, managers, or platform admins can apply suggested pricing.');
            return;
        }

        const item = displayItems.find((candidate) => candidate.price_key === suggestion.priceKey);

        if (!item) {
            setMessage('Suggested item is no longer visible in this price book.');
            return;
        }

        setSaving(true);
        setMessage('Applying suggested price...');

        try {
            await upsertCompanyPriceBookItem(companyId, {
                id: item.source === 'template' ? undefined : item.id,
                price_key: item.price_key,
                name: item.name,
                system: item.system,
                category: item.category,
                unit: item.unit,
                base_price: suggestion.suggestedPrice,
                labor_hours: item.labor_hours,
                material_cost: item.material_cost,
                customer_description: item.customer_description,
                internal_notes: item.internal_notes,
                active: item.active,
            });

            const refreshed = await loadCompanyPriceBook(companyId);

            setItems(refreshed.items);
            setSuggestions((current) => current.filter((entry) => entry.id !== suggestion.id));
            setBackendStatusMessage(refreshed.backendStatus.message);
            setMessage('Suggested price applied after review.');
        } catch (error) {
            setMessage(`Suggested price could not be applied: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    function dismissSuggestion(suggestionId: string) {
        setSuggestions((current) => current.filter((suggestion) => suggestion.id !== suggestionId));
        setMessage('Price suggestion dismissed.');
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

                        <ThemedCard style={sectionCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Pricing Tools</Text>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                Review every change before applying. AI suggestions never overwrite prices automatically.
                            </Text>
                            <View style={toolGridStyle}>
                                <ToolCard
                                    title="AI Price Research"
                                    description="Request server-side market research suggestions."
                                    active={activeTool === 'ai'}
                                    onPress={() => toggleTool('ai')}
                                />
                                <ToolCard
                                    title="Bulk Price Increase"
                                    description="Preview percent changes before saving."
                                    active={activeTool === 'bulk'}
                                    onPress={() => toggleTool('bulk')}
                                />
                                <ToolCard
                                    title="Margin / Markup Calculator"
                                    description="Markup and margin are different."
                                    active={activeTool === 'calculator'}
                                    onPress={() => toggleTool('calculator')}
                                />
                                <ToolCard
                                    title="Import / Export"
                                    description="CSV import/export foundation coming soon."
                                    active={activeTool === 'import'}
                                    onPress={() => toggleTool('import')}
                                />
                            </View>

                            {activeTool === 'bulk' && (
                                <BulkPriceTool
                                    scope={bulkScope}
                                    percent={bulkPercent}
                                    system={bulkSystem}
                                    category={bulkCategory}
                                    systems={systems}
                                    categories={categories}
                                    selectedCount={selectedPriceKeys.length}
                                    previewRows={bulkPreviewRows}
                                    previewOpen={bulkPreviewOpen}
                                    saving={saving}
                                    canManage={!!manageAccess}
                                    onChangeScope={(nextScope) => {
                                        setBulkScope(nextScope);
                                        setBulkPreviewOpen(false);
                                    }}
                                    onChangePercent={(value) => {
                                        setBulkPercent(value);
                                        setBulkPreviewOpen(false);
                                    }}
                                    onChangeSystem={(value) => {
                                        setBulkSystem(value);
                                        setBulkPreviewOpen(false);
                                    }}
                                    onChangeCategory={(value) => {
                                        setBulkCategory(value);
                                        setBulkPreviewOpen(false);
                                    }}
                                    onPreview={previewBulkUpdate}
                                    onApply={applyBulkUpdate}
                                />
                            )}

                            {activeTool === 'calculator' && (
                                <MarginCalculatorTool
                                    form={calculatorForm}
                                    result={calculatorResult}
                                    selectedCount={selectedPriceKeys.length}
                                    saving={saving}
                                    canManage={!!manageAccess}
                                    onChange={(patch) => setCalculatorForm((current) => ({ ...current, ...patch }))}
                                    onApplyToEditor={applyCalculatorToEditor}
                                    onApplyToSelected={applyCalculatorToSelectedItems}
                                />
                            )}

                            {activeTool === 'ai' && (
                                <AiResearchTool
                                    form={researchForm}
                                    items={filteredItems}
                                    canManage={!!manageAccess}
                                    researching={researching}
                                    onChange={(patch) => setResearchForm((current) => ({ ...current, ...patch }))}
                                    onResearch={requestAiResearch}
                                />
                            )}

                            {activeTool === 'import' && (
                                <View style={toolPanelStyle}>
                                    <Text style={[bodyTextStyle, { color: theme.colors.text }]}>Import / Export Coming Soon</Text>
                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                        CSV import/export will be added after the shared backend price book table is installed and reviewed.
                                    </Text>
                                </View>
                            )}
                        </ThemedCard>

                        <SuggestionReviewSection
                            suggestions={suggestions}
                            onApply={applySuggestion}
                            onDismiss={dismissSuggestion}
                            canManage={!!manageAccess}
                        />

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
                                                selectable={activeTool === 'bulk' || activeTool === 'calculator'}
                                                selected={selectedPriceKeys.includes(item.price_key)}
                                                onEdit={() => editItem(item)}
                                                onArchive={() => archiveItem(item)}
                                                onToggleSelected={() => toggleSelectedItem(item.price_key)}
                                                onResearch={() => openAiResearchForItem(item)}
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

                                <View style={editorToolRowStyle}>
                                    <EditorPercentTool
                                        currentPrice={editorForm.basePrice}
                                        onApply={(nextPrice) => {
                                            setEditorForm((current) => ({ ...current, basePrice: nextPrice }));
                                            setMessage('Percent adjustment applied to the editor. Save to update the price book.');
                                        }}
                                    />
                                    <ThemedButton
                                        title="Calculate from Margin"
                                        variant="secondary"
                                        onPress={() => setActiveTool('calculator')}
                                        style={compactButtonStyle}
                                        textStyle={compactButtonTextStyle}
                                    />
                                    <ThemedButton
                                        title="Research This Item with AI"
                                        variant="secondary"
                                        onPress={() => {
                                            setActiveTool('ai');
                                            setResearchForm((current) => ({
                                                ...current,
                                                scope: 'one_item',
                                                itemKey: editorForm.priceKey,
                                                trade: editorForm.system || current.trade,
                                            }));
                                        }}
                                        style={compactButtonStyle}
                                        textStyle={compactButtonTextStyle}
                                    />
                                    {currentEditorSuggestion && (
                                        <ThemedButton
                                            title="Apply Suggested Price"
                                            variant="secondary"
                                            onPress={() => void applySuggestion(currentEditorSuggestion)}
                                            style={compactButtonStyle}
                                            textStyle={compactButtonTextStyle}
                                        />
                                    )}
                                </View>

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
    selectable,
    selected,
    onEdit,
    onArchive,
    onToggleSelected,
    onResearch,
}: {
    item: CompanyPriceBookItem;
    canManage: boolean;
    selectable: boolean;
    selected: boolean;
    onEdit: () => void;
    onArchive: () => void;
    onToggleSelected: () => void;
    onResearch: () => void;
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
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Last changed: {formatDateTime(item.updated_at)}
            </Text>

            <View style={itemActionRowStyle}>
                {selectable && (
                    <ThemedButton
                        title={selected ? 'Selected' : 'Select'}
                        variant={selected ? 'primary' : 'secondary'}
                        onPress={onToggleSelected}
                        style={compactButtonStyle}
                        textStyle={compactButtonTextStyle}
                    />
                )}
                <ThemedButton
                    title={canManage ? 'Edit Price' : 'View Details'}
                    variant={canManage ? 'primary' : 'secondary'}
                    onPress={onEdit}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                {canManage && (
                    <ThemedButton
                        title="AI Research"
                        variant="secondary"
                        onPress={onResearch}
                        style={compactButtonStyle}
                        textStyle={compactButtonTextStyle}
                    />
                )}
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

function ToolCard({
    title,
    description,
    active,
    onPress,
}: {
    title: string;
    description: string;
    active: boolean;
    onPress: () => void;
}) {
    const { theme } = useTheme();

    return (
        <TouchableOpacity
            activeOpacity={0.82}
            onPress={onPress}
            style={[
                toolCardStyle,
                {
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    backgroundColor: active ? theme.colors.secondaryButton : theme.colors.surfaceAlt,
                },
            ]}
        >
            <Text style={[toolTitleStyle, { color: theme.colors.text }]}>{title}</Text>
            <Text style={[toolDescriptionStyle, { color: theme.colors.mutedText }]}>{description}</Text>
        </TouchableOpacity>
    );
}

function BulkPriceTool({
    scope,
    percent,
    system,
    category,
    systems,
    categories,
    selectedCount,
    previewRows,
    previewOpen,
    saving,
    canManage,
    onChangeScope,
    onChangePercent,
    onChangeSystem,
    onChangeCategory,
    onPreview,
    onApply,
}: {
    scope: BulkScope;
    percent: string;
    system: string;
    category: string;
    systems: string[];
    categories: string[];
    selectedCount: number;
    previewRows: BulkPreviewRow[];
    previewOpen: boolean;
    saving: boolean;
    canManage: boolean;
    onChangeScope: (scope: BulkScope) => void;
    onChangePercent: (value: string) => void;
    onChangeSystem: (value: string) => void;
    onChangeCategory: (value: string) => void;
    onPreview: () => void;
    onApply: () => void;
}) {
    const { theme } = useTheme();
    const hiddenCount = Math.max(previewRows.length - 8, 0);

    return (
        <View style={toolPanelStyle}>
            <Text style={[toolPanelTitleStyle, { color: theme.colors.text }]}>Bulk Price Increase</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Positive numbers increase prices. Negative numbers decrease prices. Inactive items are skipped unless individually selected.
            </Text>

            <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Scope</Text>
            <View style={unitRowStyle}>
                <FilterButton label="All Active" active={scope === 'active'} onPress={() => onChangeScope('active')} />
                <FilterButton label="Current Filter" active={scope === 'filtered'} onPress={() => onChangeScope('filtered')} />
                <FilterButton label="Selected System" active={scope === 'system'} onPress={() => onChangeScope('system')} />
                <FilterButton label="Selected Category" active={scope === 'category'} onPress={() => onChangeScope('category')} />
                <FilterButton label={`Selected Items (${selectedCount})`} active={scope === 'selected'} onPress={() => onChangeScope('selected')} />
            </View>

            {scope === 'system' && (
                <>
                    <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>System</Text>
                    <View style={unitRowStyle}>
                        {systems.map((systemName) => (
                            <FilterButton key={systemName} label={systemName} active={system === systemName} onPress={() => onChangeSystem(systemName)} />
                        ))}
                    </View>
                </>
            )}

            {scope === 'category' && (
                <>
                    <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Category</Text>
                    <View style={unitRowStyle}>
                        {categories.map((categoryName) => (
                            <FilterButton key={categoryName} label={categoryName} active={category === categoryName} onPress={() => onChangeCategory(categoryName)} />
                        ))}
                    </View>
                </>
            )}

            <View style={editorGridStyle}>
                <EditorField
                    label="Percentage Change"
                    value={percent}
                    onChangeText={onChangePercent}
                    keyboardType="decimal-pad"
                />
            </View>

            <View style={editorActionRowStyle}>
                <ThemedButton
                    title="Preview Changes"
                    disabled={!canManage || saving}
                    onPress={onPreview}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                {previewOpen && (
                    <ThemedButton
                        title={saving ? 'Applying...' : 'Apply Bulk Update'}
                        disabled={!canManage || saving || previewRows.length === 0}
                        onPress={onApply}
                        style={compactButtonStyle}
                        textStyle={compactButtonTextStyle}
                    />
                )}
            </View>

            {previewOpen && (
                <View style={previewListStyle}>
                    {previewRows.slice(0, 8).map((row) => (
                        <View key={row.item.price_key} style={[previewRowStyle, { borderColor: theme.colors.border }]}>
                            <Text style={[previewNameStyle, { color: theme.colors.text }]} numberOfLines={1}>{row.item.name}</Text>
                            <Text style={[previewPriceStyle, { color: theme.colors.mutedText }]}>
                                {formatPrice(row.oldPrice)} to {formatPrice(row.newPrice)}
                            </Text>
                            <Text style={[previewDeltaStyle, { color: row.difference >= 0 ? '#0A7A3D' : '#B42318' }]}>
                                {row.difference >= 0 ? '+' : ''}{formatPrice(row.difference)} / {row.percentChange.toFixed(1)}%
                            </Text>
                        </View>
                    ))}
                    {hiddenCount > 0 && (
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            +{hiddenCount} more preview rows.
                        </Text>
                    )}
                </View>
            )}
        </View>
    );
}

function MarginCalculatorTool({
    form,
    result,
    selectedCount,
    saving,
    canManage,
    onChange,
    onApplyToEditor,
    onApplyToSelected,
}: {
    form: CalculatorForm;
    result: CalculatorResult;
    selectedCount: number;
    saving: boolean;
    canManage: boolean;
    onChange: (patch: Partial<CalculatorForm>) => void;
    onApplyToEditor: () => void;
    onApplyToSelected: () => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={toolPanelStyle}>
            <Text style={[toolPanelTitleStyle, { color: theme.colors.text }]}>Margin / Markup Calculator</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Markup adds a percentage to cost. Margin sets gross profit as a percentage of selling price.
            </Text>

            <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Mode</Text>
            <View style={unitRowStyle}>
                <FilterButton label="Markup Mode" active={form.mode === 'markup'} onPress={() => onChange({ mode: 'markup' })} />
                <FilterButton label="Margin Mode" active={form.mode === 'margin'} onPress={() => onChange({ mode: 'margin' })} />
            </View>

            <View style={editorGridStyle}>
                <EditorField label="Material Cost" value={form.materialCost} onChangeText={(value) => onChange({ materialCost: value })} keyboardType="decimal-pad" />
                <EditorField label="Labor Hours" value={form.laborHours} onChangeText={(value) => onChange({ laborHours: value })} keyboardType="decimal-pad" />
                <EditorField label="Labor Rate" value={form.laborRate} onChangeText={(value) => onChange({ laborRate: value })} keyboardType="decimal-pad" />
                <EditorField label="Markup %" value={form.markupPercent} onChangeText={(value) => onChange({ markupPercent: value })} keyboardType="decimal-pad" />
                <EditorField label="Profit Margin %" value={form.marginPercent} onChangeText={(value) => onChange({ marginPercent: value })} keyboardType="decimal-pad" />
                <EditorField label="Overhead %" value={form.overheadPercent} onChangeText={(value) => onChange({ overheadPercent: value })} keyboardType="decimal-pad" />
                <EditorField label="Minimum Price" value={form.minimumPrice} onChangeText={(value) => onChange({ minimumPrice: value })} keyboardType="decimal-pad" />
            </View>

            <View style={calculatorGridStyle}>
                <MiniMetric label="Total Cost" value={result.valid ? formatPrice(result.totalCost) : 'Needs input'} />
                <MiniMetric label="Suggested Price" value={result.valid ? formatPrice(result.suggestedPrice) : 'Needs input'} />
                <MiniMetric label="Gross Profit" value={result.valid ? formatPrice(result.grossProfit) : 'Needs input'} />
                <MiniMetric label="Gross Margin" value={result.valid ? `${result.grossMargin.toFixed(1)}%` : 'Needs input'} />
                <MiniMetric label="Markup" value={result.valid ? `${result.markup.toFixed(1)}%` : 'Needs input'} />
            </View>

            {!result.valid && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{result.error}</Text>
            )}

            <View style={editorActionRowStyle}>
                <ThemedButton
                    title="Apply to Current Item"
                    disabled={!canManage || saving || !result.valid}
                    onPress={onApplyToEditor}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                <ThemedButton
                    title={`Apply to Selected (${selectedCount})`}
                    variant="secondary"
                    disabled={!canManage || saving || !result.valid || selectedCount === 0}
                    onPress={onApplyToSelected}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
            </View>
        </View>
    );
}

function AiResearchTool({
    form,
    items,
    canManage,
    researching,
    onChange,
    onResearch,
}: {
    form: ResearchForm;
    items: CompanyPriceBookItem[];
    canManage: boolean;
    researching: boolean;
    onChange: (patch: Partial<ResearchForm>) => void;
    onResearch: () => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={toolPanelStyle}>
            <Text style={[toolPanelTitleStyle, { color: theme.colors.text }]}>AI Price Research</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                AI runs server-side through Supabase. This first version creates AI-assisted estimates from provided context, not live online market research.
            </Text>

            <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Research Scope</Text>
            <View style={unitRowStyle}>
                <FilterButton label="One Item" active={form.scope === 'one_item'} onPress={() => onChange({ scope: 'one_item' })} />
                <FilterButton label="Current System" active={form.scope === 'current_system'} onPress={() => onChange({ scope: 'current_system' })} />
                <FilterButton label="Filtered List" active={form.scope === 'filtered_list'} onPress={() => onChange({ scope: 'filtered_list' })} />
                <FilterButton label="All Unpriced" active={form.scope === 'all_unpriced'} onPress={() => onChange({ scope: 'all_unpriced' })} />
            </View>

            {form.scope === 'one_item' && (
                <>
                    <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Item</Text>
                    <View style={unitRowStyle}>
                        {items.slice(0, 10).map((item) => (
                            <FilterButton
                                key={item.price_key}
                                label={item.name}
                                active={form.itemKey === item.price_key}
                                onPress={() => onChange({ itemKey: item.price_key, trade: item.system })}
                            />
                        ))}
                    </View>
                </>
            )}

            <View style={editorGridStyle}>
                <EditorField label="Service Area / ZIP Code" value={form.serviceArea} onChangeText={(value) => onChange({ serviceArea: value })} />
                <EditorField label="Trade / Category" value={form.trade} onChangeText={(value) => onChange({ trade: value })} />
                <EditorField label="Target Margin %" value={form.targetMargin} onChangeText={(value) => onChange({ targetMargin: value })} keyboardType="decimal-pad" />
                <EditorField label="Notes" value={form.notes} onChangeText={(value) => onChange({ notes: value })} multiline />
            </View>

            <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Positioning</Text>
            <View style={unitRowStyle}>
                <FilterButton label="Budget" active={form.positioning === 'budget'} onPress={() => onChange({ positioning: 'budget' })} />
                <FilterButton label="Market Average" active={form.positioning === 'market average'} onPress={() => onChange({ positioning: 'market average' })} />
                <FilterButton label="Premium" active={form.positioning === 'premium'} onPress={() => onChange({ positioning: 'premium' })} />
            </View>

            <View style={editorActionRowStyle}>
                <ThemedButton
                    title={researching ? 'Researching...' : 'Research Pricing with AI'}
                    disabled={!canManage || researching}
                    onPress={onResearch}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
            </View>
        </View>
    );
}

function SuggestionReviewSection({
    suggestions,
    onApply,
    onDismiss,
    canManage,
}: {
    suggestions: PriceSuggestion[];
    onApply: (suggestion: PriceSuggestion) => void;
    onDismiss: (suggestionId: string) => void;
    canManage: boolean;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={sectionCardStyle}>
            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Suggested Price Review</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                AI or calculator suggestions appear here for manual review. Applying a suggestion updates one price item.
            </Text>

            {suggestions.length === 0 ? (
                <View style={[emptySuggestionStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        No price suggestions yet. AI research is waiting for a server-side relay.
                    </Text>
                </View>
            ) : (
                <View style={suggestionGridStyle}>
                    {suggestions.map((suggestion) => (
                        <View key={suggestion.id} style={[suggestionCardStyle, { borderColor: theme.colors.border }]}>
                            <Text style={[itemTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                                {suggestion.itemName}
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Current: {formatPrice(suggestion.currentPrice)} / Suggested: {formatPrice(suggestion.suggestedPrice)}
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Low/Average/High: {formatPrice(suggestion.lowPrice)} / {formatPrice(suggestion.averagePrice)} / {formatPrice(suggestion.highPrice)}
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Confidence: {suggestion.confidence} / Sources: {suggestion.sourceCount}
                            </Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{suggestion.reasoningSummary || suggestion.notes}</Text>
                            {suggestion.assumptions.length > 0 && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Assumptions: {suggestion.assumptions.slice(0, 2).join(' / ')}
                                </Text>
                            )}
                            {suggestion.cautionNotes.length > 0 && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Caution: {suggestion.cautionNotes.slice(0, 2).join(' / ')}
                                </Text>
                            )}
                            {suggestion.sourceNotes.length > 0 && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Source notes: {suggestion.sourceNotes.slice(0, 2).join(' / ')}
                                </Text>
                            )}
                            <View style={itemActionRowStyle}>
                                <ThemedButton
                                    title={suggestion.applyAllowed ? 'Apply' : 'Review Only'}
                                    disabled={!canManage || !suggestion.applyAllowed}
                                    onPress={() => onApply(suggestion)}
                                    style={compactButtonStyle}
                                    textStyle={compactButtonTextStyle}
                                />
                                <ThemedButton
                                    title="Dismiss"
                                    variant="secondary"
                                    onPress={() => onDismiss(suggestion.id)}
                                    style={compactButtonStyle}
                                    textStyle={compactButtonTextStyle}
                                />
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </ThemedCard>
    );
}

function EditorPercentTool({
    currentPrice,
    onApply,
}: {
    currentPrice: string;
    onApply: (nextPrice: string) => void;
}) {
    const [percent, setPercent] = useState('8');
    const parsedPrice = parseOptionalNumber(currentPrice);
    const parsedPercent = parseOptionalNumber(percent);
    const canApply = parsedPrice !== null && parsedPercent !== null;
    const nextPrice = canApply ? Math.max(0, parsedPrice * (1 + parsedPercent / 100)) : null;

    return (
        <View style={editorPercentWrapStyle}>
            <EditorField
                label="Apply % Increase"
                value={percent}
                onChangeText={setPercent}
                keyboardType="decimal-pad"
            />
            <ThemedButton
                title={nextPrice === null ? 'Apply %' : `Apply ${formatPrice(nextPrice)}`}
                variant="secondary"
                disabled={!canApply}
                onPress={() => {
                    if (nextPrice !== null) onApply(nextPrice.toFixed(2));
                }}
                style={compactButtonStyle}
                textStyle={compactButtonTextStyle}
            />
        </View>
    );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View style={[miniMetricStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
            <Text style={[summaryLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[miniMetricValueStyle, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
        </View>
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

function getResearchItems(
    displayItems: CompanyPriceBookItem[],
    filteredItems: CompanyPriceBookItem[],
    form: ResearchForm,
    selectedSystem: string
) {
    if (form.scope === 'one_item') {
        const explicitItem = displayItems.find((item) => item.price_key === form.itemKey);

        return explicitItem ? [explicitItem] : filteredItems.slice(0, 1);
    }

    if (form.scope === 'current_system') {
        const systemName = selectedSystem || form.trade;
        const systemItems = displayItems.filter((item) => item.active && item.system === systemName);

        return systemItems.length ? systemItems : filteredItems.filter((item) => item.active);
    }

    if (form.scope === 'all_unpriced') {
        return displayItems.filter((item) => item.active && item.base_price === null);
    }

    return filteredItems.filter((item) => item.active);
}

function toAiResearchItemPayload(item: CompanyPriceBookItem) {
    return {
        price_key: item.price_key,
        name: item.name,
        system: item.system,
        category: item.category,
        current_price: item.base_price,
        unit: item.unit,
        labor_hours: item.labor_hours,
        material_cost: item.material_cost,
        notes: item.internal_notes || item.customer_description || null,
    };
}

function readAiSuggestions(data: unknown, items: CompanyPriceBookItem[]): PriceSuggestion[] {
    const record = isRecord(data) ? data : {};
    const rawSuggestions = Array.isArray(record.suggestions) ? record.suggestions : [];
    const itemByKey = new Map(items.map((item) => [item.price_key, item]));

    return rawSuggestions
        .map((value) => readAiSuggestion(value, itemByKey))
        .filter((suggestion): suggestion is PriceSuggestion => Boolean(suggestion));
}

function readAiSuggestion(value: unknown, itemByKey: Map<string, CompanyPriceBookItem>): PriceSuggestion | null {
    if (!isRecord(value)) return null;

    const suggestion = value as AiResearchSuggestionRecord;
    const priceKey = readString(suggestion.item_key);
    const item = itemByKey.get(priceKey);
    const recommendedPrice = readNullableNumber(suggestion.recommended_price);

    if (!priceKey || recommendedPrice === null) return null;

    const sourceNotes = readStringArray(suggestion.source_notes);
    const cautionNotes = readStringArray(suggestion.caution_notes);
    const assumptions = readStringArray(suggestion.assumptions);
    const reasoningSummary = readString(suggestion.reasoning_summary);

    return {
        id: `ai-${priceKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        priceKey,
        itemName: readString(suggestion.name) || item?.name || 'Price book item',
        currentPrice: item?.base_price ?? null,
        suggestedPrice: recommendedPrice,
        lowPrice: readNullableNumber(suggestion.suggested_low_price),
        averagePrice: readNullableNumber(suggestion.suggested_average_price),
        highPrice: readNullableNumber(suggestion.suggested_high_price),
        confidence: readConfidence(suggestion.confidence),
        sourceCount: sourceNotes.length,
        notes: reasoningSummary || 'AI-assisted price suggestion.',
        reasoningSummary,
        assumptions,
        cautionNotes,
        sourceNotes,
        applyAllowed: suggestion.apply_allowed === true && recommendedPrice > 0,
        createdAt: new Date().toISOString(),
    };
}

function mergeSuggestions(current: PriceSuggestion[], next: PriceSuggestion[]) {
    const nextKeys = new Set(next.map((suggestion) => suggestion.priceKey));

    return [
        ...next,
        ...current.filter((suggestion) => !nextKeys.has(suggestion.priceKey)),
    ];
}

function buildBulkPreviewRows(
    displayItems: CompanyPriceBookItem[],
    filteredItems: CompanyPriceBookItem[],
    scope: BulkScope,
    selectedPriceKeys: string[],
    selectedSystem: string,
    selectedCategory: string,
    percentValue: number | null
): BulkPreviewRow[] {
    if (percentValue === null) return [];

    const scopedItems = getBulkScopedItems(
        displayItems,
        filteredItems,
        scope,
        selectedPriceKeys,
        selectedSystem,
        selectedCategory
    );

    return scopedItems
        .filter((item) => item.base_price !== null)
        .map((item) => {
            const oldPrice = item.base_price || 0;
            const newPrice = roundCurrency(Math.max(0, oldPrice * (1 + percentValue / 100)));

            return {
                item,
                oldPrice,
                newPrice,
                difference: roundCurrency(newPrice - oldPrice),
                percentChange: oldPrice === 0 ? 0 : ((newPrice - oldPrice) / oldPrice) * 100,
            };
        });
}

function getBulkScopedItems(
    displayItems: CompanyPriceBookItem[],
    filteredItems: CompanyPriceBookItem[],
    scope: BulkScope,
    selectedPriceKeys: string[],
    selectedSystem: string,
    selectedCategory: string
) {
    if (scope === 'selected') {
        return displayItems.filter((item) => selectedPriceKeys.includes(item.price_key));
    }

    if (scope === 'filtered') {
        return filteredItems.filter((item) => item.active);
    }

    if (scope === 'system') {
        return displayItems.filter((item) => item.active && item.system === selectedSystem);
    }

    if (scope === 'category') {
        return displayItems.filter((item) => item.active && item.category === selectedCategory);
    }

    return displayItems.filter((item) => item.active);
}

function calculatePrice(form: CalculatorForm): CalculatorResult {
    const materialCost = parseOptionalNumber(form.materialCost) || 0;
    const laborHours = parseOptionalNumber(form.laborHours) || 0;
    const laborRate = parseOptionalNumber(form.laborRate) || 0;
    const overheadPercent = parseOptionalNumber(form.overheadPercent) || 0;
    const minimumPrice = parseOptionalNumber(form.minimumPrice) || 0;
    const laborCost = laborHours * laborRate;
    const baseCost = materialCost + laborCost;
    const overheadCost = baseCost * (overheadPercent / 100);
    const totalCost = baseCost + overheadCost;

    if (totalCost <= 0) {
        return invalidCalculatorResult('Add material cost, labor hours, or labor rate to calculate price.');
    }

    let suggestedPrice = 0;

    if (form.mode === 'markup') {
        const markupPercent = parseOptionalNumber(form.markupPercent);

        if (markupPercent === null) return invalidCalculatorResult('Enter a markup percent.');
        suggestedPrice = totalCost * (1 + markupPercent / 100);
    } else {
        const marginPercent = parseOptionalNumber(form.marginPercent);

        if (marginPercent === null) return invalidCalculatorResult('Enter a desired margin percent.');
        if (marginPercent >= 100) return invalidCalculatorResult('Margin must be less than 100%.');
        suggestedPrice = totalCost / (1 - marginPercent / 100);
    }

    suggestedPrice = roundCurrency(Math.max(suggestedPrice, minimumPrice));
    const grossProfit = roundCurrency(suggestedPrice - totalCost);
    const grossMargin = suggestedPrice <= 0 ? 0 : (grossProfit / suggestedPrice) * 100;
    const markup = totalCost <= 0 ? 0 : (grossProfit / totalCost) * 100;

    return {
        materialCost: roundCurrency(materialCost),
        laborCost: roundCurrency(laborCost),
        overheadCost: roundCurrency(overheadCost),
        totalCost: roundCurrency(totalCost),
        suggestedPrice,
        grossProfit,
        grossMargin,
        markup,
        valid: true,
        error: '',
    };
}

function invalidCalculatorResult(error: string): CalculatorResult {
    return {
        materialCost: 0,
        laborCost: 0,
        overheadCost: 0,
        totalCost: 0,
        suggestedPrice: 0,
        grossProfit: 0,
        grossMargin: 0,
        markup: 0,
        valid: false,
        error,
    };
}

function systemHasPricedItems(items: CompanyPriceBookItem[], system: string) {
    return items.some((item) => item.system === system && item.base_price !== null && item.active);
}

function emptyCalculatorForm(): CalculatorForm {
    return {
        materialCost: '',
        laborHours: '',
        laborRate: '125',
        markupPercent: '35',
        marginPercent: '45',
        overheadPercent: '10',
        minimumPrice: '',
        mode: 'markup',
    };
}

function emptyResearchForm(): ResearchForm {
    return {
        scope: 'all_unpriced',
        itemKey: '',
        serviceArea: '',
        trade: 'Plumbing',
        positioning: 'market average',
        targetMargin: '',
        notes: '',
    };
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
    if (value < 0) return `-$${Math.abs(value).toFixed(2)}`;

    return `$${value.toFixed(2)}`;
}

function formatDateTime(value: string | null) {
    if (!value) return 'Not available';

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function toApiPositioning(value: Positioning) {
    return value === 'market average' ? 'market_average' : value;
}

function readFunctionErrorMessage(error: unknown, data: unknown) {
    const dataMessage = isRecord(data) ? readString(data.message) : '';

    if (dataMessage) return dataMessage;
    if (error instanceof Error) return error.message;
    if (isRecord(error)) return readString(error.message) || 'Price research function failed.';

    return 'Price research function failed.';
}

function readConfidence(value: unknown): PriceSuggestion['confidence'] {
    const confidence = readString(value).toLowerCase();

    if (confidence === 'medium' || confidence === 'high') return confidence;

    return 'low';
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;

    const parsed = Number.parseFloat(value.trim());

    return Number.isFinite(parsed) ? parsed : null;
}

function readStringArray(value: unknown) {
    return Array.isArray(value)
        ? value.map(readString).filter(Boolean).slice(0, 8)
        : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

const toolGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 14,
};

const toolCardStyle = {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    width: 180,
    minHeight: 118,
};

const toolTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
    lineHeight: 20,
};

const toolDescriptionStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 17,
    marginTop: 8,
};

const toolPanelStyle = {
    borderRadius: 16,
    marginTop: 14,
    paddingTop: 4,
};

const toolPanelTitleStyle = {
    fontSize: 17,
    fontWeight: '900' as const,
    marginTop: 8,
};

const previewListStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const previewRowStyle = {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    width: 220,
};

const previewNameStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const previewPriceStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    marginTop: 5,
};

const previewDeltaStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    marginTop: 5,
};

const calculatorGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const miniMetricStyle = {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    width: 142,
    minHeight: 76,
};

const miniMetricValueStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    marginTop: 6,
};

const emptySuggestionStyle = {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
    alignSelf: 'flex-start' as const,
    maxWidth: 520,
};

const suggestionGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 12,
};

const suggestionCardStyle = {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    width: 260,
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

const editorToolRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-end' as const,
    gap: 10,
    marginTop: 8,
};

const editorPercentWrapStyle = {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 8,
    flexWrap: 'wrap' as const,
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
