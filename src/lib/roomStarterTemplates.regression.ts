import {
    completeRoomStarterTemplateKey,
    getCompleteRoomStarterItems,
    getCompleteRoomStarterKind,
    isCompleteRoomStarterRelation,
    resolveCompleteRoomStarterTemplate,
} from './roomStarterTemplates';

const bathroom = getCompleteRoomStarterItems('bathroom');
const kitchen = getCompleteRoomStarterItems('kitchen');
const garage = getCompleteRoomStarterItems('garage');
const all = [...bathroom, ...kitchen, ...garage];

assert(getCompleteRoomStarterKind('Bathroom 1') === 'bathroom', 'Numbered existing bathrooms must receive the complete bathroom deck.');
assert(getCompleteRoomStarterKind('Primary Bath') === 'bathroom', 'Renamed primary bathrooms must receive the complete bathroom deck.');
assert(getCompleteRoomStarterKind('Outdoor Kitchen') === null, 'Outdoor Kitchen must not receive indoor Kitchen starter cards.');
assert(getCompleteRoomStarterKind('Chef Kitchen') === 'kitchen', 'Renamed indoor kitchens must receive the Kitchen deck.');
assert(getCompleteRoomStarterKind('Detached Garage') === 'garage', 'Renamed garages must receive the Garage deck.');

[
    'Bathroom Sink', 'Bathroom Sink Faucet', 'Shower / Tub', 'Shower Valve', 'Shower Cartridge', 'Shower Head',
    'Toilet', 'Toilet Fill Valve', 'Toilet Flapper', 'Toilet Tank Bolts', 'Toilet Wax Ring', 'Toilet Seat',
].forEach((name) => assert(bathroom.some((item) => item.name === name), `Bathroom starter deck is missing ${name}.`));

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
const smartWaterShutoff = resolveCompleteRoomStarterTemplate({ name: 'Smart Water Monitor and Shutoff', location: null, parentArea: null });
assert(smartWaterShutoff?.templateKey === 'whole_home:smart_water_shutoff', 'Location-neutral Smart Water Shutoff items must resolve to the Catalog Factory archetype without claiming an area.');
assert(smartWaterShutoff?.areaName === '', 'Location-neutral Smart Water Shutoff matching must not invent a Garage or Front Yard placement.');
assert(isCompleteRoomStarterRelation({ areaName: 'Bathroom 1', parentName: 'Toilet', candidateName: 'Flapper' }), 'Toilet aliases should remain related to the Toilet parent.');
assert(isCompleteRoomStarterRelation({ areaName: 'Kitchen', parentName: 'RO System', candidateName: 'Sediment Filter' }), 'RO aliases should remain related to the RO parent.');

console.log(`Room starter template regression checks passed (${bathroom.length} Bathroom, ${kitchen.length} Kitchen, ${garage.length} Garage archetypes).`);

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
