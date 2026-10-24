# Android phone test

The mobile app is linked to Expo project `@devika83s-team/yoake` (ID `ffab733c-1ca1-442c-bad1-0d5e4d977c4d`). The installed app name is Califnco and package is `com.califnco.store`. The `preview` EAS profile produces a signed APK for direct installation; the `production` profile produces an app bundle.

Run EAS commands from `apps/mobile`. Build with `npx eas-cli@latest build --platform android --profile preview`. Both build profiles pin Node 24.22.1 to satisfy Firebase's Node requirement. Signing credentials are managed by Expo; never commit a keystore or credential export. The app uses Firebase and the deployed Vercel commerce endpoint without requiring a local development server. Razorpay supports Test Mode only.

## Phone checks

1. Download the successful preview build's APK on the phone and install it. Open Califnco and confirm it launches without crashing.
2. Sign in with an existing app account. Verify profile role, dealer approval where applicable, and order history. Restart the app and confirm the sign-in persists.
3. Enable a clearly labelled temporary QA product in admin. Verify it appears on the phone; check the applicable retail/wholesale price and quantity rules.
4. Add the QA product to cart, enter test delivery details, and start checkout. Confirm native Razorpay opens in Test Mode with the expected amount. Use only the provider's published sandbox payment details.
5. Cancel checkout once; confirm the order stays unpaid and can be retried or cancelled. Refresh payment status before retrying an uncertain result.
6. Complete a sandbox payment. Verify Captured in Razorpay, paid/Confirmed on phone and admin, one stock deduction, and persistence after restarting.
7. Test one service booking and its admin status update. Restore the test catalog visibility afterward.

Record the phone model, Android version, build ID, actual outcomes and any crash/error text. Browser payment verification is already documented in `razorpay-test-checkout.md`; it does not count as a native Android pass. No physical phone result has been recorded yet.
