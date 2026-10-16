# NorthRide Backend

Express API for the NorthRide Expo app. Copy `.env.example` to `.env`, fill in
the database and provider credentials, then run `npm start` from this directory.

Set `SESSION_SECRET` to a unique random value and configure `CLIENT_ORIGINS`
with the exact browser origins used by the deployed client. Production startup
fails closed if `SESSION_SECRET` is missing.

Email verification is sent through the Brevo HTTPS API, so outbound SMTP is
not required. Set `BREVO_API_KEY` and `BREVO_FROM_EMAIL` in the backend
environment, including the Render service's Environment settings. The sender
address must be added and verified in Brevo. Brevo allows verifying a sender
address by receiving a confirmation code at that address; domain
authentication is recommended but is not required just to verify a sender.
`BREVO_FROM_NAME` is optional and defaults to `NorthRide`. `SMTP_USER`,
`SMTP_PASS`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` are not used.

`GOOGLE_MAPS_SERVER_API_KEY` is used only by the authenticated Places and
Directions endpoints and for server-side delivery quotes. Enable billing and
the Places API (Legacy) and Directions API for its Google Cloud project, then
restrict the key to those APIs and the backend's outbound IP where supported.
Set `GOOGLE_MAPS_ANDROID_API_KEY` in the Expo build environment for the native
Android map SDK; restrict that key to this app's Android package and signing
certificate. The SDK key is public in the installed app and must be restricted.

Google and Facebook sign-in are verified by the backend before a NorthRide
session is created. Configure `GOOGLE_OAUTH_CLIENT_IDS` as a comma-separated
allowlist of the Google Android, iOS, and web client IDs used by the app.
Configure `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` from the same Facebook
app used by the mobile build. These are backend-only variables; never expose
the Facebook secret to the client. The mobile build separately needs
`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`,
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and `EXPO_PUBLIC_FACEBOOK_APP_ID`.
Configure the Google OAuth clients with the app's package/bundle identifiers
and signing certificate as required by each platform. Enable Facebook Login's
native Android and iOS platforms and allow its `fb<APP_ID>://authorize`
callback. The app registers native callback schemes through `app.config.js`;
rebuild native binaries after changing IDs or schemes.

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
roles are rejected. The mobile registration form does not collect a name;
verified riders must save one with `PATCH /api/users/me/full-name` before
starting onboarding. Successful email/phone verification now signs the user in.
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
grant permission to accept work. After completion, the mobile app uploads six
required rider document images through short-lived presigned S3 requests. Only
administrators can request short-lived preview links. Configure `AWS_REGION`,
`AWS_S3_BUCKET`, and the backend's AWS SDK credentials (prefer the hosting
platform's IAM role; never put AWS credentials in the mobile app or admin web
build). Grant the backend principal `s3:PutObject`, `s3:GetObject`, and
`s3:DeleteObject` only for the `rider-documents/*` bucket prefix. The bucket
must block all public access and use default server-side encryption. Uploads
are restricted to JPEG, PNG, or WebP images up to 5 MB.
Rider approval is rejected until all six required documents are present.

The admin-only `POST /api/users/admin` endpoint creates active, verified
customer, rider, or administrator accounts. It accepts `fullName`, `email`,
optional `phoneNumber`, `password` (minimum 8 characters), and `userType`.
Rider accounts complete the normal rider onboarding flow before submitting
documents.

Before starting this backend version, apply pending migrations, including
`0016_rider_documents`, `0021_kind_vermin`, and `0022_rainy_payback`, to the
configured PostgreSQL database from this directory:

```sh
npm run db:migrate
npm test
npm start
```

Rider preferences are stored per account and filter available ride/delivery
offers and in-app notification categories. Saved rider places use the existing
`user_addresses` table. Rider account removal deactivates the account and
anonymizes personal profile, location, document, and payout details while
removing stored document images while retaining transaction history. Removal
is blocked while the rider has active work or unpaid earnings.

The migration adds the persisted completion flag and marks existing approved
riders as complete. Existing clients keep their current dashboard access.
Tests use in-memory substitutes and do not contact databases, SMS, or email
providers. Applying migrations changes the configured database; the migration
has been prepared but is not run automatically by the application.
