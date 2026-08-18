async function parseJson(resp) {
  const text = await resp.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function apiUrl(path) {
  const base = String(process.env.REACT_APP_API_BASE || '').trim().replace(/\/+$/, '');
  if (base) return `${base}${path}`;
  return path;
}

async function staffAuthHeaders() {
  const { ensureAuthSession } = await import('../utils/authSession');
  const { firebaseGetAccessToken } = await import('../utils/firebaseAuthApi');
  await ensureAuthSession();
  const token = await firebaseGetAccessToken();
  if (!token) throw new Error('Sign in required');
  return { Authorization: `Bearer ${token}` };
}

export async function fetchShopCatalog({ admin = false } = {}) {
  const url = admin
    ? `${apiUrl('/api/shop-catalog')}?action=admin-catalog`
    : apiUrl('/api/shop-catalog');
  const resp = await fetch(url, { method: 'GET' });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to load shop catalog (${resp.status})`);
  }
  return json;
}

export async function saveShopListing(listing) {
  const auth = await staffAuthHeaders();
  const resp = await fetch(apiUrl('/api/shop-catalog'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ action: 'save-listing', listing }),
  });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to save listing (${resp.status})`);
  }
  return json?.listing;
}

export async function fetchShopAdminCatalog() {
  const auth = await staffAuthHeaders();
  const url = `${apiUrl('/api/shop-catalog')}?action=admin-catalog`;
  const resp = await fetch(url, { method: 'GET', headers: auth });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to load shop admin catalog (${resp.status})`);
  }
  return json;
}

export async function saveShopSettings(settings) {
  const auth = await staffAuthHeaders();
  const resp = await fetch(apiUrl('/api/shop-catalog'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ action: 'save-settings', settings }),
  });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to save shop settings (${resp.status})`);
  }
  return json?.settings;
}

export async function createWebOrder(payload) {
  return initiateShopPayment(payload);
}

export async function initiateShopPayment(payload) {
  const resp = await fetch(apiUrl('/api/web-orders'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'initiate-payment', ...payload }),
  });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to start payment (${resp.status})`);
  }
  return json;
}

export async function fetchShopPaymentStatus(orderId) {
  const id = String(orderId || '').trim();
  const url = `${apiUrl('/api/web-orders')}?action=payment-status&orderId=${encodeURIComponent(id)}`;
  const resp = await fetch(url, { method: 'GET' });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to check payment (${resp.status})`);
  }
  return json;
}

export async function sendCustomerOrderReceipt({ orderId, pdfUrl, pdfFilename } = {}) {
  const resp = await fetch(apiUrl('/api/web-orders'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'send-customer-receipt',
      orderId,
      pdfUrl,
      pdfFilename,
    }),
  });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to email receipt (${resp.status})`);
  }
  return json;
}

export async function listWebOrders({ status = 'pending' } = {}) {
  const auth = await staffAuthHeaders();
  const url = `${apiUrl('/api/web-orders')}?action=list&status=${encodeURIComponent(status)}`;
  const resp = await fetch(url, { method: 'GET', headers: auth });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to load orders (${resp.status})`);
  }
  return json?.orders || [];
}

export async function confirmWebOrder(payload = {}) {
  const auth = await staffAuthHeaders();
  const resp = await fetch(apiUrl('/api/web-orders'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ action: 'confirm', ...payload }),
  });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to confirm order (${resp.status})`);
  }
  return json;
}

export async function cancelWebOrder({ orderId, reason, cancelledBy } = {}) {
  const auth = await staffAuthHeaders();
  const resp = await fetch(apiUrl('/api/web-orders'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ action: 'cancel', orderId, reason, cancelledBy }),
  });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to cancel order (${resp.status})`);
  }
  return json?.order;
}

export async function emailWebOrderReceipt(payload = {}) {
  const auth = await staffAuthHeaders();
  const resp = await fetch(apiUrl('/api/web-orders'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ action: 'email-receipt', ...payload }),
  });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `Failed to email receipt (${resp.status})`);
  }
  return json;
}

export async function notifyShopOrderWhatsApp(order) {
  const resp = await fetch(apiUrl('/api/whatsapp-shop-order'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  const json = await parseJson(resp);
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || json?.raw || `WhatsApp notify failed (${resp.status})`);
  }
  return json;
}
