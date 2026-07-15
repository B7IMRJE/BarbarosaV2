import {
    SERVICE_REQUEST_MEDIA_MAX_PHOTOS,
    SERVICE_REQUEST_MEDIA_MAX_PHOTO_BYTES,
    SERVICE_REQUEST_MEDIA_MAX_VIDEO_SECONDS,
    SERVICE_REQUEST_MEDIA_MAX_VIDEOS,
    SERVICE_REQUEST_MEDIA_MAX_VIDEO_BYTES,
    buildServiceRequestMediaStoragePath,
    serviceRequestPhotoMimeTypes,
    serviceRequestVideoMimeTypes,
    validateServiceRequestMediaDraft,
    validateServiceRequestMediaSelection,
    type ServiceRequestMediaDraft,
} from './serviceRequestMedia';

runServiceRequestMediaRegressions();

export function runServiceRequestMediaRegressions() {
    emptyRequestMediaIsAllowed();
    supportedPhotosAndVideosPassValidation();
    unsupportedMimeTypesAreRejectedBeforeUpload();
    oversizedFilesAreRejectedBeforeUpload();
    videosWithoutVerifiableDurationAreRejectedBeforeUpload();
    longVideosAreRejectedBeforeUpload();
    photoAndVideoCountLimitsAreEnforced();
    tenantScopedStoragePathIsDeterministic();
    savedAttachmentsDoNotBlockRetrySelection();
}

function emptyRequestMediaIsAllowed() {
    assert(validateServiceRequestMediaSelection([]) === '', 'Homeowner should be able to submit a request without attachments.');
}

function supportedPhotosAndVideosPassValidation() {
    assert(serviceRequestPhotoMimeTypes.includes('image/jpeg'), 'JPEG photos should be supported.');
    assert(serviceRequestVideoMimeTypes.includes('video/mp4'), 'MP4 videos should be supported.');
    assert(validateServiceRequestMediaDraft(createDraft({ mediaType: 'photo', mimeType: 'image/jpeg', sizeBytes: 2000 })) === '', 'Supported photo should pass.');
    assert(validateServiceRequestMediaDraft(createDraft({ mediaType: 'video', mimeType: 'video/mp4', sizeBytes: 2000, durationSeconds: 30 })) === '', 'Supported short video should pass.');
}

function unsupportedMimeTypesAreRejectedBeforeUpload() {
    const message = validateServiceRequestMediaDraft(createDraft({
        mediaType: 'photo',
        mimeType: 'application/pdf',
        sizeBytes: 2000,
    }));

    assert(message.includes('not a supported photo type'), 'Unsupported MIME type should be rejected before upload.');
}

function oversizedFilesAreRejectedBeforeUpload() {
    const photoMessage = validateServiceRequestMediaDraft(createDraft({
        mediaType: 'photo',
        mimeType: 'image/jpeg',
        sizeBytes: SERVICE_REQUEST_MEDIA_MAX_PHOTO_BYTES + 1,
    }));
    const videoMessage = validateServiceRequestMediaDraft(createDraft({
        mediaType: 'video',
        mimeType: 'video/mp4',
        sizeBytes: SERVICE_REQUEST_MEDIA_MAX_VIDEO_BYTES + 1,
    }));

    assert(photoMessage.includes('too large'), 'Oversized photo should be rejected.');
    assert(videoMessage.includes('too large'), 'Oversized video should be rejected.');
}

function videosWithoutVerifiableDurationAreRejectedBeforeUpload() {
    const message = validateServiceRequestMediaDraft(createDraft({
        mediaType: 'video',
        mimeType: 'video/mp4',
        sizeBytes: 2000,
        durationSeconds: null,
    }));

    assert(message.includes('could not be checked'), 'Video without a verifiable duration should be rejected.');
}

function longVideosAreRejectedBeforeUpload() {
    const message = validateServiceRequestMediaDraft(createDraft({
        mediaType: 'video',
        mimeType: 'video/mp4',
        sizeBytes: 2000,
        durationSeconds: SERVICE_REQUEST_MEDIA_MAX_VIDEO_SECONDS + 1,
    }));

    assert(message.includes('too long'), 'Video longer than the MVP limit should be rejected.');
}

function photoAndVideoCountLimitsAreEnforced() {
    const photos = Array.from({ length: SERVICE_REQUEST_MEDIA_MAX_PHOTOS + 1 }, (_, index) => createDraft({
        localId: `photo-${index}`,
        mediaType: 'photo',
        mimeType: 'image/jpeg',
        sizeBytes: 2000,
    }));
    const videos = Array.from({ length: SERVICE_REQUEST_MEDIA_MAX_VIDEOS + 1 }, (_, index) => createDraft({
        localId: `video-${index}`,
        mediaType: 'video',
        mimeType: 'video/mp4',
        sizeBytes: 2000,
        durationSeconds: 30,
    }));

    assert(validateServiceRequestMediaSelection(photos).includes('up to 10 photos'), 'Photo count limit should be enforced.');
    assert(validateServiceRequestMediaSelection(videos).includes('up to 2 videos'), 'Video count limit should be enforced.');
}

function tenantScopedStoragePathIsDeterministic() {
    const path = buildServiceRequestMediaStoragePath({
        companyId: 'company-1',
        propertyId: 'property-1',
        serviceRequestId: 'request-1',
        attachmentId: 'attachment-1',
        fileName: 'Kitchen Leak #1.jpg',
    });

    assert(
        path === 'companies/company-1/properties/property-1/service-requests/request-1/attachment-1/Kitchen-Leak-1.jpg',
        'Request media storage path should be tenant scoped and sanitized.'
    );
}

function savedAttachmentsDoNotBlockRetrySelection() {
    const items = [
        createDraft({ localId: 'saved-1', mediaType: 'photo', mimeType: 'image/jpeg', sizeBytes: 2000, status: 'saved' }),
        createDraft({ localId: 'failed-1', mediaType: 'photo', mimeType: 'image/jpeg', sizeBytes: 2000, status: 'failed' }),
    ];

    assert(validateServiceRequestMediaSelection(items) === '', 'Saved and failed retry items should remain valid without creating a duplicate request.');
}

function createDraft(overrides: Partial<ServiceRequestMediaDraft>): ServiceRequestMediaDraft {
    return {
        localId: 'media-1',
        mediaType: 'photo',
        uri: 'file:///tmp/media.jpg',
        fileName: 'media.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2000,
        durationSeconds: null,
        caption: '',
        status: 'selected',
        ...overrides,
    };
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(message);
    }
}
