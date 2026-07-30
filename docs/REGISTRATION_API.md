# Community Registration API

Community Edition runs locally, but Product IDs must be issued by a small registration service in production so De-Omega-Point knows which business holds each copy.

## Configuration

Set `registrationEndpoint` in `config.js`.

Localhost and `file:` previews generate a development-only Product ID when the endpoint is blank. A public deployment refuses registration until an endpoint is configured.

## Request

`POST` JSON:

```json
{
  "businessName": "Example Café",
  "contactName": "Sam Example",
  "email": "owner@example.com",
  "businessType": "Café or food business",
  "termsAccepted": true,
  "feedbackConsent": true,
  "termsVersion": "1.0",
  "privacyVersion": "1.0",
  "registeredAt": "2026-07-30T12:00:00.000Z",
  "edition": "community"
}
```

## Response

Success:

```json
{
  "productId": "LFA-CE-7K4M9Q2R"
}
```

The service must:

- validate the three required fields and terms acceptance
- normalise the email address and validate its format
- generate eight random characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`
- reject Product ID collisions
- store consent versions and timestamps
- rate-limit registration attempts at the API gateway
- never accept customer loyalty records
- use HTTPS and restrict cross-origin access to official product origins

## Included Supabase implementation

This repository includes:

- `supabase/migrations/202607300001_community_registrations.sql`
- `supabase/functions/register-community-business/index.ts`

Deploy the migration and Edge Function, then set:

- `ALLOWED_ORIGINS` — comma-separated official app origins
- `WELCOME_EMAIL_WEBHOOK_URL` — optional internal email automation endpoint
- `WELCOME_EMAIL_WEBHOOK_SECRET` — bearer secret for that endpoint

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. Add gateway rate limiting before public launch. Put the deployed function URL into `registrationEndpoint` in `config.js`.

The optional welcome webhook receives one `community.registration.created` event containing the Product ID and registered business contact. It must send only the single welcome email described below.

## Minimal registry

- internal registration UUID
- Product ID
- business name
- contact name
- email
- optional business type
- registration timestamp
- terms/privacy versions
- feedback consent and timestamp
- survey status
- support or Launch Pack status

## Eight-week survey

The registry service is responsible for sending only:

1. the Product ID confirmation email
2. one optional survey at approximately 56 days when feedback consent is active
3. essential product or security notices

No reminder sequence is required.
