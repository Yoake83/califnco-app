import Constants, { ExecutionEnvironment } from 'expo-constants';
import { TurboModuleRegistry } from 'react-native';
import type { CheckoutOptions, PaymentResult } from './payment-types';

export function ensureCheckoutSupported() {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient || !TurboModuleRegistry.get('RNRazorpayCheckout')) throw new Error('Razorpay needs the Califnco development build or APK. Use the web preview to test checkout meanwhile.');
}
export async function openCheckout(options: CheckoutOptions): Promise<PaymentResult> {
  ensureCheckoutSupported();
  const { default: Razorpay } = await import('react-native-razorpay');
  try { return await Razorpay.open({ ...options, theme: { color: '#176f64' } }); }
  catch { throw new Error('Checkout closed or payment failed. Check payment status in Orders before trying again.'); }
}
