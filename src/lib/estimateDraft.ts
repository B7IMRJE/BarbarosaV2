import AsyncStorage from '@react-native-async-storage/async-storage';

const ESTIMATE_DRAFT_KEY = 'homeos_estimate_draft_v1';

export type EstimateDraftScope = {
    userId: string;
    companyId: string;
    propertyId?: string | null;
};

export type EstimateDraftSource = 'provider_mode' | 'management' | 'homeos';

export type EstimateDraftItem = {
    id: string;
    property_id: string | null;
    customer_home_name?: string | null;
    name: string;
    item_slug: string;
    system: string;
    category: string;
    location: string | null;
    parent_area: string | null;
    status: string | null;
    install_state: string | null;
    company_id: string | null;
    company_user_id: string | null;
    source?: EstimateDraftSource | null;
    created_at: string | null;
};

export type EstimateDraftContext = {
    company_id: string;
    property_id: string | null;
    customer_home_name: string | null;
    service_request_id: string | null;
    job_id: string | null;
    schedule_slot_id: string | null;
    technician_company_user_id: string | null;
    technician_name: string | null;
    issue_summary: string | null;
    source: 'techos' | 'provider_mode' | 'management' | 'homeos';
    updated_at: string;
};

function isEstimateDraftItem(value: unknown): value is EstimateDraftItem {
    if (!value || typeof value !== 'object') return false;

    const item = value as Partial<EstimateDraftItem>;

    return (
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.item_slug === 'string' &&
        typeof item.system === 'string' &&
        typeof item.category === 'string'
    );
}

function draftStorageKey(scope?: EstimateDraftScope | null) {
    if (!scope) return ESTIMATE_DRAFT_KEY;

    const propertyKey = scope.propertyId ? String(scope.propertyId).trim() : 'company';

    return `${ESTIMATE_DRAFT_KEY}_${scope.userId}_${scope.companyId}_${propertyKey}`;
}

function draftContextStorageKey(scope?: EstimateDraftScope | null) {
    return `${draftStorageKey(scope)}_context`;
}

function normalizeDraftItem(item: EstimateDraftItem): EstimateDraftItem {
    return {
        id: item.id,
        property_id: item.property_id || null,
        customer_home_name: item.customer_home_name || null,
        name: item.name,
        item_slug: item.item_slug,
        system: item.system,
        category: item.category,
        location: item.location || null,
        parent_area: item.parent_area || null,
        status: item.status || null,
        install_state: item.install_state || null,
        company_id: item.company_id || null,
        company_user_id: item.company_user_id || null,
        source: item.source || null,
        created_at: item.created_at || null,
    };
}

export async function loadEstimateDraft(scope?: EstimateDraftScope | null) {
    const rawDraft = await AsyncStorage.getItem(draftStorageKey(scope));

    if (!rawDraft) return [];

    try {
        const parsedDraft = JSON.parse(rawDraft);
        if (!Array.isArray(parsedDraft)) return [];

        return parsedDraft.filter(isEstimateDraftItem).map(normalizeDraftItem);
    } catch {
        return [];
    }
}

export async function saveEstimateDraft(items: EstimateDraftItem[], scope?: EstimateDraftScope | null) {
    await AsyncStorage.setItem(draftStorageKey(scope), JSON.stringify(items.map(normalizeDraftItem)));
}

export async function addItemToEstimateDraft(item: EstimateDraftItem, scope?: EstimateDraftScope | null) {
    const currentItems = await loadEstimateDraft(scope);
    const alreadyAdded = currentItems.some((currentItem) => currentItem.id === item.id);

    if (alreadyAdded) return currentItems;

    const nextItems = [...currentItems, normalizeDraftItem(item)];
    await saveEstimateDraft(nextItems, scope);

    return nextItems;
}

export async function removeItemFromEstimateDraft(id: string, scope?: EstimateDraftScope | null) {
    const currentItems = await loadEstimateDraft(scope);
    const nextItems = currentItems.filter((item) => item.id !== id);

    await saveEstimateDraft(nextItems, scope);

    return nextItems;
}

export async function clearEstimateDraft(scope?: EstimateDraftScope | null) {
    await AsyncStorage.removeItem(draftStorageKey(scope));
    await AsyncStorage.removeItem(draftContextStorageKey(scope));
}

export async function loadEstimateDraftContext(scope?: EstimateDraftScope | null) {
    const rawContext = await AsyncStorage.getItem(draftContextStorageKey(scope));

    if (!rawContext) return null;

    try {
        return normalizeEstimateDraftContext(JSON.parse(rawContext));
    } catch {
        return null;
    }
}

export async function saveEstimateDraftContext(context: EstimateDraftContext, scope?: EstimateDraftScope | null) {
    await AsyncStorage.setItem(draftContextStorageKey(scope), JSON.stringify(normalizeEstimateDraftContext(context)));
}

function normalizeEstimateDraftContext(value: unknown): EstimateDraftContext | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as Partial<EstimateDraftContext>;
    const companyId = readText(record.company_id);

    if (!companyId) return null;

    return {
        company_id: companyId,
        property_id: readNullableText(record.property_id),
        customer_home_name: readNullableText(record.customer_home_name),
        service_request_id: readNullableText(record.service_request_id),
        job_id: readNullableText(record.job_id),
        schedule_slot_id: readNullableText(record.schedule_slot_id),
        technician_company_user_id: readNullableText(record.technician_company_user_id),
        technician_name: readNullableText(record.technician_name),
        issue_summary: readNullableText(record.issue_summary),
        source: normalizeEstimateDraftContextSource(record.source),
        updated_at: readText(record.updated_at) || new Date().toISOString(),
    };
}

function normalizeEstimateDraftContextSource(value: unknown): EstimateDraftContext['source'] {
    const source = readText(value);

    return ['techos', 'provider_mode', 'management', 'homeos'].includes(source)
        ? source as EstimateDraftContext['source']
        : 'techos';
}

function readNullableText(value: unknown) {
    const text = readText(value);

    return text || null;
}

function readText(value: unknown) {
    return String(value || '').trim();
}
