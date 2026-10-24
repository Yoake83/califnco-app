# Firebase setup status

Project: `califnco-176c3` (Califnco), Spark / no-cost plan.

## Completed

- Registered `califnco-app` web client.
- Registered Android package `com.califnco.store` as `Califnco Android`.
- Added the user-supplied `apps/mobile/google-services.json`, verified its project/package, and referenced it through `android.googleServicesFile` in Expo config.
- Enabled Email/Password in Firebase Authentication. Passwordless email links are disabled.
- Created the default Standard Firestore database in `asia-south1` (Mumbai).
- Verified Firebase Cloud Messaging HTTP v1 API is enabled (device push delivery is not configured).
- Initial provisioning used deny-all rules. Account profile rules have since been implemented and tested; see `authentication.md` for publication status.
- Installed Firebase JS SDK in mobile and admin workspaces.
- Saved public client configuration in `packages/core/src/firebase-config.ts`.
- Added mobile web, mobile native and admin initialization modules. Native Auth uses AsyncStorage persistence.
- Added Firebase project mapping, rules and indexes files locally.
- Ran the read-only connection probe: the SDK reached the correct project and Firestore rejected unauthenticated access with `permission-denied`, as expected.

## Not completed by console setup

Customer/dealer sign-in, registration and Firestore profile editing are now implemented. See `authentication.md` for the rule publication status. Orders and service requests remain local demo data, and admin approvals are not connected yet. No live user account or privileged admin claim was created by the implementation tests.

Next implementation:

1. Validate the user's first live registration and Android session restoration on a device. The tested profile rules have been published with the user's approval.
2. Connect dealer review to the protected admin panel; assign the first admin through a trusted environment.
3. Shared Firestore order/service repositories and protected admin access.
4. Tested collection-specific security rules; keep the database closed until these flows are ready.
5. Server-side checkout pricing/inventory/payment verification.
6. Android push setup: add Expo notifications/native configuration, configure the sending credentials securely, build and test on a device. The Android Firebase configuration file is now included; this alone does not establish working notification delivery.

The user supplied the downloaded Android configuration file. Its project is `califnco-176c3`, and its package is `com.califnco.store`. The existing web Firebase configuration remains separate and unchanged.

No billing upgrade, service-account key generation, IAM changes, real orders or social publishing were performed.

## Verification

```sh
npm run typecheck
npx tsx apps/mobile/scripts/verify-firebase.ts
npm run build:admin
npm test
```

The connection probe does not create an account or write a document. It expects the closed setup rules; replace it with authenticated integration tests when collection rules are implemented.

Dependency audit also flags Firebase's transitive Node-only gRPC transport (`@grpc/grpc-js` 1.9.16). Do not use this client dependency as an exposed Node gRPC server. Recheck compatible upstream updates before a server deployment; do not downgrade Firebase to the incompatible v9 version suggested by the audit. The existing Expo code-signing advisory is recorded in the main README.
