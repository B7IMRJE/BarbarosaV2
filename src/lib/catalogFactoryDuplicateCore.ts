import type { CatalogFactoryRecord } from './catalogFactory';

export type CatalogFactoryDuplicateDraft = {
    productTitle: string;
    modelNumber: string;
    manufacturerPartNumber: string;
    upcGtin: string;
    finish: string;
    size: string;
    specifications: Record<string, unknown>;
};

export function createCatalogFactoryDuplicateDraft(record: CatalogFactoryRecord): CatalogFactoryDuplicateDraft {
    const specifications = structuredCloneValue(record.specifications);
    const sourceTitle = text(specifications.product_name)
        || [record.brand, record.familyName, record.modelNumber].filter(Boolean).join(' ');
    const size = text(specifications.size) || record.size;

    if (size) specifications.size = size;
    else delete specifications.size;

    return {
        productTitle: sourceTitle ? `Copy of ${sourceTitle}` : 'Copy of master product',
        modelNumber: '',
        manufacturerPartNumber: '',
        upcGtin: '',
        finish: record.finish || record.color,
        size,
        specifications,
    };
}

export function catalogFactoryDuplicatePayload(draft: CatalogFactoryDuplicateDraft) {
    const specifications = structuredCloneValue(draft.specifications);
    const productTitle = draft.productTitle.trim();
    const size = draft.size.trim();

    if (productTitle) specifications.product_name = productTitle;
    else delete specifications.product_name;
    if (size) specifications.size = size;
    else delete specifications.size;

    return {
        product_title: productTitle || null,
        model_number: draft.modelNumber.trim(),
        manufacturer_part_number: nullable(draft.manufacturerPartNumber),
        upc_gtin: nullable(draft.upcGtin),
        finish: nullable(draft.finish),
        specifications,
    };
}

function structuredCloneValue(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneEntry(entry)]));
}

function cloneEntry(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(cloneEntry);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, cloneEntry(entry)]));
    }
    return value;
}

function text(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function nullable(value: string) {
    return value.trim() || null;
}
