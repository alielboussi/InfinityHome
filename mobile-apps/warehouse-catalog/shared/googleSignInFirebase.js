import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirebaseAuth, signOutFirebase, ensureFirebaseAuthToken } from './firebase';
import { shouldForceSignOutForAccessCheck, verifyMobileLoginAccess } from './loginAccess';

export async function completeGoogleFirebaseSignIn(idToken, onError, onSuccess) {
  if (!idToken) {
    onError?.('Google sign-in did not return an ID token.');
    return;
  }
  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(getFirebaseAuth(), credential);
  await ensureFirebaseAuthToken(true);
  const access = await verifyMobileLoginAccess();
  if (shouldForceSignOutForAccessCheck(access)) {
    await signOutFirebase();
    onError?.(access.error || 'Login not allowed.');
    return;
  }
  onSuccess?.();
}
