# Company User Invitation Email Delivery Setup

The Team / Technicians page calls the Supabase Edge Function:

```bash
supabase functions deploy send-company-user-invitation
```

Required Supabase Edge Function secrets:

```bash
supabase secrets set PUBLIC_APP_URL=https://barbarosa-v2.vercel.app
supabase secrets set INVITE_FROM_EMAIL="HomeOS <invites@your-domain.com>"
supabase secrets set RESEND_API_KEY=...
```

or, for SendGrid:

```bash
supabase secrets set SENDGRID_API_KEY=...
```

Also supported for backwards compatibility:

```bash
supabase secrets set SUPABASE_ANON_KEY=...
```

or:

```bash
supabase secrets set SUPABASE_PUBLISHABLE_KEY=...
```

The app should also set:

```bash
EXPO_PUBLIC_APP_URL=https://barbarosa-v2.vercel.app
```

Why this matters:
- The app creates or reuses the manual company invite link before sending email.
- The Edge Function verifies the signed-in admin through `prepare_company_user_invitation_email_delivery`.
- The Edge Function sends the invite email through Resend or SendGrid.
- Service role secrets are not used in client code.
- If provider secrets are missing, the function returns a clear setup error and the manual invite link remains available.
