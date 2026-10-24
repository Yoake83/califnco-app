import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { decideDealer, subscribeDealers } from '../../admin/src/dealer-service';
import { saveProduct, subscribeCatalog } from '../../../packages/core/src/catalog-store';
import { bookService, setServiceStatus } from '../../../packages/core/src/service-store';
import type { CatalogDraft, CatalogProduct } from '@califnco/core';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where, serverTimestamp, setDoc, updateDoc, deleteDoc, setLogLevel, Timestamp } from 'firebase/firestore';
setLogLevel('silent');

let env: RulesTestEnvironment;
const profile = (id = 'alice', role = 'Customer') => ({ id, name: 'Alice Sharma', email: `${id}@example.test`, role, approval: role === 'Dealer' ? 'pending' : 'approved', phone: role === 'Dealer' ? '9876543210' : '', address: role === 'Dealer' ? '12 Main Road, Delhi 110001' : '', businessName: role === 'Dealer' ? 'Pure Water Traders' : '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-califnco', firestore: { host: '127.0.0.1', port: 8180, rules: await readFile('firestore.rules', 'utf8') } });
});
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { await env?.cleanup(); });

test('customer creates and reads own profile; outsiders cannot read or list it', async () => {
  const alice = env.authenticatedContext('alice', { email: 'alice@example.test' }).firestore();
  const bob = env.authenticatedContext('bob', { email: 'bob@example.test' }).firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(alice, 'users/alice'), profile()));
  await assertSucceeds(getDoc(doc(alice, 'users/alice')));
  await assertFails(getDoc(doc(bob, 'users/alice')));
  await assertFails(getDoc(doc(anonymous, 'users/alice')));
  await assertFails(getDocs(collection(alice, 'users')));
  await assertFails(setDoc(doc(alice, 'users/bob'), profile('bob')));
});

test('dealer must register pending with valid business data and cannot self-approve', async () => {
  const dealer = env.authenticatedContext('dealer', { email: 'dealer@example.test' }).firestore();
  const ref = doc(dealer, 'users/dealer');
  await assertFails(setDoc(ref, { ...profile('dealer', 'Dealer'), approval: 'approved' }));
  await assertFails(setDoc(ref, { ...profile('dealer', 'Dealer'), businessName: '' }));
  await assertFails(setDoc(ref, { ...profile('dealer', 'Dealer'), phone: '123' }));
  await assertSucceeds(setDoc(ref, profile('dealer', 'Dealer')));
  await assertFails(updateDoc(ref, { approval: 'approved', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { role: 'Customer', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { name: 'Alice Dealer', updatedAt: serverTimestamp() }));
});

test('identity, timestamps and schema cannot be forged or escalated', async () => {
  const db = env.authenticatedContext('alice', { email: 'alice@example.test' }).firestore();
  const ref = doc(db, 'users/alice');
  for (const patch of [{ email: 'other@example.test' }, { id: 'bob' }, { role: 'Admin' }, { admin: true }, { password: 'must-never-be-stored' }, { createdAt: new Date(2000, 0, 1) }]) await assertFails(setDoc(ref, { ...profile(), ...patch }));
  await assertSucceeds(setDoc(ref, profile()));
  await assertFails(updateDoc(ref, { email: 'other@example.test', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { role: 'Dealer', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { approval: 'pending', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { admin: true, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(ref));
  await assertFails(setDoc(doc(db, 'orders/order-1'), { userId: 'alice', total: 1 }));
});

test('only a trusted admin claim can review and decide dealer applications', async () => {
  const dealer = env.authenticatedContext('dealer', { email: 'dealer@example.test' }).firestore();
  await assertSucceeds(setDoc(doc(dealer, 'users/dealer'), profile('dealer', 'Dealer')));
  const admin = env.authenticatedContext('admin-user', { admin: true }).firestore();
  await assertSucceeds(getDocs(collection(admin, 'users')));
  await assertSucceeds(updateDoc(doc(admin, 'users/dealer'), { approval: 'approved', updatedAt: serverTimestamp() }));
  assert.equal((await getDoc(doc(dealer, 'users/dealer'))).data()?.approval, 'approved');
  await assertFails(updateDoc(doc(admin, 'users/dealer'), { role: 'Customer', updatedAt: serverTimestamp() }));
});

test('live dealer service filters applications and rejects stale admin decisions', async () => {
  const dealer = env.authenticatedContext('dealer', { email: 'dealer@example.test' }).firestore();
  const customer = env.authenticatedContext('alice', { email: 'alice@example.test' }).firestore();
  await setDoc(doc(dealer, 'users/dealer'), profile('dealer', 'Dealer'));
  await setDoc(doc(customer, 'users/alice'), profile());
  const admin = env.authenticatedContext('admin-user', { admin: true }).firestore();
  const applications = await new Promise<import('@califnco/core').Profile[]>((resolve, reject) => {
    const unsubscribe = subscribeDealers(admin as never, records => { unsubscribe(); resolve(records); }, reject);
  });
  assert.deepEqual(applications.map(d => d.id), ['dealer']);
  await decideDealer(admin as never, 'dealer', 'pending', 'approved');
  assert.equal((await getDoc(doc(dealer, 'users/dealer'))).data()?.approval, 'approved');
  await assert.rejects(decideDealer(admin as never, 'dealer', 'pending', 'rejected'), /Another admin/);
  await decideDealer(admin as never, 'dealer', 'approved', 'rejected');
  assert.equal((await getDoc(doc(dealer, 'users/dealer'))).data()?.approval, 'rejected');
  await decideDealer(admin as never, 'dealer', 'rejected', 'pending');
  await assert.rejects(decideDealer(admin as never, 'alice', 'approved', 'pending'), /no longer available/);
});

test('admin service cannot bypass rules as a dealer or ordinary customer', async () => {
  const dealer = env.authenticatedContext('dealer', { email: 'dealer@example.test' }).firestore();
  const customer = env.authenticatedContext('alice', { email: 'alice@example.test' }).firestore();
  await setDoc(doc(dealer, 'users/dealer'), profile('dealer', 'Dealer'));
  await assert.rejects(decideDealer(dealer as never, 'dealer', 'pending', 'approved'));
  await assert.rejects(decideDealer(customer as never, 'dealer', 'pending', 'approved'));
  const admin = env.authenticatedContext('admin-user', { admin: true }).firestore();
  await assertFails(updateDoc(doc(admin, 'users/dealer'), { approval: 'approved', businessName: 'Changed by admin', updatedAt: serverTimestamp() }));
});

const catalogDraft: CatalogDraft = { id: 'QA-100', name: 'QA purifier', category: 'Purifiers', description: 'Synthetic emulator product', image: 'https://example.test/product.jpg', retail: 10000, wholesale: 7500, stock: 5, minBulk: 2, active: true };

test('catalog keeps wholesale prices private and hides inactive products from shop queries', async () => {
  const admin = env.authenticatedContext('admin-user', { admin: true }).firestore();
  const customer = env.authenticatedContext('alice', { email: 'alice@example.test' }).firestore();
  const dealer = env.authenticatedContext('dealer', { email: 'dealer@example.test' }).firestore();
  await setDoc(doc(customer, 'users/alice'), profile());
  await setDoc(doc(dealer, 'users/dealer'), profile('dealer', 'Dealer'));
  await saveProduct(admin as never, catalogDraft, null);
  const product = await assertSucceeds(getDoc(doc(customer, 'products/QA-100')));
  assert.equal(product.data()?.wholesale, undefined);
  await assertFails(getDoc(doc(customer, 'dealerPrices/QA-100')));
  await assertFails(getDocs(collection(dealer, 'dealerPrices')));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'products')));
  await decideDealer(admin as never, 'dealer', 'pending', 'approved');
  assert.equal((await assertSucceeds(getDoc(doc(dealer, 'dealerPrices/QA-100')))).data()?.wholesale, 7500);
  await saveProduct(admin as never, { ...catalogDraft, active: false }, 1);
  await assertFails(getDoc(doc(customer, 'products/QA-100')));
  const active = await assertSucceeds(getDocs(query(collection(customer, 'products'), where('active', '==', true))));
  assert.equal(active.size, 0);
  await assertFails(getDocs(collection(customer, 'products')));
  await assertSucceeds(getDoc(doc(admin, 'products/QA-100')));
  await decideDealer(admin as never, 'dealer', 'approved', 'rejected');
  await assertFails(getDoc(doc(dealer, 'dealerPrices/QA-100')));
});

test('catalog writes enforce admin access, schema, paired prices and optimistic revisions', async () => {
  const admin = env.authenticatedContext('admin-user', { admin: true }).firestore();
  const customer = env.authenticatedContext('alice', { email: 'alice@example.test' }).firestore();
  await assert.rejects(saveProduct(customer as never, catalogDraft, null));
  await saveProduct(admin as never, catalogDraft, null);
  await assert.rejects(saveProduct(admin as never, catalogDraft, null), /already exists/);
  await saveProduct(admin as never, { ...catalogDraft, stock: 3, retail: 11000 }, 1);
  await assert.rejects(saveProduct(admin as never, { ...catalogDraft, stock: 50 }, 1), /changed/);
  const ref = doc(admin, 'products/QA-100');
  const existing = (await getDoc(ref)).data()!;
  for (const patch of [{ stock: -1 }, { retail: 0 }, { stock: 1.5 }, { wholesale: 1 }, { image: 'javascript:alert(1)' }, { category: 'Other' }]) {
    await assertFails(setDoc(ref, { ...existing, ...patch, revision: 3, updatedAt: serverTimestamp() }));
  }
  await assertFails(updateDoc(ref, { stock: 10, revision: 3, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(admin, 'dealerPrices/QA-100'), { wholesale: 1, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(ref));
  assert.equal((await getDoc(ref)).data()?.stock, 3);
});

test('catalog subscriptions show current prices only to authorized audiences', async () => {
  const admin = env.authenticatedContext('admin-user', { admin: true }).firestore();
  const customer = env.authenticatedContext('alice', { email: 'alice@example.test' }).firestore();
  await saveProduct(admin as never, catalogDraft, null);
  const read = (db: typeof admin, access: 'retail' | 'admin') => new Promise<CatalogProduct[]>((resolve, reject) => {
    const stop = subscribeCatalog(db as never, access, items => { if (items.length && (access === 'retail' || items[0].wholesale !== null)) { stop(); resolve(items); } }, reject);
  });
  assert.equal((await read(customer, 'retail'))[0].wholesale, null);
  assert.equal((await read(admin, 'admin'))[0].wholesale, 7500);
  await saveProduct(admin as never, { ...catalogDraft, wholesale: 7000 }, 1);
  assert.equal((await read(admin, 'admin'))[0].wholesale, 7000);
});

test('orders are private to their owner and admin; clients cannot forge orders, payment or stock', async () => {
  const owner = env.authenticatedContext('alice', { email: 'alice@example.test' }).firestore();
  const other = env.authenticatedContext('bob', { email: 'bob@example.test' }).firestore();
  const admin = env.authenticatedContext('admin-user', { admin: true }).firestore();
  await env.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), 'orders/order-test'), { userId: 'alice', total: 1000, paymentState: 'pending' }); });
  await assertSucceeds(getDoc(doc(owner, 'orders/order-test')));
  await assertSucceeds(getDocs(query(collection(owner, 'orders'), where('userId', '==', 'alice'))));
  await assertFails(getDoc(doc(other, 'orders/order-test')));
  await assertFails(getDocs(collection(owner, 'orders')));
  await assertSucceeds(getDocs(collection(admin, 'orders')));
  await assertFails(setDoc(doc(owner, 'orders/forged'), { userId: 'alice', total: 1, paymentState: 'paid' }));
  await assertFails(updateDoc(doc(owner, 'orders/order-test'), { paymentState: 'paid' }));
  await assertFails(updateDoc(doc(admin, 'orders/order-test'), { status: 'Delivered' }));
  await assertFails(setDoc(doc(owner, 'checkoutLimits/alice'), { pending: 0 }));
  await assertFails(setDoc(doc(owner, 'reservations/order-test'), { expiresAt: '2099-01-01' }));
});

test('service bookings persist once, remain private and accept only admin status updates', async () => {
  const owner = env.authenticatedContext('alice', { email: 'alice@example.test' }).firestore();
  const other = env.authenticatedContext('bob', { email: 'bob@example.test' }).firestore();
  const admin = env.authenticatedContext('admin-user', { admin: true }).firestore();
  await setDoc(doc(owner, 'users/alice'), profile());
  const draft = { type: 'Repair', date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), address: '12 Main Road, Delhi 110001', phone: '9876543210', notes: 'Please call first.' };
  const id = 'SR-service-test-0001';
  await bookService(owner as never, id, profile() as never, draft);
  await bookService(owner as never, id, profile() as never, draft);
  assert.equal((await getDocs(query(collection(owner, 'services'), where('userId', '==', 'alice')))).size, 1);
  const ref = doc(owner, 'services', id);
  assert.equal((await getDoc(ref)).data()?.status, 'Open');
  await assertFails(getDoc(doc(other, 'services', id)));
  await assertFails(getDocs(collection(owner, 'services')));
  await assertFails(updateDoc(ref, { status: 'Resolved', updatedAt: serverTimestamp() }));
  await setServiceStatus(admin as never, id, 'Open', 'Assigned');
  assert.equal((await getDoc(ref)).data()?.status, 'Assigned');
  await assert.rejects(setServiceStatus(admin as never, id, 'Open', 'Resolved'), /Another admin/);
  await assertFails(updateDoc(doc(admin, 'services', id), { address: 'Altered delivery address', updatedAt: serverTimestamp() }));
});

test('service rules reject forged identity, dates, status and extra fields', async () => {
  const owner = env.authenticatedContext('alice', { email: 'alice@example.test' }).firestore();
  await setDoc(doc(owner, 'users/alice'), profile());
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const id = 'SR-service-invalid-0001';
  const service = { id, userId: 'alice', customer: 'Alice Sharma', type: 'Installation', visitAt: Timestamp.fromDate(new Date(tomorrow + 'T12:00:00Z')), address: '12 Main Road, Delhi 110001', phone: '9876543210', notes: '', status: 'Open', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  for (const patch of [{ userId: 'bob' }, { customer: 'Someone else' }, { status: 'Assigned' }, { type: 'Other' }, { phone: '123' }, { notes: 'x'.repeat(1001) }, { visitAt: Timestamp.fromDate(new Date('2000-01-01T12:00:00Z')) }, { admin: true }]) await assertFails(setDoc(doc(owner, 'services', id), { ...service, ...patch }));
  await assertSucceeds(setDoc(doc(owner, 'services', id), service));
});
