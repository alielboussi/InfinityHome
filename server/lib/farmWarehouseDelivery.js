import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { resolveFarmWarehouse1Location } from '../../src/constants/farmWarehouseLocations.js';
import { buildFarmReturnSendCatalogRows, buildFarmSendCatalogRows } from '../../src/utils/farmWarehouseCatalogView.js';
import { readWarehouseFloor2WipImageUrl } from '../../src/utils/warehouseFloor2WipImage.js';
import { allocateFarmDeliveryNumber } from './warehouseFarmDeliveryNumber.js';
import { allocateFarmReturnNumber, parseFarmReturnSequence } from './warehouseFarmReturnNumber.js';
import { adjustAssemblyStock, getAssemblyStockQty } from './warehouseReturnStock.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import { newUuid } from './uuid.js';
import { ensureFarmWarehouseLocation } from './ensureFarmWarehouseLocation.js';

export async function resolveFarmWarehouseIds(sb) {
  const { data: locRows, error } = await sb.from('locations').select('id, name');
  if (error) throw new Error(error.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  let farmLoc = resolveFarmWarehouse1Location(locRows || []);
  if (!floor2Loc?.id) throw new Error('Warehouse Floor 2 location is not configured.');
  if (!farmLoc?.id) {
    const created = await ensureFarmWarehouseLocation(sb);
    farmLoc = { id: created.id, name: created.name };
  }
  return { floor2Id: String(floor2Loc.id), farmId: String(farmLoc.id) };
}

export async function creditFarmStockFromDeliveryEntries(sb, entries, farmId) {
  const credited = new Map();
  for (const line of entries || []) {
    const meta = line.metadata || {};
    const aid = String(meta.assembly_id || '').trim();
    const units = Math.max(0, Number(meta.units ?? line.quantity) || 0);
    if (!aid || units < 1) continue;
    credited.set(aid, Math.max(credited.get(aid) || 0, units));
  }
  for (const [aid, units] of credited) {
    await adjustAssemblyStock(sb, aid, farmId, units);
  }
  if (credited.size) {
    await recomputeWarehouseLocationStockServer(sb, farmId);
  }
}

export async function fetchCatalogForFarmDelivery(sb) {
  const { fetchCatalogForMobile } = await import('./warehouseCatalogMobile.js');
  const { attachWarehouseStockTotals } = await import('../../src/utils/warehouseCatalogStock.js');
  const { floor2Id } = await resolveFarmWarehouseIds(sb);
  const base = await fetchCatalogForMobile(sb, { packetLoad: 'all', includeColors: true });
  const [{ data: pktInv, error: pErr }, { data: asmInv, error: aErr }] = await Promise.all([
    sb.from('warehouse_packet_inventory').select('packet_id, quantity, location_id').eq('location_id', floor2Id),
    sb.from('warehouse_assembly_inventory').select('assembly_id, quantity, location_id').eq('location_id', floor2Id),
  ]);
  if (pErr) throw new Error(pErr.message || 'Failed to load Floor 2 packet stock');
  if (aErr) throw new Error(aErr.message || 'Failed to load Floor 2 assembly stock');

  const eligible = buildFarmSendCatalogRows(base.assemblies || [], asmInv || [], floor2Id);
  const eligibleIds = new Set(eligible.map((r) => String(r.assembly_id || r.id)));

  const bound = attachWarehouseStockTotals({
    ...base,
    inventory: pktInv || [],
    assemblyInventory: asmInv || [],
    warehouseLocationId: floor2Id,
    warehouseLocationName: 'Warehouse Floor 2',
    floor2LocationId: floor2Id,
    catalog_meta: {
      ...(base.catalog_meta || {}),
      packet_load: 'all',
      farm_delivery_catalog: true,
    },
  });

  return {
    ...bound,
    assemblies: (bound.assemblies || []).filter((a) => eligibleIds.has(String(a.id))),
    farm_delivery_floor2_id: floor2Id,
  };
}

export async function farmSendCatalog(sb) {
  const { floor2Id } = await resolveFarmWarehouseIds(sb);
  const [{ data: assemblies, error: aErr }, { data: invRows, error: invErr }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, family_sku, item_kind, metadata, category_id, image_url'),
    sb.from('warehouse_assembly_inventory').select('assembly_id, quantity, location_id').eq('location_id', floor2Id),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load catalog');
  if (invErr) throw new Error(invErr.message || 'Failed to load Floor 2 stock');
  const products = buildFarmSendCatalogRows(assemblies || [], invRows || [], floor2Id).map((row) => ({
    ...row,
    image_url: row.floor2_image_url,
  }));
  return { products, floor2_location_id: floor2Id };
}

export async function openFarmDeliverySession(sb, user, email) {
  const { floor2Id, farmId } = await resolveFarmWarehouseIds(sb);
  if (email) {
    const { data: existing } = await sb
      .from('warehouse_delivery_sessions')
      .select('id, delivery_number')
      .eq('status', 'draft')
      .eq('from_location', floor2Id)
      .eq('to_location', farmId)
      .eq('created_by_email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      return { session_id: existing.id, delivery_number: existing.delivery_number, reused: true };
    }
  }
  const deliveryNumber = await allocateFarmDeliveryNumber();
  const now = new Date().toISOString();
  const sessionId = newUuid();
  const row = {
    id: sessionId,
    delivery_number: deliveryNumber,
    from_location: floor2Id,
    to_location: farmId,
    status: 'draft',
    created_at: now,
    transfer_datetime: now,
    total_qty: 0,
    created_by_email: email || user?.email || null,
    created_by_name: user?.user_metadata?.full_name || user?.full_name || null,
    metadata: {
      document_kind: 'farm_delivery',
      delivery_flow: 'farm',
      hassan_alert_pending: false,
    },
  };
  const { error } = await sb.from('warehouse_delivery_sessions').insert(row);
  if (error) throw new Error(error.message || 'Failed to open farm delivery session');
  return { session_id: sessionId, delivery_number: deliveryNumber, reused: false };
}

/**
 * Finished-product lines from Floor 2 → Farm (driver + signature; no customer fields).
 */
/**
 * Legacy simple-line submit (finished qty only). Prefer `groups` via warehouse-mobile delivery-submit parity.
 */
export async function submitFarmDeliverySimple(sb, body, user) {
  const sessionId = String(body.session_id || body.sessionId || '').trim();
  if (!sessionId) throw new Error('session_id is required.');
  const driverName = String(body.driver_name || body.driverName || '').trim();
  if (!driverName) throw new Error('Driver name is required.');
  const signatureUrl = String(body.signature_url || body.signatureUrl || '').trim();
  const signatureBase64 = String(body.signature_png_base64 || body.signaturePngBase64 || '').trim();
  if (!signatureUrl && !signatureBase64) throw new Error('Driver signature is required.');

  const { floor2Id, farmId } = await resolveFarmWarehouseIds(sb);
  const { data: session, error: sErr } = await sb
    .from('warehouse_delivery_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message || 'Failed to load session');
  if (!session) throw new Error('Delivery session not found.');
  if (String(session.status) !== 'draft') throw new Error('This delivery was already submitted.');
  if (String(session.from_location) !== floor2Id || String(session.to_location) !== farmId) {
    throw new Error('Not a Farm Warehouse delivery session.');
  }

  const rawLines = Array.isArray(body.lines) ? body.lines : Array.isArray(body.cart) ? body.cart : [];
  const lines = rawLines
    .map((line) => ({
      assembly_id: String(line.assembly_id || line.assemblyId || '').trim(),
      quantity: Math.max(0, Math.floor(Number(line.quantity ?? line.qty) || 0)),
      name: String(line.name || '').trim(),
      sku: String(line.family_sku || line.sku || '').trim(),
    }))
    .filter((l) => l.assembly_id && l.quantity > 0);
  if (!lines.length) throw new Error('Add at least one product to the cart.');

  for (const line of lines) {
    const have = await getAssemblyStockQty(sb, line.assembly_id, floor2Id);
    if (have < line.quantity) {
      throw new Error(`Insufficient Floor 2 stock for ${line.name || line.assembly_id} (need ${line.quantity}, have ${have}).`);
    }
  }

  const now = new Date().toISOString();
  const entries = [];
  let totalQty = 0;
  const printGroups = [];

  for (const line of lines) {
    await adjustAssemblyStock(sb, line.assembly_id, floor2Id, -line.quantity);
    await adjustAssemblyStock(sb, line.assembly_id, farmId, line.quantity);
    totalQty += line.quantity;
    const entryId = newUuid();
    entries.push({
      id: entryId,
      session_id: sessionId,
      kind: 'finished',
      name: line.name || line.assembly_id,
      sku: line.sku || '',
      quantity: line.quantity,
      metadata: {
        assembly_id: line.assembly_id,
        finished_unit: true,
        units: line.quantity,
        driver_checked: true,
        driver_checked_at: now,
        received_at: now,
        stock_deduct_location_id: floor2Id,
        stock_credit_location_id: farmId,
      },
    });
    printGroups.push({
      assembly_name: line.name || line.assembly_id,
      units: line.quantity,
      lines: [],
    });
  }

  await Promise.all([
    recomputeWarehouseLocationStockServer(sb, floor2Id),
    recomputeWarehouseLocationStockServer(sb, farmId),
  ]);

  const { error: entErr } = await sb.from('warehouse_delivery_entries').insert(entries);
  if (entErr) throw new Error(entErr.message || 'Failed to save delivery lines');

  let resolvedSignatureUrl = signatureUrl;
  if (!resolvedSignatureUrl && signatureBase64) {
    const { uploadBufferToFirebaseStorage, firebaseStoragePublicUrl } = await import('./firebaseStorage.js');
    const buffer = Buffer.from(signatureBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const objectPath = `warehouse-delivery-signatures/farm-${sessionId}-${Date.now()}.png`;
    await uploadBufferToFirebaseStorage({
      bucketFolder: 'warehouse-delivery-signatures',
      objectPath,
      buffer,
      contentType: 'image/png',
    });
    resolvedSignatureUrl = firebaseStoragePublicUrl('warehouse-delivery-signatures', objectPath) || '';
  }

  const dispatchedBy = String(body.dispatched_by_name || body.dispatchedByName || user?.user_metadata?.full_name || user?.full_name || '').trim();
  const metadata = {
    ...(session.metadata || {}),
    document_kind: 'farm_delivery',
    driver_name: driverName,
    driver_signature_url: resolvedSignatureUrl,
    dispatched_by_name: dispatchedBy,
    print_groups: printGroups,
    submitted_at: now,
  };

  const { error: updErr } = await sb
    .from('warehouse_delivery_sessions')
    .update({
      status: 'submitted',
      submitted_at: now,
      transfer_datetime: now,
      total_qty: totalQty,
      metadata,
    })
    .eq('id', sessionId);
  if (updErr) throw new Error(updErr.message || 'Failed to submit farm delivery');

  return {
    session_id: sessionId,
    delivery_number: session.delivery_number,
    total_qty: totalQty,
    print_groups: printGroups,
    driver_name: driverName,
    dispatched_by_name: dispatchedBy,
    driver_signature_url: resolvedSignatureUrl,
    submitted_at: now,
    document_kind: 'farm_delivery',
  };
}

export async function catalogFarmList(sb) {
  const { floor2Id, farmId } = await resolveFarmWarehouseIds(sb);
  const [{ data: assemblies, error: aErr }, { data: invRows, error: invErr }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, family_sku, item_kind, metadata, category_id, image_url'),
    sb.from('warehouse_assembly_inventory').select('assembly_id, quantity, location_id')
      .in('location_id', [floor2Id, farmId]),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load catalog');
  if (invErr) throw new Error(invErr.message || 'Failed to load stock');

  const { buildFarmWarehouseCandidates } = await import('../../src/utils/farmWarehouseCatalogView.js');
  const floor2Inv = (invRows || []).filter((r) => String(r.location_id) === floor2Id);
  const farmInv = (invRows || []).filter((r) => String(r.location_id) === farmId);
  const asmById = new Map((assemblies || []).map((row) => [String(row.id), row]));
  const candidates = buildFarmWarehouseCandidates(assemblies, floor2Inv, farmInv, floor2Id, farmId);
  const products = candidates.map((row) => {
    const aid = String(row.assembly_id || row.id);
    const asm = asmById.get(aid);
    const wipImage = readWarehouseFloor2WipImageUrl(asm || row);
    return {
      id: aid,
      assembly_id: aid,
      name: row.name,
      family_sku: row.family_sku,
      quantity: row.farm_qty,
      farm_qty: row.farm_qty,
      floor2_qty: row.floor2_qty,
      floor2_image_url: wipImage,
      image_url: wipImage,
    };
  });
  return { products, farm_location_id: farmId, floor2_location_id: floor2Id };
}

export async function farmReturnCatalog(sb) {
  const { floor2Id, farmId } = await resolveFarmWarehouseIds(sb);
  const [{ data: assemblies, error: aErr }, { data: invRows, error: invErr }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, family_sku, item_kind, metadata, category_id, image_url'),
    sb.from('warehouse_assembly_inventory').select('assembly_id, quantity, location_id')
      .in('location_id', [floor2Id, farmId]),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load catalog');
  if (invErr) throw new Error(invErr.message || 'Failed to load stock');
  const floor2Inv = (invRows || []).filter((r) => String(r.location_id) === floor2Id);
  const farmInv = (invRows || []).filter((r) => String(r.location_id) === farmId);
  const products = buildFarmReturnSendCatalogRows(
    assemblies || [],
    floor2Inv,
    farmInv,
    floor2Id,
    farmId,
  ).map((row) => ({
    assembly_id: row.assembly_id || row.id,
    name: row.name,
    family_sku: row.family_sku,
    farm_qty: row.farm_qty,
    floor2_qty: row.floor2_qty,
    floor2_image_url: row.floor2_image_url,
  }));
  return { products, farm_location_id: farmId, floor2_location_id: floor2Id };
}

export async function openFarmReturnSession(sb, user, email) {
  const { floor2Id, farmId } = await resolveFarmWarehouseIds(sb);
  if (email) {
    const { data: existing } = await sb
      .from('warehouse_delivery_sessions')
      .select('id, delivery_number')
      .eq('status', 'draft')
      .eq('from_location', farmId)
      .eq('to_location', floor2Id)
      .eq('created_by_email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      const currentRef = String(existing.delivery_number || '').trim();
      if (!parseFarmReturnSequence(currentRef)) {
        const transferRef = await allocateFarmReturnNumber();
        const now = new Date().toISOString();
        await sb.from('warehouse_delivery_sessions').update({
          delivery_number: transferRef,
          updated_at: now,
        }).eq('id', existing.id);
        return { session_id: existing.id, transfer_ref: transferRef, reused: true, migrated_ref: true };
      }
      return { session_id: existing.id, transfer_ref: currentRef, reused: true };
    }
  }
  const transferRef = await allocateFarmReturnNumber();
  const now = new Date().toISOString();
  const sessionId = newUuid();
  const row = {
    id: sessionId,
    delivery_number: transferRef,
    from_location: farmId,
    to_location: floor2Id,
    status: 'draft',
    created_at: now,
    transfer_datetime: now,
    total_qty: 0,
    created_by_email: email || user?.email || null,
    created_by_name: user?.user_metadata?.full_name || user?.full_name || null,
    metadata: {
      document_kind: 'farm_return',
      delivery_flow: 'farm_return',
      skip_print: true,
    },
  };
  const { error } = await sb.from('warehouse_delivery_sessions').insert(row);
  if (error) throw new Error(error.message || 'Failed to open farm return session');
  return { session_id: sessionId, transfer_ref: transferRef, reused: false };
}

/**
 * Farm → Floor 2 finished lines (driver + signature; WhatsApp share only — no A4 print).
 */
export async function submitFarmReturnDelivery(sb, body, user) {
  const sessionId = String(body.session_id || body.sessionId || '').trim();
  if (!sessionId) throw new Error('session_id is required.');
  const driverName = String(body.driver_name || body.driverName || '').trim();
  if (!driverName) throw new Error('Driver name is required.');
  const signatureUrl = String(body.signature_url || body.signatureUrl || '').trim();
  const signatureBase64 = String(body.signature_png_base64 || body.signaturePngBase64 || '').trim();
  if (!signatureUrl && !signatureBase64) throw new Error('Driver signature is required.');

  const { floor2Id, farmId } = await resolveFarmWarehouseIds(sb);
  const { data: session, error: sErr } = await sb
    .from('warehouse_delivery_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message || 'Failed to load session');
  if (!session) throw new Error('Transfer session not found.');
  if (String(session.status) !== 'draft') throw new Error('This transfer was already submitted.');
  if (String(session.from_location) !== farmId || String(session.to_location) !== floor2Id) {
    throw new Error('Not a Farm → Warehouse transfer session.');
  }

  const rawLines = Array.isArray(body.lines) ? body.lines : Array.isArray(body.cart) ? body.cart : [];
  const lines = rawLines
    .map((line) => ({
      assembly_id: String(line.assembly_id || line.assemblyId || '').trim(),
      quantity: Math.max(0, Math.floor(Number(line.quantity ?? line.qty) || 0)),
      name: String(line.name || '').trim(),
      sku: String(line.family_sku || line.sku || '').trim(),
    }))
    .filter((l) => l.assembly_id && l.quantity > 0);
  if (!lines.length) throw new Error('Add at least one product to the cart.');

  for (const line of lines) {
    const have = await getAssemblyStockQty(sb, line.assembly_id, farmId);
    if (have < line.quantity) {
      throw new Error(`Insufficient farm stock for ${line.name || line.assembly_id} (need ${line.quantity}, have ${have}).`);
    }
  }

  const now = new Date().toISOString();
  const entries = [];
  let totalQty = 0;
  const shareGroups = [];

  for (const line of lines) {
    await adjustAssemblyStock(sb, line.assembly_id, farmId, -line.quantity);
    await adjustAssemblyStock(sb, line.assembly_id, floor2Id, line.quantity);
    totalQty += line.quantity;
    const entryId = newUuid();
    entries.push({
      id: entryId,
      session_id: sessionId,
      kind: 'finished',
      name: line.name || line.assembly_id,
      sku: line.sku || '',
      quantity: line.quantity,
      metadata: {
        assembly_id: line.assembly_id,
        finished_unit: true,
        units: line.quantity,
        driver_checked: true,
        driver_checked_at: now,
        received_at: now,
        stock_deduct_location_id: farmId,
        stock_credit_location_id: floor2Id,
      },
    });
    shareGroups.push({
      assembly_name: line.name || line.assembly_id,
      units: line.quantity,
      lines: [],
    });
  }

  await Promise.all([
    recomputeWarehouseLocationStockServer(sb, floor2Id),
    recomputeWarehouseLocationStockServer(sb, farmId),
  ]);

  const { error: entErr } = await sb.from('warehouse_delivery_entries').insert(entries);
  if (entErr) throw new Error(entErr.message || 'Failed to save transfer lines');

  let resolvedSignatureUrl = signatureUrl;
  if (!resolvedSignatureUrl && signatureBase64) {
    const { uploadBufferToFirebaseStorage, firebaseStoragePublicUrl } = await import('./firebaseStorage.js');
    const buffer = Buffer.from(signatureBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const objectPath = `warehouse-delivery-signatures/farm-return-${sessionId}-${Date.now()}.png`;
    await uploadBufferToFirebaseStorage({
      bucketFolder: 'warehouse-delivery-signatures',
      objectPath,
      buffer,
      contentType: 'image/png',
    });
    resolvedSignatureUrl = firebaseStoragePublicUrl('warehouse-delivery-signatures', objectPath) || '';
  }

  const dispatchedBy = String(body.dispatched_by_name || body.dispatchedByName || user?.user_metadata?.full_name || user?.full_name || '').trim();
  const metadata = {
    ...(session.metadata || {}),
    document_kind: 'farm_return',
    driver_name: driverName,
    driver_signature_url: resolvedSignatureUrl,
    dispatched_by_name: dispatchedBy,
    share_groups: shareGroups,
    submitted_at: now,
    skip_print: true,
  };

  const { error: updErr } = await sb
    .from('warehouse_delivery_sessions')
    .update({
      status: 'submitted',
      submitted_at: now,
      transfer_datetime: now,
      total_qty: totalQty,
      metadata,
    })
    .eq('id', sessionId);
  if (updErr) throw new Error(updErr.message || 'Failed to submit farm return');

  return {
    session_id: sessionId,
    transfer_ref: session.delivery_number,
    total_qty: totalQty,
    share_groups: shareGroups,
    driver_name: driverName,
    dispatched_by_name: dispatchedBy,
    driver_signature_url: resolvedSignatureUrl,
    submitted_at: now,
    document_kind: 'farm_return',
  };
}

export async function adjustFarmStock(sb, { assemblyId, delta, quantity }) {
  const { farmId } = await resolveFarmWarehouseIds(sb);
  const aid = String(assemblyId || '').trim();
  if (!aid) throw new Error('assembly_id is required.');
  let nextQty;
  if (quantity !== undefined && quantity !== null && String(quantity).trim() !== '') {
    nextQty = Math.max(0, Math.floor(Number(quantity) || 0));
  } else {
    const deltaInt = Math.floor(Number(delta) || 0);
    if (!deltaInt) throw new Error('Enter a non-zero quantity change.');
    const current = await getAssemblyStockQty(sb, aid, farmId);
    nextQty = Math.max(0, current + deltaInt);
  }
  const { upsertFinishedAssemblyInventoryQuantity } = await import('./warehouseCatalogMobile.js');
  await upsertFinishedAssemblyInventoryQuantity(sb, {
    assemblyId: aid,
    locationId: farmId,
    quantity: nextQty,
  });
  await recomputeWarehouseLocationStockServer(sb, farmId);
  return { quantity: nextQty, farm_location_id: farmId };
}
