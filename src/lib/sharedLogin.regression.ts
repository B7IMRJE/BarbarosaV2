import {
    AUTH_SERVICE_ERROR_MESSAGE,
    classifyLoginError,
    safeLoginErrorMessage,
    SESSION_START_ERROR_MESSAGE,
    SHARED_LOGIN_ACTION,
    SHARED_LOGIN_HEADING,
    SHARED_LOGIN_SUPPORTING_TEXT,
} from './loginFlow';
import {
    buildAuthorizedWorkspaces,
    resolveAuthorizedWorkspaceRoute,
    resolveSuperOSAccessRedirect,
    type AuthorizedWorkspaceResolutionInput,
    type CompanyRouteAccessRow,
} from './workspaceAccess';

runSharedLoginRegressions();

export function runSharedLoginRegressions() {
    ordinaryLoginCopyIsNeutral();
    singleAuthorizedWorkspaceRoutesDirectly();
    multipleAuthorizedWorkspacesUseChooser();
    unauthorizedAndInactiveWorkspacesAreExcluded();
    superOSShellRequiresPlatformAdministration();
    inviteContextRemainsAvailable();
    authSessionAndWorkspaceFailuresStayDistinct();
}

function ordinaryLoginCopyIsNeutral() {
    assert(SHARED_LOGIN_HEADING === 'Welcome back', 'The shared login heading must remain neutral.');
    assert(
        SHARED_LOGIN_SUPPORTING_TEXT === 'Sign in to continue to your workspace',
        'The shared login support copy must not preselect a product.',
    );
    assert(SHARED_LOGIN_ACTION === 'Sign in', 'The primary action should use standard sign-in wording.');
    assert(!`${SHARED_LOGIN_HEADING} ${SHARED_LOGIN_SUPPORTING_TEXT}`.includes('HomeOS Login'), 'Ordinary login must not be branded as HomeOS-only.');
}

function singleAuthorizedWorkspaceRoutesDirectly() {
    const administration = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'SUPER_ADMIN' },
    }));
    assert(administration.route === '/super-admin', 'A platform administrator should open SuperOS directly.');
    assert(administration.workspaces?.[0]?.label === 'SuperOS', 'The platform workspace must use the SuperOS user-facing name.');

    const management = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'WORK' },
        companyAccess: [companyAccess({ role: 'manager' })],
    }));
    assert(management.route === '/super-admin/company/company-1', 'A single management role should open ManagementOS directly.');

    const technician = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'WORK' },
        companyAccess: [companyAccess({ role: 'technician', can_view_techos: true })],
    }));
    assert(technician.route === '/techos?companyId=company-1', 'A single technician role should open TechOS directly.');

    const homeowner = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'HOMEOWNER' },
        activePropertyMembershipCount: 1,
    }));
    assert(homeowner.route === '/', 'A single homeowner workspace should open HomeOS directly.');
}

function multipleAuthorizedWorkspacesUseChooser() {
    const decision = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'HOMEOWNER' },
        companyAccess: [companyAccess({ role: 'manager', can_view_techos: true })],
        activePropertyMembershipCount: 1,
    }));
    const labels = (decision.workspaces || []).map((workspace) => workspace.label).sort();

    assert(decision.reason === 'multiple-workspaces', 'Multiple valid destinations must use the workspace chooser.');
    assert(decision.route === '/workspace', 'Multiple valid destinations must open the chooser route.');
    assert(labels.join(',') === 'HomeOS,ManagementOS,TechOS', 'The chooser should show every authorized workspace.');

    const ownerDecision = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'SUPER_ADMIN' },
        activePropertyMembershipCount: 1,
    }));
    const ownerLabels = (ownerDecision.workspaces || []).map((workspace) => workspace.label).sort();
    assert(ownerDecision.route === '/workspace', 'A SuperOS owner with HomeOS access should use the chooser.');
    assert(ownerLabels.join(',') === 'HomeOS,SuperOS', 'The chooser must label the platform destination SuperOS without inventing TechOS access.');
}

function superOSShellRequiresPlatformAdministration() {
    const technician = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'WORK' },
        companyAccess: [companyAccess({ role: 'technician', can_view_techos: true })],
    }));
    assert(
        resolveSuperOSAccessRedirect(technician) === '/techos?companyId=company-1',
        'A company technician who reaches the SuperOS shell must be sent to company-scoped TechOS.',
    );

    const management = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'WORK' },
        companyAccess: [companyAccess({ role: 'manager' })],
    }));
    assert(
        resolveSuperOSAccessRedirect(management) === '/super-admin/company/company-1',
        'A company manager who reaches the SuperOS shell must be sent to scoped ManagementOS.',
    );

    const multipleCompanyWorkspaces = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'WORK' },
        companyAccess: [companyAccess({ role: 'manager', can_view_techos: true })],
    }));
    assert(
        resolveSuperOSAccessRedirect(multipleCompanyWorkspaces) === '/workspace',
        'A non-platform user with several company workspaces must choose an authorized workspace.',
    );

    const administration = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'SUPER_ADMIN' },
    }));
    assert(
        resolveSuperOSAccessRedirect(administration) === null,
        'A platform administrator must retain direct SuperOS access.',
    );

    const administrationAndHome = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'SUPER_ADMIN' },
        activePropertyMembershipCount: 1,
    }));
    assert(
        resolveSuperOSAccessRedirect(administrationAndHome) === null,
        'A platform administrator with several workspaces must still be allowed to open SuperOS directly.',
    );
}

function unauthorizedAndInactiveWorkspacesAreExcluded() {
    const workspaces = buildAuthorizedWorkspaces(input({
        profile: { role: 'WORK' },
        companyAccess: [
            companyAccess({ role: 'manager', can_view_techos: false }),
            companyAccess({ company_id: 'company-2', role: 'technician', status: 'suspended', can_view_techos: true }),
        ],
    }));

    assert(workspaces.length === 1, 'Inactive and ungranted workspaces must not appear.');
    assert(workspaces[0]?.label === 'ManagementOS', 'A management role without TechOS permission must not receive TechOS.');
    assert(workspaces[0]?.companyId === 'company-1', 'Only the authorized company should appear.');
}

function inviteContextRemainsAvailable() {
    const pendingInvite = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'WORK' },
    }));
    assert(pendingInvite.route === '/company-invite', 'An unclaimed work invitation should retain its onboarding route.');

    const preferredInviteCompany = resolveAuthorizedWorkspaceRoute(input({
        profile: { role: 'HOMEOWNER' },
        companyAccess: [companyAccess({ role: 'manager' })],
        activePropertyMembershipCount: 1,
        preferredCompanyId: 'company-1',
    }));
    assert(
        preferredInviteCompany.route === '/super-admin/company/company-1',
        'A verified invite may direct to its backend-authorized company workspace.',
    );
}

function authSessionAndWorkspaceFailuresStayDistinct() {
    assert(classifyLoginError({ code: 'invalid_credentials' }) === 'invalid-credentials', 'Credential rejection must remain an auth-only error.');
    assert(safeLoginErrorMessage('invalid-credentials') === 'Incorrect email or password.', 'Only provider credential rejection should show credential copy.');
    assert(classifyLoginError(new Error('Failed to fetch')) === 'service-unavailable', 'Network failures must not look like credential failures.');
    assert(safeLoginErrorMessage('service-unavailable') === AUTH_SERVICE_ERROR_MESSAGE, 'Network failures should use a neutral service message.');
    assert(classifyLoginError({ code: 'email_not_confirmed' }) === 'email-not-confirmed', 'Unconfirmed email should remain distinct.');
    assert(classifyLoginError({ status: 429 }) === 'rate-limited', 'Rate limiting should remain distinct.');
    assert(!SESSION_START_ERROR_MESSAGE.toLowerCase().includes('password'), 'Session startup errors must not blame the password.');
}

function input(overrides: Partial<AuthorizedWorkspaceResolutionInput> = {}): AuthorizedWorkspaceResolutionInput {
    return {
        profile: { role: 'HOMEOWNER' },
        companyAccess: [],
        activePropertyMembershipCount: 0,
        companyNames: { 'company-1': 'Bravo Plumbing', 'company-2': 'Other Company' },
        ...overrides,
    };
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
