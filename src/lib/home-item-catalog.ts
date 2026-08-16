import { supabase } from './supabase';
import type { EstimateOptionCategory } from './estimateOptions';
import type { EstimateSessionSource } from './estimateSessionContract';

export * from './home-item-catalog-core';

export type HomeItemCatalogProposal = {
    id: string;
    estimateSessionId: string;
    quoteNumber: string;
    companyCatalogProductId: string;
    productVariantId: string;
    productName: string;
    category: string;
    brand: string;
    model: string;
    primaryImageUrl: string;
    status: 'proposed' | 'published';
    createdAt: string;
    publishedAt: string | null;
};

export type HomeItemCatalogQuoteResult = {
    proposal: HomeItemCatalogProposal;
    estimateOptionId: string;
};

export type HomeItemCatalogRouteContext = {
    companyId: string;
    propertyId: string;
    homeItemId: string;
    serviceRequestId?: string | null;
    scheduleSlotId?: string | null;
    jobId?: string | null;
};

export async function loadHomeItemCatalogProposals(context: HomeItemCatalogRouteContext) {
    const { data, error } = await supabase.rpc('get_home_item_catalog_proposals', {
        p_company_id: context.companyId,
        p_property_id: context.propertyId,
        p_home_item_id: context.homeItemId,
        p_service_request_id: context.serviceRequestId || null,
        p_schedule_slot_id: context.scheduleSlotId || null,
        p_job_id: context.jobId || null,
    });
    if (error) throw error;

    return array(data)
        .map(parseProposal)
        .filter((proposal): proposal is HomeItemCatalogProposal => Boolean(proposal));
}

export async function addHomeItemCatalogProductToQuote(input: HomeItemCatalogRouteContext & {
    productVariantId: string;
    estimateCategory: EstimateOptionCategory;
    source: EstimateSessionSource;
}) {
    const { data, error } = await supabase.rpc('add_home_item_catalog_product_to_quote', {
        p_company_id: input.companyId,
        p_property_id: input.propertyId,
        p_home_item_id: input.homeItemId,
        p_product_variant_id: input.productVariantId,
        p_service_request_id: input.serviceRequestId || null,
        p_schedule_slot_id: input.scheduleSlotId || null,
        p_job_id: input.jobId || null,
        p_estimate_category: input.estimateCategory,
        p_source: input.source,
    });
    if (error) throw error;

    const row = record(data);
    const proposal = parseProposal(row.proposal);
    const estimateOptionId = text(row.estimate_option_id);
    if (!proposal || !estimateOptionId) throw new Error('The catalog product was not added to the quote.');

    return { proposal, estimateOptionId } satisfies HomeItemCatalogQuoteResult;
}

function parseProposal(value: unknown): HomeItemCatalogProposal | null {
    const row = record(value);
    const id = text(row.id);
    const estimateSessionId = text(row.estimate_session_id);
    const companyCatalogProductId = text(row.company_catalog_product_id);
    if (!id || !estimateSessionId || !companyCatalogProductId) return null;

    return {
        id,
        estimateSessionId,
        quoteNumber: text(row.quote_number),
        companyCatalogProductId,
        productVariantId: text(row.product_variant_id),
        productName: text(row.product_name) || [text(row.brand), text(row.model)].filter(Boolean).join(' ') || 'Catalog product',
        category: text(row.category),
        brand: text(row.brand),
        model: text(row.model),
        primaryImageUrl: text(row.primary_image_url),
        status: row.status === 'published' ? 'published' : 'proposed',
        createdAt: text(row.created_at),
        publishedAt: nullableText(row.published_at),
    };
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function array(value: unknown) { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }
function nullableText(value: unknown) { return text(value) || null; }
