import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import type { Persistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '../../../packages/core/src/firebase-config';

export const usingFirebaseEmulators = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
const config = usingFirebaseEmulators ? { ...firebaseConfig, projectId: 'demo-califnco' } : firebaseConfig;
const isNew = !getApps().length;
export const firebaseApp = isNew ? initializeApp(config) : getApp();
// Metro resolves the official React Native export; the shared web declarations
// do not expose this platform-specific persistence factory.
const nativeAuth = FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
};
export const auth = (() => {
  try {
    return FirebaseAuth.initializeAuth(firebaseApp, {
      persistence: nativeAuth.getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/already-initialized') throw error;
    return FirebaseAuth.getAuth(firebaseApp);
  }
})();
export const db = getFirestore(firebaseApp);
if (usingFirebaseEmulators && isNew) {
  const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '10.0.2.2';
  FirebaseAuth.connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8180);
}
