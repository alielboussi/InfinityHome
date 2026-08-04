// Unified Serverless API: checkout
// Performs sale header insert (rejects duplicate receipt numbers), batch insert of sales_items, and payments insert.

import {
  finalizeFirestoreCheckout,
  isDuplicateReceiptCheckoutError,
} from '../server/lib/firestoreCheckout.js';

export default async function handler(req, res) {
  const sendError = (status, stage, err) => {
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(status).json(payload);
  };

  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).end();
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Origin', '*');
      sendError(405, 'method', new Error('Method Not Allowed'));
      return;
    }

    const body = req.body || {};

    try {
      const result = await finalizeFirestoreCheckout(body);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json(result);
    } catch (err) {
      if (isDuplicateReceiptCheckoutError(err)) {
        sendError(err.status || 409, 'receipt', err);
        return;
      }
      sendError(err.status || 500, 'firestore_checkout', err);
    }
  } catch (e) {
    sendError(500, 'unhandled', e);
  }
}
