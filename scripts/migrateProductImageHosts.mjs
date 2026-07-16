#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const NEW_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OLD_HOST = process.env.OLD_SUPABASE_HOST || 'khcxxblhblgwcrqsordo.supabase.co';
const BUCKET = 'productimages';
const APPLY = process.argv.includes('--apply');
const CONCURRENCY = Math.max(1, Number(process.env.MIGRATE_CONCURRENCY || 6));

if (!NEW_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL/REACT_APP_SUPABASE_URL or SUPABASE_SERVICE_ROLE.');
  process.exit(1);
}

const STORAGE_PREFIX = `/storage/v1/object/public/${BUCKET}/`;
const FETCH_TIMEOUT_MS = 30000;

async function fetchWithTimeout(target, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(target, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const client = createClient(NEW_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'public' },
  global: { fetch: fetchWithTimeout },
});

function getObjectPathFromUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''));
    if (u.hostname !== OLD_HOST) return null;
    if (!u.pathname.startsWith(STORAGE_PREFIX)) return null;
    const encoded = u.pathname.slice(STORAGE_PREFIX.length);
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function guessContentType(pathname) {
  const p = String(pathname || '').toLowerCase();
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

async function loadRows() {
  const { data, error } = await client
    .from('product_images')
    .select('id, product_id, image_url')
    .limit(10000);

  if (error) throw new Error(`Failed to read product_images: ${error.message}`);
  const rows = data || [];
  return rows
    .map((row) => ({ ...row, objectPath: getObjectPathFromUrl(row.image_url) }))
    .filter((row) => Boolean(row.objectPath));
}

async function processRow(row) {
  const sourceUrl = row.image_url;
  const objectPath = row.objectPath;

  let upstream = await fetchWithTimeout(sourceUrl);
  if (!upstream.ok && upstream.status === 400) {
    // Some legacy rows contain unescaped characters; retry with a normalized URL.
    upstream = await fetchWithTimeout(encodeURI(sourceUrl));
  }
  if (!upstream.ok) {
    throw new Error(`Fetch failed (${upstream.status})`);
  }

  const contentType = upstream.headers.get('content-type') || guessContentType(objectPath);
  const bytes = Buffer.from(await upstream.arrayBuffer());

  const { error: uploadErr } = await client.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: true });

  if (uploadErr) {
    throw new Error(`Upload failed: ${uploadErr.message}`);
  }

  const { data: publicData } = client.storage.from(BUCKET).getPublicUrl(objectPath);
  const newUrl = publicData?.publicUrl;
  if (!newUrl) throw new Error('Could not create public URL');

  const { error: imgErr } = await client
    .from('product_images')
    .update({ image_url: newUrl })
    .eq('id', row.id);

  if (imgErr) {
    throw new Error(`product_images update failed: ${imgErr.message}`);
  }

  const { error: prodErr } = await client
    .from('products')
    .update({ image_url: newUrl })
    .eq('id', row.product_id);

  if (prodErr) {
    throw new Error(`products update failed: ${prodErr.message}`);
  }
}

async function main() {
  const rows = await loadRows();
  console.log(JSON.stringify({ oldHost: OLD_HOST, candidates: rows.length, apply: APPLY, concurrency: CONCURRENCY }, null, 2));

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to migrate URLs.');
    return;
  }

  let ok = 0;
  let failed = 0;
  let failedLogged = 0;
  let done = 0;
  const queue = rows.map((row, idx) => ({ row, idx }));

  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const { row, idx } = next;
      try {
        await processRow(row);
        ok += 1;
      } catch (err) {
        failed += 1;
        if (failedLogged < 20) {
          console.error(`Failed (${idx + 1}/${rows.length}) id=${row.id}: ${err.message || err}`);
          failedLogged += 1;
        }
      }
      done += 1;
      if (done % 25 === 0 || done === rows.length) {
        console.log(`Progress: ${done}/${rows.length} ok=${ok} failed=${failed}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(JSON.stringify({ total: rows.length, ok, failed }, null, 2));
  if (failed > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
