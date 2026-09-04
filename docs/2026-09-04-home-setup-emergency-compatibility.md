# Local repair review — 2026-09-04

Status: local only. No commit, push, deployment, or production SQL application.

## Create Home

`update_my_home_structure_access(uuid,text,text)` returns an OUT column named
`property_id`. Its `ON CONFLICT (property_id)` target was ambiguous in PL/pgSQL.
The base identity/membership RPC had already committed before the details RPC
failed; this explains why the home existed even though Create Home showed an error.

New forward migration `20260904120000_fix_home_structure_access_conflict.sql`
uses `ON CONFLICT ON CONSTRAINT property_access_details_pkey` (the installed
constraint). It retains the return signature, active OWNER authorization,
authentication and input validation, SECURITY DEFINER/search_path, function
grants, and private table access. Applied migration files are unchanged.

Both first-home and additional-home creation now report the returned identity
before saving details/starter items. A subsequent failure says the home exists
but setup is incomplete. **Retry Home Setup** skips the identity-creation RPC and
finishes the same property. Name/address/type are locked during recovery;
stories/access input remains editable. Switching accounts cannot resume another
account's pending setup. Duplicate taps are guarded before async state updates.
The existing server-side first-home and place/unit idempotency remains intact.

Recovery references are screen-local, not a new local database. Closing/reloading
the screen loses the unfinished form (including any unsaved access code); it does
not delete the saved home. Existing server identity reuse remains the safety net.
Durable cross-reload setup prompts are not included in this repair. Access codes
are not placed in recovery errors, logs, or local storage.

## Emergency acceptance

New forward migration `20260904130000_legacy_emergency_assignment_compatibility.sql`
adds a protected `emergency_acceptance_compatibility` reason on a schedule slot.
Its one-time backfill requires a recorded `visit_status_change` for the same
company/request/slot and current lead, during that lead's current assignment.
Event timestamp and strict tuple-transaction ordering must corroborate that
sequence. Missing, frozen/special/wrapped, same-transaction, or changed evidence
is excluded rather than guessed. A request-level work status is not evidence.

The compatibility reason is **not acceptance**. It writes no acknowledgment
timestamp, actor, or acceptance notification. Existing acknowledgment records,
including those populated by the original migration, are not rewritten.

New slots cannot inject compatibility or skip directly to travel/work. Primary
lead/context changes, same-lead reassignment, and assignment removal clear
compatibility/old acknowledgment. Reassignment of an active visit returns it to
Assigned instead of inheriting the old lead's travel/work state. New travel/work
still requires the existing assigned-lead acceptance RPC and permissions.

TechOS and Dispatch load the persisted reason. A request-derived operational
status without acknowledgment or verified compatibility no longer hides the
acceptance button. The card is available in the technician's **Open Job** detail,
not Customer Messages; sales-only mode remains intentionally non-executing.
Closed visits do not offer an invalid acceptance action. No client-generated
acknowledgment timestamp is substituted for missing server confirmation.

### Unresolved historical cohort (do not represent this as fully grandfathered)

The original acceptance code first appears in git commit
`729ca0c7587d6917b535f801c2b9a41c5abfab44` (2026-08-17 03:39:22 UTC).
Migration `20260817060000` and both installed acceptance functions have tuple
transaction ID `51493`. However:

- `supabase_migrations.schema_migrations` has no installation timestamp.
- `track_commit_timestamp` is off.
- Git commit time and migration filename time are not database rollout time.
- Transaction IDs are allocation order, not commit order; comparing old `xmin`
  values does not prove a row was committed before rollout.

Accordingly, **assigned/scheduled jobs with no provable current-lead operational
event are not automatically exempted**, even if their request is old. This also
includes missing current-lead assignment rows, only previous-lead/wrong-context
activity, and historical tuple changes that erase corroborating evidence.
They retain explicit acceptance via the now-reachable control.

Fully grandfathering that cohort needs an authoritative original deployment log
or a separately verified list of assignment identities/epochs. No broad cutoff,
production IDs, or speculative acceptance records are included here.

## Verification

- `node scripts/homeos-setup-compatibility-regression.mjs`: 11 app cases.
- `scripts/homeos-local-sql-regression.mjs`: 12 real PostgreSQL/PLpgSQL cases in
  ephemeral PGlite, including reproducing the original error before applying the
  forward fix, private table/OWNER checks, insert/update round trips, same-ID
  results, old/new assignment boundaries, current vs previous lead evidence,
  cross-company exclusion, forged compatibility rejection, actual lead-only
  acceptance, and reassignment/removal resets.
- Existing emergency-assignment, TechOS-assignment, and Dispatch-wall regression
  suites pass. Existing operational fixtures now carry explicit acceptance or
  persisted compatibility; new negative cases ensure status alone cannot waive it.
- Three focused TechOS-workflow/Dispatch acceptance integration cases pass.
  The full TechOS-workflow suite still fails an unrelated pre-existing copy
  assertion: it expects `current job remains unchanged`, while the unchanged
  implementation says `current job remains <status>`. The same failing assertion
  was reproduced using the HEAD version of the test and the unchanged helper.
  That unrelated helper/assertion was not changed to hide the failure.
- `npx tsc --noEmit`, `npm run lint`, `npm run build:web`, `git diff --check`.

SQL runner setup (outside the app; no runtime/package dependency change):

```sh
npm install --prefix <temporary-directory> --no-audit --no-fund @electric-sql/pglite@0.3.14
node scripts/homeos-local-sql-regression.mjs <temporary-directory>/node_modules/@electric-sql/pglite/dist/index.js
```

All regression records are synthetic. Only installed schema/function/migration
metadata was read remotely; no customer rows, access codes, or secrets were read.
The SQL fixture checks the focused functions/triggers, not every production
policy/trigger or a signed-in live end-to-end flow.

## Publication requirements — future authorization only

1. Review the unresolved cohort and this local diff. Stage only these repairs.
2. Apply only the two new forward migrations above, transactionally and in order.
   The compatibility migration takes assignment-table locks for its one-time
   snapshot. A lock failure should roll back; do not disable guards to proceed.
3. Apply the database changes BEFORE publishing the app, since schedule queries
   select the new compatibility column. Verify the schema cache has refreshed.
4. Commit/push/publish only when authorized, then verify first/additional home
   creation and technician/assistant/sales flows with designated test accounts.

Do not bulk-apply pending migrations. In particular,
`20260902120000_keep_quote_approval_out_of_technician_status.sql` remains untouched
and unapplied, and the dirty AI card-builder files/migration are outside this pass.
The pre-existing generated build-info edit was restored after build verification.
