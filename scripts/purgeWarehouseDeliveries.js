/**
 * Hard-delete warehouse delivery sessions (entries + events) and optionally reset WHD sequence.
 * Reverses factory→Kitwe stock moves for lines already received (received_at set).
 *
 * Usage:
 *   node scripts/purgeWarehouseDeliveries.js WHD0000000008 WHD0000000009 WHD0000000011 --reset-seq
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { getDataClient } from '../server/lib/getDataClient.js';
import { findWarehouseDeliverySessionByNumber } from '../server/lib/cancelWarehouseDelivery.js';
import { resetWarehouseDeliveryNumberSequence } from '../server/lib/warehouseDeliveryNumber.js';

const WAREHOUSE_FROM_LOCATION_ID = '39ffaa82-8aee-4a33-8de8-06584cbaffcf';
const WAREHOUSE_TO_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';

function entryReceived(entry) {
  return Boolean(entry?.metadata?.received_at);
}

function entryPacketId(entry) {
  return String(entry?.metadata?.packet_id || '').trim();
}

function entryFinishedUnit(entry) {
  return entry?.metadata?.finished_unit === true && !entryPacketId(entry);
}

async function readPacketQty(sb, packetId, locationId) {
  const { data: rows } = await sb
    .from('warehouse_packet_inventory')
    .select('quantity')
    .eq('packet_id', packetId)
    .eq('location_id', locationId);
  return Math.max(0, Number(rows?.[0]?.quantity) || 0);
}

async function adjustPacketQty(sb, packetId, locationId, delta) {
  const d = Number(delta) || 0;
  if (!d) return;
  const current = await readPacketQty(sb, packetId, locationId);
  const next = current + d;
  if (next < 0) {
    throw new Error(`Packet ${packetId} stock would go negative at ${locationId} (${current} + ${d})`);
  }
  const now = new Date().toISOString();
  await sb.from('warehouse_packet_inventory').upsert({
    packet_id: packetId,
    location_id: locationId,
    quantity: next,
    updated_at: now,
  }, { onConflict: 'packet_id,location_id' });
}

async function readAssemblyQty(sb, assemblyId, locationId) {
  const { data: row } = await sb
    .from('warehouse_assembly_inventory')
    .select('quantity')
    .eq('assembly_id', assemblyId)
    .eq('location_id', locationId)
    .maybeSingle();
  return Math.max(0, Number(row?.quantity) || 0);
}

async function adjustAssemblyQty(sb, assemblyId, locationId, delta) {
  const d = Number(delta) || 0;
  if (!d) return;
  const current = await readAssemblyQty(sb, assemblyId, locationId);
  const next = current + d;
  if (next < 0) {
    throw new Error(`Assembly ${assemblyId} stock would go negative at ${locationId} (${current} + ${d})`);
  }
  const now = new Date().toISOString();
  await sb.from('warehouse_assembly_inventory').upsert({
    assembly_id: assemblyId,
    location_id: locationId,
    quantity: next,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
}

async function reverseReceivedStock(sb, entries) {
  for (const line of entries || []) {
    if (!entryReceived(line)) continue;
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (qty < 1) continue;

    if (entryFinishedUnit(line)) {
      const aid = String(line.metadata?.assembly_id || '').trim();
      if (!aid) continue;
      await adjustAssemblyQty(sb, aid, WAREHOUSE_TO_LOCATION_ID, -qty);
      await adjustAssemblyQty(sb, aid, WAREHOUSE_FROM_LOCATION_ID, qty);
      continue;
    }

    const pid = entryPacketId(line);
    if (!pid) continue;
    await adjustPacketQty(sb, pid, WAREHOUSE_TO_LOCATION_ID, -qty);
    await adjustPacketQty(sb, pid, WAREHOUSE_FROM_LOCATION_ID, qty);
  }
}

async function deleteSessionGraph(sb, sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;

  const { data: entries } = await sb
    .from('warehouse_delivery_entries')
    .select('*')
    .eq('session_id', sid);
  await reverseReceivedStock(sb, entries || []);

  const entryIds = (entries || []).map((e) => e.id).filter(Boolean);
  for (const id of entryIds) {
    await sb.from('warehouse_delivery_entries').delete().eq('id', id);
  }

  const { data: events } = await sb
    .from('warehouse_delivery_events')
    .select('id')
    .eq('session_id', sid);
  for (const ev of events || []) {
    if (ev?.id) await sb.from('warehouse_delivery_events').delete().eq('id', ev.id);
  }

  await sb.from('warehouse_delivery_sessions').delete().eq('id', sid);
}

async function main() {
  const args = process.argv.slice(2);
  const resetSeq = args.includes('--reset-seq');
  const purgeAll = args.includes('--all-factory-kitwe');
  const numbers = args.filter((a) => !a.startsWith('--'));

  if (!numbers.length && !resetSeq && !purgeAll) {
    console.error('Usage: node scripts/purgeWarehouseDeliveries.js <WHD...> [--reset-seq]');
    console.error('       node scripts/purgeWarehouseDeliveries.js --all-factory-kitwe [--reset-seq]');
    process.exit(1);
  }

  const sb = getDataClient();
  const results = [];

  if (purgeAll) {
    const { data: sessions, error } = await sb
      .from('warehouse_delivery_sessions')
      .select('id, delivery_number, status')
      .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
      .eq('to_location', WAREHOUSE_TO_LOCATION_ID);
    if (error) throw new Error(error.message || 'Failed to list delivery sessions');
    for (const row of sessions || []) {
      try {
        await deleteSessionGraph(sb, row.id);
        results.push({
          delivery_number: row.delivery_number,
          ok: true,
          session_id: row.id,
          previous_status: row.status,
        });
      } catch (err) {
        results.push({
          delivery_number: row.delivery_number,
          ok: false,
          error: err?.message || String(err),
        });
      }
    }
  }

  for (const num of numbers) {
    const row = await findWarehouseDeliverySessionByNumber(sb, num);
    if (!row?.id) {
      results.push({ delivery_number: num, ok: false, error: 'not_found' });
      continue;
    }
    try {
      await deleteSessionGraph(sb, row.id);
      results.push({
        delivery_number: num,
        ok: true,
        session_id: row.id,
        previous_status: row.status,
      });
    } catch (err) {
      results.push({
        delivery_number: num,
        ok: false,
        error: err?.message || String(err),
      });
    }
  }

  let seqResult = null;
  if (resetSeq) {
    seqResult = await resetWarehouseDeliveryNumberSequence();
  }

  console.log(JSON.stringify({ results, sequence: seqResult }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
