import {
    isJobReturnHandoffReady,
    parseJobReturnHandoffMaterials,
} from './jobReturnHandoff';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

const materials = parseJobReturnHandoffMaterials(`
- 1 inch PVC MIP adapter
2. PVC primer and glue
• 10 feet of one-inch PVC
1 inch PVC MIP adapter
`);

assert(materials.length === 3, 'Material parsing should trim bullets and remove duplicates.');
assert(materials[0].name === '1 inch PVC MIP adapter', 'Material names must retain field quantities and sizes.');

assert(!isJobReturnHandoffReady({
    workSummary: 'Water is isolated.',
    remainingWork: 'Connect the PVC water main.',
    scheduledFor: '2026-08-06T09:00:00-07:00',
    materials,
    noMaterialsNeeded: false,
    mediaCount: 0,
}), 'A return handoff must not save without job-site media.');

assert(isJobReturnHandoffReady({
    workSummary: 'Water is isolated and the trench is protected.',
    remainingWork: 'Pick up the listed material, connect the PVC main, test, and backfill.',
    scheduledFor: '2026-08-06T09:00:00-07:00',
    materials,
    noMaterialsNeeded: false,
    mediaCount: 2,
}), 'A documented handoff with materials and media should be ready.');

assert(isJobReturnHandoffReady({
    workSummary: 'Inspection is complete.',
    remainingWork: 'Return for the scheduled final walkthrough.',
    scheduledFor: '2026-08-06T09:00:00-07:00',
    materials: [],
    noMaterialsNeeded: true,
    mediaCount: 1,
}), 'An explicit no-materials handoff should be allowed.');

console.log('jobReturnHandoff regression checks passed');
