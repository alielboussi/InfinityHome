import { createClient } from '@supabase/supabase-js';

const BUCKET = 'labels';

function getSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceKey) {
    const missing = [];
    if (!url) missing.push('SUPABASE_URL (or REACT_APP_SUPABASE_URL)');
    if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE');
    const error = new Error('Supabase service environment variables missing');
    error.status = 500;
    error.details = { missing };
    throw error;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

function resolveAction(req) {
  const action = String(req.query?.action || req.query?.a || req.body?.action || req.body?.a || '')
    .trim()
    .toLowerCase();
  if (!action) return '';
  return action;
}

function readQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] || '');
  if (value === undefined || value === null) return '';
  return String(value);
}

function toSafeLimit(raw, fallback = 120) {
  const parsed = Number.parseInt(String(raw || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(500, Math.max(1, parsed));
}

async function handleCreateLabelJob(req, res, supabase) {
  const payload = req.body?.payload;
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ ok: false, error: 'Missing payload object' });
    return;
  }

  const { data, error } = await supabase
    .from('label_print_jobs')
    .insert([{ payload }])
    .select('id,status,created_at')
    .single();

  if (error) {
    res.status(500).json({ ok: false, error: error.message || String(error) });
    return;
  }

  res.status(200).json({ ok: true, job: data });
}

async function handleLabelHistory(req, res, supabase) {
  const id = readQueryValue(req.query?.id).trim();
  const transferId = readQueryValue(req.query?.transferId).trim();
  const limit = toSafeLimit(req.query?.limit, 120);

  let query = supabase
    .from('label_print_jobs')
    .select('id,status,error,payload,created_at')
    .order('created_at', { ascending: false })
    .limit(id ? 1 : limit);

  if (id) {
    query = query.eq('id', id);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ ok: false, error: error.message || String(error) });
    return;
  }

  let rows = Array.isArray(data) ? data : [];
  if (transferId) {
    rows = rows.filter((row) => String(row?.payload?.transfer_id || '') === transferId);
  }

  res.status(200).json({ ok: true, jobs: rows });
}

async function handleUploadLabelPdf(req, res, supabase) {
  const { fileName, pdfBase64, folder = 'mobile', signedSeconds = 3600 } = req.body || {};
  if (!fileName || !pdfBase64) {
    res.status(400).json({ ok: false, error: 'Missing fileName or pdfBase64' });
    return;
  }

  try {
    const { data: bucket } = await supabase.storage.getBucket(BUCKET);
    if (!bucket) {
      await supabase.storage.createBucket(BUCKET, { public: false });
    }
  } catch (err) {
    if (err?.message?.toLowerCase().includes('not found')) {
      await supabase.storage.createBucket(BUCKET, { public: false });
    }
  }

  const cleanBase64 = String(pdfBase64).replace(/^data:application\/pdf;base64,/i, '').replace(/\s+/g, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  const folderPrefix = String(folder || 'mobile').replace(/\/+$/, '');
  const path = `${folderPrefix}/${fileName}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { upsert: true, contentType: 'application/pdf', cacheControl: '3600' });
  if (uploadErr) {
    res.status(500).json({ ok: false, error: uploadErr.message || String(uploadErr) });
    return;
  }

  let signedUrl = null;
  try {
    const { data: signed, error: signedErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, Number(signedSeconds) || 3600, { download: fileName });
    if (!signedErr) signedUrl = signed?.signedUrl || null;
  } catch {}

  let publicUrl = null;
  try {
    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    publicUrl = publicData?.publicUrl || null;
  } catch {}

  res.status(200).json({ ok: true, path, signedUrl, publicUrl });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const supabase = getSupabaseServiceClient();
    const action = resolveAction(req);

    if (req.method === 'GET') {
      if (action && action !== 'history') {
        res.status(400).json({ ok: false, error: 'Unknown action' });
        return;
      }
      await handleLabelHistory(req, res, supabase);
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    if (action && action !== 'upload' && action !== 'job') {
      res.status(400).json({ ok: false, error: 'Unknown action' });
      return;
    }

    if (action === 'job') {
      await handleCreateLabelJob(req, res, supabase);
      return;
    }

    await handleUploadLabelPdf(req, res, supabase);
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({ ok: false, error: err.message || 'Unexpected error', details: err.details || null });
  }
}
