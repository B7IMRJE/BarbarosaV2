import type * as DocumentPicker from 'expo-document-picker';
import type * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import type {
    CatalogDuplicateMatch,
    CatalogImportRow,
    CatalogStatus,
    CatalogTemplateDefinition,
    CatalogTemplateField,
} from './catalogFactoryCore';

export type CatalogSource = {
    id: string;
    sourceType: string;
    sourceUrl: string;
    title: string;
    verifiedAt: string | null;
    confidence: number | null;
};

export type CatalogSourceDraft = {
    id?: string;
    sourceType: string;
    sourceUrl: string;
    title: string;
};

export type CatalogFactoryAssetType = 'image' | 'installation_manual' | 'specification_sheet' | 'warranty_document' | 'other';

export type CatalogFactoryAsset = {
    id: string;
    productVariantId: string;
    assetType: CatalogFactoryAssetType;
    sourceUrl: string;
    bucket: string;
    storagePath: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    isPrimary: boolean;
    homeownerVisible: boolean;
    active: boolean;
    displayUrl: string;
};

export const CATALOG_FACTORY_MEDIA_BUCKET = 'catalog-factory-media';

export type CatalogRetailObservation = {
    id: string;
    regularPrice: number | null;
    salePrice: number | null;
    availability: string;
    zipCode: string;
    market: string;
    observedAt: string;
};

export type CatalogRetailListing = {
    id: string;
    retailer: string;
    retailerSku: string;
    productUrl: string;
    observations: CatalogRetailObservation[];
};

export type CatalogFactoryRecord = {
    id: string;
    familyId: string;
    templateId: string;
    category: string;
    manufacturer: string;
    brand: string;
    familyName: string;
    modelNumber: string;
    manufacturerPartNumber: string;
    upcGtin: string;
    color: string;
    finish: string;
    size: string;
    capacity: string;
    description: string;
    specifications: Record<string, unknown>;
    status: CatalogStatus;
    confidence: number | null;
    validationWarnings: string[];
    duplicateWarnings: string[];
    missingFields: string[];
    lastVerifiedAt: string | null;
    updatedAt: string | null;
    primaryImageUrl: string;
    assets: CatalogFactoryAsset[];
    sources: CatalogSource[];
    retailListings: CatalogRetailListing[];
};

export type CatalogImportSummary = {
    batchId: string;
    total: number;
    created: number;
    duplicate: number;
    warning: number;
    failed: number;
};

export type ApprovedMasterCatalogItem = {
    id: string;
    category: string;
    manufacturer: string;
    brand: string;
    familyName: string;
    modelNumber: string;
    manufacturerPartNumber: string;
    upcGtin: string;
    description: string;
    specifications: Record<string, unknown>;
    primaryImageUrl: string;
    primaryImageBucket: string;
    primaryImagePath: string;
    entitled: boolean;
    offering: CompanyCatalogOffering | null;
};

export type ApprovedMasterCatalogReference = {
    id: string;
    kind: string;
    title: string;
    url: string;
};

export type ApprovedMasterCatalogDetail = {
    references: ApprovedMasterCatalogReference[];
};

export type CompanyCatalogOffering = {
    id?: string;
    companyId?: string;
    productVariantId?: string;
    companyCatalogProductId?: string;
    materialCost: number | null;
    markup: number | null;
    laborAmount: number | null;
    installedPrice: number | null;
    preferredSupplier: string;
    companyWarranty: string;
    active: boolean;
};

export type CatalogFactoryFilters = {
    category?: string;
    manufacturer?: string;
    brand?: string;
    status?: CatalogStatus | '';
    retailer?: string;
    missing?: boolean;
    duplicates?: boolean;
    lastVerifiedBefore?: string;
};

export async function loadCatalogFactory(filters: CatalogFactoryFilters = {}) {
    const { data, error } = await supabase.rpc('get_catalog_factory_records', {
        p_filters: {
            category: filters.category || null,
            manufacturer: filters.manufacturer || null,
            brand: filters.brand || null,
            status: filters.status || null,
            retailer: filters.retailer || null,
            missing: Boolean(filters.missing),
            duplicates: Boolean(filters.duplicates),
            last_verified_before: filters.lastVerifiedBefore || null,
        },
    });
    if (error) throw error;
    const payload = record(data);
    const parsedRecords = array(payload.records).map(parseFactoryRecord).filter(Boolean) as CatalogFactoryRecord[];
    const records = await Promise.all(parsedRecords.map(resolveFactoryRecordMedia));
    return {
        templates: array(payload.templates).map(parseTemplate).filter(Boolean) as CatalogTemplateDefinition[],
        records,
        imports: array(payload.imports).map(record),
    };
}

export async function saveCatalogTemplate(templateId: string | null, payload: {
    templateKey: string;
    categoryName: string;
    description: string;
    universalFields: CatalogTemplateField[];
    specificationFields: CatalogTemplateField[];
    requiredFields: string[];
    status: CatalogStatus;
}) {
    const { data, error } = await supabase.rpc('save_catalog_template', {
        p_template_id: templateId,
        p_payload: snakePayload(payload),
    });
    if (error) throw error;
    return parseTemplate(data);
}

export async function importCatalogDrafts(input: {
    rows: CatalogImportRow[];
    fileName: string;
    format: 'json' | 'csv';
    originalData: string;
}) {
    const { data, error } = await supabase.rpc('create_catalog_drafts', {
        p_import_rows: input.rows,
        p_file_name: input.fileName || null,
        p_format: input.format,
        p_original_data: input.originalData,
    });
    if (error) throw error;
    const value = record(data);
    return {
        batchId: text(value.batch_id),
        total: numberValue(value.total) || 0,
        created: numberValue(value.created) || 0,
        duplicate: numberValue(value.duplicate) || 0,
        warning: numberValue(value.warning) || 0,
        failed: numberValue(value.failed) || 0,
    } satisfies CatalogImportSummary;
}

export async function searchCatalogDuplicates(row: CatalogImportRow) {
    const { data, error } = await supabase.rpc('search_existing_products', {
        p_query: {
            upc_gtin: row.upc_gtin || null,
            manufacturer: row.manufacturer || null,
            manufacturer_part_number: row.manufacturer_part_number || null,
        },
    });
    if (error) throw error;
    return array(data).map((value): CatalogDuplicateMatch | null => {
        const item = record(value);
        const id = text(item.id);
        if (!id) return null;
        return {
            id,
            matchReason: text(item.match_reason),
            label: [text(item.manufacturer), text(item.brand), text(item.family_name), text(item.model_number)].filter(Boolean).join(' '),
            status: status(item.status),
        };
    }).filter(Boolean) as CatalogDuplicateMatch[];
}

export async function reviewCatalogDraft(
    variantId: string,
    action: 'approve' | 'reject' | 'archive' | 'needs_review' | 'edit' | 'merge',
    payload: Record<string, unknown> = {},
    mergeTargetId: string | null = null
) {
    const { data, error } = await supabase.rpc('review_catalog_draft', {
        p_variant_id: variantId,
        p_action: action,
        p_payload: payload,
        p_merge_target_id: mergeTargetId,
    });
    if (error) throw error;
    return data;
}

export async function saveCatalogFactoryProduct(variantId: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase.rpc('save_catalog_factory_product', {
        p_variant_id: variantId,
        p_payload: payload,
    });
    if (error) throw error;
    return data;
}

export async function uploadCatalogFactoryPhoto(input: {
    variantId: string;
    asset: ImagePicker.ImagePickerAsset;
}) {
    const mimeType = input.asset.mimeType || 'image/jpeg';
    if (!mimeType.startsWith('image/')) throw new Error('Choose an image for the master product card.');
    return uploadCatalogFactoryMedia({
        variantId: input.variantId,
        assetType: 'image',
        uri: input.asset.uri,
        fileName: input.asset.fileName || `master-product-${Date.now()}.jpg`,
        mimeType,
        sizeBytes: input.asset.fileSize || null,
        isPrimary: true,
        homeownerVisible: true,
    });
}

export async function uploadCatalogFactoryDocument(input: {
    variantId: string;
    assetType: Exclude<CatalogFactoryAssetType, 'image'>;
    asset: DocumentPicker.DocumentPickerAsset;
}) {
    const mimeType = input.asset.mimeType || 'application/pdf';
    if (mimeType !== 'application/pdf' && !mimeType.startsWith('image/')) {
        throw new Error('Master product documents must be a PDF or image.');
    }
    return uploadCatalogFactoryMedia({
        variantId: input.variantId,
        assetType: input.assetType,
        uri: input.asset.uri,
        fileName: input.asset.name || `master-reference-${Date.now()}.pdf`,
        mimeType,
        sizeBytes: input.asset.size || null,
        isPrimary: false,
        homeownerVisible: true,
    });
}

export async function updateCatalogFactoryMedia(input: {
    variantId: string;
    assetId: string;
    isPrimary?: boolean;
    homeownerVisible?: boolean;
    active?: boolean;
}) {
    const { data, error } = await supabase.rpc('update_catalog_factory_media', {
        p_variant_id: input.variantId,
        p_asset_id: input.assetId,
        p_is_primary: input.isPrimary ?? null,
        p_homeowner_visible: input.homeownerVisible ?? null,
        p_active: input.active ?? null,
    });
    if (error) throw error;
    const parsed = parseFactoryAsset(data);
    if (!parsed) throw new Error('Master media settings were saved, but the response was invalid.');
    return resolveFactoryAssetUrl(parsed);
}

export async function bulkApproveCatalogDrafts(variantIds: string[]) {
    const { data, error } = await supabase.rpc('bulk_approve_catalog_drafts', { p_variant_ids: variantIds });
    if (error) throw error;
    return data;
}

export async function loadApprovedMasterCatalogForCompany(companyId: string) {
    const { data, error } = await supabase.rpc('get_approved_master_catalog_for_company', { p_company_id: companyId });
    if (error) throw error;
    const items = array(data).map(parseApprovedMaster).filter(Boolean) as ApprovedMasterCatalogItem[];
    return Promise.all(items.map(resolveApprovedMasterMedia));
}

export async function loadApprovedMasterCatalogDetail(variantId: string): Promise<ApprovedMasterCatalogDetail> {
    const [sourcesResult, assetsResult] = await Promise.all([
        supabase
            .from('catalog_sources')
            .select('id, source_type, source_url, title')
            .eq('product_variant_id', variantId)
            .order('created_at', { ascending: true }),
        supabase
            .from('catalog_source_assets')
            .select('id, asset_type, source_url, copied_bucket, copied_storage_path, file_name, active')
            .eq('product_variant_id', variantId)
            .eq('active', true)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: true }),
    ]);

    if (sourcesResult.error) throw sourcesResult.error;
    if (assetsResult.error) throw assetsResult.error;

    const references = [
        ...array(sourcesResult.data).map((value) => {
            const row = record(value);
            const id = text(row.id);
            const url = text(row.source_url);
            if (!id || !url) return null;
            const kind = text(row.source_type) || 'other';
            return {
                id: `source-${id}`,
                kind,
                title: text(row.title) || catalogReferenceLabel(kind),
                url,
            } satisfies ApprovedMasterCatalogReference;
        }),
        ...(await Promise.all(array(assetsResult.data).map(async (value) => {
            const row = record(value);
            const id = text(row.id);
            const url = await catalogMediaUrl(text(row.copied_bucket), text(row.copied_storage_path), text(row.source_url));
            if (!id || !url) return null;
            const kind = text(row.asset_type) || 'other';
            return {
                id: `asset-${id}`,
                kind,
                title: catalogReferenceLabel(kind),
                url,
            } satisfies ApprovedMasterCatalogReference;
        }))),
    ].filter(Boolean) as ApprovedMasterCatalogReference[];

    return {
        references: references.filter((reference, index) => (
            references.findIndex((candidate) => candidate.url === reference.url) === index
        )),
    };
}

export async function saveCompanyCatalogOffering(companyId: string, variantId: string, offering: CompanyCatalogOffering) {
    const { data, error } = await supabase.rpc('save_company_catalog_offering', {
        p_company_id: companyId,
        p_variant_id: variantId,
        p_payload: {
            material_cost: offering.materialCost,
            markup: offering.markup,
            labor_amount: offering.laborAmount,
            installed_price: offering.installedPrice,
            preferred_supplier: offering.preferredSupplier || null,
            company_warranty: offering.companyWarranty || null,
            active: offering.active,
        },
    });
    if (error) throw error;
    return parseOffering(data);
}

async function uploadCatalogFactoryMedia(input: {
    variantId: string;
    assetType: CatalogFactoryAssetType;
    uri: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number | null;
    isPrimary: boolean;
    homeownerVisible: boolean;
}) {
    const assetId = createId();
    const fileName = sanitizeFileName(input.fileName);
    const storagePath = ['variants', input.variantId, assetId, fileName].join('/');
    const response = await fetch(input.uri);
    if (!response.ok) throw new Error(`Could not read the selected file (${response.status}).`);
    const body = await response.blob();
    const { error: uploadError } = await supabase.storage.from(CATALOG_FACTORY_MEDIA_BUCKET).upload(storagePath, body, {
        contentType: input.mimeType,
        upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.rpc('record_catalog_factory_media', {
        p_variant_id: input.variantId,
        p_asset_id: assetId,
        p_asset_type: input.assetType,
        p_storage_path: storagePath,
        p_file_name: fileName,
        p_mime_type: input.mimeType,
        p_size_bytes: input.sizeBytes,
        p_homeowner_visible: input.homeownerVisible,
        p_is_primary: input.isPrimary,
    });
    if (error) {
        await supabase.storage.from(CATALOG_FACTORY_MEDIA_BUCKET).remove([storagePath]);
        throw error;
    }
    const parsed = parseFactoryAsset(data);
    if (!parsed) throw new Error('Master media uploaded, but its response was invalid.');
    return resolveFactoryAssetUrl(parsed);
}

function parseTemplate(value: unknown): CatalogTemplateDefinition | null {
    const row = record(value);
    const id = text(row.id);
    const templateKey = text(row.template_key);
    const categoryName = text(row.category_name);
    if (!id || !templateKey || !categoryName) return null;
    return {
        id,
        templateKey,
        categoryName,
        description: text(row.description),
        universalFields: array(row.universal_fields).map(parseField).filter(Boolean) as CatalogTemplateField[],
        specificationFields: array(row.specification_fields).map(parseField).filter(Boolean) as CatalogTemplateField[],
        requiredFields: array(row.required_fields).map(text).filter(Boolean),
        status: status(row.status),
    };
}

function parseFactoryRecord(value: unknown): CatalogFactoryRecord | null {
    const row = record(value);
    const id = text(row.id);
    if (!id) return null;
    return {
        id,
        familyId: text(row.family_id),
        templateId: text(row.template_id),
        category: text(row.category),
        manufacturer: text(row.manufacturer),
        brand: text(row.brand),
        familyName: text(row.family_name),
        modelNumber: text(row.model_number),
        manufacturerPartNumber: text(row.manufacturer_part_number),
        upcGtin: text(row.upc_gtin),
        color: text(row.color),
        finish: text(row.finish),
        size: text(row.size),
        capacity: text(row.capacity),
        description: text(row.description),
        specifications: record(row.specifications),
        status: status(row.status),
        confidence: numberValue(row.confidence),
        validationWarnings: array(row.validation_warnings).map(text).filter(Boolean),
        duplicateWarnings: array(row.duplicate_warnings).map(text).filter(Boolean),
        missingFields: array(row.missing_fields).map(text).filter(Boolean),
        lastVerifiedAt: nullableText(row.last_verified_at),
        updatedAt: nullableText(row.updated_at),
        primaryImageUrl: text(row.primary_image_url),
        assets: array(row.assets).map(parseFactoryAsset).filter(Boolean) as CatalogFactoryAsset[],
        sources: array(row.sources).map((source) => {
            const item = record(source);
            return {
                id: text(item.id), sourceType: text(item.source_type), sourceUrl: text(item.source_url),
                title: text(item.title), verifiedAt: nullableText(item.verified_at), confidence: numberValue(item.confidence),
            };
        }),
        retailListings: array(row.retail_listings).map((listing) => {
            const item = record(listing);
            return {
                id: text(item.id), retailer: text(item.retailer), retailerSku: text(item.retailer_sku), productUrl: text(item.product_url),
                observations: array(item.observations).map((observation) => {
                    const price = record(observation);
                    return {
                        id: text(price.id), regularPrice: numberValue(price.regular_price), salePrice: numberValue(price.sale_price),
                        availability: text(price.availability), zipCode: text(price.zip_code), market: text(price.market), observedAt: text(price.observed_at),
                    };
                }),
            };
        }),
    };
}

function parseApprovedMaster(value: unknown): ApprovedMasterCatalogItem | null {
    const row = record(value);
    const id = text(row.id);
    if (!id) return null;
    return {
        id, category: text(row.category), manufacturer: text(row.manufacturer), brand: text(row.brand), familyName: text(row.family_name),
        modelNumber: text(row.model_number), manufacturerPartNumber: text(row.manufacturer_part_number), upcGtin: text(row.upc_gtin),
        description: text(row.description), specifications: record(row.specifications), primaryImageUrl: text(row.primary_image_url),
        primaryImageBucket: text(row.primary_image_bucket), primaryImagePath: text(row.primary_image_path),
        entitled: row.entitled === true,
        offering: row.offering ? parseOffering(row.offering) : null,
    };
}

function parseFactoryAsset(value: unknown): CatalogFactoryAsset | null {
    const row = record(value);
    const id = text(row.id);
    const productVariantId = text(row.product_variant_id);
    if (!id || !productVariantId) return null;
    const assetType = text(row.asset_type);
    return {
        id,
        productVariantId,
        assetType: ['image', 'installation_manual', 'specification_sheet', 'warranty_document'].includes(assetType)
            ? assetType as CatalogFactoryAssetType
            : 'other',
        sourceUrl: text(row.source_url),
        bucket: text(row.copied_bucket),
        storagePath: text(row.copied_storage_path),
        fileName: text(row.file_name) || catalogReferenceLabel(assetType),
        mimeType: nullableText(row.mime_type),
        sizeBytes: numberValue(row.size_bytes),
        isPrimary: row.is_primary === true,
        homeownerVisible: row.homeowner_visible !== false,
        active: row.active !== false,
        displayUrl: '',
    };
}

async function resolveFactoryRecordMedia(recordValue: CatalogFactoryRecord) {
    const assets = await Promise.all(recordValue.assets.map(resolveFactoryAssetUrl));
    const primary = assets.find((asset) => asset.active && asset.assetType === 'image' && asset.isPrimary)
        || assets.find((asset) => asset.active && asset.assetType === 'image');
    return {
        ...recordValue,
        assets,
        primaryImageUrl: primary?.displayUrl || externalCatalogUrl(recordValue.primaryImageUrl),
    };
}

async function resolveFactoryAssetUrl(asset: CatalogFactoryAsset) {
    return {
        ...asset,
        displayUrl: await catalogMediaUrl(asset.bucket, asset.storagePath, asset.sourceUrl),
    };
}

async function resolveApprovedMasterMedia(item: ApprovedMasterCatalogItem) {
    return {
        ...item,
        primaryImageUrl: await catalogMediaUrl(item.primaryImageBucket, item.primaryImagePath, item.primaryImageUrl),
    };
}

async function catalogMediaUrl(bucket: string, storagePath: string, fallbackUrl: string) {
    if (bucket && storagePath) {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 30);
        if (!error && data?.signedUrl) return data.signedUrl;
    }
    return externalCatalogUrl(fallbackUrl);
}

function externalCatalogUrl(value: string) {
    return /^https?:\/\//i.test(value) ? value : '';
}

function parseOffering(value: unknown): CompanyCatalogOffering {
    const row = record(value);
    return {
        id: text(row.id) || undefined,
        companyId: text(row.company_id) || undefined,
        productVariantId: text(row.product_variant_id) || undefined,
        companyCatalogProductId: text(row.company_catalog_product_id) || undefined,
        materialCost: numberValue(row.material_cost),
        markup: numberValue(row.markup),
        laborAmount: numberValue(row.labor_amount),
        installedPrice: numberValue(row.installed_price),
        preferredSupplier: text(row.preferred_supplier),
        companyWarranty: text(row.company_warranty),
        active: row.active !== false,
    };
}

function catalogReferenceLabel(kind: string) {
    return ({
        manufacturer_page: 'Manufacturer product page',
        retailer_page: 'Retailer product page',
        installation_manual: 'Installation manual',
        specification_sheet: 'Specification sheet',
        warranty_document: 'Warranty document',
        image: 'Product image',
        other: 'Product reference',
    } as Record<string, string>)[kind] || 'Product reference';
}

function createId() {
    const cryptoValue = globalThis.crypto as { randomUUID?: () => string } | undefined;
    return cryptoValue?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        const value = character === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}

function sanitizeFileName(value: string) {
    const cleaned = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 140);
    return cleaned || `master-reference-${Date.now()}`;
}

function parseField(value: unknown): CatalogTemplateField | null {
    const row = record(value);
    const key = text(row.key);
    if (!key) return null;
    return { key, label: text(row.label) || key.replaceAll('_', ' '), type: text(row.type) || undefined };
}

function snakePayload(value: Record<string, unknown>) {
    return Object.entries(value).reduce<Record<string, unknown>>((result, [key, entry]) => {
        result[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = entry;
        return result;
    }, {});
}

function status(value: unknown): CatalogStatus {
    const normalized = text(value);
    return normalized === 'needs_review' || normalized === 'approved' || normalized === 'rejected' || normalized === 'archived'
        ? normalized
        : 'draft';
}

function record(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function nullableText(value: unknown) {
    return text(value) || null;
}

function numberValue(value: unknown) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
