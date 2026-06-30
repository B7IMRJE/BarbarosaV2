export type CompanyPermissionKey =
    | 'can_view_techos'
    | 'can_create_estimates'
    | 'can_add_item_to_estimate'
    | 'can_view_customers'
    | 'can_view_jobs';

export type CompanyPermissionSet = Record<CompanyPermissionKey, boolean>;

export type CompanyAccessSubject = {
    role?: string | null;
    status?: string | null;
    permissions?: Partial<CompanyPermissionSet> | null;
};

export const COMPANY_PERMISSION_LABELS: Record<CompanyPermissionKey, string> = {
    can_view_techos: 'View TechOS',
    can_create_estimates: 'Create estimates',
    can_add_item_to_estimate: 'Add items to estimates',
    can_view_customers: 'View customers',
    can_view_jobs: 'View jobs',
};

const EMPTY_PERMISSIONS: CompanyPermissionSet = {
    can_view_techos: false,
    can_create_estimates: false,
    can_add_item_to_estimate: false,
    can_view_customers: false,
    can_view_jobs: false,
};

const TECHNICIAN_PERMISSIONS: CompanyPermissionSet = {
    can_view_techos: true,
    can_create_estimates: false,
    can_add_item_to_estimate: false,
    can_view_customers: false,
    can_view_jobs: true,
};

const MANAGER_PERMISSIONS: CompanyPermissionSet = {
    can_view_techos: true,
    can_create_estimates: true,
    can_add_item_to_estimate: true,
    can_view_customers: true,
    can_view_jobs: true,
};

const ADMIN_PERMISSIONS: CompanyPermissionSet = {
    can_view_techos: true,
    can_create_estimates: true,
    can_add_item_to_estimate: true,
    can_view_customers: true,
    can_view_jobs: true,
};

export function normalizeCompanyRole(role?: string | null) {
    const normalizedRole = String(role || '').trim().toLowerCase();

    if (normalizedRole === 'tech') return 'technician';
    return normalizedRole;
}

export function normalizeCompanyStatus(status?: string | null) {
    return String(status || '').trim().toLowerCase();
}

export function isActiveCompanyStatus(status?: string | null) {
    return normalizeCompanyStatus(status) === 'active';
}

export function isTechnicianCompanyRole(role?: string | null) {
    return normalizeCompanyRole(role) === 'technician';
}

export function getRoleDefaultPermissions(role?: string | null): CompanyPermissionSet {
    const normalizedRole = normalizeCompanyRole(role);

    if (normalizedRole === 'technician') return { ...TECHNICIAN_PERMISSIONS };
    if (normalizedRole === 'manager') return { ...MANAGER_PERMISSIONS };
    if (normalizedRole === 'admin' || normalizedRole === 'owner') return { ...ADMIN_PERMISSIONS };

    return { ...EMPTY_PERMISSIONS };
}

export function resolveCompanyPermissions(subject: CompanyAccessSubject): CompanyPermissionSet {
    if (!isActiveCompanyStatus(subject.status)) {
        return { ...EMPTY_PERMISSIONS };
    }

    return {
        ...getRoleDefaultPermissions(subject.role),
        ...sanitizePermissionOverrides(subject.permissions),
    };
}

export function hasCompanyPermission(
    subject: CompanyAccessSubject,
    permission: CompanyPermissionKey
) {
    return resolveCompanyPermissions(subject)[permission];
}

export function canAccessTechOS(subject: CompanyAccessSubject) {
    return hasCompanyPermission(subject, 'can_view_techos');
}

function sanitizePermissionOverrides(
    permissions?: Partial<CompanyPermissionSet> | null
): Partial<CompanyPermissionSet> {
    if (!permissions) return {};

    const sanitized: Partial<CompanyPermissionSet> = {};
    const permissionKeys = Object.keys(EMPTY_PERMISSIONS) as CompanyPermissionKey[];

    permissionKeys.forEach((permissionKey) => {
        const value = permissions[permissionKey];

        if (typeof value === 'boolean') {
            sanitized[permissionKey] = value;
        }
    });

    return sanitized;
}
