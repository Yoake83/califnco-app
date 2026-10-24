# Shared orders and service bookings

## Order server

`apps/admin/api/commerce.ts` is a Node server function intended for the same Vercel project as the admin panel. It verifies Firebase ID tokens and rejects untrusted browser origins. It supports creating unpaid reservations, cancelling unpaid orders, admin delivery status updates and admin expiration cleanup.

The server reads the current profile, catalog prices and inventory. Clients cannot choose wholesale eligibility, prices, totals or payment status. A Firestore transaction creates the order and reserves stock together. An idempotency key is scoped to the signed-in account; repeating the same request returns the existing order, and using the same key for a different cart is rejected. Each account can hold at most three unpaid orders. Concurrent checkouts cannot oversell the same stock.

Reservations last 15 minutes. Cancellation and expiration restore inventory once and release the account's pending-order slot. Expiration runs before new checkouts and can be triggered by an authenticated admin API call. There is no scheduled cleanup job yet; a production scheduler must be added with payment reconciliation before launch. The server does not yet create Razorpay orders, verify captured payments, process webhooks or issue refunds. No endpoint can mark an order paid from a phone or admin form. Delivery status can only advance for a verified paid order.

The mobile app and admin panel subscribe to shared order records. Owner queries are limited by UID; only admins can list all orders. All client order writes are denied by rules. The mobile client persists its checkout attempt before sending it, preserving the key across an uncertain response/restart. The local sample order history is no longer displayed.

**Deployment boundary:** server code and emulator tests are complete. The API is not deployed and no server credential has been configured. Checkout is disabled until `EXPO_PUBLIC_COMMERCE_API_URL` is set. Razorpay is not implemented yet. Do not accept live payments or fulfillment orders.

## Service bookings

Customers and dealers can book repair, installation, filter change or maintenance visits. Bookings save to Firestore and appear in the same admin service desk. Admins can assign, resolve or reopen requests; updates appear in the customer's history. Concurrent admin status changes are detected. Retrying a booking ID does not create a second request.

Rules enforce owner identity, initial Open status, profile contact name, field limits, valid phone/address, server timestamps and visit dates from today through the next 365 days using the India calendar. Visit dates are stored as real timestamps representing noon UTC on the chosen calendar date, not as unchecked date strings. Only admins can update status, and no client can rewrite the booking's contact/address details.

On 24 October 2026, with explicit user approval, the service and order-history rules compiled and were published to `califnco-176c3`. Browser checks confirmed the signed-in user's empty service and order histories load successfully. No live service booking or order was created by automated tests.

## Server setup after account creation

1. Create your own Vercel account. Deploy `apps/admin` with workspace dependencies available and the existing `vercel.json` configuration. The `api` directory must deploy as Node functions, alongside the static admin UI.
2. Configure a server identity for `califnco-176c3` in Vercel's private environment settings. The code supports Application Default Credentials in a trusted Google environment, or `FIREBASE_SERVICE_ACCOUNT_JSON` on a host that needs a server credential. Do not use the public Android/web configuration as this credential. Keep server secrets out of `VITE_` and `EXPO_PUBLIC_` variables.
3. Set `APP_ORIGINS` to the exact web/admin origins, separated by commas. Set the mobile API URL to `https://YOUR-DEPLOYMENT/api/commerce` and rebuild the app.
4. Create your own Razorpay account and open its test dashboard. Add test credentials directly to the server settings when payment integration is implemented; do not paste secrets into chat. Finish signature/capture/webhook verification and reservation reconciliation before enabling checkout.

For local server work, use Node 24.12+ and a trusted ADC environment or a local ignored `.env.local` configured from `.env.example`. Run `npm run server` from the repository root; the API binds to loopback on port 3001. The admin development server proxies `/api` to it. These local server credentials are not configured on the current computer.

## Verification

20 Firebase/server tests and 7 domain tests pass. They cover token/admin checks, CORS, price tampering, duplicate retries, concurrent stock reservations, cancellation/expiration, order privacy, service privacy/schema/date validation and stale admin decisions. Mobile lint, type checks and the admin build pass. The final Android JavaScript bundle (including orders and services) compiled successfully. This is not an APK or device test.

References: [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [Firebase custom claims](https://firebase.google.com/docs/auth/admin/custom-claims), [Razorpay integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).
