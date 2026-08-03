# TechOS Feature

This area owns the technician’s day-of-work experience.

## Start here

- `TechOSScreen.tsx` — technician dashboard, assigned work, visit status, estimates, timing, and clock activities.
- `TechOSJobDetailScreen.tsx` — technician job detail view.
- `../../lib/techosWorkflow.ts` — field-work state and technician status wording.
- `../../lib/techosAssignments.ts` — technician assignment filtering and validation.
- `../../lib/technicianTimeClock.ts` — time and approval records.

## Boundaries

- TechOS owns field execution and technician-facing actions.
- Dispatch owns assignment, office scheduling, and the operations board.
- Estimates own pricing and homeowner-facing quote choices.
- Job Workflow owns homeowner signatures, signed approvals, and final job closeout.
- Keep Customer/HomeOS display changes out of a TechOS-only pass.

## Verification

- Run the focused TechOS helper/regression for the behavior being changed.
- Then run `npx tsc --noEmit`, `npm run lint`, `npm run build:web`, and `git diff --check`.
