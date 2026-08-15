import type { CatalogFactoryRecord, CatalogSourceDraft } from './catalogFactory';

export const CATALOG_EDITOR_SPECIFICATION_KEYS = {
    productTitle: 'product_name',
    productType: 'product_type',
    compatibility: 'compatibility',
    compatibleParts: 'compatible_parts',
    applications: 'applications',
    warranty: 'manufacturer_warranty',
} as const;

const VISUAL_SPECIFICATION_KEYS = new Set<string>(Object.values(CATALOG_EDITOR_SPECIFICATION_KEYS));

export type CatalogFactoryEditorDraft = {
    productTitle: string;
    templateId: string;
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
    productType: string;
    compatibility: string;
    compatibleParts: string;
    applications: string;
    warranty: string;
    specifications: Record<string, unknown>;
    sources: CatalogSourceDraft[];
};

export function createCatalogFactoryEditorDraft(record: CatalogFactoryRecord): CatalogFactoryEditorDraft {
    return {
        productTitle: specificationText(record.specifications[CATALOG_EDITOR_SPECIFICATION_KEYS.productTitle])
            || [record.brand, record.familyName, record.modelNumber].filter(Boolean).join(' '),
        templateId: record.templateId,
        manufacturer: record.manufacturer,
        brand: record.brand,
        familyName: record.familyName,
        modelNumber: record.modelNumber,
        manufacturerPartNumber: record.manufacturerPartNumber,
        upcGtin: record.upcGtin,
        color: record.color,
        finish: record.finish,
        size: record.size,
        capacity: record.capacity,
        description: record.description,
        productType: specificationText(record.specifications[CATALOG_EDITOR_SPECIFICATION_KEYS.productType])
            || specificationText(record.specifications.type),
        compatibility: specificationText(record.specifications[CATALOG_EDITOR_SPECIFICATION_KEYS.compatibility]),
        compatibleParts: specificationText(record.specifications[CATALOG_EDITOR_SPECIFICATION_KEYS.compatibleParts]),
        applications: specificationText(record.specifications[CATALOG_EDITOR_SPECIFICATION_KEYS.applications]),
        warranty: specificationText(record.specifications[CATALOG_EDITOR_SPECIFICATION_KEYS.warranty])
            || specificationText(record.specifications.warranty),
        specifications: Object.fromEntries(
            Object.entries(record.specifications).filter(([key]) => !VISUAL_SPECIFICATION_KEYS.has(key) && key !== 'type' && key !== 'warranty'),
        ),
        sources: record.sources.map((source) => ({
            id: source.id,
            sourceType: source.sourceType || 'other',
            sourceUrl: source.sourceUrl,
            title: source.title,
        })),
    };
}

export function catalogFactoryEditorSpecifications(draft: CatalogFactoryEditorDraft) {
    const specifications = { ...draft.specifications };
    setOptionalSpecification(specifications, CATALOG_EDITOR_SPECIFICATION_KEYS.productTitle, draft.productTitle);
    setOptionalSpecification(specifications, CATALOG_EDITOR_SPECIFICATION_KEYS.productType, draft.productType);
    setOptionalSpecification(specifications, CATALOG_EDITOR_SPECIFICATION_KEYS.compatibility, lines(draft.compatibility));
    setOptionalSpecification(specifications, CATALOG_EDITOR_SPECIFICATION_KEYS.compatibleParts, lines(draft.compatibleParts));
    setOptionalSpecification(specifications, CATALOG_EDITOR_SPECIFICATION_KEYS.applications, lines(draft.applications));
    setOptionalSpecification(specifications, CATALOG_EDITOR_SPECIFICATION_KEYS.warranty, draft.warranty);
    return specifications;
}

export function catalogFactoryEditorPayload(
    draft: CatalogFactoryEditorDraft,
    workflow: {
        confidence: number | null;
        validationWarnings: string[];
        duplicateWarnings: string[];
        missingFields: string[];
        specifications?: Record<string, unknown>;
        sources?: CatalogSourceDraft[];
    },
) {
    return {
        category_template_id: draft.templateId,
        manufacturer: draft.manufacturer.trim(),
        brand: draft.brand.trim(),
        family_name: draft.familyName.trim(),
        model_number: draft.modelNumber.trim(),
        manufacturer_part_number: nullable(draft.manufacturerPartNumber),
        upc_gtin: nullable(draft.upcGtin),
        color: nullable(draft.color),
        finish: nullable(draft.finish),
        size: nullable(draft.size),
        capacity: nullable(draft.capacity),
        description: nullable(draft.description),
        specifications: workflow.specifications || catalogFactoryEditorSpecifications(draft),
        sources: (workflow.sources || draft.sources).map((source) => ({
            id: source.id || null,
            type: source.sourceType || 'other',
            url: source.sourceUrl.trim(),
            title: nullable(source.title),
        })).filter((source) => source.url),
        confidence: workflow.confidence,
        validation_warnings: workflow.validationWarnings,
        duplicate_warnings: workflow.duplicateWarnings,
        missing_fields: workflow.missingFields,
    };
}

function setOptionalSpecification(target: Record<string, unknown>, key: string, value: unknown) {
    if (Array.isArray(value)) {
        if (value.length) target[key] = value;
        else delete target[key];
        return;
    }
    const cleaned = typeof value === 'string' ? value.trim() : value;
    if (cleaned === '' || cleaned == null) delete target[key];
    else target[key] = cleaned;
}

function specificationText(value: unknown) {
    if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean).join('\n');
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value).trim();
}

function lines(value: string) {
    return value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
}

function nullable(value: string) {
    return value.trim() || null;
}
