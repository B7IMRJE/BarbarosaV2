import { canManageCompanyCatalog } from './companyCatalogAccess';

runCompanyCatalogAccessRegressions();

function runCompanyCatalogAccessRegressions() {
    assert(canManageCompanyCatalog({
        isPlatformAdmin: true,
        hasCompanyPriceBookPermission: false,
    }), 'Platform administrators should manage a company catalog without a company membership row.');

    assert(canManageCompanyCatalog({
        isPlatformAdmin: false,
        hasCompanyPriceBookPermission: true,
    }), 'Authorized company managers should manage their company catalog.');

    assert(!canManageCompanyCatalog({
        isPlatformAdmin: false,
        hasCompanyPriceBookPermission: false,
    }), 'Unprivileged users should not manage a company catalog.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
