// Unified Serverless API: transfer
// - POST action=upload-pdf: upload transfer PDF to Supabase Storage (service role)
// - POST action=send-email: email notifications disabled (returns skipped)
// - GET action=env-check: environment diagnostics

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'WarehouseTransfers';

export default async function handler(req, res) {
  try {
    // CORS/preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).end();
      return;
    }

    if (req.method === 'GET') {
      const action = (req.query?.action || req.query?.a || '').toString();
      if (action !== 'env-check') {
        res.setHeader('Allow', 'GET (action=env-check), POST (action=upload-pdf|send-email), OPTIONS');
        res.status(405).json({ ok: false, error: 'Method Not Allowed' });
        return;
      }
      const env = process.env || {};
      const report = {
        SUPABASE_URL: env.SUPABASE_URL ? 'OK' : (env.REACT_APP_SUPABASE_URL ? 'OK (from client var)' : 'MISSING'),
        SUPABASE_SERVICE_ROLE: env.SUPABASE_SERVICE_ROLE ? 'OK' : 'MISSING',
        REACT_APP_SUPABASE_URL: env.REACT_APP_SUPABASE_URL ? 'OK' : 'MISSING',
        REACT_APP_SUPABASE_ANON_KEY: env.REACT_APP_SUPABASE_ANON_KEY ? 'OK' : 'MISSING',
        EMAIL_NOTIFICATIONS: 'DISABLED'
      };
      const missing = Object.entries(report).filter(([,v])=>String(v).startsWith('MISSING')).map(([k])=>k);
      const context = { VERCEL_ENV: env.VERCEL_ENV || null, VERCEL_URL: env.VERCEL_URL || null, REGION: env.VERCEL_REGION || env.AWS_REGION || null };
      const payload = { ok: missing.length === 0, report, missing, context, time: new Date().toISOString() };
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json(payload);
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    const action = (req.body?.action || req.query?.action || req.body?.a || '').toString();
    if (!action) { res.status(400).json({ ok:false, error:'Missing action' }); return; }

    if (action === 'upload-pdf') {
      const { sessionId, fileName, pdfBase64 } = req.body || {};
      if (!sessionId || !fileName || !pdfBase64) { res.status(400).json({ ok:false, error:'Missing fields' }); return; }
      const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
      if (!url || !serviceKey) {
        const missing = [];
        if (!process.env.SUPABASE_URL && !process.env.REACT_APP_SUPABASE_URL) missing.push('SUPABASE_URL (or REACT_APP_SUPABASE_URL)');
        if (!process.env.SUPABASE_SERVICE_ROLE) missing.push('SUPABASE_SERVICE_ROLE');
        const present = { SUPABASE_URL: !!process.env.SUPABASE_URL, REACT_APP_SUPABASE_URL: !!process.env.REACT_APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE: !!process.env.SUPABASE_SERVICE_ROLE };
        res.status(500).json({ ok:false, error:'Supabase server env not configured', missing, present });
        return;
      }
      const supabase = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });
      try {
        const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
        if (listErr) throw listErr;
        const exists = Array.isArray(buckets) && buckets.some(b => b.name === BUCKET);
        if (!exists) {
          await supabase.storage.createBucket(BUCKET, { public: true });
        }
      } catch (e) {
        // proceed; upload may still work if bucket exists
      }
      const base64Data = String(pdfBase64).replace(/^data:application\/pdf;base64,/, '').trim();
      const buffer = Buffer.from(base64Data, 'base64');
      const path = `${sessionId}/${fileName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, { upsert: true, contentType: 'application/pdf' });
      if (upErr) { res.status(500).json({ ok:false, error: upErr.message || String(upErr), code: upErr.name || upErr.code }); return; }
      let publicUrl = null; try { const { data } = supabase.storage.from(BUCKET).getPublicUrl(path); publicUrl = data?.publicUrl || null; } catch {}
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json({ ok:true, path, publicUrl });
      return;
    }

    if (action === 'send-email') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json({ ok:true, skipped: true, message: 'Email notifications are disabled.' });
      return;
    }

    res.status(400).json({ ok:false, error:'Unknown action' });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message || String(e) });
  }
}
