export function companyCatalogPricingRoute(companyId: string, productVariantId: string) {
    const normalizedCompanyId = companyId.trim();
    const normalizedVariantId = productVariantId.trim();

    if (!normalizedCompanyId || !normalizedVariantId) {
        throw new Error('Company and catalog product are required to open company pricing.');
    }

    return {
        pathname: `/super-admin/company/${encodeURIComponent(normalizedCompanyId)}/catalog`,
        params: { productVariantId: normalizedVariantId },
    };
}
