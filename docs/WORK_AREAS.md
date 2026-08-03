# HomeOS Work Areas

HomeOS is one application, but each change should belong to one work area. The purpose is to keep a repair small, testable, and easy to reason about without rereading unrelated parts of the product.

## How future work is scoped

1. Start with one work area and its feature instructions.
2. Touch another area only when the requested workflow crosses a real boundary.
3. Test that area’s flow before the full app checks.
4. Commit and deploy a completed work area independently, so live testing has one clear change to verify.

## Current work areas

| Work area | Main UI | Domain and data boundary | Use it for |
| --- | --- | --- | --- |
| Job Workflow | `src/features/job-workflow/JobWorkflowScreen.tsx` | `src/lib/jobWorkflow.ts`, Job Workflow migrations | approval, scheduling, active work, signatures, invoices, closeout |
| Estimates | `src/features/estimates/EstimateScreen.tsx` | `src/lib/estimateOptions.ts`, estimate sessions and price book | scope questions, options, discounts, presentation |
| Price Book | `src/features/price-book/CompanyPriceBookScreen.tsx` | `src/lib/companyPriceBook.ts` | company service cards, prices, limits, products |
| Dispatch | `src/features/dispatch/DispatchScreen.tsx`, `src/features/dispatch/DispatchWallScreen.tsx` | dispatch and service-request helpers | assignment, scheduling, live board, technician status |
| TechOS | `src/app/techos.tsx`, `src/app/techos/job/[jobId].tsx` | TechOS workflow helpers | technician jobs, job actions, provider experience |
| HomeOS | `src/app/index.tsx`, `src/app/system`, `src/app/item` | active-property and home-item helpers | homeowner systems, areas, equipment, maintenance |
| Company Management | `src/app/super-admin/company` | company permissions and management data | team, clients, providers, company configuration |

## Refactoring order

Job Workflow is the first focused feature module. Move the next large screen only when its next feature is being worked on:

1. Estimates
2. Dispatch
3. Price Book
4. TechOS
5. HomeOS equipment and item details

This avoids a risky all-at-once rewrite while ensuring every new repair becomes smaller from this point forward.
