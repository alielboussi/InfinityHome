import { normalizeCarpentryUom } from '../constants/carpentryUom';
import { loadMaterialUomAllowedSet } from './materialUomMutations';
import { isWarehouseSetAssembly } from './warehouseSetMath';
import { parseUpholsteryMeta } from './upholsteryCatalogView';
import { saveCarpentryProductSelection } from './carpentryCatalogMutations';

const ASSEMBLIES = 'warehouse_assemblies';

export async function saveUpholsteryProductSelection(sb, assemblyId, selected) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('assembly_id required');
  const { data: row, error: readErr } = await sb
    .from(ASSEMBLIES)
    .select('id, metadata, item_kind')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Product not found');
  if (isWarehouseSetAssembly(row)) throw new Error('Sets cannot be added to Upholstery catalog');
  const prev = parseUpholsteryMeta(row);
  const metadata = {
    ...(row.metadata || {}),
    upholstery: {
      ...prev,
      selected: Boolean(selected),
      materials: selected ? prev.materials : [],
    },
  };
  const { error } = await sb.from(ASSEMBLIES).update({
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to save upholstery selection');

  if (selected) {
    const rawId = String(prev.raw_assembly_id || id).trim();
    if (rawId) {
      await saveCarpentryProductSelection(sb, rawId, true);
    }
  }
}

export async function saveUpholsteryRawAssemblyLink(sb, finishedAssemblyId, rawAssemblyId) {
  const finishedId = String(finishedAssemblyId || '').trim();
  const rawId = String(rawAssemblyId || '').trim();
  if (!finishedId) throw new Error('assembly_id required');
  if (!rawId) throw new Error('raw_assembly_id required');
  const { data: row, error: readErr } = await sb
    .from(ASSEMBLIES)
    .select('id, metadata, item_kind')
    .eq('id', finishedId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Product not found');
  if (!parseUpholsteryMeta(row).selected) throw new Error('Add product to Upholstery catalog first');
  const { data: rawRow, error: rawErr } = await sb.from(ASSEMBLIES).select('id').eq('id', rawId).maybeSingle();
  if (rawErr) throw new Error(rawErr.message || 'Failed to read raw product');
  if (!rawRow?.id) throw new Error('Raw carpentry product not found');
  const prev = parseUpholsteryMeta(row);
  const metadata = {
    ...(row.metadata || {}),
    upholstery: {
      ...prev,
      selected: true,
      raw_assembly_id: rawId,
    },
  };
  const { error } = await sb.from(ASSEMBLIES).update({
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', finishedId);
  if (error) throw new Error(error.message || 'Failed to save raw product link');
  await saveCarpentryProductSelection(sb, rawId, true);
}

export async function saveUpholsteryProductMaterials(sb, assemblyId, materials) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('assembly_id required');
  const { data: row, error: readErr } = await sb.from(ASSEMBLIES).select('id, metadata').eq('id', id).maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Product not found');
  const prev = parseUpholsteryMeta(row);
  if (!prev.selected) throw new Error('Add product to Upholstery catalog first');
  const uomAllowed = await loadMaterialUomAllowedSet(sb);
  const normalized = (materials || []).map((m) => ({
    material_assembly_id: String(m.material_assembly_id || '').trim(),
    quantity: Math.max(0, Number(m.quantity) || 0),
    uom: normalizeCarpentryUom(m.uom, uomAllowed.size ? uomAllowed : undefined),
    warehouse_location_id: m.warehouse_location_id ? String(m.warehouse_location_id) : null,
  })).filter((m) => m.material_assembly_id && m.quantity > 0);
  const metadata = {
    ...(row.metadata || {}),
    upholstery: {
      ...prev,
      selected: true,
      materials: normalized,
    },
  };
  const { error } = await sb.from(ASSEMBLIES).update({
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to save materials');
}
