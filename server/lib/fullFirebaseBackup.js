import admin from 'firebase-admin';
import { getFirebaseAdminApp, getServiceAccountConfig } from './firebaseAdmin.js';

const BACKUP_FORMAT = 'infinity-home-full-backup';
const BACKUP_VERSION = 1;
const STORAGE_COPY_CONCURRENCY = 25;
const STORAGE_PAGE_SIZE = 500;

function resolveProjectId() {
  return String(
    process.env.FIREBASE_PROJECT_ID
    || process.env.REACT_APP_FIREBASE_PROJECT_ID
    || '',
  ).trim();
}

function resolveStorageBucket() {
  return String(
    process.env.FIREBASE_STORAGE_BUCKET
    || process.env.REACT_APP_FIREBASE_STORAGE_BUCKET
    || '',
  ).trim();
}

export function resolveBackupBucket() {
  return String(process.env.FIREBASE_BACKUP_BUCKET || '').trim();
}

export function createBackupStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function getAuthedGoogleClient() {
  const serviceAccount = getServiceAccountConfig();
  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  }
  const { JWT } = await import('google-auth-library');
  return new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
}

async function uploadJsonToBucket(bucketName, objectPath, payload) {
  getFirebaseAdminApp();
  const bucket = admin.storage().bucket(bucketName);
  await bucket.file(objectPath).save(JSON.stringify(payload, null, 2), {
    contentType: 'application/json',
    resumable: false,
    metadata: { cacheControl: 'private, max-age=0' },
  });
  return `gs://${bucketName}/${objectPath}`;
}

export async function startFirestoreExport({ projectId, outputUriPrefix }) {
  const client = await getAuthedGoogleClient();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`;
  const response = await client.request({
    url,
    method: 'POST',
    data: { outputUriPrefix },
  });
  return {
    outputUriPrefix,
    operationName: response?.data?.name || null,
    status: 'started',
  };
}

async function listAllAuthUsers() {
  getFirebaseAdminApp();
  const users = [];
  let pageToken;
  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    users.push(...(result.users || []));
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

function serializeAuthUser(user) {
  const row = {
    localId: user.uid,
    email: user.email || undefined,
    emailVerified: user.emailVerified || false,
    displayName: user.displayName || undefined,
    photoUrl: user.photoURL || undefined,
    phoneNumber: user.phoneNumber || undefined,
    disabled: user.disabled || false,
    createdAt: user.metadata?.creationTime || undefined,
    lastLoginAt: user.metadata?.lastSignInTime || undefined,
  };
  if (user.passwordHash) row.passwordHash = user.passwordHash;
  if (user.passwordSalt) row.salt = user.passwordSalt;
  if (user.customClaims && Object.keys(user.customClaims).length) {
    row.customAttributes = JSON.stringify(user.customClaims);
  }
  if (Array.isArray(user.providerData) && user.providerData.length) {
    row.providerUserInfo = user.providerData.map((provider) => ({
      providerId: provider.providerId,
      rawId: provider.uid,
      email: provider.email || undefined,
      displayName: provider.displayName || undefined,
      photoUrl: provider.photoURL || undefined,
    }));
  }
  return row;
}

export async function exportAuthToGcs({ backupBucket, stamp }) {
  const users = await listAllAuthUsers();
  const payload = {
    format: 'infinity-home-auth-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    userCount: users.length,
    users: users.map(serializeAuthUser),
  };
  const objectPath = `full-backups/${stamp}/auth/auth-users.json`;
  const gcsPath = await uploadJsonToBucket(backupBucket, objectPath, payload);
  return {
    gcsPath,
    userCount: users.length,
    status: 'completed',
  };
}

export async function mirrorStorageToGcs({
  sourceBucket,
  backupBucket,
  stamp,
  concurrency = STORAGE_COPY_CONCURRENCY,
}) {
  getFirebaseAdminApp();
  const source = admin.storage().bucket(sourceBucket);
  const dest = admin.storage().bucket(backupBucket);
  const destPrefix = `full-backups/${stamp}/storage/`;

  let fileCount = 0;
  let totalBytes = 0;
  let pageToken;

  do {
    const [files, , apiResponse] = await source.getFiles({
      autoPaginate: false,
      maxResults: STORAGE_PAGE_SIZE,
      pageToken,
    });
    pageToken = apiResponse?.nextPageToken;

    for (let index = 0; index < files.length; index += concurrency) {
      const batch = files.slice(index, index + concurrency);
      await Promise.all(batch.map(async (file) => {
        const destination = dest.file(`${destPrefix}${file.name}`);
        await file.copy(destination);
        const [metadata] = await file.getMetadata();
        totalBytes += Number(metadata?.size || 0);
        fileCount += 1;
      }));
    }
  } while (pageToken);

  return {
    gcsPrefix: `gs://${backupBucket}/${destPrefix}`,
    fileCount,
    totalBytes,
    status: 'completed',
  };
}

function buildRestoreCommands({ projectId, storageBucket, backupBucket, stamp, firestorePrefix }) {
  const root = `gs://${backupBucket}/full-backups/${stamp}`;
  return {
    firestore: `gcloud firestore import ${firestorePrefix} --project=${projectId}`,
    storage: `gsutil -m rsync -r ${root}/storage ${storageBucket.startsWith('gs://') ? storageBucket : `gs://${storageBucket}`}`,
    auth: `firebase auth:import auth-users.json --project ${projectId}`,
    authDownload: `gsutil cp ${root}/auth/auth-users.json ./auth-users.json`,
    rules: 'firebase deploy --only firestore:rules,storage --project ' + projectId,
  };
}

export async function writeBackupManifest({
  backupBucket,
  stamp,
  projectId,
  storageBucket,
  firestore,
  auth,
  storage,
}) {
  const firestorePrefix = firestore?.outputUriPrefix || `gs://${backupBucket}/full-backups/${stamp}/firestore`;
  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    stamp,
    projectId,
    storageBucket,
    backupBucket,
    createdAt: new Date().toISOString(),
    components: {
      firestore,
      auth,
      storage,
    },
    restore: buildRestoreCommands({
      projectId,
      storageBucket,
      backupBucket,
      stamp,
      firestorePrefix,
    }),
    notes: [
      'Firestore export runs asynchronously on Google Cloud; check operation status in GCP Console.',
      'Deploy firestore.rules and storage.rules from the git repo after restore.',
      'Firestore indexes (firestore.indexes.json) must be deployed separately if used.',
    ],
  };
  const objectPath = `full-backups/${stamp}/manifest.json`;
  const gcsPath = await uploadJsonToBucket(backupBucket, objectPath, manifest);
  return { gcsPath, manifest };
}

export async function runFullFirebaseBackup({ stamp = createBackupStamp() } = {}) {
  const projectId = resolveProjectId();
  const storageBucket = resolveStorageBucket();
  const backupBucket = resolveBackupBucket();

  if (!getFirebaseAdminApp()) {
    throw new Error('Firebase Admin not configured (FIREBASE_SERVICE_ACCOUNT)');
  }
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID not configured');
  if (!storageBucket) throw new Error('FIREBASE_STORAGE_BUCKET not configured');
  if (!backupBucket) {
    throw new Error('FIREBASE_BACKUP_BUCKET not configured — create a GCS bucket and set this env var in Vercel');
  }

  const gcsRoot = `gs://${backupBucket}/full-backups/${stamp}`;
  const firestorePrefix = `${gcsRoot}/firestore`;

  const firestore = await startFirestoreExport({ projectId, outputUriPrefix: firestorePrefix });
  const auth = await exportAuthToGcs({ backupBucket, stamp });
  const storage = await mirrorStorageToGcs({ sourceBucket: storageBucket, backupBucket, stamp });
  const { gcsPath: manifestPath, manifest } = await writeBackupManifest({
    backupBucket,
    stamp,
    projectId,
    storageBucket,
    firestore,
    auth,
    storage,
  });

  return {
    ok: true,
    stamp,
    projectId,
    gcsRoot,
    manifestPath,
    firestore,
    auth,
    storage,
    manifest,
  };
}
