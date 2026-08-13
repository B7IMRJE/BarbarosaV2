import type * as DocumentPicker from 'expo-document-picker';
import type * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { validateCompanyCatalogDraft } from './companyProductCatalogCore';

export { validateCompanyCatalogDraft } from './companyProductCatalogCore';

export const COMPANY_PRODUCT_CATALOG_BUCKET = 'company-product-catalog';

export type CompanyCatalogStatus = 'draft' | 'approved' | 'archived';
export type CompanyCatalogTier = 'Essential' | 'Professional' | 'Premium';
export type CompanyCatalogFileKind = 'photo' | 'manual' | 'warranty' | 'specification' | 'document';

export type CompanyCatalogFile = {
    id: string;
    companyId: string;
    productId: string;
    kind: CompanyCatalogFileKind;
    bucket: string;
    storagePath: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    altText: string | null;
    active: boolean;
};

export type CompanyCatalogItem = {
    id: string;
    companyId: string;
    productName: string;
    category: string;
    brand: string;
    model: string;
    manufacturerPartNumber: string;
    sku: string;
    description: string;
    tier: CompanyCatalogTier;
    status: CompanyCatalogStatus;
    approvedSellingPrice: number | null;
    priceBookItemId: string | null;
    priceBookItemName: string | null;
    minimumSellingPrice: number | null;
    maximumSellingPrice: number | null;
    specifications: Record<string, string>;
    compatibleApplications: string[];
    installationRequirements: string[];
    workmanshipWarranty: string;
    laborWarranty: string;
    manufacturerWarranty: string;
    availabilityNote: string;
    manufacturerReference: string;
    companyNotes: string;
    files: CompanyCatalogFile[];
    createdAt: string | null;
    updatedAt: string | null;
};

export type CompanyCatalogDraft = Omit<CompanyCatalogItem, 'id' | 'companyId' | 'priceBookItemName' | 'files' | 'createdAt' | 'updatedAt'> & {
    id?: string;
};

export function emptyCompanyCatalogDraft(): CompanyCatalogDraft {
    return {
        productName: '',
        category: '',
        brand: '',
        model: '',
        manufacturerPartNumber: '',
        sku: '',
        description: '',
        tier: 'Professional',
        status: 'draft',
        approvedSellingPrice: null,
        priceBookItemId: null,
        minimumSellingPrice: null,
        maximumSellingPrice: null,
        specifications: {},
        compatibleApplications: [],
        installationRequirements: [],
        workmanshipWarranty: '',
        laborWarranty: '',
        manufacturerWarranty: '',
        availabilityNote: '',
        manufacturerReference: '',
        companyNotes: '',
    };
}

export async function loadCompanyProductCatalog(companyId: string) {
    const { data, error } = await supabase.rpc('get_company_product_catalog', {
        p_company_id: companyId,
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return rows.map(parseCatalogItem).filter((item): item is CompanyCatalogItem => Boolean(item));
}

export async function saveCompanyProductCatalogItem(companyId: string, draft: CompanyCatalogDraft) {
    const validationMessage = validateCompanyCatalogDraft(draft);
    if (validationMessage) throw new Error(validationMessage);
    const { data, error } = await supabase.rpc('save_company_product_catalog_item', {
        p_company_id: companyId,
        p_product_id: draft.id || null,
        p_payload: {
            product_name: draft.productName.trim() || `${draft.brand.trim()} ${draft.model.trim()}`,
            category: draft.category.trim(),
            brand: draft.brand.trim(),
            model: draft.model.trim(),
            manufacturer_part_number: cleanNullable(draft.manufacturerPartNumber),
            sku: cleanNullable(draft.sku),
            description: cleanNullable(draft.description),
            tier: draft.tier,
            status: draft.status,
            approved_selling_price: draft.approvedSellingPrice,
            price_book_item_id: draft.priceBookItemId,
            minimum_selling_price: draft.minimumSellingPrice,
            maximum_selling_price: draft.maximumSellingPrice,
            specifications: draft.specifications,
            compatible_applications: draft.compatibleApplications,
            installation_requirements: draft.installationRequirements,
            workmanship_warranty: cleanNullable(draft.workmanshipWarranty),
            labor_warranty: cleanNullable(draft.laborWarranty),
            manufacturer_warranty: cleanNullable(draft.manufacturerWarranty),
            availability_note: cleanNullable(draft.availabilityNote),
            manufacturer_reference: cleanNullable(draft.manufacturerReference),
            company_notes: cleanNullable(draft.companyNotes),
        },
    });
    if (error) throw error;
    const saved = parseCatalogItem(data);
    if (!saved) throw new Error('Catalog card saved, but its response was invalid.');
    return saved;
}

export async function uploadCompanyCatalogPhoto(input: {
    companyId: string;
    productId: string;
    asset: ImagePicker.ImagePickerAsset;
}) {
    const mimeType = input.asset.mimeType || 'image/jpeg';
    if (!mimeType.startsWith('image/')) throw new Error('Choose an image for the product card.');
    return uploadCompanyCatalogFile({
        companyId: input.companyId,
        productId: input.productId,
        kind: 'photo',
        uri: input.asset.uri,
        fileName: input.asset.fileName || `product-${Date.now()}.jpg`,
        mimeType,
        sizeBytes: input.asset.fileSize || null,
    });
}

export async function uploadCompanyCatalogDocument(input: {
    companyId: string;
    productId: string;
    kind: Exclude<CompanyCatalogFileKind, 'photo'>;
    asset: DocumentPicker.DocumentPickerAsset;
}) {
    const mimeType = input.asset.mimeType || 'application/pdf';
    if (mimeType !== 'application/pdf' && !mimeType.startsWith('image/')) {
        throw new Error('Catalog documents must be a PDF or image.');
    }
    return uploadCompanyCatalogFile({
        companyId: input.companyId,
        productId: input.productId,
        kind: input.kind,
        uri: input.asset.uri,
        fileName: input.asset.name || `catalog-document-${Date.now()}.pdf`,
        mimeType,
        sizeBytes: input.asset.size || null,
    });
}

export async function createCompanyCatalogFileUrl(file: CompanyCatalogFile) {
    const { data, error } = await supabase.storage.from(file.bucket).createSignedUrl(file.storagePath, 60 * 30);
    if (error) throw error;
    return data.signedUrl;
}

async function uploadCompanyCatalogFile(input: {
    companyId: string;
    productId: string;
    kind: CompanyCatalogFileKind;
    uri: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number | null;
}) {
    const fileId = createId();
    const fileName = sanitizeFileName(input.fileName);
    const storagePath = ['companies', input.companyId, 'catalog', input.productId, fileId, fileName].join('/');
    const body = await fetch(input.uri).then((response) => response.blob());
    const { error: uploadError } = await supabase.storage.from(COMPANY_PRODUCT_CATALOG_BUCKET).upload(storagePath, body, {
        contentType: input.mimeType,
        upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data, error } = await supabase.rpc('record_company_product_catalog_file', {
        p_company_id: input.companyId,
        p_product_id: input.productId,
        p_file_id: fileId,
        p_kind: input.kind,
        p_storage_path: storagePath,
        p_file_name: fileName,
        p_mime_type: input.mimeType,
        p_size_bytes: input.sizeBytes,
        p_alt_text: input.kind === 'photo' ? 'Product catalog photo' : null,
    });
    if (error) {
        await supabase.storage.from(COMPANY_PRODUCT_CATALOG_BUCKET).remove([storagePath]);
        throw error;
    }
    return parseCatalogFile(data);
}

function parseCatalogItem(value: unknown): CompanyCatalogItem | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const id = text(row.id);
    const companyId = text(row.company_id);
    const category = text(row.category);
    const brand = text(row.brand);
    const model = text(row.model);
    if (!id || !companyId || !category || !brand || !model) return null;
    const status = text(row.catalog_status);
    const tier = text(row.tier);
    const files = Array.isArray(row.files)
        ? row.files.map(parseCatalogFile).filter((file): file is CompanyCatalogFile => Boolean(file))
        : [];
    return {
        id,
        companyId,
        productName: text(row.product_name) || `${brand} ${model}`,
        category,
        brand,
        model,
        manufacturerPartNumber: text(row.manufacturer_part_number),
        sku: text(row.sku),
        description: text(row.product_description),
        tier: tier === 'Essential' || tier === 'Premium' ? tier : 'Professional',
        status: status === 'approved' || status === 'archived' ? status : 'draft',
        approvedSellingPrice: nullableNumber(row.approved_selling_price),
        priceBookItemId: nullableText(row.price_book_item_id),
        priceBookItemName: nullableText(row.price_book_item_name),
        minimumSellingPrice: nullableNumber(row.minimum_selling_price),
        maximumSellingPrice: nullableNumber(row.maximum_selling_price),
        specifications: textRecord(row.product_specifications),
        compatibleApplications: textArray(row.compatible_applications),
        installationRequirements: textArray(row.installation_requirements),
        workmanshipWarranty: text(row.workmanship_warranty),
        laborWarranty: text(row.labor_warranty),
        manufacturerWarranty: text(row.manufacturer_warranty) || text(row.warranty),
        availabilityNote: text(row.availability_note),
        manufacturerReference: text(row.manufacturer_reference),
        companyNotes: text(row.company_notes),
        files,
        createdAt: nullableText(row.created_at),
        updatedAt: nullableText(row.updated_at),
    };
}

function parseCatalogFile(value: unknown): CompanyCatalogFile | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const id = text(row.id);
    const companyId = text(row.company_id);
    const productId = text(row.product_id);
    const storagePath = text(row.storage_path);
    if (!id || !companyId || !productId || !storagePath) return null;
    const kind = text(row.media_kind);
    return {
        id,
        companyId,
        productId,
        kind: ['manual', 'warranty', 'specification', 'document'].includes(kind) ? kind as CompanyCatalogFileKind : 'photo',
        bucket: text(row.bucket) || COMPANY_PRODUCT_CATALOG_BUCKET,
        storagePath,
        fileName: text(row.file_name) || 'Catalog file',
        mimeType: nullableText(row.mime_type),
        sizeBytes: nullableNumber(row.size_bytes),
        altText: nullableText(row.alt_text),
        active: row.active !== false,
    };
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function nullableText(value: unknown) { return text(value) || null; }
function nullableNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function textArray(value: unknown) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function textRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.entries(value).reduce<Record<string, string>>((result, [key, entry]) => {
        const cleanKey = key.trim();
        const cleanValue = text(entry);
        if (cleanKey && cleanValue) result[cleanKey] = cleanValue;
        return result;
    }, {});
}
function cleanNullable(value: string) { return value.trim() || null; }
function sanitizeFileName(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'catalog-file'; }
function createId() {
    const cryptoLike = globalThis as { crypto?: { randomUUID?: () => string } };
    return cryptoLike.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
