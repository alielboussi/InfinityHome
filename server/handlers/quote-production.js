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

    if (op === 'deliver-factory-order' || op === 'factory-order-deliver') {
      const pdfFilename = String(body.pdfFilename || body.pdf_filename || 'Factory_Order.pdf').trim()
        || 'Factory_Order.pdf';
      let pdfUrl = String(body.pdfUrl || body.pdf_url || '').trim();
      const pdfBase64 = String(body.pdfBase64 || body.pdf_base64 || '')
        .replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '')
        .replace(/\s+/g, '');
      const hasPdf = Boolean(pdfUrl || pdfBase64);
      const quoteIdForWa = String(body.quote_id || body.quoteId || '').trim();

      if (hasPdf) {
        if (!quoteIdForWa) {
          res.status(400).json({ ok: false, error: 'quote_id is required when sending a factory order PDF to WhatsApp.' });
          return;
        }
        const { assertQuoteArabicReadyForFactoryPdfWhatsApp } = await import('../lib/quoteFactoryOrderArabicGate.js');
        await assertQuoteArabicReadyForFactoryPdfWhatsApp(db, quoteIdForWa);
      }

      if (!pdfUrl && pdfBase64) {
        const { uploadPdfAndGetUrl } = await import('../lib/firebaseStorage.js');
        const safeName = pdfFilename.replace(/[^\w.-]+/g, '_') || 'Factory_Order.pdf';
        const objectPath = `factory-orders/${Date.now()}_${safeName}`;
        const buffer = Buffer.from(pdfBase64, 'base64');
        pdfUrl = await uploadPdfAndGetUrl({
          bucket: 'labels',
          path: objectPath,
          buffer,
          downloadName: safeName,
        });
      }

      const illustrationImageUrl = String(
        body.illustrationImageUrl || body.illustration_image_url || body.drawing_url || '',
      ).trim();
      let resolvedIllustration = illustrationImageUrl;
      if (!resolvedIllustration && body.quote_id) {
        const routing = await getQuoteProductionRouting(db, body.quote_id);
        const meta = routing?.metadata && typeof routing.metadata === 'object' ? routing.metadata : {};
        resolvedIllustration = String(meta.drawing_url || '').trim();
      }
      const { deliverFactoryOrderGroupMessage } = await import('../../api/notify.js');
      const result = await deliverFactoryOrderGroupMessage({
        message: body.message,
        pdfUrl,
        pdfBase64: pdfUrl ? '' : pdfBase64,
        pdfFilename,
        quote_id: quoteIdForWa || undefined,
        route: body.route || body.production_route || body.productionRoute,
        illustrationImageUrl: resolvedIllustration,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (op === 'translate-arabic') {
      const { translateStringsToArabicServer } = await import('../lib/quoteArabicTranslate.js');
      const texts = Array.isArray(body.texts) ? body.texts : [];
      const translations = await translateStringsToArabicServer(texts, { sb: db, maxGeminiRounds: 3 });
      res.status(200).json({ ok: true, translations });
      return;
    }

    if (op === 'suggest-aluminum-accessories') {
      const productName = String(body.product_name || body.productName || body.name || '').trim();
      const { suggestAluminumAccessoriesForProduct } = await import('../lib/quoteAluminumAccessoriesSuggest.js');
      const accessories = await suggestAluminumAccessoriesForProduct(productName);
      res.status(200).json({ ok: true, accessories });
      return;
    }

    if (op === 'quote-line-image-upload') {
      const quoteId = String(body.quote_id || body.quoteId || 'draft').trim();
      const itemId = String(body.item_id || body.itemId || 'line').trim();
      const raw = String(body.image_base64 || body.imageBase64 || '').trim();
      if (!raw) {
        res.status(400).json({ ok: false, error: 'image_base64 required' });
        return;
      }
      const dataUrl = raw.match(/^data:(image\/[\w+.-]+);base64,(.+)$/i);
      const buffer = dataUrl
        ? Buffer.from(dataUrl[2], 'base64')
        : Buffer.from(raw.replace(/\s+/g, ''), 'base64');
      const contentType = dataUrl ? dataUrl[1] : 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : (contentType.includes('webp') ? 'webp' : 'jpg');
      const { uploadQuoteLineImageBuffer } = await import('../lib/quoteLineImageStorage.js');
      const line_image_url = await uploadQuoteLineImageBuffer({
        quoteId,
        itemId,
        buffer,
        contentType,
        ext,
      });
      res.status(200).json({ ok: true, line_image_url });
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
