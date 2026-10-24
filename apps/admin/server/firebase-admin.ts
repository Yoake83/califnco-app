import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function adminServices() {
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.NODE_ENV !== 'production';
  if (!getApps().some(app => app.name === 'commerce-server')) {
    const projectId = emulator ? 'demo-califnco' : 'califnco-176c3';
    let credential = emulator ? undefined : applicationDefault();
    if (!emulator && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (account.project_id !== projectId) throw new Error('The server credential belongs to another Firebase project.');
      credential = cert(account);
    }
    initializeApp({ projectId, ...(credential ? { credential } : {}) }, 'commerce-server');
  }
  const app = getApps().find(app => app.name === 'commerce-server')!;
  return { auth: getAuth(app), db: getFirestore(app) };
}
