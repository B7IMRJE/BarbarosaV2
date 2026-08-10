import {
    COMPANY_PERMISSION_KEYS,
    COMPANY_ROLE_OPTIONS,
    findReusablePendingInvitation,
    formatPermissionCoverage,
} from './companyInvitationRules';
import {
    INVITATION_LOGIN_INVALID_MESSAGE,
    INVITATION_LOGIN_SERVICE_MESSAGE,
    INVITATION_LOGIN_USED_MESSAGE,
    safeInvitationLoginErrorMessage,
} from './invitationLogin';
import { buildAuthorizedWorkspaces, type CompanyRouteAccessRow } from './workspaceAccess';

runCompanyInvitationRegressions();

export function runCompanyInvitationRegressions() {
    everyTeamRoleRemainsSelectable();
    permissionFractionsRemainCoverageSummaries();
    pendingInvitesAreReusedButAcceptedOrExpiredInvitesAreNot();
    invitationFailuresStaySafeAndActionable();
    workspaceDerivationKeepsRolesAndCompaniesIsolated();
}

function everyTeamRoleRemainsSelectable() {
    assert(
        COMPANY_ROLE_OPTIONS.map((option) => option.value).join(',') ===
            'owner,admin,manager,office,dispatcher,supervisor,technician',
        'The invitation form should expose every approved company role exactly once.'
    );
}

function permissionFractionsRemainCoverageSummaries() {
    const coverageFixtures: Record<string, string[]> = {
        owner: [...COMPANY_PERMISSION_KEYS],
        admin: [...COMPANY_PERMISSION_KEYS],
        manager: [...COMPANY_PERMISSION_KEYS],
        office: ['can_view_techos', 'can_view_customers', 'can_view_jobs'],
        dispatcher: ['can_view_techos', 'can_view_customers', 'can_view_jobs'],
        supervisor: ['can_view_techos', 'can_view_customers', 'can_view_jobs'],
        technician: ['can_view_techos', 'can_view_jobs'],
    };

    assert(COMPANY_PERMISSION_KEYS.length === 8, 'Role fractions must remain permission coverage out of eight capabilities.');

    for (const role of COMPANY_ROLE_OPTIONS.map((option) => option.value)) {
        const enabledKeys = new Set(coverageFixtures[role]);
        const permissions = Object.fromEntries(
            COMPANY_PERMISSION_KEYS.map((permissionKey) => [permissionKey, enabledKeys.has(permissionKey)])
        ) as Record<(typeof COMPANY_PERMISSION_KEYS)[number], boolean>;
        assert(
            formatPermissionCoverage(permissions) === `${enabledKeys.size}/8`,
            `${role} coverage should report enabled permissions, not a seat limit.`
        );
    }
}

function pendingInvitesAreReusedButAcceptedOrExpiredInvitesAreNot() {
    const now = Date.parse('2030-01-01T00:00:00.000Z');
    const invitations = [
        { email: 'dispatcher@example.test', status: 'accepted', expires_at: '2030-01-02T00:00:00.000Z' },
        { email: 'dispatcher@example.test', status: 'pending', expires_at: '2029-12-31T00:00:00.000Z' },
        { email: 'dispatcher@example.test', status: 'pending', expires_at: '2030-01-02T00:00:00.000Z' },
    ];
    const reusable = findReusablePendingInvitation('DISPATCHER@example.test', invitations, now);

    assert(reusable === invitations[2], 'Only the fresh pending invitation should be reused for a new code.');
    assert(
        findReusablePendingInvitation('missing@example.test', invitations, now) === null,
        'An unrelated email must not reuse another invitation.'
    );
}

function invitationFailuresStaySafeAndActionable() {
    assert(safeInvitationLoginErrorMessage('already_used') === INVITATION_LOGIN_USED_MESSAGE, 'A consumed code should explain the password or administrator recovery path.');
    assert(safeInvitationLoginErrorMessage('invalid') === INVITATION_LOGIN_INVALID_MESSAGE, 'Invalid codes should remain non-enumerating.');
    assert(
        safeInvitationLoginErrorMessage('unexpected_provider_error', 'raw upstream details') === INVITATION_LOGIN_SERVICE_MESSAGE,
        'Unknown upstream failures must not leak provider details.'
    );
}

function workspaceDerivationKeepsRolesAndCompaniesIsolated() {
    const managementRoles = ['owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor'];

    for (const role of managementRoles) {
        const workspaces = buildAuthorizedWorkspaces({
            profile: { role: 'WORK' },
            companyAccess: [companyAccess({ role })],
            activePropertyMembershipCount: 0,
            companyNames: { 'company-1': 'Authorized Company', 'company-2': 'Other Company' },
        });
        assert(workspaces.some((workspace) => workspace.label === 'ManagementOS'), `${role} should retain its authorized ManagementOS destination.`);
        assert(workspaces.every((workspace) => workspace.companyId !== 'company-2'), `${role} must not receive an unrelated company route.`);
    }

    const technician = buildAuthorizedWorkspaces({
        profile: { role: 'WORK' },
        companyAccess: [companyAccess({ role: 'technician', can_view_techos: true })],
        activePropertyMembershipCount: 0,
    });
    assert(technician.length === 1 && technician[0]?.label === 'TechOS', 'Technicians should not inherit ManagementOS access.');

    const suspended = buildAuthorizedWorkspaces({
        profile: { role: 'WORK' },
        companyAccess: [companyAccess({ role: 'manager', status: 'suspended' })],
        activePropertyMembershipCount: 0,
    });
    assert(suspended.length === 0, 'Suspended company access must not yield a workspace.');
}

function companyAccess(overrides: Partial<CompanyRouteAccessRow> = {}): CompanyRouteAccessRow {
    return {
        id: 'company-user-1',
        company_id: 'company-1',
        full_name: null,
        email: null,
        role: 'manager',
        status: 'active',
        created_at: null,
        can_view_techos: false,
        ...overrides,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
