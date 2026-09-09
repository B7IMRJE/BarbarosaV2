# Company access and job messaging

General Manager uses the existing `manager` role. Only an active company owner can invite or appoint a General Manager, change that role, or change its permissions. Existing General Managers are preserved. No named account is reassigned. Platform administrators can still bootstrap the first owner of a new company; that does not grant them General Manager appointment rights.

Field Supervisor replaces the former broad Supervisor option. Existing supervisor memberships and pending invitations become field supervisors with field defaults. Field supervisors cannot open ManagementOS, dispatch, manage customers, change the catalog or price book, or manage people/company settings. Office Supervisor has office and dispatch access without personnel management by default.

Owners, admins, and General Managers with people-management permission can set role defaults, invitation overrides, and individual overrides. Owners retain full access. Individual overrides take precedence over role defaults, subject to protected role boundaries. Invitation acceptance copies the saved overrides. Technician estimate access previously bypassed its flags; this release preserves effective existing access once and enforces future removals.

Message Center is available from ManagementOS and TechOS Messages. It shows current and previous service requests with job numbers, technicians, unread customer/team counts, and pending help requests. Staff see assigned or explicitly shared jobs unless granted company-wide message oversight. Each job has separate customer and internal conversations, independent composers, and a clear homeowner-visible label on customer communication. Internal data is protected in the database as well as the interface.

Ask a supervisor selects an active member of the same company, adds access to that job conversation, and creates a help request with acknowledgement and resolution. A targeted native push contains generic text and a validated route back to the private conversation. It requires the recipient to enable phone alerts in the installed iPhone or Android app. Provider acceptance is distinguished from device delivery; browser push and SMS are not part of this release. No real notification was sent by automated tests.

Company conversation history is independent of employee access or subscription status. Deactivating or deleting a staff account does not erase its message history. Jobs with company conversations must be archived instead of deleting their history. This release does not introduce a billing, export, or retention-policy system.

## Validation

- `node scripts/test-company-messaging.cjs`: permissions, invitations, workspaces, existing customer/dispatch threads, and mocked targeted notification delivery.
- TypeScript, lint, web export, and `git diff --check`.
- `supabase/tests/company_supervisor_message_privacy.sql`, wrapped in `BEGIN` / `ROLLBACK`: owner-only leadership, saved invitation overrides, field/office limits, customer/internal separation, direct RLS denial, cross-company denial, targeted access, acknowledgement, and retained history. Fixtures are rolled back and never sent externally.

Apply the two September 8 company migrations and deploy `send-supervisor-request` before the web release. Keep unrelated pending migrations out of this release. Keep platform JWT verification enabled, as described in [Supabase authorization headers](https://supabase.com/docs/guides/functions/auth-headers). The notification worker also verifies the bearer session itself and only claims a ticket for the authenticated requester.
