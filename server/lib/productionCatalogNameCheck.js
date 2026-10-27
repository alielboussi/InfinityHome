/**
 * Production naming — block duplicates against warehouse products/packets and POS catalog names.
 */
import {
  extractProductionBaseName,
  normalizeWarehousePacketNameKey,
} from '../../src/utils/productionItemName.js';

export function productionNamesConflict(proposedName, existingName) {
  const proposed = String(proposedName || '').trim();
  const existing = String(existingName || '').trim();
  if (!proposed || !existing) return false;

  const fullA = normalizeWarehousePacketNameKey(proposed);
  const fullB = normalizeWarehousePacketNameKey(existing);
  if (fullA && fullA === fullB) return true;

  const baseA = normalizeWarehousePacketNameKey(extractProductionBaseName(proposed));
  const baseB = normalizeWarehousePacketNameKey(extractProductionBaseName(existing));
  if (baseA && baseB && baseA === baseB) return true;

  // e.g. catalog product "Olivia" blocks "Olivia Single Seater"
  if (baseA && baseA === fullB) return true;
  if (baseB && baseB === fullA) return true;

  return false;
}

export async function findProductionNameClash(sb, proposedName, {
  excludePacketId,
  excludeAssemblyId,
} = {}) {
  const name = String(proposedName || '').trim();
  if (!name) return null;

  const [{ data: packets, error: pErr }, { data: assemblies, error: aErr }, { data: products, error: cErr }] = await Promise.all([
    sb.from('warehouse_packets').select('id, name'),
    sb.from('warehouse_assemblies').select('id, name'),
    sb.from('products').select('id, name'),
  ]);
  if (pErr) throw new Error(pErr.message || 'Failed to validate packet names');
  if (aErr) throw new Error(aErr.message || 'Failed to validate product names');
  if (cErr) throw new Error(cErr.message || 'Failed to validate catalog names');

  const rows = [
    ...(packets || []).map((row) => ({ ...row, kind: 'packet' })),
    ...(assemblies || []).map((row) => ({ ...row, kind: 'assembly' })),
    ...(products || []).map((row) => ({ ...row, kind: 'catalog' })),
  ];

  return rows.find((row) => {
    if (row.kind === 'packet' && String(row.id) === String(excludePacketId || '')) return false;
    if (row.kind === 'assembly' && String(row.id) === String(excludeAssemblyId || '')) return false;
    return productionNamesConflict(name, row.name);
  }) || null;
}
