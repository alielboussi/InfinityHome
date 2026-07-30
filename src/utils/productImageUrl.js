/** Rewrite Supabase product image URLs through the app image proxy when needed. */
export function resolveProductImageUrl(rawUrl) {
  const pic = String(rawUrl || '').trim();
  if (!pic) return '';
  try {
    const u = new URL(pic, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (/\.supabase\.co$/i.test(u.hostname) && /\/storage\/v1\/object\/public\/productimages\//i.test(u.pathname)) {
      return `/api/image-proxy?u=${encodeURIComponent(u.toString())}`;
    }
    return pic;
  } catch {
    return pic;
  }
}
