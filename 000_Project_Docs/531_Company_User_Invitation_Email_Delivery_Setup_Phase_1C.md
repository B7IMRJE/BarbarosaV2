# Company User Invitation Email Delivery Setup - Phase 1C

This phase uses Supabase Auth passwordless email delivery from the Edge Function. No third-party email provider is required.

## Edge Function secrets

Set these for the `send-company-user-invitation` function:

- `COMPANY_INVITATION_APP_BASE_URL`: public app origin, for example `https://your-app.example`.
- `COMPANY_INVITATION_CORS_ORIGINS`: comma-separated browser origins allowed to invoke the function.
- `COMPANY_INVITATION_REDIRECT_ORIGINS`: optional comma-separated redirect origins. If set, the app base URL origin must be listed.

Supabase provides these automatically in hosted Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS`

For local development, `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` can be used instead of `SUPABASE_PUBLISHABLE_KEYS`.

Do not put service-role keys or email-provider secrets in Expo client code.

## Supabase Auth configuration

In Supabase Auth URL Configuration:

- Site URL: the same origin as `COMPANY_INVITATION_APP_BASE_URL`.
- Redirect URLs: add the exact invitations URL ending in `/onboarding/company-invitations`.

For the Magic Link email template, use a token-hash callback so the Expo PKCE client can verify the link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">Open invitation</a>
```

The Edge Function sets `{{ .RedirectTo }}` to `/onboarding/company-invitations`.

## Local testing commands

Serve the function locally:

```bash
supabase functions serve send-company-user-invitation --env-file supabase/functions/.env.local
```

Invoke only against a local Supabase email sink or non-production project:

```bash
curl -i \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  --data '{"invitation_id":"<pending-invitation-id>"}' \
  http://127.0.0.1:54321/functions/v1/send-company-user-invitation
```

## Deployment command

```bash
supabase functions deploy send-company-user-invitation
```
