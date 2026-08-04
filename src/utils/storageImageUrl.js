const PRODUCT_IMAGE_BUCKET = 'productimages';
const LEGACY_PUBLIC_PREFIX = '/storage/v1/object/public/';

function resolveBucketName(options = {}) {
  return String(
    options.bucketName
    || (typeof process !== 'undefined' && process.env?.REACT_APP_FIREBASE_STORAGE_BUCKET)
    || '',
  ).trim();
}

/**
 * Extract the Firebase object path from a stored URL or bare path.
 * Handles Firebase public URLs, legacy Postgres storage URL shapes, and plain keys.
 */
export function extractStorageObjectPath(rawUrl, bucket = PRODUCT_IMAGE_BUCKET) {
  const pic = String(rawUrl || '').trim();
  if (!pic) return null;

  if (!/^https?:\/\//i.test(pic) && !pic.includes(LEGACY_PUBLIC_PREFIX)) {
    const bare = pic.replace(/^\/+/, '');
    if (bare.startsWith(`${bucket}/`)) return bare.slice(bucket.length + 1);
    return bare || null;
  }

  try {
    const u = new URL(pic, 'http://localhost');

    if (/firebasestorage\.googleapis\.com$/i.test(u.hostname)) {
      const firebaseMatch = u.pathname.match(/\/o\/(.+)$/i);
      if (firebaseMatch) {
        const decoded = decodeURIComponent(firebaseMatch[1]);
        if (decoded.startsWith(`${bucket}/`)) return decoded.slice(bucket.length + 1);
        return decoded;
      }
    }

    const legacyPrefix = `${LEGACY_PUBLIC_PREFIX}${bucket}/`;
    const legacyIdx = u.pathname.indexOf(legacyPrefix);
    if (legacyIdx >= 0) {
      return decodeURIComponent(u.pathname.slice(legacyIdx + legacyPrefix.length));
    }

    if (u.pathname.startsWith(`/${bucket}/`)) {
      return decodeURIComponent(u.pathname.slice(bucket.length + 2));
    }

    const genericLegacy = pic.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i);
    if (genericLegacy && String(genericLegacy[1]) === bucket) {
      return decodeURIComponent(genericLegacy[2]);
    }

    return null;
  } catch {
    return null;
  }
}

export function extractProductImageObjectPath(rawUrl) {
  return extractStorageObjectPath(rawUrl, PRODUCT_IMAGE_BUCKET);
}

export function firebasePublicUrlForObject(bucketFolder, objectPath, bucketName) {
  const storageBucket = resolveBucketName({ bucketName });
  if (!storageBucket || !objectPath) return null;
  const fullPath = `${bucketFolder}/${String(objectPath).replace(/^\/+/, '')}`;
  const encoded = encodeURIComponent(fullPath);
  return `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encoded}?alt=media`;
}

/**
 * Rewrite a stored storage URL or object key to a Firebase Storage public URL.
 */
export function rewriteLegacyStorageUrl(rawUrl, options = {}) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return raw;
  if (/firebasestorage\.googleapis\.com/i.test(raw)) return raw;

  const bucket = String(options.bucket || '').trim();
  const legacyMatch = raw.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i);
  if (legacyMatch) {
    const [, legacyBucket, pathPart] = legacyMatch;
    const firebaseUrl = firebasePublicUrlForObject(
      legacyBucket,
      decodeURIComponent(pathPart),
      options.bucketName,
    );
    if (firebaseUrl) return firebaseUrl;
  }

  const targetBucket = bucket || PRODUCT_IMAGE_BUCKET;
  const objectPath = extractStorageObjectPath(raw, targetBucket);
  if (objectPath) {
    const firebaseUrl = firebasePublicUrlForObject(targetBucket, objectPath, options.bucketName);
    if (firebaseUrl) return firebaseUrl;
  }

  return raw;
}

/** Normalize product image URLs to Firebase Storage public URLs. */
export function rewriteLegacyProductImageUrl(rawUrl, options = {}) {
  return rewriteLegacyStorageUrl(rawUrl, { ...options, bucket: PRODUCT_IMAGE_BUCKET });
}
