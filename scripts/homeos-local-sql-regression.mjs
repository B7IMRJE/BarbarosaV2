// LOCAL ONLY. Runs real PostgreSQL/PLpgSQL in an ephemeral PGlite database.
// Supply an installed @electric-sql/pglite module path as argv[2], or install it
// in a temporary directory. This runner cannot connect to a remote database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sql = file => readFileSync(`supabase/migrations/${file}.sql`, 'utf8');
let cases = 0;
async function test(name, run) {
    await run(); cases += 1; console.log(`PASS ${name}`);
}
async function rows(query, params = []) { return (await db.query(query, params)).rows; }
async function one(query, params = []) { return (await rows(query, params))[0]; }
async function fails(query, message, params = []) { await assert.rejects(db.query(query, params), message); }

try {
    await db.exec(`
        create role anon; create role authenticated;
        create schema auth; create schema supabase_migrations;
        create function auth.uid() returns uuid language sql stable as
            $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
        grant usage on schema public, auth to anon, authenticated;
        create table auth.users(id uuid primary key);
        create table public.properties(id uuid primary key, homeowner_story_count text,
            homeowner_profile_updated_at timestamptz, homeowner_profile_updated_by uuid);
        create table public.property_memberships(property_id uuid, user_id uuid, role text, status text);
        create table public.property_access_details(property_id uuid primary key references public.properties(id),
            gate_code text, updated_at timestamptz, updated_by uuid);
        alter table public.property_access_details enable row level security;
        revoke all on public.property_access_details from public, anon, authenticated;
        create table public.company_users(id uuid primary key, company_id uuid, auth_user_id uuid,
            status text, full_name text, created_at timestamptz default now());
        create table public.service_requests(id uuid primary key, company_id uuid, property_id uuid,
            request_type text, priority text, issue_summary text);
        create table public.job_schedule_slots(id uuid primary key, company_id uuid, service_request_id uuid,
            technician_company_user_id uuid, status text, priority text, notes text,
            created_at timestamptz default now(), updated_at timestamptz default now(), start_at timestamptz,
            visit_closed_at timestamptz, visit_outcome text, updated_by_user_id uuid, created_by_user_id uuid);
        create table public.job_schedule_slot_assignments(id uuid primary key, company_id uuid,
            schedule_slot_id uuid references public.job_schedule_slots(id), company_user_id uuid,
            role_on_schedule text, status text, assigned_at timestamptz default now());
        create table public.service_request_events(id uuid primary key default gen_random_uuid(),
            service_request_id uuid, company_id uuid, property_id uuid, created_by_user_id uuid,
            event_type text, message text, event_visibility text, audience text, schedule_slot_id uuid,
            actor_user_id uuid, actor_company_user_id uuid, dedupe_key text, metadata jsonb,
            notification_channels text[], notification_status text, created_at timestamptz default now());
        create table supabase_migrations.schema_migrations(version text primary key, name text, statements text[]);
    `);
    await db.query('insert into auth.users values ($1),($2)', [id(1), id(2)]);
    await db.query('insert into properties(id) values ($1)', [id(10)]);
    await db.query('insert into property_memberships values ($1,$2,\'OWNER\',\'active\')', [id(10), id(1)]);
    await db.query("select set_config('test.uid',$1,false)", [id(1)]);

    const accessSource = sql('20260812110000_home_story_and_secure_gate_access');
    const accessFunction = accessSource.slice(accessSource.indexOf('create or replace function public.update_my_home_structure_access('), accessSource.indexOf('create or replace function public.get_my_home_structure_access('));
    await db.exec(accessFunction);
    await test('reproduce the original property_id ambiguity after identity has been saved', async () => {
        await fails('select * from update_my_home_structure_access($1,$2,$3)', /ambiguous/, [id(10), '1', 'SYNTHETIC-ONLY']);
        assert.equal((await one('select count(*)::int as count from properties')).count, 1);
        assert.equal((await one('select count(*)::int as count from property_access_details')).count, 0);
    });
    const accessAcl = await one("select relacl,relrowsecurity from pg_class where oid='public.property_access_details'::regclass");
    await db.exec(sql('20260904120000_fix_home_structure_access_conflict'));
    await test('named-constraint insert and update return the same property_id, including empty access code', async () => {
        assert.equal((await one('select * from update_my_home_structure_access($1,$2,$3)', [id(10), '2', 'SYNTHETIC-ONLY'])).property_id, id(10));
        assert.equal((await one('select * from update_my_home_structure_access($1,$2,$3)', [id(10), '3', '   '])).property_id, id(10));
        assert.equal((await one('select count(*)::int as count from property_access_details')).count, 1);
        assert.equal((await one('select gate_code from property_access_details')).gate_code, null);
    });
    await test('owner-only access, auth, validation, definer/search_path and private table grants stay intact', async () => {
        await db.query("select set_config('test.uid',$1,false)", [id(2)]);
        await fails('select * from update_my_home_structure_access($1,$2,$3)', /Not authorized/, [id(10), '1', null]);
        await db.query("select set_config('test.uid','',false)");
        await fails('select * from update_my_home_structure_access($1,$2,$3)', /Authentication required/, [id(10), '1', null]);
        await db.query("select set_config('test.uid',$1,false)", [id(1)]);
        await fails('select * from update_my_home_structure_access($1,$2,$3)', /Story count is invalid/, [id(10), '99', null]);
        await fails('select * from update_my_home_structure_access($1,$2,$3)', /too long/, [id(10), '1', 'x'.repeat(81)]);
        assert.deepEqual(await one("select relacl,relrowsecurity from pg_class where oid='public.property_access_details'::regclass"), accessAcl);
        const fn = await one("select prosecdef,proconfig from pg_proc where oid='public.update_my_home_structure_access(uuid,text,text)'::regprocedure");
        assert(fn.prosecdef);
        assert(fn.proconfig.includes('search_path=pg_catalog, public, pg_temp'));
        await db.exec('set role authenticated');
        await one('select * from update_my_home_structure_access($1,$2,$3)', [id(10), '1', null]);
        await fails('select * from property_access_details', /permission denied/);
        await db.exec('set role anon');
        await fails('select * from update_my_home_structure_access($1,$2,$3)', /permission denied/, [id(10), '1', null]);
        await db.exec('reset role');
    });

    // Different real transactions establish history; timestamps are deliberately
    // NOT the source of the original rollout boundary.
    await db.query("insert into company_users values ($1,$2,$3,'active','Synthetic Lead',now()),($4,$2,$5,'active','Synthetic Replacement',now())", [id(20), id(30), id(1), id(21), id(2)]);
    await db.query("insert into service_requests values ($1,$2,$3,'emergency','emergency','Synthetic emergency'),($4,$2,$3,'regular','normal','Synthetic regular')", [id(40), id(30), id(10), id(41)]);
    async function slot(n, tech = 20, request = 40, status = 'scheduled') {
        await db.query('insert into job_schedule_slots(id,company_id,service_request_id,technician_company_user_id,status) values ($1,$2,$3,$4,$5)', [id(n), id(30), id(request), id(tech), status]);
        await db.query("insert into job_schedule_slot_assignments values ($1,$2,$3,$4,'lead','assigned','2020-01-01')", [id(n + 1000), id(30), id(n), id(tech)]);
    }
    await slot(100); // unchanged old scheduled assignment
    await slot(101); // old request/slot, but will be reassigned AFTER original rollout
    await slot(102); // existing operational activity by current lead, later slot edit
    await slot(103); // previous lead's activity must not exempt a replacement
    await slot(104); // unresolved: later tuple edit without operational evidence
    await slot(105); // explicit real acceptance retained

    const originalAcceptance = sql('20260817060000_emergency_technician_acceptance').replace('\ncommit;', "\ninsert into supabase_migrations.schema_migrations(version,name) values ('20260817060000','emergency_technician_acceptance');\ncommit;");
    await db.exec(originalAcceptance);
    await db.query('update job_schedule_slots set technician_company_user_id=$1 where id=$2', [id(21), id(101)]);
    await db.query('update job_schedule_slot_assignments set company_user_id=$1,assigned_at=now() where schedule_slot_id=$2', [id(21), id(101)]);
    async function activity(n, tech = 20, company = 30, request = 40) {
        await db.query("insert into service_request_events(service_request_id,company_id,schedule_slot_id,actor_company_user_id,event_type,metadata) values ($1,$2,$3,$4,'visit_status_change','{\"new_schedule_slot_status\":\"on_my_way\"}')", [id(request), id(company), id(n), id(tech)]);
    }
    await activity(102);
    await activity(103);
    await db.query("update job_schedule_slots set notes='synthetic later edit' where id in ($1,$2)", [id(102), id(104)]);
    await db.query('update job_schedule_slots set technician_company_user_id=$1 where id=$2', [id(21), id(103)]);
    await db.query('update job_schedule_slot_assignments set company_user_id=$1,assigned_at=now() where schedule_slot_id=$2', [id(21), id(103)]);
    await one('select * from accept_emergency_assignment($1,$2,$3)', [id(30), id(40), id(105)]);
    const explicitBefore = await one('select technician_acknowledged_at,technician_acknowledged_by_user_id from job_schedule_slots where id=$1', [id(105)]);
    await slot(106); // newly assigned old request, after rollout
    await slot(107); // unverified operational state inserted through old INSERT guard
    await slot(108); // another company's matching actor/event is not evidence
    await activity(108, 20, 999);
    await slot(109);
    await activity(109);
    const eventsBefore = (await one('select count(*)::int as count from service_request_events')).count;

    await db.exec(sql('20260904130000_legacy_emergency_assignment_compatibility'));
    async function state(n) {
        return one('select emergency_acceptance_compatibility,technician_acknowledged_at,technician_acknowledged_by_user_id from job_schedule_slots where id=$1', [id(n)]);
    }
    await test('old scheduled assignment without authoritative rollout evidence fails closed, without fabricated acceptance', async () => {
        assert.equal((await state(100)).emergency_acceptance_compatibility, null);
        assert.equal((await state(100)).technician_acknowledged_at, null);
        assert.equal((await state(100)).technician_acknowledged_by_user_id, null);
        assert.equal((await one('select count(*)::int as count from service_request_events')).count, eventsBefore);
        await fails("update job_schedule_slots set status='on_my_way' where id=$1", /must accept/, [id(100)]);
    });
    await test('recorded work by the current lead survives even when the slot tuple changed', async () => {
        assert.equal((await state(102)).emergency_acceptance_compatibility, 'existing_lead_activity');
        assert.equal((await state(102)).technician_acknowledged_at, null);
        await db.query("update job_schedule_slots set status='in_progress' where id=$1", [id(102)]);
    });
    await test('new assignment on old request, replacement lead, insufficient history, and wrong-company activity stay pending', async () => {
        for (const n of [101, 103, 104, 106, 107, 108]) {
            assert.equal((await state(n)).emergency_acceptance_compatibility, null);
            await fails("update job_schedule_slots set status='on_my_way' where id=$1", /must accept/, [id(n)]);
        }
        assert.deepEqual(await one('select technician_acknowledged_at,technician_acknowledged_by_user_id from job_schedule_slots where id=$1', [id(105)]), explicitBefore);
    });
    await test('new slot cannot inject compatibility or enter work without acceptance', async () => {
        await db.query("insert into job_schedule_slots(id,company_id,service_request_id,technician_company_user_id,status,emergency_acceptance_compatibility) values ($1,$2,$3,$4,'scheduled','existing_lead_activity')", [id(110), id(30), id(40), id(20)]);
        assert.equal((await state(110)).emergency_acceptance_compatibility, null);
        await fails("update job_schedule_slots set emergency_acceptance_compatibility='existing_lead_activity' where id=$1", /cannot be granted/, [id(110)]);
        await fails("insert into job_schedule_slots(id,company_id,service_request_id,technician_company_user_id,status) values ($1,$2,$3,$4,'in_progress')", /must accept/, [id(111), id(30), id(40), id(20)]);
        await fails("update job_schedule_slots set status='completed' where id=$1", /must accept/, [id(110)]);
    });
    await test('only the assigned active lead can record an actual acceptance and then travel', async () => {
        await db.query("select set_config('test.uid',$1,false)", [id(2)]);
        await fails('select * from accept_emergency_assignment($1,$2,$3)', /Only the active technician/, [id(30), id(40), id(110)]);
        await db.query("select set_config('test.uid',$1,false)", [id(1)]);
        await one('select * from accept_emergency_assignment($1,$2,$3)', [id(30), id(40), id(110)]);
        assert.equal((await state(110)).technician_acknowledged_by_user_id, id(1));
        await db.query("update job_schedule_slots set status='on_my_way' where id=$1", [id(110)]);
    });
    await test('same-lead reassignment clears legacy compatibility', async () => {
        await db.query('update job_schedule_slot_assignments set assigned_at=now() where schedule_slot_id=$1', [id(102)]);
        assert.equal((await state(102)).emergency_acceptance_compatibility, null);
        assert.equal((await one('select status from job_schedule_slots where id=$1', [id(102)])).status, 'assigned');
        await fails("update job_schedule_slots set status='arrived' where id=$1", /must accept/, [id(102)]);
    });
    await test('reassigning a working legacy or accepted slot resets it to pending rather than failing or inheriting travel', async () => {
        assert.equal((await state(109)).emergency_acceptance_compatibility, 'existing_lead_activity');
        await db.query("update job_schedule_slots set status='on_my_way' where id=$1", [id(109)]);
        for (const n of [109, 110]) {
            await db.query('update job_schedule_slots set technician_company_user_id=$1 where id=$2', [id(21), id(n)]);
            assert.equal((await state(n)).emergency_acceptance_compatibility, null);
            assert.equal((await state(n)).technician_acknowledged_at, null);
            assert.equal((await state(n)).technician_acknowledged_by_user_id, null);
            assert.equal((await one('select status from job_schedule_slots where id=$1', [id(n)])).status, 'assigned');
            await fails("update job_schedule_slots set status='arrived' where id=$1", /must accept/, [id(n)]);
        }
    });
    await test('assignment removal resets prior acknowledgement without creating a new actor or timestamp', async () => {
        await db.query("update job_schedule_slot_assignments set status='removed' where schedule_slot_id=$1", [id(105)]);
        assert.equal((await state(105)).technician_acknowledged_at, null);
        assert.equal((await state(105)).technician_acknowledged_by_user_id, null);
        await fails("update job_schedule_slots set status='on_my_way' where id=$1", /must accept/, [id(105)]);
    });
    await test('ordinary work is unchanged', async () => {
        await slot(120, 20, 41);
        await db.query("update job_schedule_slots set status='in_progress' where id=$1", [id(120)]);
    });
    console.log(`${cases} local PostgreSQL regression cases passed. No remote database was accessed.`);
} finally {
    await db.close();
}
