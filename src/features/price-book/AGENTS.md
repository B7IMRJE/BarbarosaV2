# Price Book Feature

This area owns company service cards and the company’s reusable pricing information.

## Start here

- `CompanyPriceBookScreen.tsx` — cards, pricing details, bulk actions, import, calculator, and approved price research.
- `../../lib/companyPriceBook.ts` — saved company-specific prices and access-aware data operations.
- `../../lib/plumbingPriceBookCatalog.ts` — starter plumbing catalog and categories.
- `../../lib/temporaryRiversidePlumbingPriceList.ts` — temporary planning-reference source; do not present it as a saved company price.

## Boundaries

- Price Book owns reusable base prices, material and labor details, pricing tools, and service cards.
- Estimates read approved Price Book values and apply estimate-specific choices or discounts; do not make a Price Book change for a one-time estimate adjustment.
- Company Management owns which team members have Price Book permission.
- Do not alter job approval or payment/closeout rules during a Price Book-only repair.

## Verification

- Run focused Price Book coverage if the data behavior changes.
- Then run `npx tsc --noEmit`, `npm run lint`, `npm run build:web`, and `git diff --check`.
