# Browser customer invitations and call intake

The office can distinguish a new customer from an existing company customer and independently choose customer setup, repair, warranty review, or maintenance. Emergency is a separate urgency setting. Setup-only invitations continue normal HomeOS onboarding and never create a dispatch lead.

Service invitations create a company-scoped pending call immediately. Dispatch and the activity board display it under Emergency Leads or Regular Leads, with contact information and intake progress. A confirmed homeowner address and completed service request replace the pending call with one normal dispatch request. Warranty and maintenance remain explicit in the saved request summary. Warranty invitations do not promise coverage.

The browser link preloads the one-time invitation code. After the existing code-verification session starts, service callers confirm contact information, choose an existing home or create their first verified property, and describe the issue with optional photos/video. Theme, rooms, starter equipment and password setup do not block this service flow. The ordinary invitation and company-team password flows remain intact. Preferred-provider acceptance is automatic and uses the exact inviting company.

Contact corrections are stored for office review and do not change the authenticated email. Internal office notes are excluded from the public invitation lookup and the customer intake response. The new table is readable only by authorized company staff; customer access uses authenticated, invitation-bound functions. No guest access or anonymous permission was added to the intake APIs. Existing anonymous phone capture remains limited to its expiring token.

Creation and submission retry against stable invitation/intake IDs. The server locks the intake when creating its request. Draft text and access instructions are saved in the database. Phone uploads are linked to the intake for authenticated recovery; saved phone attachments retain stable IDs and are reconciled after lost responses. Finishing a phone link cannot delete a saved request attachment. Files selected only from the local device must be reselected if the browser closes before uploading.

The submitted request shows its number, photos and customer conversation. Account security and optional device-install guidance follow submission. Internal team conversation controls are not exposed in this homeowner view.

Also includes the previously local ManagementOS Home-button destination correction and responsive management-card widths. The legacy homeowner invitation placeholder now opens the real customer invitation composer.

## Validation

- TypeScript, lint, static web export, whitespace checks.
- `scripts/test-customer-call-intake.cjs`: receipt handling, authorization error propagation, authoritative urgency, photo polling, safe cleanup, lost-response reconciliation and duplicate upload prevention.
- Existing invited-provider and company-messaging regression suites.
- `supabase/tests/customer_call_intake.sql`: rollback-only synthetic office/customer fixtures, setup-only exclusion, warranty emergency, maintenance, existing-home reuse, retry idempotency, company and homeowner privacy, revoked/cancelled access, completion recovery.
- Existing anonymous phone-capture SQL regression.
- Browser checks of the quick-link landing page, invalid-invitation recovery, and signed-out phone-capture page. No real invitation was redeemed or message sent during automated verification.

## Deployment

Apply only `20260909180000_customer_call_intake.sql`, then publish the web commit on main through the existing Vercel integration. Do not include the unrelated pending quote-approval migration. Verify the installed functions with rollback-only fixtures and verify the published bundle, invitation page and phone route before reporting release readiness.

## Pilot test

1. Customer setup invitation: normal home setup, preferred company, no dispatch call.
2. New emergency caller: pending Emergency Lead appears before opening link; browser confirmation, verified address, photos via phone QR, submit, one request and customer thread.
3. Existing customer: select saved home and maintenance; no duplicate home, Regular Lead, maintenance reason preserved.
4. Warranty emergency: warranty review label and emergency priority remain separate.
5. Interrupt and resume a service invitation; retry after a failed upload and confirm one request and one attachment per photo.
