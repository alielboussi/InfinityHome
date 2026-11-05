/** Driver checklist state for one assembly BOM (all packet lines, qty per units on truck). */
export function buildDeliveryPacketChecks(packetRows, units, { checkedPacketId } = {}) {
  const u = Math.max(1, Number(units) || 1);
  const checks = {};
  for (const p of packetRows || []) {
    const req = u * Math.max(1, Number(p.qty_per_unit) || 1);
    const checked = checkedPacketId != null && String(p.id) === String(checkedPacketId);
    checks[p.id] = {
      packet_id: p.id,
      quantity: req,
      driver_checked: checked,
      driver_checked_at: checked ? new Date().toISOString() : null,
    };
  }
  return checks;
}

export function refreshDeliveryPacketCheckQty(checks, packetRows, units) {
  const u = Math.max(1, Number(units) || 1);
  const next = {};
  for (const p of packetRows || []) {
    const req = u * Math.max(1, Number(p.qty_per_unit) || 1);
    const old = checks?.[p.id];
    const checked = Boolean(old?.driver_checked);
    next[p.id] = {
      packet_id: p.id,
      quantity: req,
      driver_checked: checked,
      driver_checked_at: checked ? (old?.driver_checked_at || new Date().toISOString()) : null,
    };
  }
  return next;
}
