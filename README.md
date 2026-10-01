# NorthRide Backend

Express API for the NorthRide Expo app. Copy `.env.example` to `.env`, fill in
the database and provider credentials, then run `npm start` from this directory.

Set `SESSION_SECRET` to a unique random value and configure `CLIENT_ORIGINS`
with the exact browser origins used by the deployed client. Production startup
fails closed if `SESSION_SECRET` is missing.

`GOOGLE_MAPS_SERVER_API_KEY` is used only by the authenticated Places and
Directions endpoints and for server-side delivery quotes. Restrict it to the
Places API and Directions API, plus the backend's outbound IP where supported.
Set `GOOGLE_MAPS_ANDROID_API_KEY` in the Expo build environment for the native
Android map SDK; restrict that key to this app's Android package and signing
certificate. The SDK key is public in the installed app and must be restricted.

Paystack's dashboard callback URL is not required. The backend supplies a
per-transaction callback URL on its own public host, and the app verifies the
returned transaction reference with Paystack before recording payment. Set
`PAYSTACK_CALLBACK_URL` only if you need to override that callback URL. Payment
success is recorded only after Paystack verification or a valid signed webhook.

The mobile build also requires `EXPO_PUBLIC_BACKEND_URL`. Set
`EXPO_PUBLIC_DEV=dev` only for local development. The app's root `.env.example`
lists the client build variables; keep `GOOGLE_MAPS_SERVER_API_KEY` only in the
backend environment and never use an `EXPO_PUBLIC_` prefix for it.

Account registration accepts `userType: "customer"` (client) or `"rider"`;
omitting the field preserves the existing client registration behavior. Other
roles are rejected. Successful email/phone verification now signs the user in.
Verification, login, `GET /api/auth/me`, and rider onboarding completion return
the authenticated account as `user`, including `riderOnboardingCompleted`.
The session cookie must be included when restoring a session or completing
onboarding. Password hashes are excluded from these responses.
`POST /api/auth/logout` signs out the current account and destroys its session
before returning `{ "success": true }`.

Riders finish the onboarding flow with `POST /api/riders/onboarding/complete`
and `{ vehicleType, bankAccountName, bankAccountNumber, bankName }`. Supported
vehicle types are `bicycle`, `motorcycle`, `car`, `scooter`, `van`, and `truck`.
Completion belongs to the authenticated account and repeated requests are safe.
New profiles remain unapproved and unavailable; finishing onboarding does not
grant permission to accept work. Document uploads are not implemented by this
endpoint.

Before starting this backend version, apply migration `0013_rider_onboarding`
to the configured PostgreSQL database from this directory:

```sh
npm run db:migrate
npm test
npm start
```

The migration adds the persisted completion flag and marks existing approved
riders as complete. Existing clients keep their current dashboard access.
Tests use in-memory substitutes and do not contact databases, SMS, or email
providers. Applying migrations changes the configured database; the migration
has been prepared but is not run automatically by the application.
