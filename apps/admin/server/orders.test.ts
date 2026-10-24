import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createOrderService } from './orders';
import handler from '../api/commerce';
import { createServer, type Server } from 'node:http';
import { initializeApp as clientApp, deleteApp as deleteClientApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';

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
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
    await deleteClientApp(client);
  }
});
