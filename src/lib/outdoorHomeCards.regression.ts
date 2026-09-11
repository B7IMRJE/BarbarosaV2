import { availableOutdoorHomeCards } from './outdoorHomeCards';
import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';
import { resolveHomeOSCardSemanticVisual } from '../components/homeos/homeos-visual-assets';

function assert(value: unknown, message: string): asserts value {
    if (!value) throw new Error(message);
}
function card(templateKey: string, name: string, aliases: string[] = []): HomeOSStarterCardChoice {
    return { templateKey, name, aliases, roomKind: 'exterior', placementTags: ['front_yard','back_yard'],
        system: 'Plumbing', category: 'Equipment', parentTemplateKey: null, presentationRole: 'container',
        autoProvision: false, displayOrder: 0, shortCode: '', tradeKey: 'plumbing' };
}
const cards = [
    card('exterior:vacuum_breaker', 'Vacuum Breaker', ['Hose Connection Vacuum Breaker']),
    card('exterior:hose_bibb_with_vacuum_breaker', 'Hose Bibb with Vacuum Breaker'),
    card('exterior:hose_bibb', 'Outdoor Hose Bibb', ['Front Yard Hose Bibbs']),
    card('exterior:main_cleanout', 'Main Cleanout', ['Front Yard Main Cleanout']),
    card('exterior:irrigation_system', 'Irrigation System', ['Irrigation Front Yard']),
    card('whole_home:main_water_shutoff', 'Main Water Shutoff'),
    { ...card('exterior:component', 'Replacement Part'), parentTemplateKey: 'exterior:hose_bibb', presentationRole: 'component' as const },
];
const existing = [{name:'Front Yard Hose Bibbs'}, {name:'Front Yard Main Cleanout'}, {name:'Irrigation Front Yard'}];
const before = JSON.stringify(existing);
const choices = availableOutdoorHomeCards(cards, existing, {areaName:'Front Yard', parentAreaName:'Exterior'});
assert(choices.length === 2, 'Existing legacy cards must be recognized; only the two vacuum-breaker choices remain.');
assert(choices[0].templateKey !== choices[1].templateKey, 'Standalone and combined devices must remain distinct.');
assert(JSON.stringify(existing) === before, 'Browsing available cards must not rewrite saved home records.');
assert(!choices.some(c=>c.templateKey.includes('main_water')), 'Do not propose an assumed Front Yard main shutoff.');
assert(availableOutdoorHomeCards(cards, [], {areaName:'Kitchen'}).length === 0, 'Outdoor choices must not appear in unrelated interior rooms.');
assert(availableOutdoorHomeCards(cards, [], {areaName:'Backyard'}).length === 5, 'Backyard spelling must expose the same optional outdoor choices.');
const recordedVacuum = availableOutdoorHomeCards(cards, [...existing, {name:'Renamed breaker',starter_template_key:'exterior:vacuum_breaker'}], {areaName:'Front Yard'});
assert(recordedVacuum.length === 1 && recordedVacuum[0].templateKey.includes('with_vacuum'), 'A recorded standalone breaker must not hide the combination faucet.');
const visuals = [
    ['exterior:vacuum_breaker','vacuum-breaker'],
    ['exterior:hose_bibb_with_vacuum_breaker','hose-bibb-vacuum-breaker'],
    ['exterior:water_pressure_regulator','pressure-regulator'],
    ['exterior:water_meter','water-meter'],
    ['exterior:irrigation_backflow_preventer','backflow-preventer'],
    ['exterior:irrigation_valve_box','irrigation-valve-box'],
    ['exterior:irrigation_zone_valve','irrigation-zone-valve'],
    ['exterior:irrigation_controller','irrigation-controller'],
    ['exterior:sprinkler_head','sprinkler-head'],
    ['exterior:drip_irrigation','drip-irrigation'],
    ['exterior:water_softener','water-softener'],
    ['exterior:main_cleanout','main-cleanout'],
];
for (const [identity, key] of visuals) {
    assert(resolveHomeOSCardSemanticVisual('My renamed equipment','equipment',identity)?.key === key, `The card ${identity} must retain its specific artwork when renamed.`);
}
assert(resolveHomeOSCardSemanticVisual('Front Yard Hose Bibbs','equipment')?.key === 'garage-hose-bibb','Legacy hose bibbs must receive the existing detailed faucet picture.');
assert(resolveHomeOSCardSemanticVisual('Irrigation Front Yard','equipment')?.key === 'irrigation-controller','Legacy irrigation cards must receive detailed irrigation artwork.');
console.log('PASS outdoor choices, legacy matching, location neutrality, and distinct equipment artwork');
