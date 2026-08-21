import {
    isProviderHomeOsRouteAllowed,
    isSalesProviderHomeOsRouteAllowed,
} from './salesProviderHomeOsRoutes';

runSalesProviderHomeOsRouteRegressions();

export function runSalesProviderHomeOsRouteRegressions() {
    assignedSalesCanOpenHomeOsAndItemCreation();
    providerPropertyFirstRoutesDoNotRedirect();
    assignedProviderMaintenanceWizardDoesNotRedirect();
    authorizedProvidersCanOpenAreaStructureActions();
    salesCannotOpenHomeOsWithoutAssignedWorkContext();
    salesCannotOpenInstalledItemEditor();
    salesCannotChangeAreaStructure();
}

function providerPropertyFirstRoutesDoNotRedirect() {
    const propertyFirstPaths = [
        '/home',
        '/home/interior',
        '/home/exterior',
        '/home/area/kitchen',
    ];

    for (const pathname of propertyFirstPaths) {
        assert(
            isProviderHomeOsRouteAllowed(pathname),
            `Authorized provider route ${pathname} must remain inside Client HomeOS.`
        );
        assert(
            isSalesProviderHomeOsRouteAllowed(pathname, true),
            `Assigned Sales Tech route ${pathname} must remain inside Client HomeOS.`
        );
        assert(
            !isSalesProviderHomeOsRouteAllowed(pathname, false),
            `Unassigned Sales Tech route ${pathname} must remain denied.`
        );
    }
}

function authorizedProvidersCanOpenAreaStructureActions() {
    assert(
        isProviderHomeOsRouteAllowed('/area/add-missing'),
        'Authorized provider routes must keep the in-place missing-card preview inside HomeOS.'
    );
    assert(
        isProviderHomeOsRouteAllowed('/area/duplicate'),
        'Authorized provider routes must keep the structure-only duplicate flow inside HomeOS.'
    );
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

function salesCannotChangeAreaStructure() {
    assert(
        !isSalesProviderHomeOsRouteAllowed('/area/add-missing', true),
        'Sales Tech must not modify an area starter-card structure.'
    );
    assert(
        !isSalesProviderHomeOsRouteAllowed('/area/duplicate', true),
        'Sales Tech must not duplicate HomeOS areas.'
    );
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}
