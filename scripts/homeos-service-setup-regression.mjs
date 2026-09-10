// No network or real customer data. Exercise the post-request home destination
// against the real setup adapter with controlled membership/auth/read responses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(path, overrides = {}) {
    const full = resolve(path);
    if (cache.has(full)) return cache.get(full);
    const exports = {};
    const { outputText } = ts.transpileModule(readFileSync(full, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: full,
    });
    const require = name => overrides[name] || load(resolve(dirname(full), `${name}.ts`));
    vm.runInNewContext(outputText, { exports, require, Error, URL, console });
    cache.set(full, exports);
    return exports;
}

let currentUser = 'owner';
let saved = {};
let readError = null;
const calls = [];
const { homeDestinationAfterServiceRequest: destination } = load('src/lib/home-setup-integrity.ts', {
    './activeProperty': {
        listActivePropertyMemberships: async () => ({ userId: 'owner', memberships: [
            { propertyId: 'service-home', membershipRole: 'OWNER' },
            { propertyId: 'other-home', membershipRole: 'OWNER' },
            { propertyId: 'shared-home', membershipRole: 'MEMBER' },
        ] }),
    },
    './supabase': { supabase: {
        auth: { getUser: async () => ({ data: { user: { id: currentUser } } }) },
        rpc: async (name, args) => {
            calls.push({ name, args });
            return { error: readError, data: {
                property_id: args.p_property_id, starter_state: 'unselected', can_retry: false,
                needs_details: true, needs_choice: true, completed_at: null, ...saved,
            } };
        },
    } },
});

for (const starter_state of ['unselected', 'pending', 'legacy_review']) {
    saved = { starter_state, needs_choice: starter_state !== 'pending' };
    assert.equal(await destination('service-home'), '/onboarding/base-home-wizard?propertyId=service-home');
    assert.equal(calls.at(-1).args.p_property_id, 'service-home');
}
console.log('PASS unfinished service homes resume setup for the exact property');
for (const starter_state of ['complete', 'existing', 'empty']) {
    saved = { starter_state, needs_choice: false, needs_details: false, completed_at: 'saved' };
    assert.equal(await destination('service-home'), '/');
}
console.log('PASS completed, existing, and intentionally empty decks are preserved');
saved = { ...saved, needs_details: true };
assert.equal(await destination('service-home'), '/onboarding/base-home-wizard?propertyId=service-home');
console.log('PASS missing home details still receive the setup step');
const before = calls.length;
assert.equal(await destination('shared-home'), '/');
await assert.rejects(destination('foreign-home'), /connected to this home/);
assert.equal(calls.length, before);
console.log('PASS shared-home members bypass owner setup and foreign homes are rejected');
readError = { message: 'offline' };
await assert.rejects(destination('service-home'), /offline/);
readError = null;
saved = { property_id: 'other-home' };
await assert.rejects(destination('service-home'), /could not be verified/);
console.log('PASS offline or mismatched responses cannot bypass unfinished setup');
currentUser = 'different-account';
const beforeAuthSwitch = calls.length;
await assert.rejects(destination('service-home'), /account changed/);
assert.equal(calls.length, beforeAuthSwitch);
assert(calls.every(call => call.name === 'get_my_home_setup'));
console.log('PASS account changes stop navigation; checking never seeds or replaces cards');
