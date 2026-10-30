function notifyBaseUrl() {
  const raw = String(
    process.env.INFINITY_PUBLIC_URL
    || process.env.REACT_APP_API_BASE
    || process.env.VERCEL_URL
    || 'https://www.infinity-home.online',
  ).trim().replace(/\/+$/, '');
  if (!raw) return 'https://www.infinity-home.online';
  return raw.startsWith('http') ? raw : `https://${raw}`;
}

async function sendWarehouseDeliveryWhatsAppHttp(message) {
  const url = `${notifyBaseUrl()}/api/notify?action=whatsapp-warehouse-delivery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, action: 'whatsapp-warehouse-delivery' }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('[warehouse-delivery-whatsapp] HTTP', res.status, body.slice(0, 300));
    return { ok: false, status: res.status };
  }
  const payload = await res.json().catch(() => ({}));
  return { ok: true, ...payload };
}

/**
 * Wasender group alert for Factory→Kitwe delivery submit (non-throwing).
 */
export async function sendWarehouseDeliveryWhatsApp(message) {
  const text = String(message || '').trim();
  if (!text) return { ok: false, skipped: true, reason: 'empty_message' };

  try {
    const { deliverWarehouseDeliveryGroupMessage } = await import('../../api/notify.js');
    const payload = await deliverWarehouseDeliveryGroupMessage({ message: text });
    return { ok: true, ...payload };
  } catch (err) {
    console.warn('[warehouse-delivery-whatsapp] inline notify failed, trying HTTP:', err?.message || err);
    try {
      return await sendWarehouseDeliveryWhatsAppHttp(text);
    } catch (httpErr) {
      console.warn('[warehouse-delivery-whatsapp]', httpErr?.message || httpErr);
      return { ok: false, error: String(httpErr?.message || httpErr) };
    }
  }
}
