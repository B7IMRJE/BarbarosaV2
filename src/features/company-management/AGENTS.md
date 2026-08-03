# Company Management Feature

This area owns the central company workspace and its team/permission controls.

Start here:

- `CompanyDashboardScreen.tsx` for company identity, branding, configuration,
  and the management hub.
- `CompanyUsersScreen.tsx` for company members, invitations, roles, and
  permissions.
- `../../lib/companyPermissions.ts`, `../../lib/companyAuditLogs.ts`, and
  `../../lib/companyWorkspaceTheme.ts` for shared business rules.

Boundaries:

- Treat permissions, roles, and company identity as company-scoped data.
- Keep pricing in `src/features/price-book` and dispatch in
  `src/features/dispatch`.
- Client/property detail pages remain in their route area until a customer
  operations feature is introduced.
- Audit relevant management actions through the existing audit helper.

Before publishing, run the project's TypeScript check, lint, web build, and
`git diff --check`.
