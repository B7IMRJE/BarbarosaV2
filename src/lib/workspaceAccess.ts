export const HOME_ROUTE = '/' as const;
export const SUPER_ADMIN_ROUTE = '/super-admin' as const;
export const FIRST_HOME_ONBOARDING_ROUTE = '/onboarding/create-home' as const;
export const TECHOS_ROUTE = '/techos' as const;
export const COMPANY_INVITE_ROUTE = '/company-invite' as const;
export const WORKSPACE_CHOOSER_ROUTE = '/workspace' as const;
export const WORKSPACE_ACCESS_ERROR_MESSAGE = 'You are signed in, but we could not load your authorized workspace. Please try again.';

const MANAGEMENT_COMPANY_ROLES = ['owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor'];
const TECHOS_COMPANY_ROLES = ['technician'];
const STAFF_PROFILE_ROLES = ['TECH', 'TECHNICIAN', 'FIELD_TECH', 'FIELD-TECH', 'FIELD TECHNICIAN', 'OFFICE', 'MANAGER', 'ADMIN', 'OWNER', 'DISPATCHER', 'DISPATCH', 'SUPERVISOR'];

export type ProfileRouteFields = {
    id?: string | null;
    role?: string | null;
    is_platform_admin?: boolean | null;
};

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

export type AuthorizedWorkspaceKind = 'administration' | 'management' | 'technician' | 'home';

export type AuthorizedWorkspace = {
    id: string;
    kind: AuthorizedWorkspaceKind;
    label: 'SuperOS' | 'ManagementOS' | 'TechOS' | 'HomeOS';
    description: string;
    route: string;
    companyId?: string;
};

export type LoggedInUserRouteReason =
    | 'super-admin'
    | 'company-management'
    | 'company-technician'
    | 'multiple-workspaces'
    | 'staff'
    | 'work-pending-invite'
    | 'homeowner-active-membership'
    | 'homeowner-needs-first-home'
    | 'profile-missing'
    | 'profile-query-error'
    | 'membership-query-error'
    | 'service-unavailable'
    | 'unexpected-error';

export type LoggedInUserRouteDecision = {
    route: string;
    reason: LoggedInUserRouteReason;
    companyId?: string | null;
    companyRole?: string | null;
    allowedCompanyIds?: string[];
    message?: string;
    workspaces?: AuthorizedWorkspace[];
};

export type AuthorizedWorkspaceResolutionInput = {
    profile: ProfileRouteFields | null;
    companyAccess: CompanyRouteAccessRow[];
    activePropertyMembershipCount: number;
    companyNames?: Record<string, string>;
    preferredCompanyId?: string | null;
};

export function isSuperAdminProfile(profile?: ProfileRouteFields | null) {
    return normalizeProfileRole(profile?.role) === 'SUPER_ADMIN' || profile?.is_platform_admin === true;
}

export function resolveAuthorizedWorkspaceRoute(
    input: AuthorizedWorkspaceResolutionInput
): LoggedInUserRouteDecision {
    const workspaces = buildAuthorizedWorkspaces(input);
    const allowedCompanyIds = Array.from(new Set(
        workspaces.map((workspace) => workspace.companyId).filter((value): value is string => Boolean(value))
    ));
    const preferredCompanyId = String(input.preferredCompanyId || '').trim();
    const preferredWorkspace = preferredCompanyId
        ? workspaces.find((workspace) => workspace.companyId === preferredCompanyId)
        : null;

    if (preferredWorkspace) {
        return workspaceRouteDecision(preferredWorkspace, workspaces, allowedCompanyIds, input.companyAccess);
    }

    if (workspaces.length > 1) {
        return {
            route: WORKSPACE_CHOOSER_ROUTE,
            reason: 'multiple-workspaces',
            allowedCompanyIds,
            workspaces,
        };
    }

    if (workspaces.length === 1) {
        return workspaceRouteDecision(workspaces[0], workspaces, allowedCompanyIds, input.companyAccess);
    }

    const role = normalizeProfileRole(input.profile?.role);

    if (!input.profile) return serviceUnavailableRouteDecision();

    if (role === 'WORK') {
        return {
            route: COMPANY_INVITE_ROUTE,
            reason: 'work-pending-invite',
            message: 'Open your company invitation link to finish work account setup.',
        };
    }

    if (role === 'HOMEOWNER') {
        return {
            route: FIRST_HOME_ONBOARDING_ROUTE,
            reason: 'homeowner-needs-first-home',
        };
    }

    return serviceUnavailableRouteDecision();
}

export function buildAuthorizedWorkspaces(
    input: AuthorizedWorkspaceResolutionInput
): AuthorizedWorkspace[] {
    const workspaces: AuthorizedWorkspace[] = [];
    const companyNames = input.companyNames || {};

    if (isSuperAdminProfile(input.profile)) {
        workspaces.push({
            id: 'administration',
            kind: 'administration',
            label: 'SuperOS',
            description: 'Manage the Barbarosa platform',
            route: SUPER_ADMIN_ROUTE,
        });
    }

    for (const access of input.companyAccess) {
        const companyId = String(access.company_id || '').trim();
        if (!companyId || normalizeCompanyUserStatus(access.status) !== 'active') continue;

        const role = normalizeCompanyUserRole(access.role);
        const companyName = companyNames[companyId] || 'your company';

        if (MANAGEMENT_COMPANY_ROLES.includes(role)) {
            workspaces.push({
                id: `management:${companyId}`,
                kind: 'management',
                label: 'ManagementOS',
                description: `Manage ${companyName}`,
                route: companyManagementRoute(companyId),
                companyId,
            });
        }

        if (access.can_view_techos === true || TECHOS_COMPANY_ROLES.includes(role)) {
            workspaces.push({
                id: `technician:${companyId}`,
                kind: 'technician',
                label: 'TechOS',
                description: `Open field work for ${companyName}`,
                route: techOSRoute(companyId),
                companyId,
            });
        }
    }

    if (input.activePropertyMembershipCount > 0) {
        workspaces.push({
            id: 'home',
            kind: 'home',
            label: 'HomeOS',
            description: 'Manage your home',
            route: HOME_ROUTE,
        });
    }

    const role = normalizeProfileRole(input.profile?.role);
    const hasTechnicianWorkspace = workspaces.some((workspace) => workspace.kind === 'technician');

    if (!hasTechnicianWorkspace && STAFF_PROFILE_ROLES.includes(role)) {
        workspaces.push({
            id: 'technician',
            kind: 'technician',
            label: 'TechOS',
            description: 'Open your technician workspace',
            route: TECHOS_ROUTE,
        });
    }

    return Array.from(new Map(workspaces.map((workspace) => [workspace.id, workspace])).values());
}

export function normalizeCompanyUserRole(role?: string | null) {
    const normalizedRole = String(role || '').trim().toLowerCase();

    if (['tech', 'field_tech', 'field-tech', 'field technician'].includes(normalizedRole)) return 'technician';
    if (normalizedRole === 'dispatch') return 'dispatcher';
    return normalizedRole;
}

export function normalizeCompanyUserStatus(status?: string | null) {
    return String(status || '').trim().toLowerCase();
}

export function companyManagementRoute(companyId: string) {
    return `/super-admin/company/${companyId}`;
}

export function techOSRoute(companyId: string) {
    return `${TECHOS_ROUTE}?companyId=${encodeURIComponent(companyId)}`;
}

export function serviceUnavailableRouteDecision(): LoggedInUserRouteDecision {
    return {
        route: HOME_ROUTE,
        reason: 'service-unavailable',
        message: WORKSPACE_ACCESS_ERROR_MESSAGE,
    };
}

function workspaceRouteDecision(
    workspace: AuthorizedWorkspace,
    workspaces: AuthorizedWorkspace[],
    allowedCompanyIds: string[],
    companyAccess: CompanyRouteAccessRow[]
): LoggedInUserRouteDecision {
    const access = workspace.companyId
        ? companyAccess.find((row) => row.company_id === workspace.companyId)
        : null;
    const common = {
        route: workspace.route,
        allowedCompanyIds,
        workspaces,
        companyId: workspace.companyId || null,
        companyRole: access ? normalizeCompanyUserRole(access.role) : null,
    };

    if (workspace.kind === 'administration') return { ...common, reason: 'super-admin' as const };
    if (workspace.kind === 'management') return { ...common, reason: 'company-management' as const };
    if (workspace.kind === 'technician') {
        return {
            ...common,
            reason: workspace.companyId ? 'company-technician' : 'staff',
        };
    }

    return { ...common, reason: 'homeowner-active-membership' };
}

function normalizeProfileRole(role?: string | null) {
    const normalizedRole = String(role || '').trim().toUpperCase();
    return normalizedRole || 'HOMEOWNER';
}
