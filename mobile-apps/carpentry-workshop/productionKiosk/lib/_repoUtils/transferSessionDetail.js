import db from '../dataClient';

export async function loadTransferSessionDetail(sessionId) {
  const { data: session, error: sessErr } = await db
    .from('stock_transfer_sessions')
    .select('id, delivery_number, transfer_datetime, created_at, from_location, to_location, total_qty, status, pdf_url')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessErr) throw sessErr;
  if (!session) throw new Error('Transfer not found.');

  const { data: entries, error: entErr } = await db
    .from('stock_transfer_entries')
    .select('product_id, quantity')
    .eq('session_id', sessionId);
  if (entErr) throw entErr;

  const productIds = [...new Set((entries || []).map((e) => e.product_id).filter(Boolean))];
  const productMap = new Map();
  if (productIds.length) {
    const { data: products, error: prodErr } = await db
      .from('products')
      .select('id, name, sku')
      .in('id', productIds);
    if (prodErr) throw prodErr;
    (products || []).forEach((p) => productMap.set(String(p.id), p));
  }

  const locIds = [session.from_location, session.to_location].filter(Boolean);
  const locMap = new Map();
  if (locIds.length) {
    const { data: locs, error: locErr } = await db
      .from('locations')
      .select('id, name')
      .in('id', locIds);
    if (locErr) throw locErr;
    (locs || []).forEach((l) => locMap.set(String(l.id), l.name || l.id));
  }

  const fromName = locMap.get(String(session.from_location)) || 'From';
  const toName = locMap.get(String(session.to_location)) || 'To';
  const routeLabel = `${fromName} → ${toName}`;

  const lines = (entries || []).map((e) => {
    const p = productMap.get(String(e.product_id)) || {};
    return {
      sku: p.sku || '',
      name: p.name || String(e.product_id),
      qty: Number(e.quantity || 0),
      routeLabel,
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));

  const totalQty = lines.reduce((sum, row) => sum + Number(row.qty || 0), 0);

  return {
    session,
    fromName,
    toName,
    routeLabel,
    lines,
    totalQty,
  };
}
