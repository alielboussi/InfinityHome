import { formatWarehouseProductionLabelColor } from '../../src/utils/warehouseProductionLabelColor.js';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
} from '../../src/utils/warehouseScanResolver.js';
import { normalizeProductionLabelColor } from './warehouseProductionLabelColor.js';

async function loadAssemblyColorNames(sb, assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) return [];
  const { data: links, error: linkErr } = await sb
    .from('warehouse_assembly_colors')
    .select('color_id')
    .eq('assembly_id', id);
  if (linkErr) throw new Error(linkErr.message || 'Failed to load product colors');
  const colorIds = [...new Set((links || []).map((row) => String(row.color_id || '').trim()).filter(Boolean))];
  if (!colorIds.length) return [];
  const { data: colors, error: colorErr } = await sb
    .from('warehouse_colors')
    .select('id, name')
    .in('id', colorIds);
  if (colorErr) throw new Error(colorErr.message || 'Failed to load variant colors');
  return (colors || []).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

async function findAssemblyForLabelSku(sb, skuRaw) {
  const scanKeys = new Set(expandWarehouseSkuMatchKeys(skuRaw));
  if (!scanKeys.size) return null;

  const { data: assemblies, error: asmErr } = await sb
    .from('warehouse_assemblies')
    .select('id, family_sku, has_color_variants');
  if (asmErr) throw new Error(asmErr.message || 'Failed to load products');
  for (const row of assemblies || []) {
    for (const key of expandWarehouseSkuMatchKeys(row.family_sku)) {
      if (scanKeys.has(key)) return row;
    }
  }

  const { data: packets, error: pktErr } = await sb
    .from('warehouse_packets')
    .select('id, sku, assembly_id');
  if (pktErr) throw new Error(pktErr.message || 'Failed to load packets');
  let packet = null;
  for (const row of packets || []) {
    for (const key of expandWarehouseSkuMatchKeys(row.sku)) {
      if (scanKeys.has(key)) {
        packet = row;
        break;
      }
    }
    if (packet) break;
  }
  if (!packet?.assembly_id) return null;
  const assemblyId = String(packet.assembly_id);
  return (assemblies || []).find((row) => String(row.id) === assemblyId) || null;
}

/** Fills Color: row from catalog when clients omit color (web + catalog app). */
export async function resolveWarehouseProductionLabelColorForPrint(sb, { sku, color } = {}) {
  const explicit = normalizeProductionLabelColor(
    color ?? '',
  );
  if (explicit) return explicit;
  if (!sb) return '';

  const skuNorm = normalizeWarehousePacketScan(sku) || normalizeWarehouseProductSku(sku);
  if (!skuNorm) return '';

  const assembly = await findAssemblyForLabelSku(sb, skuNorm);
  if (!assembly?.id) return '';

  const colorRecords = await loadAssemblyColorNames(sb, assembly.id);
  return formatWarehouseProductionLabelColor(assembly, colorRecords);
}
