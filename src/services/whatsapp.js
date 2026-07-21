function formatWhatsAppError(res, json, label) {
  const detail = json?.error || json?.stage || `HTTP ${res.status}`;
  console.warn(`WhatsApp ${label} request failed: ${detail}`, json);
  return { ok: false, error: detail };
}

// Resolve API base the same way the labels upload does (see PriceLabelMobile /api/labels call).
function notifyApiUrl(action) {
  const apiBase = (process.env.REACT_APP_API_BASE || '').trim().replace(/\/?$/, '');
  let host = '';
  try { host = window?.location?.hostname || ''; } catch {}
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(host);
  const path = `/api/notify?action=${encodeURIComponent(action)}`;
  return (!isLocalHost && apiBase) ? `${apiBase}${path}` : path;
}

export async function sendLaybyWhatsApp(payload) {
  try {
    const res = await fetch(notifyApiUrl('whatsapp-layby'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(payload || {}), action: 'whatsapp-layby' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      return formatWhatsAppError(res, json, 'layby');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function sendAdjustmentWhatsApp(payload) {
  try {
    const res = await fetch(notifyApiUrl('whatsapp-adjustment'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(payload || {}), action: 'whatsapp-adjustment' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      return formatWhatsAppError(res, json, 'adjustment');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function sendSaleWhatsApp(payload) {
  try {
    const res = await fetch(notifyApiUrl('whatsapp-sale'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(payload || {}), action: 'whatsapp-sale' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      return formatWhatsAppError(res, json, 'sale');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function sendTransferWhatsApp(payload) {
  try {
    const res = await fetch(notifyApiUrl('whatsapp-transfer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(payload || {}), action: 'whatsapp-transfer' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      return formatWhatsAppError(res, json, 'transfer');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function sendLabelsWhatsApp({ pdfUrl, pdfFilename, message } = {}) {
  try {
    const res = await fetch(notifyApiUrl('whatsapp-labels'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfUrl, pdfFilename, message, action: 'whatsapp-labels' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      return formatWhatsAppError(res, json, 'labels');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
