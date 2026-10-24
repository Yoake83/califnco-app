// Keep the original request stream intact for webhook signature verification.
export const config = { api: { bodyParser: false } };
export { default } from '../server/razorpay-webhook-bundle.mjs';
