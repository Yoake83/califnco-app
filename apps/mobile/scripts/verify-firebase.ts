import { deleteApp } from 'firebase/app';
import { doc, getDocFromServer, terminate } from 'firebase/firestore';
import { auth, db, firebaseApp } from '../src/firebase';

async function main() {
  const deadline = setTimeout(() => { console.error('Firebase check timed out.'); process.exit(1); }, 25000);
  try {
    if (auth.app.options.projectId !== 'califnco-176c3') throw new Error('Wrong Firebase project.');
    try {
      // Read only: no users or documents are created by this setup check.
      await getDocFromServer(doc(db, '_setup', 'connection-probe'));
      throw new Error('Expected setup rules to block unauthenticated reads.');
    } catch (error) {
      if ((error as { code?: string }).code !== 'permission-denied') throw error;
      console.log('PASS: SDK reached califnco-176c3; Firestore rejected an unauthenticated read as expected.');
    }
  } finally {
    clearTimeout(deadline);
    await terminate(db);
    await deleteApp(firebaseApp);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Firebase check failed.'); process.exitCode = 1; });
