import type { ServiceRequestMediaDraft, ServiceRequestMediaType } from './serviceRequestMedia';
import { SERVICE_REQUEST_MEDIA_BUCKET, sanitizeServiceRequestMediaFileName } from './serviceRequestMedia';
import { supabase } from './supabase';

export type ServiceRequestPhoneHandoff = {
    id: string;
    token: string;
    expiresAt: string;
};

type HandoffItem = {
    id: string;
    media_type: ServiceRequestMediaType;
    storage_path: string;
    file_name: string;
    mime_type: string;
    size_bytes: number | null;
    duration_seconds: number | null;
    created_at: string;
    discarded_at?: string | null;
};

type HandoffPayload = {
    handoff_id: string;
    property_id: string;
    context_label: string;
    expires_at: string;
    items: HandoffItem[];
};

export async function createServiceRequestPhoneHandoff(propertyId: string, contextLabel: string) {
    const { data, error } = await supabase.rpc('create_service_request_media_handoff', {
        p_property_id: propertyId,
        p_context_label: contextLabel,
    });
    if (error) throw new Error(error.message || 'Could not start phone photo capture.');
    const row = Array.isArray(data) ? data[0] : data;
    const id = readString(row?.handoff_id);
    const token = readString(row?.handoff_token);
    const expiresAt = readString(row?.expires_at);
    if (!id || !token || !expiresAt) throw new Error('Phone photo capture did not return a valid link.');
    return { id, token, expiresAt } satisfies ServiceRequestPhoneHandoff;
}

export async function loadServiceRequestPhoneHandoff(id: string, token: string) {
    const { data, error } = await supabase.rpc('get_service_request_media_handoff', {
        p_handoff_id: id,
        p_token: token,
    });
    if (error) throw new Error(error.message || 'Could not open this phone photo link.');
    if (!data || typeof data !== 'object') throw new Error('This phone link has expired. Start a new one on the request screen.');
    return data as HandoffPayload;
}

export async function uploadServiceRequestPhoneMedia(
    handoff: Pick<ServiceRequestPhoneHandoff, 'id' | 'token'>,
    item: ServiceRequestMediaDraft,
) {
    const itemId = createId();
    const storagePath = [
        'handoffs', handoff.id, handoff.token, itemId, sanitizeServiceRequestMediaFileName(item.fileName),
    ].join('/');
    const response = await fetch(item.uri);
    if (!response.ok) throw new Error('The selected media file could not be read.');
    const { error: uploadError } = await supabase.storage.from(SERVICE_REQUEST_MEDIA_BUCKET).upload(
        storagePath,
        await response.arrayBuffer(),
        { contentType: item.mimeType, cacheControl: '900', upsert: false },
    );
    if (uploadError) throw new Error(uploadError.message || 'The phone upload failed.');

    const { error } = await supabase.rpc('save_service_request_media_handoff_item', {
        p_handoff_id: handoff.id,
        p_token: handoff.token,
        p_item_id: itemId,
        p_media_type: item.mediaType,
        p_storage_path: storagePath,
        p_file_name: item.fileName,
        p_mime_type: item.mimeType,
        p_size_bytes: item.sizeBytes,
        p_duration_seconds: item.durationSeconds,
    });
    if (error) {
        await supabase.storage.from(SERVICE_REQUEST_MEDIA_BUCKET).remove([storagePath]);
        throw new Error(error.message || 'The phone upload could not be attached.');
    }
}

export async function loadPhoneHandoffMediaAsDrafts(handoff: ServiceRequestPhoneHandoff) {
    const payload = await loadServiceRequestPhoneHandoff(handoff.id, handoff.token);
    return phoneItemsAsDrafts(payload.items || []);
}

export async function loadOwnedPhoneHandoffDrafts(handoffIds: string[]) {
    if (!handoffIds.length) return [];
    const { data, error } = await supabase.from('service_request_media_handoff_items').select('*').in('handoff_id', handoffIds).is('discarded_at', null);
    if (error) throw new Error('Could not restore your phone photos. Please retry.');
    return phoneItemsAsDrafts((data || []) as HandoffItem[]);
}

export async function discardPhoneHandoffMedia(localId: string) {
    if (!localId.startsWith('phone-')) return;
    const { error } = await supabase.rpc('discard_my_service_request_phone_media', { p_item_id: localId.slice(6) });
    if (error) throw new Error(error.message || 'The phone photo could not be removed. Please retry.');
}

export async function collectPhoneMediaForSubmission(handoffIds: string[], existing: ServiceRequestMediaDraft[]) {
    const ids = Array.from(new Set(handoffIds));
    if (!ids.length) return existing;
    const { error } = await supabase.rpc('seal_my_service_request_media_handoffs', { p_handoff_ids: ids });
    if (error) throw new Error(error.message || 'Phone photos could not be collected. Please retry.');
    return mergePhoneHandoffDrafts(existing, await loadOwnedPhoneHandoffDrafts(ids));
}

async function phoneItemsAsDrafts(items: HandoffItem[]) {
    return Promise.all(items.filter(item => !item.discarded_at).map(async (item): Promise<ServiceRequestMediaDraft> => {
        const { data } = await supabase.storage.from(SERVICE_REQUEST_MEDIA_BUCKET).createSignedUrl(item.storage_path, 60 * 20);
        return {
            localId: `phone-${item.id}`,
            mediaType: item.media_type,
            uri: data?.signedUrl || '',
            fileName: item.file_name,
            mimeType: item.mime_type,
            sizeBytes: item.size_bytes,
            durationSeconds: item.duration_seconds,
            caption: '',
            status: 'selected',
            bucket: SERVICE_REQUEST_MEDIA_BUCKET,
            storagePath: item.storage_path,
            signedUrl: data?.signedUrl || null,
            createdAt: item.created_at,
            uploaderRole: 'homeowner',
            uploaderName: 'Added from phone',
        };
    }));
}

export async function finishServiceRequestPhoneHandoff(handoff: ServiceRequestPhoneHandoff, drafts: ServiceRequestMediaDraft[]) {
    const paths = drafts.filter((item) => item.localId.startsWith('phone-')).map((item) => item.storagePath).filter((path): path is string => Boolean(path?.startsWith(`handoffs/${handoff.id}/`)));
    if (paths.length) await supabase.storage.from(SERVICE_REQUEST_MEDIA_BUCKET).remove(paths);
    await supabase.rpc('close_service_request_media_handoff', { p_handoff_id: handoff.id });
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function mergePhoneHandoffDrafts(existing: ServiceRequestMediaDraft[], incoming: ServiceRequestMediaDraft[]) {
    const byId = new Map(existing.map(item => [item.localId, item]));
    for (const item of incoming) {
        const previous = byId.get(item.localId);
        byId.set(item.localId, previous && ['saved', 'uploading', 'removing'].includes(previous.status)
            ? previous
            : previous ? { ...item, caption: previous.caption } : item);
    }
    return Array.from(byId.values());
}
