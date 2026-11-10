/** Repaired units staged on Warehouse Floor 2 until the Delivery app ships them. */

export const FLOOR2_WIP_KIND_REPAIR = 'repair';

export function readAssemblyFloor2RepairStaging(assembly) {
  const wip = assembly?.metadata?.floor2_wip;
  if (!wip || typeof wip !== 'object') return null;
  if (String(wip.kind || '').trim().toLowerCase() !== FLOOR2_WIP_KIND_REPAIR) return null;
  const returnOrderId = String(wip.return_order_id || '').trim();
  if (!returnOrderId) return null;
  return {
    kind: FLOOR2_WIP_KIND_REPAIR,
    return_order_id: returnOrderId,
    return_number: String(wip.return_number || '').trim() || null,
    staged_at: wip.staged_at || null,
  };
}

export function isAssemblyFloor2RepairStaging(assembly) {
  return Boolean(readAssemblyFloor2RepairStaging(assembly));
}
