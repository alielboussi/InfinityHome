function resolveWarehouseLocation(locations) {
  const rows = locations || [];
  const exact = rows.find((l) => String(l.name || '').trim().toLowerCase() === 'warehouse');
  if (exact) return exact;
  return rows.find((l) => String(l.name || '').toLowerCase().includes('warehouse')) || null;
}

function isWarehouseLocationId(locationId, warehouseLocationId) {
  if (!locationId || !warehouseLocationId) return false;
  return String(locationId) === String(warehouseLocationId);
}

async function fetchAllPaged(sb, table, select, filterFn) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    let q = sb.from(table).select(select);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function applyWarehouseStocktakeOnSubmit(sb, eventId, locationId) {
  const { data: locations, error: locErr } = await sb.from('locations').select('id, name');
  if (locErr) throw locErr;
  const warehouse = resolveWarehouseLocation(locations);
  const warehouseId = warehouse?.id;
  const now = new Date().toISOString();

  if (isWarehouseLocationId(locationId, warehouseId)) {
    const countRows = await fetchAllPaged(
      sb,
      'stocktake_warehouse_counts',
      'packet_id, qty',
      (q) => q.eq('event_id', eventId),
    );
    const totals = new Map();
    countRows.forEach((r) => {
      if (!r.packet_id) return;
      totals.set(String(r.packet_id), (totals.get(String(r.packet_id)) || 0) + Number(r.qty || 0));
    });

    const { data: packets } = await sb.from('warehouse_packets').select('id');
    (packets || []).forEach((p) => {
      if (!totals.has(String(p.id))) totals.set(String(p.id), 0);
    });

    for (const [packetId, quantity] of totals.entries()) {
      const { error } = await sb.from('warehouse_packet_inventory').upsert([{
        packet_id: packetId,
        location_id: warehouseId,
        quantity: Math.max(0, Number(quantity) || 0),
        updated_at: now,
      }], { onConflict: 'packet_id,location_id' });
      if (error) throw error;
    }
    return { applied: true, mode: 'warehouse_packets' };
  }

  const countRows = await fetchAllPaged(
    sb,
    'stocktake_assembly_counts',
    'assembly_id, qty',
    (q) => q.eq('event_id', eventId),
  );
  if (!countRows.length) return { applied: false };

  const totals = new Map();
  countRows.forEach((r) => {
    if (!r.assembly_id) return;
    totals.set(String(r.assembly_id), (totals.get(String(r.assembly_id)) || 0) + Number(r.qty || 0));
  });

  const { data: locLinks } = await sb
    .from('warehouse_assembly_locations')
    .select('assembly_id')
    .eq('location_id', locationId);
  (locLinks || []).forEach((r) => {
    if (r.assembly_id && !totals.has(String(r.assembly_id))) {
      totals.set(String(r.assembly_id), 0);
    }
  });

  for (const [assemblyId, quantity] of totals.entries()) {
    const { error } = await sb.from('warehouse_assembly_inventory').upsert([{
      assembly_id: assemblyId,
      location_id: locationId,
      quantity: Math.max(0, Number(quantity) || 0),
      updated_at: now,
    }], { onConflict: 'assembly_id,location_id' });
    if (error) throw error;
  }
  return { applied: true, mode: 'warehouse_products' };
}

export function shouldSkipLegacyInventoryForLocation(locationId, locations) {
  const warehouse = resolveWarehouseLocation(locations);
  return isWarehouseLocationId(locationId, warehouse?.id);
}
