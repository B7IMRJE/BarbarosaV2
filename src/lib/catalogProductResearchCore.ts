export type CatalogResearchConfidence = 'low' | 'medium' | 'high';

export type CatalogResearchSourceType =
    | 'manufacturer_product'
    | 'manufacturer_manual'
    | 'manufacturer_warranty'
    | 'manufacturer_support'
    | 'distributor'
    | 'other';

export type CatalogResearchSource = {
    title: string;
    url: string;
    sourceType: CatalogResearchSourceType;
};

export type CatalogResearchSpecification = {
    key: string;
    value: string;
    sourceUrl: string;
};

export type CatalogResearchApplication = {
    value: string;
    sourceUrl: string;
};

export type CatalogResearchRequirementType = 'manufacturer' | 'code_verification' | 'site_verification';

export type CatalogResearchRequirement = {
    value: string;
    sourceUrl: string;
    requirementType: CatalogResearchRequirementType;
};

export type CatalogProductResearch = {
    productName: string;
    category: string;
    manufacturer: string;
    brand: string;
    familyName: string;
    modelNumber: string;
    manufacturerPartNumber: string;
    sku: string;
    description: string;
    specifications: CatalogResearchSpecification[];
    compatibleApplications: CatalogResearchApplication[];
    installationRequirements: CatalogResearchRequirement[];
    manufacturerWarranty: string;
    manufacturerReference: string;
    sources: CatalogResearchSource[];
    confidence: CatalogResearchConfidence;
    exactModelMatch: boolean;
    warnings: string[];
    model: string;
    usage: CatalogResearchUsage | null;
};

export type CatalogResearchUsage = {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    webSearchCalls: number;
    maxOutputTokens: number;
};

export type CatalogResearchDraft = {
    productName: string;
    category: string;
    brand: string;
    model: string;
    manufacturerPartNumber: string;
    sku: string;
    description: string;
    specifications: Record<string, string>;
    compatibleApplications: string[];
    installationRequirements: string[];
    manufacturerWarranty: string;
    manufacturerReference: string;
};

export type CatalogResearchApplyGroup =
    | 'identity'
    | 'description'
    | 'specifications'
    | 'applications'
    | 'requirements'
    | 'warranty';

export type CatalogSeedResearchDraft = {
    manufacturer: string;
    brand: string;
    family_name: string;
    model_number: string;
    manufacturer_part_number: string;
    description: string;
    specifications: string;
    sources: string;
    confidence: string;
};

export type CatalogSeedResearchApplyResult<T extends CatalogSeedResearchDraft> = {
    draft: T;
    appliedFieldCount: number;
    preservedFieldCount: number;
};

const MAX_SHORT_TEXT = 240;
const MAX_DESCRIPTION = 2_000;
const MAX_LIST_ITEMS = 40;

export function readCatalogProductResearchResponse(value: unknown): CatalogProductResearch {
    const root = record(value);
    const research = record(root.research || root.result || value);
    const productName = cleanText(research.product_name, MAX_SHORT_TEXT);
    const category = cleanText(research.category, MAX_SHORT_TEXT);
    const brand = cleanText(research.brand, MAX_SHORT_TEXT);
    const modelNumber = cleanText(research.model_number, MAX_SHORT_TEXT);

    if (!category || !brand || !modelNumber) {
        throw new Error('Manufacturer research returned an incomplete product identity. Try a more exact model or part number.');
    }

    return {
        productName: productName || `${brand} ${modelNumber}`,
        category,
        manufacturer: cleanText(research.manufacturer, MAX_SHORT_TEXT) || brand,
        brand,
        familyName: cleanText(research.family_name, MAX_SHORT_TEXT),
        modelNumber,
        manufacturerPartNumber: cleanText(research.manufacturer_part_number, MAX_SHORT_TEXT),
        sku: cleanText(research.sku, MAX_SHORT_TEXT),
        description: cleanText(research.description, MAX_DESCRIPTION),
        specifications: uniqueBy(
            array(research.specifications).map(readSpecification).filter(Boolean) as CatalogResearchSpecification[],
            (item) => `${item.key.toLowerCase()}\u0000${item.value.toLowerCase()}`,
        ).slice(0, MAX_LIST_ITEMS),
        compatibleApplications: uniqueBy(
            array(research.compatible_applications).map(readApplication).filter(Boolean) as CatalogResearchApplication[],
            (item) => item.value.toLowerCase(),
        ).slice(0, MAX_LIST_ITEMS),
        installationRequirements: uniqueBy(
            array(research.installation_requirements).map(readRequirement).filter(Boolean) as CatalogResearchRequirement[],
            (item) => item.value.toLowerCase(),
        ).slice(0, MAX_LIST_ITEMS),
        manufacturerWarranty: cleanText(research.manufacturer_warranty, MAX_DESCRIPTION),
        manufacturerReference: safeUrl(research.manufacturer_reference),
        sources: uniqueBy(
            array(research.sources).map(readSource).filter(Boolean) as CatalogResearchSource[],
            (item) => item.url,
        ).slice(0, 20),
        confidence: readConfidence(research.confidence),
        exactModelMatch: research.exact_model_match === true,
        warnings: uniqueStrings(research.warnings, 16),
        model: cleanText(root.model, 120),
        usage: readUsage(root.usage),
    };
}

export function mapCatalogResearchSpecifications(
    research: CatalogProductResearch,
    template?: Pick<CatalogTemplateShape, 'universalFields' | 'specificationFields' | 'requiredFields'>,
) {
    const templateFields = [
        ...(template?.universalFields || []),
        ...(template?.specificationFields || []),
    ];
    const knownKeys = new Map(
        templateFields.map((field) => [normalizeFieldKey(field.key), field.key]),
    );
    const specifications = research.specifications.reduce<Record<string, string>>((result, item) => {
        const normalized = normalizeFieldKey(item.key);
        const key = knownKeys.get(normalized) || toSnakeCase(item.key);
        if (key && item.value) result[key] = item.value;
        return result;
    }, {});

    const applicationKey = templateFields.find((field) => normalizeFieldKey(field.key) === 'application')?.key
        || template?.requiredFields.find((field) => normalizeFieldKey(field) === 'application');
    if (applicationKey && !specifications[applicationKey] && research.compatibleApplications[0]?.value) {
        specifications[applicationKey] = research.compatibleApplications[0].value;
    }

    return specifications;
}

type CatalogTemplateShape = {
    universalFields: { key: string }[];
    specificationFields: { key: string }[];
    requiredFields: string[];
};

export function applyCatalogProductResearch<T extends CatalogResearchDraft>(
    draft: T,
    research: CatalogProductResearch,
    groups: CatalogResearchApplyGroup[],
): T {
    const selected = new Set(groups);
    const next = { ...draft };

    if (selected.has('identity')) {
        next.productName = research.productName || draft.productName;
        next.category = research.category || draft.category;
        next.brand = research.brand || draft.brand;
        next.model = research.modelNumber || draft.model;
        next.manufacturerPartNumber = research.manufacturerPartNumber || draft.manufacturerPartNumber;
        next.sku = research.sku || draft.sku;
    }
    if (selected.has('description') && research.description) next.description = research.description;
    if (selected.has('specifications')) {
        next.specifications = research.specifications.reduce<Record<string, string>>(
            (result, item) => ({ ...result, [item.key]: item.value }),
            { ...draft.specifications },
        );
    }
    if (selected.has('applications')) {
        next.compatibleApplications = mergeStrings(draft.compatibleApplications, research.compatibleApplications.map((item) => item.value));
    }
    if (selected.has('requirements')) {
        next.installationRequirements = mergeStrings(draft.installationRequirements, research.installationRequirements.map((item) => item.value));
    }
    if (selected.has('warranty')) {
        next.manufacturerWarranty = research.manufacturerWarranty || draft.manufacturerWarranty;
        next.manufacturerReference = research.manufacturerReference || research.sources[0]?.url || draft.manufacturerReference;
    }

    return next;
}

export function applyCatalogResearchToSeedDraft<T extends CatalogSeedResearchDraft>(
    draft: T,
    research: CatalogProductResearch,
    template?: Pick<CatalogTemplateShape, 'universalFields' | 'specificationFields' | 'requiredFields'>,
    verifiedAt = new Date().toISOString(),
): CatalogSeedResearchApplyResult<T> {
    const next = { ...draft };
    let appliedFieldCount = 0;
    let preservedFieldCount = 0;

    const fillBlank = (key: 'manufacturer' | 'brand' | 'family_name' | 'model_number' | 'manufacturer_part_number' | 'description' | 'confidence', researchedValue: string) => {
        if (!researchedValue.trim()) return;
        if (next[key].trim()) {
            preservedFieldCount += 1;
            return;
        }
        next[key] = researchedValue;
        appliedFieldCount += 1;
    };

    fillBlank('manufacturer', research.manufacturer || research.brand);
    fillBlank('brand', research.brand);
    fillBlank('family_name', research.familyName || research.productName);
    fillBlank('model_number', research.modelNumber);
    fillBlank('manufacturer_part_number', research.manufacturerPartNumber);
    fillBlank('description', research.description);
    fillBlank('confidence', research.confidence === 'high' ? '0.95' : research.confidence === 'medium' ? '0.75' : '0.5');

    const existingSpecifications = parseJsonObject(draft.specifications);
    if (existingSpecifications) {
        const researchedSpecifications = mapCatalogResearchSpecifications(research, template);
        const mergedSpecifications = { ...existingSpecifications };
        Object.entries(researchedSpecifications).forEach(([key, value]) => {
            const currentValue = mergedSpecifications[key];
            if (currentValue != null && String(currentValue).trim()) {
                preservedFieldCount += 1;
                return;
            }
            mergedSpecifications[key] = value;
            appliedFieldCount += 1;
        });
        next.specifications = JSON.stringify(mergedSpecifications, null, 2);
    } else if (research.specifications.length) {
        preservedFieldCount += research.specifications.length;
    }

    const existingSources = parseJsonArray(draft.sources);
    if (existingSources) {
        const sourceUrls = new Set(existingSources.map((source) => record(source).url).filter((url): url is string => typeof url === 'string' && Boolean(url)));
        const confidence = research.confidence === 'high' ? '0.95' : research.confidence === 'medium' ? '0.75' : '0.5';
        const researchedSources = research.sources
            .filter((source) => !sourceUrls.has(source.url))
            .map((source) => ({
                type: catalogResearchSourceKind(source.sourceType),
                url: source.url,
                title: source.title,
                verified_at: verifiedAt,
                confidence,
            }));
        appliedFieldCount += researchedSources.length;
        preservedFieldCount += research.sources.length - researchedSources.length;
        next.sources = JSON.stringify([...existingSources, ...researchedSources], null, 2);
    } else if (research.sources.length) {
        preservedFieldCount += research.sources.length;
    }

    return { draft: next, appliedFieldCount, preservedFieldCount };
}

export function catalogResearchSourceKind(sourceType: CatalogResearchSourceType) {
    switch (sourceType) {
        case 'manufacturer_product':
        case 'manufacturer_support':
            return 'manufacturer_page';
        case 'manufacturer_manual':
            return 'installation_manual';
        case 'manufacturer_warranty':
            return 'warranty_document';
        case 'distributor':
            return 'retailer_page';
        default:
            return 'other';
    }
}

export function researchSourceForValue(research: CatalogProductResearch, value: string) {
    const normalized = value.trim().toLowerCase();
    return research.specifications.find((item) => item.value.toLowerCase() === normalized)?.sourceUrl
        || research.compatibleApplications.find((item) => item.value.toLowerCase() === normalized)?.sourceUrl
        || research.installationRequirements.find((item) => item.value.toLowerCase() === normalized)?.sourceUrl
        || '';
}

function readSpecification(value: unknown): CatalogResearchSpecification | null {
    const item = record(value);
    const key = cleanText(item.key, 120);
    const specificationValue = cleanText(item.value, MAX_SHORT_TEXT);
    if (!key || !specificationValue) return null;
    return { key, value: specificationValue, sourceUrl: safeUrl(item.source_url) };
}

function parseJsonObject(value: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(value || '{}') as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

function parseJsonArray(value: string): unknown[] | null {
    try {
        const parsed = JSON.parse(value || '[]') as unknown;
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function readApplication(value: unknown): CatalogResearchApplication | null {
    const item = record(value);
    const application = cleanText(item.value, MAX_SHORT_TEXT);
    return application ? { value: application, sourceUrl: safeUrl(item.source_url) } : null;
}

function readRequirement(value: unknown): CatalogResearchRequirement | null {
    const item = record(value);
    const requirement = cleanText(item.value, 500);
    if (!requirement) return null;
    const type = cleanText(item.requirement_type, 40);
    return {
        value: requirement,
        sourceUrl: safeUrl(item.source_url),
        requirementType: type === 'code_verification' || type === 'site_verification' ? type : 'manufacturer',
    };
}

function readSource(value: unknown): CatalogResearchSource | null {
    const item = record(value);
    const url = safeUrl(item.url);
    if (!url) return null;
    const type = cleanText(item.source_type, 80);
    const sourceType: CatalogResearchSourceType = [
        'manufacturer_product',
        'manufacturer_manual',
        'manufacturer_warranty',
        'manufacturer_support',
        'distributor',
    ].includes(type) ? type as CatalogResearchSourceType : 'other';
    return { title: cleanText(item.title, MAX_SHORT_TEXT) || url, url, sourceType };
}

function readConfidence(value: unknown): CatalogResearchConfidence {
    const normalized = cleanText(value, 20).toLowerCase();
    return normalized === 'high' || normalized === 'medium' ? normalized : 'low';
}

function readUsage(value: unknown): CatalogResearchUsage | null {
    const usage = record(value);
    if (!Object.keys(usage).length) return null;
    return {
        inputTokens: nonNegativeInteger(usage.input_tokens),
        outputTokens: nonNegativeInteger(usage.output_tokens),
        totalTokens: nonNegativeInteger(usage.total_tokens),
        webSearchCalls: nonNegativeInteger(usage.web_search_calls),
        maxOutputTokens: nonNegativeInteger(usage.max_output_tokens),
    };
}

function nonNegativeInteger(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function normalizeFieldKey(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toSnakeCase(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function safeUrl(value: unknown) {
    const candidate = cleanText(value, 2_000);
    if (!candidate) return '';
    try {
        const url = new URL(candidate);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch {
        return '';
    }
}

function mergeStrings(current: string[], additions: string[]) {
    return uniqueBy([...current, ...additions].map((item) => item.trim()).filter(Boolean), (item) => item.toLowerCase());
}

function uniqueStrings(value: unknown, limit: number) {
    return uniqueBy(array(value).map((item) => cleanText(item, 500)).filter(Boolean), (item) => item.toLowerCase()).slice(0, limit);
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
    const seen = new Set<string>();
    return items.filter((item) => {
        const value = key(item);
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
    });
}

function cleanText(value: unknown, limit: number) {
    return typeof value === 'string' || typeof value === 'number'
        ? String(value).trim().replace(/\s+/g, ' ').slice(0, limit)
        : '';
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
