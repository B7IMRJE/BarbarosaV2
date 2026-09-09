export type CompanyOperationSubject = {
    role?: string | null;
    status?: string | null;
};

export const DISPATCH_COMPANY_OPERATION_ROLES = [
    'owner',
    'admin',
    'manager',
    'office',
    'dispatcher',
    'office_supervisor',
] as const;

export const COMPANY_USER_MANAGEMENT_ROLES = ['owner', 'admin', 'manager'] as const;

export function canDispatchCompanyOperationsForSubject(subject?: CompanyOperationSubject | null) {
    if (!subject || normalizeCompanyStatusValue(subject.status) !== 'active') return false;

    return DISPATCH_COMPANY_OPERATION_ROLES.includes(
        normalizeCompanyRoleValue(subject.role) as typeof DISPATCH_COMPANY_OPERATION_ROLES[number]
    );
}

export function canManageCompanyUsersForSubject(subject?: CompanyOperationSubject | null) {
    if (!subject || normalizeCompanyStatusValue(subject.status) !== 'active') return false;

    return COMPANY_USER_MANAGEMENT_ROLES.includes(
        normalizeCompanyRoleValue(subject.role) as typeof COMPANY_USER_MANAGEMENT_ROLES[number]
    );
}

export function normalizeCompanyRoleValue(role?: string | null) {
    const normalizedRole = String(role || '').trim().toLowerCase();

    if (['tech', 'field_tech', 'field-tech', 'field technician'].includes(normalizedRole)) return 'technician';
    if (['sales tech', 'sales_tech', 'sales-tech', 'sales technician', 'sales representative', 'sales rep'].includes(normalizedRole)) return 'sales';
    if (normalizedRole === 'supervisor') return 'field_supervisor';
    if (['general_manager','general manager'].includes(normalizedRole)) return 'manager';
    if (normalizedRole === 'dispatch') return 'dispatcher';
    return normalizedRole;
}

export function normalizeCompanyStatusValue(status?: string | null) {
    return String(status || '').trim().toLowerCase();
}
