function formatWhatsAppError(res, json, label) {
  const detail = json?.error || json?.stage || `HTTP ${res.status}`;
  const detailsError = json?.details?.error;
  const whapiDetail = json?.details?.error?.message
    || json?.details?.message
    || (typeof detailsError === 'string' ? detailsError : null)
    || null;
  const suffix = json?.stage && json?.error && json.stage !== json.error
    ? ` (${json.stage})`
    : '';
  const message = whapiDetail && !String(detail).includes(String(whapiDetail))
    ? `${detail}: ${whapiDetail}${suffix}`
    : `${detail}${suffix}`;
  console.warn(`WhatsApp ${label} request failed: ${message}`, json);
  return { ok: false, error: message };
}

// Dedicated notify routes (match setupProxy + vercel.json rewrites).
const NOTIFY_ROUTE_BY_ACTION = {
  'whatsapp-labels': '/api/whatsapp-labels',
  'whatsapp-sale': '/api/whatsapp-sale',
  'whatsapp-layby': '/api/whatsapp-layby',
  'whatsapp-transfer': '/api/whatsapp-transfer',
  'whatsapp-lusaka-transfer': '/api/whatsapp-lusaka-transfer',
  'monthly-balance-dues': '/api/monthly-balance-dues',
  'monthly-balance-send': '/api/monthly-balance-send',
};

// In dev, WhatsApp notify routes run locally via setupProxy (.env.local Wasender vars).
function notifyApiUrl(action) {
  const apiBase = (process.env.REACT_APP_API_BASE || '').trim().replace(/\/?$/, '');
  let host = '';
  try { host = window?.location?.hostname || ''; } catch {}
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(host);
  const forceApi = String(process.env.REACT_APP_FORCE_API || '').trim() === '1';
  const isWhatsAppRoute = Boolean(NOTIFY_ROUTE_BY_ACTION[action]);
  const path = NOTIFY_ROUTE_BY_ACTION[action]
    || `/api/notify?action=${encodeURIComponent(action)}`;
  const useRemote = Boolean(apiBase && (!isLocalHost || (forceApi && !isWhatsAppRoute)));
  return useRemote ? `${apiBase}${path}` : path;
}

function notifyApiHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const bypass = (process.env.REACT_APP_VERCEL_BYPASS || '').trim();
  let host = '';
  try { host = window?.location?.hostname || ''; } catch {}
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(host);
  if (bypass && !isLocalHost) headers['x-vercel-protection-bypass'] = bypass;
  return headers;
}

export async function sendLaybyWhatsApp(payload) {
  try {
    const res = await fetch(notifyApiUrl('whatsapp-layby'), {
      method: 'POST',
      headers: notifyApiHeaders(),
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
      headers: notifyApiHeaders(),
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
      headers: notifyApiHeaders(),
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
      headers: notifyApiHeaders(),
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

export async function sendLusakaTransferPdfWhatsApp({ pdfUrl, pdfFilename, message, groupId } = {}) {
  try {
    const res = await fetch(notifyApiUrl('whatsapp-lusaka-transfer'), {
      method: 'POST',
      headers: notifyApiHeaders(),
      body: JSON.stringify({
        pdfUrl,
        pdfFilename,
        message,
        groupId,
        action: 'whatsapp-lusaka-transfer',
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      return formatWhatsAppError(res, json, 'lusaka-transfer');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function sendLabelsWhatsApp({ pdfUrl, pdfBase64, pdfFilename, message } = {}) {
  try {
    const res = await fetch(notifyApiUrl('whatsapp-labels'), {
      method: 'POST',
      headers: notifyApiHeaders(),
      body: JSON.stringify({ pdfUrl, pdfBase64, pdfFilename, message, action: 'whatsapp-labels' }),
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

/** Send pre-built monthly balance message(s) to the Layby / monthly balance WhatsApp group. */
export async function sendMonthlyBalanceDueWhatsApp({ messages } = {}) {
  const payload = {
    action: 'monthly-balance-send',
    messages: Array.isArray(messages) ? messages.filter(Boolean) : [],
  };
  if (!payload.messages.length) {
    return { ok: false, error: 'No monthly balance message to send.' };
  }
  try {
    const res = await fetch(notifyApiUrl('monthly-balance-send'), {
      method: 'POST',
      headers: notifyApiHeaders(),
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      return formatWhatsAppError(res, json, 'monthly-balance-send');
    }
    return {
      ok: true,
      messageCount: json.messageCount || payload.messages.length,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
