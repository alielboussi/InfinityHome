import { getDataClient } from '../lib/getDataClient.js';

function getDb() {
  return getDataClient();
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      product_id: String(item?.product_id || item?.productId || '').trim(),
      name: String(item?.name || '').trim(),
      sku: String(item?.sku || '').trim(),
      qty: Number(item?.qty || 0),
    }))
    .filter((item) => item.product_id && Number.isFinite(item.qty) && item.qty > 0);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const {
      fromLocation,
      toLocation,
      userId,
      userEmail,
      userFullName,
      capturedAt,
      transferNumber,
      items,
    } = req.body || {};

    const cleanItems = normalizeItems(items);
    if (!fromLocation || !toLocation || !capturedAt || cleanItems.length === 0) {
      res.status(400).json({ ok: false, error: 'Missing required fields or empty items.' });
      return;
    }

    const totalQty = cleanItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const transferDate = String(capturedAt).slice(0, 10);

    const db = getDb();

    const sessionRow = {
      from_location: fromLocation,
      to_location: toLocation,
      user_id: Number(userId) || null,
      user_uid: null,
      transfer_date: transferDate,
      created_at: capturedAt,
      transfer_datetime: capturedAt,
      delivery_number: transferNumber || null,
      status: 'approved',
      total_qty: totalQty,
      metadata: {
        user_id: Number(userId) || null,
        user_email: userEmail || null,
        source: 'factory_production_mobile',
      },
    };

    const { data: sessionData, error: sessionErr } = await db
      .from('stock_transfer_sessions')
      .insert([sessionRow])
      .select('id,delivery_number')
      .single();
    if (sessionErr || !sessionData?.id) {
      res.status(500).json({ ok: false, error: sessionErr?.message || 'Failed to create transfer session.' });
      return;
    }

    const sessionId = String(sessionData.id);

    const entryRows = cleanItems.map((item) => ({
      session_id: sessionId,
      product_id: item.product_id,
      quantity: Number(item.qty || 0),
    }));
    const { error: entryErr } = await db.from('stock_transfer_entries').insert(entryRows);
    if (entryErr) {
      res.status(500).json({ ok: false, error: entryErr.message || 'Failed to save transfer entries.' });
      return;
    }

    const productIds = Array.from(new Set(cleanItems.map((item) => item.product_id)));
    const { data: inventoryRows, error: invReadErr } = await db
      .from('inventory')
      .select('id,product_id,location,quantity')
      .eq('location', toLocation)
      .in('product_id', productIds);
    if (invReadErr) {
      res.status(500).json({ ok: false, error: invReadErr.message || 'Failed to read inventory.' });
      return;
    }

    const existingMap = new Map();
    (inventoryRows || []).forEach((row) => {
      existingMap.set(String(row.product_id), Number(row.quantity || 0));
    });

    const addMap = new Map();
    cleanItems.forEach((item) => {
      const prev = addMap.get(item.product_id) || 0;
      addMap.set(item.product_id, prev + Number(item.qty || 0));
    });

    const upsertRows = [];
    addMap.forEach((qtyToAdd, productId) => {
      upsertRows.push({
        product_id: productId,
        location: toLocation,
        quantity: (existingMap.get(productId) || 0) + Number(qtyToAdd || 0),
      });
    });

    if (upsertRows.length > 0) {
      const { error: invWriteErr } = await db
        .from('inventory')
        .upsert(upsertRows, { onConflict: 'product_id,location' });
      if (invWriteErr) {
        res.status(500).json({ ok: false, error: invWriteErr.message || 'Failed to update inventory.' });
        return;
      }
    }

    const labelPayload = {
      job_type: 'carpentry_labels',
      transfer_id: sessionId,
      to_location: toLocation,
      print_date: new Date().toLocaleDateString('en-GB').replace(/\//g, '/'),
      printed_by: userFullName || userEmail || 'Factory Production',
      items: cleanItems.map((item) => ({
        name: item.name || item.product_id,
        sku: item.sku || '',
        qty: Number(item.qty || 0),
      })),
    };

    let labelJobId = null;
    const { data: labelData, error: labelErr } = await db
      .from('label_print_jobs')
      .insert([{ payload: labelPayload }])
      .select('id')
      .single();
    if (!labelErr && labelData?.id) {
      labelJobId = String(labelData.id);
    }

    res.status(200).json({
      ok: true,
      sessionId,
      transferNumber: sessionData.delivery_number || transferNumber || null,
      labelJobId,
    });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({ ok: false, error: err?.message || 'Unexpected error' });
  }
}
