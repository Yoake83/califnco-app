# Live dealer approvals

## Implemented

The admin panel requires Firebase email/password sign-in and a trusted `admin: true` custom claim. A signed-in customer or dealer sees an access message and cannot enter the dashboard. Firestore rules independently enforce access; editing the UI or a profile cannot grant admin rights.

The dealer section subscribes to real `users` documents with `role == 'Dealer'`. It shows business, contact, email, phone, address and approval status, with search and status filtering. Approve, reject and reopen actions require a decision confirmation. A Firestore transaction checks the previously displayed status before saving, so a stale decision does not overwrite another admin's decision. The mobile profile subscription receives the changed status and updates ordering eligibility.

Catalog, orders and service screens now use shared Firebase records. Order mutations require the protected order API, which is not deployed yet. Admin exports contain the shared records visible to the administrator. No dealer seed records are shown in the live list.

## First administrator

The first administrator has been provisioned and verified through a trusted environment. Personal account identifiers are omitted from this public guide. No password or private key was created or downloaded. Local tests do not grant live admin privileges.

The reviewed script is `scripts/grant-admin.mjs`. It is fixed to project `califnco-176c3`, looks up an existing account, rejects disabled users, preserves other claims and verifies the result after applying. It never creates an account or password.

In a trusted environment with Application Default Credentials and Node 24.12+:

```sh
node scripts/grant-admin.mjs --email=ADMIN_EMAIL
node scripts/grant-admin.mjs --email=ADMIN_EMAIL --uid=VERIFIED_ACCOUNT_UID --apply
```

The first command previews the project, email and UID. The second grants admin access. Google Cloud Shell can supply the project owner's authenticated environment without downloading a service-account private key. Accepting its first-use terms and granting live access require explicit browser confirmations.

After provisioning, sign in at the admin preview. An already signed-in user can select **Refresh access** to retrieve a new token. Revoking a custom claim is subject to Firebase token lifetime; the server rules reject requests once a refreshed token no longer has the claim.

## Validation

- Admin production build and TypeScript checks pass.
- The current suite of 20 Firebase/server tests passes, including live dealer query filtering, approve/reject/reopen persistence, stale decisions, non-admin rejection and preventing changes to other dealer fields.
- Browser verified the admin sign-in gate at `http://localhost:5174/`.
- No live dealer decision has been made by automated testing.

Firebase references: [custom claims](https://firebase.google.com/docs/auth/admin/custom-claims) and [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).
