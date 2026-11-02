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

async function sendWarehouseDeliveryWhatsAppHttp(body) {
  const url = `${notifyBaseUrl()}/api/notify?action=whatsapp-warehouse-delivery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, action: 'whatsapp-warehouse-delivery' }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('[warehouse-delivery-whatsapp] HTTP', res.status, body.slice(0, 300));
    return { ok: false, status: res.status };
  }
  const payload = await res.json().catch(() => ({}));
  return { ok: true, ...payload };
}

function normalizeWarehouseDeliveryWhatsAppBody(payload) {
  if (typeof payload === 'string') {
    return { message: String(payload || '').trim() };
  }
  const message = String(payload?.message || '').trim();
  const pdfUrl = String(payload?.pdfUrl || '').trim();
  const pdfBase64 = String(payload?.pdfBase64 || payload?.pdf_base64 || '')
    .replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '')
    .replace(/\s+/g, '');
  const pdfFilename = String(payload?.pdfFilename || payload?.pdf_filename || 'Delivery_Note.pdf').trim()
    || 'Delivery_Note.pdf';
  return { message, pdfUrl, pdfBase64, pdfFilename };
}

/**
 * Wasender group alert for Factory→Kitwe delivery submit (non-throwing).
 */
export async function sendWarehouseDeliveryWhatsApp(payload) {
  const body = normalizeWarehouseDeliveryWhatsAppBody(payload);
  if (!body.message && !body.pdfUrl && !body.pdfBase64) {
    return { ok: false, skipped: true, reason: 'empty_message' };
  }

  try {
    const { deliverWarehouseDeliveryGroupMessage } = await import('../../api/notify.js');
    const result = await deliverWarehouseDeliveryGroupMessage(body);
    return { ok: true, ...result };
  } catch (err) {
    console.warn('[warehouse-delivery-whatsapp] inline notify failed, trying HTTP:', err?.message || err);
    try {
      return await sendWarehouseDeliveryWhatsAppHttp(body);
    } catch (httpErr) {
      console.warn('[warehouse-delivery-whatsapp]', httpErr?.message || httpErr);
      return { ok: false, error: String(httpErr?.message || httpErr) };
    }
  }
}
