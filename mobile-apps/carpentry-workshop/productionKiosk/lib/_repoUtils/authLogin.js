import { firebaseSignInWithEmailPassword } from './firebaseAuthApi';

export async function signInWithEmailPassword(email, password) {
  return firebaseSignInWithEmailPassword(email, password);
}
