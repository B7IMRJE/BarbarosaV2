import {
    isProviderHomeOsRouteAllowed,
    isSalesProviderHomeOsRouteAllowed,
} from './salesProviderHomeOsRoutes';

runSalesProviderHomeOsRouteRegressions();

export function runSalesProviderHomeOsRouteRegressions() {
    assignedSalesCanOpenHomeOsAndItemCreation();
    assignedProviderMaintenanceWizardDoesNotRedirect();
    salesCannotOpenHomeOsWithoutAssignedWorkContext();
    salesCannotOpenInstalledItemEditor();
}

function assignedProviderMaintenanceWizardDoesNotRedirect() {
    assert(
        isProviderHomeOsRouteAllowed('/maintenance/wizard'),
        'The assigned provider Maintenance Wizard must remain a stable HomeOS route instead of redirecting back to TechOS.'
    );
}

function assignedSalesCanOpenHomeOsAndItemCreation() {
    assert(
        isSalesProviderHomeOsRouteAllowed('/system/Water Service/area/Whole Home', true),
        'Assigned Sales Tech should remain inside the assigned customer HomeOS.'
    );
    assert(
        isSalesProviderHomeOsRouteAllowed('/item/create', true),
        'Assigned Sales Tech should be allowed to open Add HomeOS Card.'
    );
    assert(
        isSalesProviderHomeOsRouteAllowed('/item/main-water-shutoff/catalog', true),
        'Assigned Sales Tech should be allowed to open the item-scoped catalog.'
    );
    assert(
        isSalesProviderHomeOsRouteAllowed('/maintenance/wizard', true),
        'Assigned Sales Tech should be allowed to use the guided maintenance workflow.'
    );
}

function salesCannotOpenHomeOsWithoutAssignedWorkContext() {
    assert(
        !isSalesProviderHomeOsRouteAllowed('/item/create', false),
        'Sales Tech must not add a HomeOS card without an assigned request, visit, or job.'
    );
    assert(
        !isSalesProviderHomeOsRouteAllowed('/item/main-water-shutoff/catalog', false),
        'Sales Tech must not browse an unassigned customer HomeOS catalog.'
    );
    assert(
        !isSalesProviderHomeOsRouteAllowed('/maintenance/wizard', false),
        'Sales Tech must not maintain an unassigned customer HomeOS.'
    );
}

function salesCannotOpenInstalledItemEditor() {
    assert(
        !isSalesProviderHomeOsRouteAllowed('/item/edit', true),
        'Sales Tech card creation must not unlock installed-item editing.'
    );
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}
