import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where, type Firestore } from 'firebase/firestore';
import type { Approval, Profile } from '@califnco/core';

export function subscribeDealers(db: Firestore, next: (dealers: Profile[]) => void, error: (error: Error) => void) {
  return onSnapshot(query(collection(db, 'users'), where('role', '==', 'Dealer')), snapshot => {
    const dealers = snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Profile);
    next(dealers.sort((a, b) => (a.businessName || a.name).localeCompare(b.businessName || b.name)));
  }, error);
}

export async function decideDealer(db: Firestore, uid: string, expected: Approval, decision: Approval) {
  if (!['approved', 'rejected', 'pending'].includes(decision)) throw new Error('Choose a valid dealer status.');
  if (decision === expected) return;
  await runTransaction(db, async transaction => {
    const ref = doc(db, 'users', uid);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().role !== 'Dealer') throw new Error('This dealer application is no longer available.');
    if (snapshot.data().approval !== expected) throw new Error('Another admin changed this application. Review its latest status and try again.');
    transaction.update(ref, { approval: decision, updatedAt: serverTimestamp() });
  });
}
