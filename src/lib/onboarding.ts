import { supabase } from './supabase';
import { getCompanyDisplayName } from './companyDisplayName';
import {
    companyManagementRoute,
    normalizeCompanyUserRole,
    normalizeCompanyUserStatus,
    resolveAuthorizedWorkspaceRoute,
    serviceUnavailableRouteDecision,
    techOSRoute,
    type CompanyRouteAccessRow,
    type LoggedInUserRouteDecision,
    type ProfileRouteFields,
} from './workspaceAccess';

export {
    COMPANY_INVITE_ROUTE,
    FIRST_HOME_ONBOARDING_ROUTE,
    HOME_ROUTE,
    SUPER_ADMIN_ROUTE,
    TECHOS_ROUTE,
    WORKSPACE_ACCESS_ERROR_MESSAGE,
    WORKSPACE_CHOOSER_ROUTE,
    buildAuthorizedWorkspaces,
    isSuperAdminProfile,
    resolveAuthorizedWorkspaceRoute,
    type AuthorizedWorkspace,
    type AuthorizedWorkspaceKind,
    type AuthorizedWorkspaceResolutionInput,
    type CompanyRouteAccessRow,
    type LoggedInUserRouteDecision,
    type LoggedInUserRouteReason,
    type ProfileRouteFields,
} from './workspaceAccess';

export const HOMEOS_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';

const MANAGEMENT_COMPANY_ROLES = ['owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor'];
const TECHOS_COMPANY_ROLES = ['technician'];

type ResolveLoggedInUserRouteOptions = {
    preferredCompanyId?: string | null;
};


export async function resolveLoggedInUserRoute(
    userId: string,
    options: ResolveLoggedInUserRouteOptions = {}
): Promise<LoggedInUserRouteDecision> {
    try {
        const [profileQuery, companyAccessQuery, membershipQuery] = await Promise.all([
            loadRouteProfile(userId),
            loadLoggedInUserCompanyAccess(userId),
            supabase
                .from('property_memberships')
                .select('id', { count: 'exact' })
                .eq('user_id', userId)
                .eq('status', 'active')
                .limit(20),
        ]);

        if (profileQuery.error || companyAccessQuery.error || membershipQuery.error) {
            return serviceUnavailableRouteDecision();
        }

        const activeCompanyAccess = companyAccessQuery.data
            .filter((companyUser) => normalizeCompanyUserStatus(companyUser.status) === 'active');
        const activePropertyMembershipCount = membershipQuery.count ?? (membershipQuery.data || []).length;
        const companyNames = await loadAuthorizedCompanyNames(activeCompanyAccess);

        return resolveAuthorizedWorkspaceRoute({
            profile: profileQuery.data,
            companyAccess: activeCompanyAccess,
            activePropertyMembershipCount,
            companyNames,
            preferredCompanyId: options.preferredCompanyId,
        });
    } catch {
        return serviceUnavailableRouteDecision();
    }
}

async function loadAuthorizedCompanyNames(activeCompanyAccess: CompanyRouteAccessRow[]) {
    const companyIds = Array.from(new Set(activeCompanyAccess.map((access) => access.company_id).filter(Boolean)));
    if (!companyIds.length) return {};

    const result = await supabase
        .from('companies')
        .select('id, name, public_name, dba_name')
        .in('id', companyIds);

    if (result.error) return {};

    return Object.fromEntries((result.data || []).map((company) => [
        company.id,
        getCompanyDisplayName(company, 'your company'),
    ]));
}

export function resolveActiveCompanyRoute(
    activeCompanyAccess: CompanyRouteAccessRow[],
    preferredCompanyId?: string | null
): LoggedInUserRouteDecision | null {
    const managementAccess = pickCompanyAccessForRoles(
        activeCompanyAccess,
        MANAGEMENT_COMPANY_ROLES,
        preferredCompanyId
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
        preferredCompanyId
    ) || pickCompanyAccessForTechOS(activeCompanyAccess, preferredCompanyId);

    if (!technicianAccess) return null;

    return {
        route: techOSRoute(technicianAccess.company_id),
        reason: 'company-technician',
        companyId: technicianAccess.company_id,
        companyRole: normalizeCompanyUserRole(technicianAccess.role),
        allowedCompanyIds: [technicianAccess.company_id],
    };
}

export async function loadLoggedInUserCompanyAccess(
    userId: string
): Promise<{
    data: CompanyRouteAccessRow[];
    error: { message: string } | null;
}> {
    const [directQuery, permissionQuery] = await Promise.all([
        loadCompanyUsersAccess(userId),
        loadCompanyPermissionAccess(),
    ]);
    const directRows = directQuery.error ? [] : normalizeCompanyAccessRows(directQuery.data);
    const permissionRows = permissionQuery.error ? [] : normalizeCompanyAccessRows(permissionQuery.data);
    const rows = mergeCompanyAccessRows(directRows, permissionRows);

    return {
        data: rows,
        error: rows.length ? null : directQuery.error || permissionQuery.error,
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

async function loadCompanyPermissionAccess() {
    return supabase.rpc('get_my_company_permissions', {
        p_company_id: null,
    });
}

export function mergeCompanyAccessRows(
    directRows: CompanyRouteAccessRow[],
    permissionRows: CompanyRouteAccessRow[]
) {
    const merged = new Map<string, CompanyRouteAccessRow>();

    for (const row of [...permissionRows, ...directRows]) {
        const key = row.id || `${row.company_id}:${normalizeCompanyUserRole(row.role)}`;
        const existing = merged.get(key);

        merged.set(key, {
            ...existing,
            ...row,
            full_name: row.full_name || existing?.full_name || null,
            email: row.email || existing?.email || null,
            can_view_techos: row.can_view_techos ?? existing?.can_view_techos ?? null,
        });
    }

    return Array.from(merged.values());
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

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function readBooleanField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'boolean' ? value : null;
}

async function loadRouteProfile(userId: string): Promise<{
    data: ProfileRouteFields | null;
    error: { message: string } | null;
}> {
    try {
        const [profileQuery, platformAdminFlag] = await Promise.all([
            supabase
                .from('profiles')
                .select('id, role')
                .eq('id', userId)
                .maybeSingle(),
            loadPlatformAdminFlag(),
        ]);

        const profile = profileQuery.data
            ? ({ ...profileQuery.data, is_platform_admin: platformAdminFlag } as ProfileRouteFields)
            : null;

        return {
            data: profile,
            error: profileQuery.error,
        };
    } catch (error) {
        return {
            data: null,
            error: { message: getErrorMessage(error) },
        };
    }
}

async function loadPlatformAdminFlag() {
    try {
        const rpcResult = await supabase.rpc('homeos_is_platform_admin');

        return rpcResult.error ? null : rpcResult.data === true;
    } catch {
        return null;
    }
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    return HOMEOS_SERVICE_ERROR_MESSAGE;
}
