import admin from 'firebase-admin';
import { getFirebaseAdminApp } from './firebaseAdmin.js';

function resolveBucketName() {
  return String(
    process.env.FIREBASE_STORAGE_BUCKET
    || process.env.REACT_APP_FIREBASE_STORAGE_BUCKET
    || '',
  ).trim();
}

function getAdminBucket() {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  const bucketName = resolveBucketName();
  return bucketName ? admin.storage().bucket(bucketName) : admin.storage().bucket();
}

function normalizeObjectPath(bucketFolder, objectPath) {
  const folder = String(bucketFolder || '').replace(/^\/+|\/+$/g, '');
  const object = String(objectPath || '').replace(/^\/+/, '');
  return folder ? `${folder}/${object}` : object;
}

export function firebaseStoragePublicUrl(bucketFolder, objectPath) {
  const bucketName = resolveBucketName();
  if (!bucketName) return null;
  const fullPath = normalizeObjectPath(bucketFolder, objectPath);
  const encoded = encodeURIComponent(fullPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media`;
}

export async function uploadBufferToFirebaseStorage({
  bucketFolder,
  objectPath,
  buffer,
  contentType = 'application/octet-stream',
  cacheControl = '3600',
}) {
  const bucket = getAdminBucket();
  if (!bucket) throw new Error('Firebase storage not configured (FIREBASE_SERVICE_ACCOUNT + storage bucket)');
  const fullPath = normalizeObjectPath(bucketFolder, objectPath);
  const file = bucket.file(fullPath);
  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: `public, max-age=${cacheControl}`,
    },
    resumable: false,
  });
  return { path: objectPath, fullPath };
}

export async function createFirebaseSignedUrl({
  bucketFolder,
  objectPath,
  expiresSeconds = 3600,
  downloadName = null,
}) {
  const bucket = getAdminBucket();
  if (!bucket) throw new Error('Firebase storage not configured');
  const fullPath = normalizeObjectPath(bucketFolder, objectPath);
  const file = bucket.file(fullPath);
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + Math.max(60, Number(expiresSeconds) || 3600) * 1000,
    ...(downloadName ? { responseDisposition: `attachment; filename="${downloadName}"` } : {}),
  });
  return url;
}

/** Legacy storage API shim backed by Firebase Admin (folder = legacy bucket name). */
export function createFirebaseStorageShim() {
  return {
    async getBucket() {
      return { data: { name: resolveBucketName() }, error: null };
    },
    async createBucket() {
      return { data: null, error: null };
    },
    from(bucketFolder) {
      return {
        async upload(objectPath, file, opts = {}) {
          try {
            const buffer = Buffer.isBuffer(file)
              ? file
              : Buffer.from(file instanceof Blob ? await file.arrayBuffer() : file);
            await uploadBufferToFirebaseStorage({
              bucketFolder,
              objectPath,
              buffer,
              contentType: opts.contentType || 'application/octet-stream',
              cacheControl: String(opts.cacheControl || '3600').replace(/^public,\s*max-age=/i, '') || '3600',
            });
            return { data: { path: objectPath }, error: null };
          } catch (err) {
            return { data: null, error: { message: err?.message || String(err) } };
          }
        },
        getPublicUrl(objectPath) {
          return { data: { publicUrl: firebaseStoragePublicUrl(bucketFolder, objectPath) } };
        },
        async createSignedUrl(objectPath, expiresSeconds = 3600, opts = {}) {
          try {
            const signedUrl = await createFirebaseSignedUrl({
              bucketFolder,
              objectPath,
              expiresSeconds,
              downloadName: opts?.download || null,
            });
            return { data: { signedUrl }, error: null };
          } catch (err) {
            return { data: null, error: { message: err?.message || String(err) } };
          }
        },
      };
    },
  };
}

/** Storage client backed by Firebase Admin. */
export function getStorageClient() {
  if (!getAdminBucket()) {
    throw new Error('Firebase storage not configured (FIREBASE_SERVICE_ACCOUNT + storage bucket)');
  }
  return createFirebaseStorageShim();
}

export async function uploadPdfAndGetUrl({
  bucket,
  path,
  buffer,
  contentType = 'application/pdf',
  signedSeconds = 3600,
  downloadName = null,
}) {
  const storage = getStorageClient();
  const { error: uploadErr } = await storage.from(bucket).upload(path, buffer, {
    upsert: true,
    contentType,
    cacheControl: '3600',
  });
  if (uploadErr) throw new Error(uploadErr.message || 'Upload failed');

  let signedUrl = null;
  try {
    const { data: signed, error: signedErr } = await storage
      .from(bucket)
      .createSignedUrl(path, signedSeconds, downloadName ? { download: downloadName } : undefined);
    if (!signedErr) signedUrl = signed?.signedUrl || null;
  } catch {
    // Fall through to public URL.
  }

  const { data: publicData } = storage.from(bucket).getPublicUrl(path);
  return signedUrl || publicData?.publicUrl || firebaseStoragePublicUrl(bucket, path);
}
