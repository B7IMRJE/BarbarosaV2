import { isStaffRole, normalizeRole } from './roles';
import { supabase } from './supabase';

export const HOME_ROUTE = '/' as const;
export const SUPER_ADMIN_ROUTE = '/super-admin' as const;
export const FIRST_HOME_ONBOARDING_ROUTE = '/onboarding/create-home' as const;
export const TECHOS_ROUTE = '/techos' as const;
export const HOMEOS_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';

const MANAGEMENT_COMPANY_ROLES = ['owner', 'admin', 'manager', 'office', 'dispatcher'];
const TECHOS_COMPANY_ROLES = ['technician'];
const COMPANY_PROFILE_ROLES = ['TECH', 'TECHNICIAN', 'FIELD_TECH', 'FIELD-TECH', 'FIELD TECHNICIAN', 'OFFICE', 'MANAGER', 'ADMIN', 'OWNER', 'DISPATCHER', 'DISPATCH'];

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

type ResolveLoggedInUserRouteOptions = {
    preferredCompanyId?: string | null;
    debugAuthEmail?: string | null;
};

type ProfileRouteFields = {
    id?: string | null;
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
    options: ResolveLoggedInUserRouteOptions = {}
): Promise<LoggedInUserRouteDecision> {
    const debugBase = {
        auth_user_id: userId || 'missing',
        auth_email: options.debugAuthEmail || 'unknown',
        preferred_company_id: options.preferredCompanyId || null,
    };
    const resolve = (decision: LoggedInUserRouteDecision) => {
        logRouteDebug('resolved_route', {
            ...debugBase,
            route: decision.route,
            reason: decision.reason,
            route_kind: getRouteKind(decision.reason),
            company_id: decision.companyId || null,
            company_role: decision.companyRole || null,
            allowed_company_count: decision.allowedCompanyIds?.length || 0,
        });

        return decision;
    };

    logRouteDebug('start', debugBase);

    try {
        const profileQuery = await loadRouteProfile(userId);

        if (profileQuery.error) {
            return resolve(
                isServiceUnavailableError(profileQuery.error)
                    ? serviceUnavailableRouteDecision(profileQuery.error.message)
                    : {
                    route: HOME_ROUTE,
                    reason: 'profile-query-error',
                    message: 'Login succeeded, but HomeOS could not confirm your account profile. Opening HomeOS.',
                }
            );
        }

        const profile = profileQuery.data;
        logRouteDebug('profile', {
            ...debugBase,
            profile_id: profile?.id || null,
            profile_role: profile?.role || null,
            normalized_profile_role: normalizeRole(profile?.role),
            is_platform_admin: profile?.is_platform_admin === true,
        });

        if (!profile) {
            return resolve({
                route: HOME_ROUTE,
                reason: 'profile-missing',
                message: 'Login succeeded, but HomeOS could not find your account profile. Opening HomeOS.',
            });
        }

        if (isSuperAdminProfile(profile)) {
            return resolve({
                route: SUPER_ADMIN_ROUTE,
                reason: 'super-admin',
            });
        }

        const role = normalizeRole(profile.role);
        const companyAccessQuery = await loadLoggedInUserCompanyAccess(userId, { debug: true });

        if (companyAccessQuery.error) {
            return resolve(serviceUnavailableRouteDecision(companyAccessQuery.error.message));
        }

        const activeCompanyAccess = companyAccessQuery.data
            .filter((companyUser) => normalizeCompanyUserStatus(companyUser.status) === 'active');
        logRouteDebug('active_company_access', {
            ...debugBase,
            active_company_count: activeCompanyAccess.length,
            active_company_rows: summarizeCompanyAccessRows(activeCompanyAccess),
        });

        const managementAccess = pickCompanyAccessForRoles(
            activeCompanyAccess,
            MANAGEMENT_COMPANY_ROLES,
            options.preferredCompanyId
        );

        if (managementAccess) {
            const allowedCompanyIds = activeCompanyAccess
                .filter((companyUser) => MANAGEMENT_COMPANY_ROLES.includes(normalizeCompanyUserRole(companyUser.role)))
                .map((companyUser) => companyUser.company_id);

            return resolve({
                route: companyManagementRoute(managementAccess.company_id),
                reason: 'company-management',
                companyId: managementAccess.company_id,
                companyRole: normalizeCompanyUserRole(managementAccess.role),
                allowedCompanyIds,
            });
        }

        const technicianAccess = pickCompanyAccessForRoles(
            activeCompanyAccess,
            TECHOS_COMPANY_ROLES,
            options.preferredCompanyId
        ) || pickCompanyAccessForTechOS(activeCompanyAccess, options.preferredCompanyId);

        if (technicianAccess) {
            return resolve({
                route: techOSRoute(technicianAccess.company_id),
                reason: 'company-technician',
                companyId: technicianAccess.company_id,
                companyRole: normalizeCompanyUserRole(technicianAccess.role),
                allowedCompanyIds: [technicianAccess.company_id],
            });
        }

        if (isStaffRole(role) || COMPANY_PROFILE_ROLES.includes(role)) {
            const fallbackCompanyAccess = pickCompanyAccess(activeCompanyAccess, options.preferredCompanyId);

            if (fallbackCompanyAccess) {
                return resolve({
                    route: techOSRoute(fallbackCompanyAccess.company_id),
                    reason: 'company-technician',
                    companyId: fallbackCompanyAccess.company_id,
                    companyRole: normalizeCompanyUserRole(fallbackCompanyAccess.role),
                    allowedCompanyIds: [fallbackCompanyAccess.company_id],
                });
            }

            return resolve({
                route: TECHOS_ROUTE,
                reason: 'staff',
            });
        }

        if (role !== 'HOMEOWNER') {
            return resolve({
                route: TECHOS_ROUTE,
                reason: 'staff',
            });
        }

        const membershipQuery = await supabase
            .from('property_memberships')
            .select('id', { count: 'exact' })
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(20);
        const activePropertyMembershipCount = membershipQuery.count ?? (membershipQuery.data || []).length;

        logRouteDebug('property_memberships', {
            ...debugBase,
            active_property_membership_count: activePropertyMembershipCount,
            error: membershipQuery.error?.message || null,
        });

        if (membershipQuery.error) {
            return resolve(
                isServiceUnavailableError(membershipQuery.error)
                    ? serviceUnavailableRouteDecision(membershipQuery.error.message)
                    : {
                    route: HOME_ROUTE,
                    reason: 'membership-query-error',
                    message: 'Login succeeded, but HomeOS could not confirm your home setup. Opening HomeOS.',
                }
            );
        }

        if (activePropertyMembershipCount > 0) {
            return resolve({
                route: HOME_ROUTE,
                reason: 'homeowner-active-membership',
            });
        }

        return resolve({
            route: FIRST_HOME_ONBOARDING_ROUTE,
            reason: 'homeowner-needs-first-home',
        });
    } catch (error) {
        return resolve(serviceUnavailableRouteDecision(getErrorMessage(error)));
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

export async function loadLoggedInUserCompanyAccess(
    userId: string,
    options: { debug?: boolean } = {}
): Promise<{
    data: CompanyRouteAccessRow[];
    error: { message: string } | null;
}> {
    const rpcResult = await supabase.rpc('get_my_company_permissions', {
        p_company_id: null,
    });
    const rpcRows = rpcResult.error ? [] : normalizeCompanyAccessRows(rpcResult.data);
    logCompanyAccessDebug(options.debug === true, 'rpc_company_access', rpcRows, rpcResult.error?.message || null);

    if (rpcResult.error && isServiceUnavailableError(rpcResult.error)) {
        return {
            data: [],
            error: rpcResult.error,
        };
    }

    const directQuery = await loadCompanyUsersAccess(userId);
    const directRows = directQuery.error ? [] : normalizeCompanyAccessRows(directQuery.data);
    logCompanyAccessDebug(options.debug === true, 'direct_company_users', directRows, directQuery.error?.message || null);

    if (!directQuery.error) {
        return {
            data: mergeCompanyAccessRows(rpcRows, directRows),
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

function logCompanyAccessDebug(
    enabled: boolean,
    stage: string,
    rows: CompanyRouteAccessRow[],
    error: string | null
) {
    if (!enabled) return;

    logRouteDebug(stage, {
        count: rows.length,
        rows: summarizeCompanyAccessRows(rows),
        error,
    });
}

function summarizeCompanyAccessRows(rows: CompanyRouteAccessRow[]) {
    return rows.slice(0, 10).map((row) => ({
        company_id: row.company_id,
        company_user_id: row.id,
        role: row.role,
        normalized_role: normalizeCompanyUserRole(row.role),
        status: row.status,
        normalized_status: normalizeCompanyUserStatus(row.status),
        can_view_techos: row.can_view_techos ?? null,
    }));
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
            .select('id, role, is_platform_admin')
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
            .select('id, role')
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

function getRouteKind(reason: LoggedInUserRouteReason) {
    if (reason === 'company-management' || reason === 'company-technician' || reason === 'staff' || reason === 'super-admin') {
        return 'staff';
    }

    if (reason === 'homeowner-active-membership') return 'homeowner';
    if (reason === 'homeowner-needs-first-home') return 'onboarding';

    return 'error';
}

function logRouteDebug(stage: string, details: Record<string, unknown>) {
    console.log('[route-debug]', {
        stage,
        ...details,
    });
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
