import {
    MaintenanceWizardLoadTimeoutError,
    isCurrentMaintenanceWizardLoad,
    isMaintenanceGuideStep,
    maintenanceDeckSuggestions,
    maintenanceSafetyNotice,
    maintenanceWizardItemStatus,
    maintenanceWizardRouteContextKey,
    sortMaintenanceWizardItems,
    withMaintenanceWizardLoadTimeout,
    type MaintenanceWizardItem,
} from './maintenanceWizardCore';
import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';

void runMaintenanceWizardRegressions();

async function runMaintenanceWizardRegressions() {
    stableRouteContextDoesNotRestartTheWizard();
    staleLoadsCannotReplaceCurrentResults();
    await stalledLoadsBecomeRetryableErrors();
    equipmentAndGuideRegressions();
}

function equipmentAndGuideRegressions() {
    const installed = item('installed', 'Water Heater', 'Installed', 'Good', 'garage:water_heater');
    const unknown = item('unknown', 'Main Shutoff', 'Unknown', 'Not Inspected', null);
    const missing = item('missing', 'EV Charger', 'Missing', 'Missing Information', null);

    assert(sortMaintenanceWizardItems([missing, unknown, installed]).map((entry) => entry.id).join(',') === 'installed,unknown,missing', 'Maintenance Wizard must show installed/confirmed equipment first.');
    assert(maintenanceWizardItemStatus(installed) === 'Installed / confirmed', 'Installed item cards need a plain-language status clue.');
    assert(maintenanceSafetyNotice({ name: 'Tankless Water Heater', system: 'Plumbing', category: 'Equipment' }).includes('licensed professional'), 'Hazardous equipment must show a licensed-service warning.');
    assert(isMaintenanceGuideStep('spotlight') && isMaintenanceGuideStep('section') && !isMaintenanceGuideStep('done'), 'Guided maintenance deep links must accept only bounded steps.');

    const suggestions = maintenanceDeckSuggestions([installed], [
        card('garage:water_heater', 'Water Heater', 'Equipment'),
        card('electrical_garage:ev_charger', 'EV Charger', 'Equipment'),
        card('electrical_living_room:switch_dimmer', 'Switch / Dimmer', 'Component'),
    ]);
    assert(suggestions.map((entry) => entry.name).join(',') === 'EV Charger', 'Deck suggestions must exclude installed archetypes and avoid pretending loose components are installed equipment.');
}

function stableRouteContextDoesNotRestartTheWizard() {
    const first = maintenanceWizardRouteContextKey({
        providerMode: '1',
        companyId: 'company-1',
        propertyId: 'property-1',
        jobId: 'job-1',
    });
    const decodedAgain = maintenanceWizardRouteContextKey({
        providerMode: ['1'],
        companyId: ['company-1'],
        propertyId: ['property-1'],
        jobId: ['job-1'],
    });
    const nextJob = maintenanceWizardRouteContextKey({
        providerMode: '1',
        companyId: 'company-1',
        propertyId: 'property-1',
        jobId: 'job-2',
    });

    assert(first === decodedAgain, 'Repeated Expo route decoding must not restart or remount the Maintenance Wizard.');
    assert(first !== nextJob, 'A genuinely different assigned job must reload the Maintenance Wizard context.');
}

function staleLoadsCannotReplaceCurrentResults() {
    assert(!isCurrentMaintenanceWizardLoad(4, 5), 'An obsolete equipment request must not replace current wizard results.');
    assert(isCurrentMaintenanceWizardLoad(5, 5), 'The latest equipment request should be allowed to finish.');
}

async function stalledLoadsBecomeRetryableErrors() {
    let error: unknown = null;
    try {
        await withMaintenanceWizardLoadTimeout(new Promise<never>(() => undefined), undefined, 5);
    } catch (caught) {
        error = caught;
    }

    assert(error instanceof MaintenanceWizardLoadTimeoutError, 'A stalled equipment request must become an explicit retryable timeout instead of an endless spinner.');
}

function item(id: string, name: string, installState: string, status: string, templateKey: string | null): MaintenanceWizardItem {
    return { id, item_slug: id, name, system: 'Plumbing', category: 'Equipment', location: 'Whole Home', parent_area: null, install_state: installState, status, starter_template_key: templateKey };
}

function card(templateKey: string, name: string, category: string): HomeOSStarterCardChoice {
    return { templateKey, shortCode: '', roomKind: 'whole_home', placementTags: ['whole_home'], name, system: 'Electrical', category, parentTemplateKey: null, aliases: [], displayOrder: 1 };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
