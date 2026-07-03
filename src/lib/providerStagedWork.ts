import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

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

export type ProviderStagedWorkStatus = 'draft' | 'staged' | 'published' | 'rejected';

export type ProviderStagedWorkSource = 'provider_staging' | 'local';

export type ProviderStagingBackendStatus =
    | { status: 'connected'; message: string }
    | { status: 'fallback'; message: string }
    | { status: 'error'; message: string };

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
    status: ProviderStagedWorkStatus;
    source: ProviderStagedWorkSource;
    payload: ProviderStagedWorkPayload;
};

type ProviderStagedWorkScope = {
    companyId: string;
    propertyId: string;
    itemId?: string | null;
    itemSlug?: string | null;
};

type ProviderStagedWorkInput = Omit<ProviderStagedWorkEntry, 'id' | 'created_at' | 'source' | 'status'> & {
    id?: string;
    created_at?: string;
    status?: ProviderStagedWorkStatus;
};

export type ProviderStagedWorkClearResult = {
    source: ProviderStagedWorkSource;
    remainingEntries: ProviderStagedWorkEntry[];
};

export type ProviderStagedWorkLoadResult = {
    entries: ProviderStagedWorkEntry[];
    backendStatus: ProviderStagingBackendStatus;
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
    status?: unknown;
};

export function providerStagedWorkTypeLabel(type: ProviderStagedWorkType) {
    const labels: Record<ProviderStagedWorkType, string> = {
        note: 'Note',
        finding: 'Finding',
        photo: 'Photo',
        document: 'Document Intent',
        edit: 'Edit Draft',
        related_item: 'Related Item',
        archive_request: 'Archive Request',
        client_update_mark: 'Client Update Mark',
    };

    return labels[type];
}

export async function loadProviderStagedWork(scope: ProviderStagedWorkScope) {
    const result = await loadProviderStagedWorkWithStatus(scope);

    return result.entries;
}

export async function loadProviderStagedWorkWithStatus(
    scope: ProviderStagedWorkScope
): Promise<ProviderStagedWorkLoadResult> {
    const backendEntries = await loadProviderStagedWorkFromBackend(scope);
    const localEntries = await loadLocalEntriesForScope(scope);

    if (backendEntries) {
        return {
            entries: sortEntries([...backendEntries, ...localEntries]),
            backendStatus: {
                status: 'connected',
                message: 'Provider staging backend: connected',
            },
        };
    }

    return {
        entries: localEntries,
        backendStatus: {
            status: 'fallback',
            message: 'Provider staging backend unavailable: using local fallback',
        },
    };
}

export async function addProviderStagedWork(input: ProviderStagedWorkInput) {
    const backendEntry = await addProviderStagedWorkToBackend(input);

    if (backendEntry) {
        return backendEntry;
    }

    return addProviderStagedWorkToLocal(input);
}

export async function clearProviderStagedWorkForItem(
    scope: ProviderStagedWorkScope
): Promise<ProviderStagedWorkClearResult> {
    const backendCleared = await clearProviderStagedWorkInBackend(scope);

    if (backendCleared) {
        return {
            source: 'provider_staging',
            remainingEntries: await loadLocalEntriesForScope(scope),
        };
    }

    const remainingEntries = await clearProviderStagedWorkInLocal(scope);

    return {
        source: 'local',
        remainingEntries,
    };
}

async function loadProviderStagedWorkFromBackend(scope: ProviderStagedWorkScope) {
    try {
        const { data, error } = await supabase.rpc('get_provider_staged_work', {
            p_company_id: scope.companyId,
            p_property_id: scope.propertyId,
            p_item_id: scope.itemId || null,
            p_item_slug: scope.itemSlug || null,
        });

        if (error) {
            if (await shouldUseLocalFallbackForBackendError(error)) {
                return null;
            }

            throw new Error(`Could not load provider staging: ${getSupabaseErrorText(error)}`);
        }

        const rows = Array.isArray(data) ? data : [];

        return rows
            .map(readBackendEntry)
            .filter((entry): entry is ProviderStagedWorkEntry => Boolean(entry))
            .filter((entry) => entry.status !== 'rejected')
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    } catch (error) {
        if (await shouldUseLocalFallbackForBackendError(error)) {
            return null;
        }

        throw error;
    }
}

async function addProviderStagedWorkToBackend(input: ProviderStagedWorkInput) {
    try {
        const { data, error } = await supabase.rpc('create_provider_staged_work', {
            p_company_id: input.company_id,
            p_property_id: input.property_id,
            p_item_id: input.item_id || null,
            p_item_slug: input.item_slug || null,
            p_item_name: input.item_name,
            p_system: input.system,
            p_location: input.location,
            p_category: input.category,
            p_type: input.type,
            p_payload: input.payload,
            p_status: input.status || 'draft',
        });

        if (error) {
            if (await shouldUseLocalFallbackForBackendError(error)) {
                return null;
            }

            throw new Error(`Could not save provider staging: ${getSupabaseErrorText(error)}`);
        }

        const rows = Array.isArray(data) ? data : data ? [data] : [];
        const savedEntry = rows.map(readBackendEntry).find(Boolean);

        if (!savedEntry) {
            throw new Error('Provider staging did not return a saved entry.');
        }

        return savedEntry;
    } catch (error) {
        if (await shouldUseLocalFallbackForBackendError(error)) {
            return null;
        }

        throw error;
    }
}

async function clearProviderStagedWorkInBackend(scope: ProviderStagedWorkScope) {
    try {
        const { error } = await supabase.rpc('clear_provider_staged_work_for_item', {
            p_company_id: scope.companyId,
            p_property_id: scope.propertyId,
            p_item_id: scope.itemId || null,
            p_item_slug: scope.itemSlug || null,
        });

        if (error) {
            if (await shouldUseLocalFallbackForBackendError(error)) {
                return false;
            }

            throw new Error(`Could not clear provider staging: ${getSupabaseErrorText(error)}`);
        }

        return true;
    } catch (error) {
        if (await shouldUseLocalFallbackForBackendError(error)) {
            return false;
        }

        throw error;
    }
}

async function addProviderStagedWorkToLocal(input: ProviderStagedWorkInput) {
    const nextEntry: ProviderStagedWorkEntry = {
        ...input,
        id: input.id || createLocalId(),
        created_at: input.created_at || new Date().toISOString(),
        status: input.status || 'draft',
        source: 'local',
    };
    const currentEntries = await readLocalProviderStagedWork(input.company_id, input.property_id);
    const nextEntries = [nextEntry, ...currentEntries.filter((entry) => entry.id !== nextEntry.id)];

    await writeLocalProviderStagedWork(input.company_id, input.property_id, nextEntries);

    return nextEntry;
}

async function clearProviderStagedWorkInLocal(scope: ProviderStagedWorkScope) {
    const currentEntries = await readLocalProviderStagedWork(scope.companyId, scope.propertyId);
    const nextEntries = currentEntries.filter((entry) => !matchesScope(entry, scope));

    await writeLocalProviderStagedWork(scope.companyId, scope.propertyId, nextEntries);

    return nextEntries;
}

async function loadLocalEntriesForScope(scope: ProviderStagedWorkScope) {
    const entries = await readLocalProviderStagedWork(scope.companyId, scope.propertyId);

    return sortEntries(
        entries
            .filter((entry) => matchesScope(entry, scope))
            .filter((entry) => entry.status !== 'rejected')
    );
}

function sortEntries(entries: ProviderStagedWorkEntry[]) {
    return [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
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

async function readLocalProviderStagedWork(companyId: string, propertyId: string) {
    const rawEntries = await readRaw(storageKey(companyId, propertyId));

    if (!rawEntries) return [];

    try {
        const parsedEntries = JSON.parse(rawEntries);

        if (!Array.isArray(parsedEntries)) return [];

        return parsedEntries
            .map(readLocalEntry)
            .filter((entry): entry is ProviderStagedWorkEntry => Boolean(entry));
    } catch {
        return [];
    }
}

async function writeLocalProviderStagedWork(
    companyId: string,
    propertyId: string,
    entries: ProviderStagedWorkEntry[]
) {
    await writeRaw(storageKey(companyId, propertyId), JSON.stringify(entries));
}

function readBackendEntry(value: unknown): ProviderStagedWorkEntry | null {
    if (!value || typeof value !== 'object') return null;

    const row = value as Record<string, unknown>;
    const id = readString(row.id);
    const type = readProviderStagedWorkType(row.type);
    const companyId = readString(row.company_id);
    const propertyId = readString(row.property_id);
    const itemName = readString(row.item_name);
    const createdAt = readString(row.created_at);
    const payload = readPayload(row.payload);

    if (!id || !type || !companyId || !propertyId || !itemName || !createdAt || !payload) {
        return null;
    }

    return {
        id,
        type,
        company_id: companyId,
        property_id: propertyId,
        item_id: readNullableString(row.item_id),
        item_slug: readNullableString(row.item_slug),
        item_name: itemName,
        system: readNullableString(row.system),
        location: readNullableString(row.location),
        category: readNullableString(row.category),
        created_at: createdAt,
        created_by: readNullableString(row.created_by),
        status: readStatus(row.status),
        source: 'provider_staging',
        payload,
    };
}

function readLocalEntry(value: unknown): ProviderStagedWorkEntry | null {
    if (!value || typeof value !== 'object') return null;

    const row = value as Record<string, unknown>;
    const id = readString(row.id);
    const type = readProviderStagedWorkType(row.type);
    const companyId = readString(row.company_id);
    const propertyId = readString(row.property_id);
    const itemName = readString(row.item_name);
    const createdAt = readString(row.created_at);
    const payload = readPayload(row.payload);

    if (!id || !type || !companyId || !propertyId || !itemName || !createdAt || !payload) {
        return null;
    }

    return {
        id,
        type,
        company_id: companyId,
        property_id: propertyId,
        item_id: readNullableString(row.item_id),
        item_slug: readNullableString(row.item_slug),
        item_name: itemName,
        system: readNullableString(row.system),
        location: readNullableString(row.location),
        category: readNullableString(row.category),
        created_at: createdAt,
        created_by: readNullableString(row.created_by),
        status: readStatus(row.status),
        source: 'local',
        payload,
    };
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function readStatus(value: unknown): ProviderStagedWorkStatus {
    if (value === 'staged' || value === 'published' || value === 'rejected') {
        return value;
    }

    return 'draft';
}

function readProviderStagedWorkType(value: unknown): ProviderStagedWorkType | null {
    if (
        value === 'note' ||
        value === 'finding' ||
        value === 'photo' ||
        value === 'document' ||
        value === 'edit' ||
        value === 'related_item' ||
        value === 'archive_request' ||
        value === 'client_update_mark'
    ) {
        return value;
    }

    return null;
}

function readPayload(value: unknown): ProviderStagedWorkPayload | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as ProviderStagedWorkPayload
        : null;
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

async function shouldUseLocalFallbackForBackendError(error: unknown) {
    const text = getSupabaseErrorText(error).toLowerCase();
    const code = getSupabaseErrorCode(error);

    if (
        code === '42883' ||
        code === '42P01' ||
        (text.includes('company_provider_staged_work') && text.includes('does not exist'))
    ) {
        return true;
    }

    if (
        code === 'PGRST202' ||
        code === 'PGRST204' ||
        text.includes('could not find the function') ||
        text.includes('schema cache') ||
        text.includes('function public.get_provider_staged_work') ||
        text.includes('function public.create_provider_staged_work') ||
        text.includes('function public.clear_provider_staged_work_for_item')
    ) {
        return isProviderStagedWorkTableMissing();
    }

    return false;
}

async function isProviderStagedWorkTableMissing() {
    try {
        const { error } = await supabase
            .from('company_provider_staged_work')
            .select('id')
            .limit(1);

        if (!error) return false;

        const text = getSupabaseErrorText(error).toLowerCase();
        const code = getSupabaseErrorCode(error);

        return (
            code === '42P01' ||
            (text.includes('company_provider_staged_work') && text.includes('does not exist')) ||
            (text.includes('relation') && text.includes('does not exist'))
        );
    } catch {
        return false;
    }
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
