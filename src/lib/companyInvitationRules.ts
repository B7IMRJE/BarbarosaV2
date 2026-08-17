import type { CompanyPermissionKey } from './companyPermissions';

export type CompanyRole =
    | 'owner'
    | 'admin'
    | 'manager'
    | 'office'
    | 'dispatcher'
    | 'supervisor'
    | 'sales'
    | 'technician';

export type CustomizableCompanyRole = Exclude<CompanyRole, 'owner'>;

export const COMPANY_ROLE_OPTIONS: { label: string; value: CompanyRole }[] = [
    { label: 'Company Owner', value: 'owner' },
    { label: 'Admin', value: 'admin' },
    { label: 'Manager', value: 'manager' },
    { label: 'Office', value: 'office' },
    { label: 'Dispatcher', value: 'dispatcher' },
    { label: 'Supervisor', value: 'supervisor' },
    { label: 'Sales Tech (Sales)', value: 'sales' },
    { label: 'Technician', value: 'technician' },
];

export const CUSTOMIZABLE_COMPANY_ROLE_OPTIONS = COMPANY_ROLE_OPTIONS.filter(
    (option): option is { label: string; value: CustomizableCompanyRole } => option.value !== 'owner'
);

export const COMPANY_PERMISSION_KEYS: CompanyPermissionKey[] = [
    'can_view_techos',
    'can_create_estimates',
    'can_add_item_to_estimate',
    'can_manage_price_book',
    'can_view_customers',
    'can_view_jobs',
    'can_manage_company_users',
    'can_manage_company_profile',
];

export type ReusableInvitation = {
    email: string;
    status: string;
    expires_at: string | null;
};

export function findReusablePendingInvitation<T extends ReusableInvitation>(
    email: string,
    invitations: T[],
    nowMs: number
) {
    const normalizedEmail = email.trim().toLowerCase();

    return invitations.find((invitation) =>
        invitation.email.trim().toLowerCase() === normalizedEmail &&
        normalizeInvitationStatus(invitation.status) === 'pending' &&
        !isInvitationExpired(invitation, nowMs)
    ) || null;
}

export function isInvitationExpired(invitation: Pick<ReusableInvitation, 'status' | 'expires_at'>, nowMs: number) {
    const status = normalizeInvitationStatus(invitation.status);

    if (status === 'expired') return true;
    if (status !== 'pending' || !invitation.expires_at) return false;

    const expiresAtMs = new Date(invitation.expires_at).getTime();
    return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

export function normalizeInvitationStatus(status?: string | null) {
    return String(status || '').trim().toLowerCase();
}

export function formatPermissionCoverage(permissions: Record<CompanyPermissionKey, boolean>) {
    const enabledCount = COMPANY_PERMISSION_KEYS.filter((permissionKey) => permissions[permissionKey]).length;
    return `${enabledCount}/${COMPANY_PERMISSION_KEYS.length}`;
}
