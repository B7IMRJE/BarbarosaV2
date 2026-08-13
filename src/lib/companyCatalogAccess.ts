export function canManageCompanyCatalog(input: {
    isPlatformAdmin: boolean;
    hasCompanyPriceBookPermission: boolean;
}) {
    return input.isPlatformAdmin || input.hasCompanyPriceBookPermission;
}
