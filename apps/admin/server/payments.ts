import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { CommerceOrder } from '@califnco/core';
import { CommerceError, createOrderService } from './orders';
import { validSignature, type GatewayPayment, type PaymentGateway } from './razorpay';

const orderPattern = /^CF-[a-f0-9]{28}$/;
const paymentPattern = /^pay_[A-Za-z0-9]{1,80}$/;
export function createPaymentService(db: Firestore, gateway: PaymentGateway, clock = () => new Date()) {
  const orders = createOrderService(db, clock);
  async function owned(orderId: unknown, uid: string, admin = false) {
    if (typeof orderId !== 'string' || !orderPattern.test(orderId)) throw new CommerceError(400, 'Choose a valid order.');
    const snapshot = await db.doc(`orders/${orderId}`).get();
    if (!snapshot.exists) throw new CommerceError(404, 'Order not found.');
    const order = snapshot.data() as CommerceOrder;
    if (order.userId !== uid && !admin) throw new CommerceError(403, 'You cannot access this order.');
    return order;
  }
  async function prepare(orderId: unknown, uid: string) {
    const initial = await owned(orderId, uid);
    const ref = db.doc(`orders/${initial.id}`);
    const lease = randomUUID();
    const current = await db.runTransaction(async transaction => {
      const [snapshot, account] = await transaction.getAll(ref, db.doc(`users/${uid}`));
      const order = snapshot.data() as CommerceOrder;
      if (order.userId !== uid || account.data()?.approval !== 'approved') throw new CommerceError(403, 'Your account must be approved before payment.');
      if (order.paymentState !== 'pending' || !order.inventoryHeld || order.expiresAt <= clock().toISOString()) throw new CommerceError(409, 'This order is no longer available for payment. Start a new checkout.');
      if (order.razorpayOrderId) return order;
      if (order.paymentLeaseUntil && order.paymentLeaseUntil > clock().toISOString()) throw new CommerceError(409, 'Payment setup is in progress. Please retry in a moment.');
      transaction.update(ref, { paymentLease: lease, paymentLeaseUntil: new Date(clock().getTime() + 120000).toISOString() });
      return order;
    });
    let gatewayOrderId = current.razorpayOrderId;
    if (!gatewayOrderId) {
      // A timed-out provider create is never exposed to a client. The lease prevents
      // concurrent setup; after it expires, a new provider order can be attached.
      const created = await gateway.createOrder(current.total * 100, current.id);
      if (!/^order_[A-Za-z0-9]+$/.test(created.id) || created.amount !== current.total * 100 || created.currency !== 'INR' || created.receipt !== current.id) throw new CommerceError(503, 'Payment setup could not be validated. Try again shortly.');
      gatewayOrderId = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref); const order = snapshot.data() as CommerceOrder;
        if (order.paymentLease !== lease || order.paymentState !== 'pending' || order.expiresAt <= clock().toISOString()) throw new CommerceError(409, 'Checkout changed. Open your order history and retry.');
        transaction.update(ref, { razorpayOrderId: created.id });
        transaction.create(db.doc(`gatewayOrders/${created.id}`), { orderId: current.id, keyId: gateway.keyId });
        return created.id;
      });
    }
    const mapping = await db.doc(`gatewayOrders/${gatewayOrderId}`).get();
    if (mapping.data()?.keyId !== gateway.keyId) throw new CommerceError(409, 'Payment settings changed. Contact support for this order.');
    return { key: gateway.keyId, order_id: gatewayOrderId, amount: current.total * 100, currency: 'INR' as const, name: 'Califnco', description: `Test order ${current.id}`, prefill: { name: current.customer, contact: current.phone } };
  }
  async function runRefund(paymentId: string) {
    const ref = db.doc(`refundJobs/${paymentId}`); const job = (await ref.get()).data();
    if (!job || job.status === 'processed') return;
    const refund = job.refundId ? await gateway.fetchRefund(job.refundId) : await gateway.refund(paymentId, job.amount);
    if (refund.payment_id !== paymentId || refund.amount !== job.amount || !['pending', 'processed', 'failed'].includes(refund.status)) throw new CommerceError(503, 'Refund verification is pending. Please retry later.');
    await db.runTransaction(async transaction => {
      const orderRef = db.doc(`orders/${job.orderId}`); const order = (await transaction.get(orderRef)).data() as CommerceOrder;
      transaction.update(ref, { refundId: refund.id, status: refund.status, updatedAt: clock().toISOString() });
      if (order.paymentId === paymentId && order.paymentState === 'refund_pending' && refund.status === 'processed') transaction.update(orderRef, { paymentState: 'refunded', status: 'Refunded', updatedAt: clock().toISOString() });
    });
    if (refund.status === 'failed') throw new CommerceError(503, 'Refund needs support review. Your order will not be fulfilled.');
  }
  async function processPayment(payment: GatewayPayment) {
    if (!paymentPattern.test(payment.id) || !/^order_[A-Za-z0-9]+$/.test(payment.order_id)) throw new CommerceError(400, 'Invalid payment.');
    const mapping = (await db.doc(`gatewayOrders/${payment.order_id}`).get()).data();
    if (!mapping || mapping.keyId !== gateway.keyId) throw new CommerceError(404, 'Payment order not found.');
    const order = (await db.doc(`orders/${mapping.orderId}`).get()).data() as CommerceOrder;
    if (!order || payment.order_id !== order.razorpayOrderId || payment.amount !== order.total * 100 || payment.currency !== 'INR') throw new CommerceError(409, 'Payment amount or currency does not match the order.');
    if (payment.status === 'authorized') {
      try { payment = await gateway.capture(payment.id, payment.amount); }
      catch { payment = await gateway.payment(payment.id); }
      // Re-fetch to verify provider state, even when capture raced with auto-capture.
      payment = await gateway.payment(payment.id);
    }
    if (payment.order_id !== order.razorpayOrderId || payment.amount !== order.total * 100 || payment.currency !== 'INR') throw new CommerceError(409, 'Captured payment does not match the order.');
    if (payment.status === 'captured' || payment.status === 'refunded') {
      // An external refund on an unconfirmed payment cannot produce fulfillment.
      if (payment.amount_refunded > 0 && !order.paymentId) throw new CommerceError(409, 'This payment has already been refunded. Contact support.');
      await orders.settlePayment(order.id, payment.order_id, payment.id, payment.amount);
      await runRefund(payment.id);
    }
    return (await db.doc(`orders/${order.id}`).get()).data() as CommerceOrder;
  }
  async function verify(uid: string, input: Record<string, unknown>) {
    const order = await owned(input.orderId, uid);
    if (!paymentPattern.test(String(input.razorpay_payment_id)) || input.razorpay_order_id !== order.razorpayOrderId || !validSignature(`${order.razorpayOrderId}|${input.razorpay_payment_id}`, input.razorpay_signature, gateway.secret)) throw new CommerceError(400, 'Payment signature could not be verified. Check your order history.');
    const payment = await gateway.payment(String(input.razorpay_payment_id));
    if (payment.order_id !== order.razorpayOrderId) throw new CommerceError(409, 'Payment belongs to a different order.');
    return processPayment(payment);
  }
  async function reconcile(orderId: unknown, uid: string, admin = false) {
    const order = await owned(orderId, uid, admin);
    if (order.razorpayOrderId) {
      const payments = await gateway.payments(order.razorpayOrderId);
      for (const payment of payments) {
        if (payment.order_id !== order.razorpayOrderId) throw new CommerceError(409, 'Payment belongs to a different order.');
        if (['authorized', 'captured', 'refunded'].includes(payment.status)) await processPayment(await gateway.payment(payment.id));
      }
    }
    await orders.expireReservations();
    return owned(order.id, uid, admin);
  }
  return { prepare, verify, reconcile, processPayment, runRefund };
}
