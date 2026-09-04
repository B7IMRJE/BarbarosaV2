// Local-only: real setup/guard/provisioning SQL in PGlite, synthetic fixtures.
// No remote connection, credentials, or production customer records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(path, overrides = {}) {
    const full = resolve(path);
    if (cache.has(full) && !Object.keys(overrides).length) return cache.get(full);
    const exports = {};
    const { outputText } = ts.transpileModule(readFileSync(full, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: full,
    });
    const require = name => overrides[name] || load(resolve(dirname(full), `${name}.ts`));
    vm.runInNewContext(outputText, { exports, require, Error, URL, URLSearchParams, console, setTimeout, clearTimeout });
    cache.set(full, exports); return exports;
}
const core = load('src/lib/home-setup-integrity-core.ts');
const planner = load('src/lib/starterHomeSetup.ts');
let cases = 0;
async function test(name, run) { await run(); cases += 1; console.log(`PASS ${name}`); }
const scope = { userId: 'owner', propertyId: 'home' };
const status = patch => ({ property_id: 'home', starter_state: 'pending', can_retry: true, needs_details: false, needs_choice: false, completed_at: null, ...patch });
await test('failed/offline read never means incomplete and never seeds', async () => {
    let writes = 0;
    const check = core.createHomeSetupInspector({ read: async () => { throw Error('offline'); }, finish: async () => { writes++; } });
    await assert.rejects(check(scope), /offline/); assert.equal(writes, 0);
});
await test('same-home concurrent opens dedupe; failed automatic attempt is bounded; manual retry works', async () => {
    let reads = 0, writes = 0;
    const check = core.createHomeSetupInspector({ read: async () => { reads++; return status(); }, finish: async () => { writes++; throw Error('offline'); } });
    const first = check(scope); const second = check(scope);
    assert.equal(first, second);
    await assert.rejects(first, /offline/);
    await check(scope); assert.equal(writes, 1); assert.equal(reads, 2);
    await assert.rejects(check(scope, true), /offline/); assert.equal(writes, 2);
});
await test('missing choices/details and intentional empty/complete decks never auto-seed', async () => {
    for (const starter_state of ['unselected', 'legacy_review', 'empty', 'existing', 'complete']) {
        let writes = 0;
        const saved = status({ starter_state, can_retry: false, needs_choice: ['unselected','legacy_review'].includes(starter_state), completed_at: 'saved' });
        const check = core.createHomeSetupInspector({ read: async () => saved, finish: async () => { writes++; } });
        await check(scope); assert.equal(writes, 0);
        assert.equal(core.isHomeSetupComplete(saved), !saved.needs_choice);
    }
    let writes = 0;
    await core.createHomeSetupInspector({ read: async () => status({ needs_details: true, can_retry: false }), finish: async () => { writes++; } })(scope);
    assert.equal(writes, 0);
});
await test('cross-property response is rejected; automatic attempts are owner/property scoped', async () => {
    const bad = core.createHomeSetupInspector({ read: async () => status({ property_id: 'wrong' }), finish: async () => { throw Error('must not run'); } });
    await assert.rejects(bad(scope), /did not match/);
    let writes = 0;
    const check = core.createHomeSetupInspector({ read: async s => status({ property_id: s.propertyId }), finish: async s => { writes++; return status({ property_id: s.propertyId, can_retry: false }); } });
    for (const s of [scope, { ...scope, propertyId: 'second' }, { ...scope, userId: 'other-owner' }]) await check(s);
    assert.equal(writes, 3);
});

let currentUser = 'owner';
let rpcCalls = 0;
const api = load('src/lib/home-setup-integrity.ts', {
    './supabase': { supabase: { auth: { getUser: async () => ({ data: { user: { id: currentUser } } }) },
        rpc: async (name, args) => { rpcCalls++; return { data: status({ property_id: args.p_property_id }) }; } } },
    './activeProperty': {
        listActivePropertyMemberships: async () => ({ userId: currentUser, memberships: [
            { propertyId: 'owned', membershipRole: 'OWNER' }, { propertyId: 'shared', membershipRole: 'MEMBER' },
        ] }),
        requireActivePropertyMembership: async () => ({ userId: currentUser, propertyId: 'owned', membershipRole: 'OWNER' }),
    },
});
await test('exact property binding rejects a foreign or non-owner ID instead of using active home', async () => {
    assert.equal((await api.resolveOwnedHomeSetupScope('owned')).propertyId, 'owned');
    await assert.rejects(api.resolveOwnedHomeSetupScope('foreign'), /owns this home/);
    await assert.rejects(api.resolveOwnedHomeSetupScope('shared'), /owns this home/);
});
await test('auth switch between opening and saving stops before RPC', async () => {
    currentUser = 'someone-else';
    await assert.rejects(api.finishHomeSetup({ userId: 'owner', propertyId: 'owned' }), /account changed/);
    assert.equal(rpcCalls, 0); currentUser = 'owner';
});

await test('actual first/additional creation adapters save details but never auto-publish a guessed starter deck', async () => {
    const calls = []; let detailCalls = 0;
    const identity = load('src/lib/homeIdentity.ts', {
        './supabase': { supabase: { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
            rpc: async name => { calls.push(name); return { data: [{ property_id: name.endsWith('first_property') ? 'first' : 'additional' }] }; },
            from: () => { throw Error('must not seed guessed cards'); },
        } },
        './activeProperty': {},
        './homePropertyAccess': { updateMyHomeStructureAccess: async () => { detailCalls++; } },
    });
    const input = { name: 'Synthetic home', propertyType: 'HOUSE', storyCount: '1', address: {
        addressLine1: 'Synthetic street', addressLine2: '', city: 'Fixture', state: 'CA', postalCode: '00000',
        countryCode: 'US', formattedAddress: 'Synthetic fixture only', latitude: 0, longitude: 0, googlePlaceId: 'synthetic',
    } };
    assert.equal(await identity.createFirstHomeIdentity(input), 'first');
    assert.equal(await identity.createAdditionalHomeIdentity(input), 'additional');
    assert.equal(detailCalls, 2); assert.equal(calls.join(','), 'create_homeowner_first_property,create_homeowner_property');
});
for (const file of ['starterHomeSetup', 'propertyAreas', 'propertyLandingNavigation']) {
    await test(`existing ${file} regressions`, () => load(`src/lib/${file}.regression.ts`));
}
await test('existing onboarding role routing stays unchanged', () => {
    load('src/lib/onboarding.ts', { './supabase': { supabase: {} } });
    load('src/lib/onboarding.regression.ts');
});
await test('first/additional UI handoff pins the saved property and all owner entry points include recovery', () => {
    const create = readFileSync('src/app/onboarding/create-home.tsx','utf8');
    const theme = readFileSync('src/app/onboarding/theme.tsx','utf8');
    assert.match(create, /addingProperty \? homeSetupRoute\(propertyId\) : buildThemeRoute\(nextRoute, propertyId\)/);
    assert.match(theme, /buildBaseHomeWizardRoute\(nextRoute, firstParam\(params.propertyId\)\)/);
    for (const file of ['src/app/index.tsx', 'src/features/property-navigation/MyHomeScreen.tsx', 'src/features/property-navigation/PropertyAreaScreen.tsx']) {
        const source = readFileSync(file,'utf8');
        assert.match(source, /!providerModeContext && !routeParams.providerMode/);
        assert.match(source, /<HomeSetupCheck/);
    }
});

const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sql = name => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
function fn(source, name) {
    const start = source.indexOf(`create or replace function public.${name}(`);
    assert(start >= 0, name); const end = source.indexOf('$$;', start);
    return source.slice(start, end + 3);
}
async function one(query, args = []) { return (await db.query(query, args)).rows[0]; }
const read = async n => (await one('select get_my_home_setup($1) as result', [id(n)])).result;
const choose = async (n, plan, empty = false) => (await one('select choose_my_home_starter_setup($1,$2,$3) as result', [id(n), JSON.stringify(plan), empty])).result;
const finish = async n => (await one('select finish_my_home_starter_setup($1) as result', [id(n)])).result;
const count = async n => (await one('select count(*)::int as n from home_items where property_id=$1', [id(n)])).n;
const story = async n => one("select save_my_home_setup_story($1,'2')", [id(n)]);
const plan = core.buildHomeSetupPlan({ bathrooms: 1, kitchen: true, laundry: true, garage: true, waterHeater: true, hvac: true, frontYard: true, backYard: false, pool: false });
try {
    await db.exec(`
        create role anon; create role authenticated; create schema auth;
        grant usage on schema public, auth to anon, authenticated;
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
        create table properties(id uuid primary key, owner_id uuid, name text, property_type text,
            homeowner_story_count text, homeowner_profile_updated_at timestamptz, homeowner_profile_updated_by uuid);
        create table property_memberships(property_id uuid, user_id uuid, role text, status text);
        create table property_preferred_providers(property_id uuid, company_id uuid, status text, service_category_key text);
        create function homeos_company_trade_enabled(uuid,text) returns boolean language sql as $$ select true $$;
        create function homeos_is_platform_admin() returns boolean language sql as $$ select false $$;
        create table home_items(id uuid primary key default gen_random_uuid(), user_id uuid, property_id uuid references properties(id),
            name text, system text, category text, item_slug text, location text, parent_area text, area_scope text,
            status text, install_state text, archived boolean, starter_template_key text, parent_home_item_id uuid,
            created_at timestamptz default now(), custom_note text, replaces_home_item_id uuid, area_placement_state text);
        create unique index fixture_slug on home_items(property_id,item_slug) where not archived;
        create table homeos_starter_card_templates(template_key text primary key, name text, system text, category text,
            aliases jsonb default '[]', parent_template_key text, active boolean default true, auto_provision boolean default true,
            trade_key text, room_kind text, display_order integer default 10);
        create function homeos_is_master_bathroom(text) returns boolean language sql as $$ select false $$;
        create function homeos_overlay_root_identity(text,text,text) returns text language sql as $$ select null::text $$;
        create function homeos_resolve_overlay_root_for_placement(uuid,text,text,text) returns uuid language sql as $$ select null::uuid $$;
        create table homeos_card_sets(id uuid primary key, current_published_revision_id uuid, status text, set_key text);
        create table homeos_card_set_revisions(id uuid primary key, card_set_id uuid, publication_status text);
        create table homeos_card_set_revision_members(revision_id uuid, member_behavior text, starter_template_key text);
    `);
    const trade = sql('20260817160000_company_trade_scoped_homeos_deck');
    const rooms = sql('20260815233000_complete_room_starter_card_deck');
    const packs = sql('20260822100000_homeos_published_starter_pack_reconciliation');
    for (const name of ['homeos_trade_key_for_system','homeos_property_trade_enabled','homeos_validate_homeowner_starter_trade']) await db.exec(fn(trade, name));
    await db.exec(fn(rooms, 'homeos_starter_identity'));
    await db.exec(fn(sql('20260817190000_homeos_area_scoped_item_identity'), 'homeos_item_placement_identity'));
    await db.exec(`create unique index fixture_placement on home_items(property_id,
        homeos_item_placement_identity(system, category, name, location, parent_area)) where not coalesce(archived,false)`);
    await db.exec(fn(sql('20260823090000_laundry_sink_starter_components'), 'homeos_complete_room_kind'));
    await db.exec(fn(packs, 'homeos_current_starter_pack_template_enabled'));
    await db.exec(fn(packs, 'provision_complete_room_starter_cards'));
    await db.exec(fn(sql('20260820100000_atomic_property_area_add'), 'enforce_home_items_top_level_area_identity'));
    await db.exec(fn(sql('20260820130000_homeos_area_location_assignment'), 'homeos_validate_area_location_assignment'));
    await db.exec(fn(sql('20260820110000_homeos_instance_parentage'), 'homeos_validate_item_parentage'));
    await db.exec(fn(sql('20260820110000_homeos_instance_parentage'), 'homeos_validate_item_parent_lifecycle'));
    await db.exec(`
        create trigger area_identity before insert or update on home_items for each row execute function enforce_home_items_top_level_area_identity();
        create trigger area_location before insert or update on home_items for each row execute function homeos_validate_area_location_assignment();
        create trigger parentage before insert or update on home_items for each row execute function homeos_validate_item_parentage();
        create constraint trigger parent_lifecycle after insert or update on home_items deferrable initially deferred for each row execute function homeos_validate_item_parent_lifecycle();
        create trigger validate_trade before insert on home_items for each row execute function homeos_validate_homeowner_starter_trade();
        create function fixture_seed_room() returns trigger language plpgsql as $$ begin
            if new.category='Area' then perform provision_complete_room_starter_cards(new.id); end if; return new;
        end $$;
        create trigger seed_room after insert on home_items for each row execute function fixture_seed_room();
    `);
    // Minimal, explicitly synthetic published-room catalog. The provisioner and
    // trade guard are the actual source functions, not simulated success stubs.
    for (const kind of ['kitchen','bathroom','garage','laundry']) {
        await db.query("insert into homeos_starter_card_templates(template_key,name,system,category,trade_key,room_kind) values ($1,$2,'Plumbing','Fixture','plumbing',$3),($4,'Outlet','Electrical','Fixture','electrical',$3)", [`${kind}:sink`, `${kind} sink`, kind, `${kind}:outlet`]);
        await db.query("insert into homeos_starter_card_templates(template_key,name,system,category,trade_key,room_kind,parent_template_key,display_order) values ($1,$2,'Plumbing','Component','plumbing',$3,$4,20)", [`${kind}:faucet`, `${kind} faucet`, kind, `${kind}:sink`]);
    }
    for (const n of [10,11]) {
        await db.query("insert into properties values ($1,$2,'Synthetic Home','HOUSE',null,null,null)", [id(n), id(1)]);
        await db.query("insert into property_memberships values ($1,$2,'OWNER','active')", [id(n), id(1)]);
    }
    await db.query("select set_config('test.uid',$1,false)", [id(1)]);
    await test('reproduce default bulk seed 42501 and full rollback using the installed trade guard', async () => {
        const old = planner.buildStarterHomeSetupPreview({ userId: id(1), propertyId: id(10), existingItems: [], plan: planner.buildDefaultStarterHomePlan('HOUSE') });
        await assert.rejects(db.query(`insert into home_items(user_id,property_id,name,system,category,item_slug,location,parent_area,archived)
            select user_id,property_id,name,system,category,item_slug,location,parent_area,archived
            from jsonb_to_recordset($1::jsonb) as x(user_id uuid,property_id uuid,name text,system text,category text,item_slug text,location text,parent_area text,archived boolean)`, [JSON.stringify(old.rowsToInsert)]), /trade is not enabled/);
        assert.equal(await count(10), 0);
    });
    const guardBefore = await one("select pg_get_functiondef('homeos_validate_homeowner_starter_trade()'::regprocedure) as definition");
    await test('setup serialization remains compatible with manual area FK locks', () => {
        const migration = sql('20260904150000_durable_home_setup');
        assert.match(migration, /for no key update;/);
        assert.match(migration, /homeowner-property-area\|/);
        assert.match(migration, /homeos-canonical-area\|/);
    });
    await db.exec(sql('20260904150000_durable_home_setup'));
    await test('legacy empty partial asks for details and a choice; it does not seed', async () => {
        const s = await read(10); assert(s.needs_details && s.needs_choice); assert.equal(s.starter_state, 'legacy_review');
        await finish(10); assert.equal(await count(10), 0);
    });
    for (const n of [12,13]) await test(`${n === 12 ? 'first' : 'additional'} home gets a durable checkpoint at identity insert`, async () => {
        await db.query("insert into properties values ($1,$2,'Synthetic Home','HOUSE',null,null,null)", [id(n), id(1)]);
        await db.query("insert into property_memberships values ($1,$2,'OWNER','active')", [id(n), id(1)]);
        assert.equal((await read(n)).starter_state, 'unselected'); assert.equal(await count(n), 0);
    });
    await test('saved selection survives reload before details; later recovery seeds allowed trades atomically', async () => {
        await choose(12, plan); assert.equal((await read(12)).can_retry, false);
        await finish(12); assert.equal(await count(12), 0);
        await story(12); assert.equal((await read(12)).can_retry, true);
        const result = await finish(12); assert(core.isHomeSetupComplete(result)); assert((await count(12)) > 10);
        assert.equal((await one("select count(*)::int as n from home_items where property_id=$1 and system in ('Electrical','HVAC')", [id(12)])).n, 0);
        assert.equal((await one("select count(*)::int as n from home_items where property_id=$1 and name='Water Heater'", [id(12)])).n, 1);
        assert.equal((await one("select count(*)::int as n from home_items where property_id=$1 and parent_home_item_id is not null", [id(12)])).n, 4);
    });
    await test('lost response / repeated / concurrent completion does not duplicate or reseed deleted cards', async () => {
        const before = await count(12); await Promise.all([finish(12), finish(12), choose(12, plan)]);
        assert.equal(await count(12), before);
        await db.query('delete from home_items where property_id=$1', [id(12)]);
        assert(core.isHomeSetupComplete(await read(12))); await finish(12); assert.equal(await count(12), 0);
    });
    await test('intentional empty and legacy archived-only homes stay empty; completed milestones are durable', async () => {
        await story(13); await choose(13, null, true); assert(core.isHomeSetupComplete(await read(13)));
        await finish(13); await choose(13, plan); assert.equal(await count(13), 0);
        await db.query("insert into home_items(property_id,name,category,system,archived) values ($1,'My archived sink','Fixture','Plumbing',true)", [id(11)]);
        assert.equal((await read(11)).starter_state, 'existing'); await story(11);
        await finish(11); assert.equal(await count(11), 1);
    });
    await test('failure in a required published pack rolls back every inserted row, preserving saved intent for retry', async () => {
        await story(10); await choose(10, plan);
        await db.exec("update homeos_starter_card_templates set active=false where room_kind='bathroom'");
        await assert.rejects(finish(10), /No enabled starter pack/); assert.equal(await count(10), 0);
        assert.equal((await read(10)).starter_state, 'pending');
        await db.exec("update homeos_starter_card_templates set active=true where room_kind='bathroom'");
        assert(core.isHomeSetupComplete(await finish(10)));
    });
    for (const n of [14,15,16,17]) {
        await db.query("insert into properties values ($1,$2,'Synthetic Home','HOUSE','1',null,null)", [id(n),id(1)]);
        await db.query("insert into property_memberships values ($1,$2,'OWNER','active')", [id(n),id(1)]);
    }
    await test('partial/custom and archived areas, including Laundry Room alias, are not overlaid or resurrected', async () => {
        await choose(14, plan);
        await db.query("insert into home_items(user_id,property_id,name,category,system,location,archived,custom_note) values ($1,$2,'Kitchen','Area','Plumbing','Kitchen',false,'keep me'),($1,$2,'Laundry Room','Area','Plumbing','Laundry Room',true,'archived')", [id(1),id(14)]);
        await db.query("update home_items set archived=true where property_id=$1 and category <> 'Area'", [id(14)]);
        const before = (await db.query('select * from home_items where property_id=$1 order by name', [id(14)])).rows;
        await finish(14);
        const after = (await db.query('select * from home_items where id = any($1::uuid[]) order by name', [before.map(x => x.id)])).rows;
        assert.deepEqual(after, before);
        assert.equal((await one("select count(*)::int n from home_items where property_id=$1 and name='Laundry'", [id(14)])).n, 0);
        assert.equal((await one("select count(*)::int n from home_items where property_id=$1 and location='Kitchen' and category <> 'Area' and not archived", [id(14)])).n, 0);
    });
    await test('configured non-plumbing trades are respected; all-blocked plan stays pending, not falsely complete', async () => {
        await db.query("insert into property_preferred_providers values ($1,$2,'active','hvac')", [id(15),id(50)]);
        const kitchen = plan.filter(x => x.name === 'Kitchen');
        await choose(15, kitchen);
        await assert.rejects(finish(15), /None of the selected/);
        assert.equal(await count(15), 0); assert.equal((await read(15)).starter_state, 'pending');
        await db.query("insert into property_preferred_providers values ($1,$2,'active','plumbing')", [id(15),id(50)]);
        assert(core.isHomeSetupComplete(await finish(15)));
    });
    await test('explicit published-pack membership is authoritative; stale client-only cards are not overlaid', async () => {
        await db.query("insert into homeos_card_sets values ($1,$2,'active','kitchen_plumbing')", [id(70),id(71)]);
        await db.query("insert into homeos_card_set_revisions values ($1,$2,'published')", [id(71),id(70)]);
        await db.query("insert into homeos_card_set_revision_members values ($1,'instantiate','kitchen:sink')", [id(71)]);
        await choose(16, plan.filter(x => x.name === 'Kitchen')); await finish(16);
        assert.equal(await count(16), 2); // Area + published sink, not old faucet/extras.
    });
    await test('racing selections preserve the first saved intent; plan validation rejects malformed input', async () => {
        await assert.rejects(choose(17, [{ name: 'Bad', system: 'Plumbing', scope: 'interior', items: null }]), /Invalid starter area/);
        await assert.rejects(choose(17, []), /too large or empty/);
        await Promise.all([choose(17, plan.filter(x => x.name === 'Kitchen')), choose(17, null, true)]);
        await finish(17); assert.equal(await count(17), 2);
        await assert.rejects(one("select save_my_home_setup_story($1,'99')", [id(17)]), /Choose the number/);
    });
    await test('owner, active membership, exact property, anon and direct-table permissions are enforced', async () => {
        await db.query("select set_config('test.uid',$1,false)", [id(2)]);
        for (const op of [() => read(10), () => story(10), () => choose(10, plan), () => finish(10)]) await assert.rejects(op(), /Only the active home owner/);
        await db.query("insert into property_memberships values ($1,$2,'OWNER','active')", [id(10), id(2)]);
        await assert.rejects(finish(10), /Only the active home owner/);
        await db.query("select set_config('test.uid',$1,false)", [id(1)]);
        await db.query("update property_memberships set status='inactive' where property_id=$1 and user_id=$2", [id(10),id(1)]);
        await assert.rejects(read(10), /Only the active home owner/);
        await db.exec('set role authenticated'); await assert.rejects(db.query('select * from home_setup_progress'), /permission denied/);
        assert(core.isHomeSetupComplete(await read(13)));
        await db.exec('set role anon'); await assert.rejects(read(13), /permission denied/); await db.exec('reset role');
        assert.deepEqual(await one("select pg_get_functiondef('homeos_validate_homeowner_starter_trade()'::regprocedure) as definition"), guardBefore);
    });
    console.log(`${cases} setup integrity regression cases passed. Local only; no production writes.`);
} finally { await db.close(); }
