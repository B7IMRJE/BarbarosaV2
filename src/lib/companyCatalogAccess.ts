export function canManageCompanyCatalog(input: {
    isPlatformAdmin: boolean;
    hasCompanyPriceBookPermission: boolean;
    canViewCompanyCustomers: boolean;
    canViewCompanyJobs: boolean;
}) {
    return (
        input.isPlatformAdmin ||
        input.hasCompanyPriceBookPermission ||
        (input.canViewCompanyCustomers && input.canViewCompanyJobs)
    );
}

export function canManageCompanyCatalogPricing(input: {
    isPlatformAdmin: boolean;
    hasCompanyPriceBookPermission: boolean;
}) {
    return input.isPlatformAdmin || input.hasCompanyPriceBookPermission;
}
