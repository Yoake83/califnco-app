# Califnco

React Native + Expo Android app, React admin panel and shared TypeScript/Firebase services for the Califnco Round 1 assignment.

**In progress, not submission-ready.** Login, profiles, protected admin access, dealer approvals and shared catalog management are connected to Firebase. Shared service bookings and private order history are implemented with published rules; see `docs/orders-and-services.md`. The admin and order API are deployed at https://califnco-admin-orpin.vercel.app. Private server credential setup and authenticated order checks remain pending. Checkout stays unavailable until the API URL is configured. Razorpay, notifications, map selection, social automation and APK/device testing remain outstanding.

## Run

Use Node 24.12+ (`.nvmrc` specifies 24.19.0) and npm from the workspace root:

```sh
npm install
npm run preview
npm run admin
```

The existing mobile preview is at http://localhost:8081 and the current admin preview is at http://localhost:5174. Development servers print their actual ports. Sign in to the admin panel with the owner's registered app account; the password is user-owned and not stored in this repository. Admin authorization is a trusted Firebase claim, separate from customer/dealer role and approval.

For local API work with trusted server credentials, run `npm run server`. See `.env.example` and `docs/orders-and-services.md`. No live server credential is configured on this computer. The mobile public API URL is configured through `apps/mobile/.env.local`, following its `.env.example`, after the server is deployed.

## Implemented functionality

- Firebase customer/dealer registration, sign-in, password reset, sign-out and session restoration; profile editing and incomplete-registration recovery.
- Pending dealer applications, protected admin review, approve/reject/reopen actions and live approval updates.
- Shared product catalog, category/search/price filtering, details, admin product/price/stock/visibility editing and private wholesale prices. Concurrent edits are detected.
- Per-account local cart, quantity and bulk limits, current product estimates and persistent checkout retry keys.
- Order server with Firebase token verification, role/pricing checks, atomic inventory reservations, duplicate prevention, cancellation, expiration and protected paid-order status transitions. Online deployment and payment integration remain incomplete.
- Shared service bookings, calendar validation, private request history and admin status management, with published access rules.
- Admin overview and exports use shared records. Old local demo order/service records are not displayed or imported.

The live catalog starts empty for an admin to populate. The original 55 mock SKUs are test fixtures. Their family photographs are representative, not exact model photographs. The assignment still requires populating at least 50 items with appropriate, licensed images; no live catalog records have been seeded automatically.

## Validation

```sh
npm run typecheck
npm run typecheck:tests
npm test
npm run test:firebase
npm run build:admin
cd apps/mobile
npx eslint App.tsx src
```

Firebase tests require Java and local Auth/Firestore emulators (ports 9099/8180), a Node 24.12+ runtime and no live credentials. All 20 Firebase/server tests and 7 domain tests pass. Mobile lint, TypeScript checks, the admin production build and the final Android JavaScript bundle export pass. This is not an APK or physical-device test.

The checked-in Android Firebase configuration matches `com.califnco.store`; configuration alone does not establish working push delivery.

## Implementation and deployment notes

- `docs/feature-progress.md`: implementation order and remaining features.
- `docs/authentication.md`: account security and tests.
- `docs/admin-access.md`: verified first-admin provisioning.
- `docs/catalog.md`: catalog schema, pricing privacy and publication.
- `docs/orders-and-services.md`: order server, service bookings and account/server setup.
- `docs/requirements.md`: the assignment requirements and deadline.

Vercel root directory: `apps/admin`; install workspace dependencies from the repository root, build with the app's build script and serve `dist`. Its `api` directory deploys as Node functions. Use Node 24.x. Keep server credentials in private hosting settings; never in mobile/web public environment variables. See `docs/vercel-deployment.md` for the deployed URL, runtime option and remaining credential setup.

No real payments, refunds, fulfillment orders, social posts or assignment submissions have been made. UI redesign is deferred until the functional work is complete, as requested.
