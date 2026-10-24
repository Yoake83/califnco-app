# Shared product catalog

The admin catalog editor adds and edits products, retail/wholesale prices, stock, minimum bulk quantity, image URL, category, description and shop visibility. SKU is immutable after creation. Hide a product instead of permanently deleting it. Only trusted admin tokens can write catalog records.

`products/{sku}` contains retail product information and no wholesale price. `dealerPrices/{sku}` contains wholesale pricing separately. Authenticated shoppers can query active products; customers and pending/rejected dealers cannot read wholesale prices. Approved dealer access is checked against the current profile document by Firestore rules, not a user-editable flag in the app.

Admin saves use transactions with an expected revision. Public and private documents are written together; rules validate fields, timestamps, revisions, price ranges, quantities and the paired write. Stale edits require reloading instead of overwriting newer changes. Both apps subscribe to these collections, and wholesale prices are used only when their revision matches the product revision.

The shop starts empty until real products are added. The original 55 sample SKUs remain only as domain test fixtures; there is no silent fallback to them. Image URLs must use HTTPS. Binary image uploads and licensed product assets are separate work.

The cart uses current active product records. Hidden products are marked unavailable; missing wholesale prices prevent checkout. Cart estimates use the supplied catalog instead of static fixtures. Checkout now uses the protected order API, which reserves stock on the server. The API is not deployed yet, so checkout is unavailable until its URL is configured. No local sample order is created. See `orders-and-services.md`.

Deployment status: on 24 October 2026, after the user's approval, the catalog rules compiled and were published successfully to `califnco-176c3` through authenticated Cloud Shell. All 12 Firebase tests and 6 domain tests pass. Mobile lint, type checks, the admin build and the Android JavaScript bundle export pass. No APK/device test or live product creation was performed.

References: [Firestore query access](https://firebase.google.com/docs/firestore/security/rules-query), [validating paired writes](https://firebase.google.com/docs/firestore/security/rules-conditions).
