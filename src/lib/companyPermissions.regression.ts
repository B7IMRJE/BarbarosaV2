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
    managementRolesCanManagePriceBookByDefault();
    unrelatedCompanyRolesCannotUseEstimateWorkflow();
    activeDispatcherCanUseDispatchWithoutManagementFlags();
    inactiveDispatcherCannotUseDispatch();
    salesTechCanAuthorProposalsWithoutOperationalControl();
    salesTechRestrictionsCannotBeOverridden();
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
    assert(!hasCompanyPermission(technician, 'can_manage_price_book'), 'Technicians should not change company selling prices by default.');
}

function managementRolesCanManagePriceBookByDefault() {
    assert(hasCompanyPermission({ role: 'owner', status: 'active' }, 'can_manage_price_book'), 'Owners should manage the Price Book.');
    assert(hasCompanyPermission({ role: 'admin', status: 'active' }, 'can_manage_price_book'), 'Admins should manage the Price Book.');
    assert(hasCompanyPermission({ role: 'manager', status: 'active' }, 'can_manage_price_book'), 'Managers should manage the Price Book.');
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

function salesTechCanAuthorProposalsWithoutOperationalControl() {
    const sales = { role: 'sales', status: 'active' };

    assert(canUseCompanyEstimateWorkflow(sales), 'Sales Tech should create estimates and proposals.');
    assert(hasCompanyPermission(sales, 'can_view_techos'), 'Sales Tech should open the scoped TechOS sales workspace.');
    assert(!hasCompanyPermission(sales, 'can_view_customers'), 'Sales Tech must not receive company-wide client directory access.');
    assert(hasCompanyPermission(sales, 'can_view_jobs'), 'Sales Tech should read authorized company work.');
    assert(!canAccessDispatch(sales), 'Sales Tech must not control Dispatch.');
    assert(!hasCompanyPermission(sales, 'can_manage_price_book'), 'Sales Tech must not manage the Price Book.');
}

function salesTechRestrictionsCannotBeOverridden() {
    const sales = {
        role: 'sales',
        status: 'active',
        permissions: {
            can_manage_price_book: true,
            can_view_customers: true,
            can_manage_company_users: true,
            can_manage_company_profile: true,
        },
    };

    assert(!hasCompanyPermission(sales, 'can_manage_price_book'), 'Sales Tech Price Book denial must override a saved profile flag.');
    assert(!hasCompanyPermission(sales, 'can_view_customers'), 'Sales Tech company-wide customer denial must override a saved profile flag.');
    assert(!hasCompanyPermission(sales, 'can_manage_company_users'), 'Sales Tech team-admin denial must override a saved profile flag.');
    assert(!hasCompanyPermission(sales, 'can_manage_company_profile'), 'Sales Tech company-admin denial must override a saved profile flag.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
