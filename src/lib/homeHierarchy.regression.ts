import { getStarterItemsForAreaSystem } from './areaTemplates';
import { getSystemDefinition } from './homeSystems';
import { getSystemDefaults } from './systemDefaults';

export function runHomeHierarchyRegressions() {
    canonicalSystemsResolveWithoutCaseSensitiveDuplicates();
    gasMeterLivesInsideGasExterior();
    irrigationEquipmentStaysInIrrigation();
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

runHomeHierarchyRegressions();

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
