import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase';
import { commerce } from './commerce';
import { ensureCheckoutSupported, openCheckout } from './checkout';
import type { CheckoutOptions, PaymentResult } from './payment-types';

export async function payOrder(orderId: string) {
  ensureCheckoutSupported();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before paying.');
  const savedKey = `califnco-payment:${uid}:${orderId}`;
  const saved = await AsyncStorage.getItem(savedKey);
  if (saved) {
    const verified = await commerce({ action: 'payment-verify', orderId, ...JSON.parse(saved) });
    await AsyncStorage.removeItem(savedKey);
    return verified.order;
  }
  const { checkout } = await commerce<{ checkout: CheckoutOptions }>({ action: 'payment-prepare', orderId });
  const result: PaymentResult = await openCheckout(checkout);
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed. Check payment status after signing in again.');
  // Webhooks can complete the order if this storage write or network call fails.
  await AsyncStorage.setItem(savedKey, JSON.stringify(result));
  const verified = await commerce({ action: 'payment-verify', orderId, ...result });
  await AsyncStorage.removeItem(savedKey);
  return verified.order;
}

export async function refreshPayment(orderId: string) {
  return (await commerce({ action: 'payment-refresh', orderId })).order;
}
