declare const Deno: {
    env: { get(name: string): string | undefined };
};

type FunctionEnv = {
    supabaseUrl: string;
    publishableKey: string;
    openAiApiKey: string;
    model: string;
};

type CatalogResearchRequest = {
    mode: 'legacy' | 'ai_catalog_builder';
    companyId: string | null;
    trade: string;
    prompt: string;
    productName: string;
    primaryItemType: string;
    subtype: string;
    area: string;
    system: string;
    knownSpecifications: string;
    dimensions: string;
    productUrl: string;
    category: string;
    brand: string;
    model: string;
    manufacturerPartNumber: string;
    notes: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INPUT_LENGTH = 1_000;
const MAX_OUTPUT_TOKENS = 4_200;
const MAX_WEB_SEARCH_CALLS = 2;
export const CATALOG_RESEARCH_DEFAULT_MODEL = 'gpt-5.6-luna';
export const CATALOG_AI_BUILDER_DEFAULT_MODEL = 'gpt-5.6-terra';

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
        if (req.method !== 'POST') return errorJson(req, 405, 'method_not_allowed', 'Method not allowed.');

        try {
            const env = loadEnv();
            const token = bearerToken(req);
            if (!token) return errorJson(req, 401, 'not_authenticated', 'Sign in again before researching manufacturer information.');
            if (!env.openAiApiKey) return errorJson(req, 501, 'openai_not_configured', 'Manufacturer research is not configured.');

            const userId = await loadAuthUserId(env, token);
            if (!userId) return errorJson(req, 401, 'not_authenticated', 'Sign in again before researching manufacturer information.');

            const input = readCatalogResearchRequest(await readJsonBody(req));
            const allowed = input.mode === 'ai_catalog_builder'
                ? await invokeBooleanRpc(env, token, 'homeos_is_platform_admin', {})
                : input.companyId
                ? await invokeBooleanRpc(env, token, 'company_product_catalog_can_manage', { p_company_id: input.companyId })
                : await invokeBooleanRpc(env, token, 'homeos_is_platform_admin', {});
            if (!allowed) return errorJson(req, 403, 'not_authorized', 'Catalog management access is required for manufacturer research.');

            const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${env.openAiApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: input.mode === 'ai_catalog_builder' ? CATALOG_AI_BUILDER_DEFAULT_MODEL : env.model,
                    reasoning: { effort: 'none' },
                    tools: [{
                        type: 'web_search',
                        search_context_size: 'low',
                        external_web_access: true,
                        filters: { blocked_domains: ['reddit.com', 'quora.com', 'wikipedia.org'] },
                    }],
                    tool_choice: 'required',
                    max_tool_calls: MAX_WEB_SEARCH_CALLS,
                    include: ['web_search_call.action.sources'],
                    input: [
                        {
                            role: 'system',
                            content: [{
                                type: 'input_text',
                                text: [
                                    input.mode === 'ai_catalog_builder'
                                        ? 'You research products and serviceable items for a platform-owned service catalog.'
                                        : 'You research exact plumbing products for a service-and-repair company catalog.',
                                    'Search the live web before answering. Prefer the manufacturer product page, installation manual, specification sheet, warranty, and manufacturer support pages.',
                                    'Use reputable distributor pages only when an official source does not supply a field. Never use user forums, unsourced summaries, or guessed specifications.',
                                    'Match the exact model or manufacturer part number. If no exact match is found, set exact_model_match false, lower confidence, add a warning, and omit any fact that cannot be verified for the requested product or product family.',
                                    'Do not invent dimensions, capacities, flow rates, connection sizes, venting, clearances, certifications, warranty terms, compatibility, or model identifiers.',
                                    'For tankless water heaters, distinguish condensing from non-condensing and state only the vent materials, condensate requirements, and clearances documented for the exact model. Treat local code and site conditions as verification requirements, not manufacturer facts.',
                                    'For shower valves and retrofit kits, distinguish the rough valve body, cartridge platform, trim, cover/remodel plate, and finished-wall compatibility.',
                                    'Compatible applications describe supported product uses. Installation requirements must be actionable for field review and labeled manufacturer, code_verification, or site_verification.',
                                    'Every researched specification, application, and manufacturer requirement must include the URL supporting it. Use an empty source_url only for code/site verification reminders that are not product claims.',
                                    input.mode === 'ai_catalog_builder' ? [
                                        'Classify the item with exactly one primary item type: Fixture, Equipment, Built-In / Assembly, Basin / Receptacle, or Component.',
                                        'Choose a specific subtype and only include fields relevant to that subtype.',
                                        'Keep external references concise: at most four, at most one each for manufacturer product, installation manual, distinct owner manual, specification sheet, and warranty. Do not include retailer pages or redundant links.',
                                        'For every field, label provenance verified only when a retained source URL directly supports it. Otherwise label it ai_inferred or unverified. Never mark an uncited fact verified.',
                                        'Candidate images must be direct image URLs from an authoritative retained source and remain review candidates. Do not invent, generate, or automatically approve images.',
                                        'Suggest multiple valid placements without duplicating the canonical product.',
                                        'Leave an unknown model, warranty, certification, dimension, capacity, rating, electrical requirement, efficiency, or connection size blank. Never use placeholder model values.',
                                    ].join(' ') : '',
                                    'Return concise structured JSON only. The technician will review everything before applying it.',
                                ].join(' '),
                            }],
                        },
                        {
                            role: 'user',
                            content: [{
                                type: 'input_text',
                                text: JSON.stringify({
                                    task: input.mode === 'ai_catalog_builder'
                                        ? 'Research and structure an editable AI Catalog Factory draft.'
                                        : 'Research and structure this exact plumbing product for a company catalog.',
                                    requested_product: {
                                        free_text: input.prompt || null,
                                        trade: input.trade,
                                        product_name: input.productName || null,
                                        primary_item_type: input.primaryItemType || null,
                                        subtype: input.subtype || null,
                                        area: input.area || null,
                                        system: input.system || null,
                                        known_specifications: input.knownSpecifications || null,
                                        dimensions: input.dimensions || null,
                                        product_url: input.productUrl || null,
                                        category: input.category,
                                        brand: input.brand,
                                        model: input.model,
                                        manufacturer_part_number: input.manufacturerPartNumber || null,
                                        field_notes: input.notes || null,
                                    },
                                }),
                            }],
                        },
                    ],
                    text: {
                        format: {
                            type: 'json_schema',
                            name: input.mode === 'ai_catalog_builder' ? 'ai_catalog_item_research' : 'catalog_product_research',
                            strict: true,
                            schema: input.mode === 'ai_catalog_builder' ? catalogAiResearchSchema() : catalogResearchSchema(),
                        },
                    },
                    max_output_tokens: MAX_OUTPUT_TOKENS,
                }),
            });

            const responseText = await openAiResponse.text();
            const responseBody = parseRecord(responseText);
            if (!openAiResponse.ok) {
                const detail = readString(readRecord(responseBody?.error)?.message);
                const status = openAiResponse.status === 429 ? 429 : 502;
                return errorJson(req, status, 'openai_request_failed', detail || 'Manufacturer research is temporarily unavailable.');
            }

            const outputText = extractOutputText(responseBody);
            const research = readRecord(parseJson<unknown>(outputText));
            if (!research) return errorJson(req, 502, 'invalid_ai_response', 'Manufacturer research returned an unreadable result.');

            const webSources = extractWebSources(responseBody);
            const normalized = input.mode === 'ai_catalog_builder'
                ? normalizeAiResearch(research, webSources)
                : normalizeResearch(research, input, webSources);
            if (input.mode === 'legacy' && (!('category' in normalized) || !normalized.category || !normalized.brand || !normalized.model_number)) {
                return errorJson(req, 422, 'incomplete_research', 'Manufacturer research could not verify a complete product identity. Try a more exact model or part number.');
            }

            return json(req, {
                ok: true,
                message: input.mode === 'ai_catalog_builder'
                    ? 'AI catalog research is ready as an editable draft.'
                    : 'Manufacturer research is ready for review.',
                model: input.mode === 'ai_catalog_builder' ? CATALOG_AI_BUILDER_DEFAULT_MODEL : env.model,
                usage: responseUsage(responseBody),
                research: normalized,
            });
        } catch (error) {
            if (error instanceof RequestError) return errorJson(req, error.status, error.code, error.message);
            const message = error instanceof Error ? error.message : '';
            return errorJson(req, 500, 'unexpected_error', message || 'Manufacturer research is temporarily unavailable.');
        }
    },
};

function loadEnv(): FunctionEnv {
    return {
        supabaseUrl: normalizeUrl(requiredEnv('SUPABASE_URL')),
        publishableKey: publishableKey(),
        openAiApiKey: Deno.env.get('OPENAI_API_KEY') || '',
        model: Deno.env.get('CATALOG_RESEARCH_MODEL') || CATALOG_RESEARCH_DEFAULT_MODEL,
    };
}

function readCatalogResearchRequest(body: Record<string, unknown>): CatalogResearchRequest {
    const mode = readString(body.mode) === 'ai_catalog_builder' ? 'ai_catalog_builder' : 'legacy';
    const companyId = readString(body.company_id) || null;
    const category = limitedText(body.category);
    const brand = limitedText(body.manufacturer) || limitedText(body.brand);
    const model = limitedText(body.model_number) || limitedText(body.model);
    const manufacturerPartNumber = limitedText(body.manufacturer_part_number);

    if (companyId && !UUID_PATTERN.test(companyId)) throw new RequestError(400, 'invalid_company', 'A valid company is required.');
    const prompt = limitedText(body.prompt, 4_000);
    const productName = limitedText(body.product_name);
    const productUrl = safeUrl(body.product_url);
    if (mode === 'legacy') {
        if (!category) throw new RequestError(400, 'missing_category', 'Choose the plumbing product category before researching.');
        if (!brand) throw new RequestError(400, 'missing_brand', 'Enter the manufacturer or brand before researching.');
        if (!model && !manufacturerPartNumber) throw new RequestError(400, 'missing_model', 'Enter an exact model or manufacturer part number before researching.');
    } else if (!prompt && !brand && !productName && !model && !manufacturerPartNumber && !productUrl) {
        throw new RequestError(400, 'missing_description', 'Describe the catalog item or enter at least one known product detail.');
    }

    return {
        mode,
        companyId,
        trade: limitedText(body.trade) || 'plumbing',
        prompt,
        productName,
        primaryItemType: limitedText(body.primary_item_type),
        subtype: limitedText(body.subtype),
        area: limitedText(body.area),
        system: limitedText(body.system),
        knownSpecifications: limitedText(body.known_specifications, 4_000),
        dimensions: limitedText(body.dimensions),
        productUrl,
        category,
        brand,
        model: model || manufacturerPartNumber,
        manufacturerPartNumber,
        notes: limitedText(body.notes),
    };
}

function catalogResearchSchema() {
    const sourcedValue = {
        type: 'object',
        additionalProperties: false,
        required: ['value', 'source_url'],
        properties: { value: { type: 'string' }, source_url: { type: 'string' } },
    };

    return {
        type: 'object',
        additionalProperties: false,
        required: [
            'product_name', 'category', 'manufacturer', 'brand', 'family_name', 'model_number',
            'manufacturer_part_number', 'sku', 'description', 'specifications', 'compatible_applications',
            'installation_requirements', 'manufacturer_warranty', 'manufacturer_reference', 'sources',
            'confidence', 'exact_model_match', 'warnings',
        ],
        properties: {
            product_name: { type: 'string' },
            category: { type: 'string' },
            manufacturer: { type: 'string' },
            brand: { type: 'string' },
            family_name: { type: 'string' },
            model_number: { type: 'string' },
            manufacturer_part_number: { type: 'string' },
            sku: { type: 'string' },
            description: { type: 'string' },
            specifications: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['key', 'value', 'source_url'],
                    properties: { key: { type: 'string' }, value: { type: 'string' }, source_url: { type: 'string' } },
                },
            },
            compatible_applications: { type: 'array', items: sourcedValue },
            installation_requirements: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['value', 'source_url', 'requirement_type'],
                    properties: {
                        value: { type: 'string' },
                        source_url: { type: 'string' },
                        requirement_type: { type: 'string', enum: ['manufacturer', 'code_verification', 'site_verification'] },
                    },
                },
            },
            manufacturer_warranty: { type: 'string' },
            manufacturer_reference: { type: 'string' },
            sources: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['title', 'url', 'source_type'],
                    properties: {
                        title: { type: 'string' },
                        url: { type: 'string' },
                        source_type: {
                            type: 'string',
                            enum: ['manufacturer_product', 'manufacturer_manual', 'manufacturer_warranty', 'manufacturer_support', 'distributor', 'other'],
                        },
                    },
                },
            },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            exact_model_match: { type: 'boolean' },
            warnings: { type: 'array', items: { type: 'string' } },
        },
    };
}

function catalogAiResearchSchema() {
    const provenance = {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'source_urls', 'note'],
        properties: {
            kind: { type: 'string', enum: ['verified', 'ai_inferred', 'unverified'] },
            source_urls: { type: 'array', items: { type: 'string' }, maxItems: 4 },
            note: { type: 'string' },
        },
    };
    return {
        type: 'object',
        additionalProperties: false,
        required: [
            'product_name', 'manufacturer', 'brand', 'family_name', 'model_number',
            'manufacturer_part_number', 'upc_gtin', 'primary_item_type', 'subtype',
            'category', 'system', 'short_description', 'detailed_description', 'tags',
            'fields', 'placements', 'sources', 'candidate_images', 'confidence',
            'exact_model_match', 'warnings',
        ],
        properties: {
            product_name: { type: 'string' },
            manufacturer: { type: 'string' },
            brand: { type: 'string' },
            family_name: { type: 'string' },
            model_number: { type: 'string' },
            manufacturer_part_number: { type: 'string' },
            upc_gtin: { type: 'string' },
            primary_item_type: {
                type: 'string',
                enum: ['Fixture', 'Equipment', 'Built-In / Assembly', 'Basin / Receptacle', 'Component'],
            },
            subtype: { type: 'string' },
            category: { type: 'string' },
            system: { type: 'string' },
            short_description: { type: 'string' },
            detailed_description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' }, maxItems: 30 },
            fields: {
                type: 'array',
                maxItems: 80,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['key', 'label', 'value', 'provenance'],
                    properties: {
                        key: { type: 'string' },
                        label: { type: 'string' },
                        value: { type: 'string' },
                        provenance,
                    },
                },
            },
            placements: {
                type: 'array',
                maxItems: 20,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['system_key', 'area_key', 'parent_subtype', 'path', 'reason'],
                    properties: {
                        system_key: { type: 'string' },
                        area_key: { type: 'string' },
                        parent_subtype: { type: 'string' },
                        path: { type: 'array', items: { type: 'string' }, maxItems: 8 },
                        reason: { type: 'string' },
                    },
                },
            },
            sources: {
                type: 'array',
                maxItems: 4,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['title', 'url', 'source_type'],
                    properties: {
                        title: { type: 'string' },
                        url: { type: 'string' },
                        source_type: {
                            type: 'string',
                            enum: ['manufacturer_product', 'installation_manual', 'owner_manual', 'specification_sheet', 'warranty_document'],
                        },
                    },
                },
            },
            candidate_images: {
                type: 'array',
                maxItems: 12,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['image_url', 'source_url', 'title', 'alt_text', 'confidence'],
                    properties: {
                        image_url: { type: 'string' },
                        source_url: { type: 'string' },
                        title: { type: 'string' },
                        alt_text: { type: 'string' },
                        confidence: { type: 'number', minimum: 0, maximum: 1 },
                    },
                },
            },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            exact_model_match: { type: 'boolean' },
            warnings: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        },
    };
}

function normalizeAiResearch(
    value: Record<string, unknown>,
    webSources: { title: string; url: string; source_type: string }[],
) {
    const citedUrls = new Set(webSources.map((source) => canonicalUrl(source.url)));
    const sourceTypes = new Set<string>();
    const sourceUrls = new Set<string>();
    const sources = readArray(value.sources).map((source) => {
        const item = readRecord(source);
        const url = safeUrl(item?.url);
        const sourceType = readAiSourceType(item?.source_type);
        return { title: limitedOutput(item?.title, 240) || url, url, source_type: sourceType };
    }).filter((source) => {
        if (!source.url || !source.source_type) return false;
        const normalizedUrl = canonicalUrl(source.url);
        if (sourceUrls.has(normalizedUrl) || sourceTypes.has(source.source_type)) return false;
        // Preserve structured official sources and the included web-search evidence.
        // The retained source set is always explicit and never copied from raw search results.
        if (citedUrls.size > 0 && !citedUrls.has(normalizedUrl)) return false;
        sourceUrls.add(normalizedUrl);
        sourceTypes.add(source.source_type);
        return true;
    }).slice(0, 4);
    const retainedUrls = new Set(sources.map((source) => canonicalUrl(source.url)));
    const fields = uniqueBy(readArray(value.fields).map((field) => {
        const item = readRecord(field);
        const provenance = readRecord(item?.provenance);
        const urls = uniqueBy(
            readArray(provenance?.source_urls).map(safeUrl).filter((url) => retainedUrls.has(canonicalUrl(url))),
            canonicalUrl,
        ).slice(0, 4);
        const requestedKind = readString(provenance?.kind);
        return {
            key: toSnakeCase(limitedOutput(item?.key, 120)),
            label: limitedOutput(item?.label, 160),
            value: limitedOutput(item?.value, 2_000),
            provenance: {
                kind: requestedKind === 'ai_inferred' ? 'ai_inferred' : urls.length ? 'verified' : 'unverified',
                source_urls: urls,
                note: limitedOutput(provenance?.note, 500),
            },
        };
    }).filter((field) => field.key && field.value), (field) => field.key).slice(0, 80);
    const placements = uniqueBy(readArray(value.placements).map((placement) => {
        const item = readRecord(placement);
        return {
            system_key: limitedOutput(item?.system_key, 120),
            area_key: limitedOutput(item?.area_key, 120),
            parent_subtype: limitedOutput(item?.parent_subtype, 160),
            path: uniqueStrings(item?.path, 8).map((part) => part.slice(0, 120)),
            reason: limitedOutput(item?.reason, 500),
        };
    }).filter((placement) => placement.system_key || placement.area_key || placement.parent_subtype || placement.path.length),
    (placement) => [placement.system_key, placement.area_key, placement.parent_subtype, ...placement.path].join('\u0000').toLowerCase()).slice(0, 20);
    const candidateImages = uniqueBy(readArray(value.candidate_images).map((candidate) => {
        const item = readRecord(candidate);
        const imageUrl = safeUrl(item?.image_url);
        const sourceUrl = safeUrl(item?.source_url);
        const confidenceValue = Number(item?.confidence);
        return {
            image_url: imageUrl,
            source_url: sourceUrl,
            title: limitedOutput(item?.title, 240),
            alt_text: limitedOutput(item?.alt_text, 500),
            confidence: Number.isFinite(confidenceValue) ? Math.max(0, Math.min(1, confidenceValue)) : 0,
            selected: false,
            primary: false,
        };
    }).filter((candidate) => candidate.image_url && retainedUrls.has(canonicalUrl(candidate.source_url))),
    (candidate) => canonicalUrl(candidate.image_url)).slice(0, 12);
    const primaryType = readPrimaryItemType(value.primary_item_type);
    const warnings = uniqueStrings(value.warnings, 20);
    if (!limitedOutput(value.model_number, 240)) warnings.unshift('The model number was not verified and remains blank.');
    return {
        product_name: limitedOutput(value.product_name, 240),
        manufacturer: limitedOutput(value.manufacturer, 240),
        brand: limitedOutput(value.brand, 240),
        family_name: limitedOutput(value.family_name, 240),
        model_number: limitedOutput(value.model_number, 240),
        manufacturer_part_number: limitedOutput(value.manufacturer_part_number, 240),
        upc_gtin: limitedOutput(value.upc_gtin, 80),
        primary_item_type: primaryType,
        subtype: limitedOutput(value.subtype, 160),
        category: limitedOutput(value.category, 160),
        system: limitedOutput(value.system, 160),
        short_description: limitedOutput(value.short_description, 500),
        detailed_description: limitedOutput(value.detailed_description, 4_000),
        tags: uniqueStrings(value.tags, 30).map((tag) => tag.slice(0, 80)),
        fields,
        placements,
        sources,
        candidate_images: candidateImages,
        confidence: readConfidence(value.confidence),
        exact_model_match: value.exact_model_match === true,
        warnings,
    };
}

function normalizeResearch(
    value: Record<string, unknown>,
    input: CatalogResearchRequest,
    webSources: { title: string; url: string; source_type: string }[],
) {
    const structuredSources = readArray(value.sources).map((source) => {
        const item = readRecord(source);
        return {
            title: readString(item?.title),
            url: safeUrl(item?.url),
            source_type: readSourceType(item?.source_type),
        };
    }).filter((source) => source.url);
    const sources = uniqueBy([...structuredSources, ...webSources], (source) => source.url).slice(0, 20);
    const exactModelMatch = value.exact_model_match === true;
    const warnings = uniqueStrings(value.warnings, 16);
    if (!exactModelMatch && !warnings.some((warning) => warning.toLowerCase().includes('exact model'))) {
        warnings.unshift('The exact requested model was not confirmed. Review all family-level information before applying it.');
    }

    return {
        product_name: limitedOutput(value.product_name) || `${input.brand} ${input.model}`,
        category: limitedOutput(value.category) || input.category,
        manufacturer: limitedOutput(value.manufacturer) || input.brand,
        brand: limitedOutput(value.brand) || input.brand,
        family_name: limitedOutput(value.family_name),
        model_number: limitedOutput(value.model_number) || input.model,
        manufacturer_part_number: limitedOutput(value.manufacturer_part_number) || input.manufacturerPartNumber,
        sku: limitedOutput(value.sku),
        description: limitedOutput(value.description, 2_000),
        specifications: uniqueBy(readArray(value.specifications).map(readSourcedSpecification).filter(isPresent), (item) => `${item.key}\u0000${item.value}`).slice(0, 40),
        compatible_applications: uniqueBy(readArray(value.compatible_applications).map(readSourcedValue).filter(isPresent), (item) => item.value).slice(0, 40),
        installation_requirements: uniqueBy(readArray(value.installation_requirements).map(readInstallationRequirement).filter(isPresent), (item) => item.value).slice(0, 40),
        manufacturer_warranty: limitedOutput(value.manufacturer_warranty, 2_000),
        manufacturer_reference: safeUrl(value.manufacturer_reference) || sources.find((source) => source.source_type.startsWith('manufacturer_'))?.url || '',
        sources,
        confidence: readConfidence(value.confidence),
        exact_model_match: exactModelMatch,
        warnings,
    };
}

function readSourcedSpecification(value: unknown): { key: string; value: string; source_url: string } | null {
    const item = readRecord(value);
    const key = limitedOutput(item?.key, 120);
    const specification = limitedOutput(item?.value);
    if (!key || !specification) return null;
    return { key, value: specification, source_url: safeUrl(item?.source_url) };
}

function readSourcedValue(value: unknown): { value: string; source_url: string } | null {
    const item = readRecord(value);
    const text = limitedOutput(item?.value, 500);
    return text ? { value: text, source_url: safeUrl(item?.source_url) } : null;
}

function readInstallationRequirement(value: unknown): { value: string; source_url: string; requirement_type: string } | null {
    const item = readRecord(value);
    const text = limitedOutput(item?.value, 500);
    if (!text) return null;
    const type = readString(item?.requirement_type);
    return {
        value: text,
        source_url: safeUrl(item?.source_url),
        requirement_type: type === 'code_verification' || type === 'site_verification' ? type : 'manufacturer',
    };
}

function extractWebSources(body: Record<string, unknown> | null) {
    const sources: { title: string; url: string; source_type: string }[] = [];
    for (const outputItem of readArray(body?.output)) {
        const output = readRecord(outputItem);
        const action = readRecord(output?.action);
        for (const sourceItem of readArray(action?.sources)) {
            const source = readRecord(sourceItem);
            const url = safeUrl(source?.url);
            if (url) sources.push({ title: readString(source?.title) || url, url, source_type: 'other' });
        }
        for (const contentItem of readArray(output?.content)) {
            const content = readRecord(contentItem);
            for (const annotationItem of readArray(content?.annotations)) {
                const annotation = readRecord(annotationItem);
                const url = safeUrl(annotation?.url);
                if (url) sources.push({ title: readString(annotation?.title) || url, url, source_type: 'other' });
            }
        }
    }
    return uniqueBy(sources, (source) => source.url).slice(0, 20);
}

function extractOutputText(body: Record<string, unknown> | null) {
    const direct = readString(body?.output_text);
    if (direct) return direct;
    for (const outputItem of readArray(body?.output)) {
        const output = readRecord(outputItem);
        for (const contentItem of readArray(output?.content)) {
            const text = readString(readRecord(contentItem)?.text);
            if (text) return text;
        }
    }
    return '';
}

function responseUsage(body: Record<string, unknown> | null) {
    const usage = readRecord(body?.usage);
    return {
        input_tokens: readNonNegativeInteger(usage?.input_tokens),
        output_tokens: readNonNegativeInteger(usage?.output_tokens),
        total_tokens: readNonNegativeInteger(usage?.total_tokens),
        web_search_calls: readArray(body?.output).filter((item) => readString(readRecord(item)?.type) === 'web_search_call').length,
        max_output_tokens: MAX_OUTPUT_TOKENS,
    };
}

function readNonNegativeInteger(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

async function loadAuthUserId(env: FunctionEnv, token: string) {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: env.publishableKey, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return '';
    return readString(readRecord(parseJson<unknown>(await response.text()))?.id);
}

async function invokeBooleanRpc(env: FunctionEnv, token: string, name: string, payload: Record<string, unknown>) {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: restHeaders(env, token),
        body: JSON.stringify(payload),
    });
    if (!response.ok) return false;
    return parseJson<unknown>(await response.text()) === true;
}

function restHeaders(env: FunctionEnv, token: string) {
    return {
        apikey: env.publishableKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client-Info': 'barbarosa-catalog-research-edge',
    };
}

async function readJsonBody(req: Request) {
    try {
        const body = await req.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        return body as Record<string, unknown>;
    } catch {
        throw new RequestError(400, 'invalid_request', 'Invalid manufacturer research request.');
    }
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
    });
}

function errorJson(req: Request, status: number, code: string, message: string) {
    return json(req, { ok: false, code, message }, status);
}

function corsHeaders(req: Request) {
    return {
        'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        Vary: 'Origin',
    };
}

function requiredEnv(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new RequestError(500, 'missing_configuration', 'Manufacturer research is not configured.');
    return value;
}

function publishableKey() {
    const direct = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
    if (direct) return direct;
    const configured = parseJson<unknown>(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '');
    if (Array.isArray(configured)) {
        const first = configured.map((entry) => readString(readRecord(entry)?.value || entry)).find(Boolean);
        if (first) return first;
    }
    if (configured && typeof configured === 'object') {
        const first = Object.values(configured).map(readString).find(Boolean);
        if (first) return first;
    }
    throw new RequestError(500, 'missing_configuration', 'Manufacturer research is not configured.');
}

function bearerToken(req: Request) {
    return /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') || '')?.[1]?.trim() || '';
}

function normalizeUrl(value: string) {
    return value.endsWith('/') ? value.slice(0, -1) : value;
}

function limitedText(value: unknown, limit = MAX_INPUT_LENGTH) {
    return readString(value).slice(0, limit);
}

function limitedOutput(value: unknown, limit = 500) {
    return readString(value).replace(/\s+/g, ' ').slice(0, limit);
}

function safeUrl(value: unknown) {
    const candidate = readString(value).slice(0, 2_000);
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

function readConfidence(value: unknown) {
    const confidence = readString(value).toLowerCase();
    return confidence === 'high' || confidence === 'medium' ? confidence : 'low';
}

function readSourceType(value: unknown) {
    const type = readString(value);
    return ['manufacturer_product', 'manufacturer_manual', 'manufacturer_warranty', 'manufacturer_support', 'distributor'].includes(type)
        ? type
        : 'other';
}

function readAiSourceType(value: unknown) {
    const type = readString(value);
    return ['manufacturer_product', 'installation_manual', 'owner_manual', 'specification_sheet', 'warranty_document'].includes(type)
        ? type
        : '';
}

function readPrimaryItemType(value: unknown) {
    const type = readString(value);
    return ['Fixture', 'Equipment', 'Built-In / Assembly', 'Basin / Receptacle', 'Component'].includes(type)
        ? type
        : '';
}

function toSnakeCase(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function uniqueStrings(value: unknown, limit: number) {
    return uniqueBy(readArray(value).map((item) => limitedOutput(item, 500)).filter(Boolean), (item) => item.toLowerCase()).slice(0, limit);
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
    const seen = new Set<string>();
    return values.filter((value) => {
        const normalized = key(value);
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}

function isPresent<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}

function readString(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function readArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseRecord(value: string) {
    return readRecord(parseJson<unknown>(value));
}

function parseJson<T>(value: string): T | null {
    try { return JSON.parse(value) as T; }
    catch { return null; }
}

class RequestError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
    }
}
