# Functional implementation order

UI redesign is deferred until functionality is finished, as requested.

1. **Account login and profiles:** implemented; profile rules published.
2. **Dealer approvals and protected admin:** implemented; first admin claim granted and verified for the owner account. Nine emulator tests passed before catalog work.
3. **Shared product catalog and admin stock editor:** implemented and rules published with approval; 12 Firebase tests and 6 domain tests pass. See `catalog.md`.
4. **Shared orders:** server pricing, stock reservations, idempotency, cancellation, expiration and UI integration implemented and emulator-tested. Order-history rules are published. An authenticated browser purchase against the deployed Vercel API verified shared order creation, inventory consumption and app/admin synchronization. See `orders-and-services.md` and `vercel-deployment.md`.
5. **Payments:** Razorpay test SDK/web checkout, server verification, webhooks, reconciliation and late-payment refunds implemented; private variables and Test Mode webhook configured. A ₹1 browser netbanking test was captured and shown as paid/Confirmed in app and admin. Native device, provider refund and independent webhook recovery tests remain pending. See `razorpay-test-checkout.md`.
6. **Shared service bookings and admin status management:** implemented and tested; service rules published with user approval.
7. **Address/location selection:** pending.
8. **Order/service/dealer notifications:** pending; native device verification required.
9. **Instagram image/caption generation and publishing:** pending; account/provider setup required.
10. **Android device tests, installable build and deployment:** pending.

No live payments or orders have been accepted. The catalog does not automatically import sample prices or stock.
