# HomeOS starter setup integrity

## Findings and evidence boundaries

- The released flow persisted property identity/membership before structure details and starter seeding. A later failure/reload could leave a real home with no areas; membership-based navigation then returned to HomeOS without reopening setup.
- Additional-property creation skipped the starter questionnaire. The first-home/theme/wizard handoff also failed to carry an exact property ID.
- The default client plan mixed Plumbing, Electrical and HVAC in a bulk insert. The installed trade guard permits only configured trades (an unconnected property defaults to plumbing). A local test using that actual guard reproduces `42501` and statement rollback. This is a latent mismatch, not evidence that e5d024d introduced the failure.
- Read-only production metadata confirmed active starter templates, provisioning triggers and the earlier structure-access repair. Anonymous aggregates showed one recent empty property without structure details, created before the e5d024d deployment; none was created afterward. These aggregates do **not** identify the user's home. No private account/property identity was inferred.

## Repair

`20260904150000_durable_home_setup.sql` adds a private, property-scoped setup checkpoint and owner-only RPCs. A new-property trigger records unfinished setup in the same transaction as identity creation. Required milestones are the existing property/ownership, saved story count, explicit starter choice, and successful seed completion (or explicit keep-current choice).

Existing homes are classified only when their owner opens them. Any saved card, including an archived card, preserves the existing deck. An empty legacy home without a checkpoint is ambiguous: the owner is asked to choose; it is never silently repopulated. Completion remains recorded after cards are archived, deleted or intentionally reset. A membership grants access, not proof of setup completion.

The owner-facing check on the property dashboard, My Home and area decks:

- Shows a loading/checking state; a failed/offline request is an error with Retry, never an empty/incomplete result.
- Offers **Finish setup** for missing details or an unrecorded choice.
- Attempts only a previously saved pending starter selection, at most once automatically per signed-in owner/property in the app session. Further retries require a tap (or a new app session).
- Coalesces concurrent checks in the app. The database locks the property and uses the existing area identity locks for serialization across tabs/devices and manual area creation.
- Refreshes the displayed area list only after actual recovery.
- Does not run in provider mode or for ordinary non-owner household members.

First and additional homes both reach the exact property's questionnaire; a reload can use the same durable checkpoint rather than create another home. Theme/navigation carry `propertyId`. The questionnaire names the target home, retains the existing themed controls and Not sure options, allows **Finish later** without falsely completing setup, and supports **Keep current cards — no starter pack** as a durable decision. Recovery of story count does not erase a gate/access code or replace existing structure details.

Starter intent is saved before seeding. All rows and final completion are then written in one transaction. A failure rolls back the entire seed while retaining the earlier saved intent. A lost success response is harmless: subsequent checks see completion and do not reseed. Existing/archived areas (including Laundry/Laundry Room aliases) are left untouched. Known rooms use installed published starter packs, not a stale duplicate client catalog; standalone equipment is filtered through the existing trade resolver. The trade guard, existing HomeOS RLS and company pricing are not weakened or modified.

If all selected areas are outside enabled trades, or a required published pack is unavailable, setup remains pending with an actionable error. It does not claim success, guess permissions, or repeatedly loop.

## Validation

`scripts/homeos-setup-integrity-regression.mjs` runs app helpers and a temporary PGlite database. It uses the actual migration, trade guard, property trade resolver, room provisioner, published-pack selector, area identity/location and parentage validators. The catalog/users/properties are minimal synthetic fixtures, never production records. Tests cover first/additional adapters and checkpoints, partial setup, reload, lost responses, repeat/concurrent requests, invalid plans, owner/account/property boundaries, offline reads, bounded retries, explicit empty homes, custom/archived areas, published membership and trade-compatible recovery. PGlite serializes concurrent queries; explicit lock usage is checked in source and real multi-process database contention is not simulated.

Run:

```sh
node scripts/homeos-setup-integrity-regression.mjs /path/to/@electric-sql/pglite/dist/index.js
node scripts/homeos-setup-compatibility-regression.mjs
node scripts/homeos-local-sql-regression.mjs /path/to/@electric-sql/pglite/dist/index.js
node_modules/.bin/tsc --noEmit
npm run lint
git diff --check
CI=1 node_modules/.bin/expo export --platform web --output-dir /tmp/homeos-starter-web-output
```

The existing starter planner, property-area, property-landing and onboarding-role regressions are also executed by the new runner. Static web export covers all 122 routes. No signed-in production recovery has been attempted; this local validation is not a claim that production has been repaired.

## Authorized rollout and owner verification

1. Review and publish only this repair. Preserve unrelated AI-card-builder edits and the unrelated pending quote-approval migration.
2. Apply **only** the new setup-integrity migration to the intended HomeOS database before releasing its client. Do not run an indiscriminate push of pending migrations. No bulk backfill or card repair is included.
3. Deploy the matching app build and verify production readiness.
4. The affected owner opens HomeOS, taps **Finish setup**, confirms missing details and their starter choice. It resumes the same home. If the deck was intentionally emptied, choose **Keep current cards** instead.
5. Verify first/additional home, reload/pending recovery and intentionally empty behavior with the owner's authorized test home. If record-level support is still needed, ask for that exact home/account identifier rather than selecting a recently created row.

Release this repair through the existing main/Vercel workflow only after the clean release checks pass. Migration history and the deployed build must be checked independently; a successful local test is not production verification. Keep the unrelated pending quote-approval migration and AI-card-builder work out of this release.
