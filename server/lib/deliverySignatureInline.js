/** Inline Firebase/public signature URLs for mobile PDF reprint (data URI). */
export async function fetchDeliverySignatureAsDataUri(signatureUrl) {
  const url = String(signatureUrl || '').trim();
  if (!url) return '';
  if (url.startsWith('data:image/')) return url;
  if (!url.startsWith('http')) return '';
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const contentType = String(res.headers.get('content-type') || 'image/png').split(';')[0].trim()
      || 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return '';
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}
