/** Packet stock at a warehouse location (Factory / Kitwe). */

export async function getPacketStockQty(sb, packetId, locationId) {
  const { data: rows } = await sb
    .from('warehouse_packet_inventory')
    .select('quantity')
    .eq('packet_id', packetId)
    .eq('location_id', locationId);
  return Math.max(0, Number(rows?.[0]?.quantity) || 0);
}

export async function adjustPacketStock(sb, packetId, locationId, delta) {
  const pid = String(packetId || '');
  const loc = String(locationId || '');
  const d = Number(delta) || 0;
  if (!pid || !loc || !d) return;

  const current = await getPacketStockQty(sb, pid, loc);
  const next = current + d;
  if (next < 0) {
    throw new Error('Not enough packet stock at warehouse.');
  }
  const now = new Date().toISOString();
  await sb.from('warehouse_packet_inventory').upsert({
    packet_id: pid,
    location_id: loc,
    quantity: next,
    updated_at: now,
  }, { onConflict: 'packet_id,location_id' });
  return next;
}

export async function assertPacketStockAvailable(sb, packetId, locationId, requiredQty) {
  const need = Math.max(0, Number(requiredQty) || 0);
  if (need < 1) return;
  const have = await getPacketStockQty(sb, packetId, locationId);
  if (have < need) {
    throw new Error(`Insufficient factory stock for packet (need ${need}, have ${have}).`);
  }
}
