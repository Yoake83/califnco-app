import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where, type Firestore } from 'firebase/firestore';
import { validateProduct, type CatalogDraft, type CatalogProduct } from './catalog';

export function subscribeCatalog(db: Firestore, access: 'retail' | 'dealer' | 'admin', next: (products: CatalogProduct[]) => void, error: (error: Error) => void) {
  let items: CatalogProduct[] = [];
  let prices = new Map<string, { wholesale: number; revision: number }>();
  let publicReady = false;
  let pricesReady = access === 'retail';
  let active = true;
  const timer = setTimeout(() => fail(new Error('The catalog did not respond. Check your connection and retry.')), 15000);
  const publish = () => { if (active && publicReady && pricesReady) { clearTimeout(timer); next(items.map(product => ({ ...product, wholesale: access === 'retail' || prices.get(product.id)?.revision !== product.revision ? null : prices.get(product.id)!.wholesale })).sort((a, b) => a.name.localeCompare(b.name))); } };
  const fail = (failure: Error) => { if (active) { clearTimeout(timer); active = false; error(failure); } };
  const source = access === 'admin' ? collection(db, 'products') : query(collection(db, 'products'), where('active', '==', true));
  const stopProducts = onSnapshot(source, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    items = snapshot.docs.map(d => ({ ...d.data(), id: d.id, wholesale: null }) as CatalogProduct); publicReady = true; publish();
  }, fail);
  const stopPrices = access === 'retail' ? () => {} : onSnapshot(collection(db, 'dealerPrices'), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    prices = new Map(snapshot.docs.map(d => [d.id, { wholesale: d.data().wholesale as number, revision: d.data().revision as number }])); pricesReady = true; publish();
  }, fail);
  return () => { active = false; clearTimeout(timer); stopProducts(); stopPrices(); };
}

export async function saveProduct(db: Firestore, input: CatalogDraft, expectedRevision: number | null) {
  const product = validateProduct(input);
  await runTransaction(db, async transaction => {
    const ref = doc(db, 'products', product.id);
    const existing = await transaction.get(ref);
    if (existing.exists() ? existing.data().revision !== expectedRevision : expectedRevision !== null) throw new Error('This product changed or its SKU already exists. Reload the catalog before saving again.');
    const revision = (expectedRevision ?? 0) + 1;
    const { wholesale, ...publicFields } = product;
    transaction.set(ref, { ...publicFields, revision, createdAt: existing.data()?.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
    transaction.set(doc(db, 'dealerPrices', product.id), { wholesale, revision, updatedAt: serverTimestamp() });
  });
}
