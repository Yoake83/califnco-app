import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, Timestamp, where, type Firestore } from 'firebase/firestore';
import type { Profile, ServiceRequest } from './index';
import { validateService, type ServiceDraft } from './service-booking';

export function subscribeServices(db: Firestore, uid: string | null, next: (services: ServiceRequest[]) => void, error: (error: Error) => void) {
  const source = uid ? query(collection(db, 'services'), where('userId', '==', uid)) : collection(db, 'services');
  return onSnapshot(source, snapshot => next(snapshot.docs.map(d => {
    const record = d.data();
    return { ...record, id: d.id, date: record.visitAt.toDate().toISOString().slice(0, 10), createdAt: record.createdAt?.toDate().toISOString() ?? '' } as ServiceRequest;
  }).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))), error);
}

export async function bookService(db: Firestore, id: string, profile: Profile, input: ServiceDraft) {
  if (!/^SR-[A-Za-z0-9_-]{10,80}$/.test(id)) throw new Error('Restart your booking and try again.');
  const { date: _date, visitAt, ...clean } = validateService(input);
  await runTransaction(db, async transaction => {
    const ref = doc(db, 'services', id); const existing = await transaction.get(ref);
    if (existing.exists()) {
      const saved = existing.data();
      if (saved.userId !== profile.id || saved.type !== clean.type || saved.address !== clean.address || saved.phone !== clean.phone || saved.notes !== clean.notes || !saved.visitAt.isEqual(Timestamp.fromDate(visitAt))) throw new Error('This booking was already saved with different details. Start a new booking.');
      return;
    }
    transaction.set(ref, { ...clean, id, userId: profile.id, customer: profile.name, visitAt: Timestamp.fromDate(visitAt), status: 'Open', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

export async function setServiceStatus(db: Firestore, id: string, expected: ServiceRequest['status'], status: ServiceRequest['status']) {
  if (!['Open', 'Assigned', 'Resolved'].includes(status)) throw new Error('Choose a valid service status.');
  await runTransaction(db, async transaction => {
    const ref = doc(db, 'services', id); const existing = await transaction.get(ref);
    if (!existing.exists()) throw new Error('This service request is no longer available.');
    if (existing.data().status !== expected) throw new Error('Another admin updated this request. Review its latest status.');
    transaction.update(ref, { status, updatedAt: serverTimestamp() });
  });
}
