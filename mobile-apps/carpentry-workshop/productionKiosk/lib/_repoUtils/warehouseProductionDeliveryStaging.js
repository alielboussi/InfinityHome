/** Floor 2 staging kinds for the Delivery app (repairs + production orders). */

export const FLOOR2_WIP_KIND_REPAIR = 'repair';
export const FLOOR2_WIP_KIND_ORDER = 'order';

export function readAssemblyFloor2DeliveryStaging(assembly) {
  const wip = assembly?.metadata?.floor2_wip;
  if (!wip || typeof wip !== 'object') return null;
  const kind = String(wip.kind || '').trim().toLowerCase();
  if (kind !== FLOOR2_WIP_KIND_REPAIR && kind !== FLOOR2_WIP_KIND_ORDER) return null;
  return wip;
}

export function capitalizePersonName(raw) {
  return String(raw || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function normalizeCustomerDriverPhone(raw) {
  return String(raw || '').trim().replace(/[^\d+]/g, '');
}
