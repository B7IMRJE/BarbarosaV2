import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const PRICE_BOOK_STORAGE_KEY = 'homeos_company_price_book_v1';
const COMPANY_PRICE_BOOK_RPC_NAMES = ['get_company_price_book_v2', 'get_company_price_book'] as const;
const COMPANY_PRICE_BOOK_UPSERT_RPC_NAME = 'upsert_company_price_book_item';

export type CompanyPriceBookUnit =
    | 'each'
    | 'hour'
    | 'linear foot'
    | 'package'
    | 'inspection'
    | 'diagnostic'
    | 'install'
    | 'repair'
    | 'replacement'
    | 'service call'
    | 'other';

export type CompanyPriceBookItem = {
    id: string;
    company_id: string;
    price_key: string;
    name: string;
    system: string;
    category: string;
    unit: CompanyPriceBookUnit;
    base_price: number | null;
    labor_hours: number | null;
    material_cost: number | null;
    customer_description: string | null;
    internal_notes: string | null;
    active: boolean;
    created_at: string | null;
    updated_at: string | null;
    source: 'backend' | 'local' | 'template';
    service_category?: string | null;
    internal_description?: string | null;
    homeowner_description?: string | null;
    base_labor_install_price?: number | null;
    estimated_labor_hours?: number | null;
    internal_labor_cost?: number | null;
    internal_material_cost?: number | null;
    recommended_selling_price?: number | null;
    minimum_permitted_selling_price?: number | null;
    maximum_permitted_selling_price?: number | null;
    required_minimum_gross_margin?: number | null;
    tax_behavior?: string | null;
    effective_at?: string | null;
    version_label?: string | null;
    included_warranty?: string | null;
    eligible_extended_warranties?: string[];
    required_add_on_price_keys?: string[];
    incompatible_price_keys?: string[];
    applicable_systems?: string[];
    applicable_areas?: string[];
    applicable_categories?: string[];
    management_notes?: string | null;
};

export type CompanyPriceBookDraft = Omit<CompanyPriceBookItem, 'id' | 'company_id' | 'created_at' | 'updated_at' | 'source'> & {
    id?: string;
};

export type CompanyPriceBookBackendStatus =
    | { status: 'connected'; message: string }
    | { status: 'fallback'; message: string }
    | { status: 'error'; message: string };

export type CompanyPriceBookLoadResult = {
    items: CompanyPriceBookItem[];
    backendStatus: CompanyPriceBookBackendStatus;
};

type WebStorage = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
};

type SupabaseErrorLike = {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
};

export const priceBookUnits: CompanyPriceBookUnit[] = [
    'each',
    'hour',
    'linear foot',
    'package',
    'inspection',
    'diagnostic',
    'install',
    'repair',
    'replacement',
    'service call',
    'other',
];

export function getCompanyPriceBookRpcNames() {
    return [...COMPANY_PRICE_BOOK_RPC_NAMES];
}

export function getCompanyPriceBookUpsertRpcName() {
    return COMPANY_PRICE_BOOK_UPSERT_RPC_NAME;
}

export async function loadCompanyPriceBook(companyId: string): Promise<CompanyPriceBookLoadResult> {
    const backendItems = await loadCompanyPriceBookFromBackend(companyId);
    const localItems = await loadLocalCompanyPriceBook(companyId);

    if (backendItems) {
        return {
            items: mergePriceBookItems(backendItems, localItems),
            backendStatus: {
                status: 'connected',
                message: 'Price book backend: connected',
            },
        };
    }

    return {
        items: localItems,
        backendStatus: {
            status: 'fallback',
            message: 'Price book backend unavailable: using local price book draft',
        },
    };
}

export async function upsertCompanyPriceBookItem(companyId: string, draft: CompanyPriceBookDraft) {
    const normalizedDraft = normalizeDraft(draft);
    const backendItem = await upsertCompanyPriceBookItemInBackend(companyId, normalizedDraft);

    if (backendItem) {
        return {
            item: backendItem,
            backendStatus: {
                status: 'connected',
                message: 'Price book item saved to backend',
            } as CompanyPriceBookBackendStatus,
        };
    }

    const item = await upsertCompanyPriceBookItemInLocal(companyId, normalizedDraft);

    return {
        item,
        backendStatus: {
            status: 'fallback',
            message: 'Price book backend unavailable: using local price book draft',
        } as CompanyPriceBookBackendStatus,
    };
}

export async function archiveCompanyPriceBookItem(companyId: string, item: CompanyPriceBookItem) {
    const nextDraft: CompanyPriceBookDraft = {
        id: item.id,
        price_key: item.price_key,
        name: item.name,
        system: item.system,
        category: item.category,
        unit: item.unit,
        base_price: item.base_price,
        labor_hours: item.labor_hours,
        material_cost: item.material_cost,
        customer_description: item.customer_description,
        internal_notes: item.internal_notes,
        active: false,
    };

    return upsertCompanyPriceBookItem(companyId, nextDraft);
}

function mergePriceBookItems(backendItems: CompanyPriceBookItem[], localItems: CompanyPriceBookItem[]) {
    const byKey = new Map<string, CompanyPriceBookItem>();

    backendItems.forEach((item) => byKey.set(item.price_key, item));
    localItems.forEach((item) => {
        if (!byKey.has(item.price_key)) byKey.set(item.price_key, item);
    });

    return sortPriceBookItems(Array.from(byKey.values()));
}

async function loadCompanyPriceBookFromBackend(companyId: string) {
    try {
        for (const rpcName of COMPANY_PRICE_BOOK_RPC_NAMES) {
            const { data, error } = await supabase.rpc(rpcName, {
                p_company_id: companyId,
            });

            if (error) {
                if (await shouldUseLocalFallbackForBackendError(error)) {
                    if (rpcName !== COMPANY_PRICE_BOOK_RPC_NAMES[COMPANY_PRICE_BOOK_RPC_NAMES.length - 1]) {
                        continue;
                    }

                    return null;
                }

                throw new Error(`Could not load company price book: ${getSupabaseErrorText(error)}`);
            }

            return sortPriceBookItems(
                (Array.isArray(data) ? data : [])
                    .map((row) => readPriceBookItem(row, 'backend'))
                    .filter((item): item is CompanyPriceBookItem => Boolean(item))
            );
        }

        return null;
    } catch (error) {
        if (await shouldUseLocalFallbackForBackendError(error)) {
            return null;
        }

        throw error;
    }
}

async function upsertCompanyPriceBookItemInBackend(companyId: string, draft: CompanyPriceBookDraft) {
    try {
        const { data, error } = await supabase.rpc(COMPANY_PRICE_BOOK_UPSERT_RPC_NAME, {
            p_company_id: companyId,
            p_price_key: draft.price_key,
            p_name: draft.name,
            p_system: draft.system,
            p_category: draft.category,
            p_unit: draft.unit,
            p_base_price: draft.base_price,
            p_labor_hours: draft.labor_hours,
            p_material_cost: draft.material_cost,
            p_customer_description: draft.customer_description,
            p_internal_notes: draft.internal_notes,
            p_active: draft.active,
        });

        if (error) {
            if (await shouldUseLocalFallbackForBackendError(error)) {
                return null;
            }

            throw new Error(`Could not save company price book item: ${getSupabaseErrorText(error)}`);
        }

        const rows = Array.isArray(data) ? data : data ? [data] : [];
        const savedItem = rows.map((row) => readPriceBookItem(row, 'backend')).find(Boolean);

        if (!savedItem) {
            throw new Error('Price book save did not return a saved item.');
        }

        return savedItem;
    } catch (error) {
        if (await shouldUseLocalFallbackForBackendError(error)) {
            return null;
        }

        throw error;
    }
}

async function upsertCompanyPriceBookItemInLocal(companyId: string, draft: CompanyPriceBookDraft) {
    const existingItems = await loadLocalCompanyPriceBook(companyId);
    const existingItem = existingItems.find((item) => item.price_key === draft.price_key || item.id === draft.id);
    const now = new Date().toISOString();
    const nextItem: CompanyPriceBookItem = {
        id: existingItem?.id || draft.id || createLocalId(),
        company_id: companyId,
        price_key: draft.price_key,
        name: draft.name,
        system: draft.system,
        category: draft.category,
        unit: draft.unit,
        base_price: draft.base_price,
        labor_hours: draft.labor_hours,
        material_cost: draft.material_cost,
        customer_description: draft.customer_description,
        internal_notes: draft.internal_notes,
        active: draft.active ?? true,
        created_at: existingItem?.created_at || now,
        updated_at: now,
        source: 'local',
    };
    const nextItems = sortPriceBookItems([
        nextItem,
        ...existingItems.filter((item) => item.id !== nextItem.id && item.price_key !== nextItem.price_key),
    ]);

    await writeLocalCompanyPriceBook(companyId, nextItems);

    return nextItem;
}

async function loadLocalCompanyPriceBook(companyId: string) {
    const rawItems = await readRaw(storageKey(companyId));

    if (!rawItems) return [];

    try {
        const parsedItems = JSON.parse(rawItems);

        if (!Array.isArray(parsedItems)) return [];

        return sortPriceBookItems(
            parsedItems
                .map((row) => readPriceBookItem(row, 'local'))
                .filter((item): item is CompanyPriceBookItem => Boolean(item))
        );
    } catch {
        return [];
    }
}

async function writeLocalCompanyPriceBook(companyId: string, items: CompanyPriceBookItem[]) {
    await writeRaw(storageKey(companyId), JSON.stringify(items));
}

function normalizeDraft(draft: CompanyPriceBookDraft): CompanyPriceBookDraft {
    return {
        id: draft.id || undefined,
        price_key: draft.price_key.trim() || slugify(draft.name),
        name: draft.name.trim() || 'Untitled price item',
        system: draft.system.trim() || 'Other',
        category: draft.category.trim() || 'Service',
        unit: priceBookUnits.includes(draft.unit) ? draft.unit : 'each',
        base_price: normalizeNullableNumber(draft.base_price),
        labor_hours: normalizeNullableNumber(draft.labor_hours),
        material_cost: normalizeNullableNumber(draft.material_cost),
        customer_description: normalizeNullableString(draft.customer_description),
        internal_notes: normalizeNullableString(draft.internal_notes),
        active: draft.active ?? true,
    };
}

function readPriceBookItem(value: unknown, source: 'backend' | 'local'): CompanyPriceBookItem | null {
    if (!value || typeof value !== 'object') return null;

    const row = value as Record<string, unknown>;
    const id = readString(row.id);
    const companyId = readString(row.company_id);
    const name = readString(row.name);
    const system = readString(row.system);
    const category = readString(row.category);
    const priceKey = readString(row.price_key) || slugify([system, category, name].filter(Boolean).join(' '));

    if (!id || !companyId || !name || !system || !category || !priceKey) return null;

    return {
        id,
        company_id: companyId,
        price_key: priceKey,
        name,
        system,
        category,
        unit: readUnit(row.unit),
        base_price: readNullableNumber(row.base_price),
        labor_hours: readNullableNumber(row.labor_hours),
        material_cost: readNullableNumber(row.material_cost),
        customer_description: readNullableString(row.customer_description),
        internal_notes: readNullableString(row.internal_notes),
        active: row.active === false ? false : true,
        created_at: readNullableString(row.created_at),
        updated_at: readNullableString(row.updated_at),
        source,
        service_category: readNullableString(row.service_category),
        internal_description: readNullableString(row.internal_description),
        homeowner_description: readNullableString(row.homeowner_description),
        base_labor_install_price: readNullableNumber(row.base_labor_install_price),
        estimated_labor_hours: readNullableNumber(row.estimated_labor_hours),
        internal_labor_cost: readNullableNumber(row.internal_labor_cost),
        internal_material_cost: readNullableNumber(row.internal_material_cost),
        recommended_selling_price: readNullableNumber(row.recommended_selling_price),
        minimum_permitted_selling_price: readNullableNumber(row.minimum_permitted_selling_price),
        maximum_permitted_selling_price: readNullableNumber(row.maximum_permitted_selling_price),
        required_minimum_gross_margin: readNullableNumber(row.required_minimum_gross_margin),
        tax_behavior: readNullableString(row.tax_behavior),
        effective_at: readNullableString(row.effective_at),
        version_label: readNullableString(row.version_label),
        included_warranty: readNullableString(row.included_warranty),
        eligible_extended_warranties: readTextArray(row.eligible_extended_warranties),
        required_add_on_price_keys: readTextArray(row.required_add_on_price_keys),
        incompatible_price_keys: readTextArray(row.incompatible_price_keys),
        applicable_systems: readTextArray(row.applicable_systems),
        applicable_areas: readTextArray(row.applicable_areas),
        applicable_categories: readTextArray(row.applicable_categories),
        management_notes: readNullableString(row.management_notes),
    };
}

export function readCompanyPriceBookRpcRowForRegression(value: unknown, source: 'backend' | 'local' = 'backend') {
    return readPriceBookItem(value, source);
}

function sortPriceBookItems(items: CompanyPriceBookItem[]) {
    return [...items].sort((a, b) =>
        a.system.localeCompare(b.system) ||
        a.category.localeCompare(b.category) ||
        a.name.localeCompare(b.name)
    );
}

function readUnit(value: unknown): CompanyPriceBookUnit {
    return typeof value === 'string' && priceBookUnits.includes(value as CompanyPriceBookUnit)
        ? value as CompanyPriceBookUnit
        : 'each';
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function readNullableNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;

    const parsedValue = Number.parseFloat(value.trim());

    return Number.isFinite(parsedValue) ? parsedValue : null;
}

function readTextArray(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value
        .map((entry) => typeof entry === 'string' ? entry.trim() : '')
        .filter((entry) => entry.length > 0);
}

function normalizeNullableString(value?: string | null) {
    const text = String(value || '').trim();

    return text || null;
}

function normalizeNullableNumber(value?: number | null) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function shouldUseLocalFallbackForBackendError(error: unknown) {
    const text = getSupabaseErrorText(error).toLowerCase();
    const code = getSupabaseErrorCode(error);

    if (
        code === '42883' ||
        code === '42P01' ||
        code === 'PGRST202' ||
        code === 'PGRST204' ||
        text.includes('could not find the function') ||
        text.includes('schema cache') ||
        (text.includes('company_price_book_items') && text.includes('does not exist'))
    ) {
        return true;
    }

    return false;
}

function getSupabaseErrorText(error: unknown) {
    if (error instanceof Error) return error.message;
    if (!error || typeof error !== 'object') return 'Unknown error';

    const candidate = error as SupabaseErrorLike;
    const parts = [candidate.message, candidate.details, candidate.hint]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);

    return parts.join(' ') || 'Unknown error';
}

function getSupabaseErrorCode(error: unknown) {
    if (!error || typeof error !== 'object') return '';

    const candidate = (error as SupabaseErrorLike).code;

    return typeof candidate === 'string' ? candidate : '';
}

function storageKey(companyId: string) {
    return `${PRICE_BOOK_STORAGE_KEY}_${companyId}`;
}

async function readRaw(key: string) {
    const webStorage = getWebStorage();

    if (webStorage) {
        try {
            return webStorage.getItem(key);
        } catch {
            return AsyncStorage.getItem(key);
        }
    }

    return AsyncStorage.getItem(key);
}

async function writeRaw(key: string, value: string) {
    const webStorage = getWebStorage();

    if (webStorage) {
        try {
            webStorage.setItem(key, value);
            return;
        } catch {
            await AsyncStorage.setItem(key, value);
            return;
        }
    }

    await AsyncStorage.setItem(key, value);
}

function getWebStorage(): WebStorage | null {
    const candidate = (globalThis as { localStorage?: WebStorage }).localStorage;

    if (
        candidate &&
        typeof candidate.getItem === 'function' &&
        typeof candidate.setItem === 'function' &&
        typeof candidate.removeItem === 'function'
    ) {
        return candidate;
    }

    return null;
}

function createLocalId() {
    const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;

    return cryptoLike?.randomUUID?.() || `price-book-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'price-item';
}
