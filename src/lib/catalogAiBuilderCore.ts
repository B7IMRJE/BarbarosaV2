export const CATALOG_PRIMARY_ITEM_TYPES = [
    'Fixture',
    'Equipment',
    'Built-In / Assembly',
    'Basin / Receptacle',
    'Component',
] as const;

export type CatalogPrimaryItemType = typeof CATALOG_PRIMARY_ITEM_TYPES[number];
export type CatalogFieldProvenanceKind = 'admin_entered' | 'verified' | 'ai_inferred' | 'unverified';
export type CatalogAiSourceType =
    | 'manufacturer_product'
    | 'installation_manual'
    | 'owner_manual'
    | 'specification_sheet'
    | 'warranty_document';

export type CatalogAiSource = {
    title: string;
    url: string;
    sourceType: CatalogAiSourceType;
};

export type CatalogFieldProvenance = {
    kind: CatalogFieldProvenanceKind;
    sourceUrls: string[];
    note: string;
};

export type CatalogAiField = {
    key: string;
    label: string;
    value: string;
    provenance: CatalogFieldProvenance;
};

export type CatalogAiPlacement = {
    systemKey: string;
    areaKey: string;
    parentSubtype: string;
    path: string[];
    reason: string;
};

export type CatalogAiImageCandidate = {
    imageUrl: string;
    sourceUrl: string;
    title: string;
    altText: string;
    confidence: number | null;
    selected: boolean;
    primary: boolean;
    copiedBucket?: string;
    copiedStoragePath?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number | null;
};

export type CatalogAiResearchUsage = {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    webSearchCalls: number;
    maxOutputTokens: number;
};

export type CatalogAiResearchResult = {
    productName: string;
    manufacturer: string;
    brand: string;
    familyName: string;
    modelNumber: string;
    manufacturerPartNumber: string;
    upcGtin: string;
    primaryItemType: CatalogPrimaryItemType | '';
    subtype: string;
    category: string;
    system: string;
    shortDescription: string;
    detailedDescription: string;
    tags: string[];
    fields: CatalogAiField[];
    placements: CatalogAiPlacement[];
    sources: CatalogAiSource[];
    candidateImages: CatalogAiImageCandidate[];
    confidence: 'low' | 'medium' | 'high';
    exactModelMatch: boolean;
    warnings: string[];
    model: string;
    usage: CatalogAiResearchUsage | null;
};

export type CatalogAiBuilderInput = {
    prompt: string;
    manufacturer?: string;
    productName?: string;
    modelNumber?: string;
    manufacturerPartNumber?: string;
    primaryItemType?: CatalogPrimaryItemType | '';
    subtype?: string;
    area?: string;
    system?: string;
    knownSpecifications?: string;
    dimensions?: string;
    productUrl?: string;
    notes?: string;
};

export type CatalogAiDraftPayload = {
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
    candidateImages: CatalogAiImageCandidate[];
    confidence: number;
    validationWarnings: string[];
    missingFields: string[];
    researchMetadata: Record<string, unknown>;
};

const MAX_SOURCE_COUNT = 4;
const MAX_FIELDS = 80;
const MAX_IMAGES = 12;

export function readCatalogAiResearchResponse(value: unknown): CatalogAiResearchResult {
    const root = record(value);
    const research = record(root.research || root.result || value);
    const primaryItemType = readPrimaryItemType(research.primary_item_type);
    const sources = curateCatalogAiSources(research.sources);
    const sourceUrls = new Set(sources.map((source) => canonicalUrl(source.url)));
    const fields = uniqueBy(
        array(research.fields).map(readField).filter(isPresent),
        (field) => field.key.toLowerCase(),
    ).slice(0, MAX_FIELDS).map((field) => ({
        ...field,
        provenance: {
            ...field.provenance,
            sourceUrls: field.provenance.sourceUrls.filter((url) => sourceUrls.has(canonicalUrl(url))),
        },
    }));

    return {
        productName: cleanText(research.product_name, 240),
        manufacturer: cleanText(research.manufacturer, 240),
        brand: cleanText(research.brand, 240),
        familyName: cleanText(research.family_name, 240),
        modelNumber: cleanText(research.model_number, 240),
        manufacturerPartNumber: cleanText(research.manufacturer_part_number, 240),
        upcGtin: cleanText(research.upc_gtin, 80),
        primaryItemType,
        subtype: cleanText(research.subtype, 160),
        category: cleanText(research.category, 160),
        system: cleanText(research.system, 160),
        shortDescription: cleanText(research.short_description, 500),
        detailedDescription: cleanText(research.detailed_description, 4_000),
        tags: uniqueStrings(research.tags, 30, 80),
        fields,
        placements: uniqueBy(
            array(research.placements).map(readPlacement).filter(isPresent),
            (placement) => [placement.systemKey, placement.areaKey, placement.parentSubtype, ...placement.path].join('\u0000').toLowerCase(),
        ).slice(0, 20),
        sources,
        candidateImages: uniqueBy(
            array(research.candidate_images).map(readImageCandidate).filter(isPresent),
            (candidate) => canonicalUrl(candidate.imageUrl),
        ).slice(0, MAX_IMAGES),
        confidence: readConfidence(research.confidence),
        exactModelMatch: research.exact_model_match === true,
        warnings: uniqueStrings(research.warnings, 20, 500),
        model: cleanText(root.model, 120),
        usage: readUsage(root.usage),
    };
}

export function buildCatalogAiDraftPayload(
    input: CatalogAiBuilderInput,
    research: CatalogAiResearchResult,
    categoryTemplateId: string,
    researchedAt = new Date().toISOString(),
): CatalogAiDraftPayload {
    const adminValues: Record<string, string> = {
        manufacturer: input.manufacturer?.trim() || '',
        product_name: input.productName?.trim() || '',
        model_number: input.modelNumber?.trim() || '',
        manufacturer_part_number: input.manufacturerPartNumber?.trim() || '',
        primary_item_type: input.primaryItemType?.trim() || '',
        subtype: input.subtype?.trim() || '',
        system: input.system?.trim() || '',
        area: input.area?.trim() || '',
        dimensions: input.dimensions?.trim() || '',
        known_specifications: input.knownSpecifications?.trim() || '',
        product_url: safeUrl(input.productUrl),
        notes: input.notes?.trim() || '',
    };
    const fieldProvenance: Record<string, CatalogFieldProvenance> = {};
    Object.entries(adminValues).forEach(([key, fieldValue]) => {
        if (fieldValue) fieldProvenance[key] = { kind: 'admin_entered', sourceUrls: [], note: '' };
    });
    research.fields.forEach((field) => {
        if (!fieldProvenance[field.key]) fieldProvenance[field.key] = field.provenance;
    });
    const verifiedIdentity: CatalogFieldProvenance = research.exactModelMatch && research.sources.length
        ? { kind: 'verified', sourceUrls: research.sources.map((source) => source.url), note: '' }
        : { kind: 'unverified', sourceUrls: [], note: 'Review this identity before approval.' };
    (['manufacturer', 'product_name', 'family_name', 'model_number', 'manufacturer_part_number'] as const).forEach((key) => {
        const hasValue = ({
            manufacturer: research.manufacturer,
            product_name: research.productName,
            family_name: research.familyName,
            model_number: research.modelNumber,
            manufacturer_part_number: research.manufacturerPartNumber,
        })[key];
        if (hasValue && !fieldProvenance[key]) fieldProvenance[key] = verifiedIdentity;
    });

    const primaryItemType = input.primaryItemType || research.primaryItemType;
    const manufacturer = adminValues.manufacturer || research.manufacturer || research.brand;
    const productName = adminValues.product_name || research.productName;
    const modelNumber = adminValues.model_number || research.modelNumber;
    const subtype = adminValues.subtype || research.subtype;
    const missingFields = [
        !categoryTemplateId ? 'category_template_id' : '',
        !manufacturer ? 'manufacturer' : '',
        !productName ? 'product_name' : '',
        !modelNumber ? 'model_number' : '',
        !subtype ? 'subtype' : '',
    ].filter(Boolean);
    const warnings = [...research.warnings];
    if (!research.exactModelMatch && modelNumber) warnings.push('The exact model has not been verified.');

    return {
        categoryTemplateId,
        manufacturer,
        brand: research.brand || manufacturer,
        familyName: research.familyName || productName || subtype,
        productName,
        modelNumber,
        manufacturerPartNumber: adminValues.manufacturer_part_number || research.manufacturerPartNumber,
        upcGtin: research.upcGtin,
        description: research.detailedDescription || research.shortDescription,
        specifications: Object.fromEntries(research.fields.filter((field) => field.value).map((field) => [field.key, field.value])),
        primaryItemType,
        subtype,
        tags: research.tags,
        fieldProvenance,
        placements: research.placements,
        sources: research.sources,
        candidateImages: research.candidateImages,
        confidence: research.confidence === 'high' ? 0.95 : research.confidence === 'medium' ? 0.75 : 0.5,
        validationWarnings: [],
        missingFields,
        researchMetadata: {
            prompt: input.prompt.trim(),
            researched_at: researchedAt,
            research_model: research.model,
            exact_model_match: research.exactModelMatch,
            source_count: research.sources.length,
            candidate_image_count: research.candidateImages.length,
            usage: research.usage,
            advisory_warnings: uniqueBy(warnings.map((warning) => warning.trim()).filter(Boolean), (warning) => warning.toLowerCase()),
        },
    };
}

export function curateCatalogAiSources(value: unknown): CatalogAiSource[] {
    const seenTypes = new Set<CatalogAiSourceType>();
    const seenUrls = new Set<string>();
    const sources: CatalogAiSource[] = [];
    for (const candidate of array(value)) {
        const source = readSource(candidate);
        if (!source) continue;
        const normalizedUrl = canonicalUrl(source.url);
        if (seenUrls.has(normalizedUrl) || seenTypes.has(source.sourceType)) continue;
        seenUrls.add(normalizedUrl);
        seenTypes.add(source.sourceType);
        sources.push(source);
        if (sources.length === MAX_SOURCE_COUNT) break;
    }
    return sources;
}

function readField(value: unknown): CatalogAiField | null {
    const item = record(value);
    const key = toSnakeCase(cleanText(item.key, 120));
    const fieldValue = cleanText(item.value, 2_000);
    if (!key || !fieldValue) return null;
    const provenance = record(item.provenance);
    const sourceUrls = uniqueBy(array(provenance.source_urls).map(safeUrl).filter(Boolean), canonicalUrl).slice(0, 4);
    return {
        key,
        label: cleanText(item.label, 160) || key.replace(/_/g, ' '),
        value: fieldValue,
        provenance: {
            kind: readProvenanceKind(provenance.kind, sourceUrls.length),
            sourceUrls,
            note: cleanText(provenance.note, 500),
        },
    };
}

function readPlacement(value: unknown): CatalogAiPlacement | null {
    const item = record(value);
    const path = uniqueStrings(item.path, 8, 120);
    const systemKey = cleanText(item.system_key, 120);
    const areaKey = cleanText(item.area_key, 120);
    const parentSubtype = cleanText(item.parent_subtype, 160);
    if (!systemKey && !areaKey && !parentSubtype && path.length === 0) return null;
    return { systemKey, areaKey, parentSubtype, path, reason: cleanText(item.reason, 500) };
}

function readImageCandidate(value: unknown): CatalogAiImageCandidate | null {
    const item = record(value);
    const imageUrl = safeUrl(item.image_url);
    const sourceUrl = safeUrl(item.source_url);
    if (!imageUrl || !sourceUrl) return null;
    return {
        imageUrl,
        sourceUrl,
        title: cleanText(item.title, 240),
        altText: cleanText(item.alt_text, 500),
        confidence: numberBetweenZeroAndOne(item.confidence),
        selected: item.selected === true,
        primary: item.primary === true && item.selected === true,
    };
}

function readSource(value: unknown): CatalogAiSource | null {
    const item = record(value);
    const url = safeUrl(item.url);
    const sourceType = readSourceType(item.source_type);
    if (!url || !sourceType) return null;
    return { title: cleanText(item.title, 240) || url, url, sourceType };
}

function readSourceType(value: unknown): CatalogAiSourceType | null {
    const sourceType = cleanText(value, 80);
    return ['manufacturer_product', 'installation_manual', 'owner_manual', 'specification_sheet', 'warranty_document'].includes(sourceType)
        ? sourceType as CatalogAiSourceType
        : null;
}

function readPrimaryItemType(value: unknown): CatalogPrimaryItemType | '' {
    const itemType = cleanText(value, 80);
    return CATALOG_PRIMARY_ITEM_TYPES.includes(itemType as CatalogPrimaryItemType)
        ? itemType as CatalogPrimaryItemType
        : '';
}

function readProvenanceKind(value: unknown, sourceCount: number): CatalogFieldProvenanceKind {
    const kind = cleanText(value, 40);
    if (kind === 'admin_entered' || kind === 'ai_inferred' || kind === 'unverified') return kind;
    if (kind === 'verified' && sourceCount > 0) return kind;
    return sourceCount > 0 ? 'verified' : 'unverified';
}

function readConfidence(value: unknown): 'low' | 'medium' | 'high' {
    const confidence = cleanText(value, 20).toLowerCase();
    return confidence === 'high' || confidence === 'medium' ? confidence : 'low';
}

function readUsage(value: unknown): CatalogAiResearchUsage | null {
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

function safeUrl(value: unknown) {
    const candidate = cleanText(value, 2_000);
    if (!candidate) return '';
    try {
        const url = new URL(candidate);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch { return ''; }
}

function canonicalUrl(value: string) {
    try {
        const url = new URL(value);
        url.hash = '';
        url.hostname = url.hostname.toLowerCase();
        url.pathname = url.pathname.replace(/\/+$/, '') || '/';
        return url.toString();
    } catch { return value.trim().toLowerCase(); }
}

function numberBetweenZeroAndOne(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function nonNegativeInteger(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function toSnakeCase(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function uniqueStrings(value: unknown, limit: number, itemLimit: number) {
    return uniqueBy(array(value).map((item) => cleanText(item, itemLimit)).filter(Boolean), (item) => item.toLowerCase()).slice(0, limit);
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

function isPresent<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}
