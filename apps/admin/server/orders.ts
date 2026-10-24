import { createHash } from 'node:crypto';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { validateAddress, type CartItem, type CommerceOrder, type Product } from '@califnco/core';

export class CommerceError extends Error { constructor(public status: number, message: string) { super(message); } }
type Checkout = { items: CartItem[]; address: string; phone: string; idempotencyKey: string };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function checkoutInput(value: unknown): Checkout {
  const input = value as Partial<Checkout> | null;
  if (!input || !Array.isArray(input.items) || !input.items.length || input.items.length > 20) throw new CommerceError(400, 'Choose between 1 and 20 different products.');
  if (typeof input.address !== 'string' || input.address.length > 500 || typeof input.phone !== 'string') throw new CommerceError(400, 'Enter your delivery details.');
  try { validateAddress(input.address, input.phone); } catch (error) { throw new CommerceError(400, (error as Error).message); }
  if (typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)) throw new CommerceError(400, 'Restart checkout and try again.');
  const seen = new Set<string>();
  const items = input.items.map(item => {
    if (!item || typeof item.productId !== 'string' || !/^[A-Za-z0-9_-]{2,60}$/.test(item.productId) || seen.has(item.productId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000000) throw new CommerceError(400, 'Check the products and quantities in your cart.');
    seen.add(item.productId); return { productId: item.productId, quantity: item.quantity };
  }).sort((a, b) => a.productId.localeCompare(b.productId));
  return { items, address: input.address.trim(), phone: input.phone.trim(), idempotencyKey: input.idempotencyKey };
}

export function createOrderService(db: Firestore, clock = () => new Date()) {
  async function changeStock(transaction: Transaction, items: CommerceOrder['items'], direction: 1 | -1) {
    const snapshots = await transaction.getAll(...items.flatMap(item => [db.doc(`products/${item.productId}`), db.doc(`dealerPrices/${item.productId}`)]));
    // Read all documents before issuing any writes.
    for (let index = 0; index < items.length; index++) {
      const product = snapshots[index * 2]; const price = snapshots[index * 2 + 1];
      if (!product.exists || !price.exists) throw new CommerceError(409, 'Inventory needs attention. Contact support.');
      const current = product.data()!;
      const stock = current.stock + direction * items[index].quantity;
      if (!Number.isSafeInteger(stock) || stock < 0) throw new CommerceError(409, 'Stock changed. Refresh your cart and try again.');
      const revision = current.revision + 1;
      transaction.update(product.ref, { stock, revision, updatedAt: FieldValue.serverTimestamp() });
      transaction.update(price.ref, { revision, updatedAt: FieldValue.serverTimestamp() });
    }
  }

  async function release(orderId: string, actor: { uid: string; admin: boolean } | null, expiredOnly = false) {
    if (!/^CF-[a-f0-9]{28}$/.test(orderId)) throw new CommerceError(400, 'Invalid order.');
    return db.runTransaction(async transaction => {
      const ref = db.doc(`orders/${orderId}`); const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new CommerceError(404, 'Order not found.');
      const order = snapshot.data() as CommerceOrder;
      if (actor && !actor.admin && actor.uid !== order.userId) throw new CommerceError(403, 'You cannot change this order.');
      const limitRef = db.doc(`checkoutLimits/${order.userId}`);
      const limit = await transaction.get(limitRef);
      if (!order.inventoryHeld || order.paymentState !== 'pending') {
        if (!actor || order.paymentState === 'cancelled' || order.paymentState === 'expired') return order;
        throw new CommerceError(409, 'A paid order cannot be cancelled here. Contact support.');
      }
      const now = clock().toISOString();
      if (expiredOnly && order.expiresAt > now) return order;
      await changeStock(transaction, order.items, 1);
      const paymentState = expiredOnly ? 'expired' : 'cancelled';
      const updated: CommerceOrder = { ...order, paymentState, status: expiredOnly ? 'Expired' : 'Cancelled', inventoryHeld: false, updatedAt: now };
      transaction.set(ref, updated);
      transaction.set(limitRef, { pending: Math.max(0, (limit.data()?.pending ?? 1) - 1) });
      transaction.delete(db.doc(`reservations/${orderId}`));
      return updated;
    });
  }

  async function expireReservations() {
    const expired = await db.collection('reservations').where('expiresAt', '<=', clock().toISOString()).limit(100).get();
    for (const reservation of expired.docs) await release(reservation.id, null, true);
    return expired.size;
  }

  async function create(uid: string, raw: unknown) {
    const input = checkoutInput(raw);
    await expireReservations();
    const orderId = `CF-${hash(`${uid}:${input.idempotencyKey}`).slice(0, 28)}`;
    const fingerprint = hash(JSON.stringify({ items: input.items, address: input.address, phone: input.phone }));
    return db.runTransaction(async transaction => {
      const ref = db.doc(`orders/${orderId}`);
      const [existing, account, limits] = await transaction.getAll(ref, db.doc(`users/${uid}`), db.doc(`checkoutLimits/${uid}`));
      if (existing.exists) {
        if (existing.data()!.fingerprint !== fingerprint) throw new CommerceError(409, 'This checkout was already used for another cart. Start a new checkout.');
        return existing.data() as CommerceOrder;
      }
      const profile = account.data();
      if (!profile || !['Customer', 'Dealer'].includes(profile.role)) throw new CommerceError(403, 'Complete your account profile before ordering.');
      if (profile.approval !== 'approved') throw new CommerceError(403, 'Your dealer account must be approved before ordering.');
      if ((limits.data()?.pending ?? 0) >= 3) throw new CommerceError(409, 'You already have three unpaid orders. Complete or cancel one before ordering again.');
      const snapshots = await transaction.getAll(...input.items.flatMap(item => [db.doc(`products/${item.productId}`), db.doc(`dealerPrices/${item.productId}`)]));
      const items = input.items.map((item, index) => {
        const product = snapshots[index * 2].data() as Product & { active: boolean; revision: number } | undefined;
        const prices = snapshots[index * 2 + 1].data();
        if (!product?.active || !prices || prices.revision !== product.revision) throw new CommerceError(409, 'A product is unavailable. Refresh your cart.');
        if (item.quantity > product.stock) throw new CommerceError(409, `Only ${product.stock} units of ${product.name} are available.`);
        if (profile.role === 'Dealer' && item.quantity < product.minBulk) throw new CommerceError(400, `Minimum wholesale quantity for ${product.name}: ${product.minBulk}.`);
        const unitPrice = profile.role === 'Dealer' ? prices.wholesale : product.retail;
        if (!Number.isSafeInteger(unitPrice) || unitPrice < 1) throw new CommerceError(409, 'Product pricing is unavailable. Contact support.');
        return { ...item, name: product.name, unitPrice };
      });
      const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      if (!Number.isSafeInteger(total) || total < 1 || total > 1000000) throw new CommerceError(400, 'This order exceeds the supported checkout amount. Contact support for a bulk quote.');
      const now = clock();
      const order: CommerceOrder = { id: orderId, userId: uid, customer: profile.name, role: profile.role, items, total, address: input.address, phone: input.phone, status: 'Awaiting payment', paymentState: 'pending', paymentMode: 'test', createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 15 * 60000).toISOString(), inventoryHeld: true, fingerprint };
      // The inventory documents were read above, so all changes commit together.
      snapshots.forEach((snapshot, index) => {
        const item = items[Math.floor(index / 2)]; const current = snapshot.data()!;
        const revision = snapshots[Math.floor(index / 2) * 2].data()!.revision + 1;
        transaction.update(snapshot.ref, index % 2 ? { revision, updatedAt: FieldValue.serverTimestamp() } : { stock: current.stock - item.quantity, revision, updatedAt: FieldValue.serverTimestamp() });
      });
      transaction.create(ref, order);
      transaction.set(db.doc(`checkoutLimits/${uid}`), { pending: (limits.data()?.pending ?? 0) + 1 });
      transaction.create(db.doc(`reservations/${orderId}`), { expiresAt: order.expiresAt });
      return order;
    });
  }

  async function updateStatus(orderId: string, status: string) {
    if (!/^CF-[a-f0-9]{28}$/.test(orderId)) throw new CommerceError(400, 'Invalid order.');
    return db.runTransaction(async transaction => {
      const ref = db.doc(`orders/${orderId}`); const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new CommerceError(404, 'Order not found.');
      const order = snapshot.data() as CommerceOrder;
      const transitions: Record<string, string> = { Confirmed: 'Processing', Processing: 'Shipped', Shipped: 'Delivered' };
      if (order.paymentState !== 'paid' || transitions[order.status] !== status) throw new CommerceError(409, 'Only a paid order can advance to its next delivery status.');
      transaction.update(ref, { status, updatedAt: clock().toISOString() });
      return { ...order, status };
    });
  }
  return { create, cancel: (orderId: string, actor: { uid: string; admin: boolean }) => release(orderId, actor), expireReservations, updateStatus };
}
