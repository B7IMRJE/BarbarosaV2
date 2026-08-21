import {
    canSharedCoreRoleManageCompany,
    isSharedCoreCompanyWideRole,
    isSharedCoreExplicitAssignmentRole,
} from './sharedCoreAccessPolicy';

runSharedCoreAccessPolicyRegressions();

export function runSharedCoreAccessPolicyRegressions() {
    ['owner', 'admin', 'manager', 'supervisor', 'office', 'dispatcher'].forEach((role) => {
        assert(isSharedCoreCompanyWideRole(role), `${role} must retain company-wide internal access.`);
    });
    ['technician', 'provider', 'sales', 'homeowner', 'unknown'].forEach((role) => {
        assert(!isSharedCoreCompanyWideRole(role), `${role} must not receive company-wide internal access.`);
    });
    assert(canSharedCoreRoleManageCompany('owner'), 'Owners must manage company records.');
    assert(canSharedCoreRoleManageCompany('admin'), 'Admins must manage company records.');
    assert(!canSharedCoreRoleManageCompany('manager'), 'Managers must not manage company or staff records.');
    assert(isSharedCoreExplicitAssignmentRole('technician'), 'Technicians must remain assignment-scoped.');
    assert(isSharedCoreExplicitAssignmentRole('provider'), 'Providers must remain assignment-scoped.');
    assert(!isSharedCoreExplicitAssignmentRole('sales'), 'Sales is governed by the existing sales-assignment helper.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
