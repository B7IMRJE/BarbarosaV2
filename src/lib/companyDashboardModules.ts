import type { CompanyPermissionSet } from './companyPermissions';

export const COMPANY_DASHBOARD_MODULES = [
    'Company Profile / Identity',
    'Visual Control Center',
    'Customers / Clients',
    'Leads / Requests',
    'Opportunities',
    'Estimates / Proposals',
    'Jobs / Dispatch',
    'Team / Technicians',
    'Activity / Audit Log',
    'Catalog',
    'Price Book',
    'Knowledge Engine',
    'Contracts & Legal Documents',
    'Settings / Permissions',
] as const;

export type CompanyDashboardModule = (typeof COMPANY_DASHBOARD_MODULES)[number];

export function canViewCompanyDashboardModule(
    card: CompanyDashboardModule,
    permissions: CompanyPermissionSet | null
) {
    if (!permissions) return false;

    if (card === 'Company Profile / Identity') return permissions.can_manage_company_profile;
    if (card === 'Visual Control Center') return false;
    if (card === 'Customers / Clients') return permissions.can_view_customers;
    if (card === 'Leads / Requests' || card === 'Opportunities') {
        return permissions.can_view_customers && permissions.can_view_jobs;
    }
    if (card === 'Estimates / Proposals') return permissions.can_create_estimates;
    if (card === 'Jobs / Dispatch') return permissions.can_view_jobs;
    if (card === 'Team / Technicians') {
        return permissions.can_manage_company_users || permissions.can_view_jobs;
    }
    if (card === 'Activity / Audit Log') return permissions.can_manage_company_users;
    if (card === 'Catalog' || card === 'Price Book') {
        return permissions.can_view_techos || permissions.can_manage_price_book;
    }
    if (card === 'Knowledge Engine') return permissions.can_view_jobs;
    if (card === 'Contracts & Legal Documents') return permissions.can_manage_company_profile;
    if (card === 'Settings / Permissions') {
        return permissions.can_manage_company_users || permissions.can_manage_company_profile;
    }

    return false;
}

export function getVisibleCompanyDashboardModules(input: {
    isPlatformAdmin: boolean;
    permissions: CompanyPermissionSet | null;
}) {
    if (input.isPlatformAdmin) return [...COMPANY_DASHBOARD_MODULES];
    return COMPANY_DASHBOARD_MODULES.filter((card) => (
        canViewCompanyDashboardModule(card, input.permissions)
    ));
}
