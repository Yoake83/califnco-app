import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp } from 'firebase/app';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDocFromServer, serverTimestamp, terminate, updateDoc, setLogLevel } from 'firebase/firestore';
setLogLevel('silent');
import type { Profile, RegistrationInput } from '@califnco/core';

let client: typeof import('../src/firebase');
let service: typeof import('../src/auth/account-service');
const password = 'Local-test-Password-123';
const unique = Date.now().toString(36);
const customer: RegistrationInput = { name: 'QA Customer', email: `customer-${unique}@example.test`, role: 'Customer', phone: '', address: '', businessName: '' };
const dealer: RegistrationInput = { name: 'QA Dealer', email: `dealer-${unique}@example.test`, role: 'Dealer', phone: '9876543210', address: '12 Main Road, Delhi 110001', businessName: 'QA Water Traders' };
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run these tests only through Firebase emulators.');
  process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS = 'true';
  client = await import('../src/firebase');
  service = await import('../src/auth/account-service');
});
beforeEach(async () => { await signOut(client.auth); });
after(async () => { if (client) { await signOut(client.auth); await terminate(client.db); await deleteApp(client.firebaseApp); } });

test('customer signs up, signs out, signs back in and saves their profile', async () => {
  await service.registerAccount(customer, password, password);
  const uid = client.auth.currentUser!.uid;
  let snapshot = await getDocFromServer(doc(client.db, 'users', uid));
  assert.equal(snapshot.data()?.role, 'Customer');
  assert.equal(snapshot.data()?.approval, 'approved');
  assert.equal(snapshot.data()?.password, undefined);
  await signOut(client.auth);
  await assert.rejects(service.login(customer.email, 'wrong-password'));
  await service.login(customer.email, password);
  assert.equal(client.auth.currentUser!.uid, uid);
  await service.saveAccountProfile(snapshot.data() as Profile, { name: 'QA Updated', phone: '9876543210', address: '12 Main Road, Delhi 110001', businessName: '' });
  snapshot = await getDocFromServer(doc(client.db, 'users', uid));
  assert.equal(snapshot.data()?.name, 'QA Updated');
  await service.resetPassword(customer.email);
  await service.resetPassword(`unknown-${unique}@example.test`);
});

test('dealer application persists pending and cannot self-approve or change role', async () => {
  await service.registerAccount(dealer, password, password);
  const uid = client.auth.currentUser!.uid;
  const ref = doc(client.db, 'users', uid);
  assert.equal((await getDocFromServer(ref)).data()?.approval, 'pending');
  await assert.rejects(updateDoc(ref, { approval: 'approved', updatedAt: serverTimestamp() }));
  await assert.rejects(updateDoc(ref, { role: 'Customer', updatedAt: serverTimestamp() }));
  // Replaying completion cannot reset the account's original role or decision.
  await service.completeRegistration({ ...dealer, role: 'Customer' });
  assert.equal((await getDocFromServer(ref)).data()?.role, 'Dealer');
  await signOut(client.auth);
  await service.login(dealer.email, password);
  assert.equal(client.auth.currentUser!.uid, uid);
  assert.equal((await getDocFromServer(ref)).data()?.businessName, dealer.businessName);
});

test('an interrupted profile setup can be completed without creating another login', async () => {
  const email = `interrupted-${unique}@example.test`;
  const credential = await createUserWithEmailAndPassword(client.auth, email, password);
  assert.equal((await getDocFromServer(doc(client.db, 'users', credential.user.uid))).exists(), false);
  await service.completeRegistration({ ...customer, email });
  const snapshot = await getDocFromServer(doc(client.db, 'users', credential.user.uid));
  assert.equal(snapshot.data()?.id, credential.user.uid);
  assert.equal(snapshot.data()?.email, email);
});
