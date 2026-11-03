import { formatWarehouseProductionLabelColor } from '../../../src/utils/warehouseProductionLabelColor.js';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
} from './warehouseScanResolver';

export function buildWarehouseCatalogColorsByAssembly(catalog) {
  const colorCatalogById = new Map(
    (catalog?.colors || []).map((c) => [String(c.id), c]),
  );
  const out = new Map();
  (catalog?.assemblyColors || []).forEach((row) => {
    const key = String(row.assembly_id);
    const color = colorCatalogById.get(String(row.color_id));
    if (!color) return;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(color);
  });
  out.forEach((list) => {
    list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  });
  return out;
}

function findAssemblyForLabelSku(catalog, skuRaw) {
  const scanKeys = new Set(expandWarehouseSkuMatchKeys(skuRaw));
  if (!scanKeys.size) return null;

  for (const assembly of catalog?.assemblies || []) {
    for (const key of expandWarehouseSkuMatchKeys(assembly.family_sku)) {
      if (scanKeys.has(key)) return assembly;
    }
  }

  const assemblyById = new Map(
    (catalog?.assemblies || []).map((a) => [String(a.id), a]),
  );
  for (const packet of catalog?.packets || []) {
    for (const key of expandWarehouseSkuMatchKeys(packet.sku)) {
      if (!scanKeys.has(key)) continue;
      const parentId = String(packet.assembly_id || '');
      if (parentId && assemblyById.has(parentId)) {
        return assemblyById.get(parentId);
      }
    }
  }
  return null;
}

export function warehouseCatalogLabelColorForPrint(catalog, { assembly, sku } = {}) {
  const colorsByAssembly = buildWarehouseCatalogColorsByAssembly(catalog);
  const asm = assembly?.id
    ? assembly
    : findAssemblyForLabelSku(catalog, sku);
  if (!asm?.id) return '';
  return formatWarehouseProductionLabelColor(
    asm,
    colorsByAssembly.get(String(asm.id)) || [],
  );
}

export function normalizeLabelPrintSku(sku) {
  return normalizeWarehousePacketScan(sku) || normalizeWarehouseProductSku(sku) || String(sku || '').trim();
}
