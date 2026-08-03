# Dispatch Feature

This area owns office dispatch and the live dispatch wall.

## Start here

- `DispatchScreen.tsx` — dispatch queue, assignment, scheduling, customer updates, and visit closeout.
- `DispatchWallScreen.tsx` — live operations wallboard and its realtime behavior.
- `../../lib/dispatchOffice.ts`, `dispatchRisk.ts`, and `dispatchScheduling.ts` — office behavior.
- `../../lib/dispatchWall*.ts` — wall layout, lifecycle, routing, and classification.
- `../../lib/serviceRequest*.ts` — request events, status updates, notifications, and realtime topics.

## Boundaries

- Dispatch owns assignment, schedule slots, operational status, and customer/technician status notifications.
- TechOS owns the technician’s field experience after dispatch assigns a job.
- Job Workflow owns homeowner approval, work execution records, signatures, invoicing, and final closeout.
- Do not change Price Book or estimate calculations during a Dispatch-only repair.

## Verification

- Exercise the dispatch helper/regression that matches the changed behavior.
- Then run `npx tsc --noEmit`, `npm run lint`, `npm run build:web`, and `git diff --check`.
