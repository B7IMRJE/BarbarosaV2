import type { CatalogFactoryRecord, CatalogSourceDraft } from './catalogFactory';

export const CATALOG_EDITOR_SPECIFICATION_KEYS = {
    productTitle: 'product_name',
    compatibility: 'compatibility',
    compatibleParts: 'compatible_parts',
    applications: 'applications',
    warranty: 'manufacturer_warranty',
} as const;

const VISUAL_SPECIFICATION_KEYS = new Set<string>(Object.values(CATALOG_EDITOR_SPECIFICATION_KEYS));

export const CATALOG_FINISH_OPTIONS = [
    'Chrome',
    'Brushed Nickel',
    'Stainless Steel',
    'Matte Black/Black',
    'Oil-Rubbed Bronze',
    'Bronze',
    'Brass',
    'Gold',
    'White',
] as const;

export type CatalogFinishOption = typeof CATALOG_FINISH_OPTIONS[number] | 'Custom';

export type CatalogFactoryEditorDraft = {
    productTitle: string;
    templateId: string;
    manufacturer: string;
    brand: string;
    familyName: string;
    modelNumber: string;
    manufacturerPartNumber: string;
    upcGtin: string;
    finish: string;
    description: string;
    compatibility: string;
    compatibleParts: string;
    applications: string;
    warranty: string;
    specifications: Record<string, unknown>;
    sources: CatalogSourceDraft[];
};

export function createCatalogFactoryEditorDraft(record: CatalogFactoryRecord): CatalogFactoryEditorDraft {
    const existingFinish = record.finish || record.color || specificationText(record.specifications.finish) || specificationText(record.specifications.color);
    const finishOption = catalogFinishOption(existingFinish);
    const additionalSpecifications = Object.fromEntries(
        Object.entries(record.specifications).filter(([key]) => (
            !VISUAL_SPECIFICATION_KEYS.has(key)
            && key !== 'type'
            && key !== 'warranty'
            && key !== 'finish'
            && key !== 'color'
            && key !== 'product_type'
        )),
    );
    preserveSpecification(additionalSpecifications, 'product_type', record.specifications.product_type, record.category);
    preserveSpecification(additionalSpecifications, 'size', record.size);
    preserveSpecification(additionalSpecifications, 'capacity', record.capacity);
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
        finish: finishOption === 'Custom' ? existingFinish : finishOption,
        description: record.description,
        compatibility: specificationText(record.specifications[CATALOG_EDITOR_SPECIFICATION_KEYS.compatibility]),
        compatibleParts: specificationText(record.specifications[CATALOG_EDITOR_SPECIFICATION_KEYS.compatibleParts]),
        applications: specificationText(record.specifications[CATALOG_EDITOR_SPECIFICATION_KEYS.applications]),
        warranty: specificationText(record.specifications[CATALOG_EDITOR_SPECIFICATION_KEYS.warranty])
            || specificationText(record.specifications.warranty),
        specifications: additionalSpecifications,
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
    setOptionalSpecification(specifications, CATALOG_EDITOR_SPECIFICATION_KEYS.compatibility, lines(draft.compatibility));
    setOptionalSpecification(specifications, CATALOG_EDITOR_SPECIFICATION_KEYS.compatibleParts, lines(draft.compatibleParts));
    setOptionalSpecification(specifications, CATALOG_EDITOR_SPECIFICATION_KEYS.applications, lines(draft.applications));
    setOptionalSpecification(specifications, CATALOG_EDITOR_SPECIFICATION_KEYS.warranty, draft.warranty);
    delete specifications.finish;
    delete specifications.color;
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
    const specifications = sanitizeSpecifications(
        workflow.specifications || catalogFactoryEditorSpecifications(draft),
    );
    return {
        category_template_id: draft.templateId,
        manufacturer: draft.manufacturer.trim(),
        brand: draft.brand.trim(),
        family_name: draft.familyName.trim(),
        model_number: draft.modelNumber.trim(),
        manufacturer_part_number: nullable(draft.manufacturerPartNumber),
        upc_gtin: nullable(draft.upcGtin),
        color: null,
        finish: nullable(draft.finish),
        size: null,
        capacity: null,
        description: nullable(draft.description),
        specifications,
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

export function catalogFinishOption(value: string): CatalogFinishOption {
    const normalized = value.trim().toLowerCase();
    const aliases: Record<string, CatalogFinishOption> = {
        black: 'Matte Black/Black',
        'matte black': 'Matte Black/Black',
        'matte black / black': 'Matte Black/Black',
        'oil rubbed bronze': 'Oil-Rubbed Bronze',
        'oil-rubbed bronze (orb)': 'Oil-Rubbed Bronze',
        'oil rubbed bronze (orb)': 'Oil-Rubbed Bronze',
        'polished chrome': 'Chrome',
    };
    if (aliases[normalized]) return aliases[normalized];
    return CATALOG_FINISH_OPTIONS.find((option) => option.toLowerCase() === normalized) || 'Custom';
}

function sanitizeSpecifications(value: Record<string, unknown>) {
    const specifications = { ...value };
    Object.keys(specifications).forEach((key) => {
        if (['finish', 'color'].includes(key.trim().toLowerCase())) delete specifications[key];
    });
    return specifications;
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

function preserveSpecification(target: Record<string, unknown>, key: string, value: unknown, duplicateValue = '') {
    const text = specificationText(value);
    if (!text || text.toLowerCase() === duplicateValue.trim().toLowerCase()) return;
    const existing = specificationText(target[key]);
    if (existing) {
        if (existing.toLowerCase() !== text.toLowerCase()) target[key] = `${existing}\n${text}`;
        return;
    }
    target[key] = value;
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
