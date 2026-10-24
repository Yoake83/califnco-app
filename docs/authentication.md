# Customer login and dealer registration

## Deployment status

Implementation and local Firebase emulator tests are complete. With the user's approval, the profile security rules were published to `califnco-176c3` on 24 October 2026; Firebase confirmed successful publication. Customer registration and pending dealer applications can now save live profiles. No personal live account was created by automated tests; the user registered their own account. Accounts created before publication can finish missing profile setup without creating a second login.

## Implemented

- Customer and dealer email/password sign-in entry points.
- Customer registration and dealer applications with contact name, business name, phone and address.
- Firebase-authenticated session restoration on web and Android; sign-out.
- Password reset email requests with a neutral response for unknown addresses.
- Firestore profiles at `users/{Firebase Auth UID}`.
- Recovery when authentication succeeds but the profile is missing or could not be saved.
- Explicit profile saving to Firestore. Email, role and approval cannot be edited through the profile form.
- New dealers start with `role: "Dealer"` and `approval: "pending"`.
- Pending and rejected dealers can browse; ordering requires approval. Approval changes are observed through a live profile subscription.
- Local carts are separated by Firebase UID. Orders and services now use shared collections; earlier demo order/service records are not imported.
- Expo Router handles the account gate, login route and store navigation. UI styling is retained.

Passwords are sent only to Firebase Authentication. They are not written to Firestore, AsyncStorage, app logs or application files. The Firebase SDK manages its normal sign-in session persistence.

## Rules

- Owners can create/get their own profile and update only name, phone, address, business name and update time.
- New dealer profiles must be pending. Role, email, UID, creation timestamp and approval cannot be changed by an owner.
- Only a trusted Firebase `admin: true` token claim can list profiles or change a dealer decision. First-admin provisioning is a separate trusted operation described in `admin-access.md`.
- Unknown/extra fields and mismatched account identifiers are rejected.
- Orders, inventory, service records and other collections remain closed to clients until their separate backend work is implemented.

The admin panel now has protected Firebase sign-in and a live dealer-management view. Its approval buttons update real dealer profiles; see `admin-access.md` for the first administrator's provisioning status. Catalog, order and service screens also use shared records; see their implementation/deployment notes.

## Validation

Node 24.12+ is required by the aligned Firebase SDK/test packages; `.nvmrc` specifies 24.19.0. Java 21+ is required for the Firestore emulator. A bundled Node 24 and installed Java 22 were used for Firebase tests.

```sh
npm run typecheck
npx tsc -p tsconfig.tests.json
npm test
cd apps/mobile
npx eslint App.tsx src
npx expo export --platform android
```

From repository root, with Node 24 active:

```sh
npx firebase emulators:exec --project demo-califnco --only auth,firestore "node --import tsx --test --test-concurrency=1 apps/mobile/scripts/auth-rules.test.ts apps/mobile/scripts/auth-integration.test.ts"
```

The original account tests cover customer registration/login/profile edits, dealer pending state/login, interrupted registration, profile privacy, cross-user access, role/approval escalation, trusted-admin decisions, live dealer subscriptions and stale decision prevention. Seven domain tests now cover pricing, quantities, delivery and registration validation. All passed. Browser checks covered role switching, registration fields, required-field errors, initial authentication routing and the admin sign-in gate. The Android JavaScript bundle compiled; APK/device session persistence still needs a device test.

The emulator project is `demo-califnco`, bound to loopback only: Auth 9099 and Firestore 8180. Optional emulator app mode requires `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true`; production is the default. Emulator tests create synthetic local accounts only. No live user credentials or admin account were created by these tests.

## Remaining app features

Shared order/service screens are implemented; see `orders-and-services.md` for rule publication and API deployment status. Payments, push/email/SMS notifications, map selection, social automation and device/release testing remain outstanding.
