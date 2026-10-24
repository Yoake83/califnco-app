import test from 'node:test';
import assert from 'node:assert/strict';
import { products, demoProfile, quote, priceFor, validateAddress, categories, normalizeRegistration, validateNewPassword, validateProduct, validateService } from './index';
test('catalog covers all five categories with unique SKUs', () => {
  assert.ok(products.length >= 50);
  assert.equal(new Set(products.map(p => p.id)).size, products.length);
  for (const category of categories) assert.ok(products.some(p => p.category === category));
});
test('approved dealer receives wholesale pricing, pending dealer cannot order', () => {
  const customer = demoProfile('Customer'); const dealer = demoProfile('Dealer'); const p = products[0];
  assert.equal(quote([{ productId: p.id, quantity: 2 }], customer).total, p.retail * 2);
  assert.equal(quote([{ productId: p.id, quantity: 2 }], dealer).total, p.wholesale! * 2);
  assert.throws(() => quote([{ productId: p.id, quantity: 2 }], { ...dealer, approval: 'pending' }), /approval/);
  assert.equal(priceFor(p, { ...dealer, approval: 'rejected' }), p.retail);
  assert.throws(() => quote([{ productId: p.id, quantity: 1 }], dealer), /minimum/);
});
test('rejects invalid and duplicate lines, empty carts and quantities beyond stock', () => {
  const user = demoProfile('Customer'); const p = products[0];
  for (const qty of [0, -1, 1.5, NaN, Infinity, p.stock + 1]) assert.throws(() => quote([{ productId: p.id, quantity: qty }], user));
  assert.throws(() => quote([], user));
  assert.throws(() => quote([{ productId: 'missing', quantity: 1 }], user));
  assert.throws(() => quote([{ productId: p.id, quantity: 1 }, { productId: p.id, quantity: 1 }], user));
});
test('delivery validation checks address and mobile number', () => {
  assert.throws(() => validateAddress('home', '123'));
  assert.throws(() => validateAddress('12 Main Road, New Delhi 110001', '1234567890'));
  assert.doesNotThrow(() => validateAddress('12 Main Road, New Delhi 110001', '9876543210'));
});
test('registration normalizes identity and requires dealer business details', () => {
  const input = { name: '  Alex Sharma ', email: ' ALEX@EXAMPLE.COM ', role: 'Customer' as const, phone: '', address: '', businessName: '' };
  assert.equal(normalizeRegistration(input).email, 'alex@example.com');
  assert.equal(normalizeRegistration(input).name, 'Alex Sharma');
  assert.throws(() => normalizeRegistration({ ...input, role: 'Dealer' }), /business name/);
  assert.throws(() => normalizeRegistration({ ...input, role: 'Dealer', businessName: 'Pure Water' }), /mobile/);
  assert.throws(() => normalizeRegistration({ ...input, role: 'Dealer', businessName: 'Pure Water', phone: '9876543210' }), /address/);
  assert.doesNotThrow(() => normalizeRegistration({ ...input, role: 'Dealer', businessName: 'Pure Water', phone: '9876543210', address: '12 Main Road, Delhi 110001' }));
  assert.throws(() => normalizeRegistration({ ...input, role: 'Admin' as never }));
  assert.throws(() => validateNewPassword('short', 'short'));
  assert.throws(() => validateNewPassword('long-enough', 'different-password'));
});

test('live catalog validation and quoting use current inventory and fail closed without dealer prices', () => {
  const draft = { ...products[0], active: true };
  assert.equal(validateProduct(draft).id, products[0].id);
  for (const patch of [{ stock: -1 }, { stock: 1.5 }, { wholesale: null }, { wholesale: draft.retail + 1 }, { image: 'http://example.test/image.jpg' }, { minBulk: 0 }, { id: '../bad' }]) assert.throws(() => validateProduct({ ...draft, ...patch }));
  const current = { ...draft, stock: 1, retail: 999 };
  assert.equal(quote([{ productId: current.id, quantity: 1 }], demoProfile('Customer'), [current]).total, 999);
  assert.throws(() => quote([{ productId: current.id, quantity: 2 }], demoProfile('Customer'), [current]), /Available/);
  assert.throws(() => quote([{ productId: current.id, quantity: 1 }], demoProfile('Customer'), []), /Invalid/);
  assert.throws(() => priceFor({ ...current, wholesale: null }, demoProfile('Dealer')), /unavailable/);
});

test('service dates use the India calendar and reject past, impossible and excessively distant visits', () => {
  const now = new Date('2026-10-24T20:00:00Z'); // 25 October in India.
  const draft = { type: 'Repair', date: '2026-10-25', address: '12 Main Road, Delhi 110001', phone: '9876543210', notes: '' };
  assert.equal(validateService(draft, now).visitAt.toISOString(), '2026-10-25T12:00:00.000Z');
  for (const date of ['2026-10-24', '2027-02-31', '2030-10-25', 'not-a-date']) assert.throws(() => validateService({ ...draft, date }, now));
});
