import {
    canAccessDispatch,
    canUseCompanyEstimateWorkflow,
    hasCompanyPermission,
} from './companyPermissions';

runCompanyPermissionsRegressions();

export function runCompanyPermissionsRegressions() {
    activeTechnicianCanUseEstimateWorkflow();
    activeTechAliasCanUseEstimateWorkflow();
    inactiveTechnicianCannotUseEstimateWorkflow();
    estimateWorkflowDoesNotGrantTechnicianManagementFlags();
    unrelatedCompanyRolesCannotUseEstimateWorkflow();
    activeDispatcherCanUseDispatchWithoutManagementFlags();
    inactiveDispatcherCannotUseDispatch();
}

function activeTechnicianCanUseEstimateWorkflow() {
    assert(canUseCompanyEstimateWorkflow({
        role: 'technician',
        status: 'active',
        permissions: {
            can_create_estimates: false,
            can_add_item_to_estimate: false,
        },
    }), 'Active technicians should use estimate workflow even when old estimate flags are false.');
}

function activeTechAliasCanUseEstimateWorkflow() {
    assert(canUseCompanyEstimateWorkflow({
        role: 'tech',
        status: 'active',
        permissions: {
            can_create_estimates: false,
            can_add_item_to_estimate: false,
        },
    }), 'Active tech alias should use estimate workflow.');
}

function inactiveTechnicianCannotUseEstimateWorkflow() {
    assert(!canUseCompanyEstimateWorkflow({
        role: 'technician',
        status: 'inactive',
        permissions: {
            can_create_estimates: true,
            can_add_item_to_estimate: true,
        },
    }), 'Inactive technicians should not use estimate workflow.');
}

function estimateWorkflowDoesNotGrantTechnicianManagementFlags() {
    const technician = {
        role: 'technician',
        status: 'active',
        permissions: {
            can_create_estimates: false,
            can_add_item_to_estimate: false,
        },
    };

    assert(canUseCompanyEstimateWorkflow(technician), 'Technician estimate workflow access should stay enabled.');
    assert(!hasCompanyPermission(technician, 'can_create_estimates'), 'Technician legacy create-estimate flag should remain false.');
    assert(!hasCompanyPermission(technician, 'can_add_item_to_estimate'), 'Technician legacy add-item flag should remain false.');
}

function unrelatedCompanyRolesCannotUseEstimateWorkflow() {
    assert(!canUseCompanyEstimateWorkflow({
        role: 'dispatcher',
        status: 'active',
        permissions: {
            can_create_estimates: false,
            can_add_item_to_estimate: false,
        },
    }), 'Unrelated active company roles should not use estimate workflow.');
}

function activeDispatcherCanUseDispatchWithoutManagementFlags() {
    const dispatcher = {
        role: 'dispatcher',
        status: 'active',
        permissions: {
            can_manage_company_users: false,
            can_manage_company_profile: false,
        },
    };

    assert(canAccessDispatch(dispatcher), 'Active dispatchers should be allowed into company dispatch operations.');
    assert(hasCompanyPermission(dispatcher, 'can_view_jobs'), 'Active dispatchers should view company jobs.');
    assert(hasCompanyPermission(dispatcher, 'can_view_customers'), 'Active dispatchers should view customer context for dispatch.');
    assert(!hasCompanyPermission(dispatcher, 'can_manage_company_users'), 'Dispatcher operations should not grant employee management.');
    assert(!hasCompanyPermission(dispatcher, 'can_manage_company_profile'), 'Dispatcher operations should not grant company ownership controls.');
}

function inactiveDispatcherCannotUseDispatch() {
    assert(!canAccessDispatch({
        role: 'dispatcher',
        status: 'suspended',
    }), 'Suspended dispatcher memberships should be denied Dispatch access.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
