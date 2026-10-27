function notifyBaseUrl() {
  const raw = String(
    process.env.INFINITY_PUBLIC_URL
    || process.env.REACT_APP_API_BASE
    || 'https://www.infinity-home.online',
  ).trim();
  return raw.replace(/\/+$/, '');
}

/**
 * Warehouse Production app alerts (Wasender via notify).
 */
export async function sendWarehouseProductionWhatsApp(payload = {}) {
  const url = `${notifyBaseUrl()}/api/whatsapp-production`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[warehouse-production-whatsapp] HTTP', res.status, body.slice(0, 300));
      return { ok: false, status: res.status };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, ...data };
  } catch (err) {
    console.warn('[warehouse-production-whatsapp]', err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}
