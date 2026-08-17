import {
    completeRoomStarterTemplateKey,
    getCompleteRoomStarterItems,
    getCompleteRoomStarterKind,
    getLocationNeutralStarterItems,
    getMasterBathroomStarterItems,
    isCompleteRoomStarterRelation,
    isMasterBathroomAreaName,
    resolveCompleteRoomStarterTemplate,
} from './roomStarterTemplates';

const bathroom = getCompleteRoomStarterItems('bathroom');
const kitchen = getCompleteRoomStarterItems('kitchen');
const garage = getCompleteRoomStarterItems('garage');
const all = [...bathroom, ...kitchen, ...garage];
const locationNeutral = getLocationNeutralStarterItems();
const masterBathroom = getMasterBathroomStarterItems();

assert(getCompleteRoomStarterKind('Bathroom 1') === 'bathroom', 'Numbered existing bathrooms must receive the complete bathroom deck.');
assert(getCompleteRoomStarterKind('Primary Bath') === 'bathroom', 'Renamed primary bathrooms must receive the complete bathroom deck.');
assert(getCompleteRoomStarterKind('Outdoor Kitchen') === null, 'Outdoor Kitchen must not receive indoor Kitchen starter cards.');
assert(getCompleteRoomStarterKind('Chef Kitchen') === 'kitchen', 'Renamed indoor kitchens must receive the Kitchen deck.');
assert(getCompleteRoomStarterKind('Detached Garage') === 'garage', 'Renamed garages must receive the Garage deck.');

[
    'Bathroom Sink', 'Bathroom Sink Faucet', 'Shower / Tub', 'Shower Valve', 'Shower Cartridge', 'Shower Head',
    'Shower Trim', 'Tub & Shower Trim',
    'Toilet', 'Toilet Fill Valve', 'Toilet Flapper', 'Toilet Tank Bolts', 'Toilet Wax Ring', 'Toilet Seat',
].forEach((name) => assert(bathroom.some((item) => item.name === name), `Bathroom starter deck is missing ${name}.`));

[
    'Bathroom Sink', 'Bathroom Sink Faucet', 'Shower Valve', 'Shower Trim', 'Tub & Shower Trim', 'Toilet',
    'Roman / Deck-Mount Tub', 'Freestanding / Soaking Tub', 'Standalone / Walk-In Shower',
    'Shower Enclosure / Door', 'Thermostatic Shower Valve', 'Rain Shower Head', 'Hand Shower',
    'Body Sprays', 'Double Vanity', 'Bidet', 'Bidet Seat', 'Roman Tub Filler', 'Freestanding Tub Filler',
].forEach((name) => assert(masterBathroom.some((item) => item.name === name), `Master Bathroom starter deck is missing ${name}.`));
assert(isMasterBathroomAreaName('Primary Bathroom'), 'Primary Bathroom must use the Master Bathroom suggestion deck.');
assert(new Set(masterBathroom.map((item) => item.templateKey)).size === masterBathroom.length, 'Master Bathroom starter keys must not contain synonyms or duplicates.');

[
    'Kitchen Sink', 'Kitchen Faucet', 'Kitchen Sink P-Trap', 'Dishwasher', 'Dishwasher Supply Line',
    'Dishwasher Drain Hose', 'Garbage Disposal', 'Refrigerator Water Line', 'Instant Hot Water Dispenser',
    'Reverse Osmosis System', 'RO Sediment Filter', 'RO Filter Canisters',
].forEach((name) => assert(kitchen.some((item) => item.name === name), `Kitchen starter deck is missing ${name}.`));

[
    'Water Heater', 'Water Heater Cold Water Connection', 'Expansion Tank', 'TPR Valve', 'Water Heater Drain Pan',
    'Water Heater Venting', 'Water Heater Recirculation Pump', 'Garage Hose Bibb', 'Washer Box / Laundry Connections',
].forEach((name) => assert(garage.some((item) => item.name === name), `Garage starter deck is missing ${name}.`));

assert(!garage.some((item) => item.name === 'Main Water Shutoff'), 'The garage deck must not claim an unverified whole-home shutoff location.');
assert(new Set(all.map((item) => item.name)).size === all.length, 'Starter archetype names must be unique across the current three-room deck.');

const keys = [
    ...bathroom.map((item) => completeRoomStarterTemplateKey('bathroom', item.name)),
    ...kitchen.map((item) => completeRoomStarterTemplateKey('kitchen', item.name)),
    ...garage.map((item) => completeRoomStarterTemplateKey('garage', item.name)),
];
assert(new Set(keys).size === keys.length, 'Every Catalog Factory starter archetype must have one stable unique mapping key.');

const showerValve = resolveCompleteRoomStarterTemplate({ name: 'Shower Valve', location: 'Shower / Tub', parentArea: 'Bathroom 2' });
assert(showerValve?.templateKey === 'bathroom:shower_valve', 'The HomeOS Catalog action must resolve Shower Valve to the same Catalog Factory mapping key.');
const showerTrim = resolveCompleteRoomStarterTemplate({ name: 'Shower Trim', location: 'Shower / Tub', parentArea: 'Bathroom 2' });
assert(showerTrim?.templateKey === 'bathroom:shower_trim', 'Exposed Shower Trim must remain distinct from the concealed Shower Valve archetype.');
const tubShowerTrim = resolveCompleteRoomStarterTemplate({ name: 'Tub and Shower Trim', location: 'Shower / Tub', parentArea: 'Master Bathroom' });
assert(tubShowerTrim?.templateKey === 'bathroom:tub_shower_trim', 'Tub-spout trim must resolve to Tub & Shower Trim without becoming a complete Shower Valve.');
assert(bathroom.find((item) => item.name === 'Shower Trim')?.suggested === true, 'Shower Trim must remain an unconfirmed optional starter suggestion.');
assert(bathroom.find((item) => item.name === 'Tub & Shower Trim')?.suggested === true, 'Tub & Shower Trim must remain an unconfirmed optional starter suggestion.');
const smartWaterShutoff = resolveCompleteRoomStarterTemplate({ name: 'Smart Water Monitor and Shutoff', location: null, parentArea: null });
assert(smartWaterShutoff?.templateKey === 'whole_home:smart_water_shutoff', 'Location-neutral Smart Water Shutoff items must resolve to the Catalog Factory archetype without claiming an area.');
assert(smartWaterShutoff?.areaName === '', 'Location-neutral Smart Water Shutoff matching must not invent a Garage or Front Yard placement.');
const mainShutoffFrontYard = resolveCompleteRoomStarterTemplate({ name: 'Front Yard Main Water Valve', location: 'Front Yard', parentArea: null });
const mainShutoffBasement = resolveCompleteRoomStarterTemplate({ name: 'Main Water Shutoff', location: 'Basement', parentArea: null });
assert(mainShutoffFrontYard?.templateKey === 'whole_home:main_water_shutoff', 'Existing Front Yard shutoff names must preserve history while resolving to the neutral archetype.');
assert(mainShutoffBasement?.templateKey === 'whole_home:main_water_shutoff', 'A Basement shutoff must reuse the same location-neutral archetype.');
assert(mainShutoffBasement?.areaName === '', 'Main Water Shutoff taxonomy must never invent a physical location.');
const mainShutoffTemplate = locationNeutral.find((item) => item.templateKey === 'whole_home:main_water_shutoff');
assert(mainShutoffTemplate?.placementTags?.includes('front_yard') && mainShutoffTemplate.placementTags.includes('basement'), 'Main Water Shutoff must allow observed placement across interior and exterior areas.');
assert(mainShutoffTemplate?.templateKey !== smartWaterShutoff?.templateKey, 'Main Water Shutoff and Smart Water Shutoff must remain separate archetypes.');
[
    'Main Electrical Panel', 'Electrical Subpanel', 'Electrical Meter / Service Entrance', 'Receptacle / Outlet',
    'GFCI / AFCI Protection', 'Switch / Dimmer', 'Interior Light Fixture', 'Exterior Light Fixture',
    'Ceiling Fan', 'Bathroom Exhaust Fan', 'Smoke / Carbon Monoxide Alarm', 'Doorbell / Low-Voltage System',
    'Dedicated Electrical Circuit', 'EV Charger', 'Whole-Home Surge Protector', 'Electric Heater',
    'Generator / Transfer Switch',
].forEach((name) => assert(locationNeutral.some((item) => item.name === name), `Reusable Electrical Deck is missing ${name}.`));
const outlet = locationNeutral.find((item) => item.name === 'Receptacle / Outlet');
assert(outlet?.placementTags?.includes('kitchen') && outlet.placementTags.includes('bathroom'), 'Reusable electrical archetypes must expose metadata-driven placement filters without duplicating or auto-installing cards.');
const electricalPanel = resolveCompleteRoomStarterTemplate({ name: 'Breaker Panel', location: null, parentArea: null });
assert(electricalPanel?.templateKey === 'electrical_whole_home:main_electrical_panel', 'Electrical aliases must resolve to the same reusable HomeOS archetype from any selected container.');
assert(electricalPanel?.areaName === '', 'Reusable electrical archetypes must not invent a physical installed location.');
assert(isCompleteRoomStarterRelation({ areaName: 'Bathroom 1', parentName: 'Toilet', candidateName: 'Flapper' }), 'Toilet aliases should remain related to the Toilet parent.');
assert(isCompleteRoomStarterRelation({ areaName: 'Kitchen', parentName: 'RO System', candidateName: 'Sediment Filter' }), 'RO aliases should remain related to the RO parent.');

console.log(`Room starter template regression checks passed (${bathroom.length} Bathroom, ${kitchen.length} Kitchen, ${garage.length} Garage archetypes).`);

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
