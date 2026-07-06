import { isStaffRole, normalizeRole } from './roles';
import { supabase } from './supabase';

export const HOME_ROUTE = '/' as const;
export const SUPER_ADMIN_ROUTE = '/super-admin' as const;
export const FIRST_HOME_ONBOARDING_ROUTE = '/onboarding/create-home' as const;
export const TECHOS_ROUTE = '/techos' as const;
export const HOMEOS_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';

const MANAGEMENT_COMPANY_ROLES = ['owner', 'admin', 'manager', 'office', 'dispatcher'];
const TECHOS_COMPANY_ROLES = ['technician'];
const COMPANY_PROFILE_ROLES = ['TECH', 'TECHNICIAN', 'FIELD_TECH', 'FIELD TECHNICIAN', 'OFFICE', 'MANAGER', 'ADMIN', 'OWNER', 'DISPATCHER'];

export type LoggedInUserRoute = string;

export type LoggedInUserRouteReason =
    | 'super-admin'
    | 'company-management'
    | 'company-technician'
    | 'staff'
    | 'homeowner-active-membership'
    | 'homeowner-needs-first-home'
    | 'profile-missing'
    | 'profile-query-error'
    | 'membership-query-error'
    | 'service-unavailable'
    | 'unexpected-error';

export type LoggedInUserRouteDecision = {
    route: LoggedInUserRoute;
    reason: LoggedInUserRouteReason;
    companyId?: string | null;
    companyRole?: string | null;
    allowedCompanyIds?: string[];
    message?: string;
};

type ProfileRouteFields = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

export function isSuperAdminProfile(profile?: ProfileRouteFields | null) {
    return (
        normalizeRole(profile?.role) === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

export async function resolveLoggedInUserRoute(
    userId: string,
    options: { preferredCompanyId?: string | null } = {}
): Promise<LoggedInUserRouteDecision> {
    try {
        const profileQuery = await loadRouteProfile(userId);

        if (profileQuery.error) {
            return isServiceUnavailableError(profileQuery.error)
                ? serviceUnavailableRouteDecision(profileQuery.error.message)
                : {
                    route: HOME_ROUTE,
                    reason: 'profile-query-error',
                    message: 'Login succeeded, but HomeOS could not confirm your account profile. Opening HomeOS.',
                };
        }

        const profile = profileQuery.data;

        if (!profile) {
            return {
                route: HOME_ROUTE,
                reason: 'profile-missing',
                message: 'Login succeeded, but HomeOS could not find your account profile. Opening HomeOS.',
            };
        }

        if (isSuperAdminProfile(profile)) {
            return {
                route: SUPER_ADMIN_ROUTE,
                reason: 'super-admin',
            };
        }

        const role = normalizeRole(profile.role);
        const companyAccessQuery = await loadLoggedInUserCompanyAccess(userId);

        if (companyAccessQuery.error) {
            return serviceUnavailableRouteDecision(companyAccessQuery.error.message);
        }

        const activeCompanyAccess = companyAccessQuery.data
            .filter((companyUser) => normalizeCompanyUserStatus(companyUser.status) === 'active');
        const managementAccess = pickCompanyAccessForRoles(
            activeCompanyAccess,
            MANAGEMENT_COMPANY_ROLES,
            options.preferredCompanyId
        );

        if (managementAccess) {
            const allowedCompanyIds = activeCompanyAccess
                .filter((companyUser) => MANAGEMENT_COMPANY_ROLES.includes(normalizeCompanyUserRole(companyUser.role)))
                .map((companyUser) => companyUser.company_id);

            return {
                route: companyManagementRoute(managementAccess.company_id),
                reason: 'company-management',
                companyId: managementAccess.company_id,
                companyRole: normalizeCompanyUserRole(managementAccess.role),
                allowedCompanyIds,
            };
        }

        const technicianAccess = pickCompanyAccessForRoles(
            activeCompanyAccess,
            TECHOS_COMPANY_ROLES,
            options.preferredCompanyId
        ) || pickCompanyAccessForTechOS(activeCompanyAccess, options.preferredCompanyId);

        if (technicianAccess) {
            return {
                route: techOSRoute(technicianAccess.company_id),
                reason: 'company-technician',
                companyId: technicianAccess.company_id,
                companyRole: normalizeCompanyUserRole(technicianAccess.role),
                allowedCompanyIds: [technicianAccess.company_id],
            };
        }

        if (isStaffRole(role) || COMPANY_PROFILE_ROLES.includes(role)) {
            const fallbackCompanyAccess = pickCompanyAccess(activeCompanyAccess, options.preferredCompanyId);

            if (fallbackCompanyAccess) {
                return {
                    route: techOSRoute(fallbackCompanyAccess.company_id),
                    reason: 'company-technician',
                    companyId: fallbackCompanyAccess.company_id,
                    companyRole: normalizeCompanyUserRole(fallbackCompanyAccess.role),
                    allowedCompanyIds: [fallbackCompanyAccess.company_id],
                };
            }

            return {
                route: TECHOS_ROUTE,
                reason: 'staff',
            };
        }

        if (role !== 'HOMEOWNER') {
            return {
                route: HOME_ROUTE,
                reason: 'staff',
            };
        }

        const membershipQuery = await supabase
            .from('property_memberships')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(1);

        if (membershipQuery.error) {
            return isServiceUnavailableError(membershipQuery.error)
                ? serviceUnavailableRouteDecision(membershipQuery.error.message)
                : {
                    route: HOME_ROUTE,
                    reason: 'membership-query-error',
                    message: 'Login succeeded, but HomeOS could not confirm your home setup. Opening HomeOS.',
                };
        }

        if ((membershipQuery.data || []).length > 0) {
            return {
                route: HOME_ROUTE,
                reason: 'homeowner-active-membership',
            };
        }

        return {
            route: FIRST_HOME_ONBOARDING_ROUTE,
            reason: 'homeowner-needs-first-home',
        };
    } catch (error) {
        return serviceUnavailableRouteDecision(getErrorMessage(error));
    }
}

export type CompanyRouteAccessRow = {
    id: string | null;
    company_id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    status: string | null;
    created_at: string | null;
    can_view_techos?: boolean | null;
};

export async function loadLoggedInUserCompanyAccess(userId: string): Promise<{
    data: CompanyRouteAccessRow[];
    error: { message: string } | null;
}> {
    const rpcResult = await supabase.rpc('get_my_company_permissions', {
        p_company_id: null,
    });
    const rpcRows = rpcResult.error ? [] : normalizeCompanyAccessRows(rpcResult.data);

    if (rpcResult.error && isServiceUnavailableError(rpcResult.error)) {
        return {
            data: [],
            error: rpcResult.error,
        };
    }

    const directQuery = await loadCompanyUsersAccess(userId);

    if (!directQuery.error) {
        return {
            data: mergeCompanyAccessRows(rpcRows, normalizeCompanyAccessRows(directQuery.data)),
            error: null,
        };
    }

    if (!rpcResult.error) {
        return {
            data: rpcRows,
            error: null,
        };
    }

    return {
        data: [],
        error: directQuery.error,
    };
}

async function loadCompanyUsersAccess(userId: string) {
    return supabase
        .from('company_users')
        .select('id, company_id, full_name, email, role, status, created_at')
        .eq('auth_user_id', userId)
        .order('created_at', { ascending: true })
        .limit(50);
}

function normalizeCompanyAccessRows(data: unknown): CompanyRouteAccessRow[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
            const companyId = readStringField(record, 'company_id');

            return {
                id: readStringField(record, 'company_user_id') || readStringField(record, 'id'),
                company_id: companyId || '',
                full_name: readStringField(record, 'full_name'),
                email: readStringField(record, 'email'),
                role: readStringField(record, 'role'),
                status: readStringField(record, 'status'),
                created_at: readStringField(record, 'created_at'),
                can_view_techos: readBooleanField(record, 'can_view_techos'),
            };
        })
        .filter((row) => row.company_id);
}

function mergeCompanyAccessRows(
    permissionRows: CompanyRouteAccessRow[],
    companyUserRows: CompanyRouteAccessRow[]
): CompanyRouteAccessRow[] {
    const rowsByCompanyId = new Map<string, CompanyRouteAccessRow>();

    companyUserRows.forEach((row) => {
        rowsByCompanyId.set(row.company_id, row);
    });

    permissionRows.forEach((row) => {
        const existing = rowsByCompanyId.get(row.company_id) || null;

        rowsByCompanyId.set(row.company_id, {
            id: row.id || existing?.id || null,
            company_id: row.company_id,
            full_name: row.full_name || existing?.full_name || null,
            email: row.email || existing?.email || null,
            role: row.role || existing?.role || null,
            status: row.status || existing?.status || null,
            created_at: row.created_at || existing?.created_at || null,
            can_view_techos: typeof row.can_view_techos === 'boolean'
                ? row.can_view_techos
                : existing?.can_view_techos ?? null,
        });
    });

    return Array.from(rowsByCompanyId.values());
}

function pickCompanyAccess(
    rows: CompanyRouteAccessRow[],
    preferredCompanyId?: string | null
) {
    const preferredId = String(preferredCompanyId || '').trim();

    if (preferredId) {
        const preferredRow = rows.find((row) => row.company_id === preferredId);
        if (preferredRow) return preferredRow;
    }

    return rows[0] || null;
}

function pickCompanyAccessForRoles(
    rows: CompanyRouteAccessRow[],
    roles: string[],
    preferredCompanyId?: string | null
) {
    const preferredId = String(preferredCompanyId || '').trim();
    const matchingRows = rows.filter((row) => roles.includes(normalizeCompanyUserRole(row.role)));

    if (preferredId) {
        const preferredRow = matchingRows.find((row) => row.company_id === preferredId);
        if (preferredRow) return preferredRow;
    }

    return matchingRows[0] || null;
}

function pickCompanyAccessForTechOS(
    rows: CompanyRouteAccessRow[],
    preferredCompanyId?: string | null
) {
    const preferredId = String(preferredCompanyId || '').trim();
    const matchingRows = rows.filter((row) => (
        row.can_view_techos === true ||
        TECHOS_COMPANY_ROLES.includes(normalizeCompanyUserRole(row.role))
    ));

    if (preferredId) {
        const preferredRow = matchingRows.find((row) => row.company_id === preferredId);
        if (preferredRow) return preferredRow;
    }

    return matchingRows[0] || null;
}

function normalizeCompanyUserRole(role?: string | null) {
    const normalizedRole = String(role || '').trim().toLowerCase();

    if (['tech', 'field_tech', 'field-tech', 'field technician'].includes(normalizedRole)) return 'technician';
    return normalizedRole;
}

function normalizeCompanyUserStatus(status?: string | null) {
    return String(status || '').trim().toLowerCase();
}

function companyManagementRoute(companyId: string) {
    return `/super-admin/company/${companyId}`;
}

function techOSRoute(companyId: string) {
    return `${TECHOS_ROUTE}?companyId=${encodeURIComponent(companyId)}`;
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function readBooleanField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'boolean' ? value : null;
}

async function loadRouteProfile(userId: string) {
    try {
        const primaryQuery = await supabase
            .from('profiles')
            .select('role, is_platform_admin')
            .eq('id', userId)
            .maybeSingle();

        if (!primaryQuery.error) {
            return primaryQuery;
        }

        if (isServiceUnavailableError(primaryQuery.error)) {
            return primaryQuery;
        }

        const fallbackQuery = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();

        return {
            data: fallbackQuery.data ? { ...fallbackQuery.data, is_platform_admin: null } : null,
            error: fallbackQuery.error,
        };
    } catch (error) {
        return {
            data: null,
            error: { message: getErrorMessage(error) },
        };
    }
}

function serviceUnavailableRouteDecision(message?: string | null): LoggedInUserRouteDecision {
    return {
        route: HOME_ROUTE,
        reason: 'service-unavailable',
        message: normalizeServiceUnavailableMessage(message),
    };
}

function isServiceUnavailableError(error?: { message?: string | null } | null) {
    return isServiceUnavailableMessage(error?.message);
}

function isServiceUnavailableMessage(message?: string | null) {
    const normalizedMessage = String(message || '').toLowerCase();

    return (
        normalizedMessage.includes('failed to fetch') ||
        normalizedMessage.includes('network request failed') ||
        normalizedMessage.includes('fetch failed') ||
        normalizedMessage.includes('load failed') ||
        normalizedMessage.includes('networkerror')
    );
}

function normalizeServiceUnavailableMessage(message?: string | null) {
    const cleanMessage = String(message || '').trim();

    return isServiceUnavailableMessage(cleanMessage) || !cleanMessage
        ? HOMEOS_SERVICE_ERROR_MESSAGE
        : cleanMessage;
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    return HOMEOS_SERVICE_ERROR_MESSAGE;
}
