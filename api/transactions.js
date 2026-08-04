// Consolidated payments and layby serverless API
// Legacy routes are preserved via vercel.json rewrites.

import { handleFirestoreTransactionAction } from '../server/lib/firestoreTransactions.js';

const ACTION_METHOD = {
  payments: 'POST',
  'payments-list': 'POST',
  'payments-delete': 'POST',
  'layby-statement': 'POST',
  'layby-payments-delete': 'POST',
  'layby-delete-customer': 'POST',
  'quote-convert-layby': 'POST',
};

const ACTION_ALIAS = {
  create: 'payments',
  list: 'payments-list',
  delete: 'payments-delete',
};

function setCors(res, methods = 'POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');
}

function getAction(req) {
  const raw = (req.query?.action || req.query?.a || req.body?.action || req.body?.a || '').toString().trim().toLowerCase();
  if (!raw) return 'payments';
  return ACTION_ALIAS[raw] || raw;
}

function sendDetailedError(res, status, stage, err) {
  const payload = {
    ok: false,
    stage,
    error: err?.message || String(err || 'Unknown error'),
    code: err?.code || null,
    details: err?.details || null,
    hint: err?.hint || null,
  };
  if (!payload.code) delete payload.code;
  if (!payload.details) delete payload.details;
  if (!payload.hint) delete payload.hint;
  setCors(res, 'POST, OPTIONS');
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  const action = getAction(req);
  const method = ACTION_METHOD[action];

  setCors(res, method ? `${method}, OPTIONS` : 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!method) {
    res.status(400).json({ ok: false, error: 'Unknown action' });
    return;
  }

  if (req.method !== method) {
    res.setHeader('Allow', `${method}, OPTIONS`);
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    if (action === 'quote-convert-layby') {
      const mod = await import('../server/handlers/quote-convert-layby.js');
      await mod.default(req, res);
      return;
    }

    const result = await handleFirestoreTransactionAction(action, req);
    if (!result) {
      res.status(400).json({ ok: false, error: 'Unknown action' });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    if (action === 'payments-delete' || action === 'layby-payments-delete') {
      sendDetailedError(res, 500, 'unknown', err);
      return;
    }
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
