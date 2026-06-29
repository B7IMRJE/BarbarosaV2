# Customer Invite Public URL And Delivery Setup

Customer invite links should use the stable production app origin, not a Vercel preview URL.

## Expo client env

Set this for the deployed app build:

- `EXPO_PUBLIC_APP_URL`: public production app URL, for example `https://barbarosa-v2.vercel.app`

The Clients page builds customer invite links as:

```text
${EXPO_PUBLIC_APP_URL}/customer-invite?code=...
```

If `EXPO_PUBLIC_APP_URL` is missing, the app falls back to `window.location.origin` and shows a warning when that origin looks like localhost or a Vercel preview URL.

## Email Edge Function env

Function: `send-customer-invite-email`

Required:

- `PUBLIC_APP_URL`: public production app URL used by the Edge Function when creating email links.
- `INVITE_FROM_EMAIL`: verified sender email address.
- `RESEND_API_KEY` or `SENDGRID_API_KEY`: provider API key.

Supabase hosted functions provide:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS`

Local fallback names supported:

- `SUPABASE_ANON_KEY`
- `SUPABASE_PUBLISHABLE_KEY`

Optional:

- `CUSTOMER_INVITE_CORS_ORIGINS`: comma-separated browser origins allowed to invoke the function.

No provider keys should be exposed in Expo client env.

## SMS/Text Future Env

Text sending is intentionally placeholder-only for now. Copy Text Message remains the reliable workflow.

Future SMS provider options:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_PHONE`
- `TELNYX_API_KEY`
- `TELNYX_FROM_PHONE`

Do not add these to Expo public env.
