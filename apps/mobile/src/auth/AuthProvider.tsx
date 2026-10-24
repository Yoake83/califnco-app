import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Profile } from '@califnco/core';
import { auth, db } from '../firebase';
import { accountError } from './account-service';

type Session = { status: 'loading' | 'signedOut' | 'needsProfile' | 'ready' | 'error'; user: User | null; profile: Profile | null; error: string };
const AuthContext = createContext<(Session & { retry: () => void; logout: () => Promise<void> }) | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading', user: null, profile: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let stopProfile = () => {};
    let profileDeadline: ReturnType<typeof setTimeout> | undefined;
    let revision = 0;
    const stopAuth = onAuthStateChanged(auth, user => {
      stopProfile();
      clearTimeout(profileDeadline);
      const current = ++revision;
      if (!active) return;
      if (!user) { setSession({ status: 'signedOut', user: null, profile: null, error: '' }); return; }
      setSession({ status: 'loading', user, profile: null, error: '' });
      profileDeadline = setTimeout(() => {
        if (active && current === revision) setSession({ status: 'error', user, profile: null, error: 'Your profile is taking too long to load. Check your connection and retry.' });
      }, 15000);
      stopProfile = onSnapshot(doc(db, 'users', user.uid), { includeMetadataChanges: true }, snapshot => {
        if (!active || current !== revision) return;
        // Do not enter the store using an uncommitted signup or assume a profile
        // is missing from an empty offline cache.
        if (snapshot.metadata.hasPendingWrites || (!snapshot.exists() && snapshot.metadata.fromCache)) return;
        clearTimeout(profileDeadline);
        if (!snapshot.exists()) { setSession({ status: 'needsProfile', user, profile: null, error: '' }); return; }
        const data = snapshot.data();
        if (data.id !== user.uid || !['Customer', 'Dealer'].includes(data.role) || !['pending', 'approved', 'rejected'].includes(data.approval) || typeof data.name !== 'string') {
          setSession({ status: 'error', user, profile: null, error: 'Your account profile needs attention. Please contact support.' }); return;
        }
        setSession({ status: 'ready', user, profile: data as Profile, error: '' });
      }, error => {
        clearTimeout(profileDeadline);
        if (active && current === revision) setSession({ status: 'error', user, profile: null, error: accountError(error) });
      });
    }, error => { if (active) setSession({ status: 'error', user: null, profile: null, error: accountError(error) }); });
    return () => { active = false; clearTimeout(profileDeadline); stopAuth(); stopProfile(); };
  }, [attempt]);
  return <AuthContext.Provider value={{ ...session, retry: () => setAttempt(n => n + 1), logout: () => signOut(auth) }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is missing.');
  return context;
}
