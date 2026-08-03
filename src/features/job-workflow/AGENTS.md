# Job Workflow Feature

This area owns the flow from homeowner approval to job closeout:

- homeowner selection and work-approval signatures;
- cancellation notice acknowledgement;
- work timing, before and after photos, store trips, and issue pauses;
- technician completion, homeowner completion sign-off, invoicing, and payment closeout.

## Change scope

For a Job Workflow task, begin with these files only:

- `JobWorkflowScreen.tsx` — screen and interaction flow.
- `../../lib/jobWorkflow.ts` — typed Supabase client calls and workflow state.
- `../../supabase/migrations/20260726220000_quote_to_completion_workflow.sql` and later Job Workflow migrations — backend transition rules.

Do not change estimates, dispatch, price-book, HomeOS, or global navigation unless the workflow actually crosses that boundary.

## Non-negotiable safety rules

- An ordinary California home-improvement job must not begin during its cancellation period.
- Do not enable a generic “start now” button. An immediate start requires a separately validated Service and Repair or emergency-repair exception, including the required customer documentation and signature.
- Keep the existing server-side transition checks in place. UI buttons never replace backend authorization or workflow validation.
- A technician must record completion before a homeowner can sign the completed-work acknowledgement.

## Verification

Run the focused Job Workflow regression or SQL test when one exists, then run TypeScript, lint, and a web export before pushing a workflow change.
