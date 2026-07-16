export const WAREHOUSE_FROM_LOCATION_ID = '39ffaa82-8aee-4a33-8de8-06584cbaffcf';
export const WAREHOUSE_TO_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
export const WAREHOUSE_ACCEPT_USER_ID = '6b992ac8-8e39-4f31-a323-2271a974da8c';

export const WAREHOUSE_PENDING_STATUSES = ['pending', 'submitted'];
export const WAREHOUSE_COMPLETED_STATUSES = ['completed', 'accepted'];

export function isWarehousePending(status) {
  return WAREHOUSE_PENDING_STATUSES.includes(String(status || '').toLowerCase());
}

export function isWarehouseCompleted(status) {
  return WAREHOUSE_COMPLETED_STATUSES.includes(String(status || '').toLowerCase());
}

export function deliveryLineQty(line) {
  const q = Number(line?.edited_quantity ?? line?.quantity ?? 0);
  return Number.isFinite(q) ? q : 0;
}

/** Prefer stored name → users.full_name → email. */
export function deliverySenderName(session, usersById = null) {
  const stored = String(session?.created_by_name || session?.metadata?.created_by_name || '').trim();
  if (stored) return stored;
  const id = session?.created_by_id;
  if (id != null && usersById) {
    const fromMap = usersById.get(Number(id)) || usersById.get(String(id));
    if (fromMap) return fromMap;
  }
  return String(session?.created_by_email || session?.metadata?.created_by_email || '').trim() || 'Unknown';
}

export function groupWarehouseDisplayLines(entries) {
  const parents = (entries || []).filter((e) => e.kind === 'set-parent');
  const components = (entries || []).filter((e) => e.kind === 'set-component');
  const products = (entries || []).filter((e) => e.kind === 'product' || !e.kind);
  const output = [];
  parents.forEach((parent) => {
    output.push(parent);
    output.push(...components.filter((c) => String(c.combo_id) === String(parent.combo_id)));
  });
  output.push(...products);
  return output;
}
