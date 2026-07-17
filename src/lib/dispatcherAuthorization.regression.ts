import {
    canDispatchCompanyOperationsForSubject,
    canManageCompanyUsersForSubject,
    DISPATCH_COMPANY_OPERATION_ROLES,
    normalizeCompanyRoleValue,
} from './dispatcherAuthorization';

runDispatcherAuthorizationRegressions();

export function runDispatcherAuthorizationRegressions() {
    activeDispatcherCanReadCompanyOperations();
    dispatcherAliasNormalizesIntoDispatcherAccess();
    dispatcherDoesNotGainUserManagement();
    inactiveDispatcherIsDenied();
    homeownerIsDeniedCompanyOperations();
    operationRolesMatchExpectedBoundary();
}

function activeDispatcherCanReadCompanyOperations() {
    assert(canDispatchCompanyOperationsForSubject({
        role: 'dispatcher',
        status: 'active',
    }), 'Active dispatchers should be authorized for company operations.');
}

function dispatcherAliasNormalizesIntoDispatcherAccess() {
    assert(normalizeCompanyRoleValue('dispatch') === 'dispatcher', 'dispatch role alias should normalize to dispatcher.');
    assert(canDispatchCompanyOperationsForSubject({
        role: 'dispatch',
        status: 'active',
    }), 'dispatch alias should be authorized for company operations.');
}

function dispatcherDoesNotGainUserManagement() {
    assert(!canManageCompanyUsersForSubject({
        role: 'dispatcher',
        status: 'active',
    }), 'Dispatcher operations must not grant employee-management rights.');
}

function inactiveDispatcherIsDenied() {
    assert(!canDispatchCompanyOperationsForSubject({
        role: 'dispatcher',
        status: 'inactive',
    }), 'Inactive dispatcher memberships should be denied.');
    assert(!canDispatchCompanyOperationsForSubject({
        role: 'dispatcher',
        status: 'suspended',
    }), 'Suspended dispatcher memberships should be denied.');
}

function homeownerIsDeniedCompanyOperations() {
    assert(!canDispatchCompanyOperationsForSubject({
        role: 'homeowner',
        status: 'active',
    }), 'Homeowner accounts should not be authorized for company operations.');
}

function operationRolesMatchExpectedBoundary() {
    assert(
        DISPATCH_COMPANY_OPERATION_ROLES.join('|') === 'owner|admin|manager|office|dispatcher|supervisor',
        'Company operations should include dispatch roles without adding broad Super Admin concepts.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
