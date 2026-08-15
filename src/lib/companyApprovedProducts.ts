import type { EstimateApprovedProduct } from './estimateOptions';
import { mapApprovedProductRecord } from './company-approved-products-core';
import { supabase } from './supabase';

export { mapApprovedProductRecord } from './company-approved-products-core';

export async function loadCompanyApprovedProducts(companyId: string): Promise<EstimateApprovedProduct[]> {
    const { data, error } = await supabase.rpc('get_company_approved_products', {
        p_company_id: companyId,
    });

    if (error) throw error;

    return Array.isArray(data)
        ? data.map(mapApprovedProductRecord).filter((product): product is EstimateApprovedProduct => Boolean(product))
        : [];
}

export async function createCompanyApprovedProductCardImageUrl(product: EstimateApprovedProduct) {
    if (product.mainMedia?.active && product.mainMedia.bucket && product.mainMedia.storagePath) {
        const { data, error } = await supabase.storage
            .from(product.mainMedia.bucket)
            .createSignedUrl(product.mainMedia.storagePath, 60 * 30);

        if (!error && data.signedUrl) return data.signedUrl;
    }

    return product.masterPrimaryImageUrl?.trim() || null;
}
