import * as ImagePicker from 'expo-image-picker';
import {
    approveCatalogAiDraft,
    listOpenCatalogAiDrafts,
    loadCatalogAiDraft,
    researchCatalogItemWithAi,
    saveCatalogAiDraft,
} from './catalogAiBuilder';
import type { CatalogAiLoadedDraft } from './catalogAiDraftPersistenceCore';
import {
    CATALOG_PRIMARY_ITEM_TYPES,
    curateCatalogAiSources,
    type CatalogAiDraftPayload,
    type CatalogAiResearchResult,
    type CatalogFieldProvenance,
    type CatalogPrimaryItemType,
} from './catalogAiBuilderCore';
import { supabase } from './supabase';

type AdapterTemplate = {
    id: string;
    templateKey: string;
    categoryName: string;
};

type UiSource = {
    id: string;
    kind: 'product_page' | 'installation_manual' | 'owner_manual' | 'specification_sheet' | 'warranty' | 'other';
    title: string;
    url: string;
};

type UiCandidateImage = {
    id: string;
    url: string;
    label: string;
    sourceUrl?: string;
    selected?: boolean;
    primary?: boolean;
    uploaded?: boolean;
};

export type CatalogAiBuilderUiDraft = {
    prompt: string;
    manufacturer: string;
    productName: string;
    familyName: string;
    modelNumber: string;
    manufacturerPartNumber: string;
    productUrl: string;
    notes: string;
    primaryItemType: string;
    subtype: string;
    categoryTemplateId: string;
    system: string;
    suggestedAreas: string[];
    parentPlacements: string[];
    tags: string[];
    description: string;
    specifications: Record<string, string>;
    sources: UiSource[];
    candidateImages: UiCandidateImage[];
    provenance: Record<string, 'admin_entered' | 'verified_source' | 'ai_inferred' | 'unverified'>;
    provenanceSourceUrls: Record<string, string[]>;
    warnings: string[];
    criticalWarnings: string[];
};

type UiDraft = CatalogAiBuilderUiDraft;

export type CatalogAiAdapterSavedDraftSummary = {
    draftId: string;
    label: string;
    updatedAt: string;
};

type UiResearchRequest = {
    prompt: string;
    refinement: string;
    known: Pick<UiDraft, 'manufacturer' | 'productName' | 'modelNumber' | 'manufacturerPartNumber' | 'productUrl' | 'notes' | 'primaryItemType' | 'subtype' | 'system'>;
    currentDraft: UiDraft;
};

export function createCatalogAiBuilderAdapter(templates: AdapterTemplate[]) {
    let currentDraftId = '';
    const storedUploads = new Map<string, StoredCandidate>();
    return {
        listDrafts: async (): Promise<CatalogAiAdapterSavedDraftSummary[]> => (await listOpenCatalogAiDrafts()).map((draft) => ({
            draftId: draft.id,
            label: [draft.manufacturer, draft.productName || draft.familyName, draft.modelNumber].filter(Boolean).join(' ')
                || draft.categoryName
                || 'Untitled AI catalog draft',
            updatedAt: draft.updatedAt,
        })),
        loadDraft: async (draftId: string): Promise<{ draftId: string; draft: UiDraft }> => {
            const saved = await loadCatalogAiDraft(draftId);
            if (saved.status !== 'draft') throw new Error('Only an open AI catalog draft can be resumed.');
            currentDraftId = saved.id;
            storedUploads.clear();
            saved.candidateImages.forEach((candidate) => {
                if (!candidate.copiedBucket || !candidate.copiedStoragePath) return;
                storedUploads.set(candidate.id, {
                    id: candidate.id,
                    imageUrl: candidate.imageUrl,
                    copiedBucket: candidate.copiedBucket,
                    copiedStoragePath: candidate.copiedStoragePath,
                    fileName: candidate.fileName || candidate.title || 'Catalog image',
                    mimeType: candidate.mimeType || 'image/jpeg',
                    sizeBytes: candidate.sizeBytes ?? null,
                });
            });
            const displayUrls = await loadDraftCandidateDisplayUrls(saved);
            const draft = storedDraftToUiDraft(saved, displayUrls);
            return { draftId: saved.id, draft };
        },
        startNewDraft: () => {
            currentDraftId = '';
            storedUploads.clear();
            pendingUploadContext.draftId = '';
        },
        research: async (request: UiResearchRequest): Promise<Partial<UiDraft>> => {
            const result = await researchCatalogItemWithAi({
                prompt: [request.prompt.trim(), request.refinement.trim()].filter(Boolean).join('\n\nRequested revision: '),
                manufacturer: request.known.manufacturer,
                productName: request.known.productName,
                modelNumber: request.known.modelNumber,
                manufacturerPartNumber: request.known.manufacturerPartNumber,
                primaryItemType: asPrimaryItemType(request.known.primaryItemType),
                subtype: request.known.subtype,
                system: request.known.system,
                knownSpecifications: compactCurrentDraftContext(request.currentDraft),
                productUrl: request.known.productUrl,
                notes: request.known.notes,
            });
            return researchToUiDraft(result, templates, request.currentDraft);
        },
        saveDraft: async (draft: UiDraft) => {
            let payload = await uiDraftToPayload(draft, storedUploads);
            let result = await saveCatalogAiDraft(currentDraftId || null, payload);
            currentDraftId = readId(result, 'draft_id');
            if (!currentDraftId) throw new Error('The AI catalog draft was saved without a usable identifier.');
            if (draft.candidateImages.some((candidate) => candidate.uploaded && !candidate.url.startsWith('storage://'))) {
                pendingUploadContext.draftId = currentDraftId;
                try {
                    payload = await uiDraftToPayload(draft, storedUploads);
                    result = await saveCatalogAiDraft(currentDraftId, payload);
                } finally {
                    pendingUploadContext.draftId = '';
                }
            }
            return { draftId: currentDraftId };
        },
        approveDraft: async (draftId: string, draft: UiDraft) => {
            currentDraftId = draftId;
            const payload = await uiDraftToPayload(draft, storedUploads);
            await saveCatalogAiDraft(currentDraftId, payload);
            const result = await approveCatalogAiDraft(currentDraftId);
            const variantId = readId(result, 'variant_id');
            if (!variantId) throw new Error('The AI catalog draft was approved without a usable product identifier.');
            return { variantId };
        },
        pickImage: async (): Promise<UiCandidateImage | null> => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) throw new Error('Photo access is required to select a catalog image.');
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsMultipleSelection: false,
                quality: 0.9,
            });
            const asset = result.canceled ? null : result.assets[0];
            if (!asset) return null;
            return {
                id: createId(),
                url: asset.uri,
                label: asset.fileName || 'Uploaded catalog image',
                sourceUrl: asset.uri,
                selected: false,
                primary: false,
                uploaded: true,
            };
        },
    };
}

function researchToUiDraft(result: CatalogAiResearchResult, templates: AdapterTemplate[], current: UiDraft): Partial<UiDraft> {
    const template = templates.find((candidate) =>
        same(candidate.categoryName, result.category)
        || same(candidate.categoryName, result.subtype)
        || same(candidate.templateKey, result.category)
        || same(candidate.templateKey, result.subtype));
    const provenance = Object.fromEntries(result.fields.map((field) => [
        `specifications.${field.key}`,
        field.provenance.kind === 'verified' ? 'verified_source' : field.provenance.kind,
    ]));
    const provenanceSourceUrls = Object.fromEntries(result.fields.map((field) => [
        `specifications.${field.key}`,
        uniqueStrings(field.provenance.sourceUrls),
    ]));
    const sources: UiSource[] = result.sources.map((source, index) => ({
        id: `research-source-${index}-${shortHash(source.url)}`,
        kind: ({
            manufacturer_product: 'product_page',
            installation_manual: 'installation_manual',
            owner_manual: 'owner_manual',
            specification_sheet: 'specification_sheet',
            warranty_document: 'warranty',
        } as const)[source.sourceType],
        title: source.title,
        url: source.url,
    }));
    const officialProductUrl = result.sources.find((source) => source.sourceType === 'manufacturer_product')?.url || '';
    const identityEntries = [
        ['manufacturer', 'manufacturer', result.manufacturer],
        ['productName', 'product_name', result.productName],
        ['familyName', 'family_name', result.familyName],
        ['modelNumber', 'model_number', result.modelNumber],
        ['manufacturerPartNumber', 'manufacturer_part_number', result.manufacturerPartNumber],
    ] as const;
    identityEntries.forEach(([uiKey, fieldKey, value]) => {
        const exact = researchEvidenceFor(result, fieldKey);
        const sourceUrls = exact.sourceUrls.length
            ? exact.sourceUrls
            : !exact.hasMatch && result.exactModelMatch && officialProductUrl ? [officialProductUrl] : [];
        provenance[uiKey] = value && sourceUrls.length
            ? 'verified_source'
            : exact.kind === 'ai_inferred' ? 'ai_inferred' : 'unverified';
        provenanceSourceUrls[uiKey] = sourceUrls;
    });
    const descriptionEvidence = researchEvidenceFor(result, 'detailed_description', 'short_description', 'description');
    provenance.description = descriptionEvidence.kind === 'verified' && descriptionEvidence.sourceUrls.length
        ? 'verified_source'
        : result.detailedDescription || result.shortDescription ? 'ai_inferred' : 'unverified';
    provenanceSourceUrls.description = descriptionEvidence.sourceUrls;
    provenance.productUrl = officialProductUrl ? 'verified_source' : 'unverified';
    provenanceSourceUrls.productUrl = officialProductUrl ? [officialProductUrl] : [];
    return {
        manufacturer: result.manufacturer,
        productName: result.productName,
        familyName: result.familyName,
        modelNumber: result.modelNumber,
        manufacturerPartNumber: result.manufacturerPartNumber,
        productUrl: officialProductUrl,
        primaryItemType: result.primaryItemType,
        subtype: result.subtype,
        categoryTemplateId: template?.id || current.categoryTemplateId,
        system: result.system,
        suggestedAreas: uniqueStrings(result.placements.flatMap((placement) => [placement.areaKey, ...placement.path.slice(-1)])),
        parentPlacements: uniqueStrings(result.placements.map((placement) => placement.parentSubtype)),
        tags: result.tags,
        description: result.detailedDescription || result.shortDescription,
        specifications: Object.fromEntries(result.fields.map((field) => [field.key, field.value])),
        sources,
        candidateImages: result.candidateImages.map((candidate, index) => ({
            id: `research-image-${index}-${shortHash(candidate.imageUrl)}`,
            url: candidate.imageUrl,
            label: candidate.title || candidate.altText || 'Candidate product image',
            sourceUrl: candidate.sourceUrl,
            selected: false,
            primary: false,
        })),
        provenance: {
            ...provenance,
            primaryItemType: result.primaryItemType ? 'ai_inferred' : 'unverified',
            subtype: result.subtype ? 'ai_inferred' : 'unverified',
            system: result.system ? 'ai_inferred' : 'unverified',
        },
        provenanceSourceUrls,
        warnings: result.warnings,
        criticalWarnings: [
            !result.modelNumber ? 'A verified or administrator-entered model number is required before approval.' : '',
            !result.manufacturer ? 'Manufacturer is required before approval.' : '',
            !result.subtype ? 'Subtype is required before approval.' : '',
        ].filter(Boolean),
    };
}

async function uiDraftToPayload(draft: UiDraft, storedUploads: Map<string, StoredCandidate>): Promise<CatalogAiDraftPayload> {
    const curatedSources = curateCatalogAiSources([...(draft.productUrl.trim() ? [{
        title: 'Official product page',
        url: draft.productUrl.trim(),
        source_type: 'manufacturer_product',
    } as const] : []), ...draft.sources.map((source) => ({
        title: source.title,
        url: source.url,
        source_type: ({
            product_page: 'manufacturer_product',
            installation_manual: 'installation_manual',
            owner_manual: 'owner_manual',
            specification_sheet: 'specification_sheet',
            warranty: 'warranty_document',
            other: '',
        } as const)[source.kind],
    }))]);
    const curatedSourceUrls = new Map(curatedSources.map((source) => [canonicalUrl(source.url), source.url]));
    const fieldProvenance = Object.fromEntries(Object.entries(draft.provenance).map(([key, kind]) => [
        uiKeyToDbKey(key),
        toPayloadProvenance(kind, provenanceUrlsForDraft(draft, key), curatedSourceUrls),
    ]));
    const uploaded = await Promise.all(draft.candidateImages.map(async (candidate) => {
        if (!candidate.uploaded) return null;
        const existing = storedUploads.get(candidate.id);
        if (existing) return existing;
        const stored = await persistUploadedCandidate(candidate);
        if (stored.copiedBucket && stored.copiedStoragePath) storedUploads.set(candidate.id, stored);
        return stored;
    }));
    const uploadedById = new Map(uploaded.filter(isPresent).map((item) => [item.id, item]));
    const candidateImages = draft.candidateImages.map((candidate) => {
        const stored = uploadedById.get(candidate.id);
        return {
            imageUrl: stored?.imageUrl || candidate.url,
            sourceUrl: stored?.imageUrl || candidate.sourceUrl || candidate.url,
            title: candidate.label,
            altText: candidate.label,
            confidence: candidate.uploaded ? 1 : null,
            selected: candidate.selected === true,
            primary: candidate.primary === true && candidate.selected === true,
            ...(stored || {}),
        };
    });
    const missingFields = [
        !draft.categoryTemplateId ? 'category_template_id' : '',
        !draft.manufacturer.trim() ? 'manufacturer' : '',
        !draft.productName.trim() && !draft.familyName.trim() ? 'product_name' : '',
        !draft.modelNumber.trim() ? 'model_number' : '',
        !draft.primaryItemType.trim() ? 'primary_item_type' : '',
        !draft.subtype.trim() ? 'subtype' : '',
    ].filter(Boolean);
    return {
        categoryTemplateId: draft.categoryTemplateId,
        manufacturer: draft.manufacturer.trim(),
        brand: draft.manufacturer.trim(),
        familyName: draft.familyName.trim() || draft.productName.trim(),
        productName: draft.productName.trim(),
        modelNumber: draft.modelNumber.trim(),
        manufacturerPartNumber: draft.manufacturerPartNumber.trim(),
        upcGtin: '',
        description: draft.description.trim(),
        specifications: { product_name: draft.productName.trim(), ...draft.specifications },
        primaryItemType: asPrimaryItemType(draft.primaryItemType),
        subtype: draft.subtype.trim(),
        tags: uniqueStrings(draft.tags),
        fieldProvenance,
        placements: [
            ...draft.suggestedAreas.map((area) => ({ systemKey: draft.system.trim(), areaKey: area, parentSubtype: '', path: [area], reason: 'Administrator-reviewed valid area.' })),
            ...draft.parentPlacements.map((parent) => ({ systemKey: draft.system.trim(), areaKey: '', parentSubtype: parent, path: [parent], reason: 'Administrator-reviewed valid parent.' })),
        ],
        sources: curatedSources,
        candidateImages,
        confidence: 0.75,
        // Missing fields and model provenance are recomputed by the secured approval
        // function. Advisory research warnings must not become permanently blocking.
        validationWarnings: [],
        missingFields,
        researchMetadata: {
            prompt: draft.prompt.trim(),
            admin_notes: draft.notes.trim(),
            system: draft.system.trim(),
            advisory_warnings: draft.warnings,
            normal_catalog_views_run_research: false,
        },
    };
}

type StoredCandidate = {
    id: string;
    imageUrl: string;
    copiedBucket: string;
    copiedStoragePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number | null;
};

function storedDraftToUiDraft(saved: CatalogAiLoadedDraft, displayUrls: Map<string, string>): UiDraft {
    const payload = saved.payload;
    const productUrl = payload.sources.find((source) => source.sourceType === 'manufacturer_product')?.url || '';
    const provenance = Object.fromEntries(Object.entries(payload.fieldProvenance).map(([key, value]) => [
        dbKeyToUiKey(key),
        value.kind === 'verified' ? 'verified_source' : value.kind,
    ])) as UiDraft['provenance'];
    const provenanceSourceUrls = Object.fromEntries(Object.entries(payload.fieldProvenance).map(([key, value]) => [
        dbKeyToUiKey(key),
        uniqueStrings(value.sourceUrls),
    ]));
    const metadata = payload.researchMetadata;
    const prompt = readMetadataText(metadata.prompt);
    const notes = readMetadataText(metadata.admin_notes);
    const warnings = readMetadataStrings(metadata.advisory_warnings);
    const specifications = { ...payload.specifications };
    delete specifications.product_name;
    const candidateImages = saved.candidateImages.map((candidate) => ({
        id: candidate.id,
        url: displayUrls.get(candidate.id) || candidate.imageUrl,
        label: candidate.title || candidate.altText || candidate.fileName || 'Candidate product image',
        sourceUrl: candidate.sourceUrl,
        selected: candidate.selected,
        primary: candidate.primary,
        uploaded: Boolean(candidate.copiedBucket && candidate.copiedStoragePath),
    }));
    return {
        prompt,
        manufacturer: payload.manufacturer,
        productName: payload.productName,
        familyName: payload.familyName,
        modelNumber: payload.modelNumber,
        manufacturerPartNumber: payload.manufacturerPartNumber,
        productUrl,
        notes,
        primaryItemType: payload.primaryItemType,
        subtype: payload.subtype,
        categoryTemplateId: saved.categoryTemplateId || payload.categoryTemplateId,
        system: readMetadataText(metadata.system) || payload.placements.find((placement) => placement.systemKey)?.systemKey || '',
        suggestedAreas: uniqueStrings(payload.placements.map((placement) => placement.areaKey)),
        parentPlacements: uniqueStrings(payload.placements.map((placement) => placement.parentSubtype)),
        tags: payload.tags,
        description: payload.description,
        specifications,
        sources: payload.sources.map((source, index) => ({
            id: `saved-source-${index}-${shortHash(source.url)}`,
            kind: ({
                manufacturer_product: 'product_page',
                installation_manual: 'installation_manual',
                owner_manual: 'owner_manual',
                specification_sheet: 'specification_sheet',
                warranty_document: 'warranty',
            } as const)[source.sourceType],
            title: source.title,
            url: source.url,
        })),
        candidateImages,
        provenance,
        provenanceSourceUrls,
        warnings,
        criticalWarnings: [
            ...payload.validationWarnings,
            !saved.categoryTemplateId && !payload.categoryTemplateId ? 'Catalog category is required before approval.' : '',
            !payload.modelNumber ? 'A verified or administrator-entered model number is required before approval.' : '',
            !payload.manufacturer ? 'Manufacturer is required before approval.' : '',
            !payload.productName && !payload.familyName ? 'Product or family name is required before approval.' : '',
            !payload.primaryItemType ? 'Primary item type is required before approval.' : '',
            !payload.subtype ? 'Subtype is required before approval.' : '',
        ].filter(Boolean),
    };
}

async function loadDraftCandidateDisplayUrls(saved: CatalogAiLoadedDraft) {
    const entries = await Promise.all(saved.candidateImages.map(async (candidate) => {
        if (!candidate.copiedBucket || !candidate.copiedStoragePath) return null;
        const { data, error } = await supabase.storage
            .from(candidate.copiedBucket)
            .createSignedUrl(candidate.copiedStoragePath, 60 * 60);
        if (error || !data?.signedUrl) return null;
        return [candidate.id, data.signedUrl] as const;
    }));
    return new Map(entries.filter(isPresent));
}

async function persistUploadedCandidate(candidate: UiCandidateImage): Promise<StoredCandidate> {
    // Draft uploads require a saved draft path. They are uploaded during the second
    // save in the adapter, after the staging row exists.
    const upload = pendingUploadContext;
    if (!upload.draftId) return {
        id: candidate.id, imageUrl: candidate.url, copiedBucket: '', copiedStoragePath: '',
        fileName: candidate.label, mimeType: 'image/jpeg', sizeBytes: null,
    };
    if (candidate.url.startsWith('storage://')) return {
        id: candidate.id, imageUrl: candidate.url, copiedBucket: 'catalog-factory-media',
        copiedStoragePath: candidate.url.replace('storage://catalog-factory-media/', ''),
        fileName: candidate.label, mimeType: 'image/jpeg', sizeBytes: null,
    };
    const assetId = /^[0-9a-f-]{36}$/i.test(candidate.id) ? candidate.id : createId();
    const fileName = sanitizeFileName(candidate.label || `catalog-image-${Date.now()}.jpg`);
    const storagePath = `ai-drafts/${upload.draftId}/${assetId}/${fileName}`;
    const response = await fetch(candidate.url);
    if (!response.ok) throw new Error(`Could not read the selected catalog image (${response.status}).`);
    const blob = await response.blob();
    const mimeType = blob.type || 'image/jpeg';
    if (!mimeType.startsWith('image/')) throw new Error('Choose an image for the catalog card.');
    const { error } = await supabase.storage.from('catalog-factory-media').upload(storagePath, blob, { contentType: mimeType, upsert: false });
    if (error) throw error;
    return {
        id: candidate.id,
        imageUrl: `storage://catalog-factory-media/${storagePath}`,
        copiedBucket: 'catalog-factory-media',
        copiedStoragePath: storagePath,
        fileName,
        mimeType,
        sizeBytes: blob.size,
    };
}

// The adapter updates this only around a save that follows initial draft creation.
const pendingUploadContext = { draftId: '' };

function asPrimaryItemType(value: string): CatalogPrimaryItemType | '' {
    return CATALOG_PRIMARY_ITEM_TYPES.includes(value as CatalogPrimaryItemType) ? value as CatalogPrimaryItemType : '';
}

function uiKeyToDbKey(value: string) {
    const direct = ({ modelNumber: 'model_number', productName: 'product_name', familyName: 'family_name',
        manufacturerPartNumber: 'manufacturer_part_number', productUrl: 'product_url', primaryItemType: 'primary_item_type' } as Record<string, string>)[value];
    return direct || value.replace(/^specifications\./, '');
}

function researchEvidenceFor(result: CatalogAiResearchResult, ...fieldKeys: string[]) {
    const requested = new Set(fieldKeys.map(normalizeFieldKey));
    const matches = result.fields.filter((field) => requested.has(normalizeFieldKey(field.key)));
    const sourceUrls = uniqueStrings(matches.flatMap((field) => field.provenance.sourceUrls));
    const kind = matches.some((field) => field.provenance.kind === 'verified' && field.provenance.sourceUrls.length)
        ? 'verified'
        : matches.some((field) => field.provenance.kind === 'ai_inferred') ? 'ai_inferred' : 'unverified';
    return { kind, sourceUrls, hasMatch: matches.length > 0 } as const;
}

function provenanceUrlsForDraft(draft: UiDraft, uiKey: string) {
    const dbKey = uiKeyToDbKey(uiKey);
    const canonicalUiKey = dbKeyToUiKey(dbKey);
    return uniqueStrings([
        ...(draft.provenanceSourceUrls[uiKey] || []),
        ...(draft.provenanceSourceUrls[dbKey] || []),
        ...(draft.provenanceSourceUrls[canonicalUiKey] || []),
    ]);
}

function toPayloadProvenance(
    kind: UiDraft['provenance'][string],
    exactSourceUrls: string[],
    curatedSourceUrls: Map<string, string>,
): CatalogFieldProvenance {
    const sourceUrls = uniqueStrings(exactSourceUrls)
        .map((url) => curatedSourceUrls.get(canonicalUrl(url)) || '')
        .filter(Boolean);
    if (kind === 'verified_source') return sourceUrls.length
        ? { kind: 'verified', sourceUrls, note: '' }
        : { kind: 'unverified', sourceUrls: [], note: 'The supporting source is no longer in the reviewed source set.' };
    return { kind, sourceUrls: [], note: '' };
}

function normalizeFieldKey(value: string) {
    return value.trim().replace(/^specifications\./, '').replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`).replace(/^_/, '').toLowerCase();
}

function dbKeyToUiKey(value: string) {
    const direct = ({ model_number: 'modelNumber', product_name: 'productName', family_name: 'familyName',
        manufacturer_part_number: 'manufacturerPartNumber', primary_item_type: 'primaryItemType',
        product_url: 'productUrl' } as Record<string, string>)[value];
    if (direct) return direct;
    if (['manufacturer', 'subtype', 'system', 'suggestedAreas', 'parentPlacements', 'tags'].includes(value)) return value;
    return `specifications.${value}`;
}

function readMetadataText(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function readMetadataStrings(value: unknown) {
    return Array.isArray(value) ? value.map(readMetadataText).filter(Boolean) : [];
}

function readId(value: unknown, key: string) {
    const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    return typeof row[key] === 'string' ? row[key] as string : '';
}

function same(a: string, b: string) {
    const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return Boolean(normalize(a)) && normalize(a) === normalize(b);
}

function uniqueStrings(values: string[]) {
    return [...new Map(values.map((value) => value.trim()).filter(Boolean).map((value) => [value.toLowerCase(), value])).values()];
}

function canonicalUrl(value: string) {
    try {
        const url = new URL(value.trim());
        url.hash = '';
        url.hostname = url.hostname.toLowerCase();
        url.pathname = url.pathname.replace(/\/+$/, '') || '/';
        return url.toString().toLowerCase();
    } catch {
        return value.trim().toLowerCase();
    }
}

function shortHash(value: string) {
    let result = 0;
    for (const char of value) result = ((result << 5) - result + char.charCodeAt(0)) | 0;
    return Math.abs(result).toString(36);
}

function createId() {
    return globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        const value = character === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}

function compactCurrentDraftContext(draft: UiDraft) {
    return JSON.stringify({
        description: draft.description.trim() || undefined,
        specifications: draft.specifications,
        tags: draft.tags,
        valid_areas: draft.suggestedAreas,
        valid_parents: draft.parentPlacements,
    }).slice(0, 3_800);
}

function sanitizeFileName(value: string) {
    return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 140) || `catalog-image-${Date.now()}.jpg`;
}

function isPresent<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}
