import { auth } from '../firebase';
import type { CommerceOrder } from '@califnco/core';

const commerceUrl = process.env.EXPO_PUBLIC_COMMERCE_API_URL || 'https://califnco-admin-orpin.vercel.app/api/commerce';
export const checkoutAvailable = !!commerceUrl;
export async function commerce<T = { order: CommerceOrder }>(input: unknown): Promise<T> {
  const url = commerceUrl;
  if (!url) throw new Error('Ordering is being set up. Please try again later.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before ordering.');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(25000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not update your order. Try again.');
  return result;
}
