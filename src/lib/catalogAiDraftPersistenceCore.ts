import type {
    CatalogAiImageCandidate,
    CatalogAiPlacement,
    CatalogAiSource,
    CatalogFieldProvenance,
    CatalogPrimaryItemType,
} from './catalogAiBuilderCore';

export type CatalogAiDraftStatus = 'draft' | 'approved' | 'cancelled';

export type CatalogAiDraftSummary = {
    id: string;
    status: 'draft';
    categoryTemplateId: string;
    categoryName: string;
    manufacturer: string;
    productName: string;
    familyName: string;
    modelNumber: string;
    subtype: string;
    primaryImageUrl: string;
    createdByUserId: string;
    updatedByUserId: string;
    createdAt: string;
    updatedAt: string;
};

export type CatalogAiStoredCandidate = CatalogAiImageCandidate & {
    id: string;
    selectionStatus: 'pending' | 'selected' | 'rejected';
};

export type CatalogAiStoredPayload = {
    categoryTemplateId: string;
    manufacturer: string;
    brand: string;
    familyName: string;
    productName: string;
    modelNumber: string;
    manufacturerPartNumber: string;
    upcGtin: string;
    description: string;
    specifications: Record<string, string>;
    primaryItemType: CatalogPrimaryItemType | '';
    subtype: string;
    tags: string[];
    fieldProvenance: Record<string, CatalogFieldProvenance>;
    placements: CatalogAiPlacement[];
    sources: CatalogAiSource[];
    confidence: number;
    validationWarnings: string[];
    missingFields: string[];
    researchMetadata: Record<string, unknown>;
};

export type CatalogAiLoadedDraft = {
    id: string;
    status: CatalogAiDraftStatus;
    categoryTemplateId: string;
    catalogProductVariantId: string;
    createdAt: string;
    updatedAt: string;
    approvedAt: string;
    payload: CatalogAiStoredPayload;
    candidateImages: CatalogAiStoredCandidate[];
};

export function parseCatalogAiDraftSummaries(value: unknown): CatalogAiDraftSummary[] {
    return array(value).map((candidate) => {
        const row = record(candidate);
        const status = text(row.status);
        const id = text(row.id);
        if (!id || status !== 'draft') return null;
        return {
            id,
            status: 'draft' as const,
            categoryTemplateId: text(row.category_template_id),
            categoryName: text(row.category_name),
            manufacturer: text(row.manufacturer),
            productName: text(row.product_name),
            familyName: text(row.family_name),
            modelNumber: text(row.model_number),
            subtype: text(row.subtype),
            primaryImageUrl: text(row.primary_image_url),
            createdByUserId: text(row.created_by_user_id),
            updatedByUserId: text(row.updated_by_user_id),
            createdAt: text(row.created_at),
            updatedAt: text(row.updated_at),
        };
    }).filter(isPresent);
}

export function parseCatalogAiLoadedDraft(value: unknown): CatalogAiLoadedDraft {
    const row = record(value);
    const id = text(row.id);
    const status = draftStatus(row.status);
    if (!id || !status) throw new Error('The saved AI catalog draft is invalid.');
    const payload = readPayload(row.draft_payload);
    return {
        id,
        status,
        categoryTemplateId: text(row.category_template_id) || payload.categoryTemplateId,
        catalogProductVariantId: text(row.catalog_product_variant_id),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        approvedAt: text(row.approved_at),
        payload,
        candidateImages: array(row.candidate_images).map(readCandidate).filter(isPresent),
    };
}

function readPayload(value: unknown): CatalogAiStoredPayload {
    const payload = record(value);
    return {
        categoryTemplateId: text(payload.category_template_id),
        manufacturer: text(payload.manufacturer),
        brand: text(payload.brand),
        familyName: text(payload.family_name),
        productName: text(payload.product_name),
        modelNumber: text(payload.model_number),
        manufacturerPartNumber: text(payload.manufacturer_part_number),
        upcGtin: text(payload.upc_gtin),
        description: text(payload.description),
        specifications: stringRecord(payload.specifications),
        primaryItemType: primaryItemType(payload.primary_item_type),
        subtype: text(payload.subtype),
        tags: strings(payload.tags),
        fieldProvenance: provenanceRecord(payload.field_provenance),
        placements: array(payload.placements).map(readPlacement).filter(isPresent),
        sources: array(payload.sources).map(readSource).filter(isPresent),
        confidence: finiteNumber(payload.confidence),
        validationWarnings: strings(payload.validation_warnings),
        missingFields: strings(payload.missing_fields),
        researchMetadata: record(payload.research_metadata),
    };
}

function readCandidate(value: unknown): CatalogAiStoredCandidate | null {
    const row = record(value);
    const id = text(row.id);
    const imageUrl = text(row.image_url);
    const sourceUrl = text(row.source_url);
    const selectionStatus = candidateStatus(row.selection_status);
    if (!id || !imageUrl || !sourceUrl || !selectionStatus) return null;
    return {
        id,
        imageUrl,
        sourceUrl,
        title: text(row.title),
        altText: text(row.alt_text),
        confidence: nullableNumber(row.confidence),
        selected: selectionStatus === 'selected',
        primary: selectionStatus === 'selected' && row.is_primary === true,
        copiedBucket: text(row.copied_bucket) || undefined,
        copiedStoragePath: text(row.copied_storage_path) || undefined,
        fileName: text(row.file_name) || undefined,
        mimeType: text(row.mime_type) || undefined,
        sizeBytes: nullableInteger(row.size_bytes),
        selectionStatus,
    };
}

function readPlacement(value: unknown): CatalogAiPlacement | null {
    const row = record(value);
    const placement = {
        systemKey: text(row.system_key),
        areaKey: text(row.area_key),
        parentSubtype: text(row.parent_subtype),
        path: strings(row.path),
        reason: text(row.reason),
    };
    return placement.systemKey || placement.areaKey || placement.parentSubtype || placement.path.length ? placement : null;
}

function readSource(value: unknown): CatalogAiSource | null {
    const row = record(value);
    const sourceType = text(row.type || row.source_type);
    const url = text(row.url);
    if (!url || !['manufacturer_product', 'installation_manual', 'owner_manual', 'specification_sheet', 'warranty_document'].includes(sourceType)) return null;
    return { title: text(row.title) || url, url, sourceType: sourceType as CatalogAiSource['sourceType'] };
}

function provenanceRecord(value: unknown) {
    return Object.fromEntries(Object.entries(record(value)).map(([key, raw]) => {
        const row = record(raw);
        const sourceUrls = strings(row.source_urls || row.sourceUrls);
        const requestedKind = text(row.kind);
        const kind = requestedKind === 'admin_entered' || requestedKind === 'ai_inferred' || requestedKind === 'unverified'
            ? requestedKind
            : requestedKind === 'verified' && sourceUrls.length ? 'verified' : 'unverified';
        return [key, { kind, sourceUrls, note: text(row.note) } satisfies CatalogFieldProvenance];
    }));
}

function primaryItemType(value: unknown): CatalogPrimaryItemType | '' {
    const item = text(value);
    return ['Fixture', 'Equipment', 'Built-In / Assembly', 'Basin / Receptacle', 'Component'].includes(item)
        ? item as CatalogPrimaryItemType : '';
}

function draftStatus(value: unknown): CatalogAiDraftStatus | '' {
    const status = text(value);
    return status === 'draft' || status === 'approved' || status === 'cancelled' ? status : '';
}

function candidateStatus(value: unknown): CatalogAiStoredCandidate['selectionStatus'] | '' {
    const status = text(value);
    return status === 'pending' || status === 'selected' || status === 'rejected' ? status : '';
}

function stringRecord(value: unknown) {
    return Object.fromEntries(Object.entries(record(value)).map(([key, raw]) => [key, text(raw)]));
}

function strings(value: unknown) { return array(value).map(text).filter(Boolean); }
function finiteNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumber(value: unknown) { if (value === null || value === undefined || value === '') return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function nullableInteger(value: unknown) { const parsed = nullableNumber(value); return parsed === null ? null : Math.floor(parsed); }
function text(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function isPresent<T>(value: T | null | undefined): value is T { return value !== null && value !== undefined; }
