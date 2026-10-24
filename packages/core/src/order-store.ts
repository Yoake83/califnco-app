import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import type { CommerceOrder } from './index';

export function subscribeOrders(db: Firestore, uid: string | null, next: (orders: CommerceOrder[]) => void, error: (error: Error) => void) {
  const source = uid ? query(collection(db, 'orders'), where('userId', '==', uid)) : collection(db, 'orders');
  return onSnapshot(source, snapshot => next(snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as CommerceOrder).sort((a, b) => b.createdAt.localeCompare(a.createdAt))), error);
}
