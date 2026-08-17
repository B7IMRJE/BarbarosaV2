import { buildAreaRow, buildStarterRows, type AreaTemplate } from './areaTemplates';
import {
    canonicalAreaTemplateForTrades,
    homeAreaCardActionPreviewNames,
    planAddMissingAreaCards,
    planDuplicateAreaStructure,
    suggestDuplicateAreaName,
} from './homeAreaCardActions';
import { isHomeAreaDuplicateWriteError } from './homeAreaCreation';
import { areaTemplates } from './areaTemplates';

runHomeAreaCardActionRegressions();

function runHomeAreaCardActionRegressions() {
    addMissingUpdatesTheExistingAreaOnly();
    addMissingRetryIsIdempotent();
    duplicateCopiesOnlyGenericCanonicalStructure();
    duplicateRequiresAUniquePlacementName();
    duplicateNameSuggestionIsStableAndReadable();
    tradeFilteringIsCanonicalAndServerCompatible();
    concurrentUniqueConflictsRemainSafeSkips();
    console.log('HomeOS area-card action regression checks passed.');
}

function addMissingUpdatesTheExistingAreaOnly() {
    const template = canonicalAreaTemplateForTrades(requiredTemplate('bathroom'), ['plumbing']);
    const existingArea = buildAreaRow('owner-1', 'property-1', 'Bathroom 1', 'Plumbing');
    const existingToilet = buildStarterRows('owner-1', 'property-1', 'Bathroom 1', template)
        .find((row) => row.name === 'Toilet');
    assert(existingToilet, 'Bathroom fixture must include Toilet.');
    const snapshot = JSON.stringify([existingArea, { ...existingToilet, brand: 'Existing brand', history: ['keep'] }]);
    const existingRows = [existingArea, existingToilet];
    const plan = planAddMissingAreaCards({
        userId: 'owner-1',
        propertyId: 'property-1',
        areaName: 'Bathroom 1',
        system: 'Plumbing',
        template,
        existingRows,
    });

    assert(plan.areaExists, 'Add Missing must require and reuse the current area.');
    assert(!plan.rowsToInsert.some((row) => row.category === 'Area'), 'Add Missing must never create another area.');
    assert(!homeAreaCardActionPreviewNames(plan).includes('Toilet'), 'An existing canonical card must be skipped.');
    assert(plan.rowsToInsert.every((row) => row.install_state === 'Unknown'), 'Missing cards must not be presented as installed facts.');
    assert(JSON.stringify([existingArea, { ...existingToilet, brand: 'Existing brand', history: ['keep'] }]) === snapshot, 'Planning must not change installed facts or history.');
}

function addMissingRetryIsIdempotent() {
    const template = canonicalAreaTemplateForTrades(requiredTemplate('bathroom'), ['plumbing']);
    const existingRows = [
        buildAreaRow('owner-1', 'property-1', 'Bathroom 1', 'Plumbing'),
        ...buildStarterRows('owner-1', 'property-1', 'Bathroom 1', template),
    ];
    const plan = planAddMissingAreaCards({
        userId: 'owner-1',
        propertyId: 'property-1',
        areaName: 'Bathroom 1',
        system: 'Plumbing',
        template,
        existingRows,
    });

    assert(plan.rowsToInsert.length === 0, 'A same-area retry must safely skip every existing starter card.');
    assert(plan.alreadyPresent === plan.canonicalStarterCount, 'Retry preview must report all canonical cards as already present.');
}

function duplicateCopiesOnlyGenericCanonicalStructure() {
    const template = canonicalAreaTemplateForTrades(requiredTemplate('bathroom'), ['plumbing']);
    const sourceArea = buildAreaRow('owner-1', 'property-1', 'Bathroom 1', 'Plumbing');
    const sourceInstalledRecord = {
        ...buildStarterRows('owner-1', 'property-1', 'Bathroom 1', template)[0],
        brand: 'Do not copy',
        model: 'Private model',
        photo_url: 'private-photo',
        price: 999,
        history: ['service event'],
    };
    const plan = planDuplicateAreaStructure({
        userId: 'owner-1',
        propertyId: 'property-1',
        sourceAreaName: 'Bathroom 1',
        targetAreaName: 'Bathroom 2',
        system: 'Plumbing',
        template,
        existingRows: [sourceArea, sourceInstalledRecord],
    });

    assert(plan.areaExists, 'Duplicate must resolve the source area before copying.');
    assert(!plan.targetAlreadyExists, 'A unique destination should be available.');
    assert(plan.rowsToInsert.at(-1)?.category === 'Area', 'Starter structure must be written before the area trigger.');
    for (const row of plan.rowsToInsert.filter((candidate) => candidate.category !== 'Area')) {
        assert(row.install_state === 'Unknown', 'Duplicated starter archetypes must remain unconfirmed.');
        assert(Boolean(row.starter_template_key), 'Only reusable canonical archetypes may be copied.');
        assert(!('brand' in row) && !('model' in row) && !('photo_url' in row) && !('price' in row) && !('history' in row), 'Duplicate payload must exclude installed facts, media, pricing, and history.');
    }
}

function duplicateRequiresAUniquePlacementName() {
    const template = canonicalAreaTemplateForTrades(requiredTemplate('bathroom'), ['plumbing']);
    const plan = planDuplicateAreaStructure({
        userId: 'owner-1',
        propertyId: 'property-1',
        sourceAreaName: 'Bathroom 1',
        targetAreaName: 'Bathroom 2',
        system: 'Plumbing',
        template,
        existingRows: [
            buildAreaRow('owner-1', 'property-1', 'Bathroom 1', 'Plumbing'),
            buildAreaRow('owner-1', 'property-1', 'Bathroom 2', 'Plumbing'),
        ],
    });

    assert(plan.targetAlreadyExists, 'Duplicate must reject an existing area in the same placement.');
    assert(plan.rowsToInsert.length === 0, 'A conflicting destination must create nothing.');
}

function duplicateNameSuggestionIsStableAndReadable() {
    assert(
        suggestDuplicateAreaName('Bathroom 1', ['Bathroom 1', 'Bathroom 2']) === 'Bathroom 3',
        'Numbered rooms should use the next available human-readable number.',
    );
    assert(
        suggestDuplicateAreaName('Pool Shower', ['Pool Shower', 'Pool Shower Copy']) === 'Pool Shower Copy 2',
        'Custom area copies should receive a unique readable suffix.',
    );
}

function tradeFilteringIsCanonicalAndServerCompatible() {
    const template: AreaTemplate = {
        id: 'test',
        name: 'Test Area',
        icon: '🧪',
        starterItems: {
            Plumbing: [{
                name: 'Valve', system: 'Plumbing', category: 'Component', status: 'Missing Information', install_state: 'Unknown', templateKey: 'test:valve',
            }],
            Electrical: [{
                name: 'Panel', system: 'Electrical', category: 'Equipment', status: 'Missing Information', install_state: 'Unknown', templateKey: 'test:panel',
            }],
            Legacy: [{
                name: 'Loose suggestion', system: 'Plumbing', category: 'Component', status: 'Missing Information', install_state: 'Unknown',
            }],
        },
    };
    const filtered = canonicalAreaTemplateForTrades(template, ['plumbing']);
    const names = Object.values(filtered.starterItems).flat().map((item) => item.name);

    assert(names.includes('Valve'), 'Enabled-trade canonical cards should remain available.');
    assert(!names.includes('Panel'), 'Disabled-trade cards must not appear in the action preview.');
    assert(!names.includes('Loose suggestion'), 'Unmapped suggestions must not bypass server-enforced Deck identity.');
}

function concurrentUniqueConflictsRemainSafeSkips() {
    assert(isHomeAreaDuplicateWriteError({ code: '23505' }), 'Concurrent same-placement inserts must resolve as safe skips.');
}

function requiredTemplate(id: string) {
    const template = areaTemplates.find((candidate) => candidate.id === id);
    assert(template, `Missing ${id} area template.`);
    return template;
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
