import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '../../../packages/core/src/firebase-config';

export const usingFirebaseEmulators = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
const config = usingFirebaseEmulators ? { ...firebaseConfig, projectId: 'demo-califnco' } : firebaseConfig;
const isNew = !getApps().length;
export const firebaseApp = isNew ? initializeApp(config) : getApp();
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
if (usingFirebaseEmulators && isNew) {
  const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8180);
}
