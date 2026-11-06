import { requireBearerUser } from '../lib/verifyBearerUser.js';
import { getDataClient } from '../lib/getDataClient.js';
import { isHassanAwadUser, canManageCatalog } from '../../src/accessControl.js';
import {
  getQuoteProductionRouting,
  sendQuoteToProduction,
  upsertQuoteProductionRoute,
} from '../lib/quoteProductionRouting.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function canManageQuoteProduction(user) {
  if (!user?.email) return false;
  if (isHassanAwadUser(user)) return true;
  if (canManageCatalog(user)) return true;
  return false;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const user = await requireBearerUser(req);
    if (!canManageQuoteProduction(user)) {
      res.status(403).json({ ok: false, error: 'Not allowed' });
      return;
    }

    const body = req.method === 'GET' ? req.query : (req.body || {});
    const op = String(body.op || body.action || 'get-routing').trim().toLowerCase();
    const db = getDataClient();
    const quoteId = body.quote_id || body.quoteId;

    if (op === 'get-routing') {
      if (!quoteId) {
        res.status(400).json({ ok: false, error: 'quote_id required' });
        return;
      }
      const routing = await getQuoteProductionRouting(db, quoteId);
      res.status(200).json({ ok: true, routing });
      return;
    }

    if (op === 'set-routing') {
      if (!quoteId) {
        res.status(400).json({ ok: false, error: 'quote_id required' });
        return;
      }
      const route = body.route || body.production_route || body.productionRoute;
      await upsertQuoteProductionRoute(db, quoteId, route, { metadata: body.metadata || {} });
      const routing = await getQuoteProductionRouting(db, quoteId);
      res.status(200).json({ ok: true, routing });
      return;
    }

    if (op === 'send-to-production') {
      if (!quoteId) {
        res.status(400).json({ ok: false, error: 'quote_id required' });
        return;
      }
      const result = await sendQuoteToProduction(db, quoteId, user.id);
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'translate-arabic') {
      const { translateStringsToArabicServer } = await import('../lib/quoteArabicTranslate.js');
      const texts = Array.isArray(body.texts) ? body.texts : [];
      const translations = await translateStringsToArabicServer(texts);
      res.status(200).json({ ok: true, translations });
      return;
    }

    if (op === 'list-routings') {
      const rawIds = body.quote_ids || body.quoteIds || '';
      const ids = (Array.isArray(rawIds) ? rawIds : String(rawIds).split(','))
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .slice(0, 250);
      if (!ids.length) {
        res.status(200).json({ ok: true, routings: [] });
        return;
      }
      const { data: routings, error: rErr } = await db
        .from('quote_production_routing')
        .select('quote_id, route, sent_to_production_at, accepted_at, completed_at, metadata')
        .in('quote_id', ids);
      if (rErr) throw new Error(rErr.message || 'Failed to load quote routings');
      res.status(200).json({ ok: true, routings: routings || [] });
      return;
    }

    res.status(400).json({ ok: false, error: `Unknown op: ${op}` });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ ok: false, error: err.message || 'quote-production failed' });
  }
}
