import type * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export const SERVICE_REQUEST_MEDIA_BUCKET = 'service-request-media';
export const SERVICE_REQUEST_MEDIA_MAX_PHOTOS = 10;
export const SERVICE_REQUEST_MEDIA_MAX_VIDEOS = 2;
export const SERVICE_REQUEST_MEDIA_MAX_VIDEO_SECONDS = 60;
export const SERVICE_REQUEST_MEDIA_MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const SERVICE_REQUEST_MEDIA_MAX_VIDEO_BYTES = 75 * 1024 * 1024;

export const serviceRequestPhotoMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
] as const;

export const serviceRequestVideoMimeTypes = [
    'video/mp4',
    'video/quicktime',
    'video/webm',
] as const;

export type ServiceRequestMediaType = 'photo' | 'video';
export type ServiceRequestMediaStatus = 'selected' | 'uploading' | 'saved' | 'failed' | 'removing';

export type ServiceRequestMediaDraft = {
    localId: string;
    attachmentId?: string;
    serviceRequestId?: string;
    mediaType: ServiceRequestMediaType;
    uri: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number | null;
    durationSeconds: number | null;
    caption: string;
    status: ServiceRequestMediaStatus;
    error?: string;
    bucket?: string;
    storagePath?: string;
    signedUrl?: string | null;
    createdAt?: string | null;
    uploaderRole?: string | null;
    uploaderName?: string | null;
};

export type ServiceRequestAttachment = {
    id: string;
    serviceRequestId: string;
    companyId: string;
    propertyId: string;
    mediaType: ServiceRequestMediaType;
    bucket: string;
    storagePath: string;
    thumbnailPath: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    durationSeconds: number | null;
    caption: string | null;
    sortOrder: number;
    createdAt: string | null;
    uploadedByUserId: string | null;
    uploaderRole: string | null;
    uploaderName: string | null;
    signedUrl?: string | null;
};

type ServiceRequestAttachmentRow = {
    id?: unknown;
    service_request_id?: unknown;
    company_id?: unknown;
    property_id?: unknown;
    media_type?: unknown;
    bucket?: unknown;
    storage_path?: unknown;
    thumbnail_path?: unknown;
    file_name?: unknown;
    mime_type?: unknown;
    size_bytes?: unknown;
    duration_seconds?: unknown;
    caption?: unknown;
    sort_order?: unknown;
    created_at?: unknown;
    uploaded_by_user_id?: unknown;
    uploader_role?: unknown;
    uploader_name?: unknown;
};

export type UploadServiceRequestMediaInput = {
    companyId: string;
    propertyId: string;
    serviceRequestId: string;
    items: ServiceRequestMediaDraft[];
    onItemChange: (localId: string, updates: Partial<ServiceRequestMediaDraft>) => void;
};

export class ServiceRequestMediaUploadError extends Error {
    readonly localId: string;
    readonly fileName: string;

    constructor(localId: string, fileName: string, message: string) {
        super(message);
        this.name = 'ServiceRequestMediaUploadError';
        this.localId = localId;
        this.fileName = fileName;
    }
}

export function createServiceRequestMediaDraftFromAsset(
    asset: ImagePicker.ImagePickerAsset,
    requestedType?: ServiceRequestMediaType
): ServiceRequestMediaDraft {
    const mediaType = requestedType || inferServiceRequestMediaType(asset);
    const fallbackExtension = mediaType === 'video' ? 'mp4' : 'jpg';
    const fallbackName = `service-request-${Date.now()}.${fallbackExtension}`;
    const fileName = sanitizeServiceRequestMediaFileName(asset.fileName || fallbackName);
    const mimeType = normalizeMimeType(asset.mimeType, mediaType, fileName);

    return {
        localId: createAttachmentId(),
        mediaType,
        uri: asset.uri,
        fileName,
        mimeType,
        sizeBytes: typeof asset.fileSize === 'number' ? asset.fileSize : null,
        durationSeconds: mediaType === 'video' ? normalizeDurationSeconds(asset.duration) : null,
        caption: '',
        status: 'selected',
    };
}

export function validateServiceRequestMediaDraft(
    draft: Pick<ServiceRequestMediaDraft, 'mediaType' | 'mimeType' | 'sizeBytes' | 'durationSeconds' | 'fileName'>
) {
    const allowedMimeTypes = draft.mediaType === 'photo'
        ? serviceRequestPhotoMimeTypes
        : serviceRequestVideoMimeTypes;
    const maxBytes = draft.mediaType === 'photo'
        ? SERVICE_REQUEST_MEDIA_MAX_PHOTO_BYTES
        : SERVICE_REQUEST_MEDIA_MAX_VIDEO_BYTES;

    if (!allowedMimeTypes.includes(draft.mimeType as never)) {
        return `${draft.fileName} is not a supported ${draft.mediaType} type.`;
    }

    if (typeof draft.sizeBytes === 'number' && draft.sizeBytes > maxBytes) {
        return `${draft.fileName} is too large. ${draft.mediaType === 'photo' ? 'Photos' : 'Videos'} must be ${formatBytes(maxBytes)} or smaller.`;
    }

    if (draft.mediaType === 'video' && typeof draft.durationSeconds !== 'number') {
        return `${draft.fileName} could not be checked. Choose a video with a verifiable duration.`;
    }

    if (
        draft.mediaType === 'video' &&
        typeof draft.durationSeconds === 'number' &&
        draft.durationSeconds > SERVICE_REQUEST_MEDIA_MAX_VIDEO_SECONDS
    ) {
        return `${draft.fileName} is too long. Videos must be ${SERVICE_REQUEST_MEDIA_MAX_VIDEO_SECONDS} seconds or shorter.`;
    }

    return '';
}

export function validateServiceRequestMediaSelection(items: ServiceRequestMediaDraft[]) {
    const photoCount = items.filter((item) => item.mediaType === 'photo' && item.status !== 'removing').length;
    const videoCount = items.filter((item) => item.mediaType === 'video' && item.status !== 'removing').length;

    if (photoCount > SERVICE_REQUEST_MEDIA_MAX_PHOTOS) {
        return `You can attach up to ${SERVICE_REQUEST_MEDIA_MAX_PHOTOS} photos.`;
    }

    if (videoCount > SERVICE_REQUEST_MEDIA_MAX_VIDEOS) {
        return `You can attach up to ${SERVICE_REQUEST_MEDIA_MAX_VIDEOS} videos.`;
    }

    for (const item of items) {
        const itemError = validateServiceRequestMediaDraft(item);
        if (itemError) return itemError;
    }

    return '';
}

export function hasUnresolvedServiceRequestMedia(items: ServiceRequestMediaDraft[]) {
    return items.some((item) => item.status === 'uploading' || item.status === 'removing');
}

export function buildServiceRequestMediaStoragePath(input: {
    companyId: string;
    propertyId: string;
    serviceRequestId: string;
    attachmentId: string;
    fileName: string;
}) {
    return [
        'companies',
        input.companyId,
        'properties',
        input.propertyId,
        'service-requests',
        input.serviceRequestId,
        input.attachmentId,
        sanitizeServiceRequestMediaFileName(input.fileName),
    ].join('/');
}

export async function uploadPendingServiceRequestMedia(input: UploadServiceRequestMediaInput) {
    const selectionError = validateServiceRequestMediaSelection(input.items);

    if (selectionError) {
        throw new Error(selectionError);
    }

    const uploaded: ServiceRequestAttachment[] = [];

    for (let index = 0; index < input.items.length; index += 1) {
        const item = input.items[index];

        if (item.status === 'saved') continue;

        const itemError = validateServiceRequestMediaDraft(item);
        if (itemError) {
            input.onItemChange(item.localId, { status: 'failed', error: itemError });
            throw new ServiceRequestMediaUploadError(item.localId, item.fileName, itemError);
        }

        const attachmentId = createAttachmentId();
        const storagePath = buildServiceRequestMediaStoragePath({
            companyId: input.companyId,
            propertyId: input.propertyId,
            serviceRequestId: input.serviceRequestId,
            attachmentId,
            fileName: item.fileName,
        });

        input.onItemChange(item.localId, {
            attachmentId,
            bucket: SERVICE_REQUEST_MEDIA_BUCKET,
            storagePath,
            serviceRequestId: input.serviceRequestId,
            status: 'uploading',
            error: '',
        });

        try {
            const body = await fetchMediaBody(item.uri);
            const { error: uploadError } = await supabase.storage
                .from(SERVICE_REQUEST_MEDIA_BUCKET)
                .upload(storagePath, body, {
                    cacheControl: '3600',
                    contentType: item.mimeType,
                    upsert: false,
                });

            if (uploadError) {
                throw new Error(uploadError.message || 'Upload failed.');
            }

            const saved = await saveServiceRequestAttachment({
                attachmentId,
                serviceRequestId: input.serviceRequestId,
                mediaType: item.mediaType,
                fileName: item.fileName,
                mimeType: item.mimeType,
                sizeBytes: item.sizeBytes,
                durationSeconds: item.durationSeconds,
                caption: item.caption,
                sortOrder: index,
            });

            input.onItemChange(item.localId, {
                attachmentId: saved.id,
                serviceRequestId: saved.serviceRequestId,
                bucket: saved.bucket,
                storagePath: saved.storagePath,
                signedUrl: await createServiceRequestAttachmentSignedUrl(saved),
                createdAt: saved.createdAt,
                uploaderName: saved.uploaderName,
                uploaderRole: saved.uploaderRole,
                status: 'saved',
                error: '',
            });
            uploaded.push(saved);
        } catch (error) {
            await supabase.storage.from(SERVICE_REQUEST_MEDIA_BUCKET).remove([storagePath]);
            const message = getErrorMessage(error);
            input.onItemChange(item.localId, { status: 'failed', error: message });
            throw new ServiceRequestMediaUploadError(item.localId, item.fileName, message);
        }
    }

    return uploaded;
}

export async function loadServiceRequestAttachments(serviceRequestId: string) {
    const { data, error } = await supabase.rpc('get_service_request_attachments', {
        p_service_request_id: serviceRequestId,
    });

    if (error) {
        throw new Error(error.message || 'Request media could not be loaded.');
    }

    const attachments = mapServiceRequestAttachmentRows(data);
    const withSignedUrls = await Promise.all(
        attachments.map(async (attachment) => ({
            ...attachment,
            signedUrl: await createServiceRequestAttachmentSignedUrl(attachment),
        }))
    );

    return withSignedUrls;
}

export async function createServiceRequestAttachmentSignedUrl(attachment: Pick<ServiceRequestAttachment, 'bucket' | 'storagePath'>) {
    const { data, error } = await supabase.storage
        .from(attachment.bucket)
        .createSignedUrl(attachment.storagePath, 60 * 30);

    if (error) return null;

    return data?.signedUrl || null;
}

export async function removeServiceRequestAttachment(attachment: Pick<ServiceRequestAttachment, 'id' | 'bucket' | 'storagePath'>) {
    const { error: removeError } = await supabase.storage
        .from(attachment.bucket)
        .remove([attachment.storagePath]);

    if (removeError) {
        throw new Error(removeError.message || 'Media file could not be removed.');
    }

    const { error } = await supabase.rpc('delete_service_request_attachment', {
        p_attachment_id: attachment.id,
    });

    if (error) {
        throw new Error(error.message || 'Media metadata could not be removed.');
    }
}

export function mapServiceRequestAttachmentRows(data: unknown): ServiceRequestAttachment[] {
    if (!Array.isArray(data)) return [];

    return data
        .map(readServiceRequestAttachmentRow)
        .filter((attachment): attachment is ServiceRequestAttachment => !!attachment);
}

export function serviceRequestMediaStatusLabel(status: ServiceRequestMediaStatus) {
    const labels: Record<ServiceRequestMediaStatus, string> = {
        selected: 'Selected',
        uploading: 'Uploading',
        saved: 'Saved',
        failed: 'Failed',
        removing: 'Removing',
    };

    return labels[status];
}

export function serviceRequestMediaLimitSummary() {
    return `${SERVICE_REQUEST_MEDIA_MAX_PHOTOS} photos up to ${formatBytes(SERVICE_REQUEST_MEDIA_MAX_PHOTO_BYTES)} each; ${SERVICE_REQUEST_MEDIA_MAX_VIDEOS} videos up to ${SERVICE_REQUEST_MEDIA_MAX_VIDEO_SECONDS} seconds and ${formatBytes(SERVICE_REQUEST_MEDIA_MAX_VIDEO_BYTES)} each.`;
}

function readServiceRequestAttachmentRow(value: unknown): ServiceRequestAttachment | null {
    const row = value && typeof value === 'object' ? value as ServiceRequestAttachmentRow : null;
    if (!row) return null;

    const id = readString(row.id);
    const serviceRequestId = readString(row.service_request_id);
    const companyId = readString(row.company_id);
    const propertyId = readString(row.property_id);
    const mediaType = normalizeMediaType(readString(row.media_type));
    const bucket = readString(row.bucket);
    const storagePath = readString(row.storage_path);

    if (!id || !serviceRequestId || !companyId || !propertyId || !mediaType || !bucket || !storagePath) {
        return null;
    }

    return {
        id,
        serviceRequestId,
        companyId,
        propertyId,
        mediaType,
        bucket,
        storagePath,
        thumbnailPath: readNullableString(row.thumbnail_path),
        fileName: readString(row.file_name) || 'attachment',
        mimeType: readString(row.mime_type) || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
        sizeBytes: readNumber(row.size_bytes),
        durationSeconds: readNullableNumber(row.duration_seconds),
        caption: readNullableString(row.caption),
        sortOrder: readNumber(row.sort_order),
        createdAt: readNullableString(row.created_at),
        uploadedByUserId: readNullableString(row.uploaded_by_user_id),
        uploaderRole: readNullableString(row.uploader_role),
        uploaderName: readNullableString(row.uploader_name),
    };
}

async function saveServiceRequestAttachment(input: {
    attachmentId: string;
    serviceRequestId: string;
    mediaType: ServiceRequestMediaType;
    fileName: string;
    mimeType: string;
    sizeBytes: number | null;
    durationSeconds: number | null;
    caption: string;
    sortOrder: number;
}) {
    const { data, error } = await supabase.rpc('save_service_request_attachment', {
        p_attachment_id: input.attachmentId,
        p_service_request_id: input.serviceRequestId,
        p_media_type: input.mediaType,
        p_file_name: input.fileName,
        p_mime_type: input.mimeType,
        p_size_bytes: input.sizeBytes,
        p_duration_seconds: input.durationSeconds,
        p_caption: input.caption.trim() || null,
        p_sort_order: input.sortOrder,
    });

    if (error) {
        throw new Error(error.message || 'Attachment metadata could not be saved.');
    }

    const saved = mapServiceRequestAttachmentRows(data)[0];
    if (!saved) {
        throw new Error('Attachment metadata was not returned after save.');
    }

    return saved;
}

async function fetchMediaBody(uri: string) {
    const response = await fetch(uri);
    if (!response.ok) {
        throw new Error('Selected media file could not be read.');
    }

    return response.arrayBuffer();
}

function inferServiceRequestMediaType(asset: ImagePicker.ImagePickerAsset): ServiceRequestMediaType {
    if (asset.type === 'video') return 'video';
    if (typeof asset.mimeType === 'string' && asset.mimeType.toLowerCase().startsWith('video/')) return 'video';
    return 'photo';
}

function normalizeMediaType(value: string): ServiceRequestMediaType | null {
    const normalized = value.toLowerCase();
    if (normalized === 'photo' || normalized === 'video') return normalized;
    return null;
}

function normalizeMimeType(value: string | null | undefined, mediaType: ServiceRequestMediaType, fileName: string) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) return normalized;

    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const extensionMimeTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        heic: 'image/heic',
        heif: 'image/heif',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
        webm: 'video/webm',
    };

    return extensionMimeTypes[extension] || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
}

function normalizeDurationSeconds(durationMilliseconds: number | null | undefined) {
    if (typeof durationMilliseconds !== 'number' || !Number.isFinite(durationMilliseconds)) return null;
    if (durationMilliseconds <= 0) return null;

    return Math.ceil(durationMilliseconds / 1000);
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
    const text = readString(value);
    return text || null;
}

function readNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return 0;
}

function readNullableNumber(value: unknown) {
    if (value === null || typeof value === 'undefined') return null;
    const numberValue = readNumber(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

export function sanitizeServiceRequestMediaFileName(value: string) {
    const clean = value
        .trim()
        .replace(/[^\w.\-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 160);

    return clean || 'service-request-media';
}

function createAttachmentId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    const random = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);

    return `${random()}${random()}-${random()}-4${random().slice(1)}-a${random().slice(1)}-${random()}${random()}${random()}`;
}

function formatBytes(value: number) {
    if (value >= 1024 * 1024) return `${Math.round(value / (1024 * 1024))} MB`;
    if (value >= 1024) return `${Math.round(value / 1024)} KB`;
    return `${value} bytes`;
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
}
