import {
    isMaintenanceGuideStep,
    maintenanceDeckSuggestions,
    maintenanceSafetyNotice,
    maintenanceWizardItemStatus,
    sortMaintenanceWizardItems,
    type MaintenanceWizardItem,
} from './maintenanceWizardCore';
import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';

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

console.log('Maintenance Wizard regression checks passed.');

function item(id: string, name: string, installState: string, status: string, templateKey: string | null): MaintenanceWizardItem {
    return { id, item_slug: id, name, system: 'Plumbing', category: 'Equipment', location: 'Whole Home', parent_area: null, install_state: installState, status, starter_template_key: templateKey };
}

function card(templateKey: string, name: string, category: string): HomeOSStarterCardChoice {
    return { templateKey, shortCode: '', roomKind: 'whole_home', placementTags: ['whole_home'], name, system: 'Electrical', category, parentTemplateKey: null, aliases: [], displayOrder: 1 };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
