import { createHmac, timingSafeEqual } from 'node:crypto';
import { CommerceError } from './orders';

export type GatewayOrder = { id: string; amount: number; currency: string; receipt: string };
export type GatewayPayment = { id: string; order_id: string; amount: number; currency: string; status: string; amount_refunded: number };
export type GatewayRefund = { id: string; payment_id: string; amount: number; status: string };
export interface PaymentGateway {
  keyId: string;
  secret: string;
  createOrder(amount: number, receipt: string): Promise<GatewayOrder>;
  payment(id: string): Promise<GatewayPayment>;
  payments(orderId: string): Promise<GatewayPayment[]>;
  capture(id: string, amount: number): Promise<GatewayPayment>;
  refund(id: string, amount: number): Promise<GatewayRefund>;
  fetchRefund(id: string): Promise<GatewayRefund>;
}
export function validSignature(message: string | Buffer, signature: unknown, secret: string) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, 'hex'), createHmac('sha256', secret).update(message).digest());
}
export function razorpayGateway(): PaymentGateway {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!/^rzp_test_[A-Za-z0-9]+$/.test(keyId) || secret.length < 10) throw new CommerceError(503, 'Test payments are being configured. Please try again later.');
  async function request<T>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://api.razorpay.com/v1/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(12000),
      });
    } catch { throw new CommerceError(503, 'Payment provider did not respond. Check your order before retrying.'); }
    if (!response.ok) throw new CommerceError(503, 'Payment provider is unavailable. Check your order and retry shortly.');
    return response.json() as Promise<T>;
  }
  return {
    keyId, secret,
    createOrder: async (amount, receipt) => {
      // Receipt is unique at Razorpay. Recover an earlier successful create whose
      // response was lost before it could be attached to the local order.
      const existing = await request<{ items: GatewayOrder[] }>(`orders?receipt=${encodeURIComponent(receipt)}&count=100`);
      const match = existing.items.find(order => order.receipt === receipt);
      if (match) return match;
      return request('orders', { amount, currency: 'INR', receipt, notes: { califnco_order: receipt }, partial_payment: false });
    },
    payment: id => request(`payments/${id}`),
    payments: async orderId => (await request<{ items: GatewayPayment[] }>(`orders/${orderId}/payments`)).items,
    capture: (id, amount) => request(`payments/${id}/capture`, { amount, currency: 'INR' }),
    refund: (id, amount) => request(`payments/${id}/refund`, { amount, speed: 'normal' }, { 'X-Refund-Idempotency': `califnco-refund-${id}` }),
    fetchRefund: id => request(`refunds/${id}`),
  };
}
