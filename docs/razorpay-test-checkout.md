# Razorpay test checkout

The Expo app uses Razorpay's official React Native SDK on Android and Standard Checkout in the web preview. Vercel creates provider orders and verifies captured payments. Live keys are explicitly rejected. No secret is shipped in the app.

## Private setup

In Vercel → califnco-admin → Settings → Environments → Production, add these as **Secret** variables:

- `RAZORPAY_KEY_ID`: the test ID beginning with `rzp_test_`.
- `RAZORPAY_KEY_SECRET`: the matching test secret.
- `RAZORPAY_WEBHOOK_SECRET`: your own randomly generated secret, at least 20 characters. Use the same value in the Razorpay webhook settings; it is separate from the API secret.

In Razorpay **Test Mode**, add the webhook URL:

`https://califnco-admin-orpin.vercel.app/api/razorpay-webhook`

Select `payment.authorized`, `payment.captured`, `order.paid`, `refund.processed` and `refund.failed`. Save/enable it and redeploy Vercel after saving secrets. Keep downloaded keys and secret values out of chat and GitHub. Configure `APP_ORIGINS` with the admin origin plus the exact web preview origin when testing that preview; native requests do not require a browser origin.

The app defaults to the deployed `/api/commerce` URL; `EXPO_PUBLIC_COMMERCE_API_URL` can override it. Readiness is checked before reserving a new cart. Readiness checks validate configuration presence, not provider account credentials or webhook registration.

## Behavior

1. A signed-in, approved account reserves stock using trusted prices and a persisted checkout retry key.
2. Payment setup uses a transaction lease. The server reuses the attached provider order and can recover an uncertain provider create by its unique receipt. Provider calls are never made inside Firestore transaction callbacks.
3. Checkout receives the public test key, provider order ID and server-computed amount in paise. Its response is saved locally before server verification; reopening payment can retry that verification.
4. The server verifies HMAC using the stored provider order ID, fetches the provider payment, checks amount/currency/order, captures authorized payments and confirms only captured payments. The client cannot mark an order paid.
5. Signed raw-body webhooks reconcile payments independently of the phone. Duplicate callbacks/events are idempotent through transaction receipts. Event IDs alone are not trusted. Customers and admins can also refresh payment status.
6. Captured payments arriving after expiry/cancellation, and duplicate captures, create refund jobs. A stable `X-Refund-Idempotency` key prevents double refunds. Orders awaiting a refund are never fulfilled. Refund state becomes Refunded after provider verification. Failed refunds remain visible as pending and need support review.

Expiration/cancellation and payment confirmation are serialized by transactions. Paid inventory stays consumed; refunded expired/cancelled inventory is released once. Existing Firestore rules deny client access to the new internal payment collections and deny all client order writes, so no rules expansion is needed.

## Verification and limits

26 Firebase/server tests and 7 domain tests pass. They cover owner/admin access, forged signatures, amount/currency mismatch, capture verification, duplicate callbacks, receipt recovery, stable refund keys, late payments, cancellation races and raw webhook signatures. Type checks, mobile lint and admin build pass. The Android JavaScript/Hermes export passed with the SDK; this does not verify native Android linking or an installed APK.

The SDK is not available in Expo Go. Use a development build or preview APK for Android testing. Web preview checkout is also supported. Actual Razorpay test-account transactions and dashboard webhook delivery still require owner setup and an approved account with a catalog product. No live payment has been made. Scheduled cleanup/reconciliation and synchronization of refunds initiated manually outside the app are not implemented.

References: [Razorpay React Native SDK](https://github.com/razorpay/react-native-razorpay), [Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [webhook signatures](https://razorpay.com/docs/webhooks/validate-test/), [refund idempotency](https://github.com/razorpay/markdown-docs/blob/master/api/refunds/normal-refunds-idempotent.md).
