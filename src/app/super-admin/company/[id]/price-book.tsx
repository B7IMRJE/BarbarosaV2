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
import {
    plumbingPriceBookAreaNames,
    plumbingPriceBookCatalog,
    plumbingPriceBookCatalogItems,
    plumbingPriceBookCategories,
    type PlumbingPriceBookCatalogItem,
} from '../../../../lib/plumbingPriceBookCatalog';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type CompanyRecord = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
    service_categories: string[] | null;
};

type PriceBookView = 'systems' | 'system' | 'area' | 'detail' | 'items' | 'advanced' | 'custom';
type PriceTool = 'ai' | 'bulk' | 'calculator' | 'import' | null;
type BulkScope = 'active' | 'filtered' | 'system' | 'category' | 'selected';
type ActiveFilter = 'all' | 'active' | 'inactive';
type PricingMode = 'markup' | 'margin';
type Positioning = 'budget' | 'market average' | 'premium';
type AiResearchStatusKind = 'idle' | 'loading' | 'success' | 'function_error' | 'network_error' | 'auth_error' | 'warning';
type ResearchServiceType =
    | 'diagnostic'
    | 'repair'
    | 'maintenance'
    | 'installation'
    | 'replacement'
    | 'inspection'
    | 'emergency'
    | 'code upgrade'
    | 'other';
type ResearchTradeCategory =
    | 'Plumbing'
    | 'Drain/Sewer'
    | 'Water Heater'
    | 'Gas'
    | 'HVAC'
    | 'Electrical'
    | 'Appliance'
    | 'Water Quality'
    | 'Exterior'
    | 'Other';
type ResearchYesNo = 'unspecified' | 'yes' | 'no';

type EditorForm = {
    id?: string;
    priceKey: string;
    name: string;
    system: string;
    area: string;
    category: string;
    unit: CompanyPriceBookUnit;
    basePrice: string;
    laborHours: string;
    materialCost: string;
    linearFootPrice: string;
    packageDiscountPercent: string;
    packageDiscountNote: string;
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
    missingInfoQuestions: string[];
    belowCompanyMinimum: boolean;
    adjustedRecommendation: number | null;
    companyMinimumPrice: number | null;
    customDraft?: CompanyPriceBookDraft;
    createdAt: string;
};

type AiResearchStatus = {
    kind: AiResearchStatusKind;
    message: string;
    debugSummary: string;
};

type AiSuggestionReadResult =
    | { ok: true; suggestions: PriceSuggestion[] }
    | { ok: false; message: string; debugSummary: string };

type AiResearchFunctionError = {
    ok: false;
    code: string;
    stage: string;
    message: string;
    detail: string;
};

type CompanyIdResolution = {
    routeCompanyId: string;
    loadedCompanyId: string;
    finalCompanyId: string;
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
    missing_info_questions?: unknown;
    below_company_minimum?: unknown;
    adjusted_recommendation?: unknown;
    company_minimum_price?: unknown;
};

type PriceBookPricingDetails = {
    linearFootPrice: string;
    packageDiscountPercent: string;
    packageDiscountNote: string;
};

type PriceResearchImportColumn =
    | 'price_key'
    | 'service_name'
    | 'name'
    | 'system'
    | 'area'
    | 'category'
    | 'unit'
    | 'market_low'
    | 'market_average'
    | 'market_high'
    | 'recommended_price'
    | 'base_price'
    | 'material_cost'
    | 'labor_hours'
    | 'linear_foot_price'
    | 'package_discount_percent'
    | 'package_discount_note'
    | 'customer_description'
    | 'internal_notes'
    | 'source_notes';

type PriceResearchImportValues = Partial<Record<PriceResearchImportColumn, string>>;
type PriceResearchImportStatus = 'matched' | 'new_item' | 'needs_review';

type PriceResearchImportRow = {
    id: string;
    rowNumber: number;
    values: PriceResearchImportValues;
    matchedItem: CompanyPriceBookItem | null;
    draft: CompanyPriceBookDraft;
    status: PriceResearchImportStatus;
    marketLow: number | null;
    marketAverage: number | null;
    marketHigh: number | null;
    importedPrice: number | null;
    sourceNotes: string;
    matchSummary: string;
};

type ParsedPriceResearchImportRow = {
    rowNumber: number;
    values: PriceResearchImportValues;
};

type PriceResearchImportMatch = {
    item: CompanyPriceBookItem;
    reason: string;
};

type ResearchForm = {
    scope: 'one_item' | 'custom_item' | 'current_system' | 'filtered_list' | 'all_unpriced';
    itemKey: string;
    itemSearch: string;
    customName: string;
    customSystem: string;
    customCategory: string;
    customServiceType: ResearchServiceType;
    customUnit: CompanyPriceBookUnit;
    customNotes: string;
    waterHeaterKind: string;
    waterHeaterGallons: string;
    waterHeaterInstallScope: string;
    permitIncluded: ResearchYesNo;
    haulAwayIncluded: ResearchYesNo;
    expansionTankIncluded: ResearchYesNo;
    codeUpgradesIncluded: ResearchYesNo;
    accessDifficulty: string;
    serviceArea: string;
    trade: ResearchTradeCategory;
    positioning: Positioning;
    targetMargin: string;
    minimumPrice: string;
    laborRate: string;
    estimatedLaborHours: string;
    materialCost: string;
    overheadPercent: string;
    notes: string;
};

const PLUMBING_SYSTEM = 'Plumbing';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UUID_SUBSTRING_PATTERN =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const researchSystemOptions = [
    { label: 'Water Service', value: 'Water Service' },
    { label: 'Drain / Sewer', value: 'Drain / Sewer' },
    { label: 'Gas Service', value: 'Gas Service' },
    { label: 'Water Quality', value: 'Water Quality' },
    { label: 'Diagnostics / Inspections', value: 'Diagnostics / Inspections' },
    { label: 'Emergency / After Hours', value: 'Emergency / After Hours' },
];

const researchTradeOptions: ResearchTradeCategory[] = [
    'Plumbing',
    'Drain/Sewer',
    'Water Heater',
    'Gas',
    'Water Quality',
    'Other',
];

const researchServiceTypeOptions: ResearchServiceType[] = [
    'diagnostic',
    'repair',
    'maintenance',
    'installation',
    'replacement',
    'inspection',
    'emergency',
    'code upgrade',
    'other',
];

const yesNoOptions: Array<{ label: string; value: ResearchYesNo }> = [
    { label: 'Not Set', value: 'unspecified' },
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
];

const areaNotePattern = /\[area:\s*([^\]]+)\]/i;
const linearFootPriceNotePattern = /\[linear foot price:\s*([^\]]+)\]/i;
const packageDiscountPercentNotePattern = /\[package discount percent:\s*([^\]]+)\]/i;
const packageDiscountNotePattern = /\[package discount note:\s*([^\]]+)\]/i;
const priceResearchImportColumns: PriceResearchImportColumn[] = [
    'price_key',
    'service_name',
    'name',
    'system',
    'area',
    'category',
    'unit',
    'market_low',
    'market_average',
    'market_high',
    'recommended_price',
    'base_price',
    'material_cost',
    'labor_hours',
    'linear_foot_price',
    'package_discount_percent',
    'package_discount_note',
    'customer_description',
    'internal_notes',
    'source_notes',
];
const priceResearchImportColumnSet = new Set<string>(priceResearchImportColumns);

export default function CompanyPriceBookScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string | string[] }>();
    const companyId = normalizeCompanyIdInput(id);
    const companyRoute = `/super-admin/company/${encodeURIComponent(companyId)}`;
    const [company, setCompany] = useState<CompanyRecord | null>(null);
    const [items, setItems] = useState<CompanyPriceBookItem[]>([]);
    const [view, setView] = useState<PriceBookView>('systems');
    const [selectedSystem, setSelectedSystem] = useState('');
    const [selectedArea, setSelectedArea] = useState('');
    const [selectedPriceKey, setSelectedPriceKey] = useState('');
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [pricedFilter, setPricedFilter] = useState<'all' | 'priced' | 'not_priced'>('all');
    const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
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
    const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
    const [researching, setResearching] = useState(false);
    const [researchStatus, setResearchStatus] = useState<AiResearchStatus>(emptyAiResearchStatus());
    const [priceImportText, setPriceImportText] = useState('');
    const [priceImportRows, setPriceImportRows] = useState<PriceResearchImportRow[]>([]);

    useEffect(() => {
        void loadPriceBook();
    }, [companyId]);

    const companyName = getCompanyDisplayName(company);
    const displayItems = useMemo(() => buildDisplayItems(companyId, items), [companyId, items]);
    const selectedSystemNode = useMemo(
        () => plumbingPriceBookCatalog.find((system) => system.key === selectedSystem) || null,
        [selectedSystem]
    );
    const selectedSystemItems = useMemo(
        () => selectedSystemNode ? displayItems.filter((item) => item.system === selectedSystemNode.label) : [],
        [displayItems, selectedSystemNode]
    );
    const areaCards = useMemo(() => buildPriceBookAreaCards(selectedSystemItems), [selectedSystemItems]);
    const selectedAreaItems = useMemo(
        () => filterPriceBookItemsByArea(selectedSystemItems, selectedArea),
        [selectedSystemItems, selectedArea]
    );
    const selectedItem = useMemo(
        () => displayItems.find((item) => item.price_key === selectedPriceKey) || null,
        [displayItems, selectedPriceKey]
    );
    const editorPreviewItem = useMemo(
        () => buildEditorPreviewItem(companyId, editorForm),
        [companyId, editorForm]
    );
    const allFilteredItems = useMemo(
        () => filterPriceBookItems(displayItems, search, categoryFilter, pricedFilter, activeFilter),
        [displayItems, search, categoryFilter, pricedFilter, activeFilter]
    );
    const filteredItems = allFilteredItems;
    const visibleItems = filteredItems;
    const pricedCount = displayItems.filter((item) => item.base_price !== null).length;
    const activeCount = displayItems.filter((item) => item.active).length;
    const systems = useMemo(() => uniqueStrings(displayItems.map((item) => item.system)), [displayItems]);
    const categories = useMemo(() => uniqueStrings([...plumbingPriceBookCategories, ...displayItems.map((item) => item.category)]), [displayItems]);
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

    function openAllItems() {
        setSelectedSystem('');
        setSelectedArea('');
        setSelectedPriceKey('');
        setCategoryFilter('');
        setActiveFilter('active');
        setView('items');
        setEditorOpen(false);
        setSearch('');
    }

    function openSystems() {
        setSelectedSystem('');
        setSelectedArea('');
        setSelectedPriceKey('');
        setView('systems');
        setEditorOpen(false);
        setSearch('');
    }

    function openSystem(systemKey: string) {
        setSelectedSystem(systemKey);
        setSelectedArea('');
        setSelectedPriceKey('');
        setView('system');
        setEditorOpen(false);
        setSearch('');
    }

    function openArea(areaName: string) {
        setSelectedArea(areaName);
        setSelectedPriceKey('');
        setView('area');
        setEditorOpen(false);
        setSearch('');
    }

    function openPriceBookItem(item: CompanyPriceBookItem) {
        const systemKey = getCatalogSystemKeyForItem(item);

        if (systemKey) {
            setSelectedSystem(systemKey);
        }

        setSelectedArea(getPriceBookItemArea(item));
        setSelectedPriceKey(item.price_key);
        setView('detail');
        setEditorOpen(false);
        setMessage('');
    }

    function editItem(item: CompanyPriceBookItem) {
        const pricingDetails = getPriceBookPricingDetails(item);
        const systemKey = getCatalogSystemKeyForItem(item);

        if (systemKey) {
            setSelectedSystem(systemKey);
        }

        setSelectedArea(getPriceBookItemArea(item));
        setSelectedPriceKey(item.price_key);
        setView('detail');

        setEditorForm({
            id: item.source === 'backend' || item.source === 'local' ? item.id : undefined,
            priceKey: item.price_key,
            name: item.name,
            system: item.system,
            area: getPriceBookItemArea(item),
            category: item.category,
            unit: item.unit,
            basePrice: item.base_price === null ? '' : String(item.base_price),
            laborHours: item.labor_hours === null ? '' : String(item.labor_hours),
            materialCost: item.material_cost === null ? '' : String(item.material_cost),
            linearFootPrice: pricingDetails.linearFootPrice,
            packageDiscountPercent: pricingDetails.packageDiscountPercent,
            packageDiscountNote: pricingDetails.packageDiscountNote,
            customerDescription: item.customer_description || '',
            internalNotes: removePriceBookMetadataFromNotes(item.internal_notes || ''),
            active: item.active,
        });
        setEditorOpen(true);
        setMessage(`Editing: ${item.name}`);
    }

    function addCustomItem() {
        setEditorForm(emptyEditorForm({
            system: PLUMBING_SYSTEM,
            category: categoryFilter || 'Other Plumbing',
            area: '',
        }));
        setView('custom');
        setEditorOpen(true);
        setMessage('');
    }

    function addCustomSystemItem() {
        setEditorForm(emptyEditorForm({
            system: PLUMBING_SYSTEM,
            category: categoryFilter || 'Other Plumbing',
            area: '',
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
                internal_notes: mergePriceBookMetadataIntoNotes(editorForm.internalNotes, editorForm),
                active: editorForm.active,
            };
            const result = await upsertCompanyPriceBookItem(companyId, draft);
            const refreshed = await loadCompanyPriceBook(companyId);

            setItems(refreshed.items);
            setBackendStatusMessage(refreshed.backendStatus.message || result.backendStatus.message);
            setMessage(result.backendStatus.status === 'connected'
                ? 'Price book item saved.'
                : 'Price book backend unavailable: using local price book draft'
            );
            setEditorOpen(false);
            setSelectedPriceKey(draft.price_key);
            setView('detail');
        } catch (error) {
            setMessage(`Save price failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    function previewPriceResearchImport() {
        try {
            const importRows = buildPriceResearchImportRows(companyId, priceImportText, displayItems);
            const matchedCount = importRows.filter((row) => row.status === 'matched').length;
            const newItemCount = importRows.filter((row) => row.status === 'new_item').length;
            const needsReviewCount = importRows.filter((row) => row.status === 'needs_review').length;

            setPriceImportRows(importRows);
            setMessage(`Imported ${importRows.length} price rows for review. Matched: ${matchedCount}. New: ${newItemCount}. Needs review: ${needsReviewCount}.`);
        } catch (error) {
            setPriceImportRows([]);
            setMessage(`Price sheet import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async function applyPriceImportRow(row: PriceResearchImportRow) {
        if (!manageAccess) {
            setMessage('Only company owners, admins, managers, or platform admins can apply imported pricing.');
            return;
        }

        if (row.status === 'needs_review') {
            setMessage('Review or edit this imported row before saving it.');
            return;
        }

        setSaving(true);
        setMessage(row.status === 'new_item' ? 'Creating imported price item...' : 'Applying imported price...');

        try {
            const result = await upsertCompanyPriceBookItem(companyId, row.draft);
            const refreshed = await loadCompanyPriceBook(companyId);

            setItems(refreshed.items);
            setBackendStatusMessage(refreshed.backendStatus.message || result.backendStatus.message);
            setPriceImportRows((current) => current.filter((candidate) => candidate.id !== row.id));
            setSelectedPriceKey(row.draft.price_key);
            setMessage(result.backendStatus.status === 'connected'
                ? row.status === 'new_item' ? 'Imported price item created.' : 'Imported price applied.'
                : 'Price book backend unavailable: using local price book draft'
            );
        } catch (error) {
            setMessage(`Import save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    async function applyAllMatchedPriceImportRows() {
        if (!manageAccess) {
            setMessage('Only company owners, admins, managers, or platform admins can apply imported pricing.');
            return;
        }

        const matchedRows = priceImportRows.filter((row) => row.status === 'matched');

        if (matchedRows.length === 0) {
            setMessage('No matched imported rows are ready to apply.');
            return;
        }

        setSaving(true);
        setMessage(`Applying ${matchedRows.length} matched imported price rows...`);

        try {
            for (const row of matchedRows) {
                await upsertCompanyPriceBookItem(companyId, row.draft);
            }

            const refreshed = await loadCompanyPriceBook(companyId);
            const matchedIds = new Set(matchedRows.map((row) => row.id));

            setItems(refreshed.items);
            setBackendStatusMessage(refreshed.backendStatus.message);
            setPriceImportRows((current) => current.filter((row) => !matchedIds.has(row.id)));
            setMessage(refreshed.backendStatus.status === 'connected'
                ? `Applied ${matchedRows.length} matched imported price rows.`
                : 'Price book backend unavailable: using local price book draft'
            );
        } catch (error) {
            setMessage(`Import save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    function editPriceImportRowBeforeSave(row: PriceResearchImportRow) {
        const form = buildEditorFormFromImportRow(row);

        setEditorForm(form);
        setSelectedPriceKey(form.priceKey);

        if (row.matchedItem) {
            const systemKey = getCatalogSystemKeyForItem(row.matchedItem);

            if (systemKey) {
                setSelectedSystem(systemKey);
            }

            setSelectedArea(form.area || getPriceBookItemArea(row.matchedItem));
            setView('detail');
        } else {
            setView('custom');
        }

        setEditorOpen(true);
        setMessage(`Editing imported price before save: ${form.name}`);
    }

    function skipPriceImportRow(rowId: string) {
        setPriceImportRows((current) => current.filter((row) => row.id !== rowId));
        setMessage('Imported price row skipped.');
    }

    function clearPriceImport() {
        setPriceImportText('');
        setPriceImportRows([]);
        setMessage('Price sheet import cleared.');
    }

    function openAiResearchForItem(item: CompanyPriceBookItem) {
        editItem(item);
        setActiveTool('ai');
        setResearchForm((current) => ({
            ...current,
            scope: 'one_item',
            itemKey: item.price_key,
            itemSearch: item.name,
            trade: inferTradeCategory(item),
            customServiceType: inferServiceType(item.name),
        }));
        setMessage(`Selected for AI Research: ${item.name}`);
    }

    async function requestAiResearch() {
        if (!manageAccess) {
            const companyIdResolution = resolveAiCompanyId(company, companyId);
            setMessage('Only company owners, admins, managers, or platform admins can request AI price research.');
            setResearchStatus({
                kind: 'auth_error',
                message: 'Auth/session error: Only authorized company users can request AI price research.',
                debugSummary: buildAiRequestSummary(researchForm, 0, companyIdResolution, ''),
            });
            return;
        }

        setResearchStatus(emptyAiResearchStatus());
        const companyIdResolution = resolveAiCompanyId(company, companyId);
        const customResearchItem = researchForm.scope === 'custom_item'
            ? buildCustomResearchItem(companyIdResolution.finalCompanyId, researchForm)
            : null;
        const researchItems = customResearchItem
            ? [customResearchItem]
            : getResearchItems(displayItems, filteredItems, researchForm, selectedSystem);
        const requestSummary = buildAiRequestSummary(researchForm, researchItems.length, companyIdResolution, '');

        if (!isUuid(companyIdResolution.finalCompanyId)) {
            const invalidCompanyMessage = 'Company id is missing or invalid for AI price research.';
            setMessage(invalidCompanyMessage);
            setResearchStatus({
                kind: 'warning',
                message: invalidCompanyMessage,
                debugSummary: requestSummary,
            });
            return;
        }

        if (researchForm.scope === 'custom_item' && !customResearchItem) {
            const customMessage = 'Add a custom item or service name before researching.';
            setMessage(customMessage);
            setResearchStatus({
                kind: 'warning',
                message: customMessage,
                debugSummary: requestSummary,
            });
            return;
        }

        if (researchItems.length === 0) {
            const emptyMessage = getEmptyResearchItemsMessage(researchForm);
            setMessage(emptyMessage);
            setResearchStatus({
                kind: 'warning',
                message: emptyMessage,
                debugSummary: requestSummary,
            });
            return;
        }

        if (!researchForm.serviceArea.trim()) {
            setMessage('No service area entered. Results may be less specific.');
            setResearchStatus({
                kind: 'warning',
                message: 'No service area entered. Results may be less specific.',
                debugSummary: requestSummary,
            });
        }

        setResearching(true);
        setMessage('Researching pricing with AI...');
        setResearchStatus({
            kind: 'loading',
            message: 'Calling research-price-book...',
            debugSummary: requestSummary,
        });

        try {
            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError) {
                const authMessage = sessionError.message || 'Could not verify the current session.';
                setMessage(`Auth/session error: ${authMessage}`);
                setResearchStatus({
                    kind: 'auth_error',
                    message: `Auth/session error: ${authMessage}`,
                    debugSummary: '',
                });
                return;
            }

            if (!session) {
                setMessage('Sign in again before using AI Price Research.');
                setResearchStatus({
                    kind: 'auth_error',
                    message: 'Auth/session error: Sign in again before using AI Price Research.',
                    debugSummary: '',
                });
                return;
            }

            const payload = {
                company_id: companyIdResolution.finalCompanyId,
                company_name: companyName,
                service_area_zip: researchForm.serviceArea,
                city: researchForm.serviceArea,
                trade: researchForm.trade || selectedSystem || researchItems[0]?.system || 'Home service',
                service_type: researchForm.customServiceType,
                unit: researchForm.customUnit,
                pricing_positioning: toApiPositioning(researchForm.positioning),
                target_margin_percent: parseOptionalNumber(researchForm.targetMargin),
                company_minimum_price: parseOptionalNumber(researchForm.minimumPrice),
                labor_rate: parseOptionalNumber(researchForm.laborRate),
                estimated_labor_hours: parseOptionalNumber(researchForm.estimatedLaborHours),
                material_cost: parseOptionalNumber(researchForm.materialCost),
                overhead_percent: parseOptionalNumber(researchForm.overheadPercent),
                service_details: buildServiceDetails(researchForm),
                notes: researchForm.notes,
                items: researchItems.map(toAiResearchItemPayload),
            };
            const suggestionSourceItems = customResearchItem ? [customResearchItem, ...displayItems] : displayItems;
            const model = 'server configured';
            const outgoingSummary = buildAiRequestSummary(researchForm, payload.items.length, companyIdResolution, model);

            setResearchStatus({
                kind: 'loading',
                message: 'Calling research-price-book...',
                debugSummary: outgoingSummary,
            });

            const response = await fetch(`${supabaseUrl}/functions/v1/research-price-book`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: supabaseAnonKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const data = await readFunctionJson(response);

            if (!response.ok) {
                const functionMessage = formatFunctionError(data, response.status);
                setMessage(functionMessage);
                setResearchStatus({
                    kind: 'function_error',
                    message: functionMessage,
                    debugSummary: `${outgoingSummary}; ${safeDebugSummary(data)}`,
                });
                return;
            }

            const readResult = readAiSuggestions(data, suggestionSourceItems);

            if (!readResult.ok) {
                setMessage(readResult.message);
                setResearchStatus({
                    kind: 'function_error',
                    message: readResult.message,
                    debugSummary: readResult.debugSummary,
                });
                return;
            }

            const nextSuggestions = customResearchItem
                ? readResult.suggestions.map((suggestion) => attachCustomDraftToSuggestion(suggestion, customResearchItem))
                : readResult.suggestions;
            const guardedSuggestions = nextSuggestions.map((suggestion) => applyLocalPriceGuardrails(suggestion, researchForm));

            if (guardedSuggestions.length === 0) {
                setMessage('AI price research returned no suggestions. Try narrowing the scope or adding more item details.');
                setResearchStatus({
                    kind: 'success',
                    message: 'AI suggestions received.',
                    debugSummary: safeDebugSummary(data),
                });
                return;
            }

            setSuggestions((current) => mergeSuggestions(current, guardedSuggestions));
            setSuggestionsExpanded(true);
            setMessage('AI-assisted price suggestions are ready. Review carefully before applying.');
            setResearchStatus({
                kind: 'success',
                message: 'AI suggestions received.',
                debugSummary: `${outgoingSummary}; suggestions=${guardedSuggestions.length}`,
            });
        } catch (error) {
            const networkMessage = error instanceof Error ? error.message : 'Unknown network error';
            setMessage(`Network error: ${networkMessage}`);
            setResearchStatus({
                kind: 'network_error',
                message: `Network error: ${networkMessage}`,
                debugSummary: '',
            });
        } finally {
            setResearching(false);
        }
    }

    async function applySuggestion(suggestion: PriceSuggestion) {
        await applySuggestionAtPrice(suggestion, getSuggestionEffectivePrice(suggestion), 'Suggested price applied after review.');
    }

    async function applyCompanyMinimum(suggestion: PriceSuggestion) {
        const minimumPrice = suggestion.adjustedRecommendation ?? suggestion.companyMinimumPrice;

        if (minimumPrice === null) {
            setMessage('This suggestion does not include a company minimum adjustment.');
            return;
        }

        await applySuggestionAtPrice(suggestion, minimumPrice, 'Company minimum price applied after review.');
    }

    async function applySuggestionAtPrice(suggestion: PriceSuggestion, price: number, successMessage: string) {
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
                base_price: price,
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
            setMessage(successMessage);
        } catch (error) {
            setMessage(`Suggested price could not be applied: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    function editSuggestionBeforeSave(suggestion: PriceSuggestion) {
        const existingItem = displayItems.find((candidate) => candidate.price_key === suggestion.priceKey);
        const draft = suggestion.customDraft;
        const price = getSuggestionEffectivePrice(suggestion);

        if (draft) {
            const draftPricingDetails = getPriceBookPricingDetailsFromNotes(draft.internal_notes);

            setEditorForm({
                priceKey: draft.price_key,
                name: draft.name,
                system: draft.system,
                area: readAreaFromNotes(draft.internal_notes) || selectedArea || 'Other',
                category: draft.category,
                unit: draft.unit,
                basePrice: price.toFixed(2),
                laborHours: draft.labor_hours === null ? '' : String(draft.labor_hours),
                materialCost: draft.material_cost === null ? '' : String(draft.material_cost),
                linearFootPrice: draftPricingDetails.linearFootPrice,
                packageDiscountPercent: draftPricingDetails.packageDiscountPercent,
                packageDiscountNote: draftPricingDetails.packageDiscountNote,
                customerDescription: draft.customer_description || '',
                internalNotes: removePriceBookMetadataFromNotes(draft.internal_notes || ''),
                active: draft.active,
            });
            setView('custom');
            setEditorOpen(true);
            setMessage(`Editing before save: ${draft.name}`);
            return;
        }

        if (!existingItem) {
            setMessage('Suggested item is no longer visible in this price book.');
            return;
        }

        editItem(existingItem);
        setEditorForm((current) => ({
            ...current,
            basePrice: price.toFixed(2),
        }));
        setMessage(`Editing before save: ${existingItem.name}`);
    }

    async function createPriceBookItemFromSuggestion(suggestion: PriceSuggestion) {
        if (!manageAccess) {
            setMessage('Only company owners, admins, managers, or platform admins can create suggested price items.');
            return;
        }

        if (!suggestion.customDraft) {
            setMessage('This suggestion is linked to an existing price book item.');
            return;
        }

        setSaving(true);
        setMessage('Creating price book item from AI suggestion...');

        try {
            const result = await upsertCompanyPriceBookItem(companyId, {
                ...suggestion.customDraft,
                base_price: getSuggestionEffectivePrice(suggestion),
            });
            const refreshed = await loadCompanyPriceBook(companyId);

            setItems(refreshed.items);
            setSuggestions((current) => current.filter((entry) => entry.id !== suggestion.id));
            setBackendStatusMessage(result.backendStatus.message);
            setMessage('Custom price book item created from reviewed AI suggestion.');
        } catch (error) {
            setMessage(`Custom price item could not be created: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    function dismissSuggestion(suggestionId: string) {
        setSuggestions((current) => current.filter((suggestion) => suggestion.id !== suggestionId));
        setMessage('Price suggestion dismissed.');
    }

    function clearSuggestions() {
        setSuggestions([]);
        setSuggestionsExpanded(false);
        setMessage('Price suggestions cleared.');
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1180, minWidth: 0 }}>
                <AdminNavBar companyId={companyId} backFallback={companyRoute as never} />

                <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>ManagementOS / {companyName}</Text>
                <Text style={[titleStyle, { color: theme.colors.text }]}>Plumbing Price Book</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Company-owned plumbing pricing used for estimates and proposals.
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
                            <ThemedButton
                                title="Company Dashboard"
                                variant="secondary"
                                onPress={() => router.push(companyRoute as never)}
                                style={compactButtonStyle}
                                textStyle={compactButtonTextStyle}
                            />
                            <TabButton
                                active={view === 'systems' || view === 'system' || view === 'area' || view === 'detail'}
                                label="Systems"
                                onPress={openSystems}
                            />
                            <TabButton active={view === 'items'} label="All Items" onPress={openAllItems} />
                            <TabButton
                                active={view === 'advanced'}
                                label="Advanced Tools"
                                onPress={() => {
                                    setView('advanced');
                                    setEditorOpen(false);
                                }}
                            />
                        </View>

                        {view === 'systems' && (
                            <ThemedCard style={sectionCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Price Book Systems</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Choose a plumbing system to browse areas and priceable services.
                                </Text>
                                <View style={systemGridStyle}>
                                    {plumbingPriceBookCatalog.map((system) => {
                                        const systemItems = displayItems.filter((item) => item.system === system.label);
                                        const systemPriced = systemItems.filter((item) => item.base_price !== null).length;

                                        return (
                                            <SystemStatusCard
                                                key={system.key}
                                                title={system.label}
                                                icon={system.icon}
                                                status={systemPriced > 0 ? 'Good' : 'Needs Review'}
                                                onPress={() => openSystem(system.key)}
                                                style={systemTileStyle}
                                            />
                                        );
                                    })}
                                </View>
                            </ThemedCard>
                        )}

                        {view === 'system' && selectedSystemNode && (
                            <ThemedCard style={sectionCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                                    {selectedSystemNode.label}
                                </Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Choose an area or container for {selectedSystemNode.label} pricing.
                                </Text>
                                <View style={filterRowStyle}>
                                    <ThemedButton
                                        title="Back to Price Book"
                                        variant="secondary"
                                        onPress={openSystems}
                                        style={compactButtonStyle}
                                        textStyle={compactButtonTextStyle}
                                    />
                                </View>
                                <View style={areaGridStyle}>
                                    {areaCards.map((area) => (
                                        <PriceBookAreaCard
                                            key={area.name}
                                            name={area.name}
                                            itemCount={area.itemCount}
                                            pricedCount={area.pricedCount}
                                            onPress={() => openArea(area.name)}
                                        />
                                    ))}
                                </View>
                            </ThemedCard>
                        )}

                        {view === 'area' && selectedSystemNode && (
                            <ThemedCard style={sectionCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                                    {selectedSystemNode.label} / {selectedArea}
                                </Text>
                                <View style={filterRowStyle}>
                                    <ThemedButton
                                        title="Back to System"
                                        variant="secondary"
                                        onPress={() => {
                                            setView('system');
                                            setEditorOpen(false);
                                        }}
                                        style={compactButtonStyle}
                                        textStyle={compactButtonTextStyle}
                                    />
                                    <ThemedButton
                                        title="Back to Price Book"
                                        variant="secondary"
                                        onPress={openSystems}
                                        style={compactButtonStyle}
                                        textStyle={compactButtonTextStyle}
                                    />
                                </View>

                                {selectedAreaItems.length === 0 ? (
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                        No {selectedSystemNode.label} price items are cataloged for {selectedArea}.
                                    </Text>
                                ) : (
                                    <View style={itemGridStyle}>
                                        {selectedAreaItems.map((item) => (
                                            <PriceBookItemCard
                                                key={item.price_key}
                                                item={item}
                                                canManage={!!manageAccess}
                                                selectable={false}
                                                selected={selectedPriceKeys.includes(item.price_key)}
                                                onOpen={() => openPriceBookItem(item)}
                                                onEdit={() => editItem(item)}
                                                onArchive={() => archiveItem(item)}
                                                onToggleSelected={() => toggleSelectedItem(item.price_key)}
                                            />
                                        ))}
                                    </View>
                                )}
                            </ThemedCard>
                        )}

                        {view === 'detail' && selectedItem && (
                            <PriceBookItemDetail
                                item={selectedItem}
                                editing={editorOpen}
                                form={editorForm}
                                saving={saving}
                                canManage={!!manageAccess}
                                onEdit={() => editItem(selectedItem)}
                                onSave={saveEditor}
                                onCancel={() => setEditorOpen(false)}
                                onChangeField={updateEditor}
                                onChangeUnit={(unit) => setEditorForm((current) => ({ ...current, unit }))}
                                onToggleActive={() => setEditorForm((current) => ({ ...current, active: !current.active }))}
                                onBackToArea={() => {
                                    setView('area');
                                    setEditorOpen(false);
                                }}
                                onBackToSystem={() => {
                                    setView('system');
                                    setEditorOpen(false);
                                }}
                                onBackToPriceBook={openSystems}
                            />
                        )}

                        {view === 'custom' && editorOpen && (
                            <PriceBookItemDetail
                                item={editorPreviewItem}
                                editing={editorOpen}
                                form={editorForm}
                                saving={saving}
                                canManage={!!manageAccess}
                                onEdit={() => undefined}
                                onSave={saveEditor}
                                onCancel={() => {
                                    setEditorOpen(false);
                                    openAllItems();
                                }}
                                onChangeField={updateEditor}
                                onChangeUnit={(unit) => setEditorForm((current) => ({ ...current, unit }))}
                                onToggleActive={() => setEditorForm((current) => ({ ...current, active: !current.active }))}
                                onBackToArea={openAllItems}
                                onBackToSystem={openSystems}
                                onBackToPriceBook={openSystems}
                            />
                        )}

                        {view === 'items' && (
                            <ThemedCard style={sectionCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>All Plumbing Price Items</Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Search the full catalog when you already know the service name.
                                </Text>
                                <View style={filterRowStyle}>
                                    <TextInput
                                        value={search}
                                        onChangeText={setSearch}
                                        placeholder="Search plumbing services..."
                                        style={[searchInputStyle, {
                                            borderColor: theme.colors.border,
                                            color: theme.colors.text,
                                            backgroundColor: theme.colors.surfaceAlt,
                                        }]}
                                        placeholderTextColor={theme.colors.mutedText}
                                    />
                                </View>
                                <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Category</Text>
                                <View style={unitRowStyle}>
                                    <FilterButton label="All Categories" active={!categoryFilter} onPress={() => setCategoryFilter('')} />
                                    {categories.map((category) => (
                                        <FilterButton
                                            key={category}
                                            label={category}
                                            active={categoryFilter === category}
                                            onPress={() => setCategoryFilter(category)}
                                        />
                                    ))}
                                </View>
                                <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Price Status</Text>
                                <View style={unitRowStyle}>
                                    <FilterButton label="All" active={pricedFilter === 'all'} onPress={() => setPricedFilter('all')} />
                                    <FilterButton label="Priced" active={pricedFilter === 'priced'} onPress={() => setPricedFilter('priced')} />
                                    <FilterButton label="Not Priced" active={pricedFilter === 'not_priced'} onPress={() => setPricedFilter('not_priced')} />
                                </View>
                                <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Active Status</Text>
                                <View style={unitRowStyle}>
                                    <FilterButton label="Active" active={activeFilter === 'active'} onPress={() => setActiveFilter('active')} />
                                    <FilterButton label="Inactive" active={activeFilter === 'inactive'} onPress={() => setActiveFilter('inactive')} />
                                    <FilterButton label="All Statuses" active={activeFilter === 'all'} onPress={() => setActiveFilter('all')} />
                                </View>

                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Showing {visibleItems.length} of {displayItems.length} plumbing items.
                                </Text>

                                {visibleItems.length === 0 ? (
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                        No plumbing price items match this filter.
                                    </Text>
                                ) : (
                                    <View style={itemGridStyle}>
                                        {visibleItems.map((item) => (
                                            <PriceBookItemCard
                                                key={item.price_key}
                                                item={item}
                                                canManage={!!manageAccess}
                                                selectable={false}
                                                selected={selectedPriceKeys.includes(item.price_key)}
                                                onOpen={() => openPriceBookItem(item)}
                                                onEdit={() => editItem(item)}
                                                onArchive={() => archiveItem(item)}
                                                onToggleSelected={() => toggleSelectedItem(item.price_key)}
                                            />
                                        ))}
                                    </View>
                                )}
                            </ThemedCard>
                        )}

                        {view === 'advanced' && (
                            <ThemedCard style={sectionCardStyle}>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Advanced Tools</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    AI research, bulk changes, calculators, and import/export stay here. The main workflow remains HomeOS-style navigation.
                                </Text>
                                <View style={toolGridStyle}>
                                    <ToolCard
                                        title="AI Price Research"
                                        description={activeTool === 'ai' ? 'Hide AI research' : 'Research selected plumbing items'}
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
                                        title="Import / Review Price Sheet"
                                        description="Paste researched prices for review."
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
                                        items={displayItems}
                                        canManage={!!manageAccess}
                                        researching={researching}
                                        status={researchStatus}
                                        onChange={(patch) => setResearchForm((current) => ({ ...current, ...patch }))}
                                        onResearch={requestAiResearch}
                                    />
                                )}

                                {activeTool === 'import' && (
                                    <PriceResearchImportTool
                                        text={priceImportText}
                                        rows={priceImportRows}
                                        saving={saving}
                                        canManage={!!manageAccess}
                                        onChangeText={setPriceImportText}
                                        onPreview={previewPriceResearchImport}
                                        onApply={applyPriceImportRow}
                                        onApplyAllMatched={applyAllMatchedPriceImportRows}
                                        onEdit={editPriceImportRowBeforeSave}
                                        onSkip={skipPriceImportRow}
                                        onClear={clearPriceImport}
                                    />
                                )}
                            </ThemedCard>
                        )}

                        {view === 'advanced' && (activeTool === 'ai' || suggestions.length > 0) && (
                            <SuggestionReviewSection
                                suggestions={suggestions}
                                expanded={suggestionsExpanded}
                                onExpand={() => setSuggestionsExpanded(true)}
                                onHide={() => setSuggestionsExpanded(false)}
                                onClear={clearSuggestions}
                                onApply={applySuggestion}
                                onApplyMinimum={applyCompanyMinimum}
                                onCreate={createPriceBookItemFromSuggestion}
                                onEdit={editSuggestionBeforeSave}
                                onDismiss={dismissSuggestion}
                                canManage={!!manageAccess}
                            />
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
            priceKey: key === 'name' || key === 'category'
                ? createPriceKey(
                    current.system,
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
    onOpen,
    onEdit,
    onArchive,
    onToggleSelected,
}: {
    item: CompanyPriceBookItem;
    canManage: boolean;
    selectable: boolean;
    selected: boolean;
    onOpen: () => void;
    onEdit: () => void;
    onArchive: () => void;
    onToggleSelected: () => void;
}) {
    const { theme } = useTheme();
    const priced = item.base_price !== null;
    const pricingDetails = getPriceBookPricingDetails(item);
    const linearFootPrice = parseOptionalNumber(pricingDetails.linearFootPrice);
    const packageDiscountPercent = parseOptionalNumber(pricingDetails.packageDiscountPercent);
    const showLinearFootPrice = item.unit === 'linear foot' || linearFootPrice !== null;
    const showPackageDiscount = packageDiscountPercent !== null || Boolean(pricingDetails.packageDiscountNote.trim());

    return (
        <ThemedCard style={priceItemCardStyle}>
            <TouchableOpacity activeOpacity={0.82} onPress={onOpen}>
                <Text style={[itemTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                    {item.name}
                </Text>
            </TouchableOpacity>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                {item.category}
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
            <View style={detailGridStyle}>
                {item.labor_hours !== null && (
                    <Text style={[detailLineStyle, { color: theme.colors.mutedText }]}>
                        Labor: {formatHours(item.labor_hours)}
                    </Text>
                )}
                {item.material_cost !== null && (
                    <Text style={[detailLineStyle, { color: theme.colors.mutedText }]}>
                        Material: {formatPrice(item.material_cost)}
                    </Text>
                )}
                {showLinearFootPrice && (
                    <Text style={[detailLineStyle, { color: theme.colors.mutedText }]}>
                        Linear foot: {linearFootPrice === null ? 'Not set' : formatPrice(linearFootPrice)}
                    </Text>
                )}
                {showPackageDiscount && (
                    <Text style={[detailLineStyle, { color: theme.colors.mutedText }]}>
                        Package discount: {packageDiscountPercent === null ? 'See note' : `${formatPercent(packageDiscountPercent)}`}
                    </Text>
                )}
                {!!pricingDetails.packageDiscountNote.trim() && (
                    <Text style={[detailLineStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                        Discount note: {pricingDetails.packageDiscountNote.trim()}
                    </Text>
                )}
            </View>
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
                    title="Details"
                    variant="secondary"
                    onPress={onOpen}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                <ThemedButton
                    title="Edit Price"
                    variant={canManage ? 'primary' : 'secondary'}
                    disabled={!canManage}
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

function PriceBookItemDetail({
    item,
    editing,
    form,
    saving,
    canManage,
    onEdit,
    onSave,
    onCancel,
    onChangeField,
    onChangeUnit,
    onToggleActive,
    onBackToArea,
    onBackToSystem,
    onBackToPriceBook,
}: {
    item: CompanyPriceBookItem;
    editing: boolean;
    form: EditorForm;
    saving: boolean;
    canManage: boolean;
    onEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    onChangeField: (key: keyof EditorForm, value: string) => void;
    onChangeUnit: (unit: CompanyPriceBookUnit) => void;
    onToggleActive: () => void;
    onBackToArea: () => void;
    onBackToSystem: () => void;
    onBackToPriceBook: () => void;
}) {
    const { theme } = useTheme();
    const pricingDetails = getPriceBookPricingDetails(item);
    const linearFootPrice = parseOptionalNumber(pricingDetails.linearFootPrice);
    const packageDiscountPercent = parseOptionalNumber(pricingDetails.packageDiscountPercent);

    function renderEditorActions() {
        return (
            <View style={editorActionRowStyle}>
                <ThemedButton
                    title={saving ? 'Saving...' : 'Save Price'}
                    disabled={saving || !canManage}
                    onPress={onSave}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                <ThemedButton
                    title="Cancel"
                    variant="secondary"
                    onPress={onCancel}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                <ThemedButton
                    title="Back to Item"
                    variant="secondary"
                    onPress={onCancel}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
            </View>
        );
    }

    return (
        <ThemedCard style={sectionCardStyle}>
            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                {editing ? `Editing: ${item.name}` : item.name}
            </Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                {item.system} / {getPriceBookItemArea(item)} / {item.category}
            </Text>

            <View style={filterRowStyle}>
                <ThemedButton
                    title="Back to Area"
                    variant="secondary"
                    onPress={onBackToArea}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                <ThemedButton
                    title="Back to System"
                    variant="secondary"
                    onPress={onBackToSystem}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                <ThemedButton
                    title="Back to Price Book"
                    variant="secondary"
                    onPress={onBackToPriceBook}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
            </View>

            {editing ? (
                <>
                    {renderEditorActions()}

                    <View style={editorGridStyle}>
                        <EditorField label="Base Price" value={form.basePrice} onChangeText={(value) => onChangeField('basePrice', value)} keyboardType="decimal-pad" />
                        <EditorField label="Labor Hours" value={form.laborHours} onChangeText={(value) => onChangeField('laborHours', value)} keyboardType="decimal-pad" />
                        <EditorField label="Material Cost" value={form.materialCost} onChangeText={(value) => onChangeField('materialCost', value)} keyboardType="decimal-pad" />
                        <EditorField label="Linear Foot Price" value={form.linearFootPrice} onChangeText={(value) => onChangeField('linearFootPrice', value)} keyboardType="decimal-pad" />
                        <EditorField label="Package Discount Percent" value={form.packageDiscountPercent} onChangeText={(value) => onChangeField('packageDiscountPercent', value)} keyboardType="decimal-pad" />
                    </View>

                    <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Unit</Text>
                    <View style={unitRowStyle}>
                        {priceBookUnits.map((unit) => (
                            <FilterButton
                                key={unit}
                                label={unit}
                                active={form.unit === unit}
                                onPress={() => onChangeUnit(unit)}
                            />
                        ))}
                    </View>

                    <EditorField label="Package Discount Note" value={form.packageDiscountNote} onChangeText={(value) => onChangeField('packageDiscountNote', value)} multiline />
                    <EditorField label="Customer-Facing Description" value={form.customerDescription} onChangeText={(value) => onChangeField('customerDescription', value)} multiline />
                    <EditorField label="Internal Notes" value={form.internalNotes} onChangeText={(value) => onChangeField('internalNotes', value)} multiline />

                    <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={onToggleActive}
                        style={[activeToggleStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                    >
                        <Text style={[bodyTextStyle, { color: theme.colors.text }]}>
                            {form.active ? 'Active item' : 'Inactive item'}
                        </Text>
                    </TouchableOpacity>

                    {renderEditorActions()}
                </>
            ) : (
                <>
                    <View style={detailGridStyle}>
                        <PriceBookDetailRow label="Current base price" value={formatPrice(item.base_price)} />
                        <PriceBookDetailRow label="Unit" value={item.unit} />
                        <PriceBookDetailRow label="Labor hours" value={formatHours(item.labor_hours)} />
                        <PriceBookDetailRow label="Material cost" value={formatPrice(item.material_cost)} />
                        <PriceBookDetailRow label="Linear foot price" value={linearFootPrice === null ? 'Not set' : formatPrice(linearFootPrice)} />
                        <PriceBookDetailRow label="Package discount" value={packageDiscountPercent === null ? 'Not set' : formatPercent(packageDiscountPercent)} />
                        {!!pricingDetails.packageDiscountNote.trim() && (
                            <PriceBookDetailRow label="Package discount note" value={pricingDetails.packageDiscountNote.trim()} />
                        )}
                        <PriceBookDetailRow label="Customer-facing description" value={item.customer_description || 'Not set'} />
                        <PriceBookDetailRow label="Internal notes" value={removePriceBookMetadataFromNotes(item.internal_notes || '') || 'Not set'} />
                        <PriceBookDetailRow label="Status" value={item.active ? 'Active' : 'Inactive'} />
                    </View>

                    <View style={editorActionRowStyle}>
                        <ThemedButton
                            title="Edit Price"
                            disabled={!canManage}
                            onPress={onEdit}
                            style={compactButtonStyle}
                            textStyle={compactButtonTextStyle}
                        />
                    </View>
                </>
            )}
        </ThemedCard>
    );
}

function PriceBookDetailRow({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View style={[detailRowStyle, { borderColor: theme.colors.border }]}>
            <Text style={[summaryLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.text }]}>{value}</Text>
        </View>
    );
}

function PriceBookAreaCard({
    name,
    itemCount,
    pricedCount,
    onPress,
}: {
    name: string;
    itemCount: number;
    pricedCount: number;
    onPress: () => void;
}) {
    const { theme } = useTheme();

    return (
        <TouchableOpacity
            activeOpacity={0.82}
            onPress={onPress}
            style={[areaCardStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
        >
            <Text style={[itemTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>{name}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                {itemCount} items / {pricedCount} priced
            </Text>
        </TouchableOpacity>
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

function PriceResearchImportTool({
    text,
    rows,
    saving,
    canManage,
    onChangeText,
    onPreview,
    onApply,
    onApplyAllMatched,
    onEdit,
    onSkip,
    onClear,
}: {
    text: string;
    rows: PriceResearchImportRow[];
    saving: boolean;
    canManage: boolean;
    onChangeText: (value: string) => void;
    onPreview: () => void;
    onApply: (row: PriceResearchImportRow) => void;
    onApplyAllMatched: () => void;
    onEdit: (row: PriceResearchImportRow) => void;
    onSkip: (rowId: string) => void;
    onClear: () => void;
}) {
    const { theme } = useTheme();
    const matchedCount = rows.filter((row) => row.status === 'matched').length;
    const newItemCount = rows.filter((row) => row.status === 'new_item').length;
    const needsReviewCount = rows.filter((row) => row.status === 'needs_review').length;

    return (
        <View style={toolPanelStyle}>
            <Text style={[toolPanelTitleStyle, { color: theme.colors.text }]}>Import / Review Price Sheet</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Paste CSV or tab-separated research rows, then review before saving.
            </Text>

            <TextInput
                value={text}
                onChangeText={onChangeText}
                multiline
                placeholder="price_key,service_name,recommended_price,market_low,market_average,market_high,source_notes"
                style={[
                    inputStyle,
                    multilineInputStyle,
                    importTextAreaStyle,
                    {
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        backgroundColor: theme.colors.surfaceAlt,
                    },
                ]}
                placeholderTextColor={theme.colors.mutedText}
            />

            <View style={editorActionRowStyle}>
                <ThemedButton
                    title="Review Import"
                    disabled={saving || !text.trim()}
                    onPress={onPreview}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                <ThemedButton
                    title={`Apply All Matched (${matchedCount})`}
                    disabled={!canManage || saving || matchedCount === 0}
                    onPress={onApplyAllMatched}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                <ThemedButton
                    title="Clear Import"
                    variant="secondary"
                    disabled={saving || (!text.trim() && rows.length === 0)}
                    onPress={onClear}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
            </View>

            {rows.length > 0 && (
                <>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Review rows: {matchedCount} matched / {newItemCount} new item / {needsReviewCount} needs review
                    </Text>
                    <View style={suggestionGridStyle}>
                        {rows.map((row) => (
                            <PriceResearchImportReviewCard
                                key={row.id}
                                row={row}
                                saving={saving}
                                canManage={canManage}
                                onApply={() => onApply(row)}
                                onEdit={() => onEdit(row)}
                                onSkip={() => onSkip(row.id)}
                            />
                        ))}
                    </View>
                </>
            )}
        </View>
    );
}

function PriceResearchImportReviewCard({
    row,
    saving,
    canManage,
    onApply,
    onEdit,
    onSkip,
}: {
    row: PriceResearchImportRow;
    saving: boolean;
    canManage: boolean;
    onApply: () => void;
    onEdit: () => void;
    onSkip: () => void;
}) {
    const { theme } = useTheme();
    const isNewItem = row.status === 'new_item';
    const isNeedsReview = row.status === 'needs_review';

    return (
        <View style={[suggestionCardStyle, { borderColor: theme.colors.border }]}>
            <Text style={[itemTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                {isNewItem ? 'New Price Item' : row.draft.name}
            </Text>
            {isNewItem && (
                <Text style={[metaTextStyle, { color: theme.colors.text }]} numberOfLines={2}>
                    {row.draft.name}
                </Text>
            )}
            <View style={chipRowStyle}>
                <Text style={[chipStyle, { color: theme.colors.text, borderColor: theme.colors.border }]}>
                    {getPriceImportStatusLabel(row.status)}
                </Text>
                <Text style={[chipStyle, { color: theme.colors.text, borderColor: theme.colors.border }]}>
                    Row {row.rowNumber}
                </Text>
            </View>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Current: {formatPrice(row.matchedItem?.base_price ?? null)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Imported: {formatPrice(row.importedPrice)}
            </Text>
            {(row.marketLow !== null || row.marketAverage !== null || row.marketHigh !== null) && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    Market: {formatPrice(row.marketLow)} / {formatPrice(row.marketAverage)} / {formatPrice(row.marketHigh)}
                </Text>
            )}
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                {row.matchSummary}
            </Text>
            {!!row.sourceNotes && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={3}>
                    Source notes: {row.sourceNotes}
                </Text>
            )}
            <View style={itemActionRowStyle}>
                <ThemedButton
                    title={isNewItem ? 'Create Price Book Item' : 'Apply'}
                    disabled={!canManage || saving || isNeedsReview}
                    onPress={onApply}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                <ThemedButton
                    title="Edit Before Save"
                    variant="secondary"
                    disabled={!canManage || saving}
                    onPress={onEdit}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
                <ThemedButton
                    title="Skip"
                    variant="secondary"
                    disabled={saving}
                    onPress={onSkip}
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
    status,
    onChange,
    onResearch,
}: {
    form: ResearchForm;
    items: CompanyPriceBookItem[];
    canManage: boolean;
    researching: boolean;
    status: AiResearchStatus;
    onChange: (patch: Partial<ResearchForm>) => void;
    onResearch: () => void;
}) {
    const { theme } = useTheme();
    const selectedItem = items.find((item) => item.price_key === form.itemKey) || null;
    const itemSearchTerm = form.itemSearch.trim().toLowerCase();
    const itemChoices = items
        .filter((item) => {
            if (!itemSearchTerm) return true;

            return [item.name, item.system, item.category, item.price_key]
                .join(' ')
                .toLowerCase()
                .includes(itemSearchTerm);
        })
        .slice(0, 12);

    return (
        <View style={toolPanelStyle}>
            <Text style={[toolPanelTitleStyle, { color: theme.colors.text }]}>AI Price Research</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                AI runs server-side through Supabase. This first version creates AI-assisted estimates from provided context, not live online market research.
            </Text>

            <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Research Scope</Text>
            <View style={unitRowStyle}>
                <FilterButton label="One Item" active={form.scope === 'one_item'} onPress={() => onChange({ scope: 'one_item' })} />
                <FilterButton label="Research Custom Item" active={form.scope === 'custom_item'} onPress={() => onChange({ scope: 'custom_item' })} />
                <FilterButton label="Current System" active={form.scope === 'current_system'} onPress={() => onChange({ scope: 'current_system' })} />
                <FilterButton label="Filtered List" active={form.scope === 'filtered_list'} onPress={() => onChange({ scope: 'filtered_list' })} />
                <FilterButton label="All Unpriced" active={form.scope === 'all_unpriced'} onPress={() => onChange({ scope: 'all_unpriced' })} />
            </View>

            {form.scope === 'one_item' && (
                <>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        {selectedItem
                            ? `Selected for AI Research: ${selectedItem.name}`
                            : 'Select one item below or search for an item.'}
                    </Text>
                    <View style={editorGridStyle}>
                        <EditorField
                            label="Search Items"
                            value={form.itemSearch}
                            onChangeText={(value) => onChange({ itemSearch: value })}
                        />
                    </View>
                    <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Item</Text>
                    <View style={unitRowStyle}>
                        {itemChoices.map((item) => (
                            <FilterButton
                                key={item.price_key}
                                label={item.name}
                                active={form.itemKey === item.price_key}
                                onPress={() => onChange({ itemKey: item.price_key, trade: inferTradeCategory(item), customServiceType: inferServiceType(item.name) })}
                            />
                        ))}
                    </View>
                </>
            )}

            {form.scope === 'custom_item' && (
                <>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Research a service that is not in the price book yet. AI suggestions stay in review until you create the item.
                    </Text>
                    <View style={editorGridStyle}>
                        <EditorField label="Custom Item / Service Name" value={form.customName} onChangeText={(value) => onChange({ customName: value })} />
                        <EditorField label="Custom Notes" value={form.customNotes} onChangeText={(value) => onChange({ customNotes: value })} multiline />
                    </View>
                    <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>System</Text>
                    <View style={unitRowStyle}>
                        {researchSystemOptions.map((option) => (
                            <FilterButton
                                key={option.value}
                                label={option.label}
                                active={form.customSystem === option.value}
                                onPress={() => onChange({ customSystem: option.value })}
                            />
                        ))}
                    </View>
                    <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Trade / Category</Text>
                    <View style={unitRowStyle}>
                        {researchTradeOptions.map((option) => (
                            <FilterButton
                                key={option}
                                label={option}
                                active={form.customCategory === option}
                                onPress={() => onChange({ customCategory: option, trade: option })}
                            />
                        ))}
                    </View>
                </>
            )}

            <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Trade / Category</Text>
            <View style={unitRowStyle}>
                {researchTradeOptions.map((option) => (
                    <FilterButton
                        key={option}
                        label={option}
                        active={form.trade === option}
                        onPress={() => onChange({ trade: option })}
                    />
                ))}
            </View>

            <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Service Type</Text>
            <View style={unitRowStyle}>
                {researchServiceTypeOptions.map((option) => (
                    <FilterButton
                        key={option}
                        label={capitalizeWords(option)}
                        active={form.customServiceType === option}
                        onPress={() => onChange({ customServiceType: option })}
                    />
                ))}
            </View>

            {form.scope === 'custom_item' && (
                <>
                    <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Unit</Text>
                    <View style={unitRowStyle}>
                        {priceBookUnits.map((unit) => (
                            <FilterButton
                                key={unit}
                                label={unit}
                                active={form.customUnit === unit}
                                onPress={() => onChange({ customUnit: unit })}
                            />
                        ))}
                    </View>
                </>
            )}

            {isWaterHeaterResearch(form) && (
                <View style={[guardrailBoxStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Water Heater Details</Text>
                    <View style={unitRowStyle}>
                        <FilterButton label="Tank" active={form.waterHeaterKind === 'tank'} onPress={() => onChange({ waterHeaterKind: 'tank' })} />
                        <FilterButton label="Tankless" active={form.waterHeaterKind === 'tankless'} onPress={() => onChange({ waterHeaterKind: 'tankless' })} />
                        <FilterButton label="Not Set" active={!form.waterHeaterKind} onPress={() => onChange({ waterHeaterKind: '' })} />
                    </View>
                    <View style={editorGridStyle}>
                        <EditorField label="Gallon Size" value={form.waterHeaterGallons} onChangeText={(value) => onChange({ waterHeaterGallons: value })} />
                        <EditorField label="Access Difficulty" value={form.accessDifficulty} onChangeText={(value) => onChange({ accessDifficulty: value })} />
                    </View>
                    <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Install Scope</Text>
                    <View style={unitRowStyle}>
                        <FilterButton label="Standard Replacement" active={form.waterHeaterInstallScope === 'standard replacement'} onPress={() => onChange({ waterHeaterInstallScope: 'standard replacement' })} />
                        <FilterButton label="New Install" active={form.waterHeaterInstallScope === 'new install'} onPress={() => onChange({ waterHeaterInstallScope: 'new install' })} />
                        <FilterButton label="Not Set" active={!form.waterHeaterInstallScope} onPress={() => onChange({ waterHeaterInstallScope: '' })} />
                    </View>
                    <YesNoButtonGroup label="Permit Included" value={form.permitIncluded} onChange={(value) => onChange({ permitIncluded: value })} />
                    <YesNoButtonGroup label="Haul Away Included" value={form.haulAwayIncluded} onChange={(value) => onChange({ haulAwayIncluded: value })} />
                    <YesNoButtonGroup label="Expansion Tank Included" value={form.expansionTankIncluded} onChange={(value) => onChange({ expansionTankIncluded: value })} />
                    <YesNoButtonGroup label="Code Upgrades Included" value={form.codeUpgradesIncluded} onChange={(value) => onChange({ codeUpgradesIncluded: value })} />
                </View>
            )}

            <View style={editorGridStyle}>
                <EditorField label="Service Area / ZIP Code" value={form.serviceArea} onChangeText={(value) => onChange({ serviceArea: value })} />
                <EditorField label="Notes" value={form.notes} onChangeText={(value) => onChange({ notes: value })} multiline />
            </View>

            <View style={[guardrailBoxStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Company Pricing Guardrails</Text>
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>Company minimums override AI suggestions.</Text>
                <View style={editorGridStyle}>
                    <EditorField label="Minimum Acceptable Price" value={form.minimumPrice} onChangeText={(value) => onChange({ minimumPrice: value })} keyboardType="decimal-pad" />
                    <EditorField label="Target Gross Margin %" value={form.targetMargin} onChangeText={(value) => onChange({ targetMargin: value })} keyboardType="decimal-pad" />
                    <EditorField label="Labor Rate" value={form.laborRate} onChangeText={(value) => onChange({ laborRate: value })} keyboardType="decimal-pad" />
                    <EditorField label="Estimated Labor Hours" value={form.estimatedLaborHours} onChangeText={(value) => onChange({ estimatedLaborHours: value })} keyboardType="decimal-pad" />
                    <EditorField label="Material Cost" value={form.materialCost} onChangeText={(value) => onChange({ materialCost: value })} keyboardType="decimal-pad" />
                    <EditorField label="Overhead %" value={form.overheadPercent} onChangeText={(value) => onChange({ overheadPercent: value })} keyboardType="decimal-pad" />
                </View>
            </View>

            <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>Positioning</Text>
            <View style={unitRowStyle}>
                <FilterButton label="Budget" active={form.positioning === 'budget'} onPress={() => onChange({ positioning: 'budget' })} />
                <FilterButton label="Market Average" active={form.positioning === 'market average'} onPress={() => onChange({ positioning: 'market average' })} />
                <FilterButton label="Premium" active={form.positioning === 'premium'} onPress={() => onChange({ positioning: 'premium' })} />
            </View>

            <View style={editorActionRowStyle}>
                <ThemedButton
                    title={researching ? 'Researching pricing with AI...' : 'Research Pricing with AI'}
                    disabled={!canManage || researching}
                    onPress={onResearch}
                    style={compactButtonStyle}
                    textStyle={compactButtonTextStyle}
                />
            </View>

            <View style={[aiStatusLineStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                <Text style={[metaTextStyle, { color: status.kind === 'function_error' || status.kind === 'network_error' || status.kind === 'auth_error' ? '#B42318' : theme.colors.mutedText }]}>
                    {status.message || 'AI research is idle.'}
                </Text>
                {!!status.debugSummary && (
                    <Text style={[debugTextStyle, { color: theme.colors.mutedText }]} numberOfLines={2}>
                        {status.debugSummary}
                    </Text>
                )}
            </View>
        </View>
    );
}

function SuggestionReviewSection({
    suggestions,
    expanded,
    onExpand,
    onHide,
    onClear,
    onApply,
    onApplyMinimum,
    onCreate,
    onEdit,
    onDismiss,
    canManage,
}: {
    suggestions: PriceSuggestion[];
    expanded: boolean;
    onExpand: () => void;
    onHide: () => void;
    onClear: () => void;
    onApply: (suggestion: PriceSuggestion) => void;
    onApplyMinimum: (suggestion: PriceSuggestion) => void;
    onCreate: (suggestion: PriceSuggestion) => void;
    onEdit: (suggestion: PriceSuggestion) => void;
    onDismiss: (suggestionId: string) => void;
    canManage: boolean;
}) {
    const { theme } = useTheme();
    const suggestionLabel = suggestions.length === 1 ? '1 suggestion' : `${suggestions.length} suggestions`;

    return (
        <ThemedCard style={sectionCardStyle}>
            <View style={suggestionHeaderStyle}>
                <View style={suggestionHeaderTextStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                        Suggested Price Review - {suggestionLabel}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Suggestions stay manual. Review before creating or applying prices.
                    </Text>
                </View>
                <View style={itemActionRowStyle}>
                    <ThemedButton
                        title="Review"
                        disabled={suggestions.length === 0}
                        onPress={onExpand}
                        style={compactButtonStyle}
                        textStyle={compactButtonTextStyle}
                    />
                    <ThemedButton
                        title="Hide"
                        variant="secondary"
                        disabled={!expanded}
                        onPress={onHide}
                        style={compactButtonStyle}
                        textStyle={compactButtonTextStyle}
                    />
                    <ThemedButton
                        title="Clear Suggestions"
                        variant="secondary"
                        disabled={suggestions.length === 0}
                        onPress={onClear}
                        style={compactButtonStyle}
                        textStyle={compactButtonTextStyle}
                    />
                </View>
            </View>

            {suggestions.length === 0 ? (
                <View style={[emptySuggestionStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        No price suggestions yet.
                    </Text>
                </View>
            ) : !expanded ? (
                <View style={[emptySuggestionStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        {suggestionLabel} hidden. Use Review to open them.
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
                            {suggestion.belowCompanyMinimum && (
                                <Text style={[metaTextStyle, { color: '#B42318' }]}>
                                    Below company minimum. Company minimums override AI suggestions.
                                </Text>
                            )}
                            {suggestion.adjustedRecommendation !== null && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Adjusted recommendation: {formatPrice(suggestion.adjustedRecommendation)}
                                </Text>
                            )}
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
                            {suggestion.missingInfoQuestions.length > 0 && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Missing info: {suggestion.missingInfoQuestions.slice(0, 2).join(' / ')}
                                </Text>
                            )}
                            <View style={itemActionRowStyle}>
                                {suggestion.customDraft ? (
                                    <ThemedButton
                                        title="Create Price Book Item"
                                        disabled={!canManage || !suggestion.applyAllowed}
                                        onPress={() => onCreate(suggestion)}
                                        style={compactButtonStyle}
                                        textStyle={compactButtonTextStyle}
                                    />
                                ) : (
                                    <ThemedButton
                                        title={suggestion.applyAllowed ? 'Apply Suggested Price' : 'Review Only'}
                                        disabled={!canManage || !suggestion.applyAllowed}
                                        onPress={() => onApply(suggestion)}
                                        style={compactButtonStyle}
                                        textStyle={compactButtonTextStyle}
                                    />
                                )}
                                <ThemedButton
                                    title="Edit Before Save"
                                    variant="secondary"
                                    disabled={!canManage}
                                    onPress={() => onEdit(suggestion)}
                                    style={compactButtonStyle}
                                    textStyle={compactButtonTextStyle}
                                />
                                {suggestion.belowCompanyMinimum && (
                                    <ThemedButton
                                        title="Apply Company Minimum"
                                        variant="secondary"
                                        disabled={!canManage || !suggestion.applyAllowed}
                                        onPress={() => suggestion.customDraft ? onCreate({
                                            ...suggestion,
                                            suggestedPrice: getSuggestionEffectivePrice(suggestion),
                                        }) : onApplyMinimum(suggestion)}
                                        style={compactButtonStyle}
                                        textStyle={compactButtonTextStyle}
                                    />
                                )}
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

function YesNoButtonGroup({
    label,
    value,
    onChange,
}: {
    label: string;
    value: ResearchYesNo;
    onChange: (value: ResearchYesNo) => void;
}) {
    const { theme } = useTheme();

    return (
        <>
            <Text style={[fieldLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <View style={unitRowStyle}>
                {yesNoOptions.map((option) => (
                    <FilterButton
                        key={option.value}
                        label={option.label}
                        active={value === option.value}
                        onPress={() => onChange(option.value)}
                    />
                ))}
            </View>
        </>
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
        .select('role')
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

function buildPriceResearchImportRows(
    companyId: string,
    text: string,
    displayItems: CompanyPriceBookItem[]
): PriceResearchImportRow[] {
    const parsedRows = parsePriceResearchImportTable(text);

    if (parsedRows.length === 0) {
        throw new Error('Paste at least one price row after the header.');
    }

    return parsedRows.map((row) => buildPriceResearchImportRow(companyId, row, displayItems));
}

function parsePriceResearchImportTable(text: string): ParsedPriceResearchImportRow[] {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const headerIndex = lines.findIndex((line) => line.trim().length > 0);

    if (headerIndex < 0) {
        throw new Error('Paste CSV or tab-separated text with a header row.');
    }

    const delimiter = lines[headerIndex].includes('\t') ? '\t' : ',';
    const headers = parseDelimitedImportLine(lines[headerIndex], delimiter).map(normalizePriceResearchImportHeader);
    const supportedHeaderCount = headers.filter(Boolean).length;

    if (supportedHeaderCount === 0) {
        throw new Error('No supported import columns were found.');
    }

    const rows: ParsedPriceResearchImportRow[] = [];

    lines.slice(headerIndex + 1).forEach((line, index) => {
        if (!line.trim()) return;

        const values: PriceResearchImportValues = {};
        const cells = parseDelimitedImportLine(line, delimiter);

        headers.forEach((header, cellIndex) => {
            if (!header) return;

            values[header] = (cells[cellIndex] || '').trim();
        });

        if (Object.values(values).some((value) => typeof value === 'string' && value.trim().length > 0)) {
            rows.push({
                rowNumber: headerIndex + index + 2,
                values,
            });
        }
    });

    return rows;
}

function parseDelimitedImportLine(line: string, delimiter: string) {
    const cells: string[] = [];
    let currentCell = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];

        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                currentCell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === delimiter && !quoted) {
            cells.push(currentCell.trim());
            currentCell = '';
        } else {
            currentCell += character;
        }
    }

    cells.push(currentCell.trim());

    return cells;
}

function normalizePriceResearchImportHeader(value: string): PriceResearchImportColumn | null {
    const normalizedHeader = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    return priceResearchImportColumnSet.has(normalizedHeader)
        ? normalizedHeader as PriceResearchImportColumn
        : null;
}

function buildPriceResearchImportRow(
    companyId: string,
    row: ParsedPriceResearchImportRow,
    displayItems: CompanyPriceBookItem[]
): PriceResearchImportRow {
    const values = row.values;
    const match = findPriceResearchImportMatch(values, displayItems);
    const matchedItem = match?.item || null;
    const importedName = readImportValue(values, 'service_name') || readImportValue(values, 'name');
    const name = importedName || matchedItem?.name || readImportValue(values, 'price_key') || 'New Price Item';
    const system = readImportValue(values, 'system') || matchedItem?.system || PLUMBING_SYSTEM;
    const category = readImportValue(values, 'category') || matchedItem?.category || 'Other Plumbing';
    const area = readImportValue(values, 'area') || (matchedItem ? getPriceBookItemArea(matchedItem) : '');
    const priceKey = matchedItem?.price_key || readImportValue(values, 'price_key') || createPriceKey(system, category, name);
    const existingPricingDetails = matchedItem ? getPriceBookPricingDetails(matchedItem) : {
        linearFootPrice: '',
        packageDiscountPercent: '',
        packageDiscountNote: '',
    };
    const marketLow = readImportNumber(values.market_low);
    const marketAverage = readImportNumber(values.market_average);
    const marketHigh = readImportNumber(values.market_high);
    const importedPrice = readImportNumber(values.base_price) ?? readImportNumber(values.recommended_price);
    const sourceNotes = readImportValue(values, 'source_notes');
    const importedInternalNotes = readImportValue(values, 'internal_notes');
    const existingNotes = matchedItem ? removePriceBookMetadataFromNotes(matchedItem.internal_notes || '') : '';
    const baseNotes = [
        importedInternalNotes || existingNotes,
        sourceNotes ? `Source notes: ${sourceNotes}` : '',
    ].filter(Boolean).join('\n');
    const metadataForm = emptyEditorForm({
        area,
        linearFootPrice: readImportValue(values, 'linear_foot_price') || existingPricingDetails.linearFootPrice,
        packageDiscountPercent: readImportValue(values, 'package_discount_percent') || existingPricingDetails.packageDiscountPercent,
        packageDiscountNote: readImportValue(values, 'package_discount_note') || existingPricingDetails.packageDiscountNote,
    });
    const hasUsableName = Boolean(importedName || readImportValue(values, 'price_key'));
    const status: PriceResearchImportStatus = matchedItem ? 'matched' : hasUsableName ? 'new_item' : 'needs_review';
    const draft: CompanyPriceBookDraft = {
        id: matchedItem?.source === 'backend' || matchedItem?.source === 'local' ? matchedItem.id : undefined,
        price_key: priceKey,
        name,
        system,
        category,
        unit: readImportUnit(values.unit, matchedItem?.unit),
        base_price: importedPrice ?? matchedItem?.base_price ?? null,
        labor_hours: readImportNumber(values.labor_hours) ?? matchedItem?.labor_hours ?? null,
        material_cost: readImportNumber(values.material_cost) ?? matchedItem?.material_cost ?? null,
        customer_description: readImportValue(values, 'customer_description') || matchedItem?.customer_description || null,
        internal_notes: mergePriceBookMetadataIntoNotes(baseNotes, metadataForm),
        active: true,
    };

    return {
        id: `price-import-${row.rowNumber}-${priceKey}`,
        rowNumber: row.rowNumber,
        values,
        matchedItem,
        draft,
        status,
        marketLow,
        marketAverage,
        marketHigh,
        importedPrice,
        sourceNotes,
        matchSummary: buildPriceResearchImportMatchSummary(status, match),
    };
}

function findPriceResearchImportMatch(
    values: PriceResearchImportValues,
    displayItems: CompanyPriceBookItem[]
): PriceResearchImportMatch | null {
    const priceKey = readImportValue(values, 'price_key');

    if (priceKey) {
        const priceKeyMatch = displayItems.find((item) => item.price_key === priceKey);

        if (priceKeyMatch) return { item: priceKeyMatch, reason: 'price_key' };
    }

    const importedName = readImportValue(values, 'service_name') || readImportValue(values, 'name');
    const importedSystem = readImportValue(values, 'system');
    const importedCategory = readImportValue(values, 'category');

    if (!importedName) return null;

    const catalogMatch = plumbingPriceBookCatalogItems.find((catalogItem) =>
        importNameMatchesCatalogItem(importedName, catalogItem) &&
        importSystemMatches(catalogItem.system, importedSystem) &&
        importCategoryMatches(catalogItem.category, importedCategory)
    );

    if (catalogMatch) {
        const item = displayItems.find((candidate) => candidate.price_key === catalogMatch.price_key);

        if (item) {
            return {
                item,
                reason: catalogMatch.name === importedName ? 'catalog name' : 'catalog alias',
            };
        }
    }

    const displayMatch = displayItems.find((item) =>
        normalizeMatchText(item.name) === normalizeMatchText(importedName) &&
        importSystemMatches(item.system, importedSystem) &&
        importCategoryMatches(item.category, importedCategory)
    );

    return displayMatch ? { item: displayMatch, reason: 'name + system/category' } : null;
}

function importNameMatchesCatalogItem(importedName: string, catalogItem: PlumbingPriceBookCatalogItem) {
    const importedNameText = normalizeMatchText(importedName);
    const catalogNames = [
        catalogItem.name,
        ...(catalogItem.aliases || []),
    ].map(normalizeMatchText);

    return catalogNames.includes(importedNameText);
}

function importSystemMatches(candidateSystem: string, importedSystem: string) {
    if (!importedSystem.trim()) return true;

    const candidateText = normalizeMatchText(candidateSystem);
    const importedText = normalizeMatchText(importedSystem);
    const matchTerms = getSystemMatchTerms(importedSystem);

    return (
        candidateText === importedText ||
        matchTerms.includes(candidateText) ||
        matchTerms.some((term) => candidateText.includes(term) || term.includes(candidateText))
    );
}

function importCategoryMatches(candidateCategory: string, importedCategory: string) {
    if (!importedCategory.trim()) return true;

    const candidateText = normalizeMatchText(candidateCategory);
    const importedText = normalizeMatchText(importedCategory);

    return candidateText === importedText || candidateText.includes(importedText) || importedText.includes(candidateText);
}

function readImportValue(values: PriceResearchImportValues, column: PriceResearchImportColumn) {
    return (values[column] || '').trim();
}

function readImportNumber(value: string | undefined) {
    const rawValue = String(value || '').trim();

    if (!rawValue) return null;

    const parsedValue = Number.parseFloat(rawValue.replace(/[$,%]/g, '').replace(/,/g, ''));

    return Number.isFinite(parsedValue) ? parsedValue : null;
}

function readImportUnit(value: string | undefined, fallback?: CompanyPriceBookUnit): CompanyPriceBookUnit {
    const normalizedValue = normalizeMatchText(value || '');
    const matchedUnit = priceBookUnits.find((unit) => normalizeMatchText(unit) === normalizedValue);

    return matchedUnit || fallback || 'each';
}

function buildPriceResearchImportMatchSummary(
    status: PriceResearchImportStatus,
    match?: PriceResearchImportMatch | null
) {
    if (match) return `Matched by ${match.reason}: ${match.item.name}`;
    if (status === 'new_item') return 'No catalog match found. Review before creating.';

    return 'Missing service name or price_key.';
}

function buildEditorFormFromImportRow(row: PriceResearchImportRow): EditorForm {
    const pricingDetails = getPriceBookPricingDetailsFromNotes(row.draft.internal_notes);

    return {
        id: row.draft.id,
        priceKey: row.draft.price_key,
        name: row.draft.name,
        system: row.draft.system,
        area: readAreaFromNotes(row.draft.internal_notes) || '',
        category: row.draft.category,
        unit: row.draft.unit,
        basePrice: numberToEditorText(row.draft.base_price),
        laborHours: numberToEditorText(row.draft.labor_hours),
        materialCost: numberToEditorText(row.draft.material_cost),
        linearFootPrice: pricingDetails.linearFootPrice,
        packageDiscountPercent: pricingDetails.packageDiscountPercent,
        packageDiscountNote: pricingDetails.packageDiscountNote,
        customerDescription: row.draft.customer_description || '',
        internalNotes: removePriceBookMetadataFromNotes(row.draft.internal_notes || ''),
        active: row.draft.active,
    };
}

function numberToEditorText(value: number | null) {
    return value === null ? '' : String(value);
}

function getPriceImportStatusLabel(status: PriceResearchImportStatus) {
    if (status === 'matched') return 'matched';
    if (status === 'new_item') return 'new item';

    return 'needs review';
}

function buildDisplayItems(companyId: string, savedItems: CompanyPriceBookItem[]) {
    const plumbingSavedItems = savedItems.filter(isPlumbingPriceBookItem);
    const matchedSavedIds = new Set<string>();
    const catalogItems = plumbingPriceBookCatalogItems.map((catalogItem) => {
        const savedItem = findSavedItemForCatalogItem(catalogItem, plumbingSavedItems, matchedSavedIds);

        if (savedItem) {
            matchedSavedIds.add(savedItem.id);
        }

        return buildCatalogDisplayItem(companyId, catalogItem, savedItem);
    });
    const unmatchedSavedItems = plumbingSavedItems.filter((item) => !matchedSavedIds.has(item.id));

    return sortDisplayItems([...catalogItems, ...unmatchedSavedItems]);
}

function findSavedItemForCatalogItem(
    catalogItem: PlumbingPriceBookCatalogItem,
    savedItems: CompanyPriceBookItem[],
    matchedSavedIds: Set<string>
) {
    const exactMatch = savedItems.find((item) =>
        !matchedSavedIds.has(item.id) && item.price_key === catalogItem.price_key
    );

    if (exactMatch) return exactMatch;

    const catalogMatchKeys = [
        buildPriceBookMatchKey(catalogItem.name, catalogItem.system, catalogItem.category),
        ...((catalogItem.aliases || []).map((alias) => buildPriceBookMatchKey(alias, catalogItem.system, catalogItem.category))),
    ];

    return savedItems.find((item) =>
        !matchedSavedIds.has(item.id) &&
        catalogMatchKeys.includes(buildPriceBookMatchKey(item.name, item.system, item.category))
    ) || null;
}

function buildCatalogDisplayItem(
    companyId: string,
    catalogItem: PlumbingPriceBookCatalogItem,
    savedItem?: CompanyPriceBookItem | null
): CompanyPriceBookItem {
    return {
        id: savedItem?.id || `template-${catalogItem.price_key}`,
        company_id: savedItem?.company_id || companyId,
        price_key: catalogItem.price_key,
        name: catalogItem.name,
        system: catalogItem.system,
        category: catalogItem.category,
        unit: savedItem?.unit || catalogItem.unit,
        base_price: savedItem?.base_price ?? null,
        labor_hours: savedItem?.labor_hours ?? null,
        material_cost: savedItem?.material_cost ?? null,
        customer_description: savedItem?.customer_description || catalogItem.defaultDescription,
        internal_notes: mergeAreaIntoNotes(savedItem?.internal_notes || '', catalogItem.area),
        active: savedItem?.active ?? true,
        created_at: savedItem?.created_at || null,
        updated_at: savedItem?.updated_at || null,
        source: savedItem?.source || 'template',
    };
}

function sortDisplayItems(items: CompanyPriceBookItem[]) {
    return [...items].sort((a, b) =>
        a.system.localeCompare(b.system) ||
        getPriceBookItemArea(a).localeCompare(getPriceBookItemArea(b)) ||
        a.category.localeCompare(b.category) ||
        a.name.localeCompare(b.name)
    );
}

function buildEditorPreviewItem(companyId: string, form: EditorForm): CompanyPriceBookItem {
    return {
        id: form.id || `editor-${form.priceKey || 'price-item'}`,
        company_id: companyId,
        price_key: form.priceKey || createPriceKey(form.system, form.category, form.name),
        name: form.name || 'New plumbing price item',
        system: form.system || PLUMBING_SYSTEM,
        category: form.category || 'Other Plumbing',
        unit: form.unit,
        base_price: parseOptionalNumber(form.basePrice),
        labor_hours: parseOptionalNumber(form.laborHours),
        material_cost: parseOptionalNumber(form.materialCost),
        customer_description: form.customerDescription || null,
        internal_notes: mergePriceBookMetadataIntoNotes(form.internalNotes, form),
        active: form.active,
        created_at: null,
        updated_at: null,
        source: form.id ? 'local' : 'template',
    };
}

function isPlumbingPriceBookItem(item: CompanyPriceBookItem) {
    const category = normalizeMatchText(item.category);
    const system = normalizeMatchText(item.system);
    const name = normalizeMatchText(item.name);
    const searchableText = normalizeMatchText([item.system, item.category, item.name].join(' '));
    const plumbingCategorySet = new Set(plumbingPriceBookCategories.map(normalizeMatchText));
    const plumbingSystemSet = new Set(plumbingPriceBookCatalog.map((catalogSystem) => normalizeMatchText(catalogSystem.label)));
    const catalogNameSet = new Set(plumbingPriceBookCatalogItems.map((catalogItem) => normalizeMatchText(catalogItem.name)));

    return (
        system === normalizeMatchText(PLUMBING_SYSTEM) ||
        plumbingSystemSet.has(system) ||
        plumbingCategorySet.has(category) ||
        catalogNameSet.has(name) ||
        plumbingPriceBookCatalogItems.some((catalogItem) =>
            catalogItem.aliases?.some((alias) => searchableText.includes(normalizeMatchText(alias)))
        )
    );
}

function filterPriceBookItems(
    items: CompanyPriceBookItem[],
    search: string,
    categoryFilter: string,
    pricedFilter: 'all' | 'priced' | 'not_priced',
    activeFilter: ActiveFilter
) {
    const searchTerm = search.trim().toLowerCase();

    return items.filter((item) => {
        if (categoryFilter && item.category !== categoryFilter) return false;
        if (pricedFilter === 'priced' && item.base_price === null) return false;
        if (pricedFilter === 'not_priced' && item.base_price !== null) return false;
        if (activeFilter === 'active' && !item.active) return false;
        if (activeFilter === 'inactive' && item.active) return false;
        if (!searchTerm) return true;

        return [item.name, item.category, item.unit, item.customer_description || '', item.internal_notes || '']
            .join(' ')
            .toLowerCase()
            .includes(searchTerm);
    });
}

function filterPriceBookItemsByArea(items: CompanyPriceBookItem[], areaName: string) {
    if (!areaName) return items;

    return items.filter((item) => getPriceBookItemArea(item) === areaName);
}

function buildPriceBookAreaCards(items: CompanyPriceBookItem[]) {
    return plumbingPriceBookAreaNames
        .map((name) => {
            const areaItems = filterPriceBookItemsByArea(items, name);

            return {
                name,
                itemCount: areaItems.length,
                pricedCount: areaItems.filter((item) => item.base_price !== null).length,
            };
        })
        .filter((area) => area.itemCount > 0);
}

function getCatalogSystemKeyForItem(item: CompanyPriceBookItem) {
    const priceKeyMatch = plumbingPriceBookCatalog.find((system) =>
        system.areas.some((area) => area.items.some((catalogItem) => catalogItem.price_key === item.price_key))
    );

    if (priceKeyMatch) return priceKeyMatch.key;

    const systemMatch = plumbingPriceBookCatalog.find((system) =>
        normalizeMatchText(system.label) === normalizeMatchText(item.system)
    );

    return systemMatch?.key || '';
}

function getPriceBookItemArea(item: CompanyPriceBookItem) {
    const explicitArea = readAreaFromNotes(item.internal_notes);

    if (explicitArea) return explicitArea;

    return inferPriceBookArea(item);
}

function readAreaFromNotes(notes?: string | null) {
    const match = areaNotePattern.exec(notes || '');

    return match?.[1]?.trim() || '';
}

function removeAreaFromNotes(notes: string) {
    return notes.replace(areaNotePattern, '').trim();
}

function mergeAreaIntoNotes(notes: string, area: string) {
    const cleanNotes = removeAreaFromNotes(notes);
    const cleanArea = area.trim();

    return [cleanArea ? `[Area: ${cleanArea}]` : '', cleanNotes].filter(Boolean).join(' ');
}

function getPriceBookPricingDetails(item: CompanyPriceBookItem): PriceBookPricingDetails {
    return getPriceBookPricingDetailsFromNotes(item.internal_notes);
}

function getPriceBookPricingDetailsFromNotes(notes?: string | null): PriceBookPricingDetails {
    const noteText = notes || '';

    return {
        linearFootPrice: readNoteMetadata(noteText, linearFootPriceNotePattern),
        packageDiscountPercent: readNoteMetadata(noteText, packageDiscountPercentNotePattern),
        packageDiscountNote: readNoteMetadata(noteText, packageDiscountNotePattern),
    };
}

function readNoteMetadata(notes: string, pattern: RegExp) {
    const match = pattern.exec(notes);

    return match?.[1]?.trim() || '';
}

function removePriceBookMetadataFromNotes(notes: string) {
    return notes
        .replace(areaNotePattern, '')
        .replace(linearFootPriceNotePattern, '')
        .replace(packageDiscountPercentNotePattern, '')
        .replace(packageDiscountNotePattern, '')
        .trim();
}

function mergePriceBookMetadataIntoNotes(notes: string, form: EditorForm) {
    const cleanNotes = removePriceBookMetadataFromNotes(notes);
    const cleanArea = form.area.trim();
    const linearFootPrice = form.linearFootPrice.trim();
    const packageDiscountPercent = form.packageDiscountPercent.trim();
    const packageDiscountNote = form.packageDiscountNote.trim();
    const metadata = [
        cleanArea ? `[Area: ${sanitizeNoteMetadataValue(cleanArea)}]` : '',
        linearFootPrice ? `[Linear Foot Price: ${sanitizeNoteMetadataValue(linearFootPrice)}]` : '',
        packageDiscountPercent ? `[Package Discount Percent: ${sanitizeNoteMetadataValue(packageDiscountPercent)}]` : '',
        packageDiscountNote ? `[Package Discount Note: ${sanitizeNoteMetadataValue(packageDiscountNote)}]` : '',
    ].filter(Boolean);

    return [...metadata, cleanNotes].filter(Boolean).join(' ');
}

function sanitizeNoteMetadataValue(value: string) {
    return value.trim().replace(/\]/g, ')').slice(0, 160);
}

function inferPriceBookArea(item: CompanyPriceBookItem) {
    const text = normalizeMatchText([item.name, item.category, item.system, item.internal_notes || '', item.customer_description || ''].join(' '));

    if (text.includes('garage')) return 'Garage';
    if (text.includes('kitchen') || text.includes('faucet') || text.includes('disposal') || text.includes('dishwasher') || text.includes('sink')) return 'Kitchen';
    if (text.includes('bath') || text.includes('toilet') || text.includes('shower') || text.includes('tub') || text.includes('vanity')) return 'Bathroom';
    if (text.includes('laundry') || text.includes('washer') || text.includes('dryer')) return 'Laundry';
    if (text.includes('water heater') || text.includes('tankless') || text.includes('expansion tank') || text.includes('prv') || text.includes('pressure regulator') || text.includes('main water') || text.includes('shutoff') || text.includes('whole home filter')) return 'Garage';
    if (text.includes('exterior') || text.includes('hose') || text.includes('bibb') || text.includes('irrigation') || text.includes('pool')) return 'Exterior';
    if (text.includes('hvac') || text.includes('air handler') || text.includes('furnace')) return 'Mechanical Area';
    if (text.includes('main') || text.includes('whole home') || text.includes('filter')) return 'Whole Home';

    return 'Other';
}

function itemMatchesSystem(item: CompanyPriceBookItem, selectedSystem: string) {
    const terms = getSystemMatchTerms(selectedSystem);
    const itemSystem = normalizeMatchText(item.system);
    const itemCategory = normalizeMatchText(item.category);
    const itemName = normalizeMatchText(item.name);

    if (terms.length === 0) return false;

    return terms.some((term) =>
        itemSystem === term ||
        itemSystem.includes(term) ||
        itemCategory === term ||
        itemCategory.includes(term) ||
        itemName.includes(term)
    );
}

function getSystemMatchTerms(systemName: string) {
    const normalizedSystem = normalizeMatchText(systemName);

    const matchMap: Record<string, string[]> = {
        plumbing: ['plumbing', 'water service', 'water system', 'fixture', 'fixtures', 'water heater', 'water'],
        'water service': ['water service', 'water line', 'water leak', 'slab leak'],
        'drain sewer': ['drain sewer', 'drains sewer', 'drains', 'sewer', 'sewer service', 'drain'],
        'sewer service': ['sewer service', 'drains sewer', 'drains', 'sewer', 'drain'],
        fixtures: ['fixtures', 'fixture', 'shower', 'tub'],
        toilets: ['toilets', 'toilet'],
        'faucets sinks': ['faucets sinks', 'faucet', 'sink'],
        'valves shutoffs': ['valves shutoffs', 'valve', 'shutoff', 'prv', 'pressure regulator'],
        'water heaters': ['water heaters', 'water heater', 'tankless', 'expansion tank'],
        'laundry dishwasher': ['laundry dishwasher', 'laundry', 'dishwasher', 'ice maker', 'washing machine'],
        'inspections diagnostics': ['inspections diagnostics', 'inspection', 'diagnostic', 'leak detection'],
        'emergency after hours': ['emergency after hours', 'emergency', 'after hours', 'weekend'],
        gas: ['gas', 'gas service'],
        'drains sewer': ['drains sewer', 'drains', 'sewer', 'sewer service', 'drain'],
        hvac: ['hvac', 'ac service', 'heating cooling', 'air conditioning', 'cooling', 'heating'],
        electrical: ['electrical', 'electrical system'],
        safety: ['safety', 'safety system'],
        appliances: ['appliances', 'appliance'],
        'water quality': ['water quality', 'filter', 'filtration'],
        exterior: ['exterior', 'hose bibb', 'outdoor'],
        irrigation: ['irrigation', 'irrigation system'],
        pool: ['pool', 'pool system'],
    };

    return matchMap[normalizedSystem] || [normalizedSystem].filter(Boolean);
}

function normalizeMatchText(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildPriceBookMatchKey(name: string, system: string, category: string) {
    return [name, system, category].map(normalizeMatchText).join('|');
}

function getResearchItems(
    displayItems: CompanyPriceBookItem[],
    filteredItems: CompanyPriceBookItem[],
    form: ResearchForm,
    selectedSystem: string
) {
    if (form.scope === 'one_item') {
        const explicitItem = displayItems.find((item) => item.price_key === form.itemKey);

        return explicitItem ? [explicitItem] : [];
    }

    if (form.scope === 'current_system') {
        const systemName = selectedSystem || form.trade;
        const systemItems = displayItems.filter((item) => item.active && itemMatchesSystem(item, systemName));

        return systemItems.length ? systemItems : filteredItems.filter((item) => item.active);
    }

    if (form.scope === 'all_unpriced') {
        return displayItems.filter((item) => item.active && item.base_price === null);
    }

    return filteredItems.filter((item) => item.active);
}

function getEmptyResearchItemsMessage(form: ResearchForm) {
    if (form.scope === 'one_item') return 'No price book items selected for AI research.';
    if (form.scope === 'custom_item') return 'Add a custom item or service name before researching.';
    if (form.scope === 'all_unpriced') return 'No unpriced items found. Select another scope or add price book items.';

    return 'No price book items selected for AI research.';
}

function buildAiRequestSummary(
    form: ResearchForm,
    itemCount: number,
    companyIdResolution: CompanyIdResolution,
    model: string
) {
    return [
        `scope=${form.scope}`,
        `item_count=${itemCount}`,
        `company_id_present=${companyIdResolution.finalCompanyId ? 'yes' : 'no'}`,
        `route_company_id_valid=${isUuid(companyIdResolution.routeCompanyId) ? 'yes' : 'no'}`,
        `loaded_company_id_valid=${isUuid(companyIdResolution.loadedCompanyId) ? 'yes' : 'no'}`,
        `final_company_id_valid=${isUuid(companyIdResolution.finalCompanyId) ? 'yes' : 'no'}`,
        `final_company_id_preview=${safeIdPreview(companyIdResolution.finalCompanyId)}`,
        `final_company_id_length=${companyIdResolution.finalCompanyId.length}`,
        `service_area_entered=${form.serviceArea.trim() ? 'yes' : 'no'}`,
        `model=${model || 'unknown'}`,
    ].join('; ');
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
        service_type: inferServiceType(item.name),
        notes: item.internal_notes || item.customer_description || null,
    };
}

function buildCustomResearchItem(companyId: string, form: ResearchForm): CompanyPriceBookItem | null {
    const name = form.customName.trim();

    if (!name) return null;

    const system = form.customSystem.trim() || PLUMBING_SYSTEM;
    const category = form.customCategory.trim() || form.trade.trim() || 'Other Plumbing';
    const notes = [form.customNotes.trim(), buildServiceDetails(form), form.notes.trim()]
        .filter(Boolean)
        .join(' / ') || null;

    return {
        id: `custom-research-${createPriceKey(system, category, name)}`,
        company_id: companyId,
        price_key: `custom-research-${createPriceKey(system, category, name)}`,
        name,
        system,
        category,
        unit: form.customUnit,
        base_price: null,
        labor_hours: null,
        material_cost: null,
        customer_description: null,
        internal_notes: notes,
        active: true,
        created_at: null,
        updated_at: null,
        source: 'template',
    };
}

function attachCustomDraftToSuggestion(
    suggestion: PriceSuggestion,
    customResearchItem: CompanyPriceBookItem
): PriceSuggestion {
    return {
        ...suggestion,
        customDraft: {
            price_key: createPriceKey(customResearchItem.system, customResearchItem.category, customResearchItem.name),
            name: customResearchItem.name,
            system: customResearchItem.system,
            category: customResearchItem.category,
            unit: customResearchItem.unit,
            base_price: suggestion.suggestedPrice,
            labor_hours: customResearchItem.labor_hours,
            material_cost: customResearchItem.material_cost,
            customer_description: customResearchItem.customer_description,
            internal_notes: customResearchItem.internal_notes,
            active: true,
        },
    };
}

function applyLocalPriceGuardrails(suggestion: PriceSuggestion, form: ResearchForm): PriceSuggestion {
    const minimumPrice = parseOptionalNumber(form.minimumPrice);

    if (minimumPrice === null || suggestion.suggestedPrice >= minimumPrice) {
        return {
            ...suggestion,
            companyMinimumPrice: suggestion.companyMinimumPrice ?? minimumPrice,
        };
    }

    return {
        ...suggestion,
        belowCompanyMinimum: true,
        adjustedRecommendation: Math.max(minimumPrice, suggestion.adjustedRecommendation ?? 0),
        companyMinimumPrice: minimumPrice,
        cautionNotes: [
            'Below company minimum. Company minimums override AI suggestions.',
            ...suggestion.cautionNotes,
        ],
    };
}

function buildServiceDetails(form: ResearchForm) {
    return [
        `service_type=${form.customServiceType}`,
        `unit=${form.customUnit}`,
        form.minimumPrice.trim() ? `company_minimum_price=${form.minimumPrice.trim()}` : '',
        form.laborRate.trim() ? `labor_rate=${form.laborRate.trim()}` : '',
        form.estimatedLaborHours.trim() ? `estimated_labor_hours=${form.estimatedLaborHours.trim()}` : '',
        form.materialCost.trim() ? `material_cost=${form.materialCost.trim()}` : '',
        form.overheadPercent.trim() ? `overhead_percent=${form.overheadPercent.trim()}` : '',
        isWaterHeaterResearch(form) ? buildWaterHeaterDetails(form) : '',
    ].filter(Boolean).join('; ');
}

function buildWaterHeaterDetails(form: ResearchForm) {
    return [
        'water_heater_context=true',
        form.waterHeaterKind ? `kind=${form.waterHeaterKind}` : '',
        form.waterHeaterGallons.trim() ? `gallons=${form.waterHeaterGallons.trim()}` : '',
        form.waterHeaterInstallScope ? `install_scope=${form.waterHeaterInstallScope}` : '',
        `permit_included=${form.permitIncluded}`,
        `haul_away_included=${form.haulAwayIncluded}`,
        `expansion_tank_included=${form.expansionTankIncluded}`,
        `code_upgrades_included=${form.codeUpgradesIncluded}`,
        form.accessDifficulty.trim() ? `access_difficulty=${form.accessDifficulty.trim()}` : '',
    ].filter(Boolean).join('; ');
}

function readAiSuggestions(data: unknown, items: CompanyPriceBookItem[]): AiSuggestionReadResult {
    if (!isRecord(data)) {
        return {
            ok: false,
            message: 'AI returned an unexpected response.',
            debugSummary: safeDebugSummary(data),
        };
    }

    const record = data;

    if (!Array.isArray(record.suggestions)) {
        return {
            ok: false,
            message: 'AI returned an unexpected response.',
            debugSummary: safeDebugSummary(data),
        };
    }

    const rawSuggestions = Array.isArray(record.suggestions) ? record.suggestions : [];
    const itemByKey = new Map(items.map((item) => [item.price_key, item]));
    const suggestions = rawSuggestions
        .map((value) => readAiSuggestion(value, itemByKey))
        .filter((suggestion): suggestion is PriceSuggestion => Boolean(suggestion));

    if (rawSuggestions.length > 0 && suggestions.length === 0) {
        return {
            ok: false,
            message: 'AI returned an unexpected response.',
            debugSummary: safeDebugSummary(data),
        };
    }

    return { ok: true, suggestions };
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
        missingInfoQuestions: readStringArray(suggestion.missing_info_questions),
        belowCompanyMinimum: suggestion.below_company_minimum === true,
        adjustedRecommendation: readNullableNumber(suggestion.adjusted_recommendation),
        companyMinimumPrice: readNullableNumber(suggestion.company_minimum_price),
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
        return displayItems.filter((item) => item.active && itemMatchesSystem(item, selectedSystem));
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
    return items.some((item) => itemMatchesSystem(item, system) && item.base_price !== null && item.active);
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
        itemSearch: '',
        customName: '',
        customSystem: PLUMBING_SYSTEM,
        customCategory: 'Other Plumbing',
        customServiceType: 'diagnostic',
        customUnit: 'each',
        customNotes: '',
        waterHeaterKind: '',
        waterHeaterGallons: '',
        waterHeaterInstallScope: '',
        permitIncluded: 'unspecified',
        haulAwayIncluded: 'unspecified',
        expansionTankIncluded: 'unspecified',
        codeUpgradesIncluded: 'unspecified',
        accessDifficulty: '',
        serviceArea: '',
        trade: PLUMBING_SYSTEM,
        positioning: 'market average',
        targetMargin: '',
        minimumPrice: '',
        laborRate: '',
        estimatedLaborHours: '',
        materialCost: '',
        overheadPercent: '',
        notes: '',
    };
}

function emptyAiResearchStatus(): AiResearchStatus {
    return {
        kind: 'idle',
        message: '',
        debugSummary: '',
    };
}

function emptyEditorForm(seed: Partial<EditorForm> = {}): EditorForm {
    const system = seed.system || PLUMBING_SYSTEM;
    const area = seed.area || '';
    const category = seed.category || 'Other Plumbing';
    const name = seed.name || '';

    return {
        priceKey: seed.priceKey || createPriceKey(system, category, name),
        name,
        system,
        area,
        category,
        unit: seed.unit || 'each',
        basePrice: seed.basePrice || '',
        laborHours: seed.laborHours || '',
        materialCost: seed.materialCost || '',
        linearFootPrice: seed.linearFootPrice || '',
        packageDiscountPercent: seed.packageDiscountPercent || '',
        packageDiscountNote: seed.packageDiscountNote || '',
        customerDescription: seed.customerDescription || '',
        internalNotes: seed.internalNotes || '',
        active: seed.active ?? true,
    };
}

function getCompanyDisplayName(company?: CompanyRecord | null) {
    return company?.public_name?.trim() || company?.dba_name?.trim() || company?.name?.trim() || 'Company';
}

function inferTradeCategory(item: CompanyPriceBookItem): ResearchTradeCategory {
    return inferTradeCategoryFromText([item.system, item.category, item.name].join(' '));
}

function inferTradeCategoryFromText(value: string): ResearchTradeCategory {
    const text = normalizeMatchText(value);

    if (text.includes('water heater')) return 'Water Heater';
    if (text.includes('drain') || text.includes('sewer')) return 'Drain/Sewer';
    if (text.includes('gas')) return 'Gas';
    if (text.includes('hvac') || text.includes('ac') || text.includes('heating')) return 'HVAC';
    if (text.includes('electrical') || text.includes('outlet')) return 'Electrical';
    if (text.includes('appliance')) return 'Appliance';
    if (text.includes('water quality') || text.includes('filter')) return 'Water Quality';
    if (text.includes('exterior') || text.includes('hose bibb')) return 'Exterior';
    if (text.includes('plumb') || text.includes('water') || text.includes('fixture')) return 'Plumbing';

    return 'Other';
}

function inferServiceType(value: string): ResearchServiceType {
    const text = normalizeMatchText(value);

    if (text.includes('install')) return 'installation';
    if (text.includes('replace') || text.includes('replacement')) return 'replacement';
    if (text.includes('repair')) return 'repair';
    if (text.includes('flush') || text.includes('maintenance') || text.includes('service')) return 'maintenance';
    if (text.includes('inspection') || text.includes('inspect')) return 'inspection';
    if (text.includes('emergency')) return 'emergency';
    if (text.includes('code')) return 'code upgrade';

    return 'diagnostic';
}

function isWaterHeaterResearch(form: ResearchForm) {
    return normalizeMatchText([form.customName, form.customCategory, form.trade, form.notes, form.customNotes].join(' '))
        .includes('water heater');
}

function capitalizeWords(value: string) {
    return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSuggestionEffectivePrice(suggestion: PriceSuggestion) {
    return suggestion.adjustedRecommendation ?? suggestion.suggestedPrice;
}

function createPriceKey(...parts: string[]) {
    return parts
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

function formatHours(value: number | null) {
    if (value === null) return 'Not set';

    return `${value.toFixed(2)} hr`;
}

function formatPercent(value: number) {
    return `${value.toFixed(2).replace(/\.00$/, '')}%`;
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

function normalizeCompanyIdInput(value: string | string[] | undefined | null) {
    const rawValue = (Array.isArray(value) ? value[0] || '' : value || '').trim();
    const uuidMatch = UUID_SUBSTRING_PATTERN.exec(rawValue);

    return uuidMatch?.[0] || rawValue;
}

function resolveAiCompanyId(company: CompanyRecord | null, routeCompanyId: string): CompanyIdResolution {
    const loadedCompanyId = normalizeCompanyIdInput(company?.id || '');
    const normalizedRouteCompanyId = normalizeCompanyIdInput(routeCompanyId);

    return {
        routeCompanyId: normalizedRouteCompanyId,
        loadedCompanyId,
        finalCompanyId: isUuid(loadedCompanyId) ? loadedCompanyId : normalizedRouteCompanyId,
    };
}

function isUuid(value: string) {
    return UUID_PATTERN.test(value.trim());
}

function safeIdPreview(value: string) {
    const trimmedValue = value.trim();

    if (!trimmedValue) return 'missing';

    return trimmedValue.length <= 6 ? trimmedValue : `...${trimmedValue.slice(-6)}`;
}

async function readFunctionJson(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!text) return null;

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return {
            ok: false,
            code: 'invalid_json_response',
            stage: 'parse_response',
            message: 'Function returned a non-JSON response.',
            detail: text.slice(0, 240),
        } satisfies AiResearchFunctionError;
    }
}

function formatFunctionError(value: unknown, status: number) {
    const errorBody = readFunctionErrorBody(value);

    if (!errorBody) {
        return `Function error [http_${status}/unknown]: Price research function failed.`;
    }

    const detailText = errorBody.detail ? ` — ${errorBody.detail}` : '';

    return `Function error [${errorBody.stage}/${errorBody.code}]: ${errorBody.message}${detailText}`;
}

function readFunctionErrorBody(value: unknown): AiResearchFunctionError | null {
    if (!isRecord(value)) return null;

    return {
        ok: false,
        code: readString(value.code) || 'unknown',
        stage: readString(value.stage) || 'unknown',
        message: readString(value.message) || 'Price research function failed.',
        detail: readString(value.detail),
    };
}

function safeDebugSummary(value: unknown): string {
    if (!isRecord(value)) {
        if (Array.isArray(value)) return `response_type=array; length=${value.length}`;
        return `response_type=${value === null ? 'null' : typeof value}`;
    }

    const keys = Object.keys(value).slice(0, 8);
    const suggestionsValue = value.suggestions;
    const suggestionCount = Array.isArray(suggestionsValue) ? suggestionsValue.length : 'missing';
    const code = readString(value.code) || 'none';
    const stage = readString(value.stage) || 'none';
    const message = readString(value.message);
    const detail = readString(value.detail);

    return [
        `keys=${keys.join(',') || 'none'}`,
        `suggestions=${suggestionCount}`,
        `stage=${stage}`,
        `code=${code}`,
        message ? `message=${message.slice(0, 120)}` : '',
        detail ? `detail=${detail.slice(0, 120)}` : '',
    ].filter(Boolean).join('; ');
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

const topControlRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 8,
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

const areaGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 14,
};

const areaCardStyle = {
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 92,
    padding: 12,
    width: 170,
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
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    width: 150,
    minHeight: 88,
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

const aiStatusLineStyle = {
    alignSelf: 'flex-start' as const,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    maxWidth: 680,
    paddingHorizontal: 12,
    paddingVertical: 8,
};

const debugTextStyle = {
    fontSize: 11,
    fontWeight: '800' as const,
    lineHeight: 16,
    marginTop: 4,
};

const guardrailBoxStyle = {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    padding: 10,
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

const suggestionHeaderStyle = {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
};

const suggestionHeaderTextStyle = {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 240,
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
    width: 260,
    minHeight: 260,
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

const detailGridStyle = {
    marginTop: 8,
    gap: 2,
};

const detailRowStyle = {
    borderBottomWidth: 1,
    paddingVertical: 9,
};

const detailLineStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 17,
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

const importTextAreaStyle = {
    marginTop: 12,
    minHeight: 150,
    width: '100%' as const,
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
