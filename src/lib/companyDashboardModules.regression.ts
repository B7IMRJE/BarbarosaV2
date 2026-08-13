import type { CompanyPermissionSet } from './companyPermissions';
import {
    COMPANY_DASHBOARD_MODULES,
    getVisibleCompanyDashboardModules,
} from './companyDashboardModules';

runCompanyDashboardModuleRegressions();

function runCompanyDashboardModuleRegressions() {
    const dispatcherModules = getVisibleCompanyDashboardModules({
        isPlatformAdmin: false,
        permissions: permissionSet({
            can_view_techos: true,
            can_view_customers: true,
            can_view_jobs: true,
        }),
    });

    assert(dispatcherModules.includes('Jobs / Dispatch'), 'Dispatch should see Jobs / Dispatch.');
    assert(dispatcherModules.includes('Operations Rooms'), 'Dispatch should see the live Operations Rooms.');
    assert(dispatcherModules.includes('Team / Technicians'), 'Dispatch should see the operational team directory.');
    assert(dispatcherModules.includes('Customers / Clients'), 'Dispatch should see customers and clients.');
    assert(dispatcherModules.includes('Catalog'), 'Dispatch should retain approved catalog access.');
    assert(!dispatcherModules.includes('Company Profile / Identity'), 'Dispatch should not see company identity controls.');
    assert(!dispatcherModules.includes('Visual Control Center'), 'Dispatch should not see platform visual controls.');
    assert(!dispatcherModules.includes('Activity / Audit Log'), 'Dispatch should not see management audit tools.');
    assert(!dispatcherModules.includes('Settings / Permissions'), 'Dispatch should not see permission settings.');

    const unloadedModules = getVisibleCompanyDashboardModules({
        isPlatformAdmin: false,
        permissions: null,
    });
    assert(unloadedModules.length === 0, 'Restricted modules should not flash while permissions load.');

    const platformModules = getVisibleCompanyDashboardModules({
        isPlatformAdmin: true,
        permissions: null,
    });
    assert(
        platformModules.length === COMPANY_DASHBOARD_MODULES.length,
        'Platform administrators should retain every company dashboard module.'
    );
}

function permissionSet(overrides: Partial<CompanyPermissionSet>): CompanyPermissionSet {
    return {
        can_view_techos: false,
        can_create_estimates: false,
        can_add_item_to_estimate: false,
        can_manage_price_book: false,
        can_view_customers: false,
        can_view_jobs: false,
        can_manage_company_users: false,
        can_manage_company_profile: false,
        ...overrides,
    };
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}
