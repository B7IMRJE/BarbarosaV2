import { supabase } from './supabase';

export type CatalogCardCodeMaps = {
    starterTemplates: ReadonlyMap<string, string>;
    productVariants: ReadonlyMap<string, string>;
};

export async function loadCatalogCardCodeMaps(): Promise<CatalogCardCodeMaps> {
    const { data, error } = await supabase.rpc('get_catalog_card_short_codes');
    if (error) throw error;

    const starterTemplates = new Map<string, string>();
    const productVariants = new Map<string, string>();
    for (const value of array(data)) {
        const row = record(value);
        const kind = text(row.entity_kind);
        const key = text(row.entity_key);
        const code = text(row.short_code).toUpperCase();
        if (!key || !/^[A-Z][0-9]{2}$/.test(code)) continue;
        if (kind === 'starter_template') starterTemplates.set(key, code);
        if (kind === 'product_variant') productVariants.set(key, code);
    }

    return { starterTemplates, productVariants };
}

export async function loadVisibleCatalogProductShortCodes(variantIds: readonly string[]) {
    if (!variantIds.length) return [];
    const { data, error } = await supabase.rpc('get_visible_catalog_product_short_codes', {
        p_variant_ids: [...variantIds],
    });
    if (error) throw error;
    return array(data).map((value) => {
        const code = text(value).toUpperCase();
        return /^[A-Z][0-9]{2}$/.test(code) ? code : '';
    });
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function array(value: unknown) { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }
