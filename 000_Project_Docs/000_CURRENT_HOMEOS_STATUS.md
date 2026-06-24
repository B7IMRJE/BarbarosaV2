# Current HomeOS Status

This file is the compact onboarding package for future Codex sessions. Read it before changing Barbarosa V2/HomeOS.

## Current Project Identity

- Project: Barbarosa V2 / HomeOS.
- Stack: Expo Router, React Native, Supabase Auth, Supabase Postgres, and Supabase Storage.
- User-facing workspace path: `C:\BarbarosaV2`.
- Current Codex checkout may resolve to `I:\Apps working on\BarbarosaV2`; treat it as the same HomeOS repository when Git confirms the same root.
- `package.json` and `app.json` still carry Expo template naming in places. Do not treat that as product identity cleanup unless explicitly requested.
- `AGENTS.md` requires reading the exact Expo SDK 56 documentation before writing app code.

## Completed Milestones

- Nested areas are implemented for broad zones such as Exterior. Broad areas can show child areas before final item locations.
- First-home creation flow is implemented for newly registered homeowners who have no active property membership.
- Verified address and home identity support is present through Supabase RPCs and HomeOS identity helpers.
- HomeOS records are property-scoped around `property_id` for active home access.
- Legacy null-property cleanup 552 was completed and documented. It removed confirmed legacy rows and preserved the 10 orphan `home_item_files` rows for later review.
- Property-membership RLS repair 553 was applied in production and documented. It added HomeOS helper functions and repaired HomeOS record policies.
- System, area, and item labels were clarified so users understand the flow from system to area to items.
- Area health color rollup was fixed so area cards reflect the worst item state inside that area.
- Expanded HomeOS theme packs were added without changing the default classic theme.
- Theme selector was improved with preview cards, current-theme display, selected state, and reset-to-classic action.
- Profile settings page was polished so Appearance & Theme, Data Ownership, Company Invitations, Session Security, and Change Password are easier to find.

## Important Latest Commits

- e366acb - Add theme reset action
- eed0b22 - Polish HomeOS profile settings
- 2a8ed38 - Improve HomeOS theme selector
- 9815f8f - Add HomeOS theme packs
- `6553b22483d1a5cdf79c77190e4e8df0e23c1c37` - Document legacy null-property HomeOS cleanup
- `1c0d12710952f12e1c100157b635fdf544959acb` - Add HomeOS property membership RLS repair
- `0551ce6898f4ceaf477b1d904a0352e111171914` - Fix item condition section label
- `1031812dec0882d09d7cab3f1c82eb7c692d2aea` - Clarify system area and item labels
- `02ccd4f06ebb2ba68649a300f08a9303cc7d70dd` - Fix area health color rollup

## Current Architecture

- HomeOS is built for an authenticated homeowner session.
- `src/app/_layout.tsx` is the root auth/navigation guard. It resolves Supabase session state, public auth screens, first-home onboarding, active homeowner routing, and super-admin routing.
- `src/lib/onboarding.ts` decides whether a logged-in user should go to HomeOS, super-admin, or `/onboarding/create-home`.
- `src/lib/activeProperty.ts` resolves exactly one active `property_memberships` row for the authenticated user. Most HomeOS screens call `requireActivePropertyMembership()` before loading or writing property-owned records.
- `properties` is the canonical home record. Do not create a separate `homes` table.
- `src/lib/homeIdentity.ts` loads, creates, and updates verified home identity through RPCs including `create_homeowner_first_property`.
- The core homeowner flow is Systems -> Areas -> Items.
- System defaults and broad-zone behavior live in `src/lib/homeSystems.ts` and `src/lib/systemDefaults.ts`.
- System area lists are rendered by `src/app/system/[system]/index.tsx`.
- Area detail and nested child-area behavior are rendered by `src/app/system/[system]/area/[area].tsx`.
- Item creation, editing, and detail live in `src/app/item/create.tsx`, `src/app/item/edit.tsx`, and `src/app/item/[slug].tsx`.
- Area and item records use `home_items`; area rows are category `Area`, and item locations use `location` and `parent_area`.
- Item files and documents use `home_item_files` plus Supabase Storage buckets such as `item-files` and `item-photos`.
- The Documents screen reads property-scoped `home_item_files`.
- Maintenance reminders use `home_item_maintenance_tasks` and `home_item_maintenance_completions`, with helpers in `src/lib/maintenanceTimers.ts`.
- The Maintenance screen also still contains service history surfaces for `maintenance_records`.
- Jobs and service records use `src/lib/jobs.ts`, `jobs`, and `job_thread_events`.
- `property_id` is the HomeOS access boundary. New HomeOS reads/writes should filter or set the active property.

## Current Database And RLS State

- HomeOS rows should belong to an active `property_id`.
- Production has the helper functions added by migration 553:
  - `homeos_is_platform_admin`
  - `homeos_has_active_property_membership`
  - `homeos_can_read_property_record`
  - `homeos_can_mutate_property_record`
- Production has `jobs_property_id_idx` and `jobs_property_id_fkey` after migration 553.
- RLS now uses property membership for `home_items`, `home_item_files`, `home_emergencies`, `jobs`, and `job_thread_events`.
- `home_item_maintenance_tasks` and `home_item_maintenance_completions` already use active property-membership policies.
- There are 10 orphan `home_item_files` rows intentionally remaining for later review. Do not delete or "fix" them without a dedicated pass.
- `storage.objects` policies are intentionally not hardened yet. Storage policy hardening is next-risk work and must match the current upload path conventions before changing policies.
- `maintenance_records` is still a known schema/architecture decision point. Do not create or replace it casually.
- `property_id` should not be made `not null` without a dedicated review of preserved orphan and legacy rows.

## Known Risks And Do-Not-Touch List

- Do not touch `bravo-relay-codex-hotfix/` unless explicitly requested.
- Do not touch Bravo Relay from this repo unless the task explicitly switches projects.
- Do not run production SQL unless explicitly requested.
- Do not apply migrations unless explicitly requested.
- Do not change RLS or storage policies casually.
- Do not create sample data, hardcoded users, hardcoded homes, or hardcoded production IDs.
- Do not expose `.env` values, API keys, service-role keys, database URLs, tokens, sessions, or private credentials.
- Do not weaken destructive SQL guards in any relay or cleanup workflow.
- Storage policy hardening remains open and must be handled carefully.
- `maintenance_records` remains missing or inconsistent in some environments and needs a later product/schema decision.
- Multi-home switching is not implemented yet. Current active-home logic expects exactly one active membership.

## Validation Standard

- Run `npx.cmd tsc --noEmit`.
- Run `git diff --check`.
- Inspect `git status --short`.
- Stage only files for the requested pass.
- Commit and push only when explicitly asked.
- Do not include unrelated untracked folders, especially `bravo-relay-codex-hotfix/`.

## Recommended Next Work

- Finish testing item create, item edit, photo upload, document upload, document viewing, and delete/archive flows after the RLS repair.
- Prepare storage policy hardening only after confirming current app upload paths for `item-files` and `item-photos`.
- Review the 10 preserved orphan `home_item_files` rows in a separate safe preview/delete pass.
- Decide the future of `maintenance_records` versus item maintenance reminders and service history.
- Clean up Expo template identity in `package.json` and `app.json` later, in a dedicated app-identity pass.
