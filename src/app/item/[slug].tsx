import HomeHeader from '../../components/HomeHeader';

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    ScrollView,
    Text,
    TextInput,
    View,
    TouchableOpacity,
} from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import {
    canUseCompanyEstimateWorkflow,
    loadCurrentCompanyEstimateAccess,
    loadCurrentCompanyPermissionAccess,
    type CompanyPermissionAccess,
} from '../../lib/companyPermissions';
import { addItemToEstimateDraft, loadEstimateDraft, saveEstimateDraftContext } from '../../lib/estimateDraft';
import { inferEstimateCategoryFromDraft } from '../../lib/estimateOptions';
import { resolveEstimateOptionSession } from '../../lib/estimateSessions';
import { createJobWithFirstEvent } from '../../lib/jobs';
import {
    calculateNextDueDate,
    formatDateLabel,
    formatRecurrence,
    getMaintenancePresets,
    isRecurrenceUnit,
    labelDueStatus,
    maintenanceRecurrenceUnits,
    parseDateInputValue,
    toDateInputValue,
    type MaintenanceCompletion,
    type MaintenancePreset,
    type MaintenanceTask,
    type RecurrenceUnit,
} from '../../lib/maintenanceTimers';
import {
    providerModePath,
    providerModeItemPath,
    providerModeQueryParams,
    hasProviderModeRouteSignal,
    readProviderModeParams,
    validateProviderModeAccess,
} from '../../lib/providerMode';
import {
    buildProviderHomeItemCreateRpcArgs,
    buildProviderHomeItemsRpcArgs,
    hasAssignedProviderHomeItemsContext,
    type ProviderHomeItemRpcRow,
} from '../../lib/providerHomeItems';
import {
    filterChildHomeItems,
    resolveHomeItemChildCreateContext,
    type HomeItemHierarchyRecord,
} from '../../lib/homeItemHierarchy';
import { getProviderReturnActionLabel } from '../../lib/techosClientAccess';
import {
    addProviderStagedWork,
    clearProviderStagedWorkForItem,
    loadProviderStagedWorkWithStatus,
    providerStagedWorkTypeLabel,
    removeProviderStagedWorkEntry,
    type ProviderStagingBackendStatus,
    type ProviderStagedWorkEntry,
    type ProviderStagedWorkPayload,
    type ProviderStagedWorkType,
} from '../../lib/providerStagedWork';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

declare const __DEV__: boolean;

type ItemFile = {
    id: string;
    property_id: string | null;
    home_item_id: string | null;
    item_slug: string | null;
    user_id: string | null;
    storage_bucket: string | null;
    storage_path: string | null;
    file_url: string;
    file_name: string | null;
    file_type: string;
    category: string;
    created_at: string | null;
};

type GalleryPhoto = ItemFile & {
    isMainPhoto?: boolean;
};

type HomeItemRow = Record<string, unknown> & {
    id?: string | null;
    item_slug?: string | null;
};

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

type ProviderStagedPanel = 'none' | 'note' | 'finding' | 'edit' | 'related_item' | 'review';

type ProviderNoteDestination = 'company_only' | 'client_update';

type ProviderFindingSeverity = 'low' | 'medium' | 'high' | 'urgent';

type ItemActionGroupKey = 'components' | 'maintenance' | 'estimate' | 'provider' | 'media' | 'item';

const itemSectionTilePalettes: Record<ItemActionGroupKey, { background: string; border: string; accent: string }> = {
    components: { background: '#FFF8DF', border: '#F2DC92', accent: '#D99214' },
    maintenance: { background: '#ECFBF5', border: '#BFEEDC', accent: '#0F8A68' },
    estimate: { background: '#EEF4FF', border: '#C8DAFF', accent: '#276BDC' },
    provider: { background: '#F3EFFF', border: '#D9CCFF', accent: '#7357C8' },
    media: { background: '#EAF9FF', border: '#BCEBFA', accent: '#2C91C9' },
    item: { background: '#FFF1F4', border: '#F6CAD3', accent: '#C2415B' },
};

const photoCategories = [
    'equipment_photo',
    'serial_photo',
    'model_photo',
    'other_photo',
];

const documentCategories = [
    'manual',
    'warranty',

    'estimate',
    'accepted_option',
    'declined_option',

    'invoice',
    'receipt',

    'permit',
    'inspection',

    'service_report',
    'maintenance_record',

    'other',
];

const providerNoteDestinations: ProviderNoteDestination[] = ['company_only', 'client_update'];

const providerFindingSeverities: ProviderFindingSeverity[] = ['low', 'medium', 'high', 'urgent'];

const PROVIDER_STAGED_PHOTO_BUCKET = 'item-files';

type ProviderStagedDisplayType = ProviderStagedWorkType | 'reminder';

const providerStagedDisplayTypes: ProviderStagedDisplayType[] = [
    'photo',
    'document',
    'reminder',
    'note',
    'finding',
    'edit',
    'related_item',
    'archive_request',
    'client_update_mark',
];

const providerStagedCountLabels: Record<ProviderStagedDisplayType, { singular: string; plural: string }> = {
    photo: { singular: 'photo', plural: 'photos' },
    document: { singular: 'document', plural: 'documents' },
    reminder: { singular: 'reminder', plural: 'reminders' },
    note: { singular: 'note', plural: 'notes' },
    finding: { singular: 'finding', plural: 'findings' },
    edit: { singular: 'edit', plural: 'edits' },
    related_item: { singular: 'related item', plural: 'related items' },
    archive_request: { singular: 'archive request', plural: 'archive requests' },
    client_update_mark: { singular: 'client update mark', plural: 'client update marks' },
};

const documentCategoryLabels: Record<string, { singular: string; plural: string }> = {
    manual: { singular: 'Manual', plural: 'Manuals' },
    warranty: { singular: 'Warranty', plural: 'Warranties' },
    estimate: { singular: 'Estimate', plural: 'Estimates' },
    accepted_option: { singular: 'Accepted Option', plural: 'Accepted Options' },
    declined_option: { singular: 'Declined Option', plural: 'Declined Options' },
    invoice: { singular: 'Invoice', plural: 'Invoices' },
    receipt: { singular: 'Receipt', plural: 'Receipts' },
    permit: { singular: 'Permit', plural: 'Permits' },
    inspection: { singular: 'Inspection', plural: 'Inspections' },
    service_report: { singular: 'Service Report', plural: 'Service Reports' },
    maintenance_record: { singular: 'Maintenance Record', plural: 'Maintenance Records' },
    other: { singular: 'Other', plural: 'Other' },
};

function documentLabel(category: string, variant: 'singular' | 'plural' = 'singular') {
    return documentCategoryLabels[category]?.[variant] || category.replace(/_/g, ' ');
}

function photoLabel(category: string) {
    const labels: Record<string, string> = {
        main_photo: 'Main Photo',
        equipment_photo: 'Equipment Photo',
        label_photo: 'Label Photo',
        serial_photo: 'Serial Number Photo',
        model_photo: 'Model Number Photo',
        before_photo: 'Before Photo',
        after_photo: 'After Photo',
        other: 'Other Photo',
        other_photo: 'Other Photo',
    };

    return labels[category] || category.replace(/_/g, ' ');
}

function normalizePhotoCategory(category: string) {
    return category === 'other' ? 'other_photo' : category;
}

function sanitizeStorageSegment(value?: string | null) {
    const sanitized = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9._=-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 96);

    return sanitized || 'unknown';
}

function sanitizeFileName(value?: string | null) {
    const sanitized = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return sanitized || `photo-${Date.now()}.jpg`;
}

function extensionFromMimeType(mimeType?: string | null) {
    const normalized = String(mimeType || '').trim().toLowerCase();

    if (normalized === 'image/png') return 'png';
    if (normalized === 'image/webp') return 'webp';
    if (normalized === 'image/heic') return 'heic';
    if (normalized === 'image/heif') return 'heif';

    return 'jpg';
}

function fileNameFromImageAsset(asset: ImagePicker.ImagePickerAsset, fallbackName: string) {
    const assetFileName = sanitizeFileName(asset.fileName);

    if (asset.fileName && assetFileName.includes('.')) return assetFileName;

    const uriName = sanitizeFileName(asset.uri.split('/').pop()?.split('?')[0]);

    if (uriName && uriName.includes('.')) return uriName;

    return sanitizeFileName(`${fallbackName}.${extensionFromMimeType(asset.mimeType)}`);
}

function isImageFile(fileName?: string | null) {
    const lowerName = fileName?.toLowerCase() || '';
    return (
        lowerName.endsWith('.jpg') ||
        lowerName.endsWith('.jpeg') ||
        lowerName.endsWith('.png') ||
        lowerName.endsWith('.webp')
    );
}

function mergeUniqueFiles(...groups: ItemFile[][]) {
    const filesById = new Map<string, ItemFile>();

    groups.flat().forEach((file) => {
        const key = file.id || `${file.file_url}-${file.file_name || ''}`;
        filesById.set(key, file);
    });

    return Array.from(filesById.values()).sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );
}

function getStorageBucket(file: ItemFile) {
    return file.storage_bucket || 'item-files';
}

function getStoragePath(file: ItemFile) {
    if (file.storage_path) return file.storage_path;

    const bucket = getStorageBucket(file);
    const markers = [
        `/storage/v1/object/public/${bucket}/`,
        `/storage/v1/object/sign/${bucket}/`,
    ];

    for (const marker of markers) {
        const markerIndex = file.file_url.indexOf(marker);

        if (markerIndex >= 0) {
            const path = file.file_url.slice(markerIndex + marker.length).split('?')[0];
            return decodeURIComponent(path);
        }
    }

    return null;
}

function buildGalleryPhotos(mainPhotoUrl: string | null | undefined, appendedPhotos: ItemFile[]) {
    const usedUrls = new Set<string>();
    const galleryPhotos: GalleryPhoto[] = [];

    if (mainPhotoUrl) {
        usedUrls.add(mainPhotoUrl);
        galleryPhotos.push({
            id: 'main-photo',
            property_id: null,
            home_item_id: null,
            item_slug: null,
            user_id: null,
            storage_bucket: 'item-photos',
            storage_path: null,
            file_url: mainPhotoUrl,
            file_name: 'Main Photo',
            file_type: 'photo',
            category: 'main_photo',
            created_at: null,
            isMainPhoto: true,
        });
    }

    appendedPhotos.forEach((photo) => {
        if (!photo.file_url || usedUrls.has(photo.file_url)) return;
        usedUrls.add(photo.file_url);
        galleryPhotos.push(photo);
    });

    return galleryPhotos;
}

function getSafeErrorCode(error: unknown) {
    const candidate =
        (error as { code?: unknown; status?: unknown; name?: unknown } | null)?.code ??
        (error as { status?: unknown; name?: unknown } | null)?.status ??
        (error as { name?: unknown } | null)?.name;

    return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : 'unknown';
}

function logMediaDebug(stage: string, error?: unknown) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.info('[ItemMedia]', { stage, code: error ? getSafeErrorCode(error) : 'none' });
    }
}

function logMaintenanceTimerError(stage: string, error: unknown) {
    const safeError = error as {
        message?: unknown;
        code?: unknown;
        details?: unknown;
        hint?: unknown;
    };

    console.error('[ItemMaintenanceTimers]', {
        stage,
        message: typeof safeError?.message === 'string' ? safeError.message : 'Unknown error',
        code: typeof safeError?.code === 'string' || typeof safeError?.code === 'number' ? safeError.code : null,
        details: typeof safeError?.details === 'string' ? safeError.details : null,
        hint: typeof safeError?.hint === 'string' ? safeError.hint : null,
    });
}

export default function ItemScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();

    function scaleStyle<T extends Record<string, any>>(style: T): T {
        const fontKeys = new Set(['fontSize', 'lineHeight']);
        const iconKeys = new Set([
            'padding',
            'paddingTop',
            'paddingBottom',
            'paddingVertical',
            'paddingHorizontal',
            'marginTop',
            'marginBottom',
            'marginVertical',
            'marginHorizontal',
            'gap',
            'rowGap',
            'columnGap',
            'width',
            'height',
            'minWidth',
            'minHeight',
            'borderRadius',
        ]);

        const scaledStyle: Record<string, any> = { ...style };

        Object.entries(style).forEach(([key, value]) => {
            if (typeof value !== 'number') return;

            if (fontKeys.has(key)) {
                scaledStyle[key] = scaleFont(value);
            }

            if (iconKeys.has(key)) {
                scaledStyle[key] = scaleIcon(value);
            }
        });

        return scaledStyle as T;
    }
    const [showDocumentTypePicker, setShowDocumentTypePicker] = useState(false);
    const routeParams = useLocalSearchParams<{
        slug?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        mode?: string | string[];
        providerMode?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const slug = firstParam(routeParams.slug);
    const managementCompanyId = firstParam(routeParams.companyId);
    const managementPropertyId = firstParam(routeParams.propertyId);
    const isManagementMode = firstParam(routeParams.mode) === 'management' && !!managementCompanyId && !!managementPropertyId;
    const providerModeContext = readProviderModeParams(routeParams);
    const providerContextIncomplete = hasProviderModeRouteSignal(routeParams) && !providerModeContext;
    const [item, setItem] = useState<any>(null);
    const [relatedItems, setRelatedItems] = useState<HomeItemHierarchyRecord[]>([]);
    const [files, setFiles] = useState<ItemFile[]>([]);
    const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
    const [maintenanceCompletions, setMaintenanceCompletions] = useState<MaintenanceCompletion[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [capturingPhoto, setCapturingPhoto] = useState(false);
    const [showPhoto, setShowPhoto] = useState(false);
    const [showPhotos, setShowPhotos] = useState(false);
    const [showDocuments, setShowDocuments] = useState(false);
    const [photoCategory, setPhotoCategory] = useState('equipment_photo');
    const [selectedDocumentType, setSelectedDocumentType] = useState<string | null>(null);
    const [estimateAccess, setEstimateAccess] = useState<CompanyPermissionAccess | null>(null);
    const [checkingEstimateAccess, setCheckingEstimateAccess] = useState(false);
    const [estimatePermissionMessage, setEstimatePermissionMessage] = useState('');
    const [removingFileId, setRemovingFileId] = useState<string | null>(null);
    const [addingMaintenanceKey, setAddingMaintenanceKey] = useState<string | null>(null);
    const [completingMaintenanceId, setCompletingMaintenanceId] = useState<string | null>(null);
    const [removingMaintenanceCompletionId, setRemovingMaintenanceCompletionId] = useState<string | null>(null);
    const [showMaintenanceRecord, setShowMaintenanceRecord] = useState(false);
    const [showCustomMaintenanceForm, setShowCustomMaintenanceForm] = useState(false);
    const [savingCustomMaintenance, setSavingCustomMaintenance] = useState(false);
    const [customReminderTitle, setCustomReminderTitle] = useState('');
    const [customReminderDescription, setCustomReminderDescription] = useState('');
    const [customReminderInterval, setCustomReminderInterval] = useState('1');
    const [customReminderUnit, setCustomReminderUnit] = useState<RecurrenceUnit>('years');
    const [customReminderStartDate, setCustomReminderStartDate] = useState(toDateInputValue(new Date()));
    const [customReminderNextDueDate, setCustomReminderNextDueDate] = useState(
        calculateNextDueDate(new Date(), 1, 'years')
    );
    const [message, setMessage] = useState('');
    const [providerStagedEntries, setProviderStagedEntries] = useState<ProviderStagedWorkEntry[]>([]);
    const [providerStagingBackendStatus, setProviderStagingBackendStatus] = useState<ProviderStagingBackendStatus | null>(null);
    const [providerReviewExpanded, setProviderReviewExpanded] = useState(false);
    const [expandedProviderPhotoId, setExpandedProviderPhotoId] = useState<string | null>(null);
    const [expandedProviderDocumentId, setExpandedProviderDocumentId] = useState<string | null>(null);
    const [selectedProviderPhotoId, setSelectedProviderPhotoId] = useState<string | null>(null);
    const [pendingProviderPhotoRemoveId, setPendingProviderPhotoRemoveId] = useState<string | null>(null);
    const [removingProviderPhotoId, setRemovingProviderPhotoId] = useState<string | null>(null);
    const [providerPanel, setProviderPanel] = useState<ProviderStagedPanel>('none');
    const [savingProviderWork, setSavingProviderWork] = useState(false);
    const [providerNoteText, setProviderNoteText] = useState('');
    const [providerNoteDestination, setProviderNoteDestination] = useState<ProviderNoteDestination>('company_only');
    const [providerFindingTitle, setProviderFindingTitle] = useState('');
    const [providerFindingSeverity, setProviderFindingSeverity] = useState<ProviderFindingSeverity>('medium');
    const [providerFindingDescription, setProviderFindingDescription] = useState('');
    const [providerFindingAction, setProviderFindingAction] = useState('');
    const [providerFindingStageForUpdate, setProviderFindingStageForUpdate] = useState(true);
    const [providerFindingStageForEstimate, setProviderFindingStageForEstimate] = useState(false);
    const [providerEditName, setProviderEditName] = useState('');
    const [providerEditCondition, setProviderEditCondition] = useState('');
    const [providerEditStatus, setProviderEditStatus] = useState('');
    const [providerEditBrand, setProviderEditBrand] = useState('');
    const [providerEditModel, setProviderEditModel] = useState('');
    const [providerEditSerial, setProviderEditSerial] = useState('');
    const [providerEditLocation, setProviderEditLocation] = useState('');
    const [providerEditNotes, setProviderEditNotes] = useState('');
    const [providerRelatedName, setProviderRelatedName] = useState('');
    const [providerRelatedCategory, setProviderRelatedCategory] = useState('');
    const [providerRelatedLocation, setProviderRelatedLocation] = useState('');
    const [providerRelatedNotes, setProviderRelatedNotes] = useState('');
    const [expandedActionGroups, setExpandedActionGroups] = useState<Record<ItemActionGroupKey, boolean>>({
        components: false,
        maintenance: false,
        estimate: false,
        provider: false,
        media: false,
        item: false,
    });

    useEffect(() => {
        void loadItem();
    }, [
        slug,
        isManagementMode,
        managementCompanyId,
        managementPropertyId,
        providerContextIncomplete,
        providerModeContext?.companyId,
        providerModeContext?.propertyId,
        providerModeContext?.serviceRequestId,
        providerModeContext?.scheduleSlotId,
        providerModeContext?.jobId,
    ]);

    useEffect(() => {
        if (!providerModeContext || !item) {
            setProviderStagedEntries([]);
            setProviderStagingBackendStatus(null);
            setProviderReviewExpanded(false);
            setExpandedProviderPhotoId(null);
            setExpandedProviderDocumentId(null);
            setSelectedProviderPhotoId(null);
            setPendingProviderPhotoRemoveId(null);
            setRemovingProviderPhotoId(null);
            setProviderPanel('none');
            return;
        }

        void refreshProviderStagedEntries();
    }, [providerModeContext?.companyId, providerModeContext?.propertyId, item?.id, item?.item_slug]);

    useEffect(() => {
        if (!showCustomMaintenanceForm) return;

        const interval = Number.parseInt(customReminderInterval.trim(), 10);
        const startDate = customReminderStartDate.trim()
            ? parseDateInputValue(customReminderStartDate)
            : new Date();

        if (!Number.isInteger(interval) || interval <= 0 || !startDate) return;

        setCustomReminderNextDueDate(calculateNextDueDate(startDate, interval, customReminderUnit));
    }, [customReminderInterval, customReminderStartDate, customReminderUnit, showCustomMaintenanceForm]);

    async function refreshProviderStagedEntries() {
        if (!providerModeContext || !item) {
            setProviderStagedEntries([]);
            setProviderStagingBackendStatus(null);
            return;
        }

        try {
            const result = await loadProviderStagedWorkWithStatus({
                companyId: providerModeContext.companyId,
                propertyId: providerModeContext.propertyId,
                itemId: item.id ? String(item.id) : null,
                itemSlug: item.item_slug || String(slug),
            });

            setProviderStagedEntries(result.entries);
            setProviderStagingBackendStatus(result.backendStatus);
        } catch (error) {
            const errorMessage = providerStagingErrorMessage(error);
            setProviderStagingBackendStatus({
                status: 'error',
                message: `Provider staging backend error: ${errorMessage}`,
            });
            setMessage(`Provider staging backend error: ${errorMessage}`);
        }
    }

    function openProviderPanel(panel: ProviderStagedPanel) {
        if (!providerModeContext) return;

        if (panel === 'edit') {
            setProviderEditName(item?.name || '');
            setProviderEditCondition(item?.install_state || '');
            setProviderEditStatus(item?.status || '');
            setProviderEditBrand(item?.brand || '');
            setProviderEditModel(item?.model || '');
            setProviderEditSerial(item?.serial || '');
            setProviderEditLocation(item?.location || item?.parent_area || '');
            setProviderEditNotes(item?.about || '');
        }

        if (panel === 'related_item') {
            const childContext = item ? resolveHomeItemChildCreateContext(item) : { location: '', parentArea: null };

            setProviderRelatedName('');
            setProviderRelatedCategory('Component');
            setProviderRelatedLocation(childContext.location);
            setProviderRelatedNotes('');
        }

        setProviderPanel(panel);
        setMessage('');
    }

    async function saveProviderStagedEntry(
        type: ProviderStagedWorkType,
        payload: ProviderStagedWorkPayload,
        successMessage: string
    ) {
        if (!providerModeContext || !item) {
            setMessage('Provider mode item context is not available.');
            return false;
        }

        setSavingProviderWork(true);

        try {
            let createdBy = estimateAccess?.userId || null;

            if (!createdBy) {
                try {
                    const {
                        data: { user },
                    } = await supabase.auth.getUser();
                    createdBy = user?.id || null;
                } catch {
                    createdBy = null;
                }
            }

            const savedEntry = await addProviderStagedWork({
                type,
                company_id: providerModeContext.companyId,
                property_id: providerModeContext.propertyId,
                item_id: item.id ? String(item.id) : null,
                item_slug: item.item_slug || String(slug),
                item_name: item.name || 'Unknown Item',
                system: item.system || null,
                location: item.location || item.parent_area || null,
                category: item.category || null,
                created_by: createdBy,
                payload,
            });

            await refreshProviderStagedEntries();
            const sourceMessage = savedEntry.source === 'provider_staging'
                ? 'Saved to provider staging.'
                : 'Local staged entry saved.';

            setProviderStagingBackendStatus(savedEntry.source === 'provider_staging'
                ? {
                    status: 'connected',
                    message: 'Provider staging backend: connected',
                }
                : {
                    status: 'fallback',
                    message: 'Provider staging backend unavailable: using local fallback',
                }
            );
            setMessage(`${sourceMessage} ${successMessage}`);
            return true;
        } catch (error) {
            const errorMessage = providerStagingErrorMessage(error);
            setProviderStagingBackendStatus({
                status: 'error',
                message: `Provider staging backend error: ${errorMessage}`,
            });
            setMessage(`Provider staging backend error: ${errorMessage}`);
            return false;
        } finally {
            setSavingProviderWork(false);
        }
    }

    async function handleSaveProviderNote() {
        const details = providerNoteText.trim();

        if (!details) {
            setMessage('Add note details first.');
            return;
        }

        const saved = await saveProviderStagedEntry(
            'note',
            {
                details,
                destination: providerNoteDestination,
                homeowner_visible_when_published: providerNoteDestination === 'client_update',
            },
            providerNoteDestination === 'client_update'
                ? 'Note staged for a future Client HomeOS update.'
                : 'Company-only note staged.'
        );

        if (saved) {
            setProviderNoteText('');
            setProviderNoteDestination('company_only');
            setProviderPanel('none');
        }
    }

    async function handleSaveProviderFinding() {
        const title = providerFindingTitle.trim();
        const description = providerFindingDescription.trim();

        if (!title && !description) {
            setMessage('Add a finding title or description first.');
            return;
        }

        const saved = await saveProviderStagedEntry(
            'finding',
            {
                title,
                severity: providerFindingSeverity,
                description,
                recommended_action: providerFindingAction.trim(),
                stage_for_client_update: providerFindingStageForUpdate,
                stage_for_estimate: providerFindingStageForEstimate,
            },
            'Finding staged for provider review.'
        );

        if (saved) {
            setProviderFindingTitle('');
            setProviderFindingSeverity('medium');
            setProviderFindingDescription('');
            setProviderFindingAction('');
            setProviderFindingStageForUpdate(true);
            setProviderFindingStageForEstimate(false);
            setProviderPanel('none');
        }
    }

    async function handleSaveProviderEdit() {
        const saved = await saveProviderStagedEntry(
            'edit',
            {
                name: providerEditName.trim(),
                condition: providerEditCondition.trim(),
                status: providerEditStatus.trim(),
                brand: providerEditBrand.trim(),
                model: providerEditModel.trim(),
                serial: providerEditSerial.trim(),
                location: providerEditLocation.trim(),
                notes: providerEditNotes.trim(),
            },
            'Information edit staged. The client HomeOS record was not changed.'
        );

        if (saved) {
            setProviderPanel('none');
        }
    }

    async function handleSaveProviderRelatedItem() {
        const itemName = providerRelatedName.trim();

        if (!providerModeContext || !item) {
            setMessage('Provider mode item context is not available.');
            return;
        }

        if (!hasAssignedProviderHomeItemsContext(providerModeContext)) {
            setMessage('Client HomeOS publishing requires an assigned request, visit, or job context.');
            return;
        }

        if (!itemName) {
            setMessage('Related item name is required.');
            return;
        }

        const childContext = resolveHomeItemChildCreateContext(item);
        const childLocation = providerRelatedLocation.trim() || childContext.location;

        if (!childLocation) {
            setMessage('The current item needs a name before a related item can be added under it.');
            return;
        }

        setSavingProviderWork(true);
        setMessage('Adding related item to Client HomeOS...');

        try {
            const { data, error } = await supabase.rpc(
                'create_provider_homeos_item',
                buildProviderHomeItemCreateRpcArgs(providerModeContext, {
                    itemSlug: null,
                    name: itemName,
                    system: item.system || 'HomeOS',
                    category: providerRelatedCategory.trim() || 'Component',
                    location: childLocation,
                    parentArea: childContext.parentArea,
                    status: 'Missing Information',
                    installState: 'Unknown',
                    about: providerRelatedNotes.trim() || `Provider-added component under ${item.name || 'this item'}.`,
                    brand: 'Unknown',
                    model: 'Unknown',
                    serial: 'Unknown',
                })
            );

            if (error) {
                setMessage(`Related item could not be added: ${error.message}`);
                return;
            }

            const createdItem = ((data || []) as ProviderHomeItemRpcRow[])[0] || null;

            setProviderRelatedName('');
            setProviderRelatedCategory('');
            setProviderRelatedLocation('');
            setProviderRelatedNotes('');
            setProviderPanel('none');
            setRelatedItems((currentItems) =>
                filterChildHomeItems([...currentItems, createdItem].filter(Boolean) as HomeItemHierarchyRecord[], item)
            );
            setMessage(`${itemName} was added under ${item.name || 'this item'}.`);

            if (createdItem?.item_slug) {
                router.push(providerModeItemPath(createdItem.item_slug, providerModeContext) as any);
            }
        } catch (error) {
            setMessage(`Related item could not be added: ${providerStagingErrorMessage(error)}`);
        } finally {
            setSavingProviderWork(false);
        }
    }

    async function handleStageClientUpdateMark() {
        await saveProviderStagedEntry(
            'client_update_mark',
            {
                reason: 'Marked from provider mode item page',
                publishing_status: 'publishing_not_installed',
            },
            'Marked for a future Client HomeOS update.'
        );
    }

    async function handleStageArchiveRequest() {
        await saveProviderStagedEntry(
            'archive_request',
            {
                reason: 'Provider requested item archive',
                permanent_archive_ready: false,
            },
            'Archive request staged locally. The client item was not archived.'
        );
    }

    async function handleStageProviderPhotoIntent(sourceAction: string, photoType: string) {
        await saveProviderStagedEntry(
            'photo',
            {
                source_action: sourceAction,
                action_source: sourceAction,
                photo_type: photoType,
                provider_file_status: 'intent_only',
                permanent_upload_ready: false,
            },
            'Photo is staged for provider workflow. Permanent publishing comes later.'
        );
    }

    async function uploadProviderStagedPhotoFromAsset(
        asset: ImagePicker.ImagePickerAsset,
        sourceAction: string,
        photoType: string,
        options: { manageBusy?: boolean } = {}
    ): Promise<boolean> {
        const manageBusy = options.manageBusy !== false;

        if (!providerModeContext || !item) {
            setMessage('Provider mode item context is not available.');
            return false;
        }

        try {
            if (manageBusy) {
                setUploading(true);
                setMessage('Uploading provider photo...');
            }

            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
                setMessage('Provider photo upload failed: sign in to upload provider photos.');
                return false;
            }

            const response = await fetch(asset.uri);
            const arrayBuffer = await response.arrayBuffer();
            const resolvedItemSlug = item.item_slug || String(slug);
            const itemKey = sanitizeStorageSegment(item.id ? String(item.id) : resolvedItemSlug);
            const cleanFileName = fileNameFromImageAsset(
                asset,
                `${sanitizeStorageSegment(resolvedItemSlug)}-${normalizePhotoCategory(photoType)}-${Date.now()}`
            );
            const storagePath = [
                'users',
                sanitizeStorageSegment(user.id),
                'provider-staged-work',
                sanitizeStorageSegment(providerModeContext.companyId),
                sanitizeStorageSegment(providerModeContext.propertyId),
                itemKey,
                `${Date.now()}-${cleanFileName}`,
            ].join('/');

            const { error: uploadError } = await supabase.storage
                .from(PROVIDER_STAGED_PHOTO_BUCKET)
                .upload(storagePath, arrayBuffer, {
                    contentType: asset.mimeType || 'image/jpeg',
                    upsert: true,
                });

            if (uploadError) {
                logMediaDebug('provider-photo-storage-upload', uploadError);
                setMessage(`Provider photo upload failed: ${uploadError.message}`);
                return false;
            }

            const { data: publicUrlData } = supabase.storage
                .from(PROVIDER_STAGED_PHOTO_BUCKET)
                .getPublicUrl(storagePath);
            const previewUrl = publicUrlData.publicUrl || '';

            const saved = await saveProviderStagedEntry(
                'photo',
                {
                    bucket: PROVIDER_STAGED_PHOTO_BUCKET,
                    storage_bucket: PROVIDER_STAGED_PHOTO_BUCKET,
                    storage_path: storagePath,
                    file_name: cleanFileName,
                    mime_type: asset.mimeType || 'image/jpeg',
                    photo_type: normalizePhotoCategory(photoType),
                    action_source: sourceAction,
                    source_action: sourceAction,
                    public_or_signed_url: previewUrl || null,
                    preview_url: previewUrl || null,
                    provider_file_status: 'uploaded',
                    permanent_upload_ready: false,
                    permanent_publish_ready: false,
                },
                'Photo saved to provider staging. It is not published to the client’s HomeOS yet.'
            );

            if (!saved) {
                await cleanupUploadedFile(PROVIDER_STAGED_PHOTO_BUCKET, storagePath, 'provider-photo-staging-cleanup');
                setMessage('Provider photo upload failed: staged photo metadata could not be saved.');
                return false;
            }

            setShowPhotos(true);
            return true;
        } catch (error) {
            const errorMessage = providerStagingErrorMessage(error);
            logMediaDebug('provider-photo-upload', error);
            setMessage(`Provider photo upload failed: ${errorMessage}`);
            return false;
        } finally {
            if (manageBusy) {
                setUploading(false);
            }
        }
    }

    async function chooseProviderStagedPhoto(
        sourceAction: string,
        photoType: string,
        options: { skipBusyCheck?: boolean } = {}
    ) {
        if (!options.skipBusyCheck && (uploading || capturingPhoto)) return;

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            setMessage('Photo library permission is required.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
        });

        if (result.canceled) return;

        await uploadProviderStagedPhotoFromAsset(result.assets[0], sourceAction, photoType);
    }

    async function chooseProviderStagedPhotos(sourceAction: string, photoType: string) {
        if (uploading || capturingPhoto) return;

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            setMessage('Photo library permission is required.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsMultipleSelection: true,
            selectionLimit: 0,
        });

        if (result.canceled || result.assets.length === 0) return;

        try {
            setUploading(true);
            setMessage(`Uploading ${result.assets.length} provider photo${result.assets.length === 1 ? '' : 's'}...`);

            let uploadedCount = 0;

            for (const asset of result.assets) {
                const uploaded = await uploadProviderStagedPhotoFromAsset(
                    asset,
                    sourceAction,
                    photoType,
                    { manageBusy: false }
                );

                if (uploaded) {
                    uploadedCount += 1;
                }
            }

            if (uploadedCount > 0) {
                setShowPhotos(true);
                setMessage(
                    uploadedCount === result.assets.length
                        ? `${uploadedCount} provider photo${uploadedCount === 1 ? '' : 's'} saved to staging.`
                        : `${uploadedCount} of ${result.assets.length} provider photos saved. Retry the photos that failed.`
                );
            } else {
                setMessage('No provider photos were saved. Please try again.');
            }
        } finally {
            setUploading(false);
        }
    }

    async function captureProviderStagedPhoto(sourceAction: string, photoType: string) {
        if (capturingPhoto || uploading) return;

        try {
            setCapturingPhoto(true);
            const permission = await ImagePicker.requestCameraPermissionsAsync();

            if (!permission.granted) {
                setMessage('Camera capture is not available on this device/browser. Choose Photo instead.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                cameraType: ImagePicker.CameraType.back,
                presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
                quality: 0.8,
            });

            if (result.canceled) return;

            await uploadProviderStagedPhotoFromAsset(result.assets[0], sourceAction, photoType);
        } catch (error) {
            logMediaDebug('provider-camera-capture', error);
            setMessage('Camera capture is not available on this device/browser. Choose Photo instead.');
            setCapturingPhoto(false);
            await chooseProviderStagedPhoto(sourceAction, photoType, { skipBusyCheck: true });
        } finally {
            setCapturingPhoto(false);
        }
    }

    async function handleStageProviderDocumentIntent(sourceAction: string, documentType: string) {
        await saveProviderStagedEntry(
            'document',
            {
                source_action: sourceAction,
                document_type: documentType,
                permanent_upload_ready: false,
            },
            'Document is staged for provider workflow. Permanent publishing comes later.'
        );
    }

    function confirmProviderArchiveRequest() {
        Alert.alert(
            'Stage archive request?',
            'Stage archive request for this client item?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Stage Request',
                    style: 'destructive',
                    onPress: () => {
                        void handleStageArchiveRequest();
                    },
                },
            ]
        );
    }

    function confirmClearProviderStagedEntries() {
        if (!providerModeContext || !item || providerStagedEntries.length === 0) return;

        Alert.alert(
            'Clear staged entries?',
            'This clears staged provider work for this item in the current staging source. It does not change the client HomeOS.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                        void clearCurrentProviderStagedEntries();
                    },
                },
            ]
        );
    }

    function confirmRemoveProviderPhoto(entry: ProviderStagedWorkEntry) {
        if (!providerModeContext || entry.type !== 'photo') return;

        setPendingProviderPhotoRemoveId(entry.id);
    }

    async function removeProviderPhoto(entry: ProviderStagedWorkEntry) {
        if (!providerModeContext || !item || entry.type !== 'photo') return;

        setRemovingProviderPhotoId(entry.id);

        try {
            const scope = {
                companyId: providerModeContext.companyId,
                propertyId: providerModeContext.propertyId,
                itemId: item.id ? String(item.id) : null,
                itemSlug: item.item_slug || String(slug),
            };
            const bucket = providerStagedPhotoBucket(entry.payload);
            const storagePath = payloadString(entry.payload, 'storage_path');
            const removeResult = await removeProviderStagedWorkEntry(entry, scope);
            const remainingEntries = removeResult.remainingEntries.filter((currentEntry) => currentEntry.id !== entry.id);
            let storageWarning = '';

            setProviderStagedEntries(remainingEntries);
            setProviderStagingBackendStatus(removeResult.source === 'provider_staging'
                ? {
                    status: 'connected',
                    message: 'Provider staging backend: connected',
                }
                : {
                    status: 'fallback',
                    message: 'Provider staging backend unavailable: using local fallback',
                }
            );
            setExpandedProviderPhotoId((currentId) => currentId === entry.id ? null : currentId);
            setSelectedProviderPhotoId((currentId) => currentId === entry.id ? null : currentId);
            setPendingProviderPhotoRemoveId((currentId) => currentId === entry.id ? null : currentId);

            if (storagePath) {
                if (isSafeProviderStagedPhotoPath(storagePath)) {
                    const { error: storageError } = await supabase.storage
                        .from(bucket)
                        .remove([storagePath]);

                    if (storageError) {
                        logMediaDebug('provider-photo-storage-remove', storageError);
                        storageWarning = `storage file could not be deleted: ${storageError.message}`;
                    }
                } else {
                    storageWarning = 'storage file was not deleted because the path is not a provider-staged photo path.';
                }
            }

            setMessage(storageWarning
                ? `Staged provider photo removed, but ${storageWarning}`
                : 'Staged provider photo removed. Homeowner photos were not changed.'
            );
        } catch (error) {
            const errorMessage = providerStagingErrorMessage(error);
            setProviderStagingBackendStatus({
                status: 'error',
                message: `Provider staging backend error: ${errorMessage}`,
            });
            setMessage(`Remove failed: ${errorMessage}`);
        } finally {
            setRemovingProviderPhotoId(null);
        }
    }

    async function clearCurrentProviderStagedEntries() {
        if (!providerModeContext || !item) return;

        try {
            const clearResult = await clearProviderStagedWorkForItem({
                companyId: providerModeContext.companyId,
                propertyId: providerModeContext.propertyId,
                itemId: item.id ? String(item.id) : null,
                itemSlug: item.item_slug || String(slug),
            });

            setProviderStagedEntries(clearResult.remainingEntries);
            setProviderStagingBackendStatus(clearResult.source === 'provider_staging'
                ? {
                    status: 'connected',
                    message: 'Provider staging backend: connected',
                }
                : {
                    status: 'fallback',
                    message: 'Provider staging backend unavailable: using local fallback',
                }
            );
            setProviderPanel('none');
            setProviderReviewExpanded(false);
            setExpandedProviderPhotoId(null);
            setExpandedProviderDocumentId(null);
            setMessage(clearResult.source === 'provider_staging'
                ? 'Provider staging entries cleared for this item. Local staged entries were not changed.'
                : 'Local staged entries cleared for this item.'
            );
        } catch (error) {
            const errorMessage = providerStagingErrorMessage(error);
            setProviderStagingBackendStatus({
                status: 'error',
                message: `Provider staging backend error: ${errorMessage}`,
            });
            setMessage(`Provider staging backend error: ${errorMessage}`);
        }
    }

    async function loadEstimateAccessForCurrentContext(companyId?: string | null) {
        setCheckingEstimateAccess(true);
        setEstimateAccess(null);
        setEstimatePermissionMessage('Checking estimate permission...');

        try {
            if (providerModeContext) {
                const providerAccess = await validateProviderModeAccess(
                    providerModeContext.companyId,
                    providerModeContext.propertyId
                );

                if (!providerAccess.access) {
                    setEstimatePermissionMessage(
                        providerAccess.error || 'Provider mode access could not be confirmed.'
                    );
                    return;
                }

                if (!canUseCompanyEstimateWorkflow(providerAccess.access)) {
                    setEstimatePermissionMessage('This work account is not authorized to create estimates for this company.');
                    return;
                }

                setEstimateAccess({
                    userId: providerAccess.access.userId,
                    companyUserId: providerAccess.access.companyUserId,
                    companyId: providerAccess.access.companyId,
                    role: providerAccess.access.role,
                    status: providerAccess.access.status,
                    permissions: providerAccess.access.permissions,
                });
                setEstimatePermissionMessage('');
                return;
            }

            const estimatePermission = await loadCurrentCompanyEstimateAccess({
                companyId,
            });

            setEstimateAccess(estimatePermission.access);
            setEstimatePermissionMessage(estimatePermission.access
                ? ''
                : estimatePermission.error || 'This work account is not authorized to create estimates for this company.'
            );
        } finally {
            setCheckingEstimateAccess(false);
        }
    }

    async function loadItem() {
        setLoading(true);
        setEstimateAccess(null);
        setEstimatePermissionMessage('');
        setCheckingEstimateAccess(false);
        setRelatedItems([]);
        setFiles([]);
        setMaintenanceTasks([]);
        setMaintenanceCompletions([]);

        if (providerContextIncomplete) {
            setMessage('Provider context is incomplete. Use Back to Current Job and reopen Client HomeOS.');
            setItem(null);
            setRelatedItems([]);
            setFiles([]);
            setMaintenanceTasks([]);
            setMaintenanceCompletions([]);
            setLoading(false);
            return;
        }

        if (isManagementMode && managementCompanyId && managementPropertyId) {
            await loadManagementItem(managementCompanyId, managementPropertyId);
            return;
        }

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership({
                propertyIdOverride: providerModeContext?.propertyId,
                companyId: providerModeContext?.companyId,
            });
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');
            setItem(null);
            setRelatedItems([]);
            setFiles([]);
            setMaintenanceTasks([]);
            setMaintenanceCompletions([]);
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        await loadEstimateAccessForCurrentContext(providerModeContext?.companyId);

        let itemRow: HomeItemRow | null = null;
        let loadErrorMessage = '';

        if (providerModeContext) {
            if (!hasAssignedProviderHomeItemsContext(providerModeContext)) {
                loadErrorMessage = 'Client HomeOS requires an assigned request, visit, or job context.';
            } else {
                const { data, error } = await supabase.rpc(
                    'get_provider_homeos_items',
                    buildProviderHomeItemsRpcArgs(providerModeContext, { itemSlug: String(slug) })
                );

                if (error) {
                    loadErrorMessage = error.message;
                } else {
                    itemRow = ((data || []) as HomeItemRow[])[0] || null;
                }
            }
        } else {
            const { data, error } = await supabase
                .from('home_items')
                .select('*')
                .eq('item_slug', String(slug))
                .eq('property_id', activeProperty.propertyId)
                .maybeSingle();

            if (error) {
                loadErrorMessage = error.message;
            } else {
                itemRow = (data || null) as HomeItemRow | null;
            }
        }

        if (loadErrorMessage) {
            setMessage(`Item load failed: ${loadErrorMessage}`);
            setItem(null);
            setRelatedItems([]);
            setFiles([]);
            setMaintenanceTasks([]);
            setMaintenanceCompletions([]);
        } else if (!itemRow) {
            setMessage('Item not found.');
            setItem(null);
            setRelatedItems([]);
            setFiles([]);
            setMaintenanceTasks([]);
            setMaintenanceCompletions([]);
        } else {
            setItem(itemRow);
            setMessage('');
            const nextRelatedItems = await loadRelatedItemsForCurrentItem({
                propertyId: activeProperty.propertyId,
                parentItem: itemRow,
            });
            setRelatedItems(nextRelatedItems);
            if (providerModeContext) {
                setFiles([]);
                setMaintenanceTasks([]);
                setMaintenanceCompletions([]);
            } else {
                await loadFiles({
                    propertyId: activeProperty.propertyId,
                    homeItemId: String(itemRow.id || ''),
                    itemSlug: itemRow.item_slug || String(slug),
                });
                await loadMaintenanceTasks({
                    propertyId: activeProperty.propertyId,
                    homeItemId: String(itemRow.id || ''),
                });
            }
        }

        setLoading(false);
    }

    async function loadRelatedItemsForCurrentItem({
        propertyId,
        parentItem,
    }: {
        propertyId: string;
        parentItem: HomeItemHierarchyRecord;
    }) {
        let rows: HomeItemHierarchyRecord[] = [];

        if (providerModeContext) {
            if (!hasAssignedProviderHomeItemsContext(providerModeContext)) return [];

            const { data, error } = await supabase.rpc(
                'get_provider_homeos_items',
                buildProviderHomeItemsRpcArgs(providerModeContext)
            );

            if (error) {
                setMessage(`Related item load failed: ${error.message}`);
                return [];
            }

            rows = (data || []) as HomeItemHierarchyRecord[];
        } else {
            const { data, error } = await supabase
                .from('home_items')
                .select('id, item_slug, name, system, category, location, parent_area, status, install_state, archived')
                .eq('property_id', propertyId)
                .or('archived.eq.false,archived.is.null')
                .order('name', { ascending: true });

            if (error) {
                setMessage(`Related item load failed: ${error.message}`);
                return [];
            }

            rows = (data || []) as HomeItemHierarchyRecord[];
        }

        return filterChildHomeItems(rows, parentItem);
    }

    async function loadManagementItem(targetCompanyId: string, targetPropertyId: string) {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setMessage('Sign in to view this customer item.');
            setItem(null);
            setLoading(false);
            router.replace('/auth/login' as never);
            return;
        }

        const [viewLookup, estimateLookup, platformAdmin] = await Promise.all([
            loadCurrentCompanyPermissionAccess('can_view_customers', { companyId: targetCompanyId }),
            loadCurrentCompanyEstimateAccess({ companyId: targetCompanyId }),
            isPlatformAdmin(user.id),
        ]);

        if (!platformAdmin && !viewLookup.access && !estimateLookup.access) {
            setMessage(viewLookup.error || estimateLookup.error || 'You do not have access to this customer item.');
            setItem(null);
            setLoading(false);
            return;
        }

        setEstimateAccess(estimateLookup.access);
        setEstimatePermissionMessage(estimateLookup.access
            ? ''
            : (estimateLookup.error || 'This work account is not authorized to create estimates for this company.')
        );

        const { data: clientData, error: clientError } = await supabase
            .from('company_property_clients')
            .select('id, status')
            .eq('company_id', targetCompanyId)
            .eq('property_id', targetPropertyId)
            .maybeSingle();

        if (clientError) {
            setMessage(`Could not confirm customer relationship: ${clientError.message}`);
            setItem(null);
            setLoading(false);
            return;
        }

        if (!clientData) {
            setMessage('This home is not connected to this company as a customer.');
            setItem(null);
            setLoading(false);
            return;
        }

        const clientStatus = normalizeText(String(clientData.status || ''));

        if (['archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'].includes(clientStatus)) {
            setMessage('This customer relationship is not active.');
            setItem(null);
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('home_items')
            .select('id, property_id, name, item_slug, system, location, parent_area, category, status, install_state, created_at')
            .eq('item_slug', slug)
            .eq('property_id', targetPropertyId)
            .maybeSingle();

        if (error) {
            setMessage(`Item load failed: ${error.message}`);
            setItem(null);
        } else if (!data) {
            setMessage('Item not found for this customer home.');
            setItem(null);
        } else {
            setItem(data);
            setMessage('');
        }

        setLoading(false);
    }

    async function loadFiles({
        propertyId,
        homeItemId,
        itemSlug,
    }: {
        propertyId?: string;
        homeItemId?: string;
        itemSlug?: string | null;
    } = {}) {
        let resolvedPropertyId = propertyId;

        if (!resolvedPropertyId) {
            try {
                resolvedPropertyId = (await requireActivePropertyMembership()).propertyId;
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');
                setFiles([]);

                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                return;
            }
        }

        const resolvedHomeItemId = homeItemId || String(item?.id || '');
        const resolvedItemSlug = itemSlug || item?.item_slug || String(slug);
        const fileGroups: ItemFile[][] = [];
        let homeItemIdQueryFailed = false;

        if (resolvedHomeItemId) {
            const { data, error } = await supabase
                .from('home_item_files')
                .select('*')
                .eq('home_item_id', resolvedHomeItemId)
                .eq('property_id', resolvedPropertyId)
                .order('created_at', { ascending: false });

            if (error) {
                homeItemIdQueryFailed = true;
                logMediaDebug('load-files-home-item-id', error);
            } else {
                fileGroups.push((data || []) as ItemFile[]);
            }
        }

        if (resolvedItemSlug) {
            const { data, error } = await supabase
                .from('home_item_files')
                .select('*')
                .eq('item_slug', resolvedItemSlug)
                .eq('property_id', resolvedPropertyId)
                .order('created_at', { ascending: false });

            if (error) {
                logMediaDebug('load-files-item-slug', error);
                setMessage('Files could not be loaded. Please try again.');
                return;
            }

            fileGroups.push((data || []) as ItemFile[]);
        }

        if (homeItemIdQueryFailed && !resolvedItemSlug) {
            setMessage('Files could not be loaded. Please try again.');
            setFiles([]);
            return;
        }

        setFiles(mergeUniqueFiles(...fileGroups));
    }

    async function loadMaintenanceTasks({
        propertyId,
        homeItemId,
    }: {
        propertyId?: string;
        homeItemId?: string;
    } = {}) {
        let resolvedPropertyId = propertyId;

        if (!resolvedPropertyId) {
            try {
                resolvedPropertyId = (await requireActivePropertyMembership()).propertyId;
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');
                setMaintenanceTasks([]);
                setMaintenanceCompletions([]);

                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                return;
            }
        }

        const resolvedHomeItemId = homeItemId || String(item?.id || '');
        if (!resolvedHomeItemId) {
            setMaintenanceTasks([]);
            setMaintenanceCompletions([]);
            return;
        }

        const { data, error } = await supabase
            .from('home_item_maintenance_tasks')
            .select('id, title, description, recurrence_interval, recurrence_unit, start_date, last_completed_date, next_due_date, reminder_status, task_key, notes, created_at')
            .eq('property_id', resolvedPropertyId)
            .eq('home_item_id', resolvedHomeItemId)
            .neq('reminder_status', 'archived')
            .order('next_due_date', { ascending: true });

        if (error) {
            logMaintenanceTimerError('load-tasks', error);
            setMaintenanceTasks([]);
            setMaintenanceCompletions([]);
            setMessage('Maintenance reminders could not be loaded. Please try again.');
            return;
        }

        setMaintenanceTasks((data || []) as MaintenanceTask[]);

        const { data: completionData, error: completionError } = await supabase
            .from('home_item_maintenance_completions')
            .select('id, maintenance_task_id, user_id, property_id, home_item_id, completed_on, notes, photo_urls, document_urls, created_by, created_at')
            .eq('property_id', resolvedPropertyId)
            .eq('home_item_id', resolvedHomeItemId)
            .order('completed_on', { ascending: false })
            .order('created_at', { ascending: false });

        if (completionError) {
            logMaintenanceTimerError('load-completions', completionError);
            setMaintenanceCompletions([]);
            setMessage('Maintenance reminders loaded, but the work record could not be loaded.');
            return;
        }

        setMaintenanceCompletions((completionData || []) as MaintenanceCompletion[]);
    }

    async function uploadMainPhotoFromAsset(asset: ImagePicker.ImagePickerAsset) {
        try {
            setUploading(true);
            setMessage('Uploading main photo...');

            let activeProperty;

            try {
                activeProperty = await requireActivePropertyMembership();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');

                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                return;
            }

            const response = await fetch(asset.uri);
            const arrayBuffer = await response.arrayBuffer();

            const fileExt = asset.uri.split('.').pop() || 'jpg';
            const fileName = `${String(slug)}-main-${Date.now()}.${fileExt}`;
            const filePath = `users/${activeProperty.userId}/items/${String(slug)}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('item-photos')
                .upload(filePath, arrayBuffer, {
                    contentType: asset.mimeType || 'image/jpeg',
                    upsert: true,
                });

            if (uploadError) {
                logMediaDebug('main-photo-storage-upload', uploadError);
                setMessage('Main photo upload failed. Please try again.');
                return;
            }

            const { data: publicUrlData } = supabase.storage
                .from('item-photos')
                .getPublicUrl(filePath);

            const photoUrl = publicUrlData.publicUrl;

            const { error: updateError } = await supabase
                .from('home_items')
                .update({ photo_url: photoUrl })
                .eq('item_slug', String(slug))
                .eq('property_id', activeProperty.propertyId);

            if (updateError) {
                logMediaDebug('main-photo-item-update', updateError);
                setMessage('Main photo uploaded but could not be saved. Please try again.');
                return;
            }

            setMessage('Main photo uploaded.');
            await loadItem();
        } catch (error: any) {
            logMediaDebug('main-photo-upload', error);
            setMessage('Main photo upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    }

    async function cleanupUploadedFile(bucket: string, path: string, stage: string) {
        const { error } = await supabase.storage.from(bucket).remove([path]);

        if (error) {
            logMediaDebug(stage, error);
        }
    }

    async function uploadExtraFile({
        uri,
        fileName,
        mimeType,
        fileType,
        category,
        manageBusy = true,
        refreshAfter = true,
    }: {
        uri: string;
        fileName: string;
        mimeType: string;
        fileType: 'photo' | 'document';
        category: string;
        manageBusy?: boolean;
        refreshAfter?: boolean;
    }): Promise<boolean> {
        try {
            if (manageBusy) {
                setUploading(true);
                setMessage(`Uploading ${fileType}...`);
            }

            let activeProperty;

            try {
                activeProperty = await requireActivePropertyMembership();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');

                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                return false;
            }

            const response = await fetch(uri);
            const arrayBuffer = await response.arrayBuffer();

            const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
            const resolvedItemSlug = item?.item_slug || String(slug);
            const filePath = `users/${activeProperty.userId}/items/${resolvedItemSlug}/${fileType}s/${Date.now()}-${cleanName}`;

            const { error: uploadError } = await supabase.storage
                .from('item-files')
                .upload(filePath, arrayBuffer, {
                    contentType: mimeType,
                    upsert: true,
                });

            if (uploadError) {
                logMediaDebug(`${fileType}-storage-upload`, uploadError);
                setMessage(`${fileType === 'photo' ? 'Photo' : 'Document'} upload failed. Please try again.`);
                return false;
            }

            const { data: publicUrlData } = supabase.storage
                .from('item-files')
                .getPublicUrl(filePath);

            const fileUrl = publicUrlData.publicUrl;

            const { error: insertError } = await supabase
                .from('home_item_files')
                .insert({
                    user_id: activeProperty.userId,
                    property_id: activeProperty.propertyId,
                    home_item_id: item?.id || null,
                    item_slug: resolvedItemSlug,
                    storage_bucket: 'item-files',
                    storage_path: filePath,
                    file_url: fileUrl,
                    file_name: fileName,
                    file_type: fileType,
                    category,
                });

            if (insertError) {
                logMediaDebug(`${fileType}-metadata-insert`, insertError);
                await cleanupUploadedFile('item-files', filePath, `${fileType}-metadata-cleanup`);
                setMessage(`${fileType === 'photo' ? 'Photo' : 'Document'} upload failed. Please try again.`);
                return false;
            }

            if (manageBusy) {
                setMessage(`${fileType === 'photo' ? 'Photo' : 'Document'} uploaded.`);
            }

            if (refreshAfter) {
                await loadFiles({
                    propertyId: activeProperty.propertyId,
                    homeItemId: String(item?.id || ''),
                    itemSlug: item?.item_slug || String(slug),
                });
            }

            return true;
        } catch (error: any) {
            logMediaDebug(`${fileType}-upload`, error);
            setMessage(`${fileType === 'photo' ? 'Photo' : 'Document'} upload failed. Please try again.`);
            return false;
        } finally {
            if (manageBusy) {
                setUploading(false);
            }
        }
    }

    async function handleUploadMainPhoto() {
        if (providerModeContext) {
            await chooseProviderStagedPhoto('Upload Main Photo', 'main_photo');
            return;
        }

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            setMessage('Photo library permission is required.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
        });

        if (result.canceled) return;

        await uploadMainPhotoFromAsset(result.assets[0]);
    }

    async function handleTakeMainPhoto() {
        if (providerModeContext) {
            await captureProviderStagedPhoto('Take Main Photo', 'main_photo');
            return;
        }

        await capturePhoto('main');
    }

    async function handleUploadAdditionalPhoto() {
        if (providerModeContext) {
            await chooseProviderStagedPhotos('Choose Photos', normalizePhotoCategory(photoCategory));
            return;
        }

        const selectedCategory = normalizePhotoCategory(photoCategory);
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            setMessage('Photo library permission is required.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsMultipleSelection: true,
            selectionLimit: 0,
        });

        if (result.canceled || result.assets.length === 0) return;

        try {
            setUploading(true);
            setMessage(`Uploading ${result.assets.length} photo${result.assets.length === 1 ? '' : 's'}...`);

            let uploadedCount = 0;

            for (const [index, asset] of result.assets.entries()) {
                const uploaded = await uploadExtraFile({
                    uri: asset.uri,
                    fileName: asset.fileName || `${String(slug)}-${Date.now()}-${index + 1}.jpg`,
                    mimeType: asset.mimeType || 'image/jpeg',
                    fileType: 'photo',
                    category: selectedCategory,
                    manageBusy: false,
                    refreshAfter: false,
                });

                if (uploaded) {
                    uploadedCount += 1;
                }
            }

            if (uploadedCount > 0) {
                const activeProperty = await requireActivePropertyMembership();
                await loadFiles({
                    propertyId: activeProperty.propertyId,
                    homeItemId: String(item?.id || ''),
                    itemSlug: item?.item_slug || String(slug),
                });
                setShowPhotos(true);
                setMessage(
                    uploadedCount === result.assets.length
                        ? `${uploadedCount} photo${uploadedCount === 1 ? '' : 's'} uploaded.`
                        : `${uploadedCount} of ${result.assets.length} photos uploaded. Retry the photos that failed.`
                );
            } else {
                setMessage('No photos were uploaded. Please try again.');
            }
        } finally {
            setUploading(false);
        }
    }

    async function handleTakeAdditionalPhoto() {
        if (providerModeContext) {
            await captureProviderStagedPhoto('Take Photo', normalizePhotoCategory(photoCategory));
            return;
        }

        await capturePhoto('additional', normalizePhotoCategory(photoCategory));
    }

    function handleLocationVideoPlaceholder() {
        if (providerModeContext) {
            void handleStageProviderPhotoIntent('Location Video Coming Soon', 'location_video');
            return;
        }

        setMessage('Location video uploads are coming soon. Photos and documents are available now.');
    }

    async function handleUploadDocument() {
        if (providerModeContext) {
            setShowDocumentTypePicker(true);
            setMessage('Choose a document type to stage for provider workflow.');
            return;
        }

        setShowDocumentTypePicker(true);
    }

    async function finishDocumentUpload(selectedType: string) {
        if (providerModeContext) {
            setShowDocumentTypePicker(false);
            setSelectedDocumentType(selectedType);
            await handleStageProviderDocumentIntent('Upload Document', selectedType);
            setShowDocuments(true);
            return;
        }

        setShowDocumentTypePicker(false);

        const result = await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: true,
            multiple: false,
        });

        if (result.canceled) return;

        const asset = result.assets[0];

        const uploaded = await uploadExtraFile({
            uri: asset.uri,
            fileName: asset.name || `${String(slug)}-${Date.now()}`,
            mimeType: asset.mimeType || 'application/octet-stream',
            fileType: 'document',
            category: selectedType,
        });

        if (uploaded) {
            setSelectedDocumentType(selectedType);
            setShowDocuments(true);
        }
    }

    async function capturePhoto(intent: 'main' | 'additional', category = 'equipment_photo') {
        try {
            if (capturingPhoto || uploading) return;

            setCapturingPhoto(true);
            const permission = await ImagePicker.requestCameraPermissionsAsync();

            if (!permission.granted) {
                setMessage('Camera permission is required. Check browser or device camera permissions and try again.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.8,
            });

            if (result.canceled) return;

            const asset = result.assets[0];

            if (intent === 'main') {
                await uploadMainPhotoFromAsset(asset);
                return;
            }

            await uploadExtraFile({
                uri: asset.uri,
                fileName: asset.fileName || `${String(slug)}-${Date.now()}.jpg`,
                mimeType: asset.mimeType || 'image/jpeg',
                fileType: 'photo',
                category,
            });
        } catch (error: any) {
            logMediaDebug('camera-capture', error);
            setMessage('Camera could not open. Check camera permissions and try again.');
        } finally {
            setCapturingPhoto(false);
        }
    }

    function handleEditInformation() {
        if (providerModeContext) {
            openProviderPanel('edit');
            return;
        }

        router.push({
            pathname: '/item/edit',
            params: { slug: String(slug) },
        } as any);
    }

    function handleAddRelatedItem() {
        if (providerModeContext) {
            openProviderPanel('related_item');
            return;
        }

        const childContext = resolveHomeItemChildCreateContext(item);

        router.push({
            pathname: '/item/create',
            params: {
                system: item.system || 'Plumbing',
                category: 'Component',
                area: childContext.location || item.name || '',
                parentArea: childContext.parentArea || '',
            },
        } as any);
    }

    async function handleAddToEstimate() {
        if (!estimateAccess) {
            setMessage(estimatePermissionMessage || 'You do not have permission to add estimates.');
            return;
        }

        const estimateCompanyId = providerModeContext?.companyId || estimateAccess.companyId;
        const estimatePropertyId = providerModeContext?.propertyId || item.property_id || managementPropertyId || '';
        const estimateSource: 'provider_mode' | 'management' | 'homeos' = providerModeContext
            ? 'provider_mode'
            : isManagementMode
                ? 'management'
                : 'homeos';
        const draftItemId = String(item.id || item.item_slug || slug);
        const draftItem = {
            id: draftItemId,
            property_id: estimatePropertyId || item.property_id || null,
            customer_home_name: providerModeContext
                ? `Client HomeOS ${shortId(estimatePropertyId)}`
                : null,
            name: item.name || 'Unknown Item',
            item_slug: item.item_slug || String(slug),
            system: item.system || 'Unknown',
            category: item.category || 'Unknown',
            location: item.location || null,
            parent_area: item.parent_area || null,
            status: item.status || null,
            install_state: item.install_state || null,
            company_id: estimateCompanyId,
            company_user_id: estimateAccess.companyUserId,
            source: estimateSource,
            created_at: new Date().toISOString(),
        };
        const draftScope = {
            userId: estimateAccess.userId,
            companyId: estimateCompanyId,
            propertyId: estimatePropertyId || null,
        };

        if (providerModeContext) {
            const existingDraft = await loadEstimateDraft(draftScope);
            const alreadyInDraft = existingDraft.some((draftItem) => draftItem.id === draftItemId);

            if (alreadyInDraft) {
                setMessage('Item is already in estimate.');
                return;
            }
        }

        const draftContext = {
            company_id: estimateCompanyId,
            property_id: estimatePropertyId || item.property_id || null,
            customer_home_name: providerModeContext
                ? `Client HomeOS ${shortId(estimatePropertyId)}`
                : null,
            service_request_id: providerModeContext?.serviceRequestId || null,
            job_id: providerModeContext?.jobId || null,
            schedule_slot_id: providerModeContext?.scheduleSlotId || null,
            technician_company_user_id: estimateAccess.companyUserId || null,
            technician_name: null,
            issue_summary: null,
            source: estimateSource,
            updated_at: new Date().toISOString(),
        };
        const sessionResult = await resolveEstimateOptionSession({
            companyId: estimateCompanyId,
            propertyId: draftContext.property_id,
            serviceRequestId: draftContext.service_request_id,
            jobId: draftContext.job_id,
            scheduleSlotId: draftContext.schedule_slot_id,
            homeItemId: draftItemId,
            category: inferEstimateCategoryFromDraft([draftItem], draftContext),
            source: estimateSource,
        });

        if (!sessionResult.session) {
            setMessage(`Estimate session unavailable: ${sessionResult.error || 'Could not create estimate session.'}`);
            return;
        }

        await addItemToEstimateDraft(draftItem, draftScope);

        if (providerModeContext) {
            await saveEstimateDraftContext({
                estimate_session_id: sessionResult.session.id,
                company_id: estimateCompanyId,
                property_id: estimatePropertyId || item.property_id || null,
                customer_home_name: `Client HomeOS ${shortId(estimatePropertyId)}`,
                service_request_id: providerModeContext.serviceRequestId || null,
                job_id: providerModeContext.jobId || null,
                schedule_slot_id: providerModeContext.scheduleSlotId || null,
                technician_company_user_id: estimateAccess.companyUserId || null,
                technician_name: null,
                issue_summary: null,
                source: 'provider_mode',
                updated_at: new Date().toISOString(),
            }, draftScope);
            setMessage('Item added to estimate.');
            router.push({
                pathname: '/estimate',
                params: {
                    itemSlug: item.item_slug || String(slug),
                    ...providerModeQueryParams(providerModeContext),
                },
            } as any);
            return;
        }

        await saveEstimateDraftContext({
            ...draftContext,
            estimate_session_id: sessionResult.session.id,
        }, draftScope);

        router.push({
            pathname: '/estimate',
            params: {
                companyId: estimateCompanyId,
                propertyId: estimatePropertyId,
                itemSlug: item.item_slug || String(slug),
                mode: isManagementMode ? 'management' : '',
            },
        } as any);
    }

    async function handleStartJobThread() {
        if (providerModeContext) {
            setMessage('Job thread creation from provider mode is coming next. Add to Estimate is available now.');
            return;
        }

        try {
            setMessage('Starting job thread...');

            const itemSlug = item.item_slug || String(slug);
            const itemName = item.name || 'Unknown Item';
            const system = item.system || 'Unknown';
            const roomOrArea = item.location || item.parent_area || null;
            const status = String(item.status || '').toLowerCase();
            const priority =
                status.includes('emergency') || status.includes('active leak')
                    ? 'emergency'
                    : 'normal';

            const { job } = await createJobWithFirstEvent({
                title: `${itemName} Service Request`,
                system,
                priority,
                room_or_area: roomOrArea,
                item_slug: itemSlug,
                job_source: 'item',
                job_type: 'service_request',
                event_type: 'job_created',
                visibility: 'homeowner',
                actor_role: 'homeowner',
                metadata: {
                    item_slug: itemSlug,
                    item_name: itemName,
                    system,
                    room_or_area: roomOrArea,
                },
            });

            router.push(`/jobs/${job.id}` as any);
        } catch (error: any) {
            setMessage(`Could not start job thread: ${error.message || 'Unknown error'}`);
        }
    }

    function resetCustomMaintenanceForm() {
        const today = toDateInputValue(new Date());
        setCustomReminderTitle('');
        setCustomReminderDescription('');
        setCustomReminderInterval('1');
        setCustomReminderUnit('years');
        setCustomReminderStartDate(today);
        setCustomReminderNextDueDate(calculateNextDueDate(new Date(), 1, 'years'));
    }

    function handleShowCustomMaintenanceForm() {
        resetCustomMaintenanceForm();
        setShowCustomMaintenanceForm(true);
        setMessage(providerModeContext
            ? 'Custom reminders are staged for provider review in provider mode.'
            : ''
        );
    }

    function handleCancelCustomMaintenanceForm() {
        setShowCustomMaintenanceForm(false);
        resetCustomMaintenanceForm();
    }

    async function handleSaveCustomMaintenanceReminder() {
        const title = customReminderTitle.trim();
        if (!title) {
            setMessage('Reminder title is required.');
            return;
        }

        const intervalText = customReminderInterval.trim();
        const recurrenceInterval = Number.parseInt(intervalText, 10);
        if (!/^\d+$/.test(intervalText) || !Number.isInteger(recurrenceInterval) || recurrenceInterval <= 0) {
            setMessage('Reminder interval must be a positive whole number.');
            return;
        }

        if (!isRecurrenceUnit(customReminderUnit)) {
            setMessage('Choose days, weeks, months, or years for the reminder interval.');
            return;
        }

        const startDateText = customReminderStartDate.trim() || toDateInputValue(new Date());
        const startDate = parseDateInputValue(startDateText);
        if (!startDate) {
            setMessage('Enter the start date as YYYY-MM-DD.');
            return;
        }

        const nextDueDateText = customReminderNextDueDate.trim();
        if (!parseDateInputValue(nextDueDateText)) {
            setMessage('Enter the next due date as YYYY-MM-DD.');
            return;
        }

        const description = customReminderDescription.trim() || null;

        if (providerModeContext) {
            setSavingCustomMaintenance(true);

            try {
                const saved = await saveProviderStagedEntry(
                    'note',
                    {
                        source: 'custom_reminder',
                        destination: 'provider_staged',
                        details: `Custom reminder requested: ${title}`,
                        reminder_title: title,
                        reminder_text: title,
                        reminder_description: description,
                        recurrence_interval: recurrenceInterval,
                        recurrence_unit: customReminderUnit,
                        start_date: startDateText,
                        next_due_date: nextDueDateText,
                        item_id: item?.id ? String(item.id) : null,
                        item_slug: item?.item_slug || String(slug),
                        item_name: item?.name || 'Unknown Item',
                        system: item?.system || null,
                        location: item?.location || item?.parent_area || null,
                        category: item?.category || null,
                        homeowner_visible_when_published: true,
                    },
                    'Custom reminder staged for provider review. It is not published to the client HomeOS yet.'
                );

                if (saved) {
                    setMessage('Custom reminder staged for provider review. It is not published to the client HomeOS yet.');
                    setShowCustomMaintenanceForm(false);
                    setProviderReviewExpanded(true);
                    resetCustomMaintenanceForm();
                }
            } finally {
                setSavingCustomMaintenance(false);
            }

            return;
        }

        if (!item?.id) {
            setMessage('Item must be loaded before adding reminders.');
            return;
        }

        const hasMatchingTitle = maintenanceTasks.some(
            (task) => task.reminder_status !== 'archived' && task.title.trim().toLowerCase() === title.toLowerCase()
        );

        setSavingCustomMaintenance(true);
        setMessage(hasMatchingTitle ? 'Saving another reminder with the same title...' : 'Saving reminder...');

        try {
            const activeProperty = await requireActivePropertyMembership();

            const { error } = await supabase
                .from('home_item_maintenance_tasks')
                .insert({
                    user_id: activeProperty.userId,
                    property_id: activeProperty.propertyId,
                    home_item_id: item.id,
                    item_slug: item.item_slug || String(slug),
                    system: item.system || null,
                    task_key: null,
                    title,
                    description,
                    recurrence_interval: recurrenceInterval,
                    recurrence_unit: customReminderUnit,
                    start_date: startDateText,
                    next_due_date: nextDueDateText,
                    reminder_status: 'active',
                    notes: null,
                    created_by: activeProperty.userId,
                });

            if (error) {
                logMaintenanceTimerError('add-custom-task', error);
                setMessage('Custom reminder could not be added. Please try again.');
                return;
            }

            setMessage('Custom reminder added.');
            setShowCustomMaintenanceForm(false);
            resetCustomMaintenanceForm();
            await loadMaintenanceTasks({
                propertyId: activeProperty.propertyId,
                homeItemId: String(item.id),
            });
        } catch (error) {
            logMaintenanceTimerError('add-custom-task', error);
            setMessage(error instanceof Error ? error.message : 'Custom reminder could not be added. Please try again.');

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }
        } finally {
            setSavingCustomMaintenance(false);
        }
    }

    async function handleAddMaintenancePreset(preset: MaintenancePreset) {
        if (providerModeContext) {
            setMessage('Provider mode reminder changes are staged only. Nothing was written to the customer HomeOS.');
            return;
        }

        if (!item?.id) {
            setMessage('Item must be loaded before adding reminders.');
            return;
        }

        const hasDuplicatePreset = maintenanceTasks.some(
            (task) => task.task_key === preset.key && task.reminder_status !== 'archived'
        );

        if (hasDuplicatePreset) {
            setMessage('That reminder already exists for this item.');
            return;
        }

        setAddingMaintenanceKey(preset.key);
        setMessage('Adding reminder...');

        try {
            const activeProperty = await requireActivePropertyMembership();
            const today = toDateInputValue(new Date());
            const nextDueDate = calculateNextDueDate(
                new Date(),
                preset.recurrenceInterval,
                preset.recurrenceUnit
            );

            const { error } = await supabase
                .from('home_item_maintenance_tasks')
                .insert({
                    user_id: activeProperty.userId,
                    property_id: activeProperty.propertyId,
                    home_item_id: item.id,
                    item_slug: item.item_slug || String(slug),
                    system: item.system || null,
                    task_key: preset.key,
                    title: preset.title,
                    description: preset.description,
                    recurrence_interval: preset.recurrenceInterval,
                    recurrence_unit: preset.recurrenceUnit,
                    start_date: today,
                    next_due_date: nextDueDate,
                    reminder_status: 'active',
                    created_by: activeProperty.userId,
                });

            if (error) {
                logMaintenanceTimerError('add-task', error);
                setMessage('Reminder could not be added. Please try again.');
                return;
            }

            setMessage('Reminder added.');
            await loadMaintenanceTasks({
                propertyId: activeProperty.propertyId,
                homeItemId: String(item.id),
            });
        } catch (error) {
            logMaintenanceTimerError('add-task', error);
            setMessage(error instanceof Error ? error.message : 'Reminder could not be added. Please try again.');

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }
        } finally {
            setAddingMaintenanceKey(null);
        }
    }

    async function handleCompleteMaintenanceTask(task: MaintenanceTask) {
        if (providerModeContext) {
            setMessage('Provider mode reminder completion is staged only. Nothing was written to the customer HomeOS.');
            return;
        }

        if (!item?.id) {
            setMessage('Item must be loaded before adding maintenance to the record.');
            return;
        }

        setCompletingMaintenanceId(task.id);
        setMessage('Adding maintenance to the record...');

        try {
            const activeProperty = await requireActivePropertyMembership();
            const today = toDateInputValue(new Date());
            const nextDueDate = calculateNextDueDate(
                new Date(),
                task.recurrence_interval,
                task.recurrence_unit
            );

            const { data: insertedCompletion, error: insertError } = await supabase
                .from('home_item_maintenance_completions')
                .insert({
                    maintenance_task_id: task.id,
                    user_id: activeProperty.userId,
                    property_id: activeProperty.propertyId,
                    home_item_id: item.id,
                    completed_on: today,
                    notes: null,
                    created_by: activeProperty.userId,
                })
                .select('id')
                .single();

            if (insertError) {
                logMaintenanceTimerError('complete-task-insert', insertError);
                setMessage('Maintenance could not be added to the record. Please try again.');
                return;
            }

            const { error: updateError } = await supabase
                .from('home_item_maintenance_tasks')
                .update({
                    last_completed_date: today,
                    next_due_date: nextDueDate,
                    reminder_status: 'active',
                })
                .eq('id', task.id)
                .eq('property_id', activeProperty.propertyId);

            if (updateError) {
                logMaintenanceTimerError('complete-task-update', updateError);
                if (insertedCompletion?.id) {
                    await supabase
                        .from('home_item_maintenance_completions')
                        .delete()
                        .eq('id', insertedCompletion.id)
                        .eq('property_id', activeProperty.propertyId);
                }
                setMessage('Maintenance could not be added to the record. Please try again.');
                return;
            }

            setMessage('Maintenance added to the record.');
            setShowMaintenanceRecord(true);
            await loadMaintenanceTasks({
                propertyId: activeProperty.propertyId,
                homeItemId: String(item.id),
            });
        } catch (error) {
            logMaintenanceTimerError('complete-task', error);
            setMessage(error instanceof Error ? error.message : 'Maintenance could not be added to the record. Please try again.');

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }
        } finally {
            setCompletingMaintenanceId(null);
        }
    }

    async function handleRemoveMaintenanceCompletion(completion: MaintenanceCompletion) {
        if (providerModeContext || !item?.id) return;

        const task = maintenanceTasks.find(
            (maintenanceTask) => maintenanceTask.id === completion.maintenance_task_id
        );

        if (!task) {
            setMessage('The reminder for this maintenance entry could not be found.');
            return;
        }

        setRemovingMaintenanceCompletionId(completion.id);
        setMessage('Removing maintenance record entry...');

        try {
            const activeProperty = await requireActivePropertyMembership();
            const { error: deleteError } = await supabase
                .from('home_item_maintenance_completions')
                .delete()
                .eq('id', completion.id)
                .eq('property_id', activeProperty.propertyId)
                .eq('home_item_id', item.id);

            if (deleteError) {
                logMaintenanceTimerError('remove-completion', deleteError);
                setMessage('Maintenance record entry could not be removed.');
                return;
            }

            const remainingForTask = maintenanceCompletions
                .filter(
                    (entry) =>
                        entry.id !== completion.id &&
                        entry.maintenance_task_id === completion.maintenance_task_id
                )
                .sort((a, b) => {
                    const dateComparison = b.completed_on.localeCompare(a.completed_on);
                    return dateComparison || b.created_at.localeCompare(a.created_at);
                });
            const previousCompletion = remainingForTask[0] || null;
            const previousCompletedDate = previousCompletion?.completed_on || null;
            const previousDate = parseDateInputValue(previousCompletedDate)
                || parseDateInputValue(task.start_date)
                || new Date();
            const nextDueDate = calculateNextDueDate(
                previousDate,
                task.recurrence_interval,
                task.recurrence_unit
            );

            const { error: taskUpdateError } = await supabase
                .from('home_item_maintenance_tasks')
                .update({
                    last_completed_date: previousCompletedDate,
                    next_due_date: nextDueDate,
                })
                .eq('id', task.id)
                .eq('property_id', activeProperty.propertyId)
                .eq('home_item_id', item.id);

            if (taskUpdateError) {
                logMaintenanceTimerError('remove-completion-task-update', taskUpdateError);
                setMessage('The record entry was removed, but the reminder date needs review.');
            } else {
                setMessage('Maintenance record entry removed.');
            }

            await loadMaintenanceTasks({
                propertyId: activeProperty.propertyId,
                homeItemId: String(item.id),
            });
        } catch (error) {
            logMaintenanceTimerError('remove-completion', error);
            setMessage(error instanceof Error ? error.message : 'Maintenance record entry could not be removed.');
        } finally {
            setRemovingMaintenanceCompletionId(null);
        }
    }

    function confirmArchiveItem() {
        if (providerModeContext) {
            confirmProviderArchiveRequest();
            return;
        }

        Alert.alert(
            'Archive item?',
            'This hides the item from HomeOS. It does not delete your home or account.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Archive',
                    style: 'destructive',
                    onPress: () => {
                        void handleArchiveItem();
                    },
                },
            ]
        );
    }

    async function handleArchiveItem() {
        setMessage('Archiving item...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const { error } = await supabase
            .from('home_items')
            .update({ archived: true })
            .eq('item_slug', String(slug))
            .eq('property_id', activeProperty.propertyId);

        if (error) {
            setMessage(`Remove failed: ${error.message}`);
            return;
        }

        setMessage('Item archived.');

        setTimeout(() => {
            router.back();
        }, 700);
    }

    function handleRemoveFile(file: ItemFile) {
        if (providerModeContext) {
            setMessage('Provider mode file removal is staged only. Nothing was changed in the customer HomeOS.');
            return;
        }

        Alert.alert(
            'Remove file?',
            'This will delete the uploaded file from this item.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                        void removeFile(file);
                    },
                },
            ]
        );
    }

    async function removeFile(file: ItemFile) {
        try {
            setRemovingFileId(file.id);
            setMessage('Removing file...');

            let activeProperty;

            try {
                activeProperty = await requireActivePropertyMembership();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not confirm your active home.');

                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                return;
            }

            if (file.user_id && file.user_id !== activeProperty.userId) {
                setMessage('You can only remove your own files.');
                return;
            }

            const storageBucket = getStorageBucket(file);
            const storagePath = getStoragePath(file);

            if (!storagePath) {
                setMessage('This legacy file record cannot be removed from storage safely yet.');
                return;
            }

            const { error: storageError } = await supabase.storage
                .from(storageBucket)
                .remove([storagePath]);

            if (storageError) {
                logMediaDebug('file-storage-remove', storageError);
                setMessage('File could not be removed. Please try again.');
                return;
            }

            const { error: deleteError } = await supabase
                .from('home_item_files')
                .delete()
                .eq('id', file.id)
                .eq('property_id', activeProperty.propertyId);

            if (deleteError) {
                logMediaDebug('file-metadata-delete', deleteError);
                setMessage('File could not be removed. Please try again.');
                return;
            }

            setMessage('File removed.');
            await loadFiles({
                propertyId: activeProperty.propertyId,
                homeItemId: String(item?.id || ''),
                itemSlug: item?.item_slug || String(slug),
            });
        } catch (error: any) {
            logMediaDebug('file-remove', error);
            setMessage('File could not be removed. Please try again.');
        } finally {
            setRemovingFileId(null);
        }
    }

    if (loading) {
        return (
            <View style={scaleStyle(centerStyle)}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (!item) {
        return (
            <View style={scaleStyle(centerStyle)}>
                <Text style={{ fontSize: scaleFont(18), color: theme.colors.text, fontWeight: '900' }}>
                    Item not found.
                </Text>
                <Text style={{ marginTop: scaleIcon(10), color: theme.colors.mutedText }}>{message}</Text>
            </View>
        );
    }

    const canAddItemToEstimate = Boolean(estimateAccess);
    const showEstimateUnavailableMessage = Boolean(
        !checkingEstimateAccess &&
        estimatePermissionMessage &&
        (!estimateAccess || providerModeContext)
    );

    if (isManagementMode) {
        const managementBackRoute = `/super-admin/company/${managementCompanyId}/client/${managementPropertyId}/items`;
        const location = item.location || item.parent_area || 'Not specified';
        const managementDetailCards = [
            { label: 'Status', value: item.status || 'Missing Information' },
            { label: 'Condition', value: item.install_state || 'Unknown' },
            { label: 'System', value: item.system || 'Unknown' },
            { label: 'Category', value: item.category || 'Unknown' },
            { label: 'Area / Location', value: location },
            { label: 'Home', value: shortId(item.property_id || managementPropertyId) },
        ];

        return (
            <ScrollView
                style={{ flex: 1, backgroundColor: theme.colors.background }}
                contentContainerStyle={{ padding: scaleIcon(20), paddingBottom: scaleIcon(40), alignItems: 'center' }}
            >
                <View style={{ width: '100%', maxWidth: 980 }}>
                    <HomeHeader />

                    <Text style={[scaleStyle(titleStyle), { color: theme.colors.text }]}>{item.name || 'Customer Item'}</Text>
                    <Text style={[scaleStyle(subtitleStyle), { color: theme.colors.mutedText }]}>
                        ManagementOS customer item view. Photos, documents, and private HomeOS history stay locked here.
                    </Text>

                    <View style={scaleStyle(infoGridStyle)}>
                        {managementDetailCards.map((detail) => (
                            <ThemedCard
                                key={detail.label}
                                style={scaleStyle(miniCardStyle)}
                            >
                                <Text style={[scaleStyle(miniLabelStyle), { color: theme.colors.mutedText }]}>{detail.label}</Text>
                                <Text style={[scaleStyle(miniValueStyle), { color: theme.colors.text }]} numberOfLines={2}>
                                    {detail.value}
                                </Text>
                            </ThemedCard>
                        ))}
                    </View>

                    <ThemedCard style={scaleStyle(messageCardStyle)}>
                        <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Privacy</Text>
                        <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                            Basic item identity is visible because this is an active company customer relationship. Media, documents, maintenance history, and private HomeOS notes are not shown in this company view.
                        </Text>
                    </ThemedCard>

                    {checkingEstimateAccess && (
                        <ThemedCard style={scaleStyle(messageCardStyle)}>
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Estimate</Text>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                                Checking estimate permission...
                            </Text>
                        </ThemedCard>
                    )}

                    {showEstimateUnavailableMessage && (
                        <ThemedCard style={scaleStyle(messageCardStyle)}>
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Estimate</Text>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                                {estimatePermissionMessage}
                            </Text>
                        </ThemedCard>
                    )}

                    <View style={scaleStyle(actionGridStyle)}>
                        {canAddItemToEstimate && (
                            <>
                                <ThemedButton
                                    title="Add to Estimate"
                                    onPress={handleAddToEstimate}
                                    style={scaleStyle(buttonStyle)}
                                    textStyle={scaleStyle(buttonTextStyle)}
                                />

                                <ThemedButton
                                    title="View Estimate"
                                    onPress={() => router.push({
                                        pathname: '/estimate',
                                        params: {
                                            mode: isManagementMode ? 'management' : '',
                                            itemSlug: item.item_slug || String(slug),
                                            ...(providerModeContext
                                                ? {
                                                    ...providerModeQueryParams(providerModeContext),
                                                }
                                                : {
                                                    companyId: estimateAccess?.companyId || managementCompanyId || '',
                                                    propertyId: item.property_id || managementPropertyId || '',
                                                }),
                                        },
                                    } as never)}
                                    style={scaleStyle(buttonStyle)}
                                    textStyle={scaleStyle(buttonTextStyle)}
                                />
                            </>
                        )}

                        <ThemedButton
                            title="Back to Customer Items"
                            variant="secondary"
                            onPress={() => router.replace(managementBackRoute as never)}
                            style={scaleStyle(buttonStyle)}
                            textStyle={scaleStyle(buttonTextStyle)}
                        />
                    </View>

                    {!!message && (
                        <ThemedCard style={scaleStyle(messageCardStyle)}>
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Message</Text>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>{message}</Text>
                        </ThemedCard>
                    )}
                </View>
            </ScrollView>
        );
    }

    const providerMediaLocked = Boolean(providerModeContext);
    const photos = files.filter((file) => file.file_type === 'photo');
    const galleryPhotos = providerMediaLocked ? [] : buildGalleryPhotos(item.photo_url, photos);
    const documents = files.filter((file) => file.file_type === 'document');
    const mediaActionBusy = uploading || capturingPhoto;
    const mediaBusyTitle = uploading ? 'Uploading...' : 'Opening...';
    const stagedPhotoEntries = providerStagedEntries.filter((entry) => entry.type === 'photo');
    const stagedDocumentEntries = providerStagedEntries.filter((entry) => entry.type === 'document');
    const stagedMainPhotoEntry = stagedPhotoEntries.find(isProviderStagedMainPhotoEntry);
    const stagedMainPhotoUrl = stagedMainPhotoEntry
        ? providerStagedPhotoPreviewUrl(stagedMainPhotoEntry.payload)
        : '';
    const selectedProviderPhotoEntry = selectedProviderPhotoId
        ? stagedPhotoEntries.find((entry) => entry.id === selectedProviderPhotoId) || null
        : null;
    const pendingProviderPhotoRemoveEntry = pendingProviderPhotoRemoveId
        ? stagedPhotoEntries.find((entry) => entry.id === pendingProviderPhotoRemoveId) || null
        : null;

    const groupedDocuments = documentCategories.map((category) => ({
        category,
        documents: documents.filter((doc) => doc.category === category),
    }));

    const activeMaintenanceTasks = maintenanceTasks.filter((task) => task.reminder_status !== 'archived');
    const recommendedMaintenancePresets = getMaintenancePresets({
        name: item.name,
        system: item.system,
        category: item.category,
        item_slug: item.item_slug,
        install_date: item.install_date,
    });
    const availableMaintenancePresets = recommendedMaintenancePresets.filter(
        (preset) =>
            !activeMaintenanceTasks.some(
                (task) => task.task_key === preset.key && task.reminder_status !== 'archived'
            )
    );

    const detailCards = [
        { label: 'Condition', value: item.install_state || 'Unknown' },
        { label: 'Status', value: item.status || 'Missing Information' },
        { label: 'System', value: item.system || 'Unknown' },
        { label: 'Category', value: item.category || 'Unknown' },
        { label: 'Location', value: item.location || 'Unknown' },
        { label: 'Parent Area', value: item.parent_area || 'None' },
        { label: 'Brand', value: item.brand || 'Unknown' },
        { label: 'Model', value: item.model || 'Unknown' },
        { label: 'Serial', value: item.serial || 'Unknown' },
    ];

    function toggleActionGroup(group: ItemActionGroupKey) {
        setExpandedActionGroups((currentGroups) => ({
            ...currentGroups,
            [group]: !currentGroups[group],
        }));
    }

    function openRelatedItem(relatedItem: HomeItemHierarchyRecord) {
        const itemSlug = relatedItem.item_slug || '';

        if (!itemSlug) return;

        router.push(providerModeContext ? providerModeItemPath(itemSlug, providerModeContext) : `/item/${itemSlug}` as any);
    }

    function renderSectionTile(
        group: ItemActionGroupKey,
        title: string,
        subtitle: string,
        meta?: string
    ) {
        const expanded = expandedActionGroups[group];
        const palette = itemSectionTilePalettes[group];

        return (
            <TouchableOpacity
                key={group}
                onPress={() => toggleActionGroup(group)}
                activeOpacity={0.84}
                style={[
                    scaleStyle(sectionTileStyle),
                    {
                        backgroundColor: expanded ? palette.accent : palette.background,
                        borderColor: expanded ? palette.accent : palette.border,
                    },
                ]}
            >
                <View
                    style={[
                        scaleStyle(sectionTileAccentStyle),
                        {
                            backgroundColor: expanded ? theme.colors.primaryText : palette.accent,
                            opacity: expanded ? 0.95 : 1,
                        },
                    ]}
                />
                <Text
                    style={[
                        scaleStyle(sectionTileTitleStyle),
                        { color: expanded ? theme.colors.primaryText : theme.colors.text },
                    ]}
                    numberOfLines={2}
                >
                    {title}
                </Text>
                <Text
                    style={[
                        scaleStyle(sectionTileSubtitleStyle),
                        { color: expanded ? theme.colors.primaryText : theme.colors.mutedText },
                    ]}
                    numberOfLines={3}
                >
                    {subtitle}
                </Text>
                <View style={scaleStyle(sectionTileFooterStyle)}>
                    {!!meta && (
                        <Text
                            style={[
                                scaleStyle(sectionTileMetaStyle),
                                { color: expanded ? theme.colors.primaryText : theme.colors.mutedText },
                            ]}
                        >
                            {meta}
                        </Text>
                    )}
                    <Text
                        style={[
                            scaleStyle(sectionTileActionStyle),
                            { color: expanded ? theme.colors.primaryText : palette.accent },
                        ]}
                    >
                        {expanded ? 'Hide' : 'Open'}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    }

    function renderActionGroup(
        group: ItemActionGroupKey,
        title: string,
        subtitle: string,
        children: ReactNode
    ) {
        const expanded = expandedActionGroups[group];

        if (!expanded) return null;

        return (
            <ThemedCard style={scaleStyle(actionGroupCardStyle)}>
                <View style={scaleStyle(actionGroupHeaderStyle)}>
                    <View style={scaleStyle(actionGroupHeaderTextStyle)}>
                        <Text style={[scaleStyle(actionGroupTitleStyle), { color: theme.colors.text }]}>{title}</Text>
                        <Text style={[scaleStyle(actionGroupSubtitleStyle), { color: theme.colors.mutedText }]}>{subtitle}</Text>
                    </View>
                    <Text
                        style={[scaleStyle(actionGroupToggleStyle), { color: theme.colors.primary }]}
                        onPress={() => toggleActionGroup(group)}
                    >
                        Hide
                    </Text>
                </View>

                <View style={scaleStyle(actionGridStyle)}>
                    {children}
                </View>
            </ThemedCard>
        );
    }

    function renderProviderWorkPanel() {
        if (!providerModeContext || providerPanel === 'none') return null;

        if (providerPanel === 'note') {
            return (
                <ThemedCard style={scaleStyle(providerFormCardStyle)}>
                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text, marginTop: 0 }]}>
                        Add Details / Notes
                    </Text>
                    <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                        Save provider notes company-side. Client publishing is a later workflow.
                    </Text>
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                        Destination
                    </Text>
                    <OptionRow
                        options={providerNoteDestinations}
                        value={providerNoteDestination}
                        onChange={(value) => setProviderNoteDestination(value as ProviderNoteDestination)}
                        labelForOption={(value) => value === 'company_only' ? 'Company Only' : 'Stage for Client HomeOS Update'}
                    />
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                        Details
                    </Text>
                    <TextInput
                        value={providerNoteText}
                        onChangeText={setProviderNoteText}
                        placeholder="Add company note or client update details"
                        placeholderTextColor={theme.colors.mutedText}
                        multiline
                        textAlignVertical="top"
                        style={[
                            maintenanceTextAreaStyle,
                            {
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                                color: theme.colors.text,
                            },
                        ]}
                    />
                    <View style={scaleStyle(providerFormActionRowStyle)}>
                        <ThemedButton
                            title={savingProviderWork ? 'Saving...' : 'Save Staged Note'}
                            onPress={handleSaveProviderNote}
                            disabled={savingProviderWork}
                            style={scaleStyle(providerFormButtonStyle)}
                            textStyle={scaleStyle(fileActionButtonTextStyle)}
                        />
                        <ThemedButton
                            title="Cancel"
                            variant="ghost"
                            onPress={() => setProviderPanel('none')}
                            disabled={savingProviderWork}
                            style={scaleStyle(providerFormButtonStyle)}
                            textStyle={scaleStyle(fileActionButtonTextStyle)}
                        />
                    </View>
                </ThemedCard>
            );
        }

        if (providerPanel === 'finding') {
            return (
                <ThemedCard style={scaleStyle(providerFormCardStyle)}>
                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text, marginTop: 0 }]}>
                        Add Finding
                    </Text>
                    <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                        Findings are staged for provider review and estimate/update workflows.
                    </Text>
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                        Finding title
                    </Text>
                    <TextInput
                        value={providerFindingTitle}
                        onChangeText={setProviderFindingTitle}
                        placeholder="Example: Supply line is corroded"
                        placeholderTextColor={theme.colors.mutedText}
                        style={[
                            maintenanceTextInputStyle,
                            {
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                                color: theme.colors.text,
                            },
                        ]}
                    />
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                        Severity
                    </Text>
                    <OptionRow
                        options={providerFindingSeverities}
                        value={providerFindingSeverity}
                        onChange={(value) => setProviderFindingSeverity(value as ProviderFindingSeverity)}
                        labelForOption={(value) => value}
                    />
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                        Description
                    </Text>
                    <TextInput
                        value={providerFindingDescription}
                        onChangeText={setProviderFindingDescription}
                        placeholder="What did the technician observe?"
                        placeholderTextColor={theme.colors.mutedText}
                        multiline
                        textAlignVertical="top"
                        style={[
                            maintenanceTextAreaStyle,
                            {
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                                color: theme.colors.text,
                            },
                        ]}
                    />
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                        Recommended action
                    </Text>
                    <TextInput
                        value={providerFindingAction}
                        onChangeText={setProviderFindingAction}
                        placeholder="Optional next step"
                        placeholderTextColor={theme.colors.mutedText}
                        style={[
                            maintenanceTextInputStyle,
                            {
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                                color: theme.colors.text,
                            },
                        ]}
                    />
                    <View style={scaleStyle(providerToggleRowStyle)}>
                        <TouchableOpacity
                            onPress={() => setProviderFindingStageForUpdate(!providerFindingStageForUpdate)}
                            style={[
                                providerToggleButtonStyle,
                                {
                                    borderColor: providerFindingStageForUpdate ? theme.colors.primary : theme.colors.border,
                                    backgroundColor: providerFindingStageForUpdate ? theme.colors.primary : theme.colors.surface,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    providerToggleTextStyle,
                                    { color: providerFindingStageForUpdate ? theme.colors.primaryText : theme.colors.mutedText },
                                ]}
                            >
                                Stage for Client Update
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setProviderFindingStageForEstimate(!providerFindingStageForEstimate)}
                            style={[
                                providerToggleButtonStyle,
                                {
                                    borderColor: providerFindingStageForEstimate ? theme.colors.primary : theme.colors.border,
                                    backgroundColor: providerFindingStageForEstimate ? theme.colors.primary : theme.colors.surface,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    providerToggleTextStyle,
                                    { color: providerFindingStageForEstimate ? theme.colors.primaryText : theme.colors.mutedText },
                                ]}
                            >
                                Stage for Estimate
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={scaleStyle(providerFormActionRowStyle)}>
                        <ThemedButton
                            title={savingProviderWork ? 'Saving...' : 'Save Finding'}
                            onPress={handleSaveProviderFinding}
                            disabled={savingProviderWork}
                            style={scaleStyle(providerFormButtonStyle)}
                            textStyle={scaleStyle(fileActionButtonTextStyle)}
                        />
                        <ThemedButton
                            title="Cancel"
                            variant="ghost"
                            onPress={() => setProviderPanel('none')}
                            disabled={savingProviderWork}
                            style={scaleStyle(providerFormButtonStyle)}
                            textStyle={scaleStyle(fileActionButtonTextStyle)}
                        />
                    </View>
                </ThemedCard>
            );
        }

        if (providerPanel === 'edit') {
            return (
                <ThemedCard style={scaleStyle(providerFormCardStyle)}>
                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text, marginTop: 0 }]}>
                        Edit Information
                    </Text>
                    <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                        This saves a staged edit only. The client item is not changed until publishing exists.
                    </Text>
                    <View style={scaleStyle(providerTwoColumnRowStyle)}>
                        <View style={scaleStyle(providerFieldWrapStyle)}>
                            <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Name</Text>
                            <TextInput
                                value={providerEditName}
                                onChangeText={setProviderEditName}
                                placeholder="Item name"
                                placeholderTextColor={theme.colors.mutedText}
                                style={[maintenanceTextInputStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                            />
                        </View>
                        <View style={scaleStyle(providerFieldWrapStyle)}>
                            <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Condition</Text>
                            <TextInput
                                value={providerEditCondition}
                                onChangeText={setProviderEditCondition}
                                placeholder="Condition"
                                placeholderTextColor={theme.colors.mutedText}
                                style={[maintenanceTextInputStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                            />
                        </View>
                        <View style={scaleStyle(providerFieldWrapStyle)}>
                            <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Status</Text>
                            <TextInput
                                value={providerEditStatus}
                                onChangeText={setProviderEditStatus}
                                placeholder="Status"
                                placeholderTextColor={theme.colors.mutedText}
                                style={[maintenanceTextInputStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                            />
                        </View>
                        <View style={scaleStyle(providerFieldWrapStyle)}>
                            <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Brand</Text>
                            <TextInput
                                value={providerEditBrand}
                                onChangeText={setProviderEditBrand}
                                placeholder="Brand"
                                placeholderTextColor={theme.colors.mutedText}
                                style={[maintenanceTextInputStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                            />
                        </View>
                        <View style={scaleStyle(providerFieldWrapStyle)}>
                            <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Model</Text>
                            <TextInput
                                value={providerEditModel}
                                onChangeText={setProviderEditModel}
                                placeholder="Model"
                                placeholderTextColor={theme.colors.mutedText}
                                style={[maintenanceTextInputStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                            />
                        </View>
                        <View style={scaleStyle(providerFieldWrapStyle)}>
                            <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Serial</Text>
                            <TextInput
                                value={providerEditSerial}
                                onChangeText={setProviderEditSerial}
                                placeholder="Serial"
                                placeholderTextColor={theme.colors.mutedText}
                                style={[maintenanceTextInputStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                            />
                        </View>
                    </View>
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Location</Text>
                    <TextInput
                        value={providerEditLocation}
                        onChangeText={setProviderEditLocation}
                        placeholder="Location"
                        placeholderTextColor={theme.colors.mutedText}
                        style={[maintenanceTextInputStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Notes / details</Text>
                    <TextInput
                        value={providerEditNotes}
                        onChangeText={setProviderEditNotes}
                        placeholder="Optional staged edit notes"
                        placeholderTextColor={theme.colors.mutedText}
                        multiline
                        textAlignVertical="top"
                        style={[maintenanceTextAreaStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                    <View style={scaleStyle(providerFormActionRowStyle)}>
                        <ThemedButton
                            title={savingProviderWork ? 'Saving...' : 'Save Staged Edit'}
                            onPress={handleSaveProviderEdit}
                            disabled={savingProviderWork}
                            style={scaleStyle(providerFormButtonStyle)}
                            textStyle={scaleStyle(fileActionButtonTextStyle)}
                        />
                        <ThemedButton
                            title="Cancel"
                            variant="ghost"
                            onPress={() => setProviderPanel('none')}
                            disabled={savingProviderWork}
                            style={scaleStyle(providerFormButtonStyle)}
                            textStyle={scaleStyle(fileActionButtonTextStyle)}
                        />
                    </View>
                </ThemedCard>
            );
        }

        if (providerPanel === 'related_item') {
            return (
                <ThemedCard style={scaleStyle(providerFormCardStyle)}>
                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text, marginTop: 0 }]}>
                        Add Related Item
                    </Text>
                    <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                        Add a real client HomeOS component inside {item?.name || 'this item'} for the assigned job context.
                    </Text>
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Item name</Text>
                    <TextInput
                        value={providerRelatedName}
                        onChangeText={setProviderRelatedName}
                        placeholder="Example: Shutoff valve"
                        placeholderTextColor={theme.colors.mutedText}
                        style={[maintenanceTextInputStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Category</Text>
                    <TextInput
                        value={providerRelatedCategory}
                        onChangeText={setProviderRelatedCategory}
                        placeholder="Category"
                        placeholderTextColor={theme.colors.mutedText}
                        style={[maintenanceTextInputStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Location</Text>
                    <TextInput
                        value={providerRelatedLocation}
                        onChangeText={setProviderRelatedLocation}
                        placeholder="Location"
                        placeholderTextColor={theme.colors.mutedText}
                        style={[maintenanceTextInputStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                    <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>Notes</Text>
                    <TextInput
                        value={providerRelatedNotes}
                        onChangeText={setProviderRelatedNotes}
                        placeholder="Optional"
                        placeholderTextColor={theme.colors.mutedText}
                        multiline
                        textAlignVertical="top"
                        style={[maintenanceTextAreaStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                    <View style={scaleStyle(providerFormActionRowStyle)}>
                        <ThemedButton
                            title={savingProviderWork ? 'Adding...' : 'Add to Client HomeOS'}
                            onPress={handleSaveProviderRelatedItem}
                            disabled={savingProviderWork}
                            style={scaleStyle(providerFormButtonStyle)}
                            textStyle={scaleStyle(fileActionButtonTextStyle)}
                        />
                        <ThemedButton
                            title="Cancel"
                            variant="ghost"
                            onPress={() => setProviderPanel('none')}
                            disabled={savingProviderWork}
                            style={scaleStyle(providerFormButtonStyle)}
                            textStyle={scaleStyle(fileActionButtonTextStyle)}
                        />
                    </View>
                </ThemedCard>
            );
        }

        return (
            <ThemedCard style={scaleStyle(providerFormCardStyle)}>
                <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text, marginTop: 0 }]}>
                    Update Client's HomeOS
                </Text>
                <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                    Publishing is not installed yet. These staged photos/notes are saved for the provider but have not been copied to the client’s permanent HomeOS.
                </Text>
                <View style={scaleStyle(providerStagedListStyle)}>
                    {providerStagedEntries.length === 0 ? (
                        <Text style={[scaleStyle(emptyTextStyle), { color: theme.colors.mutedText }]}>
                            No staged updates for this item yet.
                        </Text>
                    ) : (
                        providerStagedEntries.map((entry) => renderProviderStagedEntry(entry))
                    )}
                </View>
                <View style={scaleStyle(providerFormActionRowStyle)}>
                    <ThemedButton
                        title="Close Review"
                        variant="secondary"
                        onPress={() => setProviderPanel('none')}
                        style={scaleStyle(providerFormButtonStyle)}
                        textStyle={scaleStyle(fileActionButtonTextStyle)}
                    />
                </View>
            </ThemedCard>
        );
    }

    function renderProviderStagedEntry(
        entry: ProviderStagedWorkEntry,
        options: { compact?: boolean } = {}
    ) {
        const compact = options.compact === true;
        const photoPreviewUrl = entry.type === 'photo' ? providerStagedPhotoPreviewUrl(entry.payload) : '';
        const photoFileName = entry.type === 'photo' ? payloadString(entry.payload, 'file_name') : '';
        const photoStoragePath = entry.type === 'photo' ? payloadString(entry.payload, 'storage_path') : '';

        return (
            <View
                key={entry.id}
                style={[
                    providerStagedEntryStyle,
                    {
                        backgroundColor: theme.colors.surfaceAlt,
                        borderColor: theme.colors.border,
                    },
                ]}
            >
                <View style={scaleStyle(providerStagedEntryHeaderStyle)}>
                    <Text style={[scaleStyle(providerStagedEntryTypeStyle), { color: theme.colors.text }]}>
                        {providerStagedEntryLabel(entry)}
                    </Text>
                    <Text style={[scaleStyle(providerStagedEntryDateStyle), { color: theme.colors.mutedText }]}>
                        {formatCompactDateTime(entry.created_at)}
                    </Text>
                </View>
                <Text style={[scaleStyle(providerStagedEntrySourceStyle), { color: theme.colors.mutedText }]}>
                    {providerStagedSourceLabel(entry)} - {entry.status}
                </Text>
                <Text style={[scaleStyle(providerStagedEntrySummaryStyle), { color: theme.colors.mutedText }]}>
                    {summarizeProviderStagedEntry(entry)}
                </Text>
                {isProviderStagedReminderEntry(entry) && !compact ? (
                    <View style={scaleStyle(providerReminderDetailsStyle)}>
                        {providerReminderDetailLines(entry).map((line) => (
                            <Text
                                key={line}
                                style={[scaleStyle(providerStagedEntrySummaryStyle), { color: theme.colors.mutedText, marginTop: 0 }]}
                            >
                                {line}
                            </Text>
                        ))}
                    </View>
                ) : null}
                {entry.type === 'photo' && !compact ? (
                    <View style={scaleStyle(providerStagedPhotoBlockStyle)}>
                        {photoPreviewUrl ? (
                            <TouchableOpacity
                                onPress={() => setSelectedProviderPhotoId(entry.id)}
                                activeOpacity={0.82}
                                style={scaleStyle(providerStagedPhotoPreviewWrapStyle)}
                            >
                                <Image
                                    source={{ uri: photoPreviewUrl }}
                                    style={[scaleStyle(providerStagedPhotoPreviewStyle), { backgroundColor: theme.colors.surface }]}
                                    resizeMode="cover"
                                />
                            </TouchableOpacity>
                        ) : null}
                        <Text style={[scaleStyle(providerStagedEntrySummaryStyle), { color: theme.colors.mutedText }]}>
                            {photoFileName || photoStoragePath || 'Provider photo metadata staged.'}
                        </Text>
                    </View>
                ) : null}
            </View>
        );
    }

    function renderProviderPhotoTile(entry: ProviderStagedWorkEntry) {
        const payload = entry.payload;
        const previewUrl = providerStagedPhotoPreviewUrl(payload);
        const photoType = payloadString(payload, 'photo_type') || 'other_photo';
        const source = payloadString(payload, 'action_source') || payloadString(payload, 'source_action') || 'Provider Photo';
        const fileName = payloadString(payload, 'file_name');
        const bucket = payloadString(payload, 'bucket') || payloadString(payload, 'storage_bucket');
        const storagePath = payloadString(payload, 'storage_path');
        const detailsOpen = expandedProviderPhotoId === entry.id;
        const isRemoving = removingProviderPhotoId === entry.id;

        return (
            <View
                key={entry.id}
                style={[
                    providerPhotoTileStyle,
                    {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radii.card,
                    },
                ]}
            >
                {previewUrl ? (
                    <TouchableOpacity
                        onPress={() => setSelectedProviderPhotoId(entry.id)}
                        activeOpacity={0.82}
                        style={scaleStyle(providerPhotoThumbWrapStyle)}
                    >
                        <Image
                            source={{ uri: previewUrl }}
                            style={[scaleStyle(providerPhotoThumbStyle), { backgroundColor: theme.colors.surfaceAlt }]}
                            resizeMode="cover"
                        />
                    </TouchableOpacity>
                ) : (
                    <View style={[scaleStyle(providerPhotoThumbWrapStyle), { backgroundColor: theme.colors.surfaceAlt }]}>
                        <Text style={[scaleStyle(photoTextStyle), { color: theme.colors.mutedText }]}>Photo staged</Text>
                    </View>
                )}

                <Text style={[scaleStyle(providerMediaTitleStyle), { color: theme.colors.text }]}>
                    {photoLabel(photoType)}
                </Text>
                <Text style={[scaleStyle(providerMediaStatusStyle), { color: theme.colors.primary }]}>
                    Provider staged photo
                </Text>
                <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                    {formatCompactDateTime(entry.created_at)}
                </Text>
                <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                    {source}
                </Text>

                <View style={scaleStyle(providerPhotoActionRowStyle)}>
                    {previewUrl ? (
                        <TouchableOpacity
                            onPress={() => setSelectedProviderPhotoId(entry.id)}
                            activeOpacity={0.82}
                            style={[
                                providerDetailsButtonStyle,
                                {
                                    backgroundColor: theme.colors.surfaceAlt,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.pill,
                                },
                            ]}
                        >
                            <Text style={[scaleStyle(providerDetailsButtonTextStyle), { color: theme.colors.text }]}>
                                View
                            </Text>
                        </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                        onPress={() => setExpandedProviderPhotoId(detailsOpen ? null : entry.id)}
                        activeOpacity={0.82}
                        style={[
                            providerDetailsButtonStyle,
                            {
                                backgroundColor: theme.colors.surfaceAlt,
                                borderColor: theme.colors.border,
                                borderRadius: theme.radii.pill,
                            },
                        ]}
                    >
                        <Text style={[scaleStyle(providerDetailsButtonTextStyle), { color: theme.colors.text }]}>
                            {detailsOpen ? 'Hide' : 'Details'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        disabled={isRemoving}
                        onPress={() => confirmRemoveProviderPhoto(entry)}
                        activeOpacity={0.82}
                        style={[
                            providerDetailsButtonStyle,
                            {
                                backgroundColor: theme.colors.dangerBackground,
                                borderColor: theme.colors.dangerBackground,
                                borderRadius: theme.radii.pill,
                                opacity: isRemoving ? 0.55 : 1,
                            },
                        ]}
                    >
                        <Text style={[scaleStyle(providerDetailsButtonTextStyle), { color: theme.colors.danger }]}>
                            {isRemoving ? 'Removing...' : 'Remove'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {detailsOpen ? (
                    <View style={scaleStyle(providerMediaDetailsStyle)}>
                        <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                            {providerStagedSourceLabel(entry)} - {entry.status}
                        </Text>
                        <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                            File: {fileName || 'Unavailable'}
                        </Text>
                        <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                            Bucket: {bucket || 'Unavailable'}
                        </Text>
                        <Text style={[scaleStyle(providerMediaPathStyle), { color: theme.colors.mutedText }]}>
                            Path: {storagePath || 'Unavailable'}
                        </Text>
                    </View>
                ) : null}
            </View>
        );
    }

    function renderProviderDocumentRow(entry: ProviderStagedWorkEntry) {
        const payload = entry.payload;
        const documentType = payloadString(payload, 'document_type') || 'other';
        const source = payloadString(payload, 'action_source') || payloadString(payload, 'source_action') || 'Provider Document';
        const detailsOpen = expandedProviderDocumentId === entry.id;

        return (
            <View
                key={entry.id}
                style={[
                    providerDocumentRowStyle,
                    {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radii.card,
                    },
                ]}
            >
                <View style={{ flex: 1 }}>
                    <Text style={[scaleStyle(providerMediaTitleStyle), { color: theme.colors.text }]}>
                        {documentLabel(documentType)}
                    </Text>
                    <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                        {formatCompactDateTime(entry.created_at)} - {source}
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={() => setExpandedProviderDocumentId(detailsOpen ? null : entry.id)}
                    activeOpacity={0.82}
                    style={[
                        providerDetailsButtonStyle,
                        {
                            backgroundColor: theme.colors.surfaceAlt,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.pill,
                        },
                    ]}
                >
                    <Text style={[scaleStyle(providerDetailsButtonTextStyle), { color: theme.colors.text }]}>
                        {detailsOpen ? 'Hide' : 'Details'}
                    </Text>
                </TouchableOpacity>

                {detailsOpen ? (
                    <View style={scaleStyle(providerDocumentDetailsStyle)}>
                        <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                            {providerStagedSourceLabel(entry)} - {entry.status}
                        </Text>
                        <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                            {summarizeProviderStagedEntry(entry)}
                        </Text>
                    </View>
                ) : null}
            </View>
        );
    }

    function renderProviderStagedUpdatesPanel() {
        if (!providerModeContext) return null;

        const previewEntries = providerReviewExpanded
            ? providerStagedEntries
            : providerStagedEntries.slice(0, 2);

        return (
            <ThemedCard style={scaleStyle(providerStagedCardStyle)}>
                <View style={scaleStyle(providerStagedHeaderStyle)}>
                    <View>
                        <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Staged Updates</Text>
                        <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text, marginTop: 0 }]}>
                            {formatProviderStagedSummary(providerStagedEntries)}
                        </Text>
                    </View>
                    {providerStagedEntries.length > 0 ? (
                        <ThemedButton
                            title={providerReviewExpanded ? 'Hide' : 'Review'}
                            variant="secondary"
                            onPress={() => setProviderReviewExpanded(providerReviewExpanded ? false : true)}
                            style={scaleStyle(providerStagedHeaderButtonStyle)}
                            textStyle={scaleStyle(fileActionButtonTextStyle)}
                        />
                    ) : null}
                </View>
                <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                    {providerReviewExpanded
                        ? 'Showing full staged history. Publishing is not installed yet, so these updates have not been copied to the client’s permanent HomeOS.'
                        : 'Showing a compact staged update summary. Tap Review to expand the full staged history.'}
                </Text>
                <Text
                    style={[
                        scaleStyle(providerStagingStatusTextStyle),
                        {
                            color: providerStagingStatusColor(
                                providerStagingBackendStatus,
                                theme.colors.mutedText,
                                theme.colors.danger,
                                theme.colors.primary
                            ),
                        },
                    ]}
                >
                    {providerStagingStatusText(providerStagingBackendStatus)}
                </Text>
                <View style={scaleStyle(providerStagedListStyle)}>
                    {providerStagedEntries.length === 0 ? (
                        <Text style={[scaleStyle(emptyTextStyle), { color: theme.colors.mutedText }]}>
                            No staged provider work yet.
                        </Text>
                    ) : (
                        previewEntries.map((entry) => renderProviderStagedEntry(entry, { compact: !providerReviewExpanded }))
                    )}
                </View>
                {!providerReviewExpanded && providerStagedEntries.length > 2 ? (
                    <Text style={[scaleStyle(providerStagedEntrySummaryStyle), { color: theme.colors.mutedText }]}>
                        {providerStagedEntries.length - 2} more staged {providerStagedEntries.length - 2 === 1 ? 'entry' : 'entries'} hidden. Tap Review to expand.
                    </Text>
                ) : null}
                {providerStagedEntries.length > 0 ? (
                    <ThemedButton
                        title="Clear"
                        variant="danger"
                        onPress={confirmClearProviderStagedEntries}
                        style={scaleStyle(providerClearButtonStyle)}
                        textStyle={scaleStyle(fileActionButtonTextStyle)}
                    />
                ) : null}
            </ThemedCard>
        );
    }

    function renderProviderPhotoViewerModal() {
        if (!selectedProviderPhotoEntry) return null;

        const payload = selectedProviderPhotoEntry.payload;
        const previewUrl = providerStagedPhotoPreviewUrl(payload);
        const photoType = payloadString(payload, 'photo_type') || 'other_photo';
        const source = payloadString(payload, 'action_source') || payloadString(payload, 'source_action') || 'Provider Photo';
        const fileName = payloadString(payload, 'file_name');
        const storagePath = payloadString(payload, 'storage_path');
        const isRemoving = removingProviderPhotoId === selectedProviderPhotoEntry.id;

        return (
            <Modal
                visible
                transparent
                animationType="fade"
                onRequestClose={() => setSelectedProviderPhotoId(null)}
            >
                <View style={[scaleStyle(providerPhotoViewerOverlayStyle), { backgroundColor: theme.colors.overlay }]}>
                    <View
                        style={[
                            providerPhotoViewerCardStyle,
                            {
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                                borderRadius: theme.radii.card,
                            },
                        ]}
                    >
                        <View style={scaleStyle(providerPhotoViewerHeaderStyle)}>
                            <View style={scaleStyle(providerPhotoViewerTitleWrapStyle)}>
                                <Text style={[scaleStyle(providerPhotoViewerTitleStyle), { color: theme.colors.text }]}>
                                    {photoLabel(photoType)}
                                </Text>
                                <Text style={[scaleStyle(providerMediaStatusStyle), { color: theme.colors.primary }]}>
                                    Provider staged photo - not published to client HomeOS yet
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setSelectedProviderPhotoId(null)}
                                style={[
                                    providerPhotoViewerCloseButtonStyle,
                                    {
                                        backgroundColor: theme.colors.surfaceAlt,
                                        borderColor: theme.colors.border,
                                        borderRadius: theme.radii.pill,
                                    },
                                ]}
                                activeOpacity={0.82}
                            >
                                <Text style={[scaleStyle(providerDetailsButtonTextStyle), { color: theme.colors.text }]}>
                                    Close
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {previewUrl ? (
                            <Image
                                source={{ uri: previewUrl }}
                                style={[scaleStyle(providerPhotoViewerImageStyle), { backgroundColor: theme.colors.surfaceAlt }]}
                                resizeMode="contain"
                            />
                        ) : (
                            <View style={[scaleStyle(providerPhotoViewerImageStyle), { backgroundColor: theme.colors.surfaceAlt }]}>
                                <Text style={[scaleStyle(photoTextStyle), { color: theme.colors.mutedText }]}>
                                    Photo preview unavailable
                                </Text>
                            </View>
                        )}

                        <View style={scaleStyle(providerPhotoViewerMetaStyle)}>
                            <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                                Source: {source}
                            </Text>
                            <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                                Status: {providerStagedSourceLabel(selectedProviderPhotoEntry)} - {selectedProviderPhotoEntry.status}
                            </Text>
                            <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText }]}>
                                File: {fileName || 'Unavailable'}
                            </Text>
                            {!!storagePath && (
                                <Text style={[scaleStyle(providerMediaPathStyle), { color: theme.colors.mutedText }]}>
                                    Path: {storagePath}
                                </Text>
                            )}
                        </View>

                        <View style={scaleStyle(providerPhotoViewerActionsStyle)}>
                            <ThemedButton
                                title="Close"
                                variant="secondary"
                                onPress={() => setSelectedProviderPhotoId(null)}
                                style={scaleStyle(providerPhotoViewerActionButtonStyle)}
                                textStyle={scaleStyle(fileActionButtonTextStyle)}
                            />
                            {previewUrl ? (
                                <ThemedButton
                                    title="Open Original"
                                    variant="secondary"
                                    onPress={() => Linking.openURL(previewUrl)}
                                    style={scaleStyle(providerPhotoViewerActionButtonStyle)}
                                    textStyle={scaleStyle(fileActionButtonTextStyle)}
                                />
                            ) : null}
                            <ThemedButton
                                title={isRemoving ? 'Removing...' : 'Remove'}
                                variant="danger"
                                disabled={isRemoving}
                                onPress={() => confirmRemoveProviderPhoto(selectedProviderPhotoEntry)}
                                style={scaleStyle(providerPhotoViewerActionButtonStyle)}
                                textStyle={scaleStyle(fileActionButtonTextStyle)}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        );
    }

    function renderProviderPhotoRemoveConfirmModal() {
        if (!pendingProviderPhotoRemoveEntry) return null;

        const payload = pendingProviderPhotoRemoveEntry.payload;
        const photoType = payloadString(payload, 'photo_type') || 'other_photo';
        const source = payloadString(payload, 'action_source') || payloadString(payload, 'source_action') || 'Provider Photo';
        const isRemoving = removingProviderPhotoId === pendingProviderPhotoRemoveEntry.id;

        return (
            <Modal
                visible
                transparent
                animationType="fade"
                onRequestClose={() => {
                    if (!isRemoving) {
                        setPendingProviderPhotoRemoveId(null);
                    }
                }}
            >
                <View style={[scaleStyle(providerPhotoViewerOverlayStyle), { backgroundColor: theme.colors.overlay }]}>
                    <View
                        style={[
                            providerPhotoRemoveConfirmCardStyle,
                            {
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                                borderRadius: theme.radii.card,
                            },
                        ]}
                    >
                        <Text style={[scaleStyle(providerPhotoViewerTitleStyle), { color: theme.colors.text }]}>
                            Remove this staged provider photo?
                        </Text>
                        <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText, marginTop: 10 }]}>
                            This removes the company-side staged photo only. It does not delete homeowner permanent HomeOS photos.
                        </Text>
                        <Text style={[scaleStyle(providerMediaMetaStyle), { color: theme.colors.mutedText, marginTop: 12 }]}>
                            {photoLabel(photoType)} - {source}
                        </Text>

                        <View style={scaleStyle(providerPhotoViewerActionsStyle)}>
                            <ThemedButton
                                title="Cancel"
                                variant="secondary"
                                disabled={isRemoving}
                                onPress={() => setPendingProviderPhotoRemoveId(null)}
                                style={scaleStyle(providerPhotoViewerActionButtonStyle)}
                                textStyle={scaleStyle(fileActionButtonTextStyle)}
                            />
                            <ThemedButton
                                title={isRemoving ? 'Removing...' : 'Remove'}
                                variant="danger"
                                disabled={isRemoving}
                                onPress={() => removeProviderPhoto(pendingProviderPhotoRemoveEntry)}
                                style={scaleStyle(providerPhotoViewerActionButtonStyle)}
                                textStyle={scaleStyle(fileActionButtonTextStyle)}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        );
    }

    return (
        <>
            <ScrollView
                style={{ flex: 1, backgroundColor: theme.colors.background }}
                contentContainerStyle={{ padding: scaleIcon(20), paddingBottom: scaleIcon(40), alignItems: 'center' }}
            >
                <View style={{ width: '100%', maxWidth: 1200 }}>
                    <HomeHeader />

                    <Text style={[scaleStyle(titleStyle), { color: theme.colors.text }]}>{item.name}</Text>

                    <Text style={[scaleStyle(subtitleStyle), { color: theme.colors.mutedText }]}>
                        {item.about || 'This item has not been fully documented yet.'}
                    </Text>

                    {providerModeContext ? (
                        <ThemedCard style={scaleStyle(messageCardStyle)}>
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Provider Mode</Text>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                                Viewing client HomeOS for company {shortId(providerModeContext.companyId)}. Company notes, photos, findings, and edits are staged by default.
                            </Text>
                            <Text
                                style={[
                                    scaleStyle(providerStagingStatusTextStyle),
                                    {
                                        color: providerStagingStatusColor(
                                            providerStagingBackendStatus,
                                            theme.colors.mutedText,
                                            theme.colors.danger,
                                            theme.colors.primary
                                        ),
                                    },
                                ]}
                            >
                                {providerStagingStatusText(providerStagingBackendStatus)}
                            </Text>
                            <View style={scaleStyle(providerModeButtonRowStyle)}>
                                <ThemedButton
                                    title="Client Home"
                                    variant="secondary"
                                    onPress={() => router.replace(providerModePath('/', providerModeContext) as any)}
                                    style={scaleStyle(providerModeButtonStyle)}
                                    textStyle={scaleStyle(providerModeButtonTextStyle)}
                                />
                                <ThemedButton
                                    title="Company Dashboard"
                                    variant="secondary"
                                    onPress={() => router.replace(`/super-admin/company/${providerModeContext.companyId}` as any)}
                                    style={scaleStyle(providerModeButtonStyle)}
                                    textStyle={scaleStyle(providerModeButtonTextStyle)}
                                />
                                <ThemedButton
                                    title={getProviderReturnActionLabel(providerModeContext.returnTo)}
                                    onPress={() => router.replace((providerModeContext.returnTo || `/super-admin/company/${providerModeContext.companyId}/client/${providerModeContext.propertyId}`) as any)}
                                    style={scaleStyle(providerModeButtonStyle)}
                                    textStyle={scaleStyle(providerModeButtonTextStyle)}
                                />
                            </View>
                        </ThemedCard>
                    ) : null}

                    <ThemedCard style={scaleStyle(photoCardStyle)}>
                        <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Main Item Photo</Text>

                        {providerModeContext && stagedMainPhotoUrl ? (
                            <>
                                <Text style={[scaleStyle(photoTextStyle), { color: theme.colors.mutedText }]}>
                                    Provider staged main photo — not published to client HomeOS yet.
                                </Text>
                                <Image
                                    source={{ uri: stagedMainPhotoUrl }}
                                    style={scaleStyle(photoStyle)}
                                    resizeMode="contain"
                                />

                                <ThemedButton
                                    title="View Full Photo"
                                    variant="secondary"
                                    onPress={() => {
                                        if (stagedMainPhotoEntry) {
                                            setSelectedProviderPhotoId(stagedMainPhotoEntry.id);
                                        }
                                    }}
                                    style={scaleStyle(secondaryButtonStyle)}
                                    textStyle={scaleStyle(secondaryButtonTextStyle)}
                                />
                            </>
                        ) : item.photo_url && !providerMediaLocked ? (
                            <>
                                <Image
                                    source={{ uri: item.photo_url }}
                                    style={scaleStyle(photoStyle)}
                                    resizeMode="contain"
                                />

                                <ThemedButton
                                    title="View Full Photo"
                                    variant="secondary"
                                    onPress={() => setShowPhoto(true)}
                                    style={scaleStyle(secondaryButtonStyle)}
                                    textStyle={scaleStyle(secondaryButtonTextStyle)}
                                />
                            </>
                        ) : (
                            <View style={[scaleStyle(photoPlaceholderStyle), { backgroundColor: theme.colors.surfaceAlt }]}>
                                <Text style={scaleStyle(photoIconStyle)}>📷</Text>
                                <Text style={[scaleStyle(photoTextStyle), { color: theme.colors.mutedText }]}>
                                    {providerMediaLocked ? 'Private HomeOS photos are locked in provider mode' : 'No main photo uploaded'}
                                </Text>
                            </View>
                        )}
                    </ThemedCard>

                    <View style={scaleStyle(infoGridStyle)}>
                        {detailCards.map((detail) => (
                            <ThemedCard
                                key={detail.label}
                                style={scaleStyle(miniCardStyle)}
                            >
                                <Text style={[scaleStyle(miniLabelStyle), { color: theme.colors.mutedText }]}>{detail.label}</Text>
                                <Text style={[scaleStyle(miniValueStyle), { color: theme.colors.text }]} numberOfLines={2}>
                                    {detail.value}
                                </Text>
                            </ThemedCard>
                        ))}
                    </View>

                    <View style={scaleStyle(fileSummaryStyle)}>
                        <ThemedCard style={scaleStyle(fileSummaryCardStyle)}>
                            <Text style={[scaleStyle(fileSummaryTitleStyle), { color: theme.colors.mutedText }]}>Photos</Text>
                            <Text style={[scaleStyle(fileSummaryCountStyle), { color: theme.colors.text }]}>{galleryPhotos.length}</Text>
                        </ThemedCard>

                        <ThemedCard style={scaleStyle(fileSummaryCardStyle)}>
                            <Text style={[scaleStyle(fileSummaryTitleStyle), { color: theme.colors.mutedText }]}>Documents</Text>
                            <Text style={[scaleStyle(fileSummaryCountStyle), { color: theme.colors.text }]}>{documents.length}</Text>
                        </ThemedCard>
                    </View>

                    <View style={scaleStyle(sectionTileGridStyle)}>
                        {renderSectionTile(
                            'components',
                            'Components',
                            relatedItems.length > 0
                                ? `View parts under ${item.name || 'this item'}.`
                                : `Add parts under ${item.name || 'this item'}.`,
                            `${relatedItems.length}`
                        )}
                        {renderSectionTile(
                            'maintenance',
                            'Maintenance',
                            activeMaintenanceTasks.length > 0
                                ? 'Review reminders and due work.'
                                : 'Add or view reminders.',
                            `${activeMaintenanceTasks.length}`
                        )}
                        {canAddItemToEstimate ? renderSectionTile(
                            'estimate',
                            'Estimate',
                            'Quote, view draft, or start the job thread.'
                        ) : null}
                        {providerModeContext ? renderSectionTile(
                            'provider',
                            'Provider Updates',
                            'Notes, findings, photos, and client updates.'
                        ) : null}
                        {renderSectionTile(
                            'media',
                            'Photos & Docs',
                            'Photos, documents, and main item media.',
                            `${galleryPhotos.length + documents.length}`
                        )}
                        {renderSectionTile(
                            'item',
                            'Item Management',
                            'Edit, add components, request service, or archive.'
                        )}
                    </View>

                    {expandedActionGroups.components ? (
                    <ThemedCard style={scaleStyle(relatedItemsCardStyle)}>
                        <View style={scaleStyle(relatedItemsHeaderStyle)}>
                            <View style={scaleStyle(relatedItemsHeaderTextStyle)}>
                                <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text, marginTop: 0, marginBottom: 4 }]}>
                                    Components
                                </Text>
                                <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                                    Parts nested under {item.name || 'this item'}.
                                </Text>
                            </View>
                            <ThemedButton
                                title="+ Add Component"
                                onPress={handleAddRelatedItem}
                                style={scaleStyle(relatedItemsAddButtonStyle)}
                                textStyle={scaleStyle(fileActionButtonTextStyle)}
                            />
                        </View>

                        {relatedItems.length === 0 ? (
                            <View style={[scaleStyle(relatedItemsEmptyStyle), { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                                <Text style={[scaleStyle(emptyTextStyle), { color: theme.colors.mutedText }]}>
                                    No components have been added inside this item yet.
                                </Text>
                            </View>
                        ) : (
                            <View style={scaleStyle(relatedItemsGridStyle)}>
                                {relatedItems.map((relatedItem) => (
                                    <TouchableOpacity
                                        key={relatedItem.id || relatedItem.item_slug || relatedItem.name || ''}
                                        onPress={() => openRelatedItem(relatedItem)}
                                        activeOpacity={0.84}
                                        style={[
                                            relatedItemCardStyle,
                                            {
                                                backgroundColor: theme.colors.surfaceAlt,
                                                borderColor: theme.colors.border,
                                                borderRadius: theme.radii.card,
                                            },
                                        ]}
                                    >
                                        <Text style={[scaleStyle(relatedItemTitleStyle), { color: theme.colors.text }]} numberOfLines={2}>
                                            {relatedItem.name || 'Unnamed component'}
                                        </Text>
                                        <Text style={[scaleStyle(relatedItemMetaStyle), { color: theme.colors.mutedText }]} numberOfLines={1}>
                                            {relatedItem.category || 'Component'} / {relatedItem.status || relatedItem.install_state || 'Missing Information'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </ThemedCard>
                    ) : null}

                    {expandedActionGroups.maintenance ? (
                    <ThemedCard style={scaleStyle(maintenanceCardStyle)}>
                        <View style={scaleStyle(maintenanceSectionHeaderStyle)}>
                            <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text, marginTop: 0, marginBottom: 0 }]}>
                                Maintenance Reminders
                            </Text>
                            <ThemedButton
                                title={showMaintenanceRecord
                                    ? 'Hide Record'
                                    : `View Record (${maintenanceCompletions.length})`}
                                variant="secondary"
                                onPress={() => setShowMaintenanceRecord(!showMaintenanceRecord)}
                                style={scaleStyle(maintenanceRecordToggleStyle)}
                                textStyle={scaleStyle(fileActionButtonTextStyle)}
                            />
                        </View>

                        {showMaintenanceRecord && (
                            <View
                                style={[
                                    scaleStyle(maintenanceRecordStyle),
                                    {
                                        backgroundColor: theme.colors.surfaceAlt,
                                        borderColor: theme.colors.border,
                                    },
                                ]}
                            >
                                <Text style={[scaleStyle(maintenanceRecordTitleStyle), { color: theme.colors.text }]}>
                                    Maintenance Record
                                </Text>
                                {maintenanceCompletions.length === 0 ? (
                                    <Text style={[scaleStyle(emptyTextStyle), { color: theme.colors.mutedText }]}>
                                        No maintenance has been added to this item record yet.
                                    </Text>
                                ) : (
                                    <View style={scaleStyle(maintenanceRecordListStyle)}>
                                        {maintenanceCompletions.map((completion) => {
                                            const taskTitle = maintenanceTasks.find(
                                                (task) => task.id === completion.maintenance_task_id
                                            )?.title || 'Maintenance';

                                            return (
                                                <View
                                                    key={completion.id}
                                                    style={[
                                                        scaleStyle(maintenanceRecordRowStyle),
                                                        {
                                                            backgroundColor: theme.colors.surface,
                                                            borderColor: theme.colors.border,
                                                        },
                                                    ]}
                                                >
                                                    <View style={scaleStyle(maintenanceRecordRowTextStyle)}>
                                                        <Text style={[scaleStyle(maintenanceTaskTitleStyle), { color: theme.colors.text }]}>
                                                            {taskTitle}
                                                        </Text>
                                                        <Text style={[scaleStyle(maintenanceMetaTextStyle), { color: theme.colors.mutedText }]}>
                                                            Added {formatDateLabel(completion.completed_on)}
                                                        </Text>
                                                    </View>
                                                    <ThemedButton
                                                        title={removingMaintenanceCompletionId === completion.id ? 'Removing...' : 'Remove Entry'}
                                                        variant="danger"
                                                        onPress={() => handleRemoveMaintenanceCompletion(completion)}
                                                        disabled={!!removingMaintenanceCompletionId}
                                                        style={scaleStyle(maintenanceRecordRemoveStyle)}
                                                        textStyle={scaleStyle(fileActionButtonTextStyle)}
                                                    />
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        )}

                        {activeMaintenanceTasks.length === 0 ? (
                            <Text style={[scaleStyle(emptyTextStyle), { color: theme.colors.mutedText }]}>No reminders yet.</Text>
                        ) : (
                            <View style={scaleStyle(maintenanceListStyle)}>
                                {activeMaintenanceTasks.map((task) => {
                                    const dueStatus = labelDueStatus(task);
                                    const dueStatusColor =
                                        dueStatus === 'Overdue'
                                            ? theme.colors.danger
                                            : dueStatus === 'Due Soon'
                                                ? theme.colors.primary
                                                : theme.colors.mutedText;

                                    return (
                                        <View
                                            key={task.id}
                                            style={[
                                                maintenanceTaskRowStyle,
                                                {
                                                    backgroundColor: theme.colors.surfaceAlt,
                                                    borderColor: theme.colors.border,
                                                },
                                            ]}
                                        >
                                            <View style={scaleStyle(maintenanceTaskHeaderStyle)}>
                                                <Text style={[scaleStyle(maintenanceTaskTitleStyle), { color: theme.colors.text }]}>
                                                    {task.title}
                                                </Text>
                                                <Text style={[scaleStyle(maintenanceStatusTextStyle), { color: dueStatusColor }]}>
                                                    {dueStatus}
                                                </Text>
                                            </View>

                                            {!!task.description && (
                                                <Text style={[scaleStyle(maintenanceDescriptionStyle), { color: theme.colors.mutedText }]}>
                                                    {task.description}
                                                </Text>
                                            )}

                                            <Text style={[scaleStyle(maintenanceMetaTextStyle), { color: theme.colors.text }]}>
                                                {formatRecurrence(task.recurrence_interval, task.recurrence_unit)}
                                            </Text>
                                            <Text style={[scaleStyle(maintenanceMetaTextStyle), { color: theme.colors.mutedText }]}>
                                                Next due: {formatDateLabel(task.next_due_date)}
                                            </Text>

                                            {!!task.last_completed_date && (
                                                <Text style={[scaleStyle(maintenanceMetaTextStyle), { color: theme.colors.mutedText }]}>
                                                    Last completed: {formatDateLabel(task.last_completed_date)}
                                                </Text>
                                            )}

                                            <ThemedButton
                                                title={completingMaintenanceId === task.id ? 'Adding...' : 'Add to Record'}
                                                onPress={() => handleCompleteMaintenanceTask(task)}
                                                disabled={!!completingMaintenanceId}
                                                style={scaleStyle(maintenanceCompleteButtonStyle)}
                                                textStyle={scaleStyle(fileActionButtonTextStyle)}
                                            />
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {availableMaintenancePresets.length > 0 && (
                            <>
                                <Text style={[scaleStyle(maintenancePresetTitleStyle), { color: theme.colors.mutedText }]}>
                                    Recommended reminders
                                </Text>
                                <View style={scaleStyle(maintenancePresetGridStyle)}>
                                    {availableMaintenancePresets.map((preset) => (
                                        <ThemedButton
                                            key={preset.key}
                                            title={addingMaintenanceKey === preset.key ? 'Adding...' : preset.title}
                                            variant="secondary"
                                            onPress={() => handleAddMaintenancePreset(preset)}
                                            disabled={!!addingMaintenanceKey}
                                            style={scaleStyle(maintenancePresetButtonStyle)}
                                            textStyle={scaleStyle(fileActionButtonTextStyle)}
                                        />
                                    ))}
                                </View>
                            </>
                        )}

                        {!showCustomMaintenanceForm && (
                            <ThemedButton
                                title="+ Custom Reminder"
                                variant="secondary"
                                onPress={handleShowCustomMaintenanceForm}
                                style={scaleStyle(maintenanceCustomButtonStyle)}
                                textStyle={scaleStyle(fileActionButtonTextStyle)}
                            />
                        )}

                        {showCustomMaintenanceForm && (
                            <View
                                style={[
                                    maintenanceCustomFormStyle,
                                    {
                                        backgroundColor: theme.colors.surfaceAlt,
                                        borderColor: theme.colors.border,
                                    },
                                ]}
                            >
                                <Text style={[scaleStyle(maintenanceCustomTitleStyle), { color: theme.colors.text }]}>
                                    Custom reminder
                                </Text>

                                <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                                    Reminder title
                                </Text>
                                <TextInput
                                    value={customReminderTitle}
                                    onChangeText={setCustomReminderTitle}
                                    placeholder="Example: Replace filter"
                                    placeholderTextColor={theme.colors.mutedText}
                                    style={[
                                        maintenanceTextInputStyle,
                                        {
                                            backgroundColor: theme.colors.surface,
                                            borderColor: theme.colors.border,
                                            color: theme.colors.text,
                                        },
                                    ]}
                                />

                                <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                                    Description / notes
                                </Text>
                                <TextInput
                                    value={customReminderDescription}
                                    onChangeText={setCustomReminderDescription}
                                    placeholder="Optional"
                                    placeholderTextColor={theme.colors.mutedText}
                                    multiline
                                    textAlignVertical="top"
                                    style={[
                                        maintenanceTextAreaStyle,
                                        {
                                            backgroundColor: theme.colors.surface,
                                            borderColor: theme.colors.border,
                                            color: theme.colors.text,
                                        },
                                    ]}
                                />

                                <View style={scaleStyle(maintenanceCustomRowStyle)}>
                                    <View style={scaleStyle(maintenanceIntervalInputWrapStyle)}>
                                        <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                                            Every
                                        </Text>
                                        <TextInput
                                            value={customReminderInterval}
                                            onChangeText={setCustomReminderInterval}
                                            keyboardType="number-pad"
                                            placeholder="1"
                                            placeholderTextColor={theme.colors.mutedText}
                                            style={[
                                                maintenanceTextInputStyle,
                                                {
                                                    backgroundColor: theme.colors.surface,
                                                    borderColor: theme.colors.border,
                                                    color: theme.colors.text,
                                                },
                                            ]}
                                        />
                                    </View>

                                    <View style={scaleStyle(maintenanceUnitInputWrapStyle)}>
                                        <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                                            Unit
                                        </Text>
                                        <OptionRow
                                            options={maintenanceRecurrenceUnits}
                                            value={customReminderUnit}
                                            onChange={(value) => setCustomReminderUnit(value as RecurrenceUnit)}
                                            labelForOption={(value) => value}
                                        />
                                    </View>
                                </View>

                                <View style={scaleStyle(maintenanceCustomRowStyle)}>
                                    <View style={scaleStyle(maintenanceDateInputWrapStyle)}>
                                        <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                                            Start date
                                        </Text>
                                        <TextInput
                                            value={customReminderStartDate}
                                            onChangeText={setCustomReminderStartDate}
                                            placeholder="YYYY-MM-DD"
                                            placeholderTextColor={theme.colors.mutedText}
                                            style={[
                                                maintenanceTextInputStyle,
                                                {
                                                    backgroundColor: theme.colors.surface,
                                                    borderColor: theme.colors.border,
                                                    color: theme.colors.text,
                                                },
                                            ]}
                                        />
                                    </View>

                                    <View style={scaleStyle(maintenanceDateInputWrapStyle)}>
                                        <Text style={[scaleStyle(maintenanceFieldLabelStyle), { color: theme.colors.mutedText }]}>
                                            Next due date
                                        </Text>
                                        <TextInput
                                            value={customReminderNextDueDate}
                                            onChangeText={setCustomReminderNextDueDate}
                                            placeholder="YYYY-MM-DD"
                                            placeholderTextColor={theme.colors.mutedText}
                                            style={[
                                                maintenanceTextInputStyle,
                                                {
                                                    backgroundColor: theme.colors.surface,
                                                    borderColor: theme.colors.border,
                                                    color: theme.colors.text,
                                                },
                                            ]}
                                        />
                                    </View>
                                </View>

                                <View style={scaleStyle(maintenanceFormActionsStyle)}>
                                    <ThemedButton
                                        title={savingCustomMaintenance ? 'Saving...' : 'Save'}
                                        onPress={handleSaveCustomMaintenanceReminder}
                                        disabled={savingCustomMaintenance}
                                        style={scaleStyle(maintenanceFormActionButtonStyle)}
                                        textStyle={scaleStyle(fileActionButtonTextStyle)}
                                    />
                                    <ThemedButton
                                        title="Cancel"
                                        variant="ghost"
                                        onPress={handleCancelCustomMaintenanceForm}
                                        disabled={savingCustomMaintenance}
                                        style={scaleStyle(maintenanceFormActionButtonStyle)}
                                        textStyle={scaleStyle(fileActionButtonTextStyle)}
                                    />
                                </View>
                            </View>
                        )}
                    </ThemedCard>
                    ) : null}

                    {checkingEstimateAccess && (
                        <ThemedCard style={scaleStyle(messageCardStyle)}>
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Estimate</Text>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                                Checking estimate permission...
                            </Text>
                        </ThemedCard>
                    )}

                    {showEstimateUnavailableMessage && (
                        <ThemedCard style={scaleStyle(messageCardStyle)}>
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Estimate</Text>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                                {estimatePermissionMessage}
                            </Text>
                        </ThemedCard>
                    )}

                    {canAddItemToEstimate ? renderActionGroup(
                        'estimate',
                        'Estimate & work',
                        'Quote this item, view the current estimate, or open the job thread.',
                        <>
                            <ThemedButton
                                title="Add to Estimate"
                                onPress={handleAddToEstimate}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />

                            <ThemedButton
                                title="View Estimate"
                                onPress={() => router.push({
                                    pathname: '/estimate',
                                    params: {
                                        mode: isManagementMode ? 'management' : '',
                                        itemSlug: item.item_slug || String(slug),
                                        ...(providerModeContext
                                            ? {
                                                ...providerModeQueryParams(providerModeContext),
                                            }
                                            : {
                                                companyId: estimateAccess?.companyId || managementCompanyId || '',
                                                propertyId: item.property_id || managementPropertyId || '',
                                            }),
                                    },
                                } as never)}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />

                            <ThemedButton
                                title="Start Job Thread"
                                onPress={handleStartJobThread}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />
                        </>
                    ) : null}

                    {providerModeContext ? renderActionGroup(
                        'provider',
                        'Provider updates',
                        'Stage notes, findings, and client-update work without changing private HomeOS media.',
                        <>
                            <ThemedButton
                                title="Add Details / Notes"
                                variant="secondary"
                                onPress={() => openProviderPanel('note')}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />
                            <ThemedButton
                                title={mediaActionBusy ? mediaBusyTitle : 'Add Job Photo'}
                                variant="secondary"
                                onPress={() => captureProviderStagedPhoto('Add Job Photo', 'job_photo')}
                                disabled={mediaActionBusy}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />
                            <ThemedButton
                                title="Add Finding"
                                variant="secondary"
                                onPress={() => openProviderPanel('finding')}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />
                            <ThemedButton
                                title="Mark for Client Update"
                                variant="secondary"
                                onPress={handleStageClientUpdateMark}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />
                            <ThemedButton
                                title="Update Client's HomeOS"
                                variant="secondary"
                                onPress={() => openProviderPanel('review')}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />
                        </>
                    ) : null}

                    {renderActionGroup(
                        'media',
                        'Photos & documents',
                        providerModeContext
                            ? 'Provider uploads stay company-side unless a later publish step shares them.'
                            : 'Add item photos, documents, and main-photo evidence.',
                        <>
                            <View style={[scaleStyle(mediaGroupStyle), { borderColor: theme.colors.border }]}>
                                <Text style={[scaleStyle(mediaGroupTitleStyle), { color: theme.colors.text }]}>
                                    Main photo
                                </Text>
                                <Text style={[scaleStyle(mediaGroupDescriptionStyle), { color: theme.colors.mutedText }]}>
                                    The primary photo shown on this item.
                                </Text>
                                <View style={scaleStyle(mediaGroupButtonsStyle)}>
                                    <ThemedButton
                                        title={mediaActionBusy ? mediaBusyTitle : 'Upload Main Photo'}
                                        onPress={handleUploadMainPhoto}
                                        disabled={mediaActionBusy}
                                        style={scaleStyle(mediaGroupButtonStyle)}
                                        textStyle={scaleStyle(buttonTextStyle)}
                                    />

                                    <ThemedButton
                                        title={mediaActionBusy ? mediaBusyTitle : 'Take Main Photo'}
                                        onPress={handleTakeMainPhoto}
                                        disabled={mediaActionBusy}
                                        style={scaleStyle(mediaGroupButtonStyle)}
                                        textStyle={scaleStyle(buttonTextStyle)}
                                    />
                                </View>
                            </View>

                            <View style={[scaleStyle(mediaGroupStyle), { borderColor: theme.colors.border }]}>
                                <Text style={[scaleStyle(mediaGroupTitleStyle), { color: theme.colors.text }]}>
                                    Photo gallery
                                </Text>
                                <Text style={[scaleStyle(mediaGroupDescriptionStyle), { color: theme.colors.mutedText }]}>
                                    Add one camera photo or select several photos at once.
                                </Text>
                                <View style={scaleStyle(actionGroupOptionWrapStyle)}>
                                    <Text style={[scaleStyle(actionGroupInlineLabelStyle), { color: theme.colors.mutedText }]}>
                                        Photo type
                                    </Text>
                                    <OptionRow
                                        options={photoCategories}
                                        value={photoCategory}
                                        onChange={setPhotoCategory}
                                        labelForOption={photoLabel}
                                    />
                                </View>
                                <View style={scaleStyle(mediaGroupButtonsStyle)}>
                                    <ThemedButton
                                        title={mediaActionBusy ? mediaBusyTitle : 'Choose Photos'}
                                        onPress={handleUploadAdditionalPhoto}
                                        disabled={mediaActionBusy}
                                        style={scaleStyle(mediaGroupButtonStyle)}
                                        textStyle={scaleStyle(buttonTextStyle)}
                                    />

                                    <ThemedButton
                                        title={mediaActionBusy ? mediaBusyTitle : 'Take Photo'}
                                        onPress={handleTakeAdditionalPhoto}
                                        disabled={mediaActionBusy}
                                        style={scaleStyle(mediaGroupButtonStyle)}
                                        textStyle={scaleStyle(buttonTextStyle)}
                                    />

                                    <ThemedButton
                                        title="View Photos"
                                        onPress={() => setShowPhotos(true)}
                                        style={scaleStyle(mediaGroupButtonStyle)}
                                        textStyle={scaleStyle(buttonTextStyle)}
                                    />

                                    <ThemedButton
                                        title="Location Video Coming Soon"
                                        variant="secondary"
                                        onPress={handleLocationVideoPlaceholder}
                                        disabled={mediaActionBusy}
                                        style={scaleStyle(mediaGroupButtonStyle)}
                                        textStyle={scaleStyle(buttonTextStyle)}
                                    />
                                </View>
                            </View>

                            <View style={[scaleStyle(mediaGroupStyle), { borderColor: theme.colors.border }]}>
                                <Text style={[scaleStyle(mediaGroupTitleStyle), { color: theme.colors.text }]}>
                                    Documents
                                </Text>
                                <Text style={[scaleStyle(mediaGroupDescriptionStyle), { color: theme.colors.mutedText }]}>
                                    Manuals, warranties, receipts, and other files.
                                </Text>
                                <View style={scaleStyle(mediaGroupButtonsStyle)}>
                                    <ThemedButton
                                        title={mediaActionBusy ? mediaBusyTitle : 'Upload Document'}
                                        onPress={handleUploadDocument}
                                        disabled={mediaActionBusy}
                                        style={scaleStyle(mediaGroupButtonStyle)}
                                        textStyle={scaleStyle(buttonTextStyle)}
                                    />

                                    <ThemedButton
                                        title="View Documents"
                                        onPress={() => {
                                            setSelectedDocumentType(null);
                                            setShowDocuments(true);
                                        }}
                                        style={scaleStyle(mediaGroupButtonStyle)}
                                        textStyle={scaleStyle(buttonTextStyle)}
                                    />
                                </View>
                            </View>
                        </>
                    )}

                    {renderActionGroup(
                        'item',
                        'Item management',
                        'Edit this item, add components inside it, or request/archive work.',
                        <>
                            <ThemedButton
                                title="Edit Information"
                                onPress={handleEditInformation}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />

                            <ThemedButton
                                title="Add Related Item"
                                onPress={handleAddRelatedItem}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />

                            <ThemedButton
                                title="Request Service"
                                onPress={() => setMessage('Request service comes next.')}
                                style={scaleStyle(buttonStyle)}
                                textStyle={scaleStyle(buttonTextStyle)}
                            />

                            <ThemedButton
                                title="Archive Item"
                                variant="danger"
                                onPress={confirmArchiveItem}
                                style={scaleStyle(removeButtonStyle)}
                                textStyle={scaleStyle(removeButtonTextStyle)}
                            />
                        </>
                    )}

                    {renderProviderWorkPanel()}
                    {renderProviderStagedUpdatesPanel()}

                    {!!message && (
                        <ThemedCard style={scaleStyle(messageCardStyle)}>
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Message</Text>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>{message}</Text>
                        </ThemedCard>
                    )}
                </View>
            </ScrollView>

            <Modal visible={showPhoto} transparent={false} animationType="fade">
                <View style={[scaleStyle(modalStyle), { backgroundColor: theme.colors.overlay }]}>
                    <TouchableOpacity
                        onPress={() => setShowPhoto(false)}
                        style={scaleStyle(modalCloseStyle)}
                    >
                        <Text style={[scaleStyle(modalCloseTextStyle), { color: theme.colors.primaryText }]}>✕</Text>
                    </TouchableOpacity>

                    {item.photo_url && (
                        <Image
                            source={{ uri: item.photo_url }}
                            style={scaleStyle(modalImageStyle)}
                            resizeMode="contain"
                        />
                    )}
                </View>
            </Modal>

            <Modal visible={showPhotos} transparent={false} animationType="slide">
                <ScrollView
                    style={[scaleStyle(galleryModalStyle), { backgroundColor: theme.colors.background }]}
                    contentContainerStyle={{ padding: 20 }}
                >
                    <TouchableOpacity onPress={() => setShowPhotos(false)}>
                        <Text style={[scaleStyle(modalBackTextStyle), { color: theme.colors.text }]}>← Close Photos</Text>
                    </TouchableOpacity>

                    <Text style={[scaleStyle(modalTitleStyle), { color: theme.colors.text }]}>Photos</Text>

                    {providerModeContext ? (
                        <ThemedCard style={scaleStyle(providerFormCardStyle)}>
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Provider Photos</Text>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                                Homeowner photos are locked unless shared. Provider-staged photos for this item are shown here.
                            </Text>
                            <View style={scaleStyle(providerPhotoGalleryGridStyle)}>
                                {stagedPhotoEntries.length === 0 ? (
                                    <Text style={[scaleStyle(emptyTextStyle), { color: theme.colors.mutedText }]}>
                                        No staged provider photos yet.
                                    </Text>
                                ) : (
                                    stagedPhotoEntries.map((entry) => renderProviderPhotoTile(entry))
                                )}
                            </View>
                        </ThemedCard>
                    ) : null}

                    <View style={scaleStyle(galleryGridStyle)}>
                        {galleryPhotos.map((photo) => (
                            <View
                                key={photo.id}
                                style={[
                                    galleryCardStyle,
                                    {
                                        backgroundColor: theme.colors.surface,
                                        borderColor: theme.colors.border,
                                        borderRadius: theme.radii.button,
                                    },
                                ]}
                            >
                                <TouchableOpacity onPress={() => Linking.openURL(photo.file_url)} activeOpacity={0.82}>
                                    <Image
                                        source={{ uri: photo.file_url }}
                                        style={[scaleStyle(galleryImageStyle), { backgroundColor: theme.colors.surfaceAlt }]}
                                        resizeMode="contain"
                                    />
                                    <Text style={[scaleStyle(galleryCategoryStyle), { color: theme.colors.text }]}>
                                        {photoLabel(photo.category)}
                                    </Text>
                                </TouchableOpacity>
                                {!photo.isMainPhoto && (
                                    <ThemedButton
                                        title={removingFileId === photo.id ? 'Removing...' : 'Remove'}
                                        variant="danger"
                                        disabled={removingFileId === photo.id}
                                        onPress={() => handleRemoveFile(photo)}
                                        style={scaleStyle(fileActionButtonStyle)}
                                        textStyle={scaleStyle(fileActionButtonTextStyle)}
                                    />
                                )}
                            </View>
                        ))}
                    </View>

                    {galleryPhotos.length === 0 && (
                        <Text style={[scaleStyle(emptyTextStyle), { color: theme.colors.mutedText }]}>
                            {providerModeContext ? 'No shared homeowner photos are available in provider mode.' : 'No photos yet.'}
                        </Text>
                    )}
                </ScrollView>
            </Modal>

            {renderProviderPhotoViewerModal()}
            {renderProviderPhotoRemoveConfirmModal()}

            <Modal visible={showDocuments} transparent={false} animationType="slide">
                <ScrollView
                    style={[scaleStyle(galleryModalStyle), { backgroundColor: theme.colors.background }]}
                    contentContainerStyle={{ padding: 20 }}
                >
                    <TouchableOpacity onPress={() => setShowDocuments(false)}>
                        <Text style={[scaleStyle(modalBackTextStyle), { color: theme.colors.text }]}>Close Documents</Text>
                    </TouchableOpacity>

                    <Text style={[scaleStyle(modalTitleStyle), { color: theme.colors.text }]}>Documents</Text>

                    {providerModeContext ? (
                        <ThemedCard style={scaleStyle(providerFormCardStyle)}>
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>Provider Documents</Text>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                                Homeowner documents are locked unless shared. Staged provider documents for this item are shown here.
                            </Text>
                            <View style={scaleStyle(providerDocumentListStyle)}>
                                {stagedDocumentEntries.length === 0 ? (
                                    <Text style={[scaleStyle(emptyTextStyle), { color: theme.colors.mutedText }]}>
                                        No staged provider documents yet.
                                    </Text>
                                ) : (
                                    stagedDocumentEntries.map((entry) => renderProviderDocumentRow(entry))
                                )}
                            </View>
                        </ThemedCard>
                    ) : null}

                    {!selectedDocumentType ? (
                        <>
                            <Text style={[scaleStyle(documentExplorerTitleStyle), { color: theme.colors.mutedText }]}>Document Type Explorer</Text>

                            <View style={scaleStyle(documentExplorerGridStyle)}>
                                {groupedDocuments.map((group) => (
                                    <TouchableOpacity
                                        key={group.category}
                                        style={[
                                            documentExplorerBlockStyle,
                                            {
                                                backgroundColor: theme.colors.surface,
                                                borderColor: theme.colors.border,
                                                borderRadius: theme.radii.card,
                                            },
                                        ]}
                                        onPress={() => setSelectedDocumentType(group.category)}
                                    >
                                        <Text style={[scaleStyle(documentExplorerBlockTitleStyle), { color: theme.colors.text }]}>
                                            {documentLabel(group.category, 'plural')}
                                        </Text>
                                        <Text style={[scaleStyle(documentExplorerBlockCountStyle), { color: theme.colors.mutedText }]}>
                                            ({group.documents.length})
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    ) : (
                        <View>
                            <TouchableOpacity onPress={() => setSelectedDocumentType(null)}>
                                <Text style={[scaleStyle(modalBackTextStyle), { color: theme.colors.text }]}>Back to Document Type Explorer</Text>
                            </TouchableOpacity>

                            <Text style={[scaleStyle(documentGroupTitleStyle), { color: theme.colors.text }]}>
                                {documentLabel(selectedDocumentType, 'plural')}
                            </Text>

                            {documents
                                .filter((doc) => doc.category === selectedDocumentType)
                                .map((doc) => (
                                    <View
                                        key={doc.id}
                                        style={[
                                            documentCardStyle,
                                            {
                                                backgroundColor: theme.colors.surface,
                                                borderColor: theme.colors.border,
                                                borderRadius: theme.radii.button,
                                            },
                                        ]}
                                    >
                                        <View style={scaleStyle(documentOpenAreaStyle)}>
                                            <View style={[scaleStyle(documentPreviewStyle), { backgroundColor: theme.colors.surfaceAlt }]}>
                                                {isImageFile(doc.file_name) ? (
                                                    <Image
                                                        source={{ uri: doc.file_url }}
                                                        style={scaleStyle(documentPreviewImageStyle)}
                                                        resizeMode="contain"
                                                    />
                                                ) : (
                                                    <Text style={scaleStyle(documentPreviewIconStyle)}>DOC</Text>
                                                )}
                                            </View>

                                            <View style={scaleStyle(documentContentStyle)}>
                                                <Text style={[scaleStyle(documentTitleStyle), { color: theme.colors.text }]}>
                                                    {doc.file_name || 'Document'}
                                                </Text>
                                                <Text style={[scaleStyle(documentSubTextStyle), { color: theme.colors.mutedText }]}>
                                                    {documentLabel(doc.category)}
                                                </Text>

                                                <View style={scaleStyle(documentActionRowStyle)}>
                                                    <ThemedButton
                                                        title="Open"
                                                        variant="secondary"
                                                        onPress={() => Linking.openURL(doc.file_url)}
                                                        style={scaleStyle(documentOpenButtonStyle)}
                                                        textStyle={scaleStyle(documentActionTextStyle)}
                                                    />
                                                    <ThemedButton
                                                        title={removingFileId === doc.id ? 'Removing...' : 'Remove'}
                                                        variant="danger"
                                                        disabled={removingFileId === doc.id}
                                                        onPress={() => handleRemoveFile(doc)}
                                                        style={scaleStyle(documentRemoveButtonStyle)}
                                                        textStyle={scaleStyle(documentActionTextStyle)}
                                                    />
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                ))}

                            {documents.filter((doc) => doc.category === selectedDocumentType).length === 0 && (
                                <Text style={[scaleStyle(emptyTextStyle), { color: theme.colors.mutedText }]}>
                                    No {documentLabel(selectedDocumentType, 'plural').toLowerCase()} yet.
                                </Text>
                            )}
                        </View>
                    )}

                    {documents.length === 0 && (
                        <Text style={[scaleStyle(emptyTextStyle), { color: theme.colors.mutedText }]}>
                            {providerModeContext ? 'No shared homeowner documents are available in provider mode.' : 'No documents yet.'}
                        </Text>
                    )}
                </ScrollView>
            </Modal>
            <Modal visible={showDocumentTypePicker} transparent={false} animationType="slide">
                <ScrollView
                    style={[scaleStyle(galleryModalStyle), { backgroundColor: theme.colors.background }]}
                    contentContainerStyle={{ padding: 20 }}
                >
                    <TouchableOpacity
                        onPress={() => {
                            setShowDocumentTypePicker(false);
                        }}
                    >
                        <Text style={[scaleStyle(modalBackTextStyle), { color: theme.colors.text }]}>← Cancel</Text>
                    </TouchableOpacity>

                    <Text style={[scaleStyle(modalTitleStyle), { color: theme.colors.text }]}>What type of document is this?</Text>

                    <Text style={[scaleStyle(subtitleStyle), { color: theme.colors.mutedText }]}>
                        Choose where this file should be stored.
                    </Text>

                    <View style={scaleStyle(documentTypeGridStyle)}>
                        {documentCategories.map((type) => (
                            <TouchableOpacity
                                key={type}
                                style={[
                                    documentTypeBlockStyle,
                                    {
                                        backgroundColor: theme.colors.surface,
                                        borderColor: theme.colors.border,
                                        borderRadius: theme.radii.card,
                                    },
                                ]}
                                onPress={() => finishDocumentUpload(type)}
                            >
                                <Text style={[scaleStyle(documentTypeBlockTitleStyle), { color: theme.colors.text }]}>
                                    {documentLabel(type)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </Modal>
        </>
    );
}

function OptionRow({
    options,
    value,
    onChange,
    labelForOption = (option: string) => option.replace(/_/g, ' '),
}: {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    labelForOption?: (option: string) => string;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    function scaleStyle<T extends Record<string, any>>(style: T): T {
        const fontKeys = new Set(['fontSize', 'lineHeight']);
        const iconKeys = new Set([
            'padding',
            'paddingTop',
            'paddingBottom',
            'paddingVertical',
            'paddingHorizontal',
            'marginTop',
            'marginBottom',
            'marginVertical',
            'marginHorizontal',
            'gap',
            'rowGap',
            'columnGap',
            'width',
            'height',
            'minWidth',
            'minHeight',
            'borderRadius',
        ]);

        const scaledStyle: Record<string, any> = { ...style };

        Object.entries(style).forEach(([key, value]) => {
            if (typeof value !== 'number') return;

            if (fontKeys.has(key)) {
                scaledStyle[key] = scaleFont(value);
            }

            if (iconKeys.has(key)) {
                scaledStyle[key] = scaleIcon(value);
            }
        });

        return scaledStyle as T;
    }

    return (
        <View style={scaleStyle(optionRowStyle)}>
            {options.map((option) => (
                <TouchableOpacity
                    key={option}
                    onPress={() => onChange(option)}
                    style={[
                        optionButtonStyle,
                        {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.pill,
                        },
                        value === option && {
                            backgroundColor: theme.colors.primary,
                            borderColor: theme.colors.primary,
                        },
                    ]}
                >
                    <Text
                        style={[
                            optionButtonTextStyle,
                            { color: theme.colors.mutedText },
                            value === option && { color: theme.colors.primaryText },
                        ]}
                    >
                        {labelForOption(option)}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

async function isPlatformAdmin(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    if (!primaryQuery.error) {
        return isPlatformAdminProfile((primaryQuery.data || [])[0] as PlatformProfile | undefined);
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    return isPlatformAdminProfile((fallbackQuery.data || [])[0] as PlatformProfile | undefined);
}

function isPlatformAdminProfile(profile?: PlatformProfile | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

function firstParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function shortId(value?: string | null) {
    if (!value) return 'Unavailable';

    return value.slice(0, 8).toUpperCase();
}

function formatCompactDateTime(value?: string | null) {
    if (!value) return 'Just now';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return 'Just now';

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function countProviderStagedEntries(entries: ProviderStagedWorkEntry[]) {
    const counts: Record<ProviderStagedDisplayType, number> = {
        photo: 0,
        document: 0,
        reminder: 0,
        note: 0,
        finding: 0,
        edit: 0,
        related_item: 0,
        archive_request: 0,
        client_update_mark: 0,
    };

    entries.forEach((entry) => {
        counts[providerStagedDisplayType(entry)] += 1;
    });

    return counts;
}

function formatProviderStagedSummary(entries: ProviderStagedWorkEntry[]) {
    const counts = countProviderStagedEntries(entries);
    const parts = providerStagedDisplayTypes
        .map((type) => {
            const count = counts[type];
            if (count <= 0) return '';

            const label = count === 1
                ? providerStagedCountLabels[type].singular
                : providerStagedCountLabels[type].plural;

            return `${count} ${label}`;
        })
        .filter(Boolean);

    return parts.length > 0 ? parts.join(' · ') : 'No staged updates yet.';
}

function providerStagedDisplayType(entry: ProviderStagedWorkEntry): ProviderStagedDisplayType {
    return isProviderStagedReminderEntry(entry) ? 'reminder' : entry.type;
}

function providerStagedEntryLabel(entry: ProviderStagedWorkEntry) {
    if (isProviderStagedReminderEntry(entry)) return 'Staged Reminder';

    return providerStagedWorkTypeLabel(entry.type);
}

function isProviderStagedReminderEntry(entry: ProviderStagedWorkEntry) {
    const source = payloadString(entry.payload, 'source').toLowerCase();
    const destination = payloadString(entry.payload, 'destination').toLowerCase();

    return (
        entry.type === 'note' &&
        (
            source === 'custom_reminder' ||
            destination === 'provider_staged_reminder' ||
            Boolean(payloadString(entry.payload, 'reminder_title')) ||
            Boolean(payloadString(entry.payload, 'reminder_text'))
        )
    );
}

function summarizeProviderStagedEntry(entry: ProviderStagedWorkEntry) {
    const payload = entry.payload;

    if (isProviderStagedReminderEntry(entry)) {
        const title = payloadString(payload, 'reminder_title') || payloadString(payload, 'reminder_text') || 'Custom reminder';
        const recurrence = formatProviderReminderRecurrence(payload);
        const dueDate = payloadString(payload, 'next_due_date');
        const itemName = payloadString(payload, 'item_name') || entry.item_name;
        const location = payloadString(payload, 'location') || entry.location || '';
        const system = payloadString(payload, 'system') || entry.system || '';

        return [
            title,
            recurrence,
            dueDate ? `Due ${dueDate}` : '',
            itemName ? `Item: ${itemName}` : '',
            system || location ? [system, location].filter(Boolean).join(' / ') : '',
        ]
            .filter(Boolean)
            .join(' - ');
    }

    if (entry.type === 'note') {
        return payloadString(payload, 'details') || payloadString(payload, 'destination') || 'Provider note staged.';
    }

    if (entry.type === 'finding') {
        const title = payloadString(payload, 'title') || 'Finding';
        const severity = payloadString(payload, 'severity');
        const action = payloadString(payload, 'recommended_action');

        return [title, severity ? `Severity: ${severity}` : '', action ? `Action: ${action}` : '']
            .filter(Boolean)
            .join(' - ');
    }

    if (entry.type === 'photo') {
        const source = payloadString(payload, 'source_action') || 'Photo action';
        const photoType = payloadString(payload, 'photo_type');
        const fileName = payloadString(payload, 'file_name');
        const storagePath = payloadString(payload, 'storage_path');
        const fileLabel = fileName || storagePath;
        const summary = photoType ? `${source} - ${photoLabel(photoType)}` : source;

        return fileLabel ? `${summary} - ${fileLabel}` : summary;
    }

    if (entry.type === 'document') {
        const source = payloadString(payload, 'source_action') || 'Document action';
        const documentType = payloadString(payload, 'document_type');

        return documentType ? `${source} - ${documentLabel(documentType)}` : source;
    }

    if (entry.type === 'edit') {
        const changedFields = ['name', 'condition', 'status', 'brand', 'model', 'serial', 'location']
            .filter((field) => Boolean(payloadString(payload, field)));

        return changedFields.length > 0
            ? `Staged fields: ${changedFields.join(', ')}`
            : 'Provider information edit staged.';
    }

    if (entry.type === 'related_item') {
        const name = payloadString(payload, 'name') || 'Related item';
        const category = payloadString(payload, 'category');

        return category ? `${name} - ${category}` : name;
    }

    if (entry.type === 'archive_request') {
        return 'Archive request staged. The client item was not changed.';
    }

    return 'Marked for a future Client HomeOS update.';
}

function providerReminderDetailLines(entry: ProviderStagedWorkEntry) {
    const payload = entry.payload;
    const title = payloadString(payload, 'reminder_title') || payloadString(payload, 'reminder_text') || 'Custom reminder';
    const description = payloadString(payload, 'reminder_description');
    const recurrence = formatProviderReminderRecurrence(payload);
    const startDate = payloadString(payload, 'start_date');
    const dueDate = payloadString(payload, 'next_due_date');
    const itemName = payloadString(payload, 'item_name') || entry.item_name;
    const system = payloadString(payload, 'system') || entry.system || '';
    const location = payloadString(payload, 'location') || entry.location || '';

    return [
        `Reminder: ${title}`,
        description ? `Notes: ${description}` : '',
        recurrence ? `Recurrence: ${recurrence}` : '',
        startDate ? `Start: ${startDate}` : '',
        dueDate ? `Next due: ${dueDate}` : '',
        itemName ? `Item: ${itemName}` : '',
        system || location ? `System/location: ${[system, location].filter(Boolean).join(' / ')}` : '',
    ].filter(Boolean);
}

function formatProviderReminderRecurrence(payload: ProviderStagedWorkPayload) {
    const interval = payloadNumber(payload, 'recurrence_interval');
    const unit = payloadString(payload, 'recurrence_unit');

    if (!interval || !unit) return '';

    const normalizedUnit = interval === 1 ? unit.replace(/s$/, '') : unit;

    return `Every ${interval} ${normalizedUnit}`;
}

function providerStagedSourceLabel(entry: ProviderStagedWorkEntry) {
    return entry.source === 'provider_staging'
        ? 'Saved to provider staging'
        : 'Local staged entry';
}

function providerStagedPhotoPreviewUrl(payload: ProviderStagedWorkPayload) {
    return (
        payloadString(payload, 'preview_url') ||
        payloadString(payload, 'public_or_signed_url') ||
        payloadString(payload, 'public_url') ||
        payloadString(payload, 'signed_url')
    );
}

function providerStagedPhotoBucket(payload: ProviderStagedWorkPayload) {
    const bucket = (
        payloadString(payload, 'bucket') ||
        payloadString(payload, 'storage_bucket') ||
        PROVIDER_STAGED_PHOTO_BUCKET
    );

    return bucket === PROVIDER_STAGED_PHOTO_BUCKET ? bucket : PROVIDER_STAGED_PHOTO_BUCKET;
}

function isSafeProviderStagedPhotoPath(path: string) {
    return path.startsWith('users/') && path.includes('/provider-staged-work/');
}

function isProviderStagedMainPhotoEntry(entry: ProviderStagedWorkEntry) {
    if (entry.type !== 'photo') return false;

    const payload = entry.payload;
    const photoType = payloadString(payload, 'photo_type').toLowerCase();
    const actionSource = (
        payloadString(payload, 'action_source') ||
        payloadString(payload, 'source_action')
    ).toLowerCase();
    const fileStatus = payloadString(payload, 'provider_file_status').toLowerCase();

    return (
        photoType === 'main_photo' &&
        fileStatus === 'uploaded' &&
        Boolean(providerStagedPhotoPreviewUrl(payload)) &&
        (actionSource.includes('upload main photo') || actionSource.includes('take main photo'))
    );
}

function providerStagingStatusText(status: ProviderStagingBackendStatus | null) {
    return status?.message || 'Provider staging backend: checking...';
}

function providerStagingStatusColor(
    status: ProviderStagingBackendStatus | null,
    fallbackColor: string,
    errorColor: string,
    connectedColor: string
) {
    if (status?.status === 'connected') return connectedColor;
    if (status?.status === 'error') return errorColor;

    return fallbackColor;
}

function providerStagingErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;

    if (error && typeof error === 'object') {
        const candidate = error as { message?: unknown; details?: unknown; hint?: unknown };
        const parts = [candidate.message, candidate.details, candidate.hint]
            .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);

        if (parts.length > 0) return parts.join(' ');
    }

    return 'Unknown provider staging error.';
}

function payloadString(payload: ProviderStagedWorkPayload, key: string) {
    const value = payload[key];

    return typeof value === 'string' ? value.trim() : '';
}

function payloadNumber(payload: ProviderStagedWorkPayload, key: string) {
    const value = payload[key];

    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;

    const parsedValue = Number.parseInt(value.trim(), 10);

    return Number.isFinite(parsedValue) ? parsedValue : null;
}

const centerStyle = {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 24,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 16,
    lineHeight: 22,
};

const photoCardStyle = {
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
};

const labelStyle = {
    fontSize: 14,
    marginBottom: 6,
    fontWeight: '900' as const,
};

const photoStyle = {
    height: 320,
    width: '100%' as const,
    borderRadius: 18,
    marginTop: 12,
};

const photoPlaceholderStyle = {
    height: 260,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 12,
};

const photoIconStyle = {
    fontSize: 28,
    marginBottom: 6,
};

const photoTextStyle = {
    fontWeight: '900' as const,
};

const secondaryButtonStyle = {
    borderRadius: 16,
    padding: 14,
    alignItems: 'center' as const,
    marginTop: 12,
};

const secondaryButtonTextStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const infoGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 14,
};

const miniCardStyle = {
    width: '32%' as const,
    minWidth: 180,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
};

const miniLabelStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 6,
};

const miniValueStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const fileSummaryStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 14,
};

const fileSummaryCardStyle = {
    flex: 1,
    minWidth: 180,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
};

const fileSummaryTitleStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const fileSummaryCountStyle = {
    fontSize: 28,
    fontWeight: '900' as const,
    marginTop: 4,
};

const maintenanceCardStyle = {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
};

const maintenanceSectionHeaderStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
    marginBottom: 12,
};

const maintenanceRecordToggleStyle = {
    paddingVertical: 9,
    paddingHorizontal: 12,
};

const maintenanceRecordStyle = {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
};

const maintenanceRecordTitleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    marginBottom: 10,
};

const maintenanceRecordListStyle = {
    gap: 8,
};

const maintenanceRecordRowStyle = {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
};

const maintenanceRecordRowTextStyle = {
    flex: 1,
    minWidth: 180,
};

const maintenanceRecordRemoveStyle = {
    paddingVertical: 9,
    paddingHorizontal: 12,
};

const maintenanceListStyle = {
    gap: 12,
};

const maintenanceTaskRowStyle = {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
};

const maintenanceTaskHeaderStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
};

const maintenanceTaskTitleStyle = {
    flex: 1,
    fontSize: 18,
    fontWeight: '900' as const,
};

const maintenanceStatusTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const maintenanceDescriptionStyle = {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800' as const,
};

const maintenanceMetaTextStyle = {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '800' as const,
};

const maintenanceCompleteButtonStyle = {
    alignSelf: 'flex-start' as const,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
};

const maintenancePresetTitleStyle = {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '900' as const,
};

const maintenancePresetGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 10,
};

const maintenancePresetButtonStyle = {
    flexGrow: 1,
    minWidth: 180,
    paddingVertical: 12,
};

const maintenanceCustomButtonStyle = {
    alignSelf: 'flex-start' as const,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
};

const maintenanceCustomFormStyle = {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 14,
};

const maintenanceCustomTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 10,
};

const maintenanceFieldLabelStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 6,
};

const maintenanceTextInputStyle = {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '800' as const,
    marginBottom: 12,
};

const maintenanceTextAreaStyle = {
    ...maintenanceTextInputStyle,
    minHeight: 88,
};

const maintenanceCustomRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const maintenanceIntervalInputWrapStyle = {
    width: 140,
    maxWidth: '100%' as const,
};

const maintenanceUnitInputWrapStyle = {
    flex: 1,
    minWidth: 220,
};

const maintenanceDateInputWrapStyle = {
    flex: 1,
    minWidth: 180,
};

const maintenanceFormActionsStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 2,
};

const maintenanceFormActionButtonStyle = {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: 12,
};

const sectionTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginTop: 14,
    marginBottom: 10,
};

const optionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 12,
};

const optionButtonStyle = {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
};

const optionButtonSelectedStyle = {
};

const optionButtonTextStyle = {
    fontWeight: '900' as const,
};

const optionButtonSelectedTextStyle = {
};

const sectionTileGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
};

const sectionTileStyle = {
    width: 152,
    minHeight: 132,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'space-between' as const,
    overflow: 'hidden' as const,
};

const sectionTileAccentStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 5,
};

const sectionTileTitleStyle = {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900' as const,
};

const sectionTileSubtitleStyle = {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800' as const,
    marginTop: 6,
};

const sectionTileFooterStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
    marginTop: 10,
};

const sectionTileMetaStyle = {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900' as const,
};

const sectionTileActionStyle = {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900' as const,
};

const relatedItemsCardStyle = {
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 1,
};

const relatedItemsHeaderStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
};

const relatedItemsHeaderTextStyle = {
    flex: 1,
    minWidth: 220,
};

const relatedItemsAddButtonStyle = {
    minWidth: 142,
    paddingVertical: 10,
};

const relatedItemsEmptyStyle = {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
};

const relatedItemsGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 14,
};

const relatedItemCardStyle = {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    width: 148,
    minHeight: 120,
    justifyContent: 'center' as const,
};

const relatedItemTitleStyle = {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900' as const,
};

const relatedItemMetaStyle = {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800' as const,
    marginTop: 4,
};

const actionGroupCardStyle = {
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 10,
    borderWidth: 1,
};

const actionGroupHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
};

const actionGroupHeaderTextStyle = {
    flex: 1,
    minWidth: 180,
};

const actionGroupTitleStyle = {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900' as const,
};

const actionGroupSubtitleStyle = {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800' as const,
    marginTop: 2,
};

const actionGroupToggleStyle = {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900' as const,
};

const actionGroupInlineLabelStyle = {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900' as const,
};

const actionGroupOptionWrapStyle = {
    width: '100%' as const,
};

const mediaGroupStyle = {
    width: '100%' as const,
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 4,
};

const mediaGroupTitleStyle = {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900' as const,
};

const mediaGroupDescriptionStyle = {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800' as const,
    marginBottom: 6,
};

const mediaGroupButtonsStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const mediaGroupButtonStyle = {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 170,
    maxWidth: '100%' as const,
    borderRadius: 16,
    padding: 15,
    alignItems: 'center' as const,
};

const actionGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 6,
};

const providerModeButtonRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 14,
};

const providerModeButtonStyle = {
    paddingVertical: 10,
    paddingHorizontal: 12,
};

const providerModeButtonTextStyle = {
    fontSize: 12,
};

const providerStagingStatusTextStyle = {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900' as const,
};

const providerFormCardStyle = {
    borderRadius: 20,
    padding: 18,
    marginTop: 12,
    borderWidth: 1,
};

const providerFormActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 14,
};

const providerFormButtonStyle = {
    minWidth: 160,
    paddingVertical: 12,
    paddingHorizontal: 16,
};

const providerTwoColumnRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    columnGap: 12,
    rowGap: 10,
};

const providerFieldWrapStyle = {
    flex: 1,
    minWidth: 210,
};

const providerToggleRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 12,
};

const providerToggleButtonStyle = {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
};

const providerToggleTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const providerStagedCardStyle = {
    borderRadius: 20,
    padding: 18,
    marginTop: 12,
    borderWidth: 1,
};

const providerStagedHeaderStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
};

const providerStagedHeaderButtonStyle = {
    paddingVertical: 10,
    paddingHorizontal: 14,
};

const providerStagedListStyle = {
    gap: 10,
    marginTop: 12,
};

const providerStagedEntryStyle = {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
};

const providerStagedEntryHeaderStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
};

const providerStagedEntryTypeStyle = {
    flex: 1,
    fontSize: 14,
    fontWeight: '900' as const,
};

const providerStagedEntryDateStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
};

const providerStagedEntrySourceStyle = {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '900' as const,
};

const providerStagedEntrySummaryStyle = {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800' as const,
};

const providerReminderDetailsStyle = {
    marginTop: 10,
    gap: 4,
};

const providerStagedPhotoBlockStyle = {
    marginTop: 10,
    gap: 8,
};

const providerStagedPhotoPreviewWrapStyle = {
    width: 150,
    height: 112,
    borderRadius: 14,
    overflow: 'hidden' as const,
};

const providerStagedPhotoPreviewStyle = {
    width: '100%' as const,
    height: '100%' as const,
};

const providerPhotoGalleryGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 12,
};

const providerPhotoTileStyle = {
    width: 156,
    borderWidth: 1,
    padding: 10,
};

const providerPhotoThumbWrapStyle = {
    width: '100%' as const,
    height: 116,
    borderRadius: 14,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
};

const providerPhotoThumbStyle = {
    width: '100%' as const,
    height: '100%' as const,
};

const providerMediaTitleStyle = {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900' as const,
};

const providerMediaMetaStyle = {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800' as const,
    marginTop: 3,
};

const providerMediaStatusStyle = {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900' as const,
    marginTop: 3,
};

const providerDetailsButtonStyle = {
    alignSelf: 'flex-start' as const,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 9,
};

const providerDetailsButtonTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const providerPhotoActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 9,
};

const providerMediaDetailsStyle = {
    marginTop: 8,
    gap: 3,
};

const providerMediaPathStyle = {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800' as const,
};

const providerPhotoViewerOverlayStyle = {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 16,
};

const providerPhotoViewerCardStyle = {
    width: '94%' as const,
    maxWidth: 900,
    maxHeight: '92%' as const,
    borderWidth: 1,
    padding: 16,
};

const providerPhotoRemoveConfirmCardStyle = {
    width: '92%' as const,
    maxWidth: 480,
    borderWidth: 1,
    padding: 18,
};

const providerPhotoViewerHeaderStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    marginBottom: 12,
};

const providerPhotoViewerTitleWrapStyle = {
    flex: 1,
    minWidth: 0,
};

const providerPhotoViewerTitleStyle = {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900' as const,
};

const providerPhotoViewerCloseButtonStyle = {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
};

const providerPhotoViewerImageStyle = {
    width: '100%' as const,
    height: 440,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const providerPhotoViewerMetaStyle = {
    marginTop: 12,
    gap: 2,
};

const providerPhotoViewerActionsStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 14,
};

const providerPhotoViewerActionButtonStyle = {
    minWidth: 130,
    paddingVertical: 10,
    paddingHorizontal: 14,
};

const providerDocumentListStyle = {
    gap: 8,
    marginTop: 12,
};

const providerDocumentRowStyle = {
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
};

const providerDocumentDetailsStyle = {
    width: '100%' as const,
    marginTop: 4,
};

const providerClearButtonStyle = {
    alignSelf: 'flex-start' as const,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
};

const buttonStyle = {
    width: '32%' as const,
    minWidth: 180,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
};

const buttonTextStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};

const removeButtonStyle = {
    width: '32%' as const,
    minWidth: 180,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
    borderWidth: 1,
};

const removeButtonTextStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};

const messageCardStyle = {
    borderRadius: 20,
    padding: 18,
    marginTop: 12,
    borderWidth: 1,
};

const bodyTextStyle = {
    fontSize: 16,
    lineHeight: 22,
};

const modalStyle = {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
};

const modalCloseStyle = {
    position: 'absolute' as const,
    top: 50,
    right: 30,
    zIndex: 999,
};

const modalCloseTextStyle = {
    fontSize: 30,
    fontWeight: '900' as const,
};

const modalImageStyle = {
    width: '95%' as const,
    height: '90%' as const,
};

const galleryModalStyle = {
    flex: 1,
};

const modalBackTextStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 20,
};

const modalTitleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    marginBottom: 20,
};

const galleryGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const galleryCardStyle = {
    width: '23%' as const,
    minWidth: 160,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
};

const galleryImageStyle = {
    width: '100%' as const,
    height: 140,
    borderRadius: 14,
};

const galleryCategoryStyle = {
    marginTop: 8,
    fontWeight: '900' as const,
};


const documentPreviewStyle = {
    width: 90,
    height: 90,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const documentPreviewImageStyle = {
    width: '100%' as const,
    height: '100%' as const,
    borderRadius: 14,
};

const documentPreviewIconStyle = {
    fontSize: 34,
};

const documentOpenTextStyle = {
    marginTop: 8,
    fontWeight: '900' as const,
};

const fileActionButtonStyle = {
    marginTop: 12,
    paddingVertical: 12,
};

const fileActionButtonTextStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
};

const documentCardStyle = {
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
};

const documentOpenAreaStyle = {
    flexDirection: 'row' as const,
    gap: 12,
    alignItems: 'flex-start' as const,
};

const documentContentStyle = {
    flex: 1,
    minWidth: 0,
};

const documentActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 12,
};

const documentOpenButtonStyle = {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: 12,
};

const documentRemoveButtonStyle = {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: 12,
};

const documentActionTextStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
};

const documentTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const documentSubTextStyle = {
    marginTop: 6,
    fontWeight: '900' as const,
};

const emptyTextStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};
const documentGroupTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginTop: 12,
    marginBottom: 10,
    textTransform: 'capitalize' as const,
};

const documentExplorerTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 14,
};

const documentExplorerGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const documentExplorerBlockStyle = {
    width: '23%' as const,
    minWidth: 190,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
};

const documentExplorerBlockTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const documentExplorerBlockCountStyle = {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '900' as const,
};

const documentTypeGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 20,
};

const documentTypeBlockStyle = {
    width: '31%' as const,
    minWidth: 180,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
};

const documentTypeBlockTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    textTransform: 'capitalize' as const,
};
