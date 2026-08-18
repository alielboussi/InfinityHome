function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function normalizeZambiaMsisdn(raw) {
  const digits = digitsOnly(raw);
  if (!digits) return '';
  if (digits.startsWith('260') && digits.length >= 12) return digits;
  if (digits.startsWith('0') && digits.length >= 10) return `260${digits.slice(1)}`;
  if (digits.length === 9) return `260${digits}`;
  return digits;
}

function isMockMode() {
  return String(process.env.MOBILE_MONEY_MOCK || '').trim() === '1'
    || String(process.env.MOBILE_MONEY_MOCK || '').trim().toLowerCase() === 'true';
}

function mtnConfigured() {
  return Boolean(
    process.env.MTN_MOMO_SUBSCRIPTION_KEY
    && process.env.MTN_MOMO_API_USER
    && process.env.MTN_MOMO_API_KEY,
  );
}

function mtnApiCurrency(value) {
  const norm = String(value || process.env.MTN_MOMO_CURRENCY || 'K').trim().toUpperCase();
  if (norm === 'K' || norm === 'ZMW' || norm === 'KWACHA' || norm === 'ZMK') return 'ZMW';
  return norm || 'ZMW';
}

function airtelConfigured() {
  return Boolean(
    process.env.AIRTEL_MONEY_CLIENT_ID
    && process.env.AIRTEL_MONEY_CLIENT_SECRET,
  );
}

async function mtnGetToken() {
  const base = String(process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com').replace(/\/+$/, '');
  const auth = Buffer.from(`${process.env.MTN_MOMO_API_USER}:${process.env.MTN_MOMO_API_KEY}`).toString('base64');
  const resp = await fetch(`${base}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Ocp-Apim-Subscription-Key': process.env.MTN_MOMO_SUBSCRIPTION_KEY,
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.access_token) {
    throw new Error(json?.message || `MTN token request failed (${resp.status})`);
  }
  return json.access_token;
}

async function mtnRequestToPay({ referenceId, phone, amount, currency, externalId, note }) {
  const base = String(process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com').replace(/\/+$/, '');
  const token = await mtnGetToken();
  const callbackHost = String(process.env.MTN_MOMO_CALLBACK_HOST || process.env.VERCEL_URL || '').replace(/\/+$/, '');
  const callbackUrl = callbackHost
    ? `${callbackHost.startsWith('http') ? callbackHost : `https://${callbackHost}`}/api/web-orders?action=payment-callback&provider=mtn`
    : undefined;

  const resp = await fetch(`${base}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': referenceId,
      'X-Target-Environment': process.env.MTN_MOMO_TARGET_ENV || 'sandbox',
      'Ocp-Apim-Subscription-Key': process.env.MTN_MOMO_SUBSCRIPTION_KEY,
      'Content-Type': 'application/json',
      ...(callbackUrl ? { 'X-Callback-Url': callbackUrl } : {}),
    },
    body: JSON.stringify({
      amount: String(Math.round(Number(amount))),
      currency: mtnApiCurrency(currency),
      externalId: String(externalId),
      payer: {
        partyIdType: 'MSISDN',
        partyId: phone,
      },
      payerMessage: note || 'Infinity Home order',
      payeeNote: note || 'Infinity Home order',
    }),
  });

  if (resp.status !== 202 && !resp.ok) {
    const json = await resp.json().catch(() => ({}));
    throw new Error(json?.message || `MTN requestToPay failed (${resp.status})`);
  }

  return { referenceId, provider: 'mtn', status: 'pending' };
}

async function mtnPaymentStatus(referenceId) {
  const base = String(process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com').replace(/\/+$/, '');
  const token = await mtnGetToken();
  const resp = await fetch(`${base}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': process.env.MTN_MOMO_TARGET_ENV || 'sandbox',
      'Ocp-Apim-Subscription-Key': process.env.MTN_MOMO_SUBSCRIPTION_KEY,
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.message || `MTN status check failed (${resp.status})`);
  }
  return {
    referenceId,
    provider: 'mtn',
    status: String(json?.status || 'PENDING').toUpperCase(),
    financialTransactionId: json?.financialTransactionId || null,
    reason: json?.reason || null,
  };
}

async function airtelRequestToPay({ referenceId, phone, amount, currency, externalId }) {
  const base = String(process.env.AIRTEL_MONEY_BASE_URL || 'https://openapi.airtel.africa').replace(/\/+$/, '');
  const clientId = process.env.AIRTEL_MONEY_CLIENT_ID;
  const clientSecret = process.env.AIRTEL_MONEY_CLIENT_SECRET;

  const tokenResp = await fetch(`${base}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const tokenJson = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok || !tokenJson?.access_token) {
    throw new Error(tokenJson?.message || `Airtel token request failed (${tokenResp.status})`);
  }

  const country = process.env.AIRTEL_MONEY_COUNTRY || 'ZM';
  const resp = await fetch(`${base}/merchant/v1/payments/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      'Content-Type': 'application/json',
      'X-Country': country,
      'X-Currency': currency || process.env.AIRTEL_MONEY_CURRENCY || 'ZMW',
    },
    body: JSON.stringify({
      reference: referenceId,
      subscriber: {
        country,
        currency: currency || process.env.AIRTEL_MONEY_CURRENCY || 'ZMW',
        msisdn: phone,
      },
      transaction: {
        amount: Math.round(Number(amount)),
        country,
        currency: currency || process.env.AIRTEL_MONEY_CURRENCY || 'ZMW',
        id: String(externalId),
      },
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.message || json?.status?.message || `Airtel payment request failed (${resp.status})`);
  }

  return {
    referenceId,
    provider: 'airtel',
    status: String(json?.data?.transaction?.status || json?.status?.message || 'pending').toLowerCase(),
  };
}

async function airtelPaymentStatus(referenceId) {
  const base = String(process.env.AIRTEL_MONEY_BASE_URL || 'https://openapi.airtel.africa').replace(/\/+$/, '');
  const clientId = process.env.AIRTEL_MONEY_CLIENT_ID;
  const clientSecret = process.env.AIRTEL_MONEY_CLIENT_SECRET;

  const tokenResp = await fetch(`${base}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const tokenJson = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok || !tokenJson?.access_token) {
    throw new Error(tokenJson?.message || `Airtel token request failed (${tokenResp.status})`);
  }

  const country = process.env.AIRTEL_MONEY_COUNTRY || 'ZM';
  const resp = await fetch(`${base}/standard/v1/payments/${encodeURIComponent(referenceId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      'X-Country': country,
      'X-Currency': process.env.AIRTEL_MONEY_CURRENCY || 'ZMW',
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.message || `Airtel status check failed (${resp.status})`);
  }

  const status = String(json?.data?.transaction?.status || json?.status?.message || 'PENDING').toUpperCase();
  return {
    referenceId,
    provider: 'airtel',
    status,
    financialTransactionId: json?.data?.transaction?.airtel_money_id || null,
    reason: json?.status?.message || null,
  };
}

function mockRequestToPay({ referenceId, provider }) {
  return {
    referenceId,
    provider,
    status: 'pending',
    mock: true,
  };
}

function mockPaymentStatus(referenceId, provider) {
  return {
    referenceId,
    provider,
    status: 'SUCCESSFUL',
    financialTransactionId: `MOCK-${referenceId.slice(0, 8)}`,
    mock: true,
  };
}

export function paymentStatusIsSuccessful(status) {
  const norm = String(status || '').trim().toUpperCase();
  return norm === 'SUCCESSFUL' || norm === 'SUCCESS' || norm === 'COMPLETED' || norm === 'TS';
}

export function paymentStatusIsFailed(status) {
  const norm = String(status || '').trim().toUpperCase();
  return norm === 'FAILED' || norm === 'REJECTED' || norm === 'CANCELLED' || norm === 'EXPIRED' || norm === 'TF';
}

export async function requestMobileMoneyPayment({
  provider,
  phone,
  amount,
  currency = 'ZMW',
  referenceId,
  externalId,
  note,
}) {
  const normProvider = String(provider || '').trim().toLowerCase();
  const msisdn = normalizeZambiaMsisdn(phone);
  if (!msisdn) throw new Error('Valid mobile money phone number is required');
  if (!(Number(amount) > 0)) throw new Error('Payment amount must be greater than zero');
  if (!referenceId) throw new Error('Payment reference is required');

  if (isMockMode()) {
    return mockRequestToPay({ referenceId, provider: normProvider || 'mtn' });
  }

  if (normProvider === 'mtn') {
    if (!mtnConfigured()) throw new Error('MTN MoMo is not configured on the server');
    return mtnRequestToPay({ referenceId, phone: msisdn, amount, currency, externalId, note });
  }

  if (normProvider === 'airtel') {
    if (!airtelConfigured()) throw new Error('Airtel Money is not configured on the server');
    return airtelRequestToPay({ referenceId, phone: msisdn, amount, currency, externalId });
  }

  throw new Error('Choose MTN or Airtel for payment');
}

export async function fetchMobileMoneyPaymentStatus({ provider, referenceId }) {
  const normProvider = String(provider || '').trim().toLowerCase();
  if (!referenceId) throw new Error('Payment reference is required');

  if (isMockMode()) {
    return mockPaymentStatus(referenceId, normProvider || 'mtn');
  }

  if (normProvider === 'mtn') {
    if (!mtnConfigured()) throw new Error('MTN MoMo is not configured on the server');
    return mtnPaymentStatus(referenceId);
  }

  if (normProvider === 'airtel') {
    if (!airtelConfigured()) throw new Error('Airtel Money is not configured on the server');
    return airtelPaymentStatus(referenceId);
  }

  throw new Error('Unknown payment provider');
}
