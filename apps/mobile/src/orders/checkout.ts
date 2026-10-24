import type { CheckoutOptions, PaymentResult } from './payment-types';

type RazorpayInstance = { open(): void; on(event: string, callback: () => void): void };
declare global {
  interface Window { Razorpay?: new (options: CheckoutOptions & { handler: (result: PaymentResult) => void; modal: { ondismiss: () => void }; theme: { color: string } }) => RazorpayInstance }
}
let script: Promise<void> | undefined;
export function ensureCheckoutSupported() {
  if (typeof window === 'undefined') throw new Error('Open checkout in a browser.');
}
async function loadCheckout() {
  ensureCheckoutSupported();
  if (window.Razorpay) return;
  if (!script) script = new Promise<void>((resolve, reject) => {
    const element = document.createElement('script');
    element.src = 'https://checkout.razorpay.com/v1/checkout.js'; element.async = true;
    const timer = setTimeout(() => { element.remove(); reject(new Error('Payment checkout did not load. Please retry.')); }, 15000);
    element.onload = () => { clearTimeout(timer); if (window.Razorpay) resolve(); else reject(new Error('Payment checkout is unavailable.')); };
    element.onerror = () => { clearTimeout(timer); element.remove(); reject(new Error('Payment checkout did not load. Check your connection.')); };
    document.head.appendChild(element);
  }).catch(error => { script = undefined; throw error; });
  return script;
}
export async function openCheckout(options: CheckoutOptions): Promise<PaymentResult> {
  await loadCheckout();
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay!({ ...options, theme: { color: '#176f64' }, handler: resolve, modal: { ondismiss: () => reject(new Error('Checkout closed. Check payment status in Orders before trying again.')) } });
    // Razorpay keeps failed attempts inside Checkout so the shopper can retry.
    checkout.open();
  });
}
