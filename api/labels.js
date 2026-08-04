import { getDataClient } from '../server/lib/getDataClient.js';
import { getStorageClient } from '../server/lib/firebaseStorage.js';

const BUCKET = 'labels';

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

function assertWorkerAuth(req) {
  const secret = String(process.env.LABEL_WORKER_SECRET || '').trim();
  if (!secret) {
    const err = new Error('LABEL_WORKER_SECRET not configured on server');
    err.status = 503;
    throw err;
  }
  const header = req.headers?.['x-label-worker-secret'] || req.headers?.['X-Label-Worker-Secret'];
  if (String(header || '').trim() !== secret) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

async function handleWorkerPending(req, res, db) {
  assertWorkerAuth(req);
  const limit = Math.min(20, toSafeLimit(req.query?.limit, 10));
  const { data, error } = await db
    .from('label_print_jobs')
    .select('id,status,payload,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    res.status(500).json({ ok: false, error: error.message || String(error) });
    return;
  }
  res.status(200).json({ ok: true, jobs: Array.isArray(data) ? data : [] });
}

async function handleWorkerUpdate(req, res, db) {
  assertWorkerAuth(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const jobId = String(body.id || '').trim();
  const status = String(body.status || '').trim();
  if (!jobId || !status) {
    res.status(400).json({ ok: false, error: 'Missing id or status' });
    return;
  }
  const patch = { status };
  if (body.error !== undefined) patch.error = body.error;
  const { error } = await db
    .from('label_print_jobs')
    .update(patch)
    .eq('id', jobId);
  if (error) {
    res.status(500).json({ ok: false, error: error.message || String(error) });
    return;
  }
  res.status(200).json({ ok: true, id: jobId, status });
}

async function handleCreateLabelJob(req, res, db) {
  const payload = req.body?.payload;
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ ok: false, error: 'Missing payload object' });
    return;
  }

  const { data, error } = await db
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

async function handleLabelHistory(req, res, db) {
  const id = readQueryValue(req.query?.id).trim();
  const transferId = readQueryValue(req.query?.transferId).trim();
  const limit = toSafeLimit(req.query?.limit, 120);

  let query = db
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

async function handleUploadLabelPdf(req, res) {
  const { fileName, pdfBase64, folder = 'mobile', signedSeconds = 3600 } = req.body || {};
  if (!fileName || !pdfBase64) {
    res.status(400).json({ ok: false, error: 'Missing fileName or pdfBase64' });
    return;
  }

  const cleanBase64 = String(pdfBase64).replace(/^data:application\/pdf;base64,/i, '').replace(/\s+/g, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  const folderPrefix = String(folder || 'mobile').replace(/\/+$/, '');
  const path = `${folderPrefix}/${fileName}`;

  const storage = getStorageClient();
  const { error: uploadErr } = await storage.from(BUCKET).upload(path, buffer, {
    upsert: true,
    contentType: 'application/pdf',
    cacheControl: '3600',
  });
  if (uploadErr) {
    res.status(500).json({ ok: false, error: uploadErr.message || String(uploadErr) });
    return;
  }

  let signedUrl = null;
  try {
    const { data: signed, error: signedErr } = await storage
      .from(BUCKET)
      .createSignedUrl(path, Number(signedSeconds) || 3600, { download: fileName });
    if (!signedErr) signedUrl = signed?.signedUrl || null;
  } catch {}

  let publicUrl = null;
  try {
    const { data: publicData } = storage.from(BUCKET).getPublicUrl(path);
    publicUrl = publicData?.publicUrl || null;
  } catch {}

  res.status(200).json({ ok: true, path, signedUrl, publicUrl });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vercel-protection-bypass, x-label-worker-secret');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const db = getDataClient();
    const action = resolveAction(req);

    if (req.method === 'GET') {
      if (action === 'worker-pending') {
        await handleWorkerPending(req, res, db);
        return;
      }
      if (action && action !== 'history') {
        res.status(400).json({ ok: false, error: 'Unknown action' });
        return;
      }
      await handleLabelHistory(req, res, db);
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    if (action === 'worker-update') {
      await handleWorkerUpdate(req, res, db);
      return;
    }

    if (action && action !== 'upload' && action !== 'job') {
      res.status(400).json({ ok: false, error: 'Unknown action' });
      return;
    }

    if (action === 'job') {
      await handleCreateLabelJob(req, res, db);
      return;
    }

    await handleUploadLabelPdf(req, res);
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({ ok: false, error: err.message || 'Unexpected error', details: err.details || null });
  }
}
