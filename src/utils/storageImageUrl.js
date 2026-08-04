const PRODUCT_IMAGE_BUCKET = 'productimages';
const SUPABASE_PUBLIC_PREFIX = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;

export function extractProductImageObjectPath(rawUrl) {
  const pic = String(rawUrl || '').trim();
  if (!pic) return null;
  try {
    const u = new URL(pic, 'http://localhost');
    if (/\.supabase\.co$/i.test(u.hostname) && u.pathname.includes(SUPABASE_PUBLIC_PREFIX)) {
      const idx = u.pathname.indexOf(SUPABASE_PUBLIC_PREFIX);
      const encoded = u.pathname.slice(idx + SUPABASE_PUBLIC_PREFIX.length);
      return decodeURIComponent(encoded);
    }
    const firebaseMatch = u.pathname.match(/\/o\/productimages%2F(.+)$/i);
    if (firebaseMatch) {
      return decodeURIComponent(firebaseMatch[1]);
    }
    if (u.pathname.startsWith(`/${PRODUCT_IMAGE_BUCKET}/`)) {
      return decodeURIComponent(u.pathname.slice(PRODUCT_IMAGE_BUCKET.length + 2));
    }
    return null;
  } catch {
    return null;
  }
}

export function isSupabaseProductImageUrl(rawUrl) {
  const pic = String(rawUrl || '').trim();
  if (!pic) return false;
  try {
    const u = new URL(pic, 'http://localhost');
    return /\.supabase\.co$/i.test(u.hostname) && u.pathname.includes(SUPABASE_PUBLIC_PREFIX);
  } catch {
    return false;
  }
}

export function firebasePublicUrlForObject(bucket, objectPath, bucketName) {
  const storageBucket = String(
    bucketName
    || (typeof process !== 'undefined' && process.env?.REACT_APP_FIREBASE_STORAGE_BUCKET)
    || '',
  ).trim();
  if (!storageBucket || !objectPath) return null;
  const fullPath = `${bucket}/${String(objectPath).replace(/^\/+/, '')}`;
  const encoded = encodeURIComponent(fullPath);
  return `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encoded}?alt=media`;
}

/**
 * Rewrite legacy Supabase storage URLs to Firebase public URLs when possible.
 */
export function rewriteLegacyStorageUrl(rawUrl, options = {}) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return raw;
  if (/firebasestorage\.googleapis\.com/i.test(raw)) return raw;

  const supabaseMatch = raw.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i);
  if (supabaseMatch) {
    const [, bucket, pathPart] = supabaseMatch;
    const firebaseUrl = firebasePublicUrlForObject(bucket, decodeURIComponent(pathPart), options.bucketName);
    if (firebaseUrl) return firebaseUrl;
  }

  return raw;
}

/**
 * Normalize legacy Supabase product image URLs for Firebase mode.
 * Falls back to image-proxy for Supabase hosts when Firebase rewrite is unavailable.
 */
export function rewriteLegacyProductImageUrl(rawUrl, options = {}) {
  const pic = String(rawUrl || '').trim();
  if (!pic) return '';

  const preferFirebase = Boolean(options.preferFirebase);
  const origin = options.origin || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

  if (preferFirebase && isSupabaseProductImageUrl(pic)) {
    const objectPath = extractProductImageObjectPath(pic);
    const firebaseUrl = firebasePublicUrlForObject(PRODUCT_IMAGE_BUCKET, objectPath, options.bucketName);
    if (firebaseUrl) return firebaseUrl;
  }

  try {
    const u = new URL(pic, origin);
    if (/\.supabase\.co$/i.test(u.hostname) && u.pathname.includes(SUPABASE_PUBLIC_PREFIX)) {
      return `/api/image-proxy?u=${encodeURIComponent(u.toString())}`;
    }
    if (/firebasestorage\.googleapis\.com$/i.test(u.hostname) && /\/o\/productimages/i.test(u.pathname)) {
      return pic;
    }
    return pic;
  } catch {
    return pic;
  }
}
