import { useEffect, useState, type ReactNode } from 'react';
import { getIdTokenResult, onIdTokenChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';

export function accountError(error: unknown) {
  const code = (error as { code?: string }).code;
  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code || '')) return 'Check your email and password.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
  if (code === 'auth/network-request-failed') return 'Could not connect. Check your connection and try again.';
  if (code === 'permission-denied') return 'Admin access is unavailable. Refresh your access or sign in again.';
  return error instanceof Error && !code ? error.message : 'Unable to complete this request. Please try again.';
}

export function AdminGate({ children }: { children: (user: User) => ReactNode }) {
  const [session, setSession] = useState<{ user: User | null; allowed: boolean; loading: boolean }>({ user: null, allowed: false, loading: true });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let generation = 0;
    const unsubscribe = onIdTokenChanged(auth, async user => {
      const current = ++generation;
      setSession({ user, allowed: false, loading: !!user });
      if (!user) return;
      try {
        const token = await getIdTokenResult(user);
        if (current === generation) setSession({ user, allowed: token.claims.admin === true, loading: false });
      } catch (error) {
        if (current === generation) { setSession({ user, allowed: false, loading: false }); setMessage(accountError(error)); }
      }
    });
    return () => { generation++; unsubscribe(); };
  }, []);
  async function perform(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(accountError(error)); } finally { setBusy(false); }
  }
  if (session.loading) return <main className="account-shell"><p role="status">Checking admin access…</p></main>;
  if (session.allowed && session.user) return <>{children(session.user)}</>;
  return <main className="account-shell"><section className="panel account-panel"><span className="logo">c.</span><h1>Admin sign-in</h1><p>Manage Califnco dealer applications.</p>
    {message && <p role="status" className="notice">{message}</p>}
    {session.user ? <><p>Signed in as <strong>{session.user.email}</strong>. This account has not been granted admin access.</p><p>After the project owner grants access, refresh it here.</p><button className="primary" disabled={busy} onClick={() => void perform(async () => {
      const token = await getIdTokenResult(session.user!, true);
      setSession({ user: session.user, allowed: token.claims.admin === true, loading: false });
      if (token.claims.admin !== true) setMessage('Admin access has not been granted to this account yet.');
    })}>Refresh access</button><button className="outline" disabled={busy} onClick={() => void perform(() => signOut(auth))}>Sign out</button></> : <form onSubmit={event => { event.preventDefault(); void perform(async () => { await signInWithEmailAndPassword(auth, email.trim(), password); setPassword(''); }); }}>
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button className="primary" disabled={busy} type="submit">{busy ? 'Please wait…' : 'Sign in'}</button>
      <button className="outline" disabled={busy} type="button" onClick={() => void perform(async () => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter your email address first.');
        try { await sendPasswordResetEmail(auth, email.trim()); } catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
        setMessage('If an account exists for this email, a password reset link has been sent.');
      })}>Forgot password?</button>
    </form>}
  </section></main>;
}
