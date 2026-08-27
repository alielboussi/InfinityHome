import { getFirestore } from '../lib/firestoreDb.js';
import { requireBearerUser } from '../lib/verifyBearerUser.js';
import {
  computeVectorFromBase64,
  computeVectorFromUrl,
  extractStoredVector,
  getActiveEmbeddingMethod,
  getActiveEmbeddingVersion,
  hasValidStoredVector,
  pauseBetweenEmbeds,
  scoreVectors,
} from '../lib/imageEmbedding.js';

const COLLECTION = 'product_image_embeddings';

function embeddingDocId(entityType, entityId) {
  return `${entityType}_${entityId}`;
}

async function loadCatalogImageRows(db) {
  const [productsSnap, combosSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('combos').get(),
  ]);

  const rows = [];
  productsSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const imageUrl = String(data.image_url || '').trim();
    if (!imageUrl) return;
    rows.push({
      entityType: 'product',
      entityId: String(doc.id),
      imageUrl,
      name: String(data.name || '').trim(),
      sku: String(data.sku || '').trim(),
    });
  });

  combosSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const imageUrl = String(data.picture_url || '').trim();
    if (!imageUrl) return;
    rows.push({
      entityType: 'combo',
      entityId: String(doc.id),
      imageUrl,
      name: String(data.combo_name || '').trim(),
      sku: String(data.sku || '').trim(),
    });
  });

  return rows;
}

async function saveEmbedding(db, row, vectorResult) {
  const docId = embeddingDocId(row.entityType, row.entityId);
  const payload = {
    entity_type: row.entityType,
    entity_id: row.entityId,
    image_url: row.imageUrl,
    name: row.name || '',
    sku: row.sku || '',
    embedding_model: vectorResult.model,
    search_method: vectorResult.method,
    updated_at: new Date().toISOString(),
  };

  if (vectorResult.method === 'gemini') {
    payload.embedding = vectorResult.values;
    payload.fingerprint = null;
  } else {
    payload.fingerprint = vectorResult.values;
    payload.embedding = null;
  }

  await db.collection(COLLECTION).doc(docId).set(payload, { merge: true });
}

async function embedCatalogRow(db, row, { force = false } = {}) {
  const docId = embeddingDocId(row.entityType, row.entityId);
  const existing = await db.collection(COLLECTION).doc(docId).get();
  if (!force && existing.exists) {
    const savedUrl = String(existing.data()?.image_url || '').trim();
    if (savedUrl === row.imageUrl && hasValidStoredVector(existing.data())) {
      return { skipped: true, docId };
    }
  }
  const vectorResult = await computeVectorFromUrl(row.imageUrl);
  await saveEmbedding(db, row, vectorResult);
  return { skipped: false, docId, method: vectorResult.method };
}

async function handleBackfill(req, res, db) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const limit = Math.min(60, Math.max(1, Number(body.limit) || 25));
  const force = Boolean(body.force);
  const rows = await loadCatalogImageRows(db);
  const pending = [];

  for (const row of rows) {
    const docId = embeddingDocId(row.entityType, row.entityId);
    if (!force) {
      const existing = await db.collection(COLLECTION).doc(docId).get();
      if (existing.exists) {
        const savedUrl = String(existing.data()?.image_url || '').trim();
        if (savedUrl === row.imageUrl && hasValidStoredVector(existing.data())) continue;
      }
    }
    pending.push(row);
  }

  const batch = pending.slice(0, limit);
  let embedded = 0;
  let failed = 0;
  const errors = [];
  const method = getActiveEmbeddingMethod();

  for (const row of batch) {
    try {
      const result = await embedCatalogRow(db, row, { force: true });
      if (!result.skipped) {
        embedded += 1;
        await pauseBetweenEmbeds(result.method, 1);
      }
    } catch (err) {
      failed += 1;
      errors.push({ entityId: row.entityId, error: err?.message || 'embed failed' });
    }
  }

  res.status(200).json({
    ok: true,
    searchMethod: method,
    embeddingModel: getActiveEmbeddingVersion(),
    totalWithImages: rows.length,
    pending: pending.length,
    processed: batch.length,
    embedded,
    failed,
    remaining: Math.max(0, pending.length - batch.length),
    errors: errors.slice(0, 5),
  });
}

async function handleEmbedOne(req, res, db) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const entityType = String(body.entityType || body.entity_type || 'product').trim();
  const entityId = String(body.entityId || body.entity_id || '').trim();
  const imageUrl = String(body.imageUrl || body.image_url || '').trim();
  if (!entityId || !imageUrl) {
    res.status(400).json({ ok: false, error: 'entityId and imageUrl are required.' });
    return;
  }

  const vectorResult = await computeVectorFromUrl(imageUrl);
  await saveEmbedding(db, {
    entityType,
    entityId,
    imageUrl,
    name: String(body.name || '').trim(),
    sku: String(body.sku || '').trim(),
  }, vectorResult);

  res.status(200).json({
    ok: true,
    entityType,
    entityId,
    searchMethod: vectorResult.method,
    embeddingModel: vectorResult.model,
  });
}

async function handleSearch(req, res, db) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const imageBase64 = String(body.imageBase64 || body.image_base64 || '').trim();
  if (!imageBase64) {
    res.status(400).json({ ok: false, error: 'imageBase64 is required.' });
    return;
  }

  const queryVector = await computeVectorFromBase64(imageBase64);
  const snap = await db.collection(COLLECTION).get();
  const matches = [];

  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const storedVector = extractStoredVector(data);
    if (!Array.isArray(storedVector) || !storedVector.length) return;
    if (!hasValidStoredVector(data)) return;
    const score = scoreVectors(queryVector.values, storedVector);
    if (score <= 0) return;
    matches.push({
      entityType: data.entity_type || 'product',
      entityId: String(data.entity_id || ''),
      name: data.name || '',
      sku: data.sku || '',
      imageUrl: data.image_url || '',
      score,
      __isCombo: data.entity_type === 'combo',
    });
  });

  matches.sort((a, b) => b.score - a.score);

  res.status(200).json({
    ok: true,
    searchMethod: queryVector.method,
    embeddingModel: queryVector.model,
    matches: matches.slice(0, 12).map((row) => ({
      ...row,
      score: Number(row.score.toFixed(4)),
    })),
    indexedCount: snap.size,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    await requireBearerUser(req);
    const db = getFirestore();
    if (!db) {
      res.status(500).json({ ok: false, error: 'Firestore unavailable.' });
      return;
    }

    const action = String(req.query?.action || req.body?.action || 'search').trim().toLowerCase();
    if (action === 'backfill') {
      await handleBackfill(req, res, db);
      return;
    }
    if (action === 'embed') {
      await handleEmbedOne(req, res, db);
      return;
    }
    if (action === 'search') {
      await handleSearch(req, res, db);
      return;
    }

    res.status(400).json({
      ok: false,
      error: 'Unknown action. Use search, backfill, or embed.',
    });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({
      ok: false,
      error: err?.message || 'Product image search failed.',
      code: err?.code || null,
    });
  }
}
