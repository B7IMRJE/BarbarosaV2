// Pure app regressions; no network, credentials, real homes, or database needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadPureModule(path) {
    const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: path,
    });
    const exports = {};
    vm.runInNewContext(outputText, { exports, Error });
    return exports;
}

const { runRecoverableHomeCreation, IncompleteHomeSetupError } = loadPureModule('src/lib/home-creation-recovery.ts');
const { isEmergencyAssignmentAwaitingTechnician: pending, getEmergencyAssignmentAcceptanceLabel: label } = loadPureModule('src/lib/emergencyAssignment.ts');
let cases = 0;
async function test(name, run) {
    await run();
    cases += 1;
    console.log(`PASS ${name}`);
}

for (const mode of ['first home', 'additional home']) {
    await test(`${mode}: partial failure retries the same saved identity`, async () => {
        let saved = null;
        let creates = 0;
        let finishes = 0;
        const setup = {
            userId: 'synthetic-owner',
            createIdentity: async () => { creates += 1; return 'synthetic-property'; },
            onIdentityReady: (home) => { saved = home; },
            finishSetup: async (propertyId) => {
                assert.equal(propertyId, 'synthetic-property');
                assert.equal(saved.propertyId, propertyId, 'identity must be retained before details request');
                finishes += 1;
                if (finishes < 3) throw new Error('TEST-ONLY-SENSITIVE-DETAIL-MUST-NOT-LEAK');
            },
        };
        await assert.rejects(runRecoverableHomeCreation(setup), error => {
            assert(error instanceof IncompleteHomeSetupError);
            assert.match(error.message, /already exists.*setup is incomplete/);
            assert(!JSON.stringify(error).includes('SENSITIVE'));
            assert(!error.message.includes('SENSITIVE'));
            return true;
        });
        await assert.rejects(runRecoverableHomeCreation({ ...setup, pendingHome: saved }), IncompleteHomeSetupError);
        assert.equal(await runRecoverableHomeCreation({ ...setup, pendingHome: saved }), 'synthetic-property');
        assert.equal(creates, 1);
        assert.equal(finishes, 3);
    });
}
await test('server reuse (created=false) finishes the returned home, not a new identity', async () => {
    const id = await runRecoverableHomeCreation({
        userId: 'synthetic-owner', createIdentity: async () => 'already-existing-id',
        finishSetup: async id => assert.equal(id, 'already-existing-id'),
    });
    assert.equal(id, 'already-existing-id');
});
await test('identity failure is not incorrectly reported as successful creation', async () => {
    let touched = false;
    await assert.rejects(runRecoverableHomeCreation({
        userId: 'synthetic-owner', createIdentity: async () => { throw new Error('identity unavailable'); },
        onIdentityReady: () => { touched = true; }, finishSetup: async () => { touched = true; },
    }), /identity unavailable/);
    assert(!touched);
});
await test('switching accounts cannot resume another user’s unfinished home', async () => {
    let touched = false;
    await assert.rejects(runRecoverableHomeCreation({
        userId: 'other-user', pendingHome: { userId: 'synthetic-owner', propertyId: 'synthetic-property' },
        createIdentity: async () => { touched = true; return ''; },
        finishSetup: async () => { touched = true; },
    }), /different sign-in/);
    assert(!touched);
});

const emergency = { request_type: 'emergency' };
const slot = { technician_company_user_id: 'synthetic-tech', status: 'scheduled', technician_acknowledged_at: null };
await test('new assigned emergency must be accepted; old request date cannot waive it', () => {
    assert(pending({ ...emergency, created_at: '2000-01-01' }, slot));
});
for (const basis of ['existing_lead_activity']) {
    await test(`${basis}: persisted compatibility is not an acknowledgement`, () => {
        const legacy = { ...slot, emergency_acceptance_compatibility: basis };
        assert(!pending(emergency, legacy));
        assert.match(label(emergency, legacy), /Legacy Assignment/);
        assert(!label(emergency, legacy).includes('Technician Accepted'));
        assert.equal(legacy.technician_acknowledged_at, null);
    });
}
await test('unverified operational/request-derived status cannot hide the required acceptance', () => {
    for (const status of ['on_my_way', 'arrived', 'in_progress', 'working']) {
        assert(pending(emergency, { ...slot, status }));
    }
});
await test('reassignment with cleared compatibility needs explicit acceptance again', () => {
    assert(pending(emergency, { ...slot, technician_company_user_id: 'replacement-tech', emergency_acceptance_compatibility: null }));
    assert(pending(emergency, { ...slot, emergency_acceptance_compatibility: 'invalid' }));
});
await test('real acknowledgement, closed visits, unassigned jobs and ordinary work remain distinct', () => {
    const accepted = { ...slot, technician_acknowledged_at: '2020-01-01T12:00:00Z' };
    assert(!pending(emergency, accepted));
    assert.match(label(emergency, accepted), /Technician Accepted/);
    assert(!pending(emergency, { ...slot, status: 'completed' }));
    assert(!pending(emergency, { ...slot, visit_closed_at: '2020-01-01T12:00:00Z' }));
    assert(!pending(emergency, { ...slot, visit_outcome: 'completed_successfully' }));
    assert(!pending(emergency, { ...slot, technician_company_user_id: null }));
    assert(!pending({ request_type: 'regular' }, slot));
});

await test('screen and data adapters wire the recovery and compatibility decisions', () => {
    const home = readFileSync('src/app/onboarding/create-home.tsx', 'utf8');
    assert(home.includes('pendingHome, onIdentityReady: setPendingHome'));
    assert(home.includes('createAdditionalHomeIdentity(input, recovery)'));
    assert(home.includes('createFirstHomeIdentity(input, recovery)'));
    assert(home.includes('Retry Home Setup'));
    assert(home.includes('disabled={submitting || !!pendingHome}'));
    const identity = readFileSync('src/lib/homeIdentity.ts', 'utf8');
    assert(identity.includes("createHomeIdentity(input, 'create_homeowner_first_property', recovery)"));
    assert(identity.includes("createHomeIdentity(input, 'create_homeowner_property', recovery)"));
    for (const path of ['src/features/techos/TechOSScreen.tsx', 'src/features/dispatch/DispatchScreen.tsx', 'src/features/dispatch/DispatchWallScreen.tsx']) {
        const source = readFileSync(path, 'utf8');
        for (const line of source.split('\n').filter(line => line.includes('technician_acknowledged_at, technician_acknowledged_by_user_id'))) {
            assert(line.includes('emergency_acceptance_compatibility'), `${path} must load persisted compatibility`);
        }
        assert(source.includes('emergency_acceptance_compatibility: read'));
    }
    const tech = readFileSync('src/features/techos/TechOSScreen.tsx', 'utf8');
    assert(tech.includes('if (emergencyAcceptancePending || !isTechOSWorksiteStage(workflowStatus))'));
    assert(!tech.includes("readStringField(resultRecord, 'technician_acknowledged_at') || new Date()"));
});
console.log(`${cases} HomeOS recovery/compatibility app regression cases passed.`);
