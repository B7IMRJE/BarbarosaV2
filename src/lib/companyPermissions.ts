import { supabase } from './supabase';
import {
    canDispatchCompanyOperationsForSubject,
    normalizeCompanyRoleValue,
    normalizeCompanyStatusValue,
} from './dispatcherAuthorization';

const COMPANY_PERMISSION_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';

export type CompanyPermissionKey =
    | 'can_view_techos'
    | 'can_create_estimates'
    | 'can_add_item_to_estimate'
    | 'can_view_customers'
    | 'can_view_jobs'
    | 'can_manage_company_users'
    | 'can_manage_company_profile';

export type CompanyPermissionSet = Record<CompanyPermissionKey, boolean>;

export type CompanyAccessSubject = {
    role?: string | null;
    status?: string | null;
    permissions?: Partial<CompanyPermissionSet> | null;
};

export type CompanyPermissionAccess = {
    userId: string;
    companyUserId: string;
    companyId: string;
    role: string | null;
    status: string | null;
    permissions: CompanyPermissionSet;
};

export type CompanyPermissionLookupResult = {
    access: CompanyPermissionAccess | null;
    error: string | null;
};

export const COMPANY_PERMISSION_LABELS: Record<CompanyPermissionKey, string> = {
    can_view_techos: 'View TechOS',
    can_create_estimates: 'Create estimates',
    can_add_item_to_estimate: 'Add items to estimates',
    can_view_customers: 'View customers',
    can_view_jobs: 'View jobs',
    can_manage_company_users: 'Manage company users',
    can_manage_company_profile: 'Manage company profile',
};

const EMPTY_PERMISSIONS: CompanyPermissionSet = {
    can_view_techos: false,
    can_create_estimates: false,
    can_add_item_to_estimate: false,
    can_view_customers: false,
    can_view_jobs: false,
    can_manage_company_users: false,
    can_manage_company_profile: false,
};

const TECHNICIAN_PERMISSIONS: CompanyPermissionSet = {
    can_view_techos: true,
    can_create_estimates: false,
    can_add_item_to_estimate: false,
    can_view_customers: false,
    can_view_jobs: true,
    can_manage_company_users: false,
    can_manage_company_profile: false,
};

const DISPATCH_PERMISSIONS: CompanyPermissionSet = {
    can_view_techos: true,
    can_create_estimates: false,
    can_add_item_to_estimate: false,
    can_view_customers: true,
    can_view_jobs: true,
    can_manage_company_users: false,
    can_manage_company_profile: false,
};

const MANAGER_PERMISSIONS: CompanyPermissionSet = {
    can_view_techos: true,
    can_create_estimates: true,
    can_add_item_to_estimate: true,
    can_view_customers: true,
    can_view_jobs: true,
    can_manage_company_users: true,
    can_manage_company_profile: true,
};

const ADMIN_PERMISSIONS: CompanyPermissionSet = {
    can_view_techos: true,
    can_create_estimates: true,
    can_add_item_to_estimate: true,
    can_view_customers: true,
    can_view_jobs: true,
    can_manage_company_users: true,
    can_manage_company_profile: true,
};

const OWNER_PERMISSIONS: CompanyPermissionSet = {
    can_view_techos: true,
    can_create_estimates: true,
    can_add_item_to_estimate: true,
    can_view_customers: true,
    can_view_jobs: true,
    can_manage_company_users: true,
    can_manage_company_profile: true,
};

export function normalizeCompanyRole(role?: string | null) {
    return normalizeCompanyRoleValue(role);
}

export function normalizeCompanyStatus(status?: string | null) {
    return normalizeCompanyStatusValue(status);
}

export function isActiveCompanyStatus(status?: string | null) {
    return normalizeCompanyStatus(status) === 'active';
}

export function isTechnicianCompanyRole(role?: string | null) {
    return normalizeCompanyRole(role) === 'technician';
}

export function isDispatchCompanyRole(role?: string | null) {
    return ['office', 'dispatcher', 'supervisor'].includes(normalizeCompanyRole(role));
}

export function getRoleDefaultPermissions(role?: string | null): CompanyPermissionSet {
    const normalizedRole = normalizeCompanyRole(role);

    if (normalizedRole === 'technician') return { ...TECHNICIAN_PERMISSIONS };
    if (isDispatchCompanyRole(normalizedRole)) return { ...DISPATCH_PERMISSIONS };
    if (normalizedRole === 'manager') return { ...MANAGER_PERMISSIONS };
    if (normalizedRole === 'admin') return { ...ADMIN_PERMISSIONS };
    if (normalizedRole === 'owner') return { ...OWNER_PERMISSIONS };

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

export function canAccessDispatch(subject?: CompanyAccessSubject | null) {
    return canDispatchCompanyOperationsForSubject(subject);
}

export function canUseCompanyEstimateWorkflow(subject?: CompanyAccessSubject | null) {
    if (!subject || !isActiveCompanyStatus(subject.status)) return false;

    return ['owner', 'admin', 'manager', 'technician'].includes(normalizeCompanyRole(subject.role));
}

export async function loadCurrentCompanyPermissionAccess(
    permission: CompanyPermissionKey,
    options: { companyId?: string | null } = {}
): Promise<CompanyPermissionLookupResult> {
    let userId = '';

    try {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return { access: null, error: normalizeServiceErrorMessage(userError?.message || 'Not authenticated.') };
        }

        userId = user.id;
    } catch (error) {
        return { access: null, error: normalizeServiceErrorMessage(getErrorMessage(error)) };
    }

    const rpcAccess = await loadPermissionAccessFromRpc(userId, permission, options.companyId || null);

    if (rpcAccess.access || !rpcAccess.shouldFallback) {
        return { access: rpcAccess.access, error: rpcAccess.error };
    }

    return loadPermissionAccessFromCompanyUsers(userId, permission, options.companyId || null);
}

export async function loadCurrentCompanyEstimateAccess(
    options: { companyId?: string | null } = {}
): Promise<CompanyPermissionLookupResult> {
    let userId = '';

    try {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return { access: null, error: normalizeServiceErrorMessage(userError?.message || 'Not authenticated.') };
        }

        userId = user.id;
    } catch (error) {
        return { access: null, error: normalizeServiceErrorMessage(getErrorMessage(error)) };
    }

    const rpcAccess = await loadEstimateAccessFromRpc(userId, options.companyId || null);

    if (rpcAccess.access || !rpcAccess.shouldFallback) {
        return { access: rpcAccess.access, error: rpcAccess.error };
    }

    return loadEstimateAccessFromCompanyUsers(userId, options.companyId || null);
}

type RpcPermissionAccessResult = CompanyPermissionLookupResult & {
    shouldFallback: boolean;
};

type CompanyPermissionRow = {
    company_user_id?: string | null;
    id?: string | null;
    company_id?: string | null;
    role?: string | null;
    status?: string | null;
    permissions?: unknown;
    can_view_techos?: boolean | null;
    can_create_estimates?: boolean | null;
    can_add_item_to_estimate?: boolean | null;
    can_view_customers?: boolean | null;
    can_view_jobs?: boolean | null;
    can_manage_company_users?: boolean | null;
    can_manage_company_profile?: boolean | null;
};

async function loadPermissionAccessFromRpc(
    userId: string,
    permission: CompanyPermissionKey,
    companyId: string | null
): Promise<RpcPermissionAccessResult> {
    try {
        const { data, error } = await supabase.rpc('get_my_company_permissions', {
            p_company_id: companyId,
        });

        if (error) {
            return {
                access: null,
                error: normalizeServiceErrorMessage(error.message),
                shouldFallback: !isFetchFailureMessage(error.message),
            };
        }

        const rows = ((data || []) as unknown[]).map(readCompanyPermissionRow);
        const access = rows
            .map((row) => resolvePermissionAccessFromRow(userId, row))
            .find((candidate): candidate is CompanyPermissionAccess =>
                Boolean(candidate && candidate.permissions[permission])
            ) || null;

        return {
            access,
            error: access ? null : 'No active company membership has this permission.',
            shouldFallback: false,
        };
    } catch (error) {
        return {
            access: null,
            error: normalizeServiceErrorMessage(getErrorMessage(error)),
            shouldFallback: false,
        };
    }
}

async function loadEstimateAccessFromRpc(
    userId: string,
    companyId: string | null
): Promise<RpcPermissionAccessResult> {
    try {
        const { data, error } = await supabase.rpc('get_my_company_permissions', {
            p_company_id: companyId,
        });

        if (error) {
            return {
                access: null,
                error: normalizeServiceErrorMessage(error.message),
                shouldFallback: !isFetchFailureMessage(error.message),
            };
        }

        const rows = ((data || []) as unknown[]).map(readCompanyPermissionRow);
        const access = rows
            .map((row) => resolvePermissionAccessFromRow(userId, row))
            .find((candidate): candidate is CompanyPermissionAccess =>
                Boolean(candidate && canUseCompanyEstimateWorkflow(candidate))
            ) || null;

        return {
            access,
            error: access ? null : 'This work account is not authorized to create estimates for this company.',
            shouldFallback: false,
        };
    } catch (error) {
        return {
            access: null,
            error: normalizeServiceErrorMessage(getErrorMessage(error)),
            shouldFallback: false,
        };
    }
}

async function loadPermissionAccessFromCompanyUsers(
    userId: string,
    permission: CompanyPermissionKey,
    companyId: string | null
): Promise<CompanyPermissionLookupResult> {
    const withPermissions = await queryCompanyUsers(userId, companyId, true);
    const result = withPermissions.error
        ? await queryCompanyUsers(userId, companyId, false)
        : withPermissions;

    if (result.error) {
        return { access: null, error: result.error };
    }

    const access = result.rows
        .map((row) => resolvePermissionAccessFromRow(userId, row))
        .find((candidate): candidate is CompanyPermissionAccess =>
            Boolean(candidate && candidate.permissions[permission])
        ) || null;

    return {
        access,
        error: access ? null : 'No active company membership has this permission.',
    };
}

async function loadEstimateAccessFromCompanyUsers(
    userId: string,
    companyId: string | null
): Promise<CompanyPermissionLookupResult> {
    const withPermissions = await queryCompanyUsers(userId, companyId, true);
    const result = withPermissions.error
        ? await queryCompanyUsers(userId, companyId, false)
        : withPermissions;

    if (result.error) {
        return { access: null, error: result.error };
    }

    const access = result.rows
        .map((row) => resolvePermissionAccessFromRow(userId, row))
        .find((candidate): candidate is CompanyPermissionAccess =>
            Boolean(candidate && canUseCompanyEstimateWorkflow(candidate))
        ) || null;

    return {
        access,
        error: access ? null : 'This work account is not authorized to create estimates for this company.',
    };
}

async function queryCompanyUsers(userId: string, companyId: string | null, includePermissions: boolean) {
    try {
        let query = supabase
            .from('company_users')
            .select(includePermissions
                ? 'id, company_id, role, status, permissions'
                : 'id, company_id, role, status')
            .eq('auth_user_id', userId)
            .order('created_at', { ascending: true })
            .limit(20);

        if (companyId) {
            query = query.eq('company_id', companyId);
        }

        const { data, error } = await query;

        if (error) {
            return { rows: [] as CompanyPermissionRow[], error: normalizeServiceErrorMessage(error.message) };
        }

        return {
            rows: ((data || []) as unknown[]).map(readCompanyPermissionRow),
            error: null,
        };
    } catch (error) {
        return { rows: [] as CompanyPermissionRow[], error: normalizeServiceErrorMessage(getErrorMessage(error)) };
    }
}

function resolvePermissionAccessFromRow(
    userId: string,
    row: CompanyPermissionRow
): CompanyPermissionAccess | null {
    const companyUserId = String(row.company_user_id || row.id || '').trim();
    const companyId = String(row.company_id || '').trim();

    if (!companyUserId || !companyId || !isActiveCompanyStatus(row.status)) {
        return null;
    }

    const permissions = hasResolvedPermissionBooleans(row)
        ? readResolvedPermissionBooleans(row)
        : resolveCompanyPermissions({
            role: row.role,
            status: row.status,
            permissions: readPermissionOverrides(row.permissions),
        });

    return {
        userId,
        companyUserId,
        companyId,
        role: row.role || null,
        status: row.status || null,
        permissions,
    };
}

function readCompanyPermissionRow(value: unknown): CompanyPermissionRow {
    if (!isRecord(value)) return {};

    return {
        company_user_id: readNullableString(value, 'company_user_id'),
        id: readNullableString(value, 'id'),
        company_id: readNullableString(value, 'company_id'),
        role: readNullableString(value, 'role'),
        status: readNullableString(value, 'status'),
        permissions: value.permissions,
        can_view_techos: readNullableBoolean(value, 'can_view_techos'),
        can_create_estimates: readNullableBoolean(value, 'can_create_estimates'),
        can_add_item_to_estimate: readNullableBoolean(value, 'can_add_item_to_estimate'),
        can_view_customers: readNullableBoolean(value, 'can_view_customers'),
        can_view_jobs: readNullableBoolean(value, 'can_view_jobs'),
        can_manage_company_users: readNullableBoolean(value, 'can_manage_company_users'),
        can_manage_company_profile: readNullableBoolean(value, 'can_manage_company_profile'),
    };
}

function hasResolvedPermissionBooleans(row: CompanyPermissionRow) {
    return (
        typeof row.can_view_techos === 'boolean' ||
        typeof row.can_create_estimates === 'boolean' ||
        typeof row.can_add_item_to_estimate === 'boolean' ||
        typeof row.can_view_customers === 'boolean' ||
        typeof row.can_view_jobs === 'boolean' ||
        typeof row.can_manage_company_users === 'boolean' ||
        typeof row.can_manage_company_profile === 'boolean'
    );
}

function readResolvedPermissionBooleans(row: CompanyPermissionRow): CompanyPermissionSet {
    const defaults = getRoleDefaultPermissions(row.role);

    return {
        can_view_techos: typeof row.can_view_techos === 'boolean' ? row.can_view_techos : defaults.can_view_techos,
        can_create_estimates: typeof row.can_create_estimates === 'boolean' ? row.can_create_estimates : defaults.can_create_estimates,
        can_add_item_to_estimate: typeof row.can_add_item_to_estimate === 'boolean' ? row.can_add_item_to_estimate : defaults.can_add_item_to_estimate,
        can_view_customers: typeof row.can_view_customers === 'boolean' ? row.can_view_customers : defaults.can_view_customers,
        can_view_jobs: typeof row.can_view_jobs === 'boolean' ? row.can_view_jobs : defaults.can_view_jobs,
        can_manage_company_users: typeof row.can_manage_company_users === 'boolean' ? row.can_manage_company_users : defaults.can_manage_company_users,
        can_manage_company_profile: typeof row.can_manage_company_profile === 'boolean' ? row.can_manage_company_profile : defaults.can_manage_company_profile,
    };
}

function readPermissionOverrides(value: unknown): Partial<CompanyPermissionSet> | null {
    if (!isRecord(value)) return null;

    const permissions: Partial<CompanyPermissionSet> = {};
    const permissionKeys = Object.keys(EMPTY_PERMISSIONS) as CompanyPermissionKey[];

    permissionKeys.forEach((permissionKey) => {
        const permissionValue = value[permissionKey];

        if (typeof permissionValue === 'boolean') {
            permissions[permissionKey] = permissionValue;
        }
    });

    return Object.keys(permissions).length > 0 ? permissions : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readNullableString(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' ? value : null;
}

function readNullableBoolean(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'boolean' ? value : null;
}

function normalizeServiceErrorMessage(message?: string | null) {
    const cleanMessage = String(message || '').trim();

    if (!cleanMessage || isFetchFailureMessage(cleanMessage)) {
        return COMPANY_PERMISSION_SERVICE_ERROR_MESSAGE;
    }

    return cleanMessage;
}

function isFetchFailureMessage(message?: string | null) {
    const normalizedMessage = String(message || '').toLowerCase();

    return (
        normalizedMessage.includes('failed to fetch') ||
        normalizedMessage.includes('network request failed') ||
        normalizedMessage.includes('fetch failed') ||
        normalizedMessage.includes('load failed') ||
        normalizedMessage.includes('networkerror')
    );
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    return COMPANY_PERMISSION_SERVICE_ERROR_MESSAGE;
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
