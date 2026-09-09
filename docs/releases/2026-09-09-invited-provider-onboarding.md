# Invited company connection during homeowner setup

A customer could use a company login code, create a home, and reach Request Service while the company invitation was still pending. The form then showed “Provider: Not selected” and disabled submission.

The login flow now retains the specific invitation before starting the session. First-home creation saves that home and its invited provider in one database transaction. An existing homeowner with one home connects automatically; someone with multiple homes chooses which home to connect, without choosing another company or accepting the invitation again. Failed connections remain retryable. The Request Service screen explains an unfinished connection and can refresh its provider without clearing the current description or media.

The acceptance function locks the invitation and makes a repeated acceptance succeed only for the original account and home with an active existing relationship. A retry cannot transfer an invitation or restore a revoked connection. Existing property access, invited-email validation, provider category rules, and protected photo/document permissions remain enforced.

Validation: TypeScript, lint, web export, focused invitation helper regressions, and rollback-only database tests for atomic creation, same-home retries, exact inviting company, wrong account/home rejection, expired invitations, and revoked connections. Release verification checks the deployed web bundle and repeats the database tests against the installed functions. A fresh invitation on the user's iPad remains the device acceptance test.
