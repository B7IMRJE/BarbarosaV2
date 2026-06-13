import AsyncStorage from '@react-native-async-storage/async-storage';

const ESTIMATE_DRAFT_KEY = 'homeos_estimate_draft_v1';

export type EstimateDraftItem = {
    id: string;
    name: string;
    item_slug: string;
    system: string;
    category: string;
    status: string | null;
    install_state: string | null;
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

export async function loadEstimateDraft() {
    const rawDraft = await AsyncStorage.getItem(ESTIMATE_DRAFT_KEY);

    if (!rawDraft) return [];

    try {
        const parsedDraft = JSON.parse(rawDraft);
        if (!Array.isArray(parsedDraft)) return [];

        return parsedDraft.filter(isEstimateDraftItem);
    } catch {
        return [];
    }
}

export async function saveEstimateDraft(items: EstimateDraftItem[]) {
    await AsyncStorage.setItem(ESTIMATE_DRAFT_KEY, JSON.stringify(items));
}

export async function addItemToEstimateDraft(item: EstimateDraftItem) {
    const currentItems = await loadEstimateDraft();
    const alreadyAdded = currentItems.some((currentItem) => currentItem.id === item.id);

    if (alreadyAdded) return currentItems;

    const nextItems = [...currentItems, item];
    await saveEstimateDraft(nextItems);

    return nextItems;
}

export async function removeItemFromEstimateDraft(id: string) {
    const currentItems = await loadEstimateDraft();
    const nextItems = currentItems.filter((item) => item.id !== id);

    await saveEstimateDraft(nextItems);

    return nextItems;
}

export async function clearEstimateDraft() {
    await AsyncStorage.removeItem(ESTIMATE_DRAFT_KEY);
}
