# Setup and remaining work

## Current boundary

Firebase accounts, protected admin login, dealer approvals and shared catalog management are implemented and published. Shared service bookings and order history are implemented with tested rules; see `orders-and-services.md` for publication status. The order API implements trusted pricing, inventory reservations, idempotency, cancellation and expiration, but awaits Vercel/server credentials. Razorpay payment processing remains unimplemented. Checkout is unavailable until the server is deployed. Do not use the app to accept real payments or fulfillment orders. See `feature-progress.md` for the current sequence.

## Firebase integration checklist

Console steps 1-4 and client initialization/native persistence from step 5 are complete. Remaining feature integration and security testing are listed below.

1. Create a Firebase project and select the Spark plan if zero cost is required.
2. Register a web app and copy its public Firebase configuration (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId). These identify the project; they do not replace secure database rules.
3. Enable Email/Password in Authentication.
4. Create Firestore with a chosen region; do not leave test-mode database rules deployed.
5. Connect Firebase JS SDK to both apps. Configure persistent native authentication storage.
6. Add customer sign-up, dealer application sign-up, sign-in, sign-out and error/recovery flows. The server creates a pending dealer application; users cannot approve themselves.
7. Grant an `admin` custom claim through a trusted Admin SDK environment; never let a client choose the admin role.
8. Implement rules so customers can read their own orders/services, approved dealers receive wholesale access, and only admins manage orders/dealers/services. Validate allowed profile fields; protect roles and approval status.
9. Replace both local repositories with shared Firestore subscriptions; preserve a clearly separate demo mode.
10. Test rules with Firebase emulators for cross-user access, dealer self-approval, role escalation and unauthorized order writes.

Never paste service-account private keys into chat or commit them. Server credentials belong in local ignored environment files and hosting secrets.

## Checkout and inventory

- Add a server API with Firebase token verification.
- Re-read product prices and the dealer approval state on the server. Do not trust amounts or wholesale flags sent by the app.
- Validate quantities, reserve stock in a transaction, and create Razorpay orders using test credentials on the server.
- Use an idempotency key to prevent duplicate orders on retry/double tap.
- Integrate native Razorpay checkout in an Expo development build; test success, cancellation, failure and retry on Android.
- Verify signatures and captured payment state server-side before marking an order paid. Add webhook verification and replay handling.
- Persist the price snapshot and restore inventory when appropriate.

## Notifications and location

- Configure Firebase Android application and FCM credentials for the native build.
- Request notification permission and store tokens per user/device; handle token refresh and logout.
- Test order/service push delivery on a real Android device.
- Add email and SMS provider adapters with delivery/error tracking. Confirm zero-cost regional availability; do not promise free SMS without verification.
- Replace the OpenStreetMap search link with address search/selection and saved coordinates. Comply with the chosen provider's attribution and usage policy.

## AI automation (mandatory, not implemented yet)

Suggested local runner: n8n in Docker, using credentials stored in n8n. Configure a daily schedule in Asia/Kolkata.

1. Select one eligible catalog product that has not already been posted for the day.
2. Generate a factual caption and hashtags with an available AI provider. Do not invent certifications or health claims.
3. Generate a realistic product image matching that SKU using an image-generation provider.
4. Upload to public image hosting and check that Meta can fetch it.
5. Create the Instagram media container, poll for readiness and publish through Meta's supported Instagram publishing API for the connected account type.
6. Record date, product ID, generated assets, caption, container ID, published post ID and errors. Prevent duplicate daily publishing and do not blindly retry an ambiguous publish response.
7. Test a complete post with the user's explicit authorization, then enable the schedule.

Before implementing, verify current Meta account requirements/permissions, provider API availability, publishing limits and free-tier policies in official documentation. Do not hard-code an assumed Graph API version. A workflow diagram or JSON stub is not evidence of successful scheduled publishing.

Optional: WAHA WhatsApp Status workflow with a secondary number, after core requirements work. Confirm current WAHA Status support and limits. No social publishing has been authorized or enabled by this prototype.

## Submission checklist

- [ ] Firebase Auth, Firestore and role security tested.
- [ ] Customer and dealer orders visible in the protected admin panel.
- [ ] Payment test mode, failure/retry and stock reconciliation tested.
- [ ] 50+ varied products with matching, licensed realistic images.
- [ ] Push, email and SMS delivered successfully.
- [ ] Address/map selection integrated.
- [ ] Daily AI image/caption workflow runs and publishes successfully.
- [ ] Admin deployed live on Vercel.
- [ ] Android APK built, installed and tested on a physical device.
- [ ] README updated to match live behavior and demo credentials documented safely.
- [ ] Submission assets/links prepared; Drive permissions verified where applicable.

Deadline in the supplied brief: **25 October 2026, 11:59 PM IST**. The brief requests quality over quantity. Prioritize reliable core flows before bonuses.
