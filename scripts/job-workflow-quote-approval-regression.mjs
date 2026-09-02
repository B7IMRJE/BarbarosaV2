import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(
    'supabase/migrations/20260902120000_keep_quote_approval_out_of_technician_status.sql'
), 'utf8');
const workflowScreen = readFileSync(resolve(
    'src/features/job-workflow/JobWorkflowScreen.tsx'
), 'utf8');

assert(
    migration.includes("and v_workflow.status <> 'sold'"),
    'A signed quote must not advance the technician dispatch status.'
);
assert(
    migration.includes('update public.service_requests'),
    'Quote acceptance must still update the linked service request.'
);
assert(
    migration.includes('update public.job_schedule_slots'),
    'Later technician workflow stages must continue syncing to Dispatch.'
);
assert(
    workflowScreen.includes("const [approvalMessage, setApprovalMessage] = useState('')"),
    'Step 3 needs action feedback beside the approval control.'
);
assert(
    workflowScreen.includes('{!!approvalMessage &&'),
    'Step 3 must render approval feedback without requiring the user to scroll to the page header.'
);

console.log('Job workflow quote approval regression checks passed.');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
