import { newUuid } from './uuid.js';

const TABLE = 'warehouse_delivery_drivers';

export async function listWarehouseDeliveryDrivers(sb, { activeOnly = true } = {}) {
  const { data, error } = await sb.from(TABLE).select('id, name, active, sort_order').order('sort_order', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to load drivers');
  let rows = data || [];
  if (activeOnly) rows = rows.filter((r) => r.active !== false);
  return rows.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
}

export async function saveWarehouseDeliveryDrivers(sb, names) {
  const list = (names || [])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  const unique = [...new Set(list)];
  const existing = await listWarehouseDeliveryDrivers(sb, { activeOnly: false });
  const byName = new Map(existing.map((r) => [String(r.name).toLowerCase(), r]));
  const now = new Date().toISOString();
  let order = 0;
  for (const name of unique) {
    const key = name.toLowerCase();
    const hit = byName.get(key);
    if (hit) {
      await sb.from(TABLE).update({ name, active: true, sort_order: order, updated_at: now }).eq('id', hit.id);
    } else {
      await sb.from(TABLE).insert({
        id: newUuid(),
        name,
        active: true,
        sort_order: order,
        created_at: now,
        updated_at: now,
      });
    }
    order += 1;
  }
  for (const row of existing) {
    if (!unique.some((n) => n.toLowerCase() === String(row.name).toLowerCase())) {
      await sb.from(TABLE).update({ active: false, updated_at: now }).eq('id', row.id);
    }
  }
  return listWarehouseDeliveryDrivers(sb, { activeOnly: true });
}
