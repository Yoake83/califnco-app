# Califnco Round 1 - requirements from the assignment

Source: `C:/Users/sonid/Downloads/soft-dev-round-1.pdf`, all three pages visually reviewed.
Deadline stated in the document: 25 October 2026, 11:59 PM IST.

## Mandatory deliverables

1. Android app built with a cross-platform framework and Firebase.
2. Admin panel deployed to Vercel.
3. Automated daily Instagram product post with an AI-generated product image, caption and hashtags.

### Customer

- At least 50 catalog items across purifiers, dispensers, pumps, filters and spares.
- Mock product data is allowed; images must realistically match product names.
- Cart, checkout, order history, service booking, profile, push notifications.

### Dealer

- Separate login with `role: "Dealer"`.
- Same catalog at lower wholesale prices.
- Bulk ordering and order history.
- Admin approval/rejection of dealer applications.

### Admin

- View and manage orders.
- Approve/reject dealers.
- Service desk.
- Live Vercel URL.

### Integrations assessed

- Firebase Authentication, Firestore, FCM.
- Razorpay test checkout.
- Maps/address integration using a free alternative.
- Email and SMS notifications.

### Automation

- One product per day, fully scheduled.
- AI-generated image, caption and hashtags.
- Public image hosting and Instagram publishing.
- Suggested tools are alternatives, not hard requirements: n8n/Make, Meta Graph API, Google Sheets, Groq/Gemini, Hugging Face and Cloudinary/ImgBB.
- Free service policies and regional availability must be checked before promising zero cost.

## Scoring and prioritization

| Area | Points |
| --- | ---: |
| Core customer/dealer/admin flows | 30 |
| UI quality and matching realistic images | 15 |
| Code structure and architecture | 10 |
| Firebase integration | 8 |
| Razorpay test checkout | 5 |
| Map/address integration | 4 |
| Email and SMS | 3 |
| Scheduled daily automation | 10 |
| AI-generated post image | 8 |
| AI caption and hashtags | 7 |

Optional: WhatsApp Status via WAHA (+10); animations, image zoom, referral system and dark mode (+5).

## Submission

The document requests submission through the official Round 1 form (also in the invitation email). Any submitted Google Drive links must be publicly viewable by link. AI coding tools are allowed. These are assignment requirements, not authorization to submit forms, publish social posts or change sharing permissions on the user's behalf.

## Implementation direction

- React Native + Expo for Android, with web preview for quick review.
- React + Vite admin panel, suitable for Vercel static deployment.
- Shared TypeScript catalog, validation and price calculations.
- Firebase Auth and Firestore; server-trusted order pricing and payment verification.
- Explicit local demo mode for review before credentials are configured.
- Native builds and account-backed integrations must be tested before submission; a browser preview is not an Android APK.
