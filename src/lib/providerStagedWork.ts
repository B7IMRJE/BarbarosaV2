import AsyncStorage from '@react-native-async-storage/async-storage';

const PROVIDER_STAGED_WORK_KEY = 'homeos_provider_staged_work_v1';

export type ProviderStagedWorkType =
    | 'note'
    | 'finding'
    | 'photo'
    | 'document'
    | 'edit'
    | 'related_item'
    | 'archive_request'
    | 'client_update_mark';

export type ProviderStagedWorkPayloadValue =
    | string
    | number
    | boolean
    | null
    | ProviderStagedWorkPayloadValue[]
    | { [key: string]: ProviderStagedWorkPayloadValue };

export type ProviderStagedWorkPayload = Record<string, ProviderStagedWorkPayloadValue>;

export type ProviderStagedWorkEntry = {
    id: string;
    type: ProviderStagedWorkType;
    company_id: string;
    property_id: string;
    item_id: string | null;
    item_slug: string | null;
    item_name: string;
    system: string | null;
    location: string | null;
    category: string | null;
    created_at: string;
    created_by: string | null;
    payload: ProviderStagedWorkPayload;
};

type ProviderStagedWorkScope = {
    companyId: string;
    propertyId: string;
    itemId?: string | null;
    itemSlug?: string | null;
};

type ProviderStagedWorkInput = Omit<ProviderStagedWorkEntry, 'id' | 'created_at'> & {
    id?: string;
    created_at?: string;
};

type WebStorage = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
};

export function providerStagedWorkTypeLabel(type: ProviderStagedWorkType) {
    const labels: Record<ProviderStagedWorkType, string> = {
        note: 'Note',
        finding: 'Finding',
        photo: 'Photo Intent',
        document: 'Document Intent',
        edit: 'Edit Draft',
        related_item: 'Related Item',
        archive_request: 'Archive Request',
        client_update_mark: 'Client Update Mark',
    };

    return labels[type];
}

export async function loadProviderStagedWork(scope: ProviderStagedWorkScope) {
    const entries = await readProviderStagedWork(scope.companyId, scope.propertyId);

    return entries
        .filter((entry) => matchesScope(entry, scope))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addProviderStagedWork(input: ProviderStagedWorkInput) {
    const nextEntry: ProviderStagedWorkEntry = {
        ...input,
        id: input.id || createLocalId(),
        created_at: input.created_at || new Date().toISOString(),
    };
    const currentEntries = await readProviderStagedWork(input.company_id, input.property_id);
    const nextEntries = [nextEntry, ...currentEntries.filter((entry) => entry.id !== nextEntry.id)];

    await writeProviderStagedWork(input.company_id, input.property_id, nextEntries);

    return nextEntry;
}

export async function clearProviderStagedWorkForItem(scope: ProviderStagedWorkScope) {
    const currentEntries = await readProviderStagedWork(scope.companyId, scope.propertyId);
    const nextEntries = currentEntries.filter((entry) => !matchesScope(entry, scope));

    await writeProviderStagedWork(scope.companyId, scope.propertyId, nextEntries);

    return nextEntries;
}

function matchesScope(entry: ProviderStagedWorkEntry, scope: ProviderStagedWorkScope) {
    if (entry.company_id !== scope.companyId || entry.property_id !== scope.propertyId) {
        return false;
    }

    const itemId = scope.itemId ? String(scope.itemId) : '';
    const itemSlug = scope.itemSlug ? String(scope.itemSlug) : '';

    if (!itemId && !itemSlug) return true;
    if (itemId && entry.item_id === itemId) return true;
    if (itemSlug && entry.item_slug === itemSlug) return true;

    return false;
}

async function readProviderStagedWork(companyId: string, propertyId: string) {
    const rawEntries = await readRaw(storageKey(companyId, propertyId));

    if (!rawEntries) return [];

    try {
        const parsedEntries = JSON.parse(rawEntries);

        if (!Array.isArray(parsedEntries)) return [];

        return parsedEntries.filter(isProviderStagedWorkEntry);
    } catch {
        return [];
    }
}

async function writeProviderStagedWork(companyId: string, propertyId: string, entries: ProviderStagedWorkEntry[]) {
    await writeRaw(storageKey(companyId, propertyId), JSON.stringify(entries));
}

function isProviderStagedWorkEntry(value: unknown): value is ProviderStagedWorkEntry {
    if (!value || typeof value !== 'object') return false;

    const entry = value as Partial<ProviderStagedWorkEntry>;

    return (
        typeof entry.id === 'string' &&
        isProviderStagedWorkType(entry.type) &&
        typeof entry.company_id === 'string' &&
        typeof entry.property_id === 'string' &&
        typeof entry.item_name === 'string' &&
        typeof entry.created_at === 'string' &&
        isPayload(entry.payload)
    );
}

function isProviderStagedWorkType(value: unknown): value is ProviderStagedWorkType {
    return (
        value === 'note' ||
        value === 'finding' ||
        value === 'photo' ||
        value === 'document' ||
        value === 'edit' ||
        value === 'related_item' ||
        value === 'archive_request' ||
        value === 'client_update_mark'
    );
}

function isPayload(value: unknown): value is ProviderStagedWorkPayload {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function storageKey(companyId: string, propertyId: string) {
    return `${PROVIDER_STAGED_WORK_KEY}_${companyId}_${propertyId}`;
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

    return cryptoLike?.randomUUID?.() || `staged-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
