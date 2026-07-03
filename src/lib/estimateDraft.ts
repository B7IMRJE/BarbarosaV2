import AsyncStorage from '@react-native-async-storage/async-storage';

const ESTIMATE_DRAFT_KEY = 'homeos_estimate_draft_v1';

export type EstimateDraftScope = {
    userId: string;
    companyId: string;
};

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
    created_at: string | null;
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

    return `${ESTIMATE_DRAFT_KEY}_${scope.userId}_${scope.companyId}`;
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
}
