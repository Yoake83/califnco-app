// Run only in a trusted terminal with Application Default Credentials.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = 'califnco-176c3';
const email = process.argv.find(argument => argument.startsWith('--email='))?.slice(8)?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Supply the registered admin email with --email=address.');
if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Remove the Auth emulator setting before provisioning the live project.');
initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
if (user.disabled) throw new Error('This account is disabled. No access was granted.');
const expectedUid = process.argv.find(argument => argument.startsWith('--uid='))?.slice(6);
if (process.argv.includes('--apply') && expectedUid !== user.uid) throw new Error('Supply the exact UID from the preview with --uid=UID before applying. No access was granted.');
console.log(`Project: ${projectId}\nAccount: ${user.email}\nUID: ${user.uid}`);
if (!process.argv.includes('--apply')) {
  console.log('Preview only. Add --apply to grant this registered account admin access.');
} else {
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
  const confirmed = await auth.getUser(user.uid);
  if (confirmed.customClaims?.admin !== true) throw new Error('Admin claim verification failed.');
  console.log('Verified: admin access granted. Sign in to the admin panel, or use Refresh access.');
}
