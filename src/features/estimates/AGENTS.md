# Estimates Feature

This area owns building a homeowner estimate from the technician's findings through option presentation.

## Start here

- `EstimateScreen.tsx` — estimate workspace, requirements, pricing review, and presentation.
- `../../lib/estimateOptions.ts` — option and requirement rules.
- `../../lib/estimateOptionPersistence.ts` — saved option sets and price adjustments.
- `../../lib/estimateRequirementPersistence.ts` — required photos and measurements.
- `../../lib/estimateSessions.ts` — estimate-session creation and context.
- `../../lib/companyPriceBook.ts` — approved company pricing used by estimates.

## Boundaries

- Keep estimate options, customer-facing wording, discount labels, price adjustments, and evidence requirements in this area.
- Price Book owns reusable company service cards and their base prices. Do not alter price-book data structures for an estimate-only change.
- Job Workflow begins only after the homeowner accepts selected estimate options. Do not change its approval, scheduling, or closeout rules during an estimate-only pass.
- Dispatch and TechOS may open an estimate, but they do not own the estimate calculation or presentation logic.

## Verification

- Run the focused estimate regression when option/pricing logic changes.
- Then run `npx tsc --noEmit`, `npm run lint`, `npm run build:web`, and `git diff --check`.
- Keep the route wrapper at `src/app/estimate/index.tsx` tiny; it is the stable app entry point.
