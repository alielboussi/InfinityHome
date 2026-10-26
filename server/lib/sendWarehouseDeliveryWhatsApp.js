function notifyBaseUrl() {
  const raw = String(
    process.env.INFINITY_PUBLIC_URL
    || process.env.REACT_APP_API_BASE
    || 'https://www.infinity-home.online',
  ).trim();
  return raw.replace(/\/+$/, '');
}

/**
 * Posts plain text to Wasender via notify (non-throwing).
 */
export async function sendWarehouseDeliveryWhatsApp(message) {
  const text = String(message || '').trim();
  if (!text) return { ok: false, skipped: true, reason: 'empty_message' };

  const url = `${notifyBaseUrl()}/api/whatsapp-warehouse-delivery`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[warehouse-delivery-whatsapp] HTTP', res.status, body.slice(0, 300));
      return { ok: false, status: res.status };
    }
    const payload = await res.json().catch(() => ({}));
    return { ok: true, ...payload };
  } catch (err) {
    console.warn('[warehouse-delivery-whatsapp]', err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}
