import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(
    process.cwd(),
    'supabase/migrations/20260817130000_assigned_job_customer_media_access.sql'
), 'utf8');

assert(
    migration.includes('company_sales_context_matches_client_home('),
    'Customer-media reads must validate the Sales Tech assigned-job context on the server.'
);
assert(
    migration.includes('public.service_request_media_can_view(service_request_id)'),
    'Attachment reads must use the assignment-aware read helper.'
);
assert(
    migration.includes('public.service_request_media_storage_can_view(name)'),
    'Private storage reads must use the assignment-aware read helper.'
);
assert(
    migration.includes("'service_request_media_viewed'"),
    'Authorized customer-media gallery reads must remain auditable.'
);

const writePolicies = migration.match(/create policy service_request_media_(?:insert|update|delete)[\s\S]*?;/g) || [];

assert(
    writePolicies.length === 0,
    'The assigned-media release must not replace or broaden any customer-media write policy.'
);
assert(
    !migration.includes('service_request_media_storage_can_view(name)\n    )\n    with check'),
    'The read-only storage helper must never authorize uploads or mutations.'
);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
