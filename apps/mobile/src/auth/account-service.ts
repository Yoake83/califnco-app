import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { normalizeRegistration, validateNewPassword, type Profile, type RegistrationInput } from '@califnco/core';
import { auth, db } from '../firebase';

export async function completeRegistration(input: RegistrationInput) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('Sign in again to finish setting up your account.');
  const clean = normalizeRegistration({ ...input, email: user.email });
  const ref = doc(db, 'users', user.uid);
  await runTransaction(db, async transaction => {
    const existing = await transaction.get(ref);
    // Retrying a completed signup must never overwrite its role or approval.
    if (existing.exists()) return;
    transaction.set(ref, {
      ...clean, id: user.uid,
      approval: clean.role === 'Dealer' ? 'pending' : 'approved',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
}

export async function registerAccount(input: RegistrationInput, password: string, confirmation: string) {
  const clean = normalizeRegistration(input);
  validateNewPassword(password, confirmation);
  await createUserWithEmailAndPassword(auth, clean.email, password);
  try { await completeRegistration(clean); }
  catch { throw new Error('Your sign-in was created, but the profile could not be saved. Finish your account setup here, or sign out and try again later.'); }
}

export async function login(email: string, password: string) {
  if (!email.trim() || !password) throw new Error('Enter your email and password.');
  await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
}

export async function resetPassword(email: string) {
  const cleaned = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) throw new Error('Enter your email address first.');
  try { await sendPasswordResetEmail(auth, cleaned); }
  catch (error) {
    // Preserve the same response for unknown emails, including projects where
    // email-enumeration protection has not yet been enabled.
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }
}

export async function saveAccountProfile(profile: Profile, changes: Pick<Profile, 'name' | 'phone' | 'address'> & { businessName: string }) {
  if (auth.currentUser?.uid !== profile.id) throw new Error('Sign in again to save your profile.');
  const clean = normalizeRegistration({ ...profile, ...changes, businessName: changes.businessName });
  await updateDoc(doc(db, 'users', profile.id), {
    name: clean.name, phone: clean.phone, address: clean.address,
    businessName: clean.businessName, updatedAt: serverTimestamp(),
  });
}

export function accountError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/user-not-found': 'The email or password is incorrect.',
    'auth/email-already-in-use': 'An account already uses this email. Sign in or reset your password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a stronger password that meets the project password policy.',
    'auth/password-does-not-meet-requirements': 'Choose a stronger password that meets the project password policy.',
    'auth/too-many-requests': 'Too many attempts. Please wait a little and try again.',
    'auth/user-disabled': 'This account has been disabled. Contact support.',
    'auth/network-request-failed': 'Unable to connect. Check your internet connection and try again.',
    'permission-denied': 'Your profile could not be accessed. Please retry or contact support.',
    'unavailable': 'The account service is temporarily unavailable. Please try again.',
  };
  return (code && messages[code]) || (error instanceof Error && !code ? error.message : 'Unable to complete this request. Please try again.');
}
