import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import {
    readCatalogAiResearchResponse,
    type CatalogAiBuilderInput,
    type CatalogAiDraftPayload,
    type CatalogAiResearchResult,
} from './catalogAiBuilderCore';

export type CatalogAiBuilderConfig = {
    primaryItemTypes: string[];
    templates: {
        id: string;
        templateKey: string;
        categoryName: string;
        primaryItemType: string;
        subtype: string;
        universalFields: unknown[];
        specificationFields: unknown[];
        requiredFields: string[];
    }[];
};

export async function researchCatalogItemWithAi(input: CatalogAiBuilderInput): Promise<CatalogAiResearchResult> {
    const prompt = input.prompt.trim();
    const hasKnownIdentity = Boolean(input.manufacturer?.trim() || input.productName?.trim() || input.modelNumber?.trim() || input.productUrl?.trim());
    if (!prompt && !hasKnownIdentity) throw new Error('Describe the catalog item or enter at least one known product detail.');

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(sessionError.message || 'The current session could not be verified.');
    if (!session) throw new Error('Sign in again before researching a catalog item.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/research-catalog-product`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: supabaseAnonKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                mode: 'ai_catalog_builder',
                prompt,
                trade: 'plumbing',
                manufacturer: input.manufacturer?.trim() || null,
                product_name: input.productName?.trim() || null,
                model_number: input.modelNumber?.trim() || null,
                manufacturer_part_number: input.manufacturerPartNumber?.trim() || null,
                primary_item_type: input.primaryItemType || null,
                subtype: input.subtype?.trim() || null,
                area: input.area?.trim() || null,
                system: input.system?.trim() || null,
                known_specifications: input.knownSpecifications?.trim() || null,
                dimensions: input.dimensions?.trim() || null,
                product_url: input.productUrl?.trim() || null,
                notes: input.notes?.trim() || null,
            }),
            signal: controller.signal,
        });
        const body = parseJson(await response.text());
        if (!response.ok) throw new Error(readMessage(body) || `Catalog research failed (${response.status}).`);
        return readCatalogAiResearchResponse(body);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw new Error('Catalog research took too long. Check the connection and try again.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export async function loadCatalogAiBuilderConfig(): Promise<CatalogAiBuilderConfig> {
    const { data, error } = await supabase.rpc('get_catalog_ai_builder_config');
    if (error) throw error;
    const root = record(data);
    return {
        primaryItemTypes: array(root.primary_item_types).map(text).filter(Boolean),
        templates: array(root.templates).map((value) => {
            const row = record(value);
            return {
                id: text(row.id),
                templateKey: text(row.template_key),
                categoryName: text(row.category_name),
                primaryItemType: text(row.primary_item_type),
                subtype: text(row.subtype),
                universalFields: array(row.universal_fields),
                specificationFields: array(row.specification_fields),
                requiredFields: array(row.required_fields).map(text).filter(Boolean),
            };
        }).filter((template) => template.id && template.templateKey),
    };
}

export async function saveCatalogAiDraft(draftId: string | null, payload: CatalogAiDraftPayload) {
    const { data, error } = await supabase.rpc('save_catalog_ai_draft', {
        p_draft_id: draftId,
        p_payload: {
            category_template_id: payload.categoryTemplateId,
            manufacturer: payload.manufacturer,
            brand: payload.brand,
            family_name: payload.familyName,
            product_name: payload.productName,
            model_number: payload.modelNumber,
            manufacturer_part_number: payload.manufacturerPartNumber || null,
            upc_gtin: payload.upcGtin || null,
            description: payload.description || null,
            specifications: payload.specifications,
            primary_item_type: payload.primaryItemType,
            subtype: payload.subtype,
            tags: payload.tags,
            field_provenance: payload.fieldProvenance,
            placements: payload.placements.map((placement) => ({
                system_key: placement.systemKey,
                area_key: placement.areaKey,
                parent_subtype: placement.parentSubtype,
                path: placement.path,
                reason: placement.reason,
            })),
            sources: payload.sources.map((source) => ({ title: source.title, url: source.url, type: source.sourceType })),
            candidate_images: payload.candidateImages.map((image) => ({
                image_url: image.imageUrl,
                source_url: image.sourceUrl,
                title: image.title,
                alt_text: image.altText,
                confidence: image.confidence,
                selected: image.selected,
                primary: image.primary,
                copied_bucket: image.copiedBucket || null,
                copied_storage_path: image.copiedStoragePath || null,
                file_name: image.fileName || null,
                mime_type: image.mimeType || null,
                size_bytes: image.sizeBytes ?? null,
            })),
            confidence: payload.confidence,
            validation_warnings: payload.validationWarnings,
            duplicate_warnings: [],
            missing_fields: payload.missingFields,
            research_metadata: payload.researchMetadata,
        },
    });
    if (error) throw error;
    return data;
}

export async function loadCatalogAiDraft(draftId: string) {
    const { data, error } = await supabase.rpc('get_catalog_ai_draft', { p_draft_id: draftId });
    if (error) throw error;
    return data;
}

export async function reviewCatalogAiImageCandidate(input: {
    draftId: string;
    candidateId: string;
    action: 'select_primary' | 'select_supporting' | 'reject' | 'reset';
}) {
    const { data, error } = await supabase.rpc('review_catalog_ai_image_candidate', {
        p_draft_id: input.draftId,
        p_candidate_id: input.candidateId,
        p_action: input.action,
    });
    if (error) throw error;
    return data;
}

export async function approveCatalogAiDraft(draftId: string) {
    const { data, error } = await supabase.rpc('approve_catalog_ai_draft', { p_draft_id: draftId });
    if (error) throw error;
    return data;
}

function parseJson(value: string): unknown {
    try { return JSON.parse(value) as unknown; }
    catch { return null; }
}

function readMessage(value: unknown) {
    const row = record(value);
    return text(row.message);
}

function text(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
