import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createOrderService } from './orders';
import handler from './commerce-handler';
import { createServer, type Server } from 'node:http';
import { initializeApp as clientApp, deleteApp as deleteClientApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { createHmac } from 'node:crypto';
import { createPaymentService } from './payments';
import { razorpayGateway, validSignature, type GatewayPayment, type GatewayRefund, type PaymentGateway } from './razorpay';
import webhook from './razorpay-webhook';

const app = initializeApp({ projectId: 'demo-califnco' }, 'order-tests');
let db: Firestore;
let time = new Date('2026-10-24T10:00:00.000Z');
let httpServer: Server;
let apiUrl: string;
const input = (quantity = 1, key = 'checkout-key-000001') => ({ items: [{ productId: 'QA-100', quantity }], address: '12 Main Road, Delhi 110001', phone: '9876543210', idempotencyKey: key, total: 1, role: 'Dealer' });
before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Order tests require local Firebase emulators.');
  db = getFirestore(app);
});
beforeEach(async () => {
  await db.recursiveDelete(db.collection('orders')); await db.recursiveDelete(db.collection('reservations')); await db.recursiveDelete(db.collection('checkoutLimits'));
  for (const collection of ['gatewayOrders', 'paymentReceipts', 'refundJobs']) await db.recursiveDelete(db.collection(collection));
  time = new Date('2026-10-24T10:00:00.000Z');
  await db.doc('users/alice').set({ name: 'QA Customer', role: 'Customer', approval: 'approved' });
  await db.doc('users/dealer').set({ name: 'QA Dealer', role: 'Dealer', approval: 'pending' });
  await db.doc('products/QA-100').set({ id: 'QA-100', name: 'QA purifier', active: true, retail: 1000, stock: 3, minBulk: 2, revision: 1 });
  await db.doc('dealerPrices/QA-100').set({ wholesale: 750, revision: 1 });
});
after(async () => {
  await db?.terminate(); await deleteApp(app);
  for (const instance of getApps().filter(candidate => candidate.name === 'commerce-server')) { await getFirestore(instance).terminate(); await deleteApp(instance); }
});

test('server calculates prices, reserves stock once and rejects idempotency reuse for a different cart', async () => {
  const service = createOrderService(db, () => time);
  const first = await service.create('alice', input());
  assert.equal(first.total, 1000); assert.equal(first.role, 'Customer'); assert.equal(first.paymentState, 'pending');
  assert.equal((await db.doc('products/QA-100').get()).data()?.stock, 2);
  const again = await service.create('alice', input());
  assert.equal(again.id, first.id); assert.equal((await db.doc('products/QA-100').get()).data()?.stock, 2);
  await assert.rejects(service.create('alice', input(2)), /already used/);
  await assert.rejects(service.updateStatus(first.id, 'Shipped'), /paid order/);
});

test('concurrent orders cannot oversell and dealer approval and bulk quantities are enforced', async () => {
  const service = createOrderService(db, () => time);
  await assert.rejects(service.create('dealer', input(2)), /approved/);
  await db.doc('users/dealer').update({ approval: 'approved' });
  await assert.rejects(service.create('dealer', input(1)), /Minimum/);
  const results = await Promise.allSettled([service.create('dealer', input(2)), service.create('alice', input(2))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await db.doc('products/QA-100').get()).data()?.stock, 1);
});

test('cancel and expiration restore inventory once; other users cannot cancel an order', async () => {
  const service = createOrderService(db, () => time);
  const order = await service.create('alice', input());
  await assert.rejects(service.cancel(order.id, { uid: 'someone-else', admin: false }), /cannot change/);
  await service.cancel(order.id, { uid: 'alice', admin: false });
  await service.cancel(order.id, { uid: 'alice', admin: false });
  assert.equal((await db.doc('products/QA-100').get()).data()?.stock, 3);
  const pending = await service.create('alice', input(2, 'checkout-key-000002'));
  time = new Date(time.getTime() + 16 * 60000);
  assert.equal(await service.expireReservations(), 1);
  assert.equal(await service.expireReservations(), 0);
  assert.equal((await db.doc('orders/' + pending.id).get()).data()?.paymentState, 'expired');
  assert.equal((await db.doc('products/QA-100').get()).data()?.stock, 3);
  assert.equal((await db.doc('checkoutLimits/alice').get()).data()?.pending, 0);
});

test('invalid carts, hidden products and excessive pending reservations are rejected', async () => {
  const service = createOrderService(db, () => time);
  for (const quantity of [0, -1, 1.5, 1000001]) await assert.rejects(service.create('alice', input(quantity)));
  await assert.rejects(service.create('alice', { ...input(), items: [...input().items, ...input().items] }), /quantities/);
  await db.doc('products/QA-100').update({ active: false });
  await assert.rejects(service.create('alice', input()), /unavailable/);
  await db.doc('products/QA-100').update({ active: true });
  await db.doc('checkoutLimits/alice').set({ pending: 3 });
  await assert.rejects(service.create('alice', input()), /three unpaid/);
});

test('HTTP API verifies Firebase tokens and admin access, rejects untrusted origins and ignores forged totals', async () => {
  const client = clientApp({ apiKey: 'fake-api-key', projectId: 'demo-califnco' }, 'api-client-test');
  const auth = getAuth(client);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, `api-${Date.now()}@example.test`, 'Synthetic-local-test-123');
  const token = await credential.user.getIdToken();
  await db.doc(`users/${credential.user.uid}`).set({ name: 'API QA', role: 'Customer', approval: 'approved' });
  httpServer = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as { port: number };
  apiUrl = `http://127.0.0.1:${address.port}/api/commerce`;
  const send = (body: unknown, bearer = token, origin = 'http://localhost:8081') => fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, Origin: origin }, body: JSON.stringify(body) });
  try {
    assert.equal((await send({ action: 'create', ...input() }, 'invalid')).status, 401);
    assert.equal((await send({ action: 'create', ...input() }, token, 'https://untrusted.example')).status, 403);
    const response = await send({ action: 'create', ...input() });
    assert.equal(response.status, 200);
    const { order } = await response.json() as { order: { id: string; total: number; userId: string } };
    assert.equal(order.total, 1000); assert.equal(order.userId, credential.user.uid);
    assert.equal((await send({ action: 'status', orderId: order.id, status: 'Delivered' })).status, 403);
    assert.equal((await send({ action: 'payment-ready' })).status, 503);
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
    await deleteClientApp(client);
  }
});

function fakeGateway() {
  let creates = 0; let refunds = 0; let captures = 0;
  const payments = new Map<string, GatewayPayment>();
  const refundRecords = new Map<string, GatewayRefund>();
  const gateway: PaymentGateway = {
    keyId: 'rzp_test_synthetic', secret: 'synthetic-test-secret-only',
    async createOrder(amount, receipt) { creates++; return { id: `order_QA${creates}`, amount, currency: 'INR', receipt }; },
    async payment(id) { return { ...payments.get(id)! }; },
    async payments(id) { return [...payments.values()].filter(payment => payment.order_id === id).map(payment => ({ ...payment })); },
    async capture(id) { captures++; const payment = payments.get(id)!; payment.status = 'captured'; return { ...payment }; },
    async refund(id, amount) {
      if (!refundRecords.has(id)) { refunds++; refundRecords.set(id, { id: `rfnd_${id}`, payment_id: id, amount, status: 'processed' }); }
      return refundRecords.get(id)!;
    },
    async fetchRefund(id) { return [...refundRecords.values()].find(refund => refund.id === id)!; },
  };
  const result = (orderId: string, paymentId: string) => ({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: createHmac('sha256', gateway.secret).update(`${orderId}|${paymentId}`).digest('hex') });
  return { gateway, payments, result, stats: () => ({ creates, refunds, captures }) };
}

test('payment preparation is owner-only, rejects pending dealers, and reuses one provider order', async () => {
  const fake = fakeGateway(); const service = createPaymentService(db, fake.gateway, () => time);
  const order = await createOrderService(db, () => time).create('alice', input());
  await assert.rejects(service.prepare(order.id, 'dealer'), /cannot access/);
  const concurrent = await Promise.allSettled([service.prepare(order.id, 'alice'), service.prepare(order.id, 'alice')]);
  assert.ok(concurrent.some(result => result.status === 'fulfilled'));
  assert.equal(fake.stats().creates, 1);
  const checkout = await service.prepare(order.id, 'alice');
  assert.equal(checkout.amount, 100000); assert.equal(checkout.order_id, 'order_QA1');
  await db.doc('users/alice').update({ approval: 'pending' });
  await assert.rejects(service.prepare(order.id, 'alice'), /approved/);
});

test('signed callbacks still require matching captured amount/currency; valid capture is idempotent', async () => {
  const fake = fakeGateway(); const service = createPaymentService(db, fake.gateway, () => time);
  const orders = createOrderService(db, () => time);
  const order = await orders.create('alice', input());
  const checkout = await service.prepare(order.id, 'alice');
  const payment: GatewayPayment = { id: 'pay_QA1', order_id: checkout.order_id, amount: checkout.amount, currency: 'INR', status: 'authorized', amount_refunded: 0 };
  fake.payments.set(payment.id, payment);
  const callback = { orderId: order.id, ...fake.result(checkout.order_id, payment.id) };
  await assert.rejects(service.verify('alice', { ...callback, razorpay_signature: '0'.repeat(64) }), /signature/);
  await assert.rejects(service.verify('dealer', callback), /cannot access/);
  payment.amount = 1;
  await assert.rejects(service.verify('alice', callback), /amount or currency/);
  payment.amount = checkout.amount; payment.currency = 'USD';
  await assert.rejects(service.verify('alice', callback), /amount or currency/);
  payment.currency = 'INR';
  const paid = await service.verify('alice', callback);
  assert.equal(paid.paymentState, 'paid'); assert.equal(paid.status, 'Confirmed');
  await Promise.all([service.verify('alice', callback), service.reconcile(order.id, 'alice')]);
  assert.equal(fake.stats().captures, 1); assert.equal(fake.stats().refunds, 0);
  assert.equal((await db.doc('checkoutLimits/alice').get()).data()?.pending, 0);
  assert.equal((await db.doc('products/QA-100').get()).data()?.stock, 2);
  await orders.updateStatus(order.id, 'Processing');
  await assert.rejects(orders.cancel(order.id, { uid: 'alice', admin: false }), /paid order/);
});

test('late payment after expiry is refunded once and never creates fulfillment or double releases stock', async () => {
  const fake = fakeGateway(); const service = createPaymentService(db, fake.gateway, () => time);
  const orders = createOrderService(db, () => time);
  const order = await orders.create('alice', input()); const checkout = await service.prepare(order.id, 'alice');
  fake.payments.set('pay_LATE', { id: 'pay_LATE', order_id: checkout.order_id, amount: checkout.amount, currency: 'INR', status: 'captured', amount_refunded: 0 });
  time = new Date(time.getTime() + 16 * 60000);
  await orders.expireReservations();
  const refunded = await service.verify('alice', { orderId: order.id, ...fake.result(checkout.order_id, 'pay_LATE') });
  assert.equal(refunded.paymentState, 'refunded');
  await service.reconcile(order.id, 'alice');
  assert.equal(fake.stats().refunds, 1);
  assert.equal((await db.doc('products/QA-100').get()).data()?.stock, 3);
  assert.equal((await db.doc('checkoutLimits/alice').get()).data()?.pending, 0);
  await assert.rejects(orders.updateStatus(order.id, 'Processing'), /paid order/);
});

test('cancel/capture race is atomic; a second captured payment is refunded without changing a paid order', async () => {
  const fake = fakeGateway(); const service = createPaymentService(db, fake.gateway, () => time); const orders = createOrderService(db, () => time);
  const order = await orders.create('alice', input()); const checkout = await service.prepare(order.id, 'alice');
  for (const id of ['pay_FIRST', 'pay_SECOND']) fake.payments.set(id, { id, order_id: checkout.order_id, amount: checkout.amount, currency: 'INR', status: 'captured', amount_refunded: 0 });
  await service.verify('alice', { orderId: order.id, ...fake.result(checkout.order_id, 'pay_FIRST') });
  await Promise.all([service.processPayment(fake.payments.get('pay_SECOND')!), service.processPayment(fake.payments.get('pay_SECOND')!)]);
  assert.equal(fake.stats().refunds, 1);
  assert.equal((await db.doc(`orders/${order.id}`).get()).data()?.paymentId, 'pay_FIRST');
  assert.equal((await db.doc(`orders/${order.id}`).get()).data()?.paymentState, 'paid');
  const other = await orders.create('alice', input(1, 'checkout-key-race-0001')); const second = await service.prepare(other.id, 'alice');
  fake.payments.set('pay_RACE', { id: 'pay_RACE', order_id: second.order_id, amount: second.amount, currency: 'INR', status: 'captured', amount_refunded: 0 });
  await Promise.allSettled([orders.cancel(other.id, { uid: 'alice', admin: false }), service.verify('alice', { orderId: other.id, ...fake.result(second.order_id, 'pay_RACE') })]);
  await service.reconcile(other.id, 'alice');
  const final = (await db.doc(`orders/${other.id}`).get()).data()!;
  assert.ok(['paid', 'refunded'].includes(final.paymentState));
  assert.equal((await db.doc('products/QA-100').get()).data()?.stock, final.paymentState === 'paid' ? 1 : 2);
});

test('Razorpay adapter refuses live keys and signs raw webhooks without parsing or trusting event IDs', async () => {
  const previous = { key: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET, webhook: process.env.RAZORPAY_WEBHOOK_SECRET };
  process.env.RAZORPAY_KEY_ID = 'rzp_live_disallowed'; process.env.RAZORPAY_KEY_SECRET = 'synthetic-secret';
  assert.throws(() => razorpayGateway(), /Test payments/);
  const secret = 'synthetic-webhook-secret-at-least-20'; process.env.RAZORPAY_WEBHOOK_SECRET = secret;
  const raw = '{ "event": "unrelated.event", "payload": {} }';
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(validSignature(raw, signature, secret), true);
  assert.equal(validSignature(raw + ' ', signature, secret), false);
  const server = createServer((request, response) => { void webhook(request, response); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal((await fetch(url, { method: 'POST', body: raw, headers: { 'x-razorpay-signature': signature } })).status, 200);
    assert.equal((await fetch(url, { method: 'POST', body: raw + ' ', headers: { 'x-razorpay-signature': signature } })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', body: raw })).status, 400);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const [key, value] of Object.entries({ RAZORPAY_KEY_ID: previous.key, RAZORPAY_KEY_SECRET: previous.secret, RAZORPAY_WEBHOOK_SECRET: previous.webhook })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('provider adapter recovers receipt lookups and uses stable refund idempotency headers', async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.RAZORPAY_KEY_ID; const previousSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_synthetic'; process.env.RAZORPAY_KEY_SECRET = 'synthetic-secret-only';
  const requests: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify(String(url).includes('orders?') ? { items: [{ id: 'order_RECOVERED', receipt: 'CF-receipt', amount: 12300, currency: 'INR' }] } : { id: 'rfnd_QA', payment_id: 'pay_QA', amount: 12300, status: 'processed' }), { status: 200 });
  };
  try {
    const gateway = razorpayGateway();
    assert.equal((await gateway.createOrder(12300, 'CF-receipt')).id, 'order_RECOVERED');
    assert.equal(requests.length, 1); assert.match(requests[0].url, /receipt=CF-receipt/);
    await gateway.refund('pay_QA', 12300); await gateway.refund('pay_QA', 12300);
    assert.equal((requests[1].options?.headers as Record<string, string>)['X-Refund-Idempotency'], 'califnco-refund-pay_QA');
    assert.deepEqual(requests[1], requests[2]);
    assert.equal(requests[1].options?.body, JSON.stringify({ amount: 12300, speed: 'normal' }));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = previousKey;
    if (previousSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = previousSecret;
  }
});
