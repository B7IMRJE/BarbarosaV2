import {
    mergeCompanyAccessRows,
    resolveActiveCompanyRoute,
    type CompanyRouteAccessRow,
} from './onboarding';

runOnboardingRegressions();

export function runOnboardingRegressions() {
    technicianPermissionFallbackSurvivesBlockedDirectRosterRead();
    directRosterDetailsEnrichPermissionFallback();
    technicianCompanyRouteDoesNotDependOnAHomeownerProfile();
}

function technicianCompanyRouteDoesNotDependOnAHomeownerProfile() {
    const route = resolveActiveCompanyRoute([createTechnicianAccess()]);

    assert(route?.reason === 'company-technician', 'Active technician access should resolve before homeowner profile onboarding.');
    assert(route?.route === '/techos?companyId=company-1', 'Active technician should open the correct company TechOS workspace.');
}

function technicianPermissionFallbackSurvivesBlockedDirectRosterRead() {
    const rows = mergeCompanyAccessRows([], [createTechnicianAccess()]);

    assert(rows.length === 1, 'Technician permission context should provide company routing access.');
    assert(rows[0]?.role === 'technician', 'Technician role should survive the permission fallback.');
    assert(rows[0]?.can_view_techos === true, 'Technician permission fallback should preserve TechOS access.');
}

function directRosterDetailsEnrichPermissionFallback() {
    const permissionRow = createTechnicianAccess();
    const directRow: CompanyRouteAccessRow = {
        ...permissionRow,
        full_name: 'Selene Velez',
        email: 'selene@example.com',
        can_view_techos: null,
    };
    const rows = mergeCompanyAccessRows([directRow], [permissionRow]);

    assert(rows.length === 1, 'Matching company access sources should merge into one relationship.');
    assert(rows[0]?.full_name === 'Selene Velez', 'Direct roster details should enrich the permission context.');
    assert(rows[0]?.can_view_techos === true, 'A missing direct flag should not erase permission-based TechOS access.');
}

function createTechnicianAccess(): CompanyRouteAccessRow {
    return {
        id: 'company-user-1',
        company_id: 'company-1',
        full_name: null,
        email: null,
        role: 'technician',
        status: 'active',
        created_at: null,
        can_view_techos: true,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
