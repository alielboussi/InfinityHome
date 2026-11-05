import { normalizeCarpentryUom } from '../constants/carpentryUom';
import { loadMaterialUomAllowedSet } from './materialUomMutations';
import { isWarehouseSetAssembly } from './warehouseSetMath';
import { parseCarpentryMeta } from './carpentryCatalogView';

const ASSEMBLIES = 'warehouse_assemblies';
const RUNS = 'carpentry_production_runs';

export async function saveCarpentryProductSelection(sb, assemblyId, selected) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('assembly_id required');
  const { data: row, error: readErr } = await sb
    .from(ASSEMBLIES)
    .select('id, metadata, item_kind')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Product not found');
  if (isWarehouseSetAssembly(row)) throw new Error('Sets cannot be added to Carpentry catalog');
  const prev = parseCarpentryMeta(row);
  const metadata = {
    ...(row.metadata || {}),
    carpentry: {
      ...prev,
      selected: Boolean(selected),
      materials: selected ? prev.materials : [],
    },
  };
  const { error } = await sb.from(ASSEMBLIES).update({
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to save carpentry selection');
}

export async function saveCarpentryProductMaterials(sb, assemblyId, materials) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('assembly_id required');
  const { data: row, error: readErr } = await sb.from(ASSEMBLIES).select('id, metadata').eq('id', id).maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Product not found');
  const prev = parseCarpentryMeta(row);
  if (!prev.selected) throw new Error('Add product to Carpentry catalog first');
  const uomAllowed = await loadMaterialUomAllowedSet(sb);
  const normalized = (materials || []).map((m) => ({
    material_assembly_id: String(m.material_assembly_id || '').trim(),
    quantity: Math.max(0, Number(m.quantity) || 0),
    uom: normalizeCarpentryUom(m.uom, uomAllowed.size ? uomAllowed : undefined),
    warehouse_location_id: m.warehouse_location_id ? String(m.warehouse_location_id) : null,
  })).filter((m) => m.material_assembly_id && m.quantity > 0);
  const metadata = {
    ...(row.metadata || {}),
    carpentry: {
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

export async function listCarpentryFloorRuns(sb, { limit = 200 } = {}) {
  const { data, error } = await sb
    .from(RUNS)
    .select('id, assembly_id, product_qty, started_at, completed_at, source, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(500, Math.max(1, Number(limit) || 200)));
  if (error) {
    if (/relation .* does not exist|not found/i.test(String(error.message || ''))) {
      return { rows: [], tableMissing: true };
    }
    throw new Error(error.message || 'Failed to load floor runs');
  }
  return { rows: data || [], tableMissing: false };
}
