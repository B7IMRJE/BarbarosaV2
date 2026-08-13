import { canManageCompanyCatalog, canManageCompanyCatalogPricing } from './companyCatalogAccess';

runCompanyCatalogAccessRegressions();

function runCompanyCatalogAccessRegressions() {
    assert(canManageCompanyCatalog({
        isPlatformAdmin: true,
        hasCompanyPriceBookPermission: false,
        canViewCompanyCustomers: false,
        canViewCompanyJobs: false,
    }), 'Platform administrators should manage a company catalog without a company membership row.');

    assert(canManageCompanyCatalog({
        isPlatformAdmin: false,
        hasCompanyPriceBookPermission: true,
        canViewCompanyCustomers: true,
        canViewCompanyJobs: true,
    }), 'Authorized company managers should manage their company catalog.');

    assert(canManageCompanyCatalog({
        isPlatformAdmin: false,
        hasCompanyPriceBookPermission: false,
        canViewCompanyCustomers: true,
        canViewCompanyJobs: true,
    }), 'Dispatch staff should maintain product cards without receiving Price Book control.');

    assert(!canManageCompanyCatalogPricing({
        isPlatformAdmin: false,
        hasCompanyPriceBookPermission: false,
    }), 'Dispatch catalog access should not grant company pricing control.');

    assert(!canManageCompanyCatalog({
        isPlatformAdmin: false,
        hasCompanyPriceBookPermission: false,
        canViewCompanyCustomers: false,
        canViewCompanyJobs: true,
    }), 'Unprivileged users should not manage a company catalog.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
