import { supabase } from './supabase';
import {
    parseCompanyCatalogEntitlement,
    validateCompanyCatalogEntitlementDraft,
    type CompanyCatalogEntitlementDraft,
} from './companyCatalogEntitlementCore';

export * from './companyCatalogEntitlementCore';

export async function loadCompanyCatalogEntitlement(companyId: string) {
    const normalizedCompanyId = companyId.trim();
    if (!normalizedCompanyId) throw new Error('A company is required to load catalog access.');

    const { data, error } = await supabase.rpc('get_company_catalog_entitlement', {
        p_company_id: normalizedCompanyId,
    });
    if (error) throw error;

    const entitlement = parseCompanyCatalogEntitlement(data);
    if (!entitlement) throw new Error('Catalog access returned an invalid response.');
    return entitlement;
}

export async function saveCompanyCatalogEntitlement(
    companyId: string,
    draft: CompanyCatalogEntitlementDraft,
) {
    const normalizedCompanyId = companyId.trim();
    if (!normalizedCompanyId) throw new Error('A company is required to save catalog access.');

    const validationMessage = validateCompanyCatalogEntitlementDraft(draft);
    if (validationMessage) throw new Error(validationMessage);

    const { data, error } = await supabase.rpc('save_company_catalog_entitlement', {
        p_company_id: normalizedCompanyId,
        p_active: draft.active,
        p_package_tier: draft.packageTier,
        p_selected_variant_ids: Array.from(new Set(draft.selectedVariantIds.map((id) => id.trim()).filter(Boolean))),
    });
    if (error) throw error;

    const entitlement = parseCompanyCatalogEntitlement(data);
    if (!entitlement) throw new Error('Catalog access saved, but its response was invalid.');
    return entitlement;
}
