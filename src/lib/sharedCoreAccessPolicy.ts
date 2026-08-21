export type SharedCoreRole =
    | 'owner'
    | 'admin'
    | 'manager'
    | 'supervisor'
    | 'office'
    | 'dispatcher'
    | 'sales'
    | 'technician'
    | 'provider';

const INTERNAL_COMPANY_WIDE_ROLES = new Set<SharedCoreRole>([
    'owner',
    'admin',
    'manager',
    'supervisor',
    'office',
    'dispatcher',
]);

export function isSharedCoreCompanyWideRole(role: string | null | undefined) {
    return INTERNAL_COMPANY_WIDE_ROLES.has(String(role || '').trim().toLowerCase() as SharedCoreRole);
}

export function isSharedCoreExplicitAssignmentRole(role: string | null | undefined) {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized === 'technician' || normalized === 'provider';
}

export function canSharedCoreRoleManageCompany(role: string | null | undefined) {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized === 'owner' || normalized === 'admin';
}
