import { getStarterItemsForAreaSystem } from './areaTemplates';
import { getSystemDefinition } from './homeSystems';
import { getSystemDefaults } from './systemDefaults';

export function runHomeHierarchyRegressions() {
    canonicalSystemsResolveWithoutCaseSensitiveDuplicates();
    gasMeterLivesInsideGasExterior();
    irrigationEquipmentStaysInIrrigation();
    electricalKitchenContainsOnlyElectricalStarterCards();
}

function canonicalSystemsResolveWithoutCaseSensitiveDuplicates() {
    assert(
        getSystemDefinition('plumbing')?.key === 'Plumbing',
        'Lowercase Plumbing records must resolve to Water Service.'
    );
    assert(
        getSystemDefinition('hvac')?.key === 'HVAC',
        'Lowercase HVAC records must resolve to AC Service.'
    );
}

function gasMeterLivesInsideGasExterior() {
    const gasAreas = getSystemDefaults('Gas').areas;
    const exteriorItems = getStarterItemsForAreaSystem('Exterior', 'Gas');

    assert(!gasAreas.includes('Gas Meter'), 'Gas Meter must not appear as a top-level area.');
    assert(
        exteriorItems.some((item) => item.name === 'Gas Meter' && item.category === 'Equipment'),
        'Gas Exterior must offer Gas Meter as an activatable equipment card.'
    );
}

function irrigationEquipmentStaysInIrrigation() {
    const gasExteriorItems = getStarterItemsForAreaSystem('Exterior', 'Gas');
    const irrigationFrontYardItems = getStarterItemsForAreaSystem('Front Yard', 'Irrigation');

    assert(
        !gasExteriorItems.some((item) => item.system === 'Irrigation'),
        'Gas Exterior must not absorb irrigation starter equipment.'
    );
    assert(
        irrigationFrontYardItems.some((item) => item.name === 'Irrigation Controller'),
        'Front Yard irrigation starter equipment must remain in Irrigation.'
    );
}

function electricalKitchenContainsOnlyElectricalStarterCards() {
    const electricalItems = getStarterItemsForAreaSystem('Kitchen', 'Electrical System');
    const names = new Set(electricalItems.map((item) => item.name));

    [
        'Counter GFCI - Left of Sink',
        'Counter GFCI - Right of Sink',
        'Refrigerator Dedicated Outlet',
        'Dishwasher Dedicated Outlet',
        'Microwave Dedicated Outlet',
        'Garbage Disposal Dedicated Outlet',
        'Under-Cabinet LED Lighting',
        'Kitchen Exhaust Fan',
        'USB Outlet',
        'USB-C Outlet',
        'Ethernet / Data Outlet',
    ].forEach((name) => {
        assert(names.has(name), `Electrical Kitchen must offer ${name}.`);
    });

    assert(
        electricalItems.every((item) => item.system === 'Electrical'),
        'Electrical Kitchen starter cards must all belong to Electrical.'
    );
    assert(!names.has('Dishwasher Supply Line'), 'Electrical Kitchen must not show plumbing supply lines.');
    assert(!names.has('Dishwasher Air Gap'), 'Electrical Kitchen must not show plumbing air gaps.');
    assert(!names.has('Refrigerator Water Line'), 'Electrical Kitchen must not show water lines.');
    assert(!names.has('Kitchen Drain / P-Trap'), 'Electrical Kitchen must not show sewer fixtures.');
}

runHomeHierarchyRegressions();

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
