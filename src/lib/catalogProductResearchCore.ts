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
    };
}

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
