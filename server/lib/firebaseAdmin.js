import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

let initialized = false;

function discoverServiceAccountFile() {
  const explicit = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const root = process.cwd();
  let matches = [];
  try {
    matches = fs
      .readdirSync(root)
      .filter((name) => /firebase-adminsdk.*\.json$/i.test(name))
      .map((name) => path.join(root, name));
  } catch {
    return null;
  }
  if (matches.length === 1) return matches[0];
  return null;
}

function parseServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && String(inline).trim()) {
    return JSON.parse(inline);
  }
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || discoverServiceAccountFile();
  if (filePath && fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

export function getServiceAccountConfig() {
  return parseServiceAccount();
}

export function getFirebaseAdminApp() {
  if (initialized && admin.apps.length) return admin.apps[0];
  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) return null;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  initialized = true;
  return admin.apps[0];
}

export async function verifyFirebaseIdToken(token) {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch {
    return null;
  }
}
